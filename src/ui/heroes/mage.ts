import { type Mat, type Painter } from '../mobs/pixel';
import type { AvatarSpec } from './avatar';
import type { HeroModel, HeroProbe } from './model';
import { clipAt, HERO_CLIPS, poseAt, type PoseKeys, type SculptClip } from './clips';
import { at, DEG, ik, lerp, solid, stroke } from './rig';

/**
 * Маг пиксельной лепкой — шаги 1–3 рецепта docs/lepka-geroev.md: мерки с прежнего листа, модель в стойке с покоем
 * и три облика одной лепкой на выбор пользователя (A «С листа», B «Звездочёт», C «Отшельник»). Клипов ещё нет: все
 * клипы, кроме покоя, рисуют первый кадр покоя. В `HERO_MODELS` модели нет — игра и тесты её не видят, инструменты
 * находят по имени файла (`mageModel(look)`).
 *
 * Референс — прежний рисованный лист `src/assets/heroes/mage.png` (ячейка 186, ряды idle, battle, attack, power,
 * block, hurt, death), мерки — первый кадр ряда `battle`: непрозрачная фигура x 23…153, y 53…155, язык пламени над
 * посохом — до y 51. Контуры частей обведены по этому кадру в точках листа и переводятся в единицы поля функциями
 * `X`, `Y`, `S` (k = 117 / 105: 105 точек от верха пламени до земли — рост 117, с вдохом и контуром — 120); в коде стоят числа листа, чтобы сверку можно было
 * повторить по сетке. Урок Паладина — «анатомия на глаз»: с листа сняты контуры каждой части, а не только суставы.
 *
 * Что на листе: высокий остроконечный капюшон, макушка заломлена назад; лицо в тени — на свету только спинка носа и
 * скула, низ лица под тёмной маской (как на прежнем портрете); капюшон переходит в воротник-капюшон клином на груди;
 * короткая пелерина на плечах и длинный плащ, который уходит от ближнего плеча назад-вниз почти до земли; ряса
 * в три слоя — нижняя до земли, верхняя с острыми клиньями подола, посередине узкий палантин от пряжки; пояс с круглой
 * пряжкой, кошель у ближнего бедра; сапоги из-под подола. Посох — в ДАЛЬНЕЙ руке, как на листе (все семь рядов):
 * рукав-колокол вытянут к врагам, кулак у края рукава, древко наклонено к врагам, наверху — открытое кольцо-крюк
 * с синим пламенем. Ближняя рука свободна: кулак выглядывает из-под плаща у бедра (в ряду удара он поднимается).
 * В плане по героям стояло наоборот («дальняя рука — свободная кисть заклинаний»): лист держит посох дальней — вопрос
 * пользователю в отчёте.
 *
 * Смотрит вправо, на врагов. Ближняя сторона — левая (плащ, кошель, свободный кулак поверх рясы), дальняя — правая
 * (рука с посохом, её рукав под пелериной). Свет общий с врагами — сверху слева, из-за спины героя.
 *
 * Порядок вызовов фигур не переставлять без нужды: зерно фактуры материала зависит от того, каким по счёту
 * материал встретился в кадре (`Painter`); число фигур в кадре покоя постоянно — иначе фактура «кипит».
 */

// ─── Облики ─────────────────────────────────────────────────────────────────

export type MageLook = 'a' | 'b' | 'c';

/** Облики на обсуждении: одна лепка и мерки листа, меняются голова, посох, кромки, пояс и палитра. */
export const MAGE_LOOKS: readonly { id: MageLook; name: string; note: string }[] = [
  {
    id: 'a',
    name: 'С листа',
    note: 'Палитра и детали листа, приглушённые под сцену: сине-лиловая ряса с бронзовой кромкой, капюшон с заломленной макушкой, деревянный посох с кольцом-крюком и синим пламенем, кошель у бедра.',
  },
  {
    id: 'b',
    name: 'Звездочёт',
    note: 'Полуночная ряса почти в чёрное, серебро кромок, фестоны на пелерине, звезда на капюшоне и застёжке; железный посох с полумесяцем и холодной звездой вместо пламени, у бедра вместо кошеля — тубус звёздных карт.',
  },
  {
    id: 'c',
    name: 'Отшельник',
    note: 'Мешковина цвета пепла и золы без металла, рваные края капюшона и подола, седая борода из тени; посох — узловатый корень, корни держат кристалл с бледным бирюзовым светом, на верёвочном поясе — книга и костяные обереги.',
  },
];

/** Рекомендация: облик листа — герой узнаётся в ряду выбора, синее пламя остаётся его знаком. */
export const MAGE_RECOMMENDED: MageLook = 'a';

/** Палитры облика: рампы от тени к свету, по пять тонов. */
interface LookSpec {
  id: MageLook;
  /** Нижняя ряса до земли, верхняя ряса с клиньями и палантин (на полступени светлее), плащ, пелерина и капюшон. */
  robe: string[];
  tunic: string[];
  cloak: string[];
  /** Изнанка плаща в тени. */
  lining: string;
  /** Кромки: рамп металла (бронза, серебро) или `null` — без металла, края швом. */
  trim: string[] | null;
  /** Складка ткани, светлый край ткани. */
  fold: string;
  lit: string;
  leather: string[];
  skin: string[];
  /** Древко: дерево или железо. */
  staff: string[];
  /** Свет посоха: край, середина, ядро; ореол. */
  fire: readonly [string[], string[], string[]];
  halo: string;
  /** Кожа сапог, если не та же, что у пояса (у отшельника пояс — верёвка). */
  boot?: string[];
  /** Рваный край ткани (`shag` материала): у отшельника — лохмотья. */
  shag: number;
  /** Борода (только у отшельника). */
  beard?: string[];
}

/**
 * A «С листа»: ряса сине-лиловая (#4e4771 листа, чуть глуше), кромки — тусклая бронза вместо рыжего золота листа,
 * кожа кошеля и сапог — красно-бурая, пламя синее (у врагов огонь зелёный, пурпурный и рыжий — синий остаётся Магу).
 */
const LOOK_A: LookSpec = {
  id: 'a',
  robe: ['#16142c', '#2a2646', '#403a62', '#58507e', '#726996'],
  tunic: ['#18162e', '#2e2a4b', '#46406a', '#5f5787', '#7a70a0'],
  cloak: ['#131126', '#24203f', '#383259', '#504874', '#69608e'],
  lining: '#0c0a16',
  trim: ['#5a3a1e', '#8a5e34', '#b8844c', '#d6a266', '#eac086'],
  fold: '#100e1e',
  lit: '#665e88',
  leather: ['#1c0f0b', '#3a2018', '#583225', '#784b36', '#94644a'],
  skin: ['#3a2018', '#6a3e2e', '#9a6650', '#bc8a6a', '#d6aa88'],
  staff: ['#1c120b', '#382414', '#583c24', '#7a5a38', '#9a7852'],
  fire: [
    ['#0c2270', '#10309a', '#1640bc', '#1e54d8', '#2a6aec'],
    ['#2a6ee8', '#3a82f4', '#4e98fc', '#66b0ff', '#82c6ff'],
    ['#b0dcff', '#c4e8ff', '#d8f2ff', '#ecf9ff', '#ffffff'],
  ],
  halo: '#3a7cff',
  shag: 0.06,
};

/**
 * B «Звездочёт»: ряса полуночно-синяя почти в чёрное, кромки — потемневшее серебро, железный посох; свет — холодная
 * бело-голубая звезда (не пламя). Кожа ремня — серая.
 */
const LOOK_B: LookSpec = {
  id: 'b',
  robe: ['#0c1020', '#171d31', '#252c45', '#363f5a', '#4a5470'],
  tunic: ['#0e1222', '#1a2035', '#29314b', '#3b4562', '#515c7a'],
  cloak: ['#090b15', '#131725', '#1f2436', '#2f354b', '#434a62'],
  lining: '#06070d',
  trim: ['#4a4e56', '#747a84', '#9ea4ac', '#c4c8ce', '#e2e4e8'],
  fold: '#07090f',
  lit: '#46506a',
  leather: ['#121012', '#262124', '#3a3337', '#52494e', '#6a6166'],
  skin: ['#342220', '#644440', '#946a60', '#b68c7e', '#d0ac9c'],
  staff: ['#0c0d10', '#1a1c21', '#2a2d33', '#3e424a', '#585d66'],
  fire: [
    ['#1c4a8a', '#2462a8', '#2e7ac4', '#3c92da', '#4eaaec'],
    ['#7cc8f4', '#8ed4f8', '#a2e0fc', '#b8eafe', '#cef4ff'],
    ['#e8f8ff', '#f0fbff', '#f8feff', '#ffffff', '#ffffff'],
  ],
  halo: '#8ccfff',
  shag: 0.04,
};

