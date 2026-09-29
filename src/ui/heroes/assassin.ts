import { type Mat, type Painter } from '../mobs/pixel';
import type { AvatarSpec } from './avatar';
import type { HeroModel, HeroProbe } from './model';
import { clipAt, HERO_CLIPS, poseAt, type PoseKeys, type SculptClip } from './clips';
import { at, DEG, ik, lerp, reachFoot, stroke } from './rig';

/**
 * Ассасин пиксельной лепкой — шаги 1–3 рецепта docs/lepka-geroev.md: мерки с листа, модель в стойке с покоем и три
 * облика одной лепкой на обсуждение (страница «Лепка троих», tools/hero-proto/trio-page.ts). В игру ещё не входит:
 * записи в `HERO_MODELS` нет, инструменты находят модель по имени файла (`assassinModel(look)`). Клипы, кроме покоя,
 * пока рисуют первый кадр покоя — их ключи (`CLIPS`) появятся после выбора облика.
 *
 * Референс — прежний рисованный лист `src/assets/heroes/assassin.png` (один ряд покоя, ячейка 182, фигура первого
 * кадра 164 точки: x 8…177 с остриями клинков, y 10…173). Контуры частей обведены по первому кадру в точках листа и
 * переводятся в единицы поля функциями `X`, `Y`, `S` (k = 120 / 164, левый край фигуры → 4, низ → земля): в коде стоят
 * числа листа, чтобы сверку можно было повторить по сетке (урок Паладина — «анатомия на глаз»).
 *
 * Что на листе: низкая широкая стойка — ближняя нога прямой диагональю уходит влево-назад, дальняя согнута коленом к
 * врагам; верх ссутулен, большой капюшон подан к врагам, лицо — тёмный проём, светлая полоса у глаз, ниже чёрная
 * маска; шарф петлёй вокруг шеи, концы закинуты на ближнее плечо; обе руки висят по бокам почти прямо, предплечья в
 * кожаных обмотках, кулаки держат кинжалы обратным хватом — клинок продолжает линию предплечья вниз и наружу; куртка
 * с полами до колен, пояс с кошелями, спереди красная набедренная полоса; наколенники, голени в обмотках, сапоги.
 *
 * Смотрит вправо, на врагов. Ближняя сторона — левая (рука с кинжалом поверх туловища и полы куртки), дальняя — правая:
 * плечо дальней руки за туловищем, предплечье и второй кинжал — снаружи от корпуса. Свет общий с врагами — сверху слева.
 *
 * Порядок фигур не переставлять без нужды: зерно фактуры движок заводит по порядку, в котором материал встретился в
 * кадре (ловушка «Порядок фигур — это зерно фактуры»).
 */

// ─── Облики ──────────────────────────────────────────────────────────────────

export type AssassinLook = 'a' | 'b' | 'c';

/** Облик: палитры частей и детали, которые меняются при той же лепке (голова, шея, клинки, пояс, полы). */
interface LookSpec {
  /** Капюшон и накидка плеч; куртка и полы; штаны. */
  hood: string[];
  cloth: string[];
  pants: string[];
  /** Обмотки предплечий и голеней, сапоги, наколенники. */
  wrap: string[];
  boot: string[];
  pad: string[];
  skin: string[];
  /** Маска и тень проёма капюшона. */
  mask: string[];
  /** Ремни, пояс, кошели. */
  leather: string[];
  /** Сталь гард, пряжек и ножей перевязи; клинки — своя сталь (у C гарды воронёные, а клинок светлее тела). */
  steel: string[];
  blades: string[];
  brass: string[];
  /** Шарф и цветные полосы одежды (набедренная, кант пол). */
  scarf: string[];
  accent: string[];
  /** Яд — склянки и мазок по клинку (облик B). */
  poison: string[];
  /** Капюшон: по листу или глубокий, нависающий над лицом. */
  hoodKind: 'sheet' | 'deep';
  /** Лицо: чёрная тканевая маска, кожаная полумаска с коротким клювом-респиратором, повязка в цвет капюшона. */
  maskKind: 'cloth' | 'beak' | 'veil';
  /** Шея: шарф петлёй с концами на ближнем плече (лист), рваная пелерина вместо шарфа, узкая лента шарфа. */
  neck: 'loop' | 'capelet' | 'band';
  /** Клинки: прямой листовидный кинжал (лист), кривой крюк, длинный трёхгранный стилет. */
  blade: 'dagger' | 'hook' | 'stiletto';
  /** Снаряжение: кошели на поясе, склянки на поясе и перевязи, метательные ножи на перевязи. */
  gear: 'pouches' | 'flasks' | 'knives';
  /** Низ: бёдра в широких штанах с полосой и концом кушака (лист), с полосой в кожаной кромке, длинные рваные полы. */
  skirt: 'trim' | 'tasset' | 'ragged';
}

const BRASS = ['#241808', '#4e3616', '#7a5c2a', '#a08040', '#c8a860'];
/** Светлая выделанная кожа — полумаска с клювом отравителя. */
const PALE_LEATHER = ['#2c2118', '#564331', '#7e6649', '#a08662', '#bea47e'];

const LOOKS: Record<AssassinLook, LookSpec> = {
  // A «С листа»: палитра листа, приглушённая под сцену, как «Пепельный храмовник» у Паладина и «Северянин» у
  // Берсерка — сливово-угольная ткань, бурые обмотки; красный листа сдвинут в запёкшийся бурый (у Воина — алый),
  // пятно то же: шарф, набедренная полоса и конец кушака по ближнему бедру.
  a: {
    hood: ['#150f16', '#2e232b', '#483b42', '#625257', '#7c6b6d'],
    cloth: ['#110c10', '#251c21', '#3b2f34', '#534448', '#6b5b5e'],
    pants: ['#120e11', '#282024', '#3f3338', '#58484d', '#716064'],
    wrap: ['#1a1110', '#36241e', '#56392c', '#74503c', '#926a50'],
    boot: ['#150e0d', '#2c1d1a', '#452d26', '#614135', '#7d5846'],
    pad: ['#1a1418', '#342a2e', '#524448', '#6e5e60', '#8c7c7a'],
    skin: ['#4a2a22', '#8a4e3a', '#b87052', '#d8966e', '#ecba92'],
    mask: ['#070506', '#100b0d', '#1c1417', '#2a2024', '#3a2e32'],
    leather: ['#150e0c', '#2a1c18', '#433027', '#5e4435', '#7a5c48'],
    steel: ['#18161a', '#3a363a', '#666064', '#968e8e', '#c4bcb6'],
    blades: ['#18161a', '#3a363a', '#666064', '#968e8e', '#c4bcb6'],
    brass: BRASS,
    scarf: ['#2a0e0c', '#4c1c18', '#6e2c24', '#8c3e30', '#a85640'],
    accent: ['#1c0a0a', '#381414', '#58211e', '#723029', '#8a4236'],
    poison: ['#1c220c', '#3a4614', '#5c6a22', '#808e36', '#a4b04e'],
    hoodKind: 'sheet',
    maskKind: 'cloth',
    neck: 'loop',
    blade: 'dagger',
    gear: 'pouches',
    skirt: 'trim',
  },
  // B «Отравитель»: черта героя — яд (черта «Отравитель»); чёрно-бурая кожа и сукно, красного нет вовсе — цветное
  // пятно одно: мутная жёлто-зелёная отрава в склянках и на кривых клинках. Полумаска светлой кожи с коротким клювом-
  // респиратором, рваная пелерина вместо шарфа, склянки на поясе и перевязи, набедренная полоса с кожаной кромкой. Зелёная
  // ткань и хвост капюшона были в первом проходе — отказались: так уже одет Лучник («Следопыт», «Ворон»).
  b: {
    hood: ['#1f1914', '#342a21', '#4a3c2f', '#62503f', '#7c6852'],
    cloth: ['#1a1510', '#2d241c', '#41352a', '#574737', '#705c48'],
    pants: ['#110f0c', '#211c17', '#312922', '#443a30', '#5a4d40'],
    wrap: ['#141310', '#29261f', '#403c31', '#5a5545', '#76705c'],
    boot: ['#1a1410', '#2b221b', '#3f3226', '#554434', '#6e5a46'],
    pad: ['#131009', '#2a2218', '#40352a', '#584a3c', '#726252'],
    skin: ['#4a2c22', '#865038', '#b2704f', '#d0946c', '#e4b690'],
    mask: ['#060504', '#0d0b09', '#171410', '#221e19', '#302a23'],
    leather: ['#140c08', '#2c1b11', '#48301f', '#66462e', '#865f42'],
    steel: ['#141416', '#322f33', '#58534f', '#847c74', '#aaa296'],
    blades: ['#141416', '#322f33', '#58534f', '#847c74', '#aaa296'],
    brass: BRASS,
    scarf: ['#14110e', '#29231c', '#40372b', '#584d3c', '#716552'],
    accent: ['#140c08', '#2c1b11', '#48301f', '#66462e', '#865f42'],
    poison: ['#1a1f0a', '#343d12', '#52601c', '#71802c', '#929e46'],
    hoodKind: 'sheet',
    maskKind: 'beak',
    neck: 'capelet',
    blade: 'hook',
    gear: 'flasks',
    skirt: 'tasset',
  },
  // C «Сумрак»: холодная грифельно-синяя чернь (палитра прежнего процедурного спрайта Ассасина), серые обмотки,
  // воронёные стилеты; красного — одна узкая лента шарфа цвета тёмного вина, без кушака и набедренной полосы.
  // Глубокий капюшон нависает над лицом, лицо закрыто повязкой в цвет капюшона, длинные рваные полы куртки поверх
  // бёдер, метательные ножи на перевязи.
  c: {
    hood: ['#141620', '#242836', '#363a4c', '#4b5064', '#646a80'],
    cloth: ['#12141c', '#20232e', '#30343f', '#424756', '#585e6e'],
    pants: ['#0f1016', '#1a1c24', '#282b35', '#383c48', '#4c505e'],
    wrap: ['#141416', '#28282c', '#3e3e44', '#56565c', '#707074'],
    boot: ['#15151b', '#24242c', '#35353f', '#484852', '#5e5e6a'],
    pad: ['#1a1c23', '#2c2f39', '#40434f', '#555a68', '#6e7382'],
    skin: ['#44281f', '#7e4a37', '#a86a4e', '#c68c6a', '#dcb08e'],
    mask: ['#07080a', '#0f1014', '#1a1c22', '#262930', '#353941'],
    leather: ['#0d0d10', '#1b1a1f', '#2d2b32', '#423f47', '#5a5660'],
    steel: ['#101014', '#26262c', '#44444c', '#6c6c74', '#96969c'],
    blades: ['#18161a', '#3a363a', '#666064', '#968e8e', '#c4bcb6'],
    brass: BRASS,
    scarf: ['#18060d', '#320c19', '#4e1426', '#681f33', '#822d42'],
    accent: ['#12141c', '#20232e', '#30343f', '#424756', '#585e6e'],
    poison: ['#1c220c', '#3a4614', '#5c6a22', '#808e36', '#a4b04e'],
    hoodKind: 'deep',
    maskKind: 'veil',
    neck: 'band',
    blade: 'stiletto',
    gear: 'knives',
    skirt: 'ragged',
  },
};

