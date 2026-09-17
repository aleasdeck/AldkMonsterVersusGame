"""Пересборка нарисованного листа героев в ровные ячейки.

Генератор кладёт фигуры не по сетке: соседние кадры залезают друг на друга, а центр у каждого свой,
поэтому нарезка «по N px» обрезает оружие и заставляет героя дёргаться. Скрипт находит каждую фигуру
как компоненту альфы, выравнивает кадры ряда по маске первого (перебор сдвига, максимум IoU), кладёт
их в квадратные ячейки одного размера с общей линией ног и пишет лист в src/assets/heroes-idle.png.

    python tools/hero-sheet.py <лист.png> [--rows 6] [--cols 8] [--overlay overlay.png]

overlay.png — отладочный лист: все кадры героя полупрозрачно друг на друге, видно остаточное дрожание.
Нужны numpy, Pillow, scipy.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

MIN_AREA = 500  # компоненты мельче — мусор генератора
SEARCH = 22     # диапазон сдвига при выравнивании, px
MARGIN = 4      # поле ячейки
ALPHA = 40      # порог альфы

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('--rows', type=int, default=6)
ap.add_argument('--cols', type=int, default=8)
ap.add_argument('--out', default=str(Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'heroes-idle.png'))
ap.add_argument('--overlay')
args = ap.parse_args()
ROWS, COLS = args.rows, args.cols

rgba = np.array(Image.open(args.src).convert('RGBA'))
lab, _ = ndimage.label(rgba[:, :, 3] > ALPHA)
comps = []
for i, sl in enumerate(ndimage.find_objects(lab), 1):
    if int((lab[sl] == i).sum()) < MIN_AREA:
        continue
    ys, xs = sl
    comps.append(dict(id=i, x0=xs.start, y0=ys.start, x1=xs.stop, y1=ys.stop, cy=(ys.start + ys.stop) / 2))
assert len(comps) == ROWS * COLS, f'фигур {len(comps)}, ждали {ROWS * COLS}: слиплись или порваны'

comps.sort(key=lambda c: c['cy'])
rows = [sorted(comps[r * COLS:(r + 1) * COLS], key=lambda c: c['x0']) for r in range(ROWS)]


def cut(c):
    """RGBA-кадр только из пикселей своей компоненты: соседи, залезшие в bbox, обнуляются."""
    sl = (slice(c['y0'], c['y1']), slice(c['x0'], c['x1']))
    px = rgba[sl].copy()
    px[lab[sl] != c['id']] = 0
    return px


def best_shift(ref, m):
    """Сдвиг маски m, при котором IoU с ref максимален."""
    best, bs = -1.0, (0, 0)
    H, W = ref.shape
    for dy in range(-SEARCH, SEARCH + 1):
        for dx in range(-SEARCH, SEARCH + 1):
            sh = np.zeros_like(m)
            ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
            xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
            sh[yd, xd] = m[ys, xs]
            iou = np.logical_and(ref, sh).sum() / np.logical_or(ref, sh).sum()
            if iou > best:
                best, bs = iou, (dx, dy)
    return bs, best


PAD = SEARCH + 8
frames = []
for r in range(ROWS):
    cuts = [cut(c) for c in rows[r]]
    FH = max(p.shape[0] for p in cuts) + 2 * PAD
    FW = max(p.shape[1] for p in cuts) + 2 * PAD

    def field(p, dx=0, dy=0):
        f = np.zeros((FH, FW, 4), np.uint8)
        y = FH - PAD - p.shape[0] + dy
        x = (FW - p.shape[1]) // 2 + dx
        f[y:y + p.shape[0], x:x + p.shape[1]] = p
        return f

    ref = field(cuts[0])
    refm = ref[:, :, 3] > ALPHA
    row_frames, shifts = [ref], [(0, 0)]
    for k in range(1, COLS):
        (dx, dy), iou = best_shift(refm, field(cuts[k])[:, :, 3] > ALPHA)
        row_frames.append(field(cuts[k], dx, dy))
        shifts.append((dx, dy, round(float(iou), 3)))
    print('ряд', r, 'сдвиги', shifts)
    frames.append(row_frames)

boxes = []
for r in range(ROWS):
    m = np.any(np.stack([f[:, :, 3] > ALPHA for f in frames[r]]), axis=0)
    ys, xs = np.nonzero(m)
    boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
S = max(max(b[2] - b[0], b[3] - b[1]) for b in boxes) + 2 * MARGIN
S = (S + 3) // 4 * 4
print('ячейка', S)

sheet = np.zeros((ROWS * S, COLS * S, 4), np.uint8)
overlay = np.zeros_like(sheet)
for r in range(ROWS):
    bx0, by0, bx1, by1 = boxes[r]
    bw, bh = bx1 - bx0, by1 - by0
    ox, oy = (S - bw) // 2, S - MARGIN - bh
    for k in range(COLS):
        y, x = r * S + oy, k * S + ox
        sheet[y:y + bh, x:x + bw] = frames[r][k][by0:by1, bx0:bx1]
        if args.overlay:
            for f in frames[r]:
                c = f[by0:by1, bx0:bx1].astype(np.uint16)
                c[:, :, 3] //= COLS
                cell = overlay[y:y + bh, x:x + bw].astype(np.uint16)
                cell[:, :, :3] = np.maximum(cell[:, :, :3], c[:, :, :3] * (c[:, :, 3:4] > 0))
                cell[:, :, 3] = np.minimum(255, cell[:, :, 3] + c[:, :, 3])
                overlay[y:y + bh, x:x + bw] = cell.astype(np.uint8)

Image.fromarray(sheet).save(args.out, optimize=True)
print('записан', args.out, sheet.shape[1], 'x', sheet.shape[0])
if args.overlay:
    Image.fromarray(overlay).save(args.overlay)
    print('наложение', args.overlay)