/**
 * C «Отшельник»: мешковина цвета золы и лишайника, без металла — края швом, лохмотья по подолу; верёвка, кость, узловатое дерево;
 * свет — бледная бирюза кристалла (зелёный — огонь некроманта, бирюза от него отходит в синеву).
 */
const LOOK_C: LookSpec = {
  id: 'c',
  robe: ['#181a17', '#2c2f2a', '#43463f', '#5b5e55', '#74776c'],
  tunic: ['#1b1d19', '#31342e', '#4a4d45', '#63665c', '#7c7f74'],
  cloak: ['#141612', '#252822', '#383b34', '#4e5148', '#65685e'],
  lining: '#0b0c0a',
  trim: null,
  fold: '#0c0d0b',
  lit: '#6a6d64',
  leather: ['#241a10', '#46351f', '#6a5432', '#8e764f', '#ae966c'],
  skin: ['#342018', '#62402e', '#8e644c', '#b0846a', '#caa486'],
  staff: ['#1a120a', '#332314', '#4e3822', '#6c5234', '#8a6e4c'],
  fire: [
    ['#0c4a50', '#10626a', '#167c84', '#20969c', '#2eb0b2'],
    ['#48c8c4', '#5cd6d0', '#74e2da', '#90ece4', '#acf4ec'],
    ['#dcfff8', '#e6fffa', '#f0fffc', '#f8fffe', '#ffffff'],
  ],
  halo: '#40d0c8',
  shag: 0.26,
  boot: ['#16110c', '#2c2118', '#433226', '#5c4636', '#765c48'],
  beard: ['#262422', '#4a4642', '#726c66', '#968f88', '#b6b0a6'],
};

const LOOKS: Record<MageLook, LookSpec> = { a: LOOK_A, b: LOOK_B, c: LOOK_C };

/**
 * Материалы облика — свой объект на каждую часть (движок заводит зерно фактуры на объект). Ткань — вытянутые волокна
 * вдоль падения складок (`fur` со `stretch`, угол ≈ 90°; полосы `stripes` рябили частоколом светлых черт), рваный
 * край — `shag` облика; кожа лица и кистей — без дизеринга: мелкое
 * пятно, тон которого иначе перебрасывался бы с дыханием; свет посоха светится сам (`glow`).
 */
function matsOf(L: LookSpec) {
  const cloth = (ramp: string[], angle: number, shag = 0, amp = 0.1): Mat => ({ base: ramp[2], ramp, shag, tex: { kind: 'fur', scale: 2.6, amp, stretch: 3, angle } });
  const flat = (c: string): Mat => ({ base: c, ramp: [c, c, c, c, c], dither: 0 });
  const light = (ramp: string[], outline = true): Mat => ({ base: ramp[2], ramp, glow: true, dither: 0, noOutline: !outline });
  return {
    cloak: cloth(L.cloak, 1.1, L.shag),
    skirt: cloth(L.robe, 1.57, L.shag),
    tunicN: cloth(L.tunic, 1.5, L.shag * 0.6),
    tunicF: cloth(L.tunic, 1.62, L.shag * 0.6),
    stole: cloth(L.tunic, 1.57, 0, 0.06),
    torso: cloth(L.robe, 1.4),
    sleeveN: cloth(L.robe, 1.2),
    sleeveF: cloth(L.robe, 1.9, L.shag * 0.5),
    flap: cloth(L.cloak, 0.95, L.shag),
    capelet: cloth(L.cloak, 0.7, L.shag * 0.5),
    /** Капюшон глаже рясы: волокна на крупной форме головы рябят. */
    hood: { base: L.cloak[2], ramp: L.cloak, shag: L.shag * 0.5, tex: { kind: 'noise', scale: 2.6, amp: 0.1 } } as Mat,
    trim: L.trim ? ({ base: L.trim[2], ramp: L.trim, dither: 0 } as Mat) : null,
    trimLit: L.trim ? L.trim[4] : L.lit,
    leather: { base: L.leather[2], ramp: L.leather, tex: { kind: 'noise', scale: 2, amp: 0.16 } } as Mat,
    pouch: { base: L.leather[2], ramp: L.leather, tex: { kind: 'noise', scale: 2.2, amp: 0.18 } } as Mat,
    boot: { base: (L.boot ?? L.leather)[2], ramp: L.boot ?? L.leather, tex: { kind: 'noise', scale: 2, amp: 0.14 } } as Mat,
    fistN: { base: L.skin[2], ramp: L.skin, dither: 0 } as Mat,
    fistF: { base: L.skin[2], ramp: L.skin, dither: 0 } as Mat,
    face: { base: L.skin[2], ramp: L.skin, dither: 0 } as Mat,
    staff: L.id === 'b'
      ? ({ base: L.staff[2], ramp: L.staff, dither: 0.2, metal: 0.35, tex: { kind: 'spots', scale: 2.2, amp: 0.16, density: 0.18 } } as Mat)
      : ({ base: L.staff[2], ramp: L.staff, tex: { kind: 'stripes', scale: 1.6, amp: 0.18, angle: 0.4 } } as Mat),
    fireOuter: light(L.fire[0]),
    fireMid: light(L.fire[1], false),
    fireCore: light(L.fire[2], false),
    beard: L.beard ? ({ base: L.beard[2], ramp: L.beard, shag: 0.3, dither: 0, tex: { kind: 'fur', scale: 1.6, amp: 0.2, stretch: 2, angle: 1.4 } } as Mat) : null,
    bone: { base: '#b8ae96', ramp: ['#4a4436', '#7a705c', '#a89e86', '#c8bea4', '#e0d8c2'], dither: 0 } as Mat,
    dark: flat('#0c0a12'),
    lining: L.lining,
    fold: L.fold,
    lit: L.lit,
    halo: L.halo,
    skinDark: L.skin[1],
    leatherDark: L.leather[0],
    leatherLit: L.leather[4],
  };
}
type Mats = ReturnType<typeof matsOf>;

// ─── Мерки: точки листа → единицы поля ─────────────────────────────────────

/**
 * Земля модели и масштаб листа: от верха пламени (y 51) до низа фигуры (156) — 105 точек → 117 единиц; вдох
 * поднимает капюшон на пиксель, контур добавляет ещё один — в покое рост 120 (`HERO_BODY_HEIGHT.mage`).
 */
const G = 128;
const K = 117 / 105;
/** Точка листа по x и y → единицы поля: левый край фигуры (22) → 4, низ (156) → земля. */
const X = (px: number): number => 4 + (px - 22) * K;
const Y = (py: number): number => G - (156 - py) * K;
const PT = (px: number, py: number): [number, number] => [X(px), Y(py)];
/** Контур в точках листа [x0, y0, x1, y1, …] → в единицах поля. */
const S = (...pts: number[]): number[] => pts.map((v, i) => (i % 2 ? Y(v) : X(v)));
/** Размер в точках листа → в единицах. */
const R = (v: number): number => v * K;

/**
 * Суставы стойки — точки кадра листа. Таз под пряжкой; дальняя рука с посохом: плечо под пелериной, локоть в рукаве
 * (рукав-колокол прячет его), кулак у края рукава; ближняя — под плащом, наружу выглядывает только кулак у бедра.
 * Щиколотки — над сапогами.
 */
const M = {
  pelvis: PT(90, 112),
  /** Опора наклона головы — под клином воротника. */
  neck: PT(95, 92),
  armF: { sh: PT(104, 100), el: PT(113, 109), hand: PT(130, 103) },
  armN: { sh: PT(70, 90), el: PT(61, 106), hand: PT(57, 120) },
  ankN: PT(50, 151),
  ankF: PT(127, 151),
};
const PELVIS = M.pelvis;

const len = (a: readonly number[], b: readonly number[]): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
const dirOf = (a: readonly number[], b: readonly number[]): number => Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG;
const ARM_F = { l1: len(M.armF.sh, M.armF.el), l2: len(M.armF.el, M.armF.hand) };
const ARM_N = { l1: len(M.armN.sh, M.armN.el), l2: len(M.armN.el, M.armN.hand) };