/** Облики для страницы обсуждения: имя и чем отличается. */
export const ASSASSIN_LOOKS: readonly { id: AssassinLook; name: string; note: string }[] = [
  {
    id: 'a',
    name: 'С листа',
    note: 'Палитра и детали прежнего листа, приглушённые под сцену: сливово-угольный покров, бурые обмотки, прямые кинжалы, кошели. Красный листа сдвинут в запёкшийся бурый и остался там же — шарф, набедренная полоса, конец кушака.',
  },
  {
    id: 'b',
    name: 'Отравитель',
    note: 'Чёрно-бурая кожа без красного, цветное пятно — мутная отрава в склянках и на клинках-когтях. Полумаска светлой кожи с коротким клювом-респиратором, рваная пелерина вместо шарфа, набедренная полоса с кожаной кромкой.',
  },
  {
    id: 'c',
    name: 'Сумрак',
    note: 'Холодная грифельная чернь (палитра прежнего спрайта), серые обмотки, стилеты с воронёными гардами, длинные рваные полы куртки. Глубокий капюшон над повязкой; красного — одна узкая лента шарфа цвета тёмного вина на шее.',
  },
];

/**
 * Рекомендация лепщика: A — тот же герой, что на листе и прежнем портрете, красный приглушён до бурого и не спорит с
 * алым Воина; B и C — если красный решено убрать совсем (B) или оставить узкой лентой (C).
 */
export const ASSASSIN_RECOMMENDED: AssassinLook = 'a';

/**
 * Материалы облика — свой объект на каждую часть, у которой должно быть своё зерно. Ткань — полосами вдоль складок,
 * кожа и обмотки — шумом без `metal`, клинки — тусклая сталь (`metal` умеренный, тёмный рамп): не хром.
 */
function matsOf(L: LookSpec) {
  const cloth = (ramp: string[], angle: number, amp = 0.12): Mat => ({ base: ramp[2], ramp, tex: { kind: 'stripes', scale: 2.4, amp, angle } });
  const rough = (ramp: string[], amp = 0.14, scale = 2.2): Mat => ({ base: ramp[2], ramp, tex: { kind: 'noise', scale, amp } });
  const skin = (): Mat => ({ base: L.skin[2], ramp: L.skin, dither: 0.3, tex: { kind: 'noise', scale: 2.6, amp: 0.06 } });
  return {
    pants: rough(L.pants, 0.12),
    shinF: rough(L.wrap, 0.14, 1.8),
    bootF: rough(L.boot, 0.14, 2),
    padF: rough(L.pad, 0.14, 2),
    shinN: rough(L.wrap, 0.14, 1.8),
    bootN: rough(L.boot, 0.14, 2),
    padN: rough(L.pad, 0.14, 2),
    sleeve: cloth(L.cloth, 0.9),
    skinF: skin(),
    coat: cloth(L.cloth, 1.5, 0.1),
    skirtF: { ...cloth(L.cloth, 0.7), dither: 0.3 } as Mat,
    skirtN: { ...cloth(L.cloth, 0.95), dither: 0.3 } as Mat,
    accent: { ...cloth(L.accent, 1.57, 0.14), dither: 0.3 } as Mat,
    belt: { base: L.leather[2], ramp: L.leather, dither: 0.2 } as Mat,
    pouch: rough(L.leather, 0.12, 2),
    wrapF: rough(L.wrap, 0.14, 1.8),
    steel: { base: L.steel[2], ramp: L.steel, dither: 0, metal: 0.45, tex: { kind: 'spots', scale: 2, amp: 0.14, density: 0.18 } } as Mat,
    blade: { base: L.blades[2], ramp: L.blades, dither: 0, metal: 0.45, tex: { kind: 'spots', scale: 2, amp: 0.14, density: 0.18 } } as Mat,
    brass: { base: L.brass[2], ramp: L.brass, dither: 0, metal: 0.5 } as Mat,
    glass: { base: L.poison[1], ramp: [L.mask[0], L.poison[0], L.poison[1], L.poison[2], L.poison[4]], dither: 0 } as Mat,
    skinN: skin(),
    wrapN: rough(L.wrap, 0.14, 1.8),
    mantle: { ...cloth(L.hood, 1.1, 0.12), dither: 0.3 } as Mat,
    /**
     * Капюшон без дизеринга: при сдвиге дыхания на пиксель дизеринг перекрашивал пятую часть его клеток — купол рябил
     * (у шлемов Воина и Паладина 8–11 %).
     */
    hood: { ...rough(L.hood, 0.1, 2.8), dither: 0 } as Mat,
    /** Тень в проёме капюшона — почти чёрная, с одной ступенью к краю. */
    shade: { base: L.mask[1], ramp: [L.mask[0], L.mask[0], L.mask[1], L.mask[1], L.mask[2]], dither: 0 } as Mat,
    /** Кожа у глаз — мелкое пятно: без дизеринга, иначе тон перебрасывается с каждым сдвигом дыхания. */
    face: { base: L.skin[2], ramp: L.skin, dither: 0 } as Mat,
    mask: { base: L.mask[2], ramp: L.mask, dither: 0.2, tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
    /** Полумаска с клювом — светлая выделанная кожа (у B): тоном отделяется от капюшона, при тёмной сливалась с ним. */
    maskLeather: { base: PALE_LEATHER[2], ramp: PALE_LEATHER, dither: 0.2, tex: { kind: 'noise', scale: 2, amp: 0.12 } } as Mat,
    scarf: { base: L.scarf[2], ramp: L.scarf, shag: 0.05, tex: { kind: 'stripes', scale: 2.2, amp: 0.16, angle: 0.75 } } as Mat,
    /** Штрихи: стык и щель обмоток, светлый край обмотки, складка ткани, складка и кромка капюшона, складка шарфа, кромка клинка. */
    seam: L.leather[0],
    wrapGap: L.wrap[0],
    wrapLit: L.wrap[4],
    fold: L.cloth[0],
    hoodFold: L.hood[0],
    hoodLit: L.hood[4],
    scarfFold: L.scarf[0],
    scarfLit: L.scarf[4],
    edge: L.blades[4],
    skinDark: L.skin[1],
    stud: L.brass[4],
  };
}
type Mats = ReturnType<typeof matsOf>;

// ─── Мерки: точки листа → единицы поля ─────────────────────────────────────

/** Земля модели и масштаб листа: фигура первого кадра (164 точки) → рост 120. */
const G = 124;
const K = 120 / 164;
/** Точка листа по x и y → единицы поля: левый край фигуры (8) → 4, низ (174 — под последним рядом) → земля. */
const X = (px: number): number => 4 + (px - 8) * K;
const Y = (py: number): number => G - (174 - py) * K;
const P = (px: number, py: number): [number, number] => [X(px), Y(py)];
/** Контур в точках листа [x0, y0, x1, y1, …] → в единицах поля. */
const S = (...pts: number[]): number[] => pts.map((v, i) => (i % 2 ? Y(v) : X(v)));
/** Размер в точках листа → в единицах. */
const R = (v: number): number => v * K;

/**
 * Суставы стойки — точки первого кадра листа. Ближняя нога почти прямой диагональю от бедра к щиколотке (колено под
 * наколенником), дальняя согнута — колено вынесено к врагам. Руки висят по бокам почти прямо: плечевые суставы под
 * накидкой (ближний) и под шарфом (дальний) — их положение восстановлено по оси руки ниже; кулак — середина кулака.
 */
const M = {
  neck: P(100, 56),
  pelvis: P(94, 104),
  legN: { hip: P(80, 106), knee: P(50, 135), ank: P(30, 159) },
  legF: { hip: P(108, 104), knee: P(131, 124), ank: P(121, 157) },
  armN: { sh: P(58, 47), el: P(39, 70), hand: P(28, 94) },
  armF: { sh: P(114, 61), el: P(131, 79), hand: P(153, 104) },
};

const len = (a: readonly number[], b: readonly number[]): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
const dir = (a: readonly number[], b: readonly number[]): number => Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
const ARM_N = { l1: len(M.armN.sh, M.armN.el), l2: len(M.armN.el, M.armN.hand) };
const ARM_F = { l1: len(M.armF.sh, M.armF.el), l2: len(M.armF.el, M.armF.hand) };
const LEG_N = { l1: len(M.legN.hip, M.legN.knee), l2: len(M.legN.knee, M.legN.ank) };
const LEG_F = { l1: len(M.legF.hip, M.legF.knee), l2: len(M.legF.knee, M.legF.ank) };
const PELVIS = M.pelvis;
/** Кинжалы в стойке: клинок продолжает линию предплечья — от кулака к острию листа (9, 132) и (176, 134). */
const BLADE_N = dir(M.armN.hand, P(9, 132));
const BLADE_F = dir(M.armF.hand, P(176, 134));

// ─── Рваный край ────────────────────────────────────────────────────────────

/**
 * Рваный край ткани: ломаная (единицы поля), между вершинами через `step` торчит зубец на `amp` по нормали (`side` 1 —
 * налево от хода на экране), кончик отнесён вдоль хода на `lean`; длина зубцов гуляет 1 / 0,5 / 0,8. Как `furEdge`
 * Берсерка: число зубцов зависит только от исходной ломаной — число фигур в кадре постоянно.
 */
function ragged(pts: number[], amp: number, step: number, side: 1 | -1, lean = 0): number[] {
  const out: number[] = [];
  let k = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    const tx = (x1 - x0) / l, ty = (y1 - y0) / l;
    const nx = ty * side, ny = -tx * side;
    const n = Math.max(1, Math.round(l / step));
    for (let j = 0; j < n; j++) {
      const a = j / n, b = (j + 0.5) / n, s = [1, 0.5, 0.8][k++ % 3];
      out.push(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a);
      out.push(x0 + (x1 - x0) * b + nx * amp * s + tx * lean, y0 + (y1 - y0) * b + ny * amp * s + ty * lean);
    }
  }
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}

