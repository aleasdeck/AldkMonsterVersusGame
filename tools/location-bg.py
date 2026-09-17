"""Нарезка рисованного фона локации из мастера генератора в два кадра игры.

Кадр забега — прямоугольник 960×320 между топбаром и консолью, и поле боя, и хаб рисуются в него же,
поэтому пропорция у обоих вариантов одна, а разница — в приближении:

* **wide** — поле боя: вся сцена целиком, мастер вписывается по ширине.
* **tall** — карта, хаб, награда, событие: кусок сцены крупнее (`--zoom`), взятый по земле,
  чтобы под текстом хаба лежал не пустой воздух, а тропа. Горизонт куска — `--center`.

Мастер уменьшается усреднением (BOX) без сглаживания и квантуется в палитру `--colors` — на глаз
разницы с полным цветом нет, а файл выходит в разы легче. Чёрные кромки генератора (у части мастеров
сверху и снизу лежит полоса в 10–35 px) срезаются сами: иначе внизу кадра, ровно под ногами бойцов,
появилась бы чёрная лента. Ширина 960 выбрана нарочно: в логическом
кадре это 1:1, на FullHD ровно ×2, так что `image-rendering: pixelated` нигде не пересчитывает пиксели.

    python tools/location-bg.py art/forest-bg.png --loc forest --zoom 1.6 --center 0.36

Готовые файлы — `src/assets/backgrounds/<локация>-wide.png` и `-tall.png`, их подхватывает
`PAINTED` в src/ui/backgrounds.ts. Нужен Pillow.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image

W, H = 960, 320   # кадр забега: центр между топбаром и консолью
DARK = 12         # ярче этого линия у края уже не кромка, а сцена

ap = argparse.ArgumentParser()
ap.add_argument('src', help='мастер из генератора, пропорция примерно 3:1')
ap.add_argument('--loc', required=True, help='id локации: forest, swamp, crypt, hive, caves, ship')
ap.add_argument('--zoom', type=float, default=1.6, help='во сколько раз кусок для хабов крупнее сцены')
ap.add_argument('--center', type=float, default=0.5, help='середина куска для хабов, доля ширины мастера')
ap.add_argument('--colors', type=int, default=128, help='размер палитры; 0 — оставить полный цвет')
ap.add_argument('--no-trim', action='store_true', help='не срезать чёрные кромки мастера')
ap.add_argument('--out', default='src/assets/backgrounds', help='куда класть готовые кадры')
args = ap.parse_args()

master = Image.open(args.src).convert('RGB')

if not args.no_trim:
    # Кромка генератора: подряд идущие от края почти чёрные линии. Дальше 8 % стороны не режем —
    # там уже может начинаться настоящая тень сцены.
    a = np.asarray(master).astype(int)
    rows, cols = a.mean(axis=(1, 2)), a.mean(axis=(0, 2))

    def edge(line, limit):
        n = 0
        while n < limit and line[n] < DARK:
            n += 1
        return n

    top, bottom = edge(rows, a.shape[0] // 12), edge(rows[::-1], a.shape[0] // 12)
    left, right = edge(cols, a.shape[1] // 12), edge(cols[::-1], a.shape[1] // 12)
    if top or bottom or left or right:
        master = master.crop((left, top, master.width - right, master.height - bottom))
        print(f'срезаны чёрные кромки: верх {top}, низ {bottom}, слева {left}, справа {right}')

mw, mh = master.size


def shrink(box: tuple[int, int, int, int]) -> Image.Image:
    """Кусок мастера в кадр игры: усреднение без сглаживания, потом палитра."""
    img = master.crop(box).resize((W, H), Image.BOX)
    return img.quantize(colors=args.colors, method=Image.MEDIANCUT, dither=Image.Dither.NONE) if args.colors else img


out_dir = Path(args.out)
out_dir.mkdir(parents=True, exist_ok=True)

# wide: вся сцена — наибольший кадр 3:1 по центру мастера. Лишнее срезаем, а не сжимаем: у мастера
# после обрезки кромок пропорция уходит от 3:1 на несколько процентов, и сжатие было бы заметно на кладке.
crop_w, crop_h = min(mw, round(mh * W / H)), min(mh, round(mw * H / W))
frames = {'wide': ((mw - crop_w) // 2, (mh - crop_h) // 2, (mw - crop_w) // 2 + crop_w, (mh - crop_h) // 2 + crop_h)}

# tall: кусок крупнее, прижатый к низу мастера, — в хабе под текстом остаётся земля.
zw = min(mw, round(mw / args.zoom))
zh = min(mh, round(zw * H / W))
zx = max(0, min(mw - zw, round(mw * args.center - zw / 2)))
frames['tall'] = (zx, mh - zh, zx + zw, mh)

for variant, box in frames.items():
    path = out_dir / f'{args.loc}-{variant}.png'
    shrink(box).save(path, optimize=True)
    print(f'{path}  {W}x{H}  из {box[2] - box[0]}x{box[3] - box[1]} мастера  {path.stat().st_size // 1024} КБ')
