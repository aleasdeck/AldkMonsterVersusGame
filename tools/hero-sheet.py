"""Сборка листа анимаций героя из картинки генератора в ровные ячейки.

Генератор отдаёт лист в одном из двух видов, скрипт различает их сам по наличию прозрачности:

* **сетка** — непрозрачный фон, кадры разложены по ячейкам с нарисованными рамками и номерами
  («KNIGHT ANIMATION SPRITE SHEET»: ряд = анимация, 8 кадров в ряду). Рамки и номера убираются.
* **россыпь** — прозрачный фон, фигуры лежат без сетки, ряд = герой (первый лист покоя шести героев).

В обоих случаях кадры одного ряда выравниваются между собой (сдвиг с максимумом IoU): зацикленные
клипы (`idle`, `battle`) — покадрово, чтобы петля не дрожала, остальные — одним сдвигом на весь клип
по первому кадру, чтобы не убить нарисованный выпад или падение. Готовый лист — квадратные ячейки
одного размера, общий центр, в `src/assets/heroes/<герой>.png`.

    python tools/hero-sheet.py art/knight.png --hero warrior --clips idle,battle,slash,thrust,block,hurt,death
    python tools/hero-sheet.py art/heroes-idle.png --heroes warrior,mage,assassin,paladin,berserk,archer --clip idle

В конце печатается строка манифеста для `HERO_SHEETS` в src/ui/heroSprite.ts — цифры оттуда, не на глаз.
`--overlay o.png` кладёт рядом отладочный лист: все кадры клипа полупрозрачно друг на друге, видно дрожание.
Нужны numpy, Pillow, scipy.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ALPHA = 40        # порог непрозрачности
MIN_AREA = 500    # компонент мельче — мусор генератора (россыпь)
SEARCH = 22       # диапазон сдвига при выравнивании, px
MARGIN = 4        # поле ячейки
LOOPS = {'idle', 'battle'}   # зацикленные клипы: выравниваются покадрово

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('--hero', help='один герой: ряды листа — его клипы (--clips)')
ap.add_argument('--heroes', help='несколько героев через запятую: ряд листа — герой, клип один (--clip)')
ap.add_argument('--clips', default='idle', help='имена клипов по рядам, через запятую')
ap.add_argument('--clip', default='idle', help='клип для режима --heroes')
ap.add_argument('--cols', type=int, default=8, help='кадров в ряду')
ap.add_argument('--out-dir', default=str(Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'heroes'))
ap.add_argument('--overlay')
args = ap.parse_args()

if bool(args.hero) == bool(args.heroes):
    ap.error('нужен ровно один из --hero / --heroes')
heroes = [args.hero] if args.hero else args.heroes.split(',')
clips = args.clips.split(',') if args.hero else [args.clip]
COLS = args.cols
ROWS = len(clips) if args.hero else len(heroes)

rgba = np.array(Image.open(args.src).convert('RGBA'))


# ─── Чтение листа: два вида ────────────────────────────────────────────────

def read_scattered():
    """Россыпь: фигуры — компоненты альфы, ряды по центру y, внутри ряда по x."""
    lab, _ = ndimage.label(rgba[:, :, 3] > ALPHA)
    comps = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if int((lab[sl] == i).sum()) < MIN_AREA:
            continue
        ys, xs = sl
        comps.append((i, sl, (ys.start + ys.stop) / 2, xs.start))
    if len(comps) != ROWS * COLS:
        raise SystemExit(f'фигур {len(comps)}, ждали {ROWS * COLS}: слиплись или порваны')
    comps.sort(key=lambda c: c[2])
    out = []
    for r in range(ROWS):
        row = sorted(comps[r * COLS:(r + 1) * COLS], key=lambda c: c[3])
        frames = []
        for i, sl, _, _ in row:
            px = rgba[sl].copy()
            px[lab[sl] != i] = 0      # соседи, залезшие в bbox
            frames.append(px)
        out.append(frames)
    return out


def grid_lines(d, axis):
    """Позиции линий сетки: пиксели чуть светлее фона, тянущиеся через всё поле."""
    lin = (d >= 4) & (d <= 30)
    frac = lin.mean(axis=axis)
    groups = []
    for i in [i for i in range(len(frac)) if frac[i] > 0.55]:
        if groups and i - groups[-1][-1] <= 8:      # рамка нарисована двойной линией
            groups[-1].append(i)
        else:
            groups.append([i])
    cent = [sum(g) / len(g) for g in groups]
    # сетка кадров — самый длинный отрезок равномерно расставленных линий (остальное: заголовок, колонка подписей)
    best = (0, 0)
    for a in range(len(cent)):
        for b in range(a + 2, len(cent) + 1):
            gaps = [cent[i + 1] - cent[i] for i in range(a, b - 1)]
            med = sorted(gaps)[len(gaps) // 2]
            if all(abs(g - med) <= 0.2 * med for g in gaps) and b - a > best[1] - best[0]:
                best = (a, b)
    return cent[best[0]:best[1]]


def read_grid():
    """Сетка: фон непрозрачный, ячейки обведены рамкой, под кадром стоит его номер."""
    rgb = rgba[:, :, :3].astype(int)
    flat = rgb.reshape(-1, 3)[::7]
    vals, counts = np.unique(flat, axis=0, return_counts=True)
    bg = vals[counts.argmax()]
    d = np.abs(rgb - bg).max(axis=2)
    vs, hs = grid_lines(d, 0), grid_lines(d, 1)
    if len(vs) != COLS + 1 or len(hs) != ROWS + 1:
        raise SystemExit(f'сетка {len(vs) - 1}x{len(hs) - 1}, ждали {COLS}x{ROWS}')
    # Рамка бывает и бледной, и яркой, и двойной, поэтому ищем её не по цвету, а по длине: линия идёт через
    # весь лист, а персонаж — нет. Такие строки и столбцы гасим целиком, тогда рез не обязан попасть между ними.
    bx0, bx1, by0, by1 = int(vs[0]), int(vs[-1]) + 1, int(hs[0]), int(hs[-1]) + 1
    band = d[by0:by1, bx0:bx1] > 12
    d = d.copy()
    d[by0:by1, bx0:bx1][band.mean(axis=1) > 0.9, :] = 0
    d[by0:by1, bx0:bx1][:, band.mean(axis=0) > 0.9] = 0
    print(f'сетка {COLS}x{ROWS}, фон {tuple(bg)}, снято линий рамки: {int((band.mean(axis=1) > 0.9).sum())} строк, {int((band.mean(axis=0) > 0.9).sum())} столбцов')
    out = []
    for r in range(ROWS):
        frames = []
        for c in range(COLS):
            # режем по самим линиям, а не по усреднённому шагу: художник ставит их с разбросом в пару пикселей
            x0, x1 = int(vs[c]) + 2, int(vs[c + 1]) - 1
            y0, y1 = int(hs[r]) + 2, int(hs[r + 1]) - 1
            sub, dd = rgba[y0:y1, x0:x1, :3], d[y0:y1, x0:x1]
            h = y1 - y0
            a = dd > 12
            lab, _ = ndimage.label(a)
            for i, sl in enumerate(ndimage.find_objects(lab), 1):
                area = int((lab[sl] == i).sum())
                # номер кадра под персонажем и пыль генератора
                if area < 60 or (area < 500 and sl[0].start > h - 14):
                    a[sl][lab[sl] == i] = False
            px = np.dstack([sub, a.astype(np.uint8) * 255]).astype(np.uint8)
            px[~a] = 0
            ys, xs = np.nonzero(a)
            frames.append(px[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
        out.append(frames)
    return out


rows = read_scattered() if (rgba[:, :, 3] < 250).any() else read_grid()


# ─── Выравнивание и упаковка ───────────────────────────────────────────────

PAD = SEARCH + 8
FH = max(f.shape[0] for row in rows for f in row) + 2 * PAD
FW = max(f.shape[1] for row in rows for f in row) + 2 * PAD


def field(p, dx=0, dy=0):
    """Кадр в общем поле: низ на общей линии, по горизонтали по центру, плюс сдвиг."""
    f = np.zeros((FH, FW, 4), np.uint8)
    y, x = FH - PAD - p.shape[0] + dy, (FW - p.shape[1]) // 2 + dx
    f[y:y + p.shape[0], x:x + p.shape[1]] = p
    return f


def best_shift(ref, m):
    """Сдвиг маски m, при котором её пересечение с ref максимально (IoU)."""
    best, bs = -1.0, (0, 0)
    for dy in range(-SEARCH, SEARCH + 1):
        for dx in range(-SEARCH, SEARCH + 1):
            sh = np.zeros_like(m)
            ys, yd = (slice(0, FH - dy), slice(dy, FH)) if dy >= 0 else (slice(-dy, FH), slice(0, FH + dy))
            xs, xd = (slice(0, FW - dx), slice(dx, FW)) if dx >= 0 else (slice(-dx, FW), slice(0, FW + dx))
            sh[yd, xd] = m[ys, xs]
            iou = np.logical_and(ref, sh).sum() / np.logical_or(ref, sh).sum()
            if iou > best:
                best, bs = iou, (dx, dy)
    return bs, best


def align(frames, ref_mask, per_frame):
    """per_frame=True — каждый кадр к опорному (петля не дрожит); иначе один сдвиг на весь клип по первому кадру."""
    if ref_mask is None:                       # первый клип задаёт опору сам
        out = [field(frames[0])]
        ref_mask = out[0][:, :, 3] > ALPHA
        rest, shifts = frames[1:], []
    else:
        out, rest, shifts = [], frames, []
    if per_frame:
        for p in rest:
            (dx, dy), iou = best_shift(ref_mask, field(p)[:, :, 3] > ALPHA)
            out.append(field(p, dx, dy))
            shifts.append((dx, dy, round(float(iou), 2)))
    else:
        (dx, dy), iou = best_shift(ref_mask, field(rest[0])[:, :, 3] > ALPHA)
        shifts.append((dx, dy, round(float(iou), 2)))
        out.extend(field(p, dx, dy) for p in rest)
    return out, ref_mask, shifts


out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
# опора одна на героя: все его клипы равняются на первый ряд (покой), чтобы клип не прыгал при запуске
refs, frames_by_hero = {}, {}
for r in range(ROWS):
    name = clips[r] if args.hero else args.clip
    hero = heroes[0] if args.hero else heroes[r]
    if not hero:
        continue      # пустое имя в --heroes: ряд в листе есть, а брать его не надо (герой уже собран из своего листа)
    aligned, ref, shifts = align(rows[r], refs.get(hero), name in LOOPS)
    refs[hero] = ref
    frames_by_hero.setdefault(hero, []).append((name, aligned))
    print(f'{hero}/{name}: сдвиги {shifts}')

for hero, items in frames_by_hero.items():
    # Ячейку центрируем по фигуре в покое, а не по общему bbox: в игре герой стоит на своём месте в разметке,
    # а замах мечом и падение просто вылезают за ячейку — тогда клип не дёргает героя вбок при запуске.
    idle_m = np.any(np.stack([f[:, :, 3] > ALPHA for f in items[0][1]]), axis=0)
    iy, ix = np.nonzero(idle_m)
    cx, cy = (ix.min() + ix.max() + 1) / 2, (iy.min() + iy.max() + 1) / 2
    body = int(iy.max() - iy.min() + 1)
    allm = np.any(np.stack([f[:, :, 3] > ALPHA for _, fr in items for f in fr]), axis=0)
    ys, xs = np.nonzero(allm)
    reach = max(cx - xs.min(), xs.max() + 1 - cx, cy - ys.min(), ys.max() + 1 - cy)
    S = int(2 * (reach + MARGIN))
    S += S % 2
    x0, y0 = int(round(cx - S / 2)), int(round(cy - S / 2))
    sheet = np.zeros((len(items) * S, COLS * S, 4), np.uint8)
    for r, (_, fr) in enumerate(items):
        for c, f in enumerate(fr):
            pad = np.pad(f, ((S, S), (S, S), (0, 0)))
            sheet[r * S:(r + 1) * S, c * S:(c + 1) * S] = pad[y0 + S:y0 + 2 * S, x0 + S:x0 + 2 * S]
    path = out_dir / f'{hero}.png'
    Image.fromarray(sheet).save(path, optimize=True)
    names = ', '.join(f"'{n}'" for n, _ in items)
    print(f'\n{path}  {sheet.shape[1]}x{sheet.shape[0]}')
    print(f"  {hero}: {{ clips: [{names}], frames: {COLS}, cell: {S}, body: {body} }},")

    if args.overlay:
        # все кадры клипа друг на друге: ряд дрожит — видно сразу
        ov = np.zeros_like(sheet)
        for r in range(len(items)):
            stack = sheet[r * S:(r + 1) * S, 0:S].astype(np.uint16) * 0
            for c in range(COLS):
                f = sheet[r * S:(r + 1) * S, c * S:(c + 1) * S].astype(np.uint16)
                stack[:, :, :3] = np.maximum(stack[:, :, :3], f[:, :, :3] * (f[:, :, 3:4] > 0))
                stack[:, :, 3] = np.minimum(255, stack[:, :, 3] + f[:, :, 3] // COLS)
            for c in range(COLS):
                ov[r * S:(r + 1) * S, c * S:(c + 1) * S] = stack.astype(np.uint8)
        Image.fromarray(ov).save(args.overlay)
        print('  наложение', args.overlay)