// ─── Клинки ─────────────────────────────────────────────────────────────────

/**
 * Клинок обратным хватом: из-под мизинца кулака наружу и вниз, по линии предплечья. Станции — [s — вдоль клинка от
 * середины кулака, полуширина, сдвиг середины поперёк: плюс — к врагам]; до s ≈ 5 клинок под кулаком.
 * Прямой кинжал листа — листовидный, шире у гарды; крюк — кривой по всей длине, как коготь; стилет — длинный и узкий
 * (последняя треть не уже пикселя, острие тупое на полпикселя: на пикселе 1,5 острие рвалось пунктиром, а тёмная точка
 * контура на кончике отрывалась в кадрах покоя).
 */
const BLADES: Record<LookSpec['blade'], Array<[number, number, number]>> = {
  dagger: [[4, 2, 0], [8.5, 3, 0], [14, 2.9, 0], [21, 2.1, 0], [27, 1, 0], [31, 0, 0]],
  hook: [[4, 1.8, 0], [9, 2.4, 0.8], [15, 2.4, 2.6], [21, 1.9, 5], [25.5, 1.1, 7.4], [28.5, 0, 9.4]],
  stiletto: [[4, 1.5, 0], [11, 1.4, 0], [22, 1.1, 0], [29.5, 0.75, 0], [32.5, 0.45, 0]],
};
/** Длина клинка от середины кулака до острия — конец оружия для зонда. */
const bladeTip = (L: LookSpec): [number, number] => {
  const s = BLADES[L.blade];
  return [s[s.length - 1][0], s[s.length - 1][2]];
};
/** Свет сцены на плоскости рисунка — сверху слева: по нему выбирается освещённая кромка клинка. */
const LIGHT2 = [-0.49, -0.87];
/**
 * Оси клинка под углом `a`: вдоль и поперёк — к врагам (x растёт), туда загибается крюк: у обоих клинков вогнутая
 * кромка смотрит на врагов, как коготь. У кривого клинка основание повёрнуто против загиба так, чтобы острие легло на
 * линию `a` (хорда — как у прямого клинка листа): без этого ближний крюк выпрямлялся в отвесную палку, а дальний
 * смотрел остриём вперёд, как нож прямым хватом.
 */
function bladeAxes(a: number, L: LookSpec): { u: number[]; n: number[] } {
  const side = Math.sin(a * DEG) > 0 ? -1 : 1;
  const [ts, tc] = bladeTip(L);
  const b = (a - (side * Math.atan2(tc, ts)) / DEG) * DEG;
  const u = [Math.cos(b), Math.sin(b)];
  const n = [-u[1] * side, u[0] * side];
  return { u, n };
}

function blade(p: Painter, m: Mats, L: LookSpec, x: number, y: number, a: number, part: string, tone: number): void {
  const { u, n } = bladeAxes(a, L);
  const q = (s: number, t: number): [number, number] => [x + u[0] * s + n[0] * t, y + u[1] * s + n[1] * t];
  const st = BLADES[L.blade];
  const one: number[] = [], two: number[] = [];
  for (const [s, w, c] of st) one.push(...q(s, c + w));
  for (let i = st.length - 1; i >= 0; i--) two.push(...q(st[i][0], st[i][2] - st[i][1]));
  p.poly([...one, ...two], m.blade, { part, bevel: 1, flat: 0.75, lift: 0.6, tone });
  // Кромка к свету — светлая черта по краю; дол — тёмная черта посередине у прямого кинжала.
  const lit = n[0] * LIGHT2[0] + n[1] * LIGHT2[1] > 0 ? 1 : -1;
  const edge: number[] = [];
  for (let i = 1; i < st.length - 1; i++) edge.push(...q(st[i][0], st[i][2] + lit * (st[i][1] - 0.6)));
  stroke(p, edge, m.edge, part);
  if (L.blade === 'dagger') stroke(p, [...q(6, 0), ...q(19, 0)], L.blades[1], part);
  if (L.blade === 'hook') {
    // Отрава — мутная полоса по кромке в тени (с другой стороны от светлой) и капля у острия.
    const smear: number[] = [];
    for (let i = 1; i < st.length - 1; i++) smear.push(...q(st[i][0], st[i][2] - lit * (st[i][1] - 0.7)));
    stroke(p, smear, L.poison[2], part);
    p.px(...q(st[st.length - 2][0] + 1, st[st.length - 2][2] - lit * 1.8), L.poison[2]);
  }
  // Гарда: у кинжала и крюка — перекладина поперёк, у стилета — круглая чашка.
  if (L.blade === 'stiletto') p.ellipse(...q(4, 0), 2.2, 2.2, m.steel, { part: `${part}Guard`, lift: 1, tone: tone - 0.05 });
  else p.limb(...q(4, -3.6), 1.1, ...q(4, 3.6), 1.1, L.blade === 'dagger' ? m.brass : m.steel, { part: `${part}Guard`, lift: 0.8, tone });
}

// ─── Головы ─────────────────────────────────────────────────────────────────

/**
 * Капюшон — контур в точках листа: большой, подан к врагам, затылок и спина закругляются к шарфу; объём — купол той же
 * части (без него многоугольник читался плоской шапкой, а тёмные складки поверх — рёбрами шлема). Проём — тень с
 * правой стороны капюшона (лицо к врагам): верх проёма — чёрная тень под козырьком, ниже узкая полоса кожи у глаз с
 * бликом на скуле, ещё ниже маска. Кромка проёма со стороны зрителя — черта ткани на ступень светлее.
 */
