#!/usr/bin/env python3
"""Мастер-файл на белом фоне → рабочие спрайты игры.

Нейронка отдаёт персонажей на чистом белом, иногда листом несколько штук сразу. Скрипт режет лист
на клетки, выбивает фон в прозрачность, обрезает по бойцу и кладёт его на квадратный кадр ступнями
на нижнюю кромку — так, как спрайт стоит в бою. Обработка одинаковая для всех, руками её не делают.

    python3 tools/art/prepare.py art/masters/heroes.png --grid 3x2 \
        --ids warrior,mage,assassin,paladin,berserk,archer
    python3 tools/art/prepare.py art/masters/wolf.png --ids wolf

Фон выбивается заливкой **от краёв**: светлое пятно внутри силуэта (белый плащ Паладина, светлый щит
Воина) заливкой не достаётся, потому что его отсекает тёмный контур. Поэтому «всё белое → прозрачно»
здесь не годится и не используется.
"""

from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def is_background(px: tuple[int, int, int], light: int, sat: int) -> bool:
    """Фон — светлое и почти серое: и белый лист, и мягкая серая тень под ногами."""
    r, g, b = px[:3]
    return min(r, g, b) >= light and max(r, g, b) - min(r, g, b) <= sat


def cut_background(img: Image.Image, light: int, sat: int) -> Image.Image:
    """Заливка от краёв: всё связное со рамкой и похожее на фон становится прозрачным."""
    img = img.convert('RGBA')
    w, h = img.size
    px = img.load()
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_background(px[x, y], light, sat):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    return img


def defringe(img: Image.Image, light: int, sat: int, rounds: int) -> Image.Image:
    """Снимает светлую кайму, оставшуюся от сглаженного края мастера."""
    w, h = img.size
    for _ in range(rounds):
        px = img.load()
        doomed = []
        for y in range(h):
            for x in range(w):
                if px[x, y][3] == 0 or not is_background(px[x, y], light, sat):
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        doomed.append((x, y))
                        break
        if not doomed:
            break
        for x, y in doomed:
            px[x, y] = (0, 0, 0, 0)
    return img


def shrink(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Уменьшение с премножением на альфу: иначе сглаживание подмешает в кромку цвет прозрачных пикселей."""
    src = list(img.getdata())
    pm = Image.new('RGBA', img.size)
    pm.putdata([(r * a // 255, g * a // 255, b * a // 255, a) for r, g, b, a in src])
    small = pm.resize(size, Image.LANCZOS)
    out = Image.new('RGBA', size)
    out.putdata([(0, 0, 0, 0) if a == 0 else (min(255, r * 255 // a), min(255, g * 255 // a), min(255, b * 255 // a), a)
                 for r, g, b, a in small.getdata()])
    return out


def cells(img: Image.Image, cols: int, rows: int) -> list[Image.Image]:
    w, h = img.size
    return [img.crop((c * w // cols, r * h // rows, (c + 1) * w // cols, (r + 1) * h // rows))
            for r in range(rows) for c in range(cols)]


def main() -> int:
    ap = argparse.ArgumentParser(description='Мастер на белом → спрайты игры')
    ap.add_argument('master', help='PNG-мастер: один персонаж или лист')
    ap.add_argument('--ids', required=True, help='id через запятую, по порядку слева направо и сверху вниз')
    ap.add_argument('--grid', default='1x1', help='клеток листа, CxR (по умолчанию 1x1)')
    ap.add_argument('--size', type=int, default=128, help='сторона рабочего кадра (по умолчанию 128)')
    ap.add_argument('--pad', type=int, default=0, help='пустых пикселей под ступнями')
    ap.add_argument('--light', type=int, default=110, help='порог светлоты фона: ниже — съедает и мягкую серую тень')
    ap.add_argument('--sat', type=int, default=26, help='допустимый разброс каналов у фона')
    ap.add_argument('--defringe', type=int, default=2, help='сколько раз снять светлую кайму')
    ap.add_argument('--per-cell', action='store_true', help='масштабировать каждого по своей клетке, а не общим множителем')
    ap.add_argument('--out', default='src/assets/sprites', help='куда класть готовые кадры')
    ap.add_argument('--sheet', help='собрать контрольный лист результата в этот файл')
    a = ap.parse_args()

    ids = [s.strip() for s in a.ids.split(',') if s.strip()]
    cols, rows = (int(v) for v in a.grid.lower().split('x'))
    if len(ids) != cols * rows:
        print(f'id: {len(ids)}, клеток: {cols * rows} — не сходится', file=sys.stderr)
        return 1

    master = Image.open(a.master)
    parts = cells(master, cols, rows) if cols * rows > 1 else [master]

    trimmed = []
    for cell, name in zip(parts, ids):
        cut = defringe(cut_background(cell, a.light, a.sat), a.light, a.sat, a.defringe)
        box = cut.getbbox()
        if not box:
            print(f'{name}: клетка пустая — фон выбился целиком, ослабьте --light', file=sys.stderr)
            return 1
        trimmed.append((name, cut.crop(box)))

    # Общий множитель: самый высокий занимает кадр целиком, остальные сохраняют рост относительно него.
    box_h = a.size - a.pad
    tallest = max(im.height for _, im in trimmed)
    out_dir = ROOT / a.out
    out_dir.mkdir(parents=True, exist_ok=True)
    done = []
    for name, im in trimmed:
        k = min(box_h / (im.height if a.per_cell else tallest), a.size / im.width)
        w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
        small = shrink(im, (w, h))
        frame = Image.new('RGBA', (a.size, a.size), (0, 0, 0, 0))
        frame.paste(small, ((a.size - w) // 2, a.size - a.pad - h), small)
        frame.save(out_dir / f'{name}.png')
        done.append(frame)
        print(f'{name}: {im.width}×{im.height} → {w}×{h} в кадре {a.size}')

    if a.sheet:
        sheet = Image.new('RGBA', (a.size * len(done), a.size), (13, 13, 20, 255))
        for i, frame in enumerate(done):
            sheet.alpha_composite(frame, (i * a.size, 0))
        Path(a.sheet).parent.mkdir(parents=True, exist_ok=True)
        sheet.save(a.sheet)
        print(f'контрольный лист: {a.sheet}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