// ─── Контуры листа ──────────────────────────────────────────────────────────

/**
 * Плащ позади всего: от ближнего плеча назад-вниз по левому краю силуэта почти до земли, низ — за ближним сапогом.
 * Видна его изнанка (в тени) между краем передней полы и рясой и низ за спиной.
 */
const CLOAK = [78, 70, 70, 70, 65, 74, 60, 78, 57, 82, 53, 86, 50, 90, 48, 94, 46, 98, 43, 102, 41, 106, 39, 110, 35, 114, 32, 118, 29, 122, 27, 126, 24, 130, 23, 134, 25, 138, 27, 141, 28, 146, 31, 149, 35, 152, 39, 155, 44, 156, 60, 156, 61, 146, 62, 132, 64, 118, 66, 106, 74, 96, 86, 86];
/** Изнанка плаща — полоса под краем передней полы. */
const LINING = [66, 103, 57, 108, 50, 114, 43, 120, 35, 127, 27, 133, 26, 138, 31, 141, 39, 134, 47, 128, 55, 123, 62, 117, 66, 110];
/** Передняя пола плаща: от ближнего плеча вниз-назад клином; нижний край — длинная кромка листа от бедра к хвосту плаща. */
const FLAP = [86, 88, 72, 92, 60, 97, 49, 102, 42, 106, 39, 110, 35, 114, 32, 118, 29, 122, 27, 126, 24, 130, 23, 134, 27, 133, 35, 127, 43, 120, 50, 114, 57, 108, 65, 103, 76, 98, 86, 94];
const FLAP_EDGE = [23, 134, 27, 133, 35, 127, 43, 120, 50, 114, 57, 108, 65, 103, 76, 98];
/** Нижняя ряса до земли: с ближней стороны подол опускается к сапогу, с дальней поднят шагом — видно сапог. */
const SKIRT = [64, 106, 110, 103, 118, 108, 123, 114, 122, 122, 123, 130, 125, 136, 128, 141, 130, 145, 126, 146, 120, 148, 112, 151, 104, 154, 100, 156, 64, 156, 60, 153, 55, 150, 49, 148, 50, 142, 54, 132, 58, 122, 61, 112];
const SKIRT_HEM_N = [49, 148, 55, 150, 60, 153, 64, 156];
const SKIRT_HEM_F = [100, 156, 104, 154, 112, 151, 120, 148, 126, 146, 130, 145];
/** Верхняя ряса — два клина с острым подолом по бокам от палантина. */
const TUNIC_N = [62, 106, 88, 108, 87, 114, 85, 121, 82, 128, 78, 135, 72, 144, 67, 140, 60, 137, 53, 138, 50, 137, 54, 128, 58, 118];
const TUNIC_N_EDGE = [50, 137, 53, 138, 60, 137, 67, 140, 72, 144, 78, 135, 82, 128, 85, 121, 87, 114, 88, 108];
const TUNIC_F = [95, 108, 112, 104, 121, 108, 123, 116, 121, 124, 122, 131, 119, 132, 116, 134, 112, 137, 108, 131, 104, 124, 100, 117, 97, 112];
const TUNIC_F_EDGE = [96, 109, 97, 112, 100, 117, 104, 124, 108, 131, 112, 137, 116, 134, 119, 132, 122, 131];
/** Палантин от пряжки до острого конца между клиньями. */
const STOLE = [86, 109, 95, 109, 95, 124, 94, 140, 93, 149, 89, 154, 86, 149, 85, 139, 86, 124];
/** Грудь рясы под пелериной и клином воротника. */
const TORSO = [66, 86, 80, 86, 92, 93, 104, 92, 114, 94, 118, 100, 114, 106, 100, 108, 66, 109, 62, 98];
/** Пояс поднимается к врагам (ракурс); пряжка, кошель у ближнего бедра. */
const BELT = [63, 105, 110, 100.5, 110.5, 104.5, 63.5, 109];
const BUCKLE = PT(92.5, 106.5);
const POUCH = [71, 110, 82, 109, 84, 113, 85, 120, 82, 125, 75, 126, 70, 123, 68, 117, 69, 112];
/** Пелерина: ближнее плечо до кромки листа над полой плаща, дальнее — узкой полосой над рукавом. */
const CAPELET = [74, 72, 66, 75, 60, 78, 56, 83, 52, 88, 48, 94, 45, 99, 42, 104, 41, 106, 47, 103, 53, 100, 61, 96, 70, 91, 80, 87, 87, 91, 94, 96, 104, 98, 112, 96.5, 117, 95, 115, 92, 111, 89, 106, 86, 98, 83, 88, 78, 80, 73];
const CAPELET_EDGE_N = [41, 106, 47, 103, 53, 100, 61, 96, 70, 91, 80, 87];
const CAPELET_EDGE_F = [100, 97, 110, 96.5, 117, 95];
/**
 * Капюшон с воротником: макушка заломлена назад (выступ слева над затылком), передний край — от кончика над лицом
 * отвесно вниз, низ — клин воротника на груди.
 */
const HOOD = [74, 61, 77, 59, 80, 58, 84, 56, 87, 54, 91, 52, 97, 52, 101, 54, 105, 57, 108, 60, 111, 62, 113, 62, 112, 64, 110, 66, 109, 72, 108, 80, 109, 86, 110, 88, 106, 90, 99, 93, 92, 95, 87, 90, 80, 82, 74, 76, 70, 73, 70, 68, 72, 64];
const HOOD_EDGE = [70, 73, 74, 76, 80, 82, 87, 90, 92, 95, 99, 93, 106, 90, 110, 88];
/** Проём лица и его край — бровь капюшона от кончика вниз-назад. */
const FACE_HOLE = [113, 62, 106, 67, 100, 71, 94, 75, 91, 77, 92, 82, 95, 87, 100, 91, 106, 89, 108, 82, 109, 72, 111, 65];
const BROW = [91, 77, 94, 75, 100, 71, 106, 67, 113, 62];
/** Залом макушки: тень под выступом над затылком. */
const HOOD_FOLD = [73, 62, 79, 59, 83, 61, 80, 65, 76, 65];
/** Лицо в тени: скула и спинка носа на свету, ниже — маска. */
const FACE_LIT = [98, 74, 101, 70.5, 104, 70, 107.5, 75.5, 106.5, 78.5, 102, 79, 99, 78];
const NOSE = [102.5, 70.5, 104.5, 71, 107.5, 75.5, 106, 77];
/** Глазница — тень под бровью, глаз не светится. */
const SOCKET = [98.5, 74, 101, 71, 103, 71, 101.5, 73.5];
const MASK = [93, 80, 107.5, 79.5, 108.5, 85, 105, 90, 99, 92, 94, 86];
/** Сапоги от щиколотки (разница в точках листа): ближний носком наружу (влево), дальний — к врагам. */
const BOOT_N = [7, -4, -3, -4, -7, -1, -11, 2, -12, 5, 7, 5];
const BOOT_F = [-6, -3, 3, -3, 6, 0, 9, 3, 10, 5, -6, 5];

// ─── Посох ──────────────────────────────────────────────────────────────────

/** Угол посоха в стойке: от кулака к низу кольца, чуть от отвеса к врагам (≈ −62°). */
const STAFF_ANGLE = dirOf(M.armF.hand, PT(139, 86));
/** Точки листа → координаты посоха (s — вдоль древка от кулака, t — поперёк) при угле стойки. */
function staffLocal(pts: number[]): number[] {
  const c = Math.cos(STAFF_ANGLE * DEG), s = Math.sin(STAFF_ANGLE * DEG);
  const out: number[] = [];
  for (let k = 0; k < pts.length; k += 2) {
    const dx = X(pts[k]) - M.armF.hand[0], dy = Y(pts[k + 1]) - M.armF.hand[1];
    out.push(dx * c + dy * s, -dx * s + dy * c);
  }
  return out;
}
/** Кольцо-крюк листа: левая дуга с загибом над ней, правая — открытая, пламя внутри. */
const RING_L = staffLocal([139, 86, 135, 85, 132, 81, 131, 75, 131, 69, 132, 64, 134, 61, 136, 59.5]);
const RING_R = staffLocal([139, 86, 144, 86, 149, 83, 152, 77, 153, 70, 152, 65, 150, 62, 148, 61]);
/** Середина кольца — где стоит свет, и низ кольца — конец древка. */
const RING_C = staffLocal([142, 73]);
const RING_BASE = staffLocal([139, 86]);
/** Древко ниже кулака — до середины подола, за рясой (конец скрыт). */
const STAFF_BUTT = 52;