interface HoodSpec {
  outline: number[];
  /**
   * Светлая кромка капюшона вокруг проёма — полоса в два пикселя краской по капюшону (с листа: главный признак
   * капюшона). Штрих по самой границе проёма съедала линия между частями, и проём выходил обведённым чёрным — шлем.
   */
  lip: number[];
  /** Купол: центр и полуоси в точках листа. */
  dome: [number, number, number, number];
  face: number[];
  eyes: number[];
  /** Прищур — тёмная черта по полосе кожи, блик — светлая точка скулы. */
  eye: number[];
  glint: [number, number];
  mask: number[];
  rim: number[];
  folds: number[][];
}
const HOODS: Record<LookSpec['hoodKind'], HoodSpec> = {
  sheet: {
    lip: [101, 50, 100, 40, 104, 30, 110, 24, 118, 21, 127, 21, 126, 26.5, 120, 27.5, 114, 29.5, 109, 33, 105, 40, 105, 47],
    outline: [84, 47, 81, 40, 81, 32, 81, 26, 85, 21, 89, 17, 95, 14.5, 100, 13, 106, 12, 112, 12, 118, 14, 123, 18, 127, 22, 129, 26, 131, 30, 131, 35, 130, 40, 128, 46, 125, 52, 118, 56, 108, 58, 98, 55, 90, 51],
    dome: [103, 31, 21, 18],
    face: [118, 28, 123, 27, 126, 30, 127, 36, 126, 43, 124, 49, 121, 54, 116, 56, 108, 53, 105, 46, 106, 40, 110, 34, 113, 31],
    eyes: [109, 41, 113, 37, 119, 35, 124, 35.5, 124, 40, 118, 43, 111, 43.5],
    eye: [117, 38.5, 121, 38],
    glint: [121, 40],
    mask: [105, 44, 111, 43, 118, 43, 123, 41, 126, 40, 126, 47, 123, 53, 118, 56, 108, 53],
    rim: [105, 47, 105, 40, 109, 33, 114, 29.5, 120, 27.5, 126, 26.5],
    folds: [[98, 15, 91, 26, 88, 38]],
  },
  // Глубокий капюшон: козырёк выступает к врагам и нависает над лицом, проём ниже и уже — лицо в тени глубже.
  deep: {
    lip: [102, 50, 102, 42, 106, 35, 112, 31, 120, 29, 131, 29.5, 130, 34.5, 124, 33, 117, 34, 111, 37, 107, 42, 106, 47],
    outline: [84, 47, 81, 40, 81, 32, 81, 26, 85, 21, 89, 17, 95, 14.5, 101, 13, 107, 12.5, 113, 13.5, 119, 16, 125, 20, 130, 25, 133, 30, 135, 35, 135, 41, 133, 47, 129, 52, 124, 55, 118, 56, 108, 58, 98, 55, 90, 51],
    dome: [101, 30, 19, 17],
    face: [121, 34, 128, 34, 131, 37, 131, 43, 128, 49, 124, 54, 116, 56, 108, 53, 106, 47, 107, 42, 111, 38, 116, 35],
    eyes: [111, 42.5, 115, 40.5, 121, 39.5, 126, 40, 124, 42.5, 113, 43.5],
    eye: [115, 42, 122, 41],
    glint: [122, 42.5],
    mask: [106, 45, 112, 44, 120, 44, 126, 43, 130, 43, 129, 48, 125, 54, 118, 56, 108, 53],
    rim: [106, 47, 107, 42, 111, 37, 117, 34, 124, 33, 130, 34.5],
    folds: [[98, 15, 91, 26, 88, 38], [120, 17, 125, 23, 127, 30]],
  },
};

/** Клюв маски отравителя — от низа проёма вперёд и вниз, кончик ниже подбородка капюшона. */
const BEAK = [122, 41, 129, 41.5, 135, 44, 140, 48, 143, 54, 139, 55, 133, 53, 126, 54];

function drawHead(p: Painter, m: Mats, L: LookSpec): void {
  const H = HOODS[L.hoodKind];
  p.poly(S(...H.outline), m.hood, { part: 'hood', bevel: 5, flat: 0.25, lift: 2 });
  p.ellipse(X(H.dome[0]), Y(H.dome[1]), R(H.dome[2]), R(H.dome[3]), m.hood, { part: 'hood', lift: 3.5, flat: 0.15 });
  for (const f of H.folds) stroke(p, S(...f), L.hood[1], 'hood');
  p.poly(S(...H.lip), m.hood, { part: 'hood', paint: true, tone: 0.28 });
  // Проём: тень, полоса кожи у глаз с прищуром и бликом скулы; ниже маска.
  p.poly(S(...H.face), m.shade, { part: 'face', bevel: 1.5, flat: 0.8 });
  p.poly(S(...H.eyes), m.face, { part: 'face', paint: true, tone: 0.18 });
  stroke(p, S(...H.eye), m.skinDark, 'face');
  p.px(X(H.glint[0]), Y(H.glint[1]), L.skin[3]);
  if (L.maskKind === 'beak') {
    // Кожаная полумаска отравителя с коротким клювом-респиратором к врагам (травы от ядовитых паров): клюв клонится
    // вниз, по нему шов, у основания — ремешок. Глаза остаются в тени капюшона — у героя они не светятся.
    p.poly(S(...H.mask), m.maskLeather, { part: 'mask', bevel: 2, flat: 0.5, tone: -0.1 });
    p.poly(S(...BEAK), m.maskLeather, { part: 'mask', bevel: 2, lift: 1.5, flat: 0.3, tone: 0.02 });
    stroke(p, S(123, 44, 133, 45.5, 139, 50), PALE_LEATHER[1], 'mask');
    stroke(p, S(111, 53, 112, 44), PALE_LEATHER[1], 'mask');
  } else {
    p.poly(S(...H.mask), m.mask, { part: 'mask', bevel: 1.5, flat: 0.5, tone: L.maskKind === 'veil' ? -0.1 : 0 });
    // Складки ткани поперёк маски.
    stroke(p, S(109, 49, 119, 50, 127, 47), L.mask[0], 'mask');
  }
  stroke(p, S(...H.rim), L.hood[L.hoodKind === 'deep' ? 2 : 3], 'hood');
  // Ткань капюшона спереди — полутоном обрамляет проём: без неё проём доходил до края силуэта, и голова читалась
  // вязаной шапкой с балаклавой.
  if (L.hoodKind === 'sheet') stroke(p, S(125, 26, 128, 32, 128, 42, 126, 49, 123, 54), L.hood[2], 'hood');
}

// ─── Шея: шарф, пелерина ────────────────────────────────────────────────────

/**
 * Шарф листа: петля вокруг шеи поверх низа капюшона и правой стороны маски, концы закинуты на ближнее плечо (лежат
 * на накидке). Узкая лента (облик C) — та же петля вдвое уже, без концов на плече, низко на шее, под краем повязки: у
 * подбородка она читалась улыбкой поперёк лица.
 */
const SCARF_LOOP = [66, 39, 69, 36, 76, 35, 82, 38, 89, 43, 97, 50, 105, 55, 113, 57, 120, 54, 124, 48, 128, 46, 131, 51, 133, 58, 133, 64, 128, 68, 117, 70, 105, 71, 96, 67, 88, 60, 80, 52, 72, 45, 68, 43];
const SCARF_BAND = [84, 47, 90, 51, 97, 56, 105, 60, 113, 62, 120, 61, 124, 59, 127, 62, 127, 67, 122, 69, 114, 70, 106, 69, 98, 65, 90, 59, 84, 53];

function drawScarf(p: Painter, m: Mats, L: LookSpec): void {
  if (L.neck === 'loop') {
    p.poly(S(...SCARF_LOOP), m.scarf, { part: 'scarf', bevel: 3, flat: 0.3, lift: 1.5 });
    stroke(p, S(76, 40, 86, 47, 96, 56, 108, 63, 120, 62, 127, 56), m.scarfFold, 'scarf');
    stroke(p, S(68, 34, 80, 39, 90, 47, 102, 55), m.scarfLit, 'scarf');
    stroke(p, S(102, 68, 116, 68, 127, 63), m.scarfFold, 'scarf');
  } else if (L.neck === 'band') {
    p.poly(S(...SCARF_BAND), m.scarf, { part: 'scarf', bevel: 2.5, flat: 0.3, lift: 1.5 });
    stroke(p, S(90, 55, 100, 62, 112, 66, 121, 65, 125, 63), m.scarfFold, 'scarf');
  }
}

/** Накидка ближнего плеча — низ капюшона, лежит на плече и верхе руки; у облика B — рваная пелерина на оба плеча. */
const MANTLE = [47, 54, 49, 50, 52, 46, 56, 42, 60, 39, 65, 37, 71, 36, 78, 38, 86, 46, 84, 53, 76, 56, 67, 56, 58, 55, 50, 57];
const CAPELET_TOP = [58, 42, 64, 36, 72, 32, 80, 34, 90, 44, 100, 53, 112, 57, 124, 55, 132, 50, 137, 56];
const CAPELET_HEM = [136, 57, 134, 64, 124, 68, 112, 68, 98, 66, 86, 62, 74, 60, 62, 61, 52, 59, 46, 55];

