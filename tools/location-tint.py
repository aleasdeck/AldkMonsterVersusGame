"""Цвет света локации для тонировки бойцов (src/ui/tint.ts).

Меряет по рабочему кадру фона, какого цвета локация светит, и печатает готовую строку для
таблицы TINTS. Это подсказка, а не приговор: цвет и силу всё равно проверяют на скриншоте боя
(`&tint=<сила>&tintc=<цвет>` в адресе), см. docs/art.md.

    python tools/location-tint.py --loc caves
    python tools/location-tint.py src/assets/backgrounds/caves-wide.png --loc caves
"""

import argparse
import colorsys
from pathlib import Path

import numpy as np
from PIL import Image

# Ниже этих порогов пиксель не несёт цвета: чёрные провалы и серый камень только утянут медиану в никуда.
MIN_VALUE = 0.12
MIN_SAT = 0.12


def light_color(path: Path) -> tuple[np.ndarray, float]:
    """Цвет света кадра (нормированный по максимуму канала) и его насыщенность."""
    px = np.asarray(Image.open(path).convert('RGB')).astype(np.float32).reshape(-1, 3) / 255
    top, low = px.max(1), px.min(1)
    colored = px[(top > MIN_VALUE) & ((top - low) / np.maximum(top, 1e-6) > MIN_SAT)]
    if not len(colored):
        raise SystemExit(f'{path}: цветных пикселей нет, цвет света не с чего считать')
    median = np.median(colored, axis=0)
    light = median / median.max()
    return light, colorsys.rgb_to_hsv(*light)[1]


def main() -> None:
    ap = argparse.ArgumentParser(description='Цвет света локации для тонировки бойцов')
    ap.add_argument('src', nargs='?', help='кадр фона; по умолчанию src/assets/backgrounds/<loc>-wide.png')
    ap.add_argument('--loc', required=True, help='id локации: forest, swamp, crypt, hive, caves, ship')
    args = ap.parse_args()

    path = Path(args.src) if args.src else Path('src/assets/backgrounds') / f'{args.loc}-wide.png'
    light, sat = light_color(path)
    hex_light = '#%02x%02x%02x' % tuple(int(round(v * 255)) for v in light)
    # Насыщенный свет красит сам, бледному нужна доля побольше: числа сняты с шести подобранных локаций.
    k = round(max(0.25, min(0.55, 0.55 - 0.33 * sat)) * 20) / 20
    print(f'{path}: свет {hex_light}, насыщенность {sat:.2f}')
    print(f"  {args.loc}: {{ light: '{hex_light}', k: {k} }},")
    print('  проверить в бою: ?hero=warrior&locs=%s,swamp,crypt&room=4&enter=1&tint=%s&tintc=%s' % (args.loc, k, hex_light[1:]))


if __name__ == '__main__':
    main()
