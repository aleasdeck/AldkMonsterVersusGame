"""Сборка листа анимаций героя из картинки генератора в ровные ячейки.

Генератор отдаёт лист в одном из двух видов, скрипт различает их сам по наличию прозрачности:

* **сетка** — непрозрачный фон, кадры разложены по ячейкам с нарисованными рамками и номерами
  («KNIGHT ANIMATION SPRITE SHEET»: ряд = анимация, 8 кадров в ряду). Рамки и номера убираются.
* **россыпь** — прозрачный фон, фигуры лежат без сетки, ряд = герой (первый лист покоя шести героев).

В обоих случаях кадры одного ряда выравниваются между собой (сдвиг с максимумом IoU): зацикленные
клипы (`idle`, `battle`) — покадрово, чтобы петля не дрожала, остальные — одним сдвигом на весь клип
по первому кадру, чтобы не убить нарисованный выпад или падение. Готовый лист — квадратные ячейки
одного размера, общий центр, в `src/assets/heroes/<герой>.png`.

    python tools/hero-sheet.py art/knight.png --hero warrior --clips idle,battle,attack,power,block,hurt,death
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
ap.add_argument('--layout', choices=('grid', 'scattered'), default='grid', help='grid — кадры по ячейкам с рамками (лист генератора); scattered — фигуры россыпью на прозрачном фоне (первый лист покоя)')
ap.add_argument('--out-dir', default=str(Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'heroes'))
ap.add_argument('--inset', type=int, default=4, help='отступ внутрь ячейки от границы, px: столько занимают рамка и её свечение')
ap.add_argument('--overlay')
args = ap.parse_args()

if bool(args.hero) == bool(args.heroes):
    ap.error('нужен ровно один из --hero / --heroes')
heroes = [args.hero] if args.hero else args.heroes.split(',')
clips = args.clips.split(',') if args.hero else [args.clip]
COLS = args.cols
INSET = args.inset
ROWS = len(clips) if args.hero else len(heroes)

rgba = np.array(Image.open(args.src).convert('RGBA'))
# лист с вырезанным фоном: прозрачного много, значит маска персонажа — это сама альфа
CUTOUT = (rgba[:, :, 3] < ALPHA).mean() > 0.2


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


def lineness(L):
    """Насколько ряд пикселей похож на линию рамки: доля строк, где он заметно отличается от своей округи.
    Сравнение местное, поэтому мера одинаково работает и на плоском фоне, и на градиентном."""
    N = L.shape[1]
    out = np.zeros(N)
    for x in range(5, N - 5):
        out[x] = (np.abs(L[:, x] - np.median(L[:, x - 4:x + 5], axis=1)) > 6).mean()
    return out


def grid_lines(L, n):
    """
    Границы ячеек по одной оси: цепочка из n+1 линий, где ярче линия и ровнее меняется шаг, та и выбирается.
    Просто «самые яркие» не годятся — в листе есть и внешняя рамка, и колонка подписей в такой же рамке;
    равномерная сетка тоже не годится — у генератора крайние ячейки бывают шире. Возвращает (границы, все линии).
    """
    ln = lineness(L)
    N = len(ln)
    cand = [x for x in range(6, N - 6) if ln[x] > 0.25 and ln[x] == ln[max(0, x - 8):x + 9].max()]
    if len(cand) < n + 1:
        raise SystemExit(f'нашлось линий: {len(cand)}, нужно {n + 1} — проверь --cols/--clips')
    mingap = N / (n + 1) * 0.45
    best = {}
    for i in range(len(cand)):
        for j in range(i + 1, len(cand)):
            if cand[j] - cand[i] >= mingap:
                best[(2, i, j)] = (ln[cand[i]] + ln[cand[j]], None)
    for k in range(2, n + 1):
        for (kk, i, j), (sc, _) in [(key, v) for key, v in best.items() if key[0] == k]:
            for l in range(j + 1, len(cand)):
                g1, g2 = cand[j] - cand[i], cand[l] - cand[j]
                if g2 < mingap:
                    continue
                s = sc + ln[cand[l]] - 0.02 * abs(g2 - g1)   # шаг сетки меняется плавно, скачок штрафуем
                key = (k + 1, j, l)
                if key not in best or best[key][0] < s:
                    best[key] = (s, (k, i, j))
    fin = [(v[0], key) for key, v in best.items() if key[0] == n + 1]
    if not fin:
        raise SystemExit('не сложилась сетка из найденных линий — проверь --cols/--clips')
    key = max(fin)[1]
    seq = []
    while True:
        seq.append(cand[key[2]])
        prev = best[key][1]
        if prev is None:
            seq.append(cand[key[1]])
            break
        key = prev
    # для границ ячеек отдаём только уверенные линии: слабые пики бывают и на самом персонаже
    return sorted(seq), [c for c in cand if ln[c] > 0.5]


def flood_bg(px, tol=10):
    """
    Фон ячейки заливкой от её краёв: пиксель уходит в фон, если он близок к уже фоновому соседу.
    Сравниваем с соседом, а не с одним цветом на весь лист, — тогда плавный градиент заливается целиком,
    а резкая граница персонажа останавливает заливку.
    """
    c = px.astype(np.int16)
    bg = np.zeros(c.shape[:2], bool)
    bg[0, :] = bg[-1, :] = True
    bg[:, 0] = bg[:, -1] = True
    for _ in range(max(c.shape) * 2):
        prev = bg.sum()
        near = np.abs(np.diff(c, axis=1)).max(axis=2) <= tol       # сосед слева/справа
        bg[:, 1:] |= bg[:, :-1] & near
        bg[:, :-1] |= bg[:, 1:] & near
        near = np.abs(np.diff(c, axis=0)).max(axis=2) <= tol       # сверху/снизу
        bg[1:, :] |= bg[:-1, :] & near
        bg[:-1, :] |= bg[1:, :] & near
        if bg.sum() == prev:
            break
    return bg


def read_grid():
    """Сетка: фон непрозрачный, кадры разложены по ячейкам с рамками, у кадра стоит номер."""
    rgb = rgba[:, :, :3]
    L = rgb.astype(float).mean(axis=2)
    vs, vcand = grid_lines(L, COLS)
    hs, hcand = grid_lines(L.T, ROWS)
    print(f'сетка {COLS}x{ROWS}: столбцы {vs}, строки {hs}')

    def bounds(edges, cand, i):
        """Нутро ячейки — по самой внутренней линии рамки у каждой её границы. Так рез попадает внутрь рамки,
        даже когда между ячейками широкий промежуток с язычком номера, а выбранной границей стала рамка соседа."""
        a, b = edges[i], edges[i + 1]
        lo = max([c for c in cand if a - 4 <= c <= min(a + 30, (a + b) / 2)] or [a])
        hi = min([c for c in cand if max(b - 30, (a + b) / 2) <= c <= b + 4] or [b])
        return lo + INSET, hi - INSET

    out = []
    for r in range(ROWS):
        frames = []
        y0, y1 = bounds(hs, hcand, r)
        for c in range(COLS):
            x0, x1 = bounds(vs, vcand, c)
            sub = rgb[y0:y1, x0:x1]
            # Фон ячейки бывает прозрачным (тогда маска уже готова) или залитым: во втором случае заливаем от краёв.
            src_a = rgba[y0:y1, x0:x1, 3]
            a = src_a > ALPHA if CUTOUT else ~flood_bg(sub)
            h, w = y1 - y0, x1 - x0
            drop = np.zeros_like(a)
            # Чистим только залитый лист: там в ячейке лежит номер кадра и пыль генератора. У вырезанного
            # номер остаётся за резом, а всё внутри — рисунок: искорки вокруг заклинания как раз мелкие,
            # и «мелкое у края» выкусывало их дырками.
            if not CUTOUT:
                lab, _ = ndimage.label(a)
                for i, sl in enumerate(ndimage.find_objects(lab), 1):
                    area = int((lab[sl] == i).sum())
                    mid = (sl[1].start + sl[1].stop) / 2
                    number = area < 500 and sl[0].start > h - 16 and abs(mid - w / 2) < w * 0.2
                    if area < 60 or number:
                        drop[sl] |= lab[sl] == i
            a &= ~drop
            if not a.any():
                raise SystemExit(f'ячейка {r}:{c} вышла пустой — проверь --inset')
            # Прозрачность берём из исходника как есть: порог годится искать мусор, но не рисовать край —
            # обрезанное по нему мягкое свечение превращается в рваную корку. Выкинутое гасим с запасом.
            out_a = np.where(ndimage.binary_dilation(drop, iterations=3), 0, src_a) if CUTOUT else a.astype(np.uint8) * 255
            out_a = np.where(out_a < 8, 0, out_a)   # генератор оставляет под нулевой прозрачностью цветной мусор
            px = np.dstack([sub, out_a]).astype(np.uint8)
            px[out_a == 0] = 0
            ys, xs = np.nonzero(out_a > 8)
            frames.append(px[ys.min():ys.max() + 1, xs.min():xs.max() + 1])
        out.append(frames)
    return out


rows = read_grid() if args.layout == 'grid' else read_scattered()


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