function drawMantle(p: Painter, m: Mats, L: LookSpec): void {
  if (L.neck === 'capelet') {
    p.poly([...S(...CAPELET_TOP), ...ragged(S(...CAPELET_HEM), R(4), R(5), -1, 0)], m.mantle, { part: 'mantle', bevel: 4, flat: 0.3, lift: 2 });
    stroke(p, S(70, 40, 67, 57), m.hoodFold, 'mantle');
    stroke(p, S(92, 52, 90, 62), m.hoodFold, 'mantle');
    stroke(p, S(118, 60, 119, 66), m.hoodFold, 'mantle');
    stroke(p, S(62, 40, 76, 34, 88, 44), m.hoodLit, 'mantle');
    return;
  }
  // Без концов шарфа на плече (облик C) гладкая накидка с высоким куполом читалась латным наплечником — у неё рваный
  // низ, купол ниже и площе.
  const band = L.neck === 'band';
  p.poly(band ? [...S(...MANTLE.slice(0, 18)), ...ragged(S(85, 50, 76, 56, 66, 57, 56, 57, 48, 56), R(3.5), R(4.5), 1, 0)] : S(...MANTLE), m.mantle, { part: 'mantle', bevel: 4, flat: band ? 0.5 : 0.3, lift: band ? 1 : 2 });
  p.ellipse(X(62), Y(47), R(13), R(10), m.mantle, { part: 'mantle', lift: band ? 1 : 3, flat: band ? 0.5 : 0.25, rot: -0.4 });
  stroke(p, S(58, 43, 54, 56), m.hoodFold, 'mantle');
  stroke(p, S(68, 38, 64, 58), m.hoodFold, 'mantle');
  stroke(p, S(50, 50, 58, 42, 68, 37), m.hoodLit, 'mantle');
}

// ─── Поза ───────────────────────────────────────────────────────────────────

/**
 * Поза героя — поля как у Воина и Берсерка (docs/lepka-geroev.md «Каркас позы»), обе руки ведутся кистью: в каждой
 * по клинку обратным хватом. Координаты кистей — в координатах верха (до наклона `lean`), углы клинков — градусы по
 * `at` (0 — к врагам, 90 — вниз), наклоны — градусы, плюс к врагам.
 */
export interface AssassinPose extends Record<string, number> {
  x: number; y: number;
  crouch: number;
  lean: number;
  head: number;
  /** Ближняя рука (кинжал главный): кисть точкой и угол клинка. */
  nhx: number; nhy: number; nsw: number;
  /** Дальняя рука: кисть точкой и угол второго клинка. */
  fhx: number; fhy: number; fsw: number;
  footF: number; footN: number; liftF: number; liftN: number;
  /** Полы и набедренная полоса: 0 — висят, 1 — отнесены назад. */
  cape: number;
  /** Голова подаётся к врагам (взгляд), 0…1. */
  turn: number;
}

const REST: AssassinPose = {
  x: 0, y: 0, crouch: 0, lean: 0, head: 0,
  nhx: M.armN.hand[0], nhy: M.armN.hand[1], nsw: BLADE_N,
  fhx: M.armF.hand[0], fhy: M.armF.hand[1], fsw: BLADE_F,
  footF: 0, footN: 0, liftF: 0, liftN: 0, cape: 0, turn: 0,
};

/**
 * Ключи клипов — после выбора облика (шаг 4 рецепта). Пока их нет, любой клип рисует первый кадр покоя: лист не
 * ломается и не выходит за край.
 */
const CLIPS: Partial<Record<SculptClip, PoseKeys<AssassinPose>>> = {};

interface ArmSolve { sx: number; sy: number; ex: number; ey: number; hx: number; hy: number; a1: number; a2: number }

/**
 * Рука кистью в точке (tx, ty) от плеча (sx, sy): локоть — ik по ту же сторону от линии плечо — кисть, что в стойке
 * (обе руки листа чуть согнуты локтем наружу-вверх); кисть не дальше длины руки.
 */
function reachArm(sx: number, sy: number, tx: number, ty: number, l1: number, l2: number): ArmSolve {
  const vx = tx - sx, vy = ty - sy, d = Math.hypot(vx, vy), reach = l1 + l2 - 0.05;
  if (d > reach) {
    tx = sx + (vx * reach) / d;
    ty = sy + (vy * reach) / d;
  }
  const [ex, ey] = ik(sx, sy, tx, ty, l1, l2, -vy, vx);
  return { sx, sy, ex, ey, hx: tx, hy: ty, a1: Math.atan2(ey - sy, ex - sx) / DEG, a2: Math.atan2(ty - ey, tx - ex) / DEG };
}
const nearArm = (P: AssassinPose): ArmSolve => reachArm(M.armN.sh[0], M.armN.sh[1], P.nhx, P.nhy, ARM_N.l1, ARM_N.l2);
const farArm = (P: AssassinPose): ArmSolve => reachArm(M.armF.sh[0], M.armF.sh[1], P.fhx, P.fhy, ARM_F.l1, ARM_F.l2);

/**
 * Покой: лёгкое дыхание — верх с капюшоном поднимается на пиксель, таз оседает на четверть цикла позже, раз за цикл
 * вес переходит с ноги на ногу; стопы стоят, колени в малых сдвигах идут за тазом (урок Паладина). Руки не приклеены
 * к корпусу: кисти повторяют 40 % его движения, клинки качаются маятником ±1,5° вразнобой (при ±2,5° мерцал блик кромки); раз за цикл голова
 * подаётся к врагам — высматривает цель; полы колышутся. Сдвиги — целыми пикселями.
 */
function idlePose(p: Painter): AssassinPose {
  const P = { ...REST };
  P.crouch += p.bob(1.5, 2, 0.25);
  P.x += p.snap(1.2 * p.wave(1, 0.3));
  const bodyX = P.x, bodyY = P.crouch - p.bob(2, 2);
  P.nhx -= 0.6 * bodyX;
  P.nhy -= 0.6 * bodyY;
  P.fhx -= 0.6 * bodyX;
  P.fhy -= 0.6 * bodyY;
  // Рука почти прямая (сгиб 165° и 174°), и у предела длины ik неустойчив: сдвиг кисти на 60 % движения корпуса гонял
  // локоть на 4 пикселя. Длина плечо — кисть держится как в стойке, кисть качается вокруг плеча — сгиб постоянный.
  const keep = (sh: readonly number[], hand: readonly number[], x: number, y: number): [number, number] => {
    const l0 = Math.hypot(hand[0] - sh[0], hand[1] - sh[1]), a = Math.atan2(y - sh[1], x - sh[0]);
    return [sh[0] + l0 * Math.cos(a), sh[1] + l0 * Math.sin(a)];
  };
  [P.nhx, P.nhy] = keep(M.armN.sh, M.armN.hand, P.nhx, P.nhy);
  [P.fhx, P.fhy] = keep(M.armF.sh, M.armF.hand, P.fhx, P.fhy);
  P.nsw += 1.5 * p.wave(1, 0.45);
  P.fsw += 1.5 * p.wave(1, 0.7);
  P.turn = p.blink(0.62, 0.16);
  // Взгляд: голова подаётся к врагам и чуть клонится — один сдвиг без кивка читался «курицей».
  P.head += 2.5 * P.turn;
  P.cape = 0.5 - 0.5 * p.wave(1, 0.25);
  return P;
}

/** Поза кадра: ключи клипа поверх покоя в фазе 0 или сам покой. */
function framePose(p: Painter): AssassinPose {
  const base = idlePose(p);
  const c = clipAt(p);
  if (!c) return base;
  const keys = CLIPS[c.clip];
  return keys ? poseAt(base, keys, c.f, c.n, HERO_CLIPS[c.clip].hold) : base;
}

/** Зонд: таз, кисть с ближним кинжалом, острие, стопы, суставы ближней руки; второй клинок — полями `f*`. */
export const assassinProbe: HeroProbe = { grounded: [] };

// ─── Рисунок ────────────────────────────────────────────────────────────────

/**
 * Сапоги — контуры листа от щиколотки (разница в точках листа): ближний носком наружу (влево), дальний — к врагам.
 * Низ — 174: под последним рядом точек листа, на земле.
 */
const BOOT_N = [-13, 15, -16, 10, -15, 4, -10, 0, -4, -2, 3, -3, 9, -2, 10, 3, 10, 11, 7, 15];
const BOOT_F = [-13, 17, -15, 9, -13, 2, -8, -1, 1, -2, 9, -1, 15, 3, 21, 5, 25, 8, 26, 13, 23, 17];