/** Точка посоха (s, t) от кулака (x, y) под углом `a`. */
function staffPt(x: number, y: number, a: number, s: number, t: number): [number, number] {
  const c = Math.cos(a * DEG), sn = Math.sin(a * DEG);
  return [x + c * s - sn * t, y + sn * s + c * t];
}

/**
 * Древко и навершие облика от кулака (x, y) под углом `a`: A — дерево и кольцо-крюк листа с бронзовой обоймой,
 * B — железо с серебряными поясами и полумесяц, C — узловатый корень, наверху корни обнимают кристалл. Свет — `light`.
 */
function staff(p: Painter, m: Mats, L: LookSpec, x: number, y: number, a: number): void {
  const q = (s: number, t: number): [number, number] => staffPt(x, y, a, s, t);
  const top = RING_BASE[0];
  if (L.id === 'c') {
    // Узловатое древко до корней: толщина гуляет, узлы — утолщения.
    const [cs, ct] = RING_C;
    const base = cs - R(12);
    const pts: Array<[number, number, number]> = [];
    for (let k = 0; k <= 8; k++) {
      const s = -STAFF_BUTT + ((base + STAFF_BUTT) * k) / 8;
      pts.push([...q(s, 0.9 * Math.sin(k * 1.7)), [2.2, 2.6, 2.0, 2.5, 2.1, 2.7, 2.2, 2.4, 2.8][k]]);
    }
    p.chain(pts, m.staff, { part: 'staff' });
    // Корни навершия — клеткой вокруг кристалла: два обнимают его с боков и сходятся над ним, третий держит снизу.
    const roots: Array<Array<[number, number]>> = [
      [[-12, 0], [-8, -6], [-1, -8.5], [6, -6.5], [10.5, -2]],
      [[-12, 0.5], [-7, 6], [0, 8.5], [7, 5.5], [10, 1.5]],
      [[-12, 0], [-7, -1.5], [-3, 0.5]],
    ];
    for (const r of roots) p.chain(r.map(([ds, dt], k): [number, number, number] => [...q(cs + R(ds), ct + R(dt)), lerp(2.3, 1.1, k / (r.length - 1))]), m.staff, { part: 'staffTop' });
    return;
  }
  // Прямое древко.
  p.limb(...q(-STAFF_BUTT, 0), 1.9, ...q(top + 1, 0), 2.1, m.staff, { part: 'staff' });
  if (L.id === 'a') {
    // Кольцо-крюк листа — дерево, концы загнуты внутрь; обойма под кольцом — бронза.
    const ring = (loc: number[], r0: number, r1: number): void => {
      const pts: Array<[number, number, number]> = [];
      for (let k = 0; k < loc.length; k += 2) {
        const [px, py] = q(loc[k], loc[k + 1]);
        pts.push([px, py, lerp(r0, r1, k / (loc.length - 2))]);
      }
      p.chain(pts, m.staff, { part: 'staffTop' });
    };
    ring(RING_L, 2.1, 1.4);
    ring(RING_R, 2.1, 1.2);
    if (m.trim) {
      const [b0x, b0y] = q(top - 3.5, 0), [b1x, b1y] = q(top - 0.5, 0);
      p.limb(b0x, b0y, 2.6, b1x, b1y, 2.6, m.trim, { part: 'staffBand', lift: 0.6 });
    }
    return;
  }
  // B: серебряные пояса и полумесяц рогами вверх вокруг звезды.
  if (m.trim) {
    for (const s0 of [4, 13, top - 3]) {
      const [b0x, b0y] = q(s0, 0), [b1x, b1y] = q(s0 + 1.8, 0);
      p.limb(b0x, b0y, 2.6, b1x, b1y, 2.6, m.trim, { part: 'staffBand', lift: 0.6 });
    }
  }
  // Полумесяц: внешняя дуга от правого рога через низ к левому, внутренняя — обратно через низ, выше и уже; рога
  // острые — обе дуги сходятся в них.
  const [cx, cy] = q(RING_C[0], RING_C[1]);
  const ro = R(12), thick = R(4), yt = cy - 0.26 * ro, xr = 0.966 * ro, ry = ro * 1.26 - thick;
  const moon: number[] = [];
  for (let k = 0; k <= 14; k++) {
    const t = (-15 + (210 * k) / 14) * DEG;
    moon.push(cx + ro * Math.cos(t), cy + ro * Math.sin(t));
  }
  for (let k = 1; k < 14; k++) {
    const f = (180 - (180 * k) / 14) * DEG;
    moon.push(cx + xr * Math.cos(f), yt + ry * Math.sin(f));
  }
  if (m.trim) p.poly(moon, m.trim, { part: 'staffTop', bevel: 1.2, lift: 0.8 });
}

/**
 * Свет посоха в координатах мира (пламя стоит прямо, как ни наклонён посох): A — синее пламя в кольце, язык к врагам
 * и вверх; B — холодная восьмилучевая звезда; C — кристалл в корнях. Форма колеблется по фазе покоя, число фигур
 * постоянно. `glow` — сила света (1 — покой).
 */
function staffLight(p: Painter, m: Mats, L: LookSpec, cx: number, cy: number, glow: number): void {
  const w1 = Math.sin(2 * Math.PI * (3 * p.t)), w2 = Math.sin(2 * Math.PI * (3 * p.t + 0.33)), w3 = Math.sin(2 * Math.PI * (2 * p.t + 0.6));
  if (L.id === 'a') {
    // Пламя листа — шар во всё кольцо и язык вверх к врагам, второй язычок слева; ядро — два светлых пятна.
    p.glow(cx + R(2), cy - R(5), R(15) * glow, m.halo, 0.28);
    p.ellipse(cx, cy + R(1.5), R(8.4), R(8.6), m.fireOuter, { part: 'fire' });
    p.chain([[cx + R(2.5), cy - R(3), R(5.6)], [cx + R(5.5) + w1, cy - R(11), R(2.8)], [cx + R(8) + 1.2 * w2, cy - R(19) - w3, R(0.6)]], m.fireOuter, { part: 'fire' });
    p.chain([[cx - R(3.5), cy - R(4), R(2)], [cx - R(4.5) + w2, cy - R(9) + w1, R(0.6)]], m.fireOuter, { part: 'fire' });
    p.ellipse(cx + R(0.5), cy + R(1.8), R(5.8), R(6), m.fireMid, { part: 'fireMid', noLine: true });
    p.chain([[cx + R(2.5), cy - R(3), R(3.4)], [cx + R(5) + 0.7 * w1, cy - R(10), R(0.6)]], m.fireMid, { part: 'fireMid', noLine: true });
    p.ellipse(cx - R(1.5), cy + R(3), R(2.6), R(2.8), m.fireCore, { part: 'fireCore', noLine: true });
    p.ellipse(cx + R(2.5), cy - R(4) + 0.5 * w3, R(1.6), R(1.8), m.fireCore, { part: 'fireCore', noLine: true });
    return;
  }
  if (L.id === 'b') {
    // Звезда: ядро, четыре длинных луча и четыре коротких косых — восьмилучевая, чтобы не читаться крестом (крест лучей —
    // свет Паладина); мерцает.
    cy -= R(2.5);
    p.glow(cx, cy, R(13) * glow, m.halo, 0.26);
    const r = R(3.2) + 0.4 * w1;
    const d = Math.SQRT1_2;
    for (const [dx, dy, l] of [[0, -1, R(10)], [0, 1, R(8)], [-1, 0, R(8)], [1, 0, R(8)], [d, -d, R(4.5)], [-d, -d, R(4.5)], [d, d, R(4)], [-d, d, R(4)]] as const) {
      p.limb(cx, cy, 1.4, cx + dx * (l + w2), cy + dy * (l + w2), 0.5, m.fireMid, { part: 'fireMid', noLine: true });
    }
    p.ellipse(cx, cy, r, r, m.fireOuter, { part: 'fire' });
    p.ellipse(cx, cy, r * 0.6, r * 0.6, m.fireCore, { part: 'fireCore', noLine: true });
    return;
  }
  // C: кристалл — вытянутый шестигранник, грань к свету светлее; ореол дышит.
  p.glow(cx, cy - R(2), R(12) * glow + 0.8 * w3, m.halo, 0.24);
  const h = R(10), w = R(4.2);
  p.poly([cx, cy - h - R(1), cx + w, cy - h * 0.45, cx + w * 0.9, cy + h * 0.5, cx, cy + h * 0.8, cx - w * 0.9, cy + h * 0.4, cx - w, cy - h * 0.5], m.fireOuter, { part: 'fire', bevel: 1 });
  p.poly([cx - w * 0.2, cy - h * 0.8, cx + w * 0.6, cy - h * 0.35, cx + w * 0.4, cy + h * 0.3, cx - w * 0.3, cy + h * 0.1], m.fireMid, { part: 'fire', paint: true });
  p.poly([cx - w * 0.1, cy - h * 0.55, cx + w * 0.3, cy - h * 0.3, cx + w * 0.15, cy - h * 0.05], m.fireCore, { part: 'fire', paint: true });
  // Корень поперёк кристалла спереди — кристалл в клетке, а не на палке.
  p.chain([[cx - w * 1.4, cy + h * 0.55, 1.5], [cx - w * 0.2, cy + h * 0.05, 1.2], [cx + w * 0.9, cy - h * 0.5, 0.9]], m.staff, { part: 'staffRoot' });
}

