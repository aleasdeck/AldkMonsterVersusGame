"""Нарезка аватарок героев из листа генератора.

Лист — сетка портретов с чёрными промежутками (первый лист: 3×2, порядок чтения — порядок героев).
Промежутки скрипт находит сам по тёмным строкам и столбцам, поэтому сетку не надо задавать числами
и нельзя резать руками: у генератора ячейки не совпадают по пикселю.

    python tools/hero-avatars.py art/heroes-avatars.png --heroes warrior,mage,assassin,paladin,berserk,archer

Готовые файлы — `src/assets/heroes/<герой>-avatar.png`, сторона `--size` (256 по умолчанию). В интерфейсе
аватарка живёт от 44 до 112 px и рисуется со сглаживанием, как и листы героев, поэтому кратность размеру
кадра тут не нужна — важнее запас разрешения. Нужны numpy и Pillow.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

DARK = 14      # ярче этого линия уже не промежуток, а рамка портрета
MIN_CELL = 0.2  # ячейка мельче этой доли стороны — не ячейка, а тёмная полоса внутри рисунка

ap = argparse.ArgumentParser()
ap.add_argument('src', help='лист портретов из генератора')
ap.add_argument('--heroes', required=True, help='герои через запятую в порядке чтения листа')
ap.add_argument('--size', type=int, default=256, help='сторона готовой аватарки')
ap.add_argument('--colors', type=int, default=128, help='размер палитры; 0 — оставить полный цвет')
ap.add_argument('--out', default='src/assets/heroes', help='куда класть готовые аватарки')
args = ap.parse_args()

sheet = Image.open(args.src).convert('RGB')
a = np.asarray(sheet).astype(int)


def cells(line: np.ndarray) -> list[tuple[int, int]]:
    """Светлые участки полосы яркостей — ячейки; тёмные — промежутки."""
    out, start = [], None
    for i, x in enumerate(line):
        if x >= DARK and start is None:
            start = i
        elif x < DARK and start is not None:
            out.append((start, i)); start = None
    if start is not None:
        out.append((start, len(line)))
    return [(s, e) for s, e in out if e - s >= len(line) * MIN_CELL]


xs = cells(a.mean(axis=(0, 2)))
ys = cells(a.mean(axis=(1, 2)))
names = [n.strip() for n in args.heroes.split(',') if n.strip()]
boxes = [(x0, y0, x1, y1) for y0, y1 in ys for x0, x1 in xs]
print(f'сетка {len(xs)}×{len(ys)}: ' + ', '.join(f'{x1 - x0}x{y1 - y0}' for x0, y0, x1, y1 in boxes))
if len(boxes) != len(names):
    raise SystemExit(f'ячеек {len(boxes)}, а героев {len(names)} — проверьте лист и --heroes')

out_dir = Path(args.out)
out_dir.mkdir(parents=True, exist_ok=True)
for name, box in zip(names, boxes):
    img = sheet.crop(box).resize((args.size, args.size), Image.BOX)
    if args.colors:
        img = img.quantize(colors=args.colors, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    path = out_dir / f'{name}-avatar.png'
    img.save(path, optimize=True)
    print(f'{path}  {args.size}x{args.size}  из {box[2] - box[0]}x{box[3] - box[1]}  {path.stat().st_size // 1024} КБ')