/**
 * Низ — контуры листа: короткая ближняя пола куртки по верху бедра, конец кушака по ближнему бедру, набедренная полоса
 * спереди, задние полотнища между ног. Длинные рваные полы облика C — в рисунке (ветка `ragged`).
 */
const HEM_N = [56, 94, 80, 96, 84, 104, 70, 111, 56, 118, 42, 125, 32, 131, 29, 127, 35, 117, 43, 107, 50, 100];
const SASH = [84, 98, 80, 105, 70, 111, 56, 118, 42, 125, 29, 133, 30, 138, 43, 133, 57, 126, 71, 119, 81, 113, 87, 105];
const LOIN = [84, 96, 100, 96, 99, 110, 97, 124, 94, 136, 90, 143, 87, 135, 85, 123, 84, 110];
const BACK = [72, 106, 116, 106, 116, 126, 114, 142, 108, 138, 104, 143, 99, 137, 90, 143, 82, 138, 76, 143, 72, 126];

function drawAssassin(p: Painter, P: AssassinPose, m: Mats, L: LookSpec): void {
  const breath = p.bob(2, 2);
  const hipX = PELVIS[0];
  const hipY = PELVIS[1] + P.crouch;
  const rot = P.lean * DEG;
  const up = { dx: hipX - PELVIS[0], dy: hipY - PELVIS[1] - breath, rot, px: PELVIS[0], py: PELVIS[1] };
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const toWorld = (x: number, y: number): [number, number] =>
    [PELVIS[0] + cr * (x - PELVIS[0]) - sr * (y - PELVIS[1]) + up.dx, PELVIS[1] + sr * (x - PELVIS[0]) + cr * (y - PELVIS[1]) + up.dy];
  const na = nearArm(P), fa = farArm(P);
  const feet: Record<string, number> = {};

  p.pose({ dx: P.x, dy: P.y }, () => {
    p.shadow(X(84) - P.x * 0.5, 56, 4);

    // ── Ноги: бедро от таза, колено — ik в больших сдвигах (шаг), в покое идёт за тазом наполовину; стопы стоят.
    //    Штаны тёмного сукна, наколенник, голень в обмотках, сапог. Дальняя (к врагам) — раньше и темнее. ──
    const legs = [
      { g: M.legF, L2: LEG_F, side: 'far', tone: -0.2, boot: BOOT_F, bend: [1, -0.2], foot: P.footF, lift: P.liftF, out: 1, shin: m.shinF, bootM: m.bootF, pad: m.padF },
      { g: M.legN, L2: LEG_N, side: 'near', tone: 0, boot: BOOT_N, bend: [-0.6, -1], foot: P.footN, lift: P.liftN, out: -1, shin: m.shinN, bootM: m.bootN, pad: m.padN },
    ] as const;
    for (const lg of legs) {
      const dhx = hipX - PELVIS[0], dhy = hipY - PELVIS[1];
      const hx = lg.g.hip[0] + dhx, hy = lg.g.hip[1] + dhy;
      const floor = lg.g.ank[1] - P.y;
      let ax = lg.g.ank[0] + lg.foot - P.x, ay = floor - lg.lift;
      const { l1, l2 } = lg.L2;
      const dax = ax - lg.g.ank[0], day = ay - lg.g.ank[1];
      const big = Math.max(Math.hypot(dhx, dhy), Math.hypot(dax, day));
      const w = Math.max(0, Math.min(1, (big - 3) / 4));
      if (w > 0) [ax, ay] = reachFoot(hx, hy, ax, ay, l1 + l2 - 0.2);
      const toe = (w * Math.max(0, floor - ay)) / 16;
      const [ikx, iky] = ik(hx, hy, ax, ay, l1, l2, lg.bend[0], lg.bend[1]);
      const kx = lerp(lg.g.knee[0] + (dhx + dax) / 2, ikx, w), ky = lerp(lg.g.knee[1] + (dhy + day) / 2, iky, w);
      feet[lg.side === 'far' ? 'footF' : 'footN'] = ax + P.x;
      const far = lg.side === 'far';
      const leg = `${lg.side}Leg`, foot = `${lg.side}Foot`, knee = `${lg.side}Knee`;
      const tone = lg.tone;
      // Бедро в сукне — толстое, голень уже, в обмотках: тёмные щели и светлые края лент поперёк.
      const baggy = L.skirt === 'ragged' ? 0 : 1.5;
      p.limb(hx, hy, R((far ? 11.5 : 11) + baggy), kx, ky, R(9.5 + baggy * 0.5), m.pants, { part: leg, tone: tone + 0.06, flat: 0.3 });
      // Складки штанов: тёмная — вдоль нижней стороны бедра, светлая — по верхней.
      const ta = Math.atan2(ky - hy, kx - hx) / DEG, tl = Math.hypot(kx - hx, ky - hy);
      const on = (f: number, off: number): [number, number] => at(...at(hx, hy, ta, tl * f), ta + 90 * lg.out, off);
      stroke(p, [...on(0.25, R(5)), ...on(0.7, R(3))], m.fold, leg);
      stroke(p, [...on(0.2, -R(6)), ...on(0.55, -R(6.5))], L.pants[4], leg);
      p.limb(kx, ky, R(far ? 10 : 9), ax, ay, R(far ? 8.5 : 7.5), lg.shin, { part: leg, tone: tone + 0.04, flat: 0.3 });
      const sa = Math.atan2(ay - ky, ax - kx) / DEG, sl = Math.hypot(ax - kx, ay - ky);
      for (let k = 0; k < 4; k++) {
        const [cx, cy] = at(kx, ky, sa, sl * (0.3 + k * 0.17));
        const r = R(far ? 9.5 : 8.5) - k * 0.35;
        stroke(p, [...at(cx, cy, sa - 90, r), ...at(cx, cy, sa + 90 - 18, r)], m.wrapGap, leg);
        if (k % 2 === 0) stroke(p, [...at(cx, cy, sa - 90, r * 0.8), ...at(cx, cy - 1.2, sa + 90 - 18, r * 0.5)], m.wrapLit, leg);
      }
      // Сапог: подошва на земле, отворот сверху, ремешок; оторванная пятка — поворот вокруг щиколотки.
      p.pose({ rot: toe * lg.out * 0.9, px: ax, py: ay }, () => {
        const b: number[] = [];
        for (let k = 0; k < lg.boot.length; k += 2) b.push(ax + R(lg.boot[k]), toe > 0.02 ? ay + R(lg.boot[k + 1]) : Math.min(G, ay + R(lg.boot[k + 1])));
        p.poly(b, lg.bootM, { part: foot, bevel: 3, tone: tone - 0.02 });
        stroke(p, far ? [ax - R(14), ay + R(1), ax + R(8), ay - R(1)] : [ax - R(12), ay + R(2), ax + R(10), ay + R(1)], m.seam, foot);
        stroke(p, far ? [ax + R(8), ay + R(3), ax + R(20), ay + R(9)] : [ax - R(16), ay + R(7), ax - R(9), ay + R(3)], m.wrapLit, foot);
      });
      // Наколенник — пластина кожи поверх стыка бедра и голени, чуть к зрителю.
      const ka = Math.atan2(ky - hy, kx - hx);
      p.ellipse(kx + (far ? R(3) : R(5)), ky, R(far ? 11 : 9), R(far ? 8.5 : 8), lg.pad, { part: knee, lift: 1.4, flat: 0.4, tone: tone + 0.04, rot: ka + Math.PI / 2 });
      stroke(p, [kx - R(far ? 8 : 6), ky + R(3), kx + R(far ? 9 : 7), ky + R(2)], m.seam, knee);
    }

    // ── Верх: дыхание поднимает торс, голову и руки; наклон — в клипах. ──
    p.pose(up, () => {
      // Дальняя рука: плечо в рукаве куртки за туловищем, ниже рукава — кожа, дальше предплечье в обмотках.
      const fu = (f: number): [number, number] => at(fa.sx, fa.sy, fa.a1, len([fa.sx, fa.sy], [fa.ex, fa.ey]) * f);
      p.limb(fa.sx, fa.sy, R(10.5), ...fu(0.55), R(9.5), m.sleeve, { part: 'farSleeve', tone: -0.1, flat: 0.35 });
      p.limb(...fu(0.5), R(7.5), fa.ex, fa.ey, R(7), m.skinF, { part: 'farArm', tone: -0.04, lift: 1, flat: 0.4 });

      // Туловище — куртка: грудь и живот одной частью; ремень наискось от ближнего плеча к дальнему бедру.
      p.poly(S(62, 58, 68, 49, 80, 46, 92, 53, 104, 61, 117, 60, 117, 68, 112, 77, 109, 88, 100, 92, 76, 93, 58, 92, 61, 80, 63, 68), m.coat, { part: 'torso', bevel: 5, lift: 1.5, flat: 0.25 });
      p.poly(S(104, 62, 117, 60, 117, 68, 112, 77, 109, 88, 103, 86, 105, 74), m.coat, { part: 'torso', paint: true, tone: -0.22 });
      p.ellipse(X(84), Y(70), R(20), R(15), m.coat, { part: 'torso', lift: 2.5, flat: 0.3, rot: -0.3 });
      stroke(p, S(76, 64, 80, 78, 82, 90), m.fold, 'torso');
      stroke(p, S(66, 60, 64, 76, 64, 88), m.fold, 'torso');
      if (L.gear !== 'flasks') {
        p.poly(S(66, 56, 72, 54, 114, 84, 110, 89), m.belt, { part: 'torso', paint: true });
        stroke(p, S(69, 55, 112, 86), L.leather[4], 'torso');
      }

      // Полы и набедренная полоса. Лист: бёдра в широких штанах, спереди полоса, между ног — задние полотнища, по
      // ближнему бедру лежит конец кушака (облик A). Длинные рваные полы куртки поверх бёдер — крой облика C.
      const tf = p.snap(1.5 * P.cape);
      const sway = (pts: number[]): number[] => pts.map((v, i) => (i % 2 ? v : v - tf * Math.max(0, Math.min(1, (pts[i + 1] - Y(100)) / (Y(140) - Y(100))))));
      // Задние полотнища — цветом ткани, не красным: красное пятно в паху сливалось с клином в прямоугольник-фартук.
      p.poly(sway(S(...BACK)), m.skirtF, { part: 'clothBack', bevel: 2, tone: -0.32 });
      if (L.skirt === 'ragged') {
        p.poly(sway([...S(98, 94, 110, 90, 118, 95, 128, 102, 136, 108, 141, 115, 144, 119), ...ragged(S(144, 121, 126, 121, 104, 111), R(5), R(5), 1, 0)]), m.skirtF, { part: 'skirtF', bevel: 2.5, tone: -0.12 });
        p.poly(sway([...S(56, 94, 84, 96, 84, 108), ...ragged(S(84, 110, 56, 122, 29, 136), R(5), R(5), 1, 0), ...S(33, 119, 41, 108, 50, 100)]), m.skirtN, { part: 'skirtN', bevel: 2.5 });
        stroke(p, sway(S(118, 94, 136, 112)), m.fold, 'skirtF');
        stroke(p, sway(S(62, 98, 44, 118)), m.fold, 'skirtN');
      } else {
        // Ближняя пола куртки — короткая, по верху бедра (на листе бедро под ней шире у таза); у облика A по её краю —
        // конец кушака.
        p.poly(sway(S(...HEM_N)), m.skirtN, { part: 'skirtN', bevel: 2.5 });
        stroke(p, sway(S(62, 98, 46, 112)), m.fold, 'skirtN');
        if (L.skirt === 'trim') {
          p.poly(sway(S(...SASH)), m.accent, { part: 'trim', bevel: 1.5, tone: 0.04 });
          stroke(p, sway(S(80, 104, 62, 116, 40, 128)), L.accent[1], 'trim');
        }
      }
      if (L.skirt === 'tasset') {
        // Набедренная полоса клином, как красная у листа, — ткань с кожаной кромкой и двумя заклёпками у пояса.
        // Прямоугольная кожаная пластина читалась кошелём, кожаный клин с заклёпкой внизу — висящими ножнами.
        p.poly(sway(S(...LOIN)), m.skirtN, { part: 'cloth', bevel: 2.2, tone: -0.04 });
        stroke(p, sway(S(85, 97, 85, 110, 86, 123, 88, 134)), L.leather[3], 'cloth');
        stroke(p, sway(S(99, 97, 98, 110, 96, 123, 93, 134)), L.leather[2], 'cloth');
        for (const [x, y] of [[88, 100], [96, 100]]) p.px(X(x), Y(y), m.stud);
      } else {
        const hem = L.skirt === 'ragged' ? [...S(83, 96, 101, 96, 103, 118), ...ragged(S(102, 134, 82, 134), R(6), R(4), 1, 0), ...S(81, 118)] : S(...LOIN);
        p.poly(sway(hem), L.skirt === 'trim' ? m.accent : m.skirtN, { part: 'cloth', bevel: 2.2, tone: L.skirt === 'trim' ? 0 : -0.06 });
        stroke(p, sway(L.skirt === 'trim' ? S(89, 100, 89, 130) : S(88, 100, 87, 134)), L.skirt === 'trim' ? L.accent[1] : m.fold, 'cloth');
        stroke(p, sway(L.skirt === 'trim' ? S(95, 100, 94, 126) : S(96, 100, 97, 130)), L.skirt === 'trim' ? L.accent[1] : m.fold, 'cloth');
      }

      // Пояс; у облика A — кошели и латунная пряжка, у B — склянки, у C — простая пряжка.
      p.poly(S(58, 85, 76, 83, 96, 82, 110, 84, 111, 93, 96, 95, 76, 95, 56, 94), m.belt, { part: 'belt', bevel: 1.8 });
      stroke(p, S(58, 86.5, 96, 83.5, 110, 85.5), L.leather[3], 'belt');
      drawGear(p, m, L);

      // Дальнее предплечье в обмотках, второй клинок и кулак — снаружи от корпуса, поверх дальней полы.
      drawForearm(p, m, L, fa, 'far', P.fsw);

      // Ближняя рука — поверх туловища: плечо в обмотках той же частью, что предплечье (без шва на локте), с внутренней
      // стороны под накидкой — кожа, как на листе; предплечье в обмотках, кинжал, кулак.
      const nu = (f: number, off = 0): [number, number] => at(...at(na.sx, na.sy, na.a1, len([na.sx, na.sy], [na.ex, na.ey]) * f), na.a1 - 90, off);
      p.limb(na.sx, na.sy, R(10), na.ex, na.ey, R(9), m.wrapN, { part: 'nearWrap', lift: 1, flat: 0.35 });
      p.ellipse(...nu(0.4, R(2.5)), R(10), R(8.5), m.wrapN, { part: 'nearWrap', lift: 2, flat: 0.35, rot: na.a1 * DEG });
      for (const f of [0.3, 0.62]) stroke(p, [...nu(f, -R(10)), ...nu(f + 0.05, R(1))], m.wrapGap, 'nearWrap');
      drawForearm(p, m, L, na, 'near', P.nsw);
      // Кожа — после предплечья (та же часть): иначе его купол у локтя закрывал просвет между накидкой и обмоткой.
      p.poly([...nu(0.3, R(1)), ...nu(0.3, R(10)), ...nu(0.78, R(9)), ...nu(0.8, R(2))], m.skinN, { part: 'nearWrap', paint: true, tone: 0.04 });

      // Накидка плеча (или пелерина) поверх верха руки; голова; шарф поверх низа капюшона и маски.
      drawMantle(p, m, L);
      p.pose({ dx: p.snap(1.5 * P.turn), rot: P.head * DEG, px: M.neck[0], py: M.neck[1] }, () => drawHead(p, m, L));
      drawScarf(p, m, L);
    });

    if (assassinProbe.on) {
      const [tx, tt] = bladeTip(L);
      const tipAt = (a: ArmSolve, sw: number): [number, number] => {
        const { u, n } = bladeAxes(sw, L);
        return toWorld(a.hx + u[0] * tx + n[0] * tt, a.hy + u[1] * tx + n[1] * tt);
      };
      const nrm = (v: number): number => { v = ((v % 360) + 360) % 360; return v > 180 ? v - 360 : v; };
      const [hwx, hwy] = toWorld(na.hx, na.hy), [twx, twy] = tipAt(na, P.nsw);
      const [swx, swy] = toWorld(na.sx, na.sy), [ewx, ewy] = toWorld(na.ex, na.ey), [bwx, bwy] = toWorld(...at(na.hx, na.hy, P.nsw, -4));
      const [fhx, fhy] = toWorld(fa.hx, fa.hy), [ftx, fty] = tipAt(fa, P.fsw);
      assassinProbe.on({
        ...feet, hipX: hipX + P.x, hipY: hipY + P.y, handX: hwx + P.x, handY: hwy + P.y, tipX: twx + P.x, tipY: twy + P.y, ground: G,
        shX: swx + P.x, shY: swy + P.y, elX: ewx + P.x, elY: ewy + P.y, butX: bwx + P.x, butY: bwy + P.y,
        wrist: nrm(P.nsw - na.a2), elbow: 180 - Math.abs(nrm(na.a2 - na.a1)),
        fHandX: fhx + P.x, fHandY: fhy + P.y, fTipX: ftx + P.x, fTipY: fty + P.y, fElbow: 180 - Math.abs(nrm(fa.a2 - fa.a1)),
      });
    }
  });
}