// ─── Кромки ─────────────────────────────────────────────────────────────────

/**
 * Кайма вдоль ломаной `pts` шириной `w` внутрь части — краской по части (копия `edgeBand` Паладина). Обход — против
 * часовой на экране: низ слева направо, правый край снизу вверх, верх справа налево, левый край сверху вниз (внутрь —
 * слева от хода). Штрих в пиксель на сетке 1,5 рвался пунктиром — кайма полосой.
 */
function edgeBand(p: Painter, pts: number[], w: number, mat: Mat, part: string, tone = 0): void {
  const inner: number[] = [];
  const n = pts.length / 2;
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
    const tx = pts[b * 2] - pts[a * 2], ty = pts[b * 2 + 1] - pts[a * 2 + 1], l = Math.hypot(tx, ty) || 1;
    inner.push(pts[k * 2] + (ty / l) * w, pts[k * 2 + 1] - (tx / l) * w);
  }
  const out = [...pts];
  for (let k = n - 1; k >= 0; k--) out.push(inner[k * 2], inner[k * 2 + 1]);
  p.poly(out, mat, { part, paint: true, tone });
}

/** Складка ткани: тёмная черта долины и светлый гребень рядом со стороны света (слева сверху). */
function fold(p: Painter, m: Mats, pts: number[], part: string): void {
  stroke(p, pts.map((v, i) => v + (i % 2 ? -0.6 : -1.5)), m.lit, part);
  stroke(p, pts, m.fold, part);
}

/** Кромка облика: металл полосой (A, B) или шов тёмной чертой у края (C — мешковина без металла). */
function trimEdge(p: Painter, m: Mats, pts: number[], part: string, w = 2.2, tone = 0): void {
  if (m.trim) edgeBand(p, pts, w, m.trim, part, tone);
  else edgeBand(p, pts, 1.2, solid(m.fold), part);
}

/**
 * Рваный край по ломаной: зубцы наружу (влево от хода — `side` 1) через `step` — у отшельника лохмотья подола.
 * Число зубцов считается по ломаной покоя, поэтому постоянно.
 */
function tatters(pts: number[], amp: number, step: number, side: 1 | -1, pattern: readonly number[] = [1, 0.45, 0.8]): number[] {
  const out: number[] = [];
  let k = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    const tx = (x1 - x0) / l, ty = (y1 - y0) / l;
    const nx = ty * side, ny = -tx * side;
    const n = Math.max(1, Math.round(l / step));
    for (let j = 0; j < n; j++) {
      const a = j / n, b = (j + 0.5) / n, s = pattern[k++ % pattern.length];
      out.push(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a);
      out.push(x0 + (x1 - x0) * b + nx * amp * s, y0 + (y1 - y0) * b + ny * amp * s);
    }
  }
  out.push(pts[pts.length - 2], pts[pts.length - 1]);
  return out;
}

// ─── Поза ───────────────────────────────────────────────────────────────────

/**
 * Поза Мага. Посох — в дальней руке (кисть точкой `fhx`/`fhy` в координатах верха, угол посоха `sw`), ближняя рука
 * свободна (кулак `nhx`/`nhy`). Остальное — как у Воина (docs/lepka-geroev.md «Каркас позы»): таз и верх (`x`, `y`,
 * `crouch`), наклон верха и головы (`lean`, `head`, плюс — к врагам), шаг (`footF`, `footN`, `liftF`, `liftN`), плащ
 * (`cape`: 0 висит, 1 взвился назад), сила света посоха (`glow`, 1 — покой). Поля клипов (запястье `ws`/`wr`, колено,
 * падение) добавит шаг 4.
 */
export interface MagePose extends Record<string, number> {
  x: number; y: number;
  crouch: number;
  lean: number;
  head: number;
  fhx: number; fhy: number;
  sw: number;
  nhx: number; nhy: number;
  footF: number; footN: number; liftF: number; liftN: number;
  cape: number;
  glow: number;
}

const REST: MagePose = {
  x: 0, y: 0, crouch: 0, lean: 0, head: 0,
  fhx: M.armF.hand[0], fhy: M.armF.hand[1], sw: STAFF_ANGLE,
  nhx: M.armN.hand[0], nhy: M.armN.hand[1],
  footF: 0, footN: 0, liftF: 0, liftN: 0, cape: 0, glow: 1,
};

/** Ключи клипов — шаг 4 рецепта; пока пусто, и любой клип рисует первый кадр покоя. */
const CLIPS: Partial<Record<SculptClip, PoseKeys<MagePose>>> = {};

/** Рука кистью в точке (tx, ty) от плеча (sx, sy): локоть — ik с изгибом `bend` (сторона от линии плечо — кисть). */
function reachArm(sx: number, sy: number, tx: number, ty: number, l1: number, l2: number, bend: 1 | -1): { ex: number; ey: number; hx: number; hy: number; a1: number; a2: number } {
  const vx = tx - sx, vy = ty - sy, d = Math.hypot(vx, vy), reach = l1 + l2 - 0.05;
  if (d > reach) {
    tx = sx + (vx * reach) / d;
    ty = sy + (vy * reach) / d;
  }
  const [ex, ey] = ik(sx, sy, tx, ty, l1, l2, -vy * bend, vx * bend);
  return { ex, ey, hx: tx, hy: ty, a1: Math.atan2(ey - sy, ex - sx) / DEG, a2: Math.atan2(ty - ey, tx - ex) / DEG };
}

/**
 * Покой: грудь поднимается на пиксель два раза за цикл, таз оседает на четверть цикла позже, раз за цикл вес переходит
 * с ноги на ногу; стопы и подол стоят. Кисти повторяют только 40 % движения корпуса (урок Паладина: рука, приклеенная
 * к корпусу, «двигается вместе с телом»), посох качается маятником ±1,5° с запаздыванием, пламя пляшет, раз за цикл
 * капюшон кивает к врагам. Сдвиги — целыми пикселями. Плащ в покое не колышется: сдвиг подола на пиксель по
 * полу читался скольжением — ткань живёт с дыханием верха.
 */
function idlePose(p: Painter): MagePose {
  const P = { ...REST };
  P.crouch += p.bob(1.5, 2, 0.25);
  P.x += p.snap(1.2 * p.wave(1, 0.3));
  const bodyX = P.x, bodyY = P.crouch - p.bob(2, 2);
  P.fhx -= 0.6 * bodyX;
  P.fhy -= 0.6 * bodyY;
  P.nhx -= 0.6 * bodyX;
  P.nhy -= 0.6 * bodyY;
  P.sw += 1.5 * p.wave(1, 0.45);
  return P;
}

/** Поза кадра: ключи клипа поверх покоя в фазе 0 или сам покой. */
function framePose(p: Painter): MagePose {
  const base = idlePose(p);
  const c = clipAt(p);
  let P = base;
  if (c) {
    const keys = CLIPS[c.clip];
    if (keys) P = poseAt(base, keys, c.f, c.n, HERO_CLIPS[c.clip].hold);
  } else {
    P.head += 2 * p.blink(0.62, 0.16);
  }
  return P;
}

/** Зонд: таз, кулак с посохом, середина света (конец оружия), суставы дальней руки. Свет в земле нарочно — нигде. */
export const mageProbe: HeroProbe = { grounded: [] };

// ─── Модель ─────────────────────────────────────────────────────────────────