/**
 * Предплечье в кожаных обмотках от локтя до запястья (ленты — тёмные щели и светлые края поперёк), кинжал обратным
 * хватом и кулак поверх рукояти: клинок выходит из-под мизинца и продолжает линию предплечья.
 */
function drawForearm(p: Painter, m: Mats, L: LookSpec, a: ArmSolve, side: 'near' | 'far', sw: number): void {
  const far = side === 'far';
  // Дальняя рука заметно темнее ближней, как на листе (при −0,08 обмотка и кулак были светлы почти как ближние).
  const part = `${side}Wrap`, tone = far ? -0.16 : 0;
  const wrap = far ? m.wrapF : m.wrapN;
  const fa = a.a2, fl = len([a.ex, a.ey], [a.hx, a.hy]);
  const [wx, wy] = at(a.ex, a.ey, a.a1 + 180, R(1.5));
  // Дальнее толще: её нижний край уходит в тень, и при том же радиусе рука выходила на треть тоньше листа.
  p.limb(wx, wy, R(far ? 10 : 9), ...at(a.ex, a.ey, fa, fl * 0.9), R(far ? 9 : 8), wrap, { part, tone, flat: 0.35, lift: 1 });
  for (let k = 0; k < 5; k++) {
    const [cx, cy] = at(a.ex, a.ey, fa, fl * (0.02 + k * 0.19));
    const r = R(9.2) - k * 0.3;
    stroke(p, [...at(cx, cy, fa - 90, r), ...at(cx, cy, fa + 90 - 20, r)], m.wrapGap, part);
    if (k % 2) stroke(p, [...at(cx, cy, fa - 90, r * 0.85), ...at(cx - 0.8, cy - 0.8, fa + 90 - 20, r * 0.4)], m.wrapLit, part);
  }
  if (far) {
    // Локоть дальней руки — кожа в прорехе рукава, как на листе: иначе рука начиналась шаром обмотки из-под шарфа.
    const q = (f: number, off: number): [number, number] => at(...at(a.ex, a.ey, fa, fl * f), fa - 90, off);
    p.poly([...q(-0.05, -R(1)), ...q(-0.05, -R(9)), ...q(0.18, -R(9)), ...q(0.14, -R(1))], m.skinF, { part, paint: true, tone: -0.14 });
  }
  blade(p, m, L, a.hx, a.hy, sw, `${side}Blade`, far ? -0.16 : 0);
  // Кулак: шире предплечья, лента обмотки через тыльную сторону; пальцы обхватили рукоять — ряд костяшек поперёк
  // клинка у его корня, щели между ними, навершие под большим пальцем. Черты пальцев вдоль предплечья читались шариком.
  const r = R(8.2), skin = far ? m.skinF : m.skinN;
  p.ellipse(a.hx, a.hy, r * 1.15, r * 0.82, skin, { part: `${side}Fist`, lift: 1.2, tone: tone - 0.04, rot: (fa + 90) * DEG });
  const ux = Math.cos(fa * DEG), uy = Math.sin(fa * DEG), nx = -uy, ny = ux;
  p.poly([a.hx - ux * r * 0.55 + nx * r * 1.1, a.hy - uy * r * 0.55 + ny * r * 1.1, a.hx - ux * r * 0.05 + nx * r * 1.1, a.hy - uy * r * 0.05 + ny * r * 1.1, a.hx - ux * r * 0.05 - nx * r * 1.1, a.hy - uy * r * 0.05 - ny * r * 1.1, a.hx - ux * r * 0.55 - nx * r * 1.1, a.hy - uy * r * 0.55 - ny * r * 1.1], wrap, { part: `${side}Fist`, paint: true, tone });
  const bu = [Math.cos(sw * DEG), Math.sin(sw * DEG)], bn = [-bu[1], bu[0]];
  const on = (s: number, t: number): [number, number] => [a.hx + bu[0] * r * s + bn[0] * r * t, a.hy + bu[1] * r * s + bn[1] * r * t];
  for (const t of [-0.6, -0.2, 0.2, 0.6]) p.ellipse(...on(0.5, t), r * 0.24, r * 0.3, skin, { part: `${side}Fist`, lift: 0.7, tone: tone + 0.1, rot: sw * DEG });
  for (const t of [-0.4, 0, 0.4]) stroke(p, [...on(0.3, t), ...on(0.72, t)], m.skinDark, `${side}Fist`);
  p.ellipse(...on(-0.8, 0), 1.4, 1.4, m.steel, { part: `${side}Pommel`, lift: 0.8, tone: tone - 0.05 });
}