/**
 * Временная аватарка — поза покоя в кадре бюста (капюшон слева от середины, навершие посоха с пламенем у правого
 * края), цвета прежнего портрета: ночное синее небо, луна-ореол за капюшоном, шпили по краям. Шлифовка — шаг 5.
 */
function avatarOf(m: Mats, L: LookSpec): AvatarSpec {
  return {
    draw: (p) => drawMage(p, REST, m, L),
    crop: [40, -12, 112],
    halo: [84, 28, 30],
    colors: { top: '#162856', bottom: '#070c1a', halo: '#1a3375', haloEdge: '#2a4a94', skyline: '#080e1d', frameDark: '#05080f', frame: '#152348', frameLight: '#2e4a86' },
    skyline: [[0.05, 0.06, 0.55, 0.22], [0.13, 0.05, 0.42, 0.16], [0.9, 0.05, 0.5, 0.2], [0.97, 0.05, 0.62, 0.24]],
  };
}

/** Маг облика `look`; рост в покое — `HERO_BODY_HEIGHT.mage` (120) в пикселе `HERO_PIXEL`. */
export function mageModel(look: MageLook = MAGE_RECOMMENDED): HeroModel {
  const L = LOOKS[look];
  const m = matsOf(L);
  return {
    id: 'mage',
    avatar: avatarOf(m, L),
    probe: mageProbe,
    w: 162,
    h: 132,
    ground: G,
    pad: 80,
    draw: (p: Painter) => drawMage(p, framePose(p), m, L),
  };
}

// ─── Рисунок ────────────────────────────────────────────────────────────────