/** Снаряжение на поясе и перевязи: кошели (A), склянки с отравой (B), метательные ножи (C). */
function drawGear(p: Painter, m: Mats, L: LookSpec): void {
  if (L.gear === 'pouches') {
    p.poly(S(63, 86, 76, 85, 77, 96, 71, 99, 63, 97), m.pouch, { part: 'pouch', bevel: 2.2, lift: 1 });
    stroke(p, S(63, 90, 77, 89), m.seam, 'pouch');
    p.poly(S(100, 87, 109, 86, 110, 95, 105, 97, 100, 95), m.pouch, { part: 'pouchF', bevel: 2, lift: 1, tone: -0.08 });
    stroke(p, S(100, 90, 110, 89), m.seam, 'pouchF');
    p.poly(S(90, 84, 96, 84, 96, 91, 90, 91), m.brass, { part: 'buckle', bevel: 1, lift: 0.8, tone: -0.15 });
    p.px(...P(69, 92), m.stud);
    return;
  }
  if (L.gear === 'flasks') {
    // Перевязь со склянками поперёк груди, две склянки на поясе; отрава мутная, не светится.
    p.poly(S(66, 56, 72, 54, 114, 84, 110, 89), m.belt, { part: 'strap', bevel: 1 });
    stroke(p, S(69, 55, 112, 86), L.leather[4], 'strap');
    for (const f of [0.25, 0.5, 0.75]) {
      const [x, y] = P(lerp(69, 112, f), lerp(55, 86, f));
      p.limb(x, y + 1.2, 1.9, x, y - 2.4, 1.5, m.glass, { part: `vial${f}`, lift: 0.8 });
      p.px(x, y - 3.4, L.leather[3]);
      p.px(x - 0.6, y - 0.6, L.poison[3]);
    }
    for (const [x, y] of [[68, 92], [105, 91]] as const) {
      const [cx, cy] = P(x, y);
      p.ellipse(cx, cy + 1.2, 3, 3.2, m.glass, { part: `flask${x}`, lift: 1.2 });
      p.limb(cx, cy - 1.5, 1.3, cx, cy - 4.4, 1.2, m.glass, { part: `flask${x}`, lift: 0.6 });
      p.px(cx, cy - 5, L.leather[3]);
      p.px(cx - 1.2, cy + 0.3, L.poison[3]);
    }
    p.poly(S(89, 83, 96, 83, 96, 91, 89, 91), m.brass, { part: 'buckle', bevel: 1, lift: 1 });
    return;
  }
  // Метательные ножи — три рукояти с навершиями торчат из перевязи; на поясе — простая пряжка.
  for (const f of [0.28, 0.5, 0.72]) {
    const [x, y] = P(lerp(69, 112, f), lerp(55, 86, f));
    p.limb(x - 1, y + 1.4, 1, x + 0.6, y - 3.6, 0.9, m.steel, { part: `knife${f}`, lift: 0.6 });
    p.px(x + 0.8, y - 4.4, L.steel[4]);
  }
  p.poly(S(89, 83, 96, 83, 96, 91, 89, 91), m.steel, { part: 'buckle', bevel: 1, lift: 1 });
}

// ─── Модель ─────────────────────────────────────────────────────────────────

/**
 * Временная аватарка — поза покоя в кадре бюста (капюшон, шарф, кулак с кинжалом у края), фон — с прежнего портрета:
 * лиловое небо, луна за капюшоном, шпили по краям. Шлифуется на шаге 5 рецепта.
 */
function avatarOf(m: Mats, L: LookSpec): AvatarSpec {
  return {
    draw: (p) => drawAssassin(p, REST, m, L),
    crop: [40, -8, 72],
    halo: [74, 12, 20],
    colors: { top: '#421e4e', bottom: '#12071a', halo: '#5a2a64', haloEdge: '#7a3c86', skyline: '#1a0b20', frameDark: '#0c0510', frame: '#381943', frameLight: '#5e2c6a' },
    skyline: [[0.05, 0.06, 0.55, 0.26], [0.13, 0.05, 0.42, 0.2], [0.88, 0.06, 0.6, 0.28], [0.96, 0.05, 0.48, 0.2]],
  };
}

/** Ассасин в облике `look`; рост в покое — `HERO_BODY_HEIGHT.assassin` (120) в пикселе `HERO_PIXEL`. */
export function assassinModel(look: AssassinLook = ASSASSIN_RECOMMENDED): HeroModel {
  const L = LOOKS[look];
  const m = matsOf(L);
  return {
    id: 'assassin',
    avatar: avatarOf(m, L),
    probe: assassinProbe,
    w: 132,
    h: 128,
    ground: G,
    pad: 80,
    draw: (p: Painter) => drawAssassin(p, framePose(p), m, L),
  };
}