function drawMage(p: Painter, P: MagePose, m: Mats, L: LookSpec): void {
  const breath = p.bob(2, 2);
  const rot = P.lean * DEG;
  // Верх: таз с приседом, сдвиг веса и дыхание — целыми пикселями (поза их прижимает к сетке, ткань — тоже).
  const udx = p.snap(P.x), udy = p.snap(P.y + P.crouch - breath);
  const up = { dx: udx, dy: udy, rot, px: PELVIS[0], py: PELVIS[1] };
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const toWorld = (x: number, y: number): [number, number] =>
    [PELVIS[0] + cr * (x - PELVIS[0]) - sr * (y - PELVIS[1]) + udx, PELVIS[1] + sr * (x - PELVIS[0]) + cr * (y - PELVIS[1]) + udy];
  /**
   * Ткань, которая висит на верхе: вверху (`top`, y листа) идёт с ним целиком, у земли стоит, между — доля по высоте;
   * `cape` относит низ назад. Подол не отрывается от пола, когда грудь дышит. `closed` — многоугольник: фактура
   * и дизеринг фигуры привязаны к её первой вершине, и у висящей ткани первой ставится самая нижняя — подол стоит,
   * и узор на нём не ползёт (с вершиной у пояса волокна подола переливались каждый вдох). Ломаные кромок и складок
   * не переставляются.
   */
  const hang = (pts: number[], top: number, closed = false): number[] => {
    const out: number[] = [];
    const yt = Y(top);
    let low = 0;
    if (closed) for (let k = 0; k < pts.length; k += 2) if (pts[k + 1] > pts[low + 1] + 0.01) low = k;
    for (let i = 0; i < pts.length; i += 2) {
      const k = (low + i) % pts.length;
      const x = pts[k], y = pts[k + 1];
      const w = Math.max(0, Math.min(1, (G - y) / (G - yt)));
      const [wx, wy] = toWorld(x, y);
      const lo = 1 - w;
      // Сдвиг — целыми пикселями: дробный сдвиг точек у подола перекатывал край и фактуру клиньев на каждом вдохе.
      out.push(x + p.snap(w * (wx - x) - P.cape * 8 * lo * lo), y + p.snap(w * (wy - y)));
    }
    return out;
  };
  const far = reachArm(M.armF.sh[0], M.armF.sh[1], P.fhx, P.fhy, ARM_F.l1, ARM_F.l2, -1);
  const near = reachArm(M.armN.sh[0], M.armN.sh[1], P.nhx, P.nhy, ARM_N.l1, ARM_N.l2, 1);
  const SW = P.sw;
  const probeInfo: Record<string, number> = {};

  p.shadow(X(80) + P.x * 0.5, R(56), 4.5);

  // ── Посох — позади всего: дальняя рука держит его с дальней стороны тела; низ древка скрыт рясой. ──
  p.pose(up, () => staff(p, m, L, far.hx, far.hy, SW));

  // ── Плащ за спиной: верх на плечах, низ стоит; изнанка — полосой под краем передней полы. ──
  // Низ плаща за спиной — рваный: у A и B чуть-чуть, у отшельника лохмотьями.
  const cloakHem = tatters(S(...CLOAK.slice(34, 50)), R(L.id === 'c' ? 4 : 2), R(L.id === 'c' ? 3.5 : 5), -1);
  p.poly(hang([...S(...CLOAK.slice(0, 34)), ...cloakHem, ...S(...CLOAK.slice(50))], 86, true), m.cloak, { part: 'cloak', tone: -0.08, bevel: 9 });
  p.poly(hang(S(...LINING), 100, true), solid(m.lining), { part: 'cloak', paint: true });
  fold(p, m, hang(S(40, 132, 33, 150), 86), 'cloak');
  fold(p, m, hang(S(48, 128, 44, 152), 86), 'cloak');

  // ── Сапоги из-под подола: ближний носком назад, дальний — к врагам; шаг двигает стопу. ──
  const feet = [
    { ank: M.ankF, boot: BOOT_F, foot: P.footF, lift: P.liftF, tone: -0.06, part: 'bootF' },
    { ank: M.ankN, boot: BOOT_N, foot: P.footN, lift: P.liftN, tone: 0, part: 'bootN' },
  ];
  for (const f of feet) {
    const ax = f.ank[0] + f.foot, ay = f.ank[1] - f.lift;
    const b: number[] = [];
    for (let k = 0; k < f.boot.length; k += 2) b.push(ax + R(f.boot[k]), Math.min(G, ay + R(f.boot[k + 1])));
    p.poly(b, m.boot, { part: f.part, bevel: 2.4, tone: f.tone });
    stroke(p, [ax - R(5), ay - R(1.5), ax + R(5), ay - R(2)], m.leatherLit, f.part);
    if (f.part === 'bootF') probeInfo.footF = ax;
    else probeInfo.footN = ax;
  }

  // ── Нижняя ряса до земли; на дальней стороне подол поднят шагом. ──
  const skirtPts = L.id === 'c'
    ? hang([...S(...SKIRT.slice(0, 28)), ...tatters(S(100, 156, 82, 156, 64, 156), R(3), R(5), -1).slice(2), ...S(...SKIRT.slice(30))], 104, true)
    : hang(S(...SKIRT), 104, true);
  p.poly(skirtPts, m.skirt, { part: 'skirt', tone: -0.04, bevel: 6 });
  stroke(p, hang(S(70, 141, 68, 155), 104), m.fold, 'skirt');
  stroke(p, hang(S(100, 143, 99, 155), 104), m.fold, 'skirt');
  stroke(p, hang(S(118, 139, 116, 149), 104), m.fold, 'skirt');
  trimEdge(p, m, hang(S(...SKIRT_HEM_N), 104), 'skirt', 2);
  trimEdge(p, m, hang(S(...SKIRT_HEM_F), 104), 'skirt', 2);

  // ── Верхняя ряса — два клина с острым подолом и палантин. У отшельника клинья без кромки, концы рваные. ──
  p.poly(hang(S(...TUNIC_N), 106, true), m.tunicN, { part: 'tunicN', bevel: 5 });
  fold(p, m, hang(S(74, 112, 67, 136), 106), 'tunicN');
  trimEdge(p, m, hang(S(...TUNIC_N_EDGE), 106), 'tunicN');
  p.poly(hang(S(...TUNIC_F), 106, true), m.tunicF, { part: 'tunicF', bevel: 5, tone: -0.08 });
  stroke(p, hang(S(110, 110, 117, 127), 106), m.fold, 'tunicF');
  trimEdge(p, m, hang(S(...TUNIC_F_EDGE), 106), 'tunicF');
  p.poly(hang(S(...STOLE), 106, true), m.stole, { part: 'stole', bevel: 2, tone: 0.04 });
  trimEdge(p, m, hang(S(86, 109, 85, 124, 85, 139, 86, 149, 89, 154, 93, 149, 94, 140, 95, 124, 95, 109), 106), 'stole', 1.8);
  if (L.id === 'b' && m.trim) {
    // Звёзды по палантину — по пикселю серебра.
    for (const [sx, sy] of [[90, 120], [90, 132], [89.5, 144]]) {
      const [wx, wy] = hang(S(sx, sy), 106);
      p.px(wx, wy, m.trimLit);
    }
  }
  if (L.id === 'c') {
    // Заплата на ближнем клине — квадрат светлее, стежки швом.
    const patch = hang(S(62, 122, 70, 121, 71, 129, 63, 130), 106, true);
    p.poly(patch, m.tunicN, { part: 'tunicN', paint: true, tone: 0.14 });
    stroke(p, patch.concat(patch.slice(0, 2)), m.fold, 'tunicN');
  }

  // ── Верх: грудь, пояс, кошель, ближняя рука; дальний рукав; пелерина; капюшон. ──
  p.pose(up, () => {
    p.poly(S(...TORSO), m.torso, { part: 'torso', tone: -0.12, bevel: 5 });
    stroke(p, S(84, 96, 82, 106), m.fold, 'torso');
    stroke(p, S(104, 96, 106, 106), m.fold, 'torso');

    // Пояс; у отшельника — верёвка.
    if (L.id === 'c') {
      p.poly(S(...BELT), m.leather, { part: 'belt', bevel: 1.6 });
      for (let k = 0; k < 9; k++) {
        const x0 = 66 + k * 5;
        stroke(p, S(x0, 109 - k * 0.55, x0 + 3, 104 - k * 0.55), m.leatherDark, 'belt');
      }
    } else {
      p.poly(S(...BELT), m.leather, { part: 'belt', bevel: 1.8 });
      stroke(p, S(65, 105.8, 109, 101.4), m.leatherLit, 'belt');
    }

    // Ремешок от клина воротника к пряжке (A, B).
    if (L.id !== 'c') {
      p.poly(S(91.5, 94, 95, 94, 94.5, 103, 91.5, 103), m.leather, { part: 'strap', bevel: 1 });
    }

    // Пряжка: A — бронзовое кольцо, B — серебряная звезда, C — узел верёвки с концами.
    if (L.id === 'c') {
      p.ellipse(BUCKLE[0], BUCKLE[1], R(3.6), R(3), m.leather, { part: 'knot', lift: 1 });
      p.limb(...PT(92, 108), R(1.4), ...PT(90, 122), R(1.1), m.leather, { part: 'knotEnd' });
      p.limb(...PT(94, 108), R(1.4), ...PT(97, 119), R(1.1), m.leather, { part: 'knotEnd' });
    } else if (m.trim) {
      p.ellipse(BUCKLE[0], BUCKLE[1], R(4.5), R(4.5), m.trim, { part: 'buckle', lift: 1.2 });
      p.ellipse(BUCKLE[0] + 0.3, BUCKLE[1] + 0.3, R(1.9), R(1.9), m.dark, { part: 'buckle', paint: true });
      if (L.id === 'b') p.px(BUCKLE[0] - 1, BUCKLE[1] - 1.5, m.trimLit);
    }

    // У бедра: A — кошель, B — астролябия на цепочке, C — книга на шнуре и костяные обереги.
    if (L.id === 'a') {
      p.poly(S(...POUCH), m.pouch, { part: 'pouch', bevel: 3, lift: 1.5 });
      p.poly(S(70, 110, 83, 109, 84, 113, 70, 114), m.pouch, { part: 'pouch', paint: true, tone: -0.2 });
      stroke(p, S(71, 114, 83, 113), m.leatherDark, 'pouch');
      p.poly(S(74, 115, 78, 114, 79, 117, 75, 118), m.pouch, { part: 'pouch', paint: true, tone: 0.3 });
    } else if (L.id === 'b' && m.trim) {
      // Тубус звёздных карт наискось у бедра: кожа, серебряные колпачки и пояс. Астролябия диском читалась гербом.
      const [t0x, t0y] = PT(71, 109), [t1x, t1y] = PT(80, 127);
      p.limb(t0x, t0y, R(3.4), t1x, t1y, R(3.4), m.pouch, { part: 'tube', lift: 1, tone: 0.2 });
      for (const f of [0.06, 0.5, 0.94]) {
        const cx = lerp(t0x, t1x, f), cy = lerp(t0y, t1y, f), w = f === 0.5 ? R(0.5) : R(1);
        const ux = (t1x - t0x) / Math.hypot(t1x - t0x, t1y - t0y), uy = (t1y - t0y) / Math.hypot(t1x - t0x, t1y - t0y);
        p.poly([cx - ux * w - uy * R(3.6), cy - uy * w + ux * R(3.6), cx + ux * w - uy * R(3.6), cy + uy * w + ux * R(3.6), cx + ux * w + uy * R(3.6), cy + uy * w - ux * R(3.6), cx - ux * w + uy * R(3.6), cy - uy * w - ux * R(3.6)], m.trim, { part: 'tube', paint: true, tone: -0.1 });
      }
    } else {
      stroke(p, S(78, 108, 77, 112), m.leatherDark, 'torso');
      p.poly(S(70, 112, 83, 111, 84, 124, 71, 125), m.boot, { part: 'book', bevel: 1.6, lift: 1 });
      p.poly(S(81.5, 112, 83, 111, 84, 124, 82.5, 124.5), m.bone, { part: 'book', paint: true, tone: -0.2 });
      p.poly(S(75, 116.5, 83, 116, 83, 119, 75, 119.5), m.bone, { part: 'book', paint: true });
      p.ellipse(...PT(98, 113), R(1.6), R(2), m.bone, { part: 'charm' });
      p.ellipse(...PT(100, 116), R(1.4), R(1.8), m.bone, { part: 'charm' });
    }

    // Ближняя рука под плащом: рукав от плеча до запястья, наружу у бедра — обшлаг и кулак.
    const [wx, wy] = at(near.hx, near.hy, near.a2, -R(4));
    p.limb(M.armN.sh[0], M.armN.sh[1], R(6), near.ex, near.ey, R(5.5), m.sleeveN, { part: 'sleeveN', tone: -0.1 });
    p.limb(near.ex, near.ey, R(5.5), wx, wy, R(5.2), m.sleeveN, { part: 'sleeveN', tone: -0.1 });
    p.ellipse(near.hx, near.hy, R(4.6), R(5), m.fistN, { part: 'fistN', lift: 1 });
    stroke(p, [near.hx - R(2.5), near.hy - R(1), near.hx + R(2), near.hy + R(2)], m.skinDark, 'fistN');
  });

  // ── Передняя пола плаща — поверх ближней руки, кулак выглядывает из-под её края. ──
  const flapPts = L.id === 'c' ? hang([...S(...FLAP.slice(0, 22)), ...tatters(S(24, 130, 23, 134, 27, 133), R(3), R(3), 1).slice(2), ...S(...FLAP.slice(26))], 90, true) : hang(S(...FLAP), 90, true);
  p.poly(flapPts, m.flap, { part: 'flap', bevel: 7 });
  fold(p, m, hang(S(60, 100, 36, 124), 90), 'flap');
  stroke(p, hang(S(50, 104, 30, 126), 90), m.lit, 'flap');
  trimEdge(p, m, hang(S(...FLAP_EDGE), 90), 'flap');

  p.pose(up, () => {
    // Дальний рукав-колокол: плечо, раструб от локтя, край обшлага свисает ниже кисти; кулак на древке.
    const u = [Math.cos(far.a2 * DEG), Math.sin(far.a2 * DEG)], nUp = [u[1], -u[0]];
    const [wx, wy] = at(far.hx, far.hy, far.a2, -R(5));
    p.limb(M.armF.sh[0], M.armF.sh[1], R(5.2), far.ex, far.ey, R(5.6), m.sleeveF, { part: 'sleeveF', tone: -0.12 });
    const bell = [
      far.ex + nUp[0] * R(6.5), far.ey + nUp[1] * R(6.5),
      wx + nUp[0] * R(6), wy + nUp[1] * R(6),
      wx + nUp[0] * R(2) + R(0.8), wy + R(5),
      wx - R(1.5), wy + R(14),
      wx - R(3.5), wy + R(24),
      wx - R(8.5), wy + R(20),
      far.ex + R(1), far.ey + R(11),
      far.ex - R(4), far.ey + R(4),
    ];
    p.poly(bell, m.sleeveF, { part: 'sleeveF', bevel: 5, tone: -0.1 });
    stroke(p, [far.ex + R(2), far.ey + R(4), wx - R(4), wy + R(19)], m.fold, 'sleeveF');
    // Край обшлага — снизу вверх (рукав слева от хода).
    trimEdge(p, m, [wx - R(3.5), wy + R(24), wx - R(1.5), wy + R(14), wx + nUp[0] * R(2) + R(0.8), wy + R(5), wx + nUp[0] * R(6), wy + nUp[1] * R(6)], 'sleeveF', 2);
    p.ellipse(far.hx, far.hy, R(4.4), R(4.2), m.fistF, { part: 'fistF', lift: 1, tone: 0.02 });
    stroke(p, [far.hx - R(1.5), far.hy - R(3), far.hx + R(2.5), far.hy + R(1)], m.skinDark, 'fistF');

    // Пелерина на плечах — поверх рукава и полы; кромка по низу.
    // Низ пелерины: A — ровный край листа, B — фестоны клиньями, C — лохмотья.
    const capeEdge = L.id === 'a' ? S(...CAPELET_EDGE_N) : L.id === 'b' ? tatters(S(...CAPELET_EDGE_N), R(6), R(9), -1, [1]) : tatters(S(...CAPELET_EDGE_N), R(2.5), R(3.5), -1);
    p.poly([...S(...CAPELET.slice(0, 16)), ...capeEdge, ...S(...CAPELET.slice(28))], m.capelet, { part: 'capelet', bevel: 8, lift: 1 });
    // Плечо под пелериной — купол: ткань лежит на нём, свет сверху слева.
    p.ellipse(...PT(68, 86), R(15), R(9), m.capelet, { part: 'capelet', lift: 2, rot: -0.45 });
    fold(p, m, S(70, 78, 60, 93), 'capelet');
    fold(p, m, S(78, 80, 72, 89), 'capelet');
    trimEdge(p, m, capeEdge, 'capelet', 2.2);
    trimEdge(p, m, S(...CAPELET_EDGE_F), 'capelet', 2, -0.1);

    // Капюшон с воротником: кивает вокруг шеи.
    p.pose({ rot: P.head * DEG, px: M.neck[0], py: M.neck[1] }, () => hood(p, m, L));
  });

  // Свет посоха — поверх всего, прямо в мире: кулак поворачивает посох, пламя стоит.
  const [lx, ly] = toWorld(...staffPt(far.hx, far.hy, SW, RING_C[0], RING_C[1]));
  staffLight(p, m, L, lx, ly, P.glow);

  if (mageProbe.on) {
    const [hwx, hwy] = toWorld(far.hx, far.hy), [swx, swy] = toWorld(M.armF.sh[0], M.armF.sh[1]), [ewx, ewy] = toWorld(far.ex, far.ey);
    const [bwx, bwy] = toWorld(...staffPt(far.hx, far.hy, SW, -STAFF_BUTT, 0));
    const nrm = (a: number): number => { a = ((a % 360) + 360) % 360; return a > 180 ? a - 360 : a; };
    mageProbe.on({
      ...probeInfo, hipX: PELVIS[0] + udx, hipY: PELVIS[1] + udy, handX: hwx, handY: hwy, tipX: lx, tipY: ly, ground: G,
      shX: swx, shY: swy, elX: ewx, elY: ewy, butX: bwx, butY: bwy, wrist: nrm(SW - far.a2), elbow: 180 - Math.abs(nrm(far.a2 - far.a1)),
    });
  }
}

/**
 * Капюшон в координатах листа (поворот головы — снаружи): купол с заломленной макушкой, проём лица в тени — скула
 * и спинка носа на свету, ниже тёмная маска, как на прежнем портрете; бровь капюшона — кромкой облика; клин
 * воротника на груди. B — звезда-застёжка на клине; C — рваная бровь зубцами над лицом, седая борода из тени.
 */
function hood(p: Painter, m: Mats, L: LookSpec): void {
  if (L.id === 'c') {
    // Хвост капюшона отшельника — висит от макушки по спине на пелерину.
    p.poly([...S(80, 57, 74, 59, 67, 65, 61, 74, 57.5, 84), ...tatters(S(57.5, 84, 56, 93, 60, 93), R(2), R(2.2), 1).slice(2), ...S(63, 86, 68, 76, 74, 68, 80, 63)], m.hood, { part: 'hood', bevel: 3, tone: -0.06 });
  }
  p.poly(S(...HOOD), m.hood, { part: 'hood', bevel: 7, lift: 1.5 });
  // Голова под тканью — купол: капюшон круглится по черепу, а не плоский лоскут.
  p.ellipse(...PT(95, 67), R(13), R(13), m.hood, { part: 'hood', lift: 2.5 });
  // Залом макушки — тень под выступом, складки от макушки назад.
  p.poly(S(...HOOD_FOLD), m.hood, { part: 'hood', paint: true, tone: -0.4 });
  stroke(p, S(90, 55, 81, 67), m.fold, 'hood');
  stroke(p, S(99, 55, 90, 70), m.fold, 'hood');
  // Проём лица — почти чёрная тень; лицо — своя часть поверх (скула, нос), маска ниже — тёмная ткань.
  p.poly(S(...FACE_HOLE), m.dark, { part: 'hood', paint: true });
  p.poly(S(...FACE_LIT), m.face, { part: 'face', bevel: 0.8, tone: -0.22, flat: 0.7 });
  p.poly(S(...NOSE), m.face, { part: 'face', paint: true, tone: 0.18 });
  p.poly(S(...SOCKET), m.dark, { part: 'face', paint: true });
  if (L.id === 'c' && m.beard) {
    // Борода из тени на клин воротника: клин прядей, кончик раздвоен.
    p.poly(S(95, 81, 101, 79.5, 108, 79.5, 109.5, 84, 108, 91, 105.5, 97, 103, 102, 101.5, 108, 99.5, 101, 97.5, 95, 95.5, 88), m.beard, { part: 'beard', bevel: 2.2, tone: 0.05 });
    // Усы — тень под носом, пряди — светлые черты вниз к кончику.
    stroke(p, S(99, 81, 107, 80.5), m.beard.ramp![1], 'beard');
    stroke(p, S(100, 84, 101, 100), m.beard.ramp![4], 'beard');
    stroke(p, S(104.5, 84, 103.5, 97), m.beard.ramp![4], 'beard');
  } else {
    // Маска — тёмная ткань ниже носа, чуть светлее тени проёма; верхний край — складкой.
    p.poly(S(...MASK), solid(L.id === 'b' ? '#141826' : '#1b1726'), { part: 'hood', paint: true });
    stroke(p, S(94, 80.5, 107.5, 80), L.id === 'b' ? '#252c3e' : '#2c2638', 'hood');
  }
  // Бровь капюшона — кромкой; у отшельника — рваные зубцы ткани над лицом.
  if (L.id === 'c') {
    p.poly([...S(113, 62, 106, 66, 100, 70, 94, 74, 91, 77), ...tatters(S(91, 77, 94, 76.5, 100, 73, 106, 69, 113, 63.5), R(3), R(3), 1).slice(2)], m.hood, { part: 'hoodRag', bevel: 1.2, tone: 0.05 });
  } else {
    trimEdge(p, m, S(...BROW), 'hood', 2.4, 0.1);
  }
  trimEdge(p, m, S(...HOOD_EDGE), 'hood');
  if (L.id === 'b' && m.trim) {
    // Серебряная звезда на боку капюшона — знак ордена звездочётов.
    const [hx, hy] = PT(88, 65);
    p.poly([hx, hy - R(3.4), hx + R(0.9), hy - R(0.9), hx + R(3.4), hy, hx + R(0.9), hy + R(0.9), hx, hy + R(3.4), hx - R(0.9), hy + R(0.9), hx - R(3.4), hy, hx - R(0.9), hy - R(0.9)], m.trim, { part: 'hood', paint: true, tone: 0.3 });
    // Звезда-застёжка на клине воротника.
    const [cx, cy] = PT(92, 94);
    p.poly([cx, cy - R(4), cx + R(1.2), cy - R(1.2), cx + R(4), cy, cx + R(1.2), cy + R(1.2), cx, cy + R(4), cx - R(1.2), cy + R(1.2), cx - R(4), cy, cx - R(1.2), cy - R(1.2)], m.trim, { part: 'brooch', lift: 1, bevel: 0.8 });
  }
}
