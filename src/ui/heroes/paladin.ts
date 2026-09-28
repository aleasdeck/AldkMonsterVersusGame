import { type Mat, type Painter } from '../mobs/pixel';
import type { AvatarSpec } from './avatar';
import type { HeroModel, HeroProbe } from './model';
import { clipAt, HERO_CLIPS, poseAt, type PoseKeys, type SculptClip } from './clips';
import { arcStroke, at, DEG, ease, ik, lerp, limb2, reachFoot, solid, stroke } from './rig';

/**
 * Паладин пиксельной лепкой — шаги 2–3 рецепта (docs/lepka-geroev.md): модель в стойке и облики на обсуждение.
 * В игру ещё не входит: записи в `HERO_MODELS` нет, инструменты находят модель по имени файла (`paladinModel()`),
 * страница обсуждения — tools/hero-proto/paladin-page.ts. Клипов пока нет — сначала облик (порядок пользователя
 * на Воине); поля позы те же, что у Воина, поэтому его ключи клипов переносятся почти целиком.
 *
 * Референс — прежний рисованный лист `src/assets/heroes/paladin.png` (один ряд покоя, ячейка 188, фигура 180).
 * Мерки сняты с первого кадра в пикселях листа и переведены в единицы поля при росте 132 (k = 132 / 180):
 * ведро-шлем с золотым крестом в четверть роста сидит низко в золочёном горжете, наплечники круглые с золотой
 * кромкой, белый табард с красным крестом на груди и длинным полотнищем между ног, красный плащ за спиной, молот
 * с золотой обмоткой древка держится у бедра — боёк у ближнего колена, щит-«утюг» с крестом от плеча до колена,
 * стойка широкая и низкая.
 *
 * Смотрит вправо, на врагов. Ближняя сторона — левая (рука с молотом поверх туловища), дальняя — правая (рука со
 * щитом за туловищем, щит перед ним). Свет общий с врагами — сверху слева, из-за спины героя.
 *
 * Облики A, B, C — одна лепка с разными материалами; шлем и оружие выбираются отдельно. После выбора лишнее уйдёт,
 * как у Воина (его варианты — в истории ветки).
 */

// ─── Облики ─────────────────────────────────────────────────────────────────

export type PaladinLookId = 'A' | 'B' | 'C';
/**
 * Шлем: `great` — топхельм с золотым крестом на лице (как на листе), `crown` — он же с золотым венцом, `barbute` —
 * барбют с Т-вырезом, кромка которого золочёная и читается крестом. Первые варианты — ведро, «сахарная голова»,
 * ведро с плюмажем — отвергнуты: «огромный квадратный», «не хватает текстурности».
 */
export type PaladinHelm = 'great' | 'crown' | 'barbute';
/** Оружие: `hammer` — молот с листа, `mace` — булава (стартовое оружие Паладина в игре). */
export type PaladinWeapon = 'hammer' | 'mace';

export interface PaladinLook {
  id: PaladinLookId;
  name: string;
  /** Латы рук и ног, кираса, шлем, боёк оружия — одна сталь, разные объекты (своё зерно фактуры). */
  limb: Mat;
  chest: Mat;
  helm: Mat;
  head: Mat;
  /**
   * Золочёные лямки наплечников и наколенники (C); иначе — сталь с золотой кромкой. Колпаки наплечников стальные
   * у всех: золотой колпак целиком читался шаром.
   */
  gilt: boolean;
  gold: Mat;
  /** Золотая кромка на свету и в тени. */
  goldLit: string;
  goldDark: string;
  /** Табард и его складки. */
  tabard: Mat;
  fold: string;
  /** Крест, кайма табарда. */
  red: Mat;
  cape: Mat;
  /** Складка плаща. */
  capeFold: string;
  shieldFace: Mat;
  leather: Mat;
  wood: Mat;
  /** Стык пластин, светлая кромка стали, кромка в тени, отблески. */
  seam: string;
  edge: string;
  dim: string;
  glint: string;
  glintDim: string;
}

/** Сталь: свой объект на каждую часть — у каждой своё зерно фактуры. */
function steelOf(ramp: string[], metal: number, tex: Mat['tex']): () => Mat {
  return () => ({ base: ramp[2], ramp, dither: 0.3, metal, tex });
}

const A_STEEL = steelOf(['#211a1e', '#433a3f', '#6a5f63', '#9c9090', '#d6ccc4'], 0.7, { kind: 'noise', scale: 1.8, amp: 0.14 });
const B_STEEL = steelOf(['#191417', '#352e32', '#564d51', '#857a7a', '#b8aea4'], 0.6, { kind: 'spots', scale: 2.4, amp: 0.2, density: 0.18 });
const C_STEEL = steelOf(['#29242a', '#4e474d', '#7a7276', '#b0a8a6', '#ece6dc'], 0.8, { kind: 'noise', scale: 1.6, amp: 0.1 });

export const PALADIN_LOOKS: Record<PaladinLookId, PaladinLook> = {
  // A — как на листе: светлая сталь, яркое золото кромок, белый табард и красный крест, красный плащ.
  A: {
    id: 'A',
    name: 'Храмовник',
    limb: A_STEEL(), chest: A_STEEL(), helm: A_STEEL(), head: A_STEEL(),
    gilt: false,
    gold: { base: '#a86c20', ramp: ['#3a2208', '#6a420f', '#a06a20', '#d09a38', '#f2d07a'], dither: 0, metal: 0.6 },
    goldLit: '#e2b04e', goldDark: '#7a4c16',
    tabard: { base: '#dcc8ba', ramp: ['#5e4c46', '#a08a80', '#cdb8aa', '#e9d8ca', '#fbf2e8'], tex: { kind: 'stripes', scale: 2.6, amp: 0.08, angle: 1.5 } },
    fold: '#a8928a',
    red: { base: '#8e242c', ramp: ['#2a0a0e', '#521419', '#7e1f27', '#a53236', '#c84a44'], dither: 0 },
    cape: { base: '#7e1f27', ramp: ['#24080c', '#4a1218', '#761c24', '#9a2a30', '#b8423e'], shag: 0.2, tex: { kind: 'stripes', scale: 2.4, amp: 0.14, angle: 1.5 } },
    capeFold: '#3a0c12',
    shieldFace: { base: '#e2d0c2', ramp: ['#5a4a44', '#9a8680', '#c8b4a8', '#e6d6c8', '#f8eee4'], tex: { kind: 'noise', scale: 2.4, amp: 0.1 } },
    leather: { base: '#5a3a26' },
    wood: { base: '#4e3222', tex: { kind: 'stripes', scale: 2, amp: 0.14, angle: 0 } },
    seam: '#1a1215', edge: '#c8bab4', dim: '#4a3e42', glint: '#f0e8e0', glintDim: '#c4b8b2',
  },
  // B — мрачнее, в тон врагам: тусклая побитая сталь, латунь вместо золота, табард цвета пепла с грязным подолом,
  // крест и плащ цвета запёкшейся крови, плащ длиннее и рванее.
  B: {
    id: 'B',
    name: 'Пепельный храмовник',
    limb: B_STEEL(), chest: B_STEEL(), helm: B_STEEL(), head: B_STEEL(),
    gilt: false,
    gold: { base: '#8a6230', ramp: ['#2a1a0a', '#4c3216', '#7a5528', '#a67c40', '#d0aa66'], dither: 0, metal: 0.5 },
    goldLit: '#bf9652', goldDark: '#5a3c1a',
    tabard: { base: '#aa9a88', ramp: ['#3a302c', '#6a5c52', '#978676', '#bcac98', '#d8cab4'], shag: 0.12, tex: { kind: 'noise', scale: 2.2, amp: 0.18 } },
    fold: '#6a5c52',
    red: { base: '#6e1a20', ramp: ['#200709', '#3e0e12', '#62171c', '#842428', '#a0383a'], dither: 0 },
    cape: { base: '#5e161c', ramp: ['#1c0609', '#380c11', '#5c151b', '#7e2026', '#9a3432'], shag: 0.3, tex: { kind: 'stripes', scale: 2.2, amp: 0.16, angle: 1.5 } },
    capeFold: '#24070b',
    shieldFace: { base: '#b2a290', ramp: ['#3e342e', '#6e6056', '#9c8c7c', '#c0b09c', '#dccdb6'], tex: { kind: 'noise', scale: 2, amp: 0.2 } },
    leather: { base: '#3e2a1e' },
    wood: { base: '#3a281c', tex: { kind: 'stripes', scale: 2, amp: 0.14, angle: 0 } },
    seam: '#140e11', edge: '#a89c96', dim: '#3a3034', glint: '#d8cec4', glintDim: '#a89e98',
  },
  // C — белое и золото: зеркальная сталь, золочёные наплечники, наколенники и раструбы, белый плащ и плюмаж;
  // единственный цвет — красный крест.
  C: {
    id: 'C',
    name: 'Светоносец',
    limb: C_STEEL(), chest: C_STEEL(), helm: C_STEEL(), head: C_STEEL(),
    gilt: true,
    gold: { base: '#9a6c26', ramp: ['#34200a', '#664214', '#9a6c26', '#c89a44', '#ecd08a'], dither: 0, metal: 0.7 },
    goldLit: '#eec060', goldDark: '#80521a',
    tabard: { base: '#e2d4c6', ramp: ['#625650', '#a4968c', '#d2c4b6', '#ece0d2', '#fdf6ec'], tex: { kind: 'stripes', scale: 2.6, amp: 0.08, angle: 1.5 } },
    fold: '#aa9c92',
    red: { base: '#9a262e', ramp: ['#2c0a0e', '#56141a', '#86222a', '#ac3438', '#cc4c46'], dither: 0 },
    cape: { base: '#d8cabc', ramp: ['#4e443e', '#8c7e74', '#bcaea0', '#dccec0', '#f4ece0'], shag: 0.18, tex: { kind: 'stripes', scale: 2.4, amp: 0.12, angle: 1.5 } },
    capeFold: '#8c7e74',
    shieldFace: { base: '#e8dccc', ramp: ['#5e5248', '#a09284', '#cec0b0', '#ece0d0', '#fcf6ec'], tex: { kind: 'noise', scale: 2.4, amp: 0.08 } },
    leather: { base: '#5e3e28' },
    wood: { base: '#553824', tex: { kind: 'stripes', scale: 2, amp: 0.14, angle: 0 } },
    seam: '#201a1e', edge: '#d8d0cc', dim: '#5a5054', glint: '#fff8f0', glintDim: '#d4ccc6',
  },
};

const SLIT = '#0b080b';
/** Лицевая плоскость шлема к свету светлее на полступени: голову выделяет форма, а не другой материал. */
const FACE_TONE = 0.08;

// ─── Мерки ──────────────────────────────────────────────────────────────────

/**
 * Мерки стойки в единицах поля: рост 132, земля 136, рамка фигуры ≈ 122 × 132 (на листе 166 × 180).
 * Перевод с листа: x = 5 + (px − 12)·k, y = 136 − (184 − py)·k, k = 132 / 180. Ближнее — слева, дальнее — справа.
 */
const G = 136;
/** Масштаб шлема: ведро в мерку листа (1) читалось «огромным»; купол и киль мельче и объёмнее. */
const HELM_SCALE = 0.95;
/** Сутулость меньше, чем у Воина: Паладин на листе стоит прямее, голова подана вперёд горжетом, а не наклоном. */
const HUNCH = 5 * DEG;
const M = {
  /** Центр шлема и шея (опора наклона головы); шлем ≈ 26 × 31 — четверть роста. */
  helm: [66, 20],
  neck: [65, 37],
  legN: { hip: [55, 77], knee: [37, 99], ank: [28, 123], toe: 180 },
  legF: { hip: [79, 77], knee: [99, 97], ank: [103, 122], toe: 0 },
  /** Ближняя рука висит вдоль тела: кулак у бедра, молот наискось вниз-вперёд, боёк у ближнего колена. */
  armN: { sh: [28, 41], el: [23, 59], hand: [21, 75], weapon: 26 },
  /** Дальняя рука за щитом; центр щита — опора его перспективы. */
  armF: { sh: [87, 42], el: [93, 56], hand: [100, 63], shield: [106, 68] },
};

const len = (a: readonly number[], b: readonly number[]): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
const dir = (a: readonly number[], b: readonly number[]): number => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const ARM_N = { l1: len(M.armN.sh, M.armN.el), l2: len(M.armN.el, M.armN.hand), a1: dir(M.armN.sh, M.armN.el), a2: dir(M.armN.el, M.armN.hand) };
const ARM_F = { l1: len(M.armF.sh, M.armF.el), l2: len(M.armF.el, M.armF.hand), a1: dir(M.armF.sh, M.armF.el), a2: dir(M.armF.el, M.armF.hand) };
const LEG_N = { l1: len(M.legN.hip, M.legN.knee), l2: len(M.legN.knee, M.legN.ank) };
const LEG_F = { l1: len(M.legF.hip, M.legF.knee), l2: len(M.legF.knee, M.legF.ank) };
/** Таз — опора наклона верха; бёдра ног — от него на ±12. */
const PELVIS: [number, number] = [67, 75];

/** От кулака до середины бойка: молот держится у верхней трети древка, булава — у навершия. */
const HEAD_AT: Record<PaladinWeapon, number> = { hammer: 32, mace: 30 };

/**
 * Кайма краской по части — полоса между дугами эллипса (cx, cy, rx, ry) и такой же, уже на `w`, от угла `a0` до `a1`:
 * золотая кромка наплечника и горжета. Штрих в пиксель читался ниткой, у листа кайма толстая.
 */
function rimBand(p: Painter, cx: number, cy: number, rx: number, ry: number, w: number, a0: number, a1: number, mat: Mat, part: string, rot = 0): void {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) / 360) * (rx + ry) * 1.4));
  const outer: number[] = [], inner: number[] = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  const put = (arr: number[], r1: number, r2: number, a: number): void => {
    const x = r1 * Math.cos(a * DEG), y = r2 * Math.sin(a * DEG);
    arr.push(cx + c * x - s * y, cy + s * x + c * y);
  };
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    put(outer, rx + 0.6, ry + 0.6, a);
    put(inner, rx - w, ry - w, a);
  }
  const pts = [...outer];
  for (let k = inner.length - 2; k >= 0; k -= 2) pts.push(inner[k], inner[k + 1]);
  p.poly(pts, mat, { part, paint: true });
}

/**
 * Золотая кромка вдоль ломаной `pts` (нижний край пластины, слева направо) шириной `w` внутрь пластины — краской по части.
 */
function edgeBand(p: Painter, pts: number[], w: number, mat: Mat, part: string): void {
  const inner: number[] = [];
  const n = pts.length / 2;
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
    const tx = pts[b * 2] - pts[a * 2], ty = pts[b * 2 + 1] - pts[a * 2 + 1], l = Math.hypot(tx, ty) || 1;
    inner.push(pts[k * 2] + (ty / l) * w, pts[k * 2 + 1] - (tx / l) * w);
  }
  const out = pts.map((v, k) => v + (k % 2 === 0 ? 0 : 0.6));
  for (let k = n - 1; k >= 0; k--) out.push(inner[k * 2], inner[k * 2 + 1]);
  p.poly(out, mat, { part, paint: true });
}

// ─── Шлем ───────────────────────────────────────────────────────────────────

/**
 * Шлем в своих координатах: центр (0, 0), лицо к врагам (вправо). Первое ведро было плоским многоугольником — «огромный
 * квадратный», без фактуры; теперь основа объёмная: у топхельма — вертикальный цилиндр со скруглённым верхом (свет
 * и блик металла ложатся по объёму, как на листе), у барбюта — купол с колоколом затылка. Лицо — киль к врагам:
 * две плоскости, левая на свету, правая в тени, золотая вертикаль креста по ребру, бровь над прорезью.
 * Фактура — зерно материала, царапины и заклёпки; низ шлема уходит в горжет (горжет рисуется после шлема).
 */
function helm(p: Painter, L: PaladinLook, kind: PaladinHelm): void {
  const H = L.helm;
  const o = { part: 'helm', paint: true };
  const slit = solid(SLIT);
  if (kind === 'crown') {
    // Зубцы венца на дальней стороне — за шлемом, торчат над макушкой.
    for (const a of [230, 270, 310]) crownTooth(p, L, a, 'crownBack');
  }
  if (kind === 'barbute') {
    // Барбют: купол черепа и щёки одной частью, затылок расходится колоколом к шее.
    p.ellipse(-0.5, -3.5, 11.5, 11.5, H, { part: 'helm', lift: 1 });
    p.poly([-11.8, -3, -13.2, 8, -12, 14.5, -4, 16, 5, 15.5, 10.5, 13, 11.8, 3, 11, -5], H, { part: 'helm', bevel: 4 });
    // Ребро по черепу от макушки к вырезу — светлой чертой, щека — в тени.
    stroke(p, [-2.5, -14.6, 2.5, -12, 5.6, -5.5], L.edge, 'helm');
    p.poly([8.6, -3.5, 11.8, -3.5, 11.8, 3, 10.5, 13, 8.6, 14], H, { ...o, tone: -0.14 });
    // Т-вырез: глаза поперёк, прорезь вниз — лицо в глубокой тени; золочёная кромка обводит крест.
    p.poly([-0.5, -6.6, 12.4, -6.6, 12.4, -3.2, 12, -2.4, 8.4, -2.2, 8.4, 15, 4.6, 15.2, 4.6, -2.2, -0.5, -2.2], L.gold, o);
    p.poly([0.9, -5.4, 11.8, -5.4, 11.8, -3.6, 7.2, -3.4, 7.2, 14.6, 5.8, 14.6, 5.8, -3.4, 0.9, -3.4], solid('#140e12'), o);
    stroke(p, [-0.4, -6.6, 12, -6.6], L.goldLit, 'helm');
    stroke(p, [4.6, -2, 4.6, 14.8], L.goldLit, 'helm');
    // Блик по куполу, царапины, заклёпки по краю щеки.
    stroke(p, [-8.5, -9.5, -5.5, -12.4, -1.5, -13.6], L.glint, 'helm');
    stroke(p, [-10.2, -4.5, -10.4, 1.5], L.glintDim, 'helm');
    stroke(p, [-7, 3, -5, 4.6], L.dim, 'helm');
    for (const [x, y] of [[-10.5, 11], [-7, 13.5], [-3.5, 14.5]]) p.px(x, y, L.glintDim);
    return;
  }
  // Топхельм: цилиндр со скруглённым верхом, лицевая пластина выступает к врагам; киль — на трёх пятых ширины, как на листе.
  p.limb(-1, -3, 10.8, -0.5, 6.5, 10.4, H, { part: 'helm' });
  p.poly([-2.5, -11, 3, -13.6, 9.5, -10.4, 12, -3.6, 12, 9, 9.4, 14, 3.2, 15.4, -2.5, 14], H, { part: 'helm', lift: 10, bevel: 2 });
  // Плоскости киля: левая к свету светлее, правая в тени; на свету — пятно блика.
  p.poly([-2.5, -11, 3, -13.6, 3.3, 15.4, -2.5, 14], H, { ...o, tone: FACE_TONE });
  p.poly([3, -13.6, 9.5, -10.4, 12, -3.6, 12, 9, 9.4, 14, 3.3, 15.4], H, { ...o, tone: -0.16 });
  p.poly([-1.5, -9.6, 1.6, -11, 1.8, -6.4, -1.5, -5.8], H, { ...o, tone: 0.2 });
  p.poly([-2.5, -2.4, 12, -2.8, 12, 1.4, -2.5, 1.8], slit, o);
  // Золотой крест: ребро по верху от затылка, вертикаль по килю, бровь над прорезью.
  p.poly([-6.2, -11.6, -1.5, -14, 2, -14.4, 4.4, -13.8, 4.4, -11.6, -0.8, -11.8, -5.6, -9.4], L.gold, o);
  p.poly([2, -14, 4.6, -13.6, 4.8, 15.2, 2.2, 15.4], L.gold, o);
  p.poly([-2.5, -5, 11.8, -5.4, 11.8, -2.8, -2.5, -2.4], L.gold, o);
  stroke(p, [-5.6, -12, -1.5, -14, 2, -14.2], L.goldLit, 'helm');
  stroke(p, [2.2, -12.5, 2.4, 14.6], L.goldLit, 'helm');
  stroke(p, [-2.5, -4.6, 1.8, -4.8], L.goldLit, 'helm');
  // Кромка между боком и лицом, блики по объёму, царапины, пояс заклёпок внизу.
  stroke(p, [-2.7, -10.6, -2.7, 13.6], L.edge, 'helm');
  stroke(p, [-9, -8.5, -6.6, -11.6, -3.5, -13], L.glint, 'helm');
  stroke(p, [-9.8, -3.5, -10, 3.5], L.glintDim, 'helm');
  stroke(p, [-8, 5, -6.2, 6.6], L.dim, 'helm');
  stroke(p, [-6, -6.8, -4.6, -5.4], L.dim, 'helm');
  stroke(p, [7.4, 5, 8.6, 7.5], L.dim, 'helm');
  for (const x of [-9.8, -7, -4.2]) p.px(x, 11.5, L.glintDim);
  if (kind === 'crown') {
    // Венец: золотой обруч вокруг макушки (передняя половина — поверх шлема) и зубцы-кресты над ним.
    const cx = -0.5, cy = -10.5, rx = 11, ry = 2.8;
    const band: number[] = [];
    for (let a = 0; a <= 180; a += 15) band.push(cx + rx * Math.cos(a * DEG), cy + ry * Math.sin(a * DEG) + 0.6);
    for (let a = 180; a >= 0; a -= 15) band.push(cx + rx * Math.cos(a * DEG), cy + ry * Math.sin(a * DEG) - 2.6);
    p.poly(band, L.gold, o);
    arcStroke(p, cx, cy - 2.4, rx, ry, 20, 160, L.goldLit, 'helm');
    for (const a of [20, 60, 100, 140]) crownTooth(p, L, a, 'crown');
  }
}

/** Зубец венца — узкий шип с золотым шариком над обручем в точке угла `a` (передние — поверх шлема, дальние — за ним). */
function crownTooth(p: Painter, L: PaladinLook, a: number, part: string): void {
  const x = -0.5 + 11 * Math.cos(a * DEG), y = -10.5 + 2.8 * Math.sin(a * DEG) - 2.2;
  const w = 1.2 * (0.5 + 0.5 * Math.abs(Math.sin(a * DEG)));
  const back = part === 'crownBack';
  p.poly([x - w, y, x, y - 3.6, x + w, y], L.gold, { part, bevel: 0.6, tone: back ? -0.15 : 0 });
  p.ellipse(x, y - 4.2, 1.1, 1.1, L.gold, { part, tone: back ? -0.15 : 0.05 });
}

// ─── Щит ────────────────────────────────────────────────────────────────────

/**
 * Щит-«утюг» в перспективе. Плоский щит описан в своих долях (u — поперёк, −1…1; v — вниз от верхней кромки,
 * острие на 1.63) и переведён в единицы от центра `M.armF.shield` аффинно — по трём точкам листа: верхние углы
 * и острие. Так верхняя кромка поднимается к врагам, а острие уходит к дальнему колену, как на листе.
 */
const SH_C: [number, number] = [-7.9, -24.3];
const SH_A: [number, number] = [10.5, -7.2];
const SH_B: [number, number] = [12, 36];
const shPt = (u: number, v: number): [number, number] => [SH_C[0] + u * SH_A[0] + v * SH_B[0], SH_C[1] + u * SH_A[1] + v * SH_B[1]];
const TIP = 1.63;

/** Контур щита с отступом от кромки: `ku` — поперёк (доля полуширины), `kv` — сверху и у острия. */
function heater(ku: number, kv: number): number[] {
  const w = 1 - ku, top = kv, tip = TIP - kv * 1.3, mid = 0.75;
  const right: Array<[number, number]> = [[w, top], [w * 1.08, mid], [w * 0.98, lerp(mid, tip, 0.38)], [w * 0.72, lerp(mid, tip, 0.7)], [w * 0.36, lerp(mid, tip, 0.91)]];
  const pts: number[] = [...shPt(-w, top), ...shPt(0, top - 0.06 * w)];
  for (const [u, v] of right) pts.push(...shPt(u, v));
  pts.push(...shPt(0, tip));
  for (let k = right.length - 1; k >= 1; k--) pts.push(...shPt(-right[k][0], right[k][1]));
  return pts;
}

/** Прямоугольник в долях щита → четырёхугольник в единицах (полосы креста). */
function shRect(u0: number, v0: number, u1: number, v1: number): number[] {
  return [...shPt(u0, v0), ...shPt(u1, v0), ...shPt(u1, v1), ...shPt(u0, v1)];
}

function shield(p: Painter, L: PaladinLook): void {
  // Золотой обод — фаской; поле — отдельная часть чуть выше обода (линия между ними — кромка).
  p.poly(heater(0, 0), L.gold, { part: 'shield', bevel: 2.5, flat: 0.6 });
  p.poly(heater(0.17, 0.07), L.shieldFace, { part: 'shieldIn', flat: 0.9, lift: 0.4, noLine: true });
  // Крест: вертикаль по оси щита до острия, перекладина на трети высоты.
  p.poly(shRect(-0.15, 0.05, 0.15, 1.5), L.red, { part: 'shieldIn', paint: true });
  p.poly(shRect(-0.85, 0.36, 0.85, 0.54), L.red, { part: 'shieldIn', paint: true });
  // Кромка обода на свету — сверху и слева; на дальней стороне — тёмная.
  stroke(p, [...shPt(-0.97, 0.02), ...shPt(0, -0.04), ...shPt(0.97, 0.02)], L.goldLit, 'shield');
  stroke(p, [...shPt(-0.99, 0.06), ...shPt(-1.06, 0.75), ...shPt(-0.96, 1.05)], L.goldLit, 'shield');
  stroke(p, [...shPt(1.06, 0.8), ...shPt(0.96, 1.08), ...shPt(0.7, 1.36), ...shPt(0.35, 1.54)], L.goldDark, 'shield');
  // Потёртости поля — тёмными зарубками.
  stroke(p, [...shPt(-0.62, 0.2), ...shPt(-0.44, 0.26)], L.fold, 'shieldIn');
  stroke(p, [...shPt(0.4, 0.9), ...shPt(0.58, 1.0)], L.fold, 'shieldIn');
  stroke(p, [...shPt(-0.5, 0.95), ...shPt(-0.36, 1.1)], L.fold, 'shieldIn');
}

// ─── Оружие ─────────────────────────────────────────────────────────────────

/**
 * Молот с листа: длинное древко с золотой обмоткой между кулаком и бойком, золотое навершие за кулаком, боёк —
 * гранёный барабан поперёк древка с золотыми поясами и маленьким крестом.
 */
function hammer(p: Painter, L: PaladinLook, x: number, y: number, a: number): void {
  const u: [number, number] = [Math.cos(a * DEG), Math.sin(a * DEG)];
  const n: [number, number] = [-u[1], u[0]];
  const [hx, hy] = at(x, y, a, HEAD_AT.hammer);
  /** Точка бойка: `s` — вдоль древка от середины бойка, `t` — поперёк. */
  const q = (s: number, t: number): [number, number] => [hx + u[0] * s + n[0] * t, hy + u[1] * s + n[1] * t];
  p.limb(...at(x, y, a, -12), 1.9, ...at(x, y, a, HEAD_AT.hammer - 6), 1.9, L.wood, { part: 'haft' });
  for (let s = 7; s <= 25; s += 3.6) {
    const [cx, cy] = at(x, y, a, s);
    stroke(p, [cx - n[0] * 2.2 - u[0] * 0.9, cy - n[1] * 2.2 - u[1] * 0.9, cx + n[0] * 2.2 + u[0] * 0.9, cy + n[1] * 2.2 + u[1] * 0.9], L.goldLit, 'haft');
  }
  p.ellipse(...at(x, y, a, -13), 2.8, 2.8, L.gold, { part: 'hPommel', lift: 1 });
  p.poly([...q(-9, -9), ...q(-6, -12.5), ...q(6, -12.5), ...q(9, -9), ...q(9, 9), ...q(6, 12.5), ...q(-6, 12.5), ...q(-9, 9)], L.head, { part: 'hHead', bevel: 3 });
  p.poly([...q(-9.5, -10.6), ...q(9.5, -10.6), ...q(9.5, -7.4), ...q(-9.5, -7.4)], L.gold, { part: 'hHead', paint: true });
  p.poly([...q(-9.5, 7.4), ...q(9.5, 7.4), ...q(9.5, 10.6), ...q(-9.5, 10.6)], L.gold, { part: 'hHead', paint: true });
  stroke(p, [...q(-7.6, -6), ...q(-7.6, 5)], L.glintDim, 'hHead');
  stroke(p, [...q(-5, -11.8), ...q(4, -11.8)], L.glint, 'hHead');
}

/**
 * Булава — стартовое оружие Паладина: короткая рукоять с кожаной обмоткой, золотое навершие, стальной пояс у головы,
 * золочёная голова с перьями вдоль оси (в профиль видно три пера) и стальной шип.
 */
function mace(p: Painter, L: PaladinLook, x: number, y: number, a: number): void {
  const u: [number, number] = [Math.cos(a * DEG), Math.sin(a * DEG)];
  const n: [number, number] = [-u[1], u[0]];
  const [hx, hy] = at(x, y, a, HEAD_AT.mace);
  const q = (s: number, t: number): [number, number] => [hx + u[0] * s + n[0] * t, hy + u[1] * s + n[1] * t];
  p.limb(...at(x, y, a, -7), 1.9, ...at(x, y, a, HEAD_AT.mace - 5), 1.8, L.wood, { part: 'haft' });
  for (let s = -4; s <= 6; s += 3) {
    const [cx, cy] = at(x, y, a, s);
    stroke(p, [cx - n[0] * 2.2 - u[0] * 0.9, cy - n[1] * 2.2 - u[1] * 0.9, cx + n[0] * 2.2 + u[0] * 0.9, cy + n[1] * 2.2 + u[1] * 0.9], '#2a1a12', 'haft');
  }
  p.ellipse(...at(x, y, a, -8.5), 2.8, 2.8, L.gold, { part: 'hPommel', lift: 1 });
  // Перья: два в профиль по краям, третье — ребром посередине; золотой пояс под головой, шип на конце.
  // Голова золочёная: стальная сливалась с набедренником и бедром за ней.
  p.poly([...q(-9, -3.5), ...q(-5, -11), ...q(5.5, -11.5), ...q(10, -4.5), ...q(10, 4.5), ...q(5.5, 11.5), ...q(-5, 11), ...q(-9, 3.5)], L.gold, { part: 'hHead', bevel: 2.2 });
  p.ellipse(...q(0.5, 0), 8.5, 6, L.gold, { part: 'hHead', lift: 2.5, rot: a * DEG });
  stroke(p, [...q(-6.5, 0), ...q(9, 0)], L.goldLit, 'hHead');
  stroke(p, [...q(-4.5, -10.4), ...q(5, -10.8)], L.goldLit, 'hHead');
  stroke(p, [...q(-4.5, 10.2), ...q(5, 10.6)], L.goldDark, 'hHead');
  p.ellipse(...q(-10, 0), 3.2, 3.6, L.head, { part: 'hCollar', rot: a * DEG, lift: 1 });
  p.poly([...q(9.5, -2.4), ...q(15.5, 0), ...q(9.5, 2.4)], L.head, { part: 'hHead', bevel: 1 });
}

// ─── Поза ───────────────────────────────────────────────────────────────────

/**
 * Поза героя — поля те же, что у Воина (`WarriorPose`, docs/lepka-geroev.md «Каркас позы»): его ключи клипов
 * переносятся почти целиком. Углы — градусы по `at` (0 — к врагам, 90 — вниз), наклоны — градусы, плюс к врагам.
 */
export interface PaladinPose extends Record<string, number> {
  x: number; y: number;
  crouch: number;
  lean: number;
  head: number;
  /** Ближняя рука (оружие): плечо, предплечье, оружие. */
  n1: number; n2: number; sw: number;
  /** Ближняя рука кистью: точка кисти в координатах верха и доля (0 — углы, 1 — кисть в точке). */
  nh: number; hx: number; hy: number;
  /** Дальняя рука (щит): плечо, предплечье; наклон щита и сдвиг от кисти. */
  f1: number; f2: number; sh: number; shx: number; shy: number;
  footF: number; footN: number; liftF: number; liftN: number;
  kneel: number;
  /** Плащ, плюмаж, полотнище табарда: 0 — висят, 1 — взвились назад. */
  cape: number;
  fall: number;
  drop: number;
  /** Свет на бойке (Молот света, клич), пыль у бойка, искры о кромку щита. */
  glow: number; dust: number; spark: number;
  /** Оружие поверх ближнего наплечника — для портрета. */
  front: number;
}

const REST: PaladinPose = {
  x: 0, y: 0, crouch: 0, lean: 0, head: 0,
  n1: ARM_N.a1, n2: ARM_N.a2, sw: M.armN.weapon,
  nh: 0, hx: M.armN.hand[0], hy: M.armN.hand[1],
  f1: ARM_F.a1, f2: ARM_F.a2, sh: 0, shx: 0, shy: 0,
  footF: 0, footN: 0, liftF: 0, liftN: 0, kneel: 0,
  cape: 0, fall: 0, drop: 0, glow: 0, dust: 0, spark: 0, front: 0,
};

/** Ключи клипов — шаг 4, после выбора облика. Пока все клипы рисуют стойку. */
const CLIPS: Partial<Record<Exclude<SculptClip, 'idle'>, PoseKeys<PaladinPose>>> = {};

function nearArm(P: PaladinPose): { ex: number; ey: number; hx: number; hy: number; a1: number; a2: number } {
  const [sx, sy] = M.armN.sh;
  const byAngle = limb2(sx, sy, P.n1, ARM_N.l1, P.n2, ARM_N.l2);
  if (P.nh < 0.001) return { ...byAngle, a1: P.n1, a2: P.n2 };
  let tx = lerp(byAngle.hx, P.hx, P.nh), ty = lerp(byAngle.hy, P.hy, P.nh);
  const vx = tx - sx, vy = ty - sy, d = Math.hypot(vx, vy), reach = ARM_N.l1 + ARM_N.l2 - 0.05;
  if (d > reach) {
    tx = sx + (vx * reach) / d;
    ty = sy + (vy * reach) / d;
  }
  const [ex, ey] = ik(sx, sy, tx, ty, ARM_N.l1, ARM_N.l2, -vy, vx);
  return { ex, ey, hx: tx, hy: ty, a1: Math.atan2(ey - sy, ex - sx) / DEG, a2: Math.atan2(ty - ey, tx - ex) / DEG };
}

/** Зонд: точки кадра — таз, кисть, середина бойка, стопы. */
export const paladinProbe: HeroProbe = { grounded: ['heal', 'heavy', 'death'] };

function framePose(p: Painter): PaladinPose {
  const c = clipAt(p);
  const keys = c ? CLIPS[c.clip as Exclude<SculptClip, 'idle'>] : undefined;
  const P = c && keys ? poseAt(REST, keys, c.f, c.n, HERO_CLIPS[c.clip].hold) : { ...REST };
  // Покой в ногах: таз оседает на два пикселя на четверть цикла дыхания позже груди — колени подгибаются, а верх
  // догоняет волной; раз за цикл вес переходит с ноги на ногу, и задняя нога, почти прямая в стойке, на переносе
  // вперёд отрывает пятку. Стопы стоят. Без этого дышал только верх и ноги стояли намертво («ноги снизу не двигаются
  // совсем»). Сдвиги — целыми пикселями, иначе латы на ногах рябят.
  if (!c) {
    P.crouch += p.bob(3, 2, 0.25);
    P.x += p.snap(1.4 * p.wave(1, 0.3));
  }
  // Покой: молот и щит чуть качаются, плащ колышется, раз за цикл шлем поворачивается к врагам.
  P.sw += 1.2 * p.wave(1, 0.15);
  P.sh += 1 * p.wave(1, 0.55);
  P.cape += 0.05 * (1 - Math.cos(2 * Math.PI * p.t));
  P.head += 3 * p.blink(0.62, 0.16);
  return P;
}

/**
 * Черновик аватарки (шаг 5 — после клипов): бюст из кадра покоя на золотом фоне прежнего портрета. Своя поза
 * портрета появится вместе с клипами.
 */
const AVATAR: AvatarSpec = {
  crop: [18, -6, 96],
  halo: [66, 20, 30],
  colors: { top: '#6a4410', bottom: '#1f1306', halo: '#a8741f', haloEdge: '#d09a38', skyline: '#2a1a08', frameDark: '#120a04', frame: '#4a2e0e', frameLight: '#8a5a1e' },
  skyline: [[0.06, 0.1, 0.6, 0.2], [0.14, 0.06, 0.5, 0.12], [0.9, 0.08, 0.62, 0.2], [0.96, 0.06, 0.5, 0.1]],
};

/** Паладин в облике `look`; рост в покое — `HERO_BODY_HEIGHT.paladin` (132) в пикселе `HERO_PIXEL`. */
export function paladinModel(look: PaladinLookId = 'B', helmKind: PaladinHelm = 'great', weapon: PaladinWeapon = 'hammer'): HeroModel {
  const L = PALADIN_LOOKS[look];
  return {
    id: 'paladin',
    avatar: AVATAR,
    probe: paladinProbe,
    w: 132,
    h: 140,
    ground: G,
    pad: 80,
    draw: (p: Painter) => drawPaladin(p, framePose(p), L, helmKind, weapon),
  };
}

/** Свечение на бойке: Молот света, клич. */
function headGlow(p: Painter, x: number, y: number, a: number, len2: number, glow: number): void {
  if (glow <= 0.02) return;
  const [gx, gy] = at(x, y, a, len2);
  p.glow(gx, gy, 7 + 10 * glow, '#ffe2a8', 0.3 + 0.35 * glow);
  if (glow > 0.5) p.px(gx, gy, '#fff6e0');
}

function drawPaladin(p: Painter, P: PaladinPose, L: PaladinLook, helmKind: PaladinHelm, weapon: PaladinWeapon): void {
  const breath = p.bob(2, 2);
  const turn = p.blink(0.62, 0.16);
  const fall = ease(Math.max(0, Math.min(1, P.fall)));
  const bounce = P.fall > 1 ? (P.fall - 1) * 50 : 0;
  const hipX = lerp(PELVIS[0], PELVIS[0] - 6, fall);
  const hipY = lerp(PELVIS[1] + P.crouch, G - 16, fall) - bounce;
  const rot = lerp(HUNCH + P.lean * DEG, -Math.PI / 2, fall);
  const up = { dx: hipX - PELVIS[0], dy: hipY - PELVIS[1] - breath * (1 - fall), rot, px: PELVIS[0], py: PELVIS[1] };
  const probeInfo: Record<string, number> = {};
  const toWorld = (x: number, y: number): [number, number] => {
    const c = Math.cos(rot), s = Math.sin(rot);
    return [PELVIS[0] + c * (x - PELVIS[0]) - s * (y - PELVIS[1]) + up.dx, PELVIS[1] + s * (x - PELVIS[0]) + c * (y - PELVIS[1]) + up.dy];
  };
  const drawWeapon = (x: number, y: number, a: number): void => (weapon === 'hammer' ? hammer(p, L, x, y, a) : mace(p, L, x, y, a));
  const headLen = HEAD_AT[weapon];
  /** Золочёные детали (облик C) — золото, иначе сталь. */
  const plate = (steel: Mat): Mat => (L.gilt ? L.gold : steel);

  p.pose({ dx: P.x, dy: P.y }, () => {
    p.shadow(66 - 10 * fall - P.x * 0.5 * (1 - fall), 50 + 16 * fall, 4);

    if (fall > 0.55) p.poly([hipX - 78, G - 5, hipX - 34, G - 7, hipX + 2, G - 4, hipX + 4, G, hipX - 82, G], L.cape, { part: 'capeGround', tone: -0.18 });

    // ── Плащ — за спиной от плеч почти до земли: виден слева за ближней рукой и между ног. ──
    if (fall < 0.6) {
      p.pose(up, () => {
        const fl = P.cape, keep = 1 - fall / 0.6;
        const pts = [52, 30, 38, 33, 28, 44, 21, 64, 15, 86, 12, 105, 17, 101, 20, 109, 25, 101, 30, 108, 36, 102, 44, 114, 52, 110, 58, 120, 64, 113, 70, 121, 76, 114, 83, 119, 88, 108, 87, 78, 82, 48, 72, 32];
        for (let k = 0; k < pts.length; k += 2) {
          const t = Math.max(0, (pts[k + 1] - 30) / 92);
          pts[k + 1] = 30 + (pts[k + 1] - 30) * keep - fl * 34 * t * t;
          pts[k] = pts[k] - fl * 30 * t;
        }
        p.poly(pts, L.cape, { part: 'cape', tone: -0.14, bevel: 3 });
        stroke(p, [30, 50, 22, 92], L.capeFold, 'cape');
      });
    }

    // ── Ноги: бедро от таза, колено — ik, стопы стоят на земле (как у Воина). ──
    const legRot = lerp(0, -Math.PI / 2, fall);
    const legs = [
      { g: M.legF, L2: LEG_F, side: 'far', tone: -0.05, off: [12, 2], foot: P.footF, lift: P.liftF, kneel: 0, lie: [hipX + 46, G - 6], lieRot: -1.4, bend: [lerp(1, 0.2, fall), lerp(-0.2, -1, fall)] },
      { g: M.legN, L2: LEG_N, side: 'near', tone: 0, off: [-12, 2], foot: P.footN, lift: P.liftN, kneel: P.kneel, lie: [hipX + 40, G - 5], lieRot: 1.4, bend: [lerp(-1, 0.3, fall), lerp(-0.2, -1, fall)] },
    ] as const;
    for (const lg of legs) {
      const c = Math.cos(legRot), sn = Math.sin(legRot);
      const hx = hipX + c * lg.off[0] - sn * lg.off[1], hy = hipY + sn * lg.off[0] + c * lg.off[1];
      const out = lg.g.toe === 0 ? 1 : -1;
      const floor = lg.g.ank[1] - P.y;
      let ax = lg.g.ank[0] + lg.foot - P.x, ay = floor - lg.lift;
      let bend: [number, number] = [lg.bend[0], lg.bend[1]];
      let toe = 0;
      if (lg.kneel > 0) {
        ax = lerp(ax, hx + 6 - 23.5, lg.kneel);
        ay = lerp(ay, G - P.y - 17, lg.kneel);
        bend = [lerp(bend[0], 0.3, lg.kneel), lerp(bend[1], 1, lg.kneel)];
        toe += 0.5 * lg.kneel;
      }
      [ax, ay] = reachFoot(hx, hy, ax, ay, lg.L2.l1 + lg.L2.l2 - 0.2);
      toe += Math.max(0, floor - ay) / 14;
      ax = lerp(ax, lg.lie[0], fall);
      ay = lerp(ay, lg.lie[1], fall);
      const toeRot = lerp(toe, lg.lieRot, fall);
      if (lg.side === 'far') probeInfo.footF = ax + P.x;
      else probeInfo.footN = ax + P.x;
      const [kx, ky] = ik(hx, hy, ax, ay, lg.L2.l1, lg.L2.l2, bend[0], bend[1]);
      const tone = lg.tone;
      const far = lg.side === 'far';
      const leg = `${lg.side}Leg`, knee = `${lg.side}Knee`, foot = `${lg.side}Foot`;
      p.limb(hx, hy, 9.5, kx, ky, 7.5, L.limb, { part: leg, tone });
      p.limb(kx, ky, 7.4, ax, ay, 6, L.limb, { part: leg, tone });
      const mx = (hx + kx) / 2, my = (hy + ky) / 2;
      stroke(p, [mx - 7.5, my + 1 * out, mx + 7.5, my - 1 * out], L.seam, leg);
      stroke(p, [kx + 4, ky + 5, ax + 3.5, ay - 3], L.edge, leg);
      // Башмак: носок наружу, подошва на земле; по подъёму — золотой пояс.
      const S = G - lg.g.ank[1] - 0.5;
      p.pose({ rot: toeRot * out, px: ax, py: ay }, () => {
        p.poly([ax - 6, ay - 2.5, ax + 6, ay - 2.5, ax + 18 * out, ay + S - 4.5, ax + 15 * out, ay + S, ax - 7 * out, ay + S], L.limb, { part: foot, tone: tone - 0.04, bevel: 2.8 });
        stroke(p, [ax - 5.5, ay + 1.5, ax + 5.5, ay + 1.5], far ? L.goldDark : L.goldLit, foot);
        stroke(p, [ax - 5.5, ay + 2.6, ax + 5.5, ay + 2.6], L.goldDark, foot);
        stroke(p, [ax + 3 * out, ay + 7, ax + 10 * out, ay + S - 3], L.seam, foot);
      });
      // Наколенник — чаша с крылом наружу и золотой кромкой.
      p.ellipse(kx, ky, 8.6, 7.6, plate(L.limb), { part: knee, lift: 1.5, tone: tone + 0.04 });
      p.poly([kx - 1 * out, ky - 4, kx + 11 * out, ky - 1, kx + 9 * out, ky + 5, kx, ky + 4], plate(L.limb), { part: knee, tone: tone - 0.02, bevel: 2 });
      rimBand(p, kx, ky, 8.6, 7.6, 2, 15, 165, L.gold, knee);
      arcStroke(p, kx, ky, 8.2, 7.2, 30, 150, far ? L.goldDark : L.goldLit, knee);
    }

    // ── Верх: наклон вокруг таза, дыхание. ──
    const near = nearArm(P);
    const far = limb2(M.armF.sh[0], M.armF.sh[1], P.f1, ARM_F.l1, P.f2, ARM_F.l2);
    p.pose(up, () => {
      p.limb(M.armF.sh[0], M.armF.sh[1], 7, far.ex, far.ey, 6, L.limb, { part: 'farArm', tone: -0.16 });
      p.limb(far.ex, far.ey, 6, far.hx, far.hy, 5, L.limb, { part: 'farArm', tone: -0.16 });

      // Туловище: таз, живот и кираса одной частью; сверху — табард краской по кирасе: белое поле с красным крестом.
      p.ellipse(67, 71, 18, 8, L.chest, { part: 'torso', tone: -0.06 });
      p.ellipse(67, 60, 17.5, 11, L.chest, { part: 'torso' });
      p.ellipse(67, 47, 21.5, 15.5, L.chest, { part: 'torso', lift: 1.5 });
      // Табард на груди — своя плоская ткань поверх кирасы: краской по куполу кирасы белое уходило в тень.
      p.poly([53, 37, 68, 34, 86, 37, 88, 50, 85, 65, 54, 66, 51, 51], L.tabard, { part: 'surcoat', flat: 0.55, lift: 1, bevel: 3.5 });
      p.poly([66, 40, 70.4, 40, 70.4, 58.5, 66, 58.5], L.red, { part: 'surcoat', paint: true });
      p.poly([58.5, 45.5, 78, 45.5, 78, 49.8, 58.5, 49.8], L.red, { part: 'surcoat', paint: true });
      stroke(p, [58, 53, 57.5, 63], L.fold, 'surcoat');
      stroke(p, [81, 54, 80.5, 63], L.fold, 'surcoat');

      // Пояс с золотой пряжкой и сумками по бокам.
      p.poly([50, 62, 87, 61, 88, 66.5, 50, 67.5], L.leather, { part: 'belt', bevel: 1.5 });
      p.ellipse(71, 64.2, 3.4, 3.2, L.gold, { part: 'buckle', lift: 1 });
      stroke(p, [70, 64, 72, 64], L.goldDark, 'buckle');
      p.ellipse(53, 68.5, 4.6, 5, L.leather, { part: 'pouchN', tone: -0.04 });
      stroke(p, [49.5, 66.5, 56.5, 66], L.goldDark, 'pouchN');
      p.ellipse(86, 68, 3.8, 4.6, L.leather, { part: 'pouchF', tone: -0.12 });

      // Набедренники по обе стороны полотнища, с золотой кромкой.
      // Ближние — не шире бедра: широкие торчали за молотом «слишком широким доспехом».
      p.poly([45, 68.5, 57, 68, 58, 74, 54, 79, 46.5, 79.5, 43.5, 75], L.limb, { part: 'tassetN', bevel: 2.4 });
      edgeBand(p, [43.8, 75.5, 46.5, 79.5, 54, 79, 58, 74.2], 1.8, L.gold, 'tassetN');
      p.poly([44.5, 78.5, 54, 79.5, 53, 84.5, 47.5, 86, 44, 83], L.limb, { part: 'tassetN2', bevel: 2, tone: -0.04 });
      edgeBand(p, [44.2, 83.2, 47.5, 86, 53, 84.5], 1.6, L.gold, 'tassetN2');
      p.ellipse(84, 74, 8.5, 6, L.limb, { part: 'tassetF', rot: -0.3, tone: -0.1 });
      arcStroke(p, 84, 74, 7.9, 5.4, 20, 160, L.goldDark, 'tassetF');

      // Полотнище табарда между ног: белое с красной каймой, рваный подол; на выпаде относит назад.
      const tf = P.cape * 6;
      p.poly([60, 66, 78, 66, 79 - tf * 0.3, 84, 78 - tf, 108, 75 - tf, 104, 72.5 - tf * 1.2, 113, 69 - tf, 106, 66 - tf, 112, 62.5 - tf * 0.8, 105, 60 - tf * 0.3, 84], L.tabard, { part: 'tabard', bevel: 2.5 });
      p.poly([60, 66, 62.4, 66, 62.4 - tf * 0.3, 84, 64.6 - tf * 0.8, 106, 62.5 - tf * 0.8, 105, 60 - tf * 0.3, 84], L.red, { part: 'tabard', paint: true });
      p.poly([75.6, 66, 78, 66, 79 - tf * 0.3, 84, 78 - tf, 108, 75.6 - tf, 105, 76.6 - tf * 0.3, 84], L.red, { part: 'tabard', paint: true });
      stroke(p, [67, 70, 66.5 - tf * 0.8, 100], L.fold, 'tabard');
      stroke(p, [71.5, 70, 72 - tf * 0.8, 96], L.fold, 'tabard');

      // Тень шеи в вороте — за шлемом.
      p.ellipse(66, 34, 10, 5, solid('#1a1418'), { part: 'neck', tone: -0.3 });

      // Дальний наплечник — висит сбоку, темнее, с золотой кромкой к зрителю.
      // Дальний наплечник — та же пластина в профиль, темнее; лямка под ним, золото — к зрителю.
      p.poly([86.5, 40, 92.5, 41.5, 98.5, 39.5, 99.5, 44.5, 95, 48.5, 88.5, 47.5], plate(L.limb), { part: 'fLame', bevel: 2, tone: -0.12 });
      edgeBand(p, [86.8, 46.8, 88.5, 47.6, 95, 48.4, 99.3, 44.6], 1.8, L.gold, 'fLame');
      p.poly([84.5, 31, 86.5, 24.5, 91.5, 21, 97, 22.5, 100, 28.5, 99.5, 36, 96, 41, 89.5, 41.5, 85.5, 37.5], L.limb, { part: 'farPauldron', bevel: 4.5, lift: 1, tone: -0.08 });
      edgeBand(p, [84.8, 31.5, 85.8, 37.6, 89.5, 41.2, 96, 40.8, 99.3, 36.2], 2.2, L.gold, 'farPauldron');
      stroke(p, [87, 25.5, 91.5, 22.2], L.glintDim, 'farPauldron');
      stroke(p, [88, 23, 87.6, 31, 90.5, 36.5, 96, 36.6, 99.6, 32], L.seam, 'farPauldron');
      stroke(p, [87, 23.8, 86.8, 31.4, 89.8, 37.4, 96, 37.6], L.dim, 'farPauldron');

      // Шлем на шее: раз за цикл поворачивается к врагам.
      p.pose({ rot: 0.05 * turn + P.head * DEG, px: M.neck[0], py: M.neck[1] }, () => {
        p.scope(HELM_SCALE, M.helm[0], M.helm[1], () => helm(p, L, helmKind));
      });

      // Горжет — после шлема: низ шлема уходит в золочёный ворот, как на листе.
      p.ellipse(67, 38.5, 14, 5.8, L.chest, { part: 'gorget', lift: 1 });
      rimBand(p, 67, 38.5, 14, 5.8, 2.6, 5, 175, L.gold, 'gorget');
      arcStroke(p, 67, 38.5, 13.6, 5.4, 30, 150, L.goldLit, 'gorget');
      arcStroke(p, 67, 38.5, 13.2, 5.2, 200, 340, L.goldDark, 'gorget');

      // Щит — перед туловищем, от кисти дальней руки.
      const cx = far.hx + (M.armF.shield[0] - M.armF.hand[0]) + P.shx, cy = far.hy + (M.armF.shield[1] - M.armF.hand[1]) + P.shy;
      p.pose({ rot: P.sh * DEG, px: cx, py: cy }, () => {
        p.scope(1, cx, cy, () => {
          shield(p, L);
          if (P.spark > 0.05) {
            const n = Math.round(7 * P.spark);
            for (let k = 0; k < n; k++) {
              const [x, y] = at(8, -24, -80 + k * 26, 3 + 5 * P.spark + (k % 2) * 2.5);
              p.px(x, y, k % 2 ? '#ffd890' : '#fff6d8');
            }
            p.glow(8, -24, 5 * P.spark, '#ffc870', 0.5);
          }
        });
      });

      // Ближняя рука с оружием — поверх туловища.
      const front = P.front > 0.5 && P.drop < 0.05;
      if (P.drop < 0.05 && !front) {
        drawWeapon(near.hx, near.hy, P.sw);
        headGlow(p, near.hx, near.hy, P.sw, headLen, P.glow);
      }
      // Рука одной частью: плечо, налокотник и наруч сливаются — отдельные купола читались «бусами».
      p.limb(M.armN.sh[0], M.armN.sh[1], 8, near.ex, near.ey, 7.4, L.limb, { part: 'nearArm' });
      p.limb(near.ex, near.ey, 7.2, near.hx, near.hy, 6.4, L.limb, { part: 'nearArm' });
      p.ellipse(near.ex, near.ey, 7.6, 7, L.limb, { part: 'nearArm', lift: 1.2 });
      const [ex, ey] = at(near.ex, near.ey, near.a2, 5), [hx2, hy2] = at(near.hx, near.hy, near.a2, -7);
      stroke(p, [ex + 3.5, ey + 1, hx2 + 3.5, hy2 + 1], L.edge, 'nearArm');
      arcStroke(p, near.ex, near.ey, 7, 6.4, 200, 330, L.edge, 'nearArm');
      // Раструб перчатки — золотой пояс поперёк наруча над кулаком.
      const [bx, by] = at(near.hx, near.hy, near.a2, -6.5);
      const nx = Math.cos((near.a2 + 90) * DEG), ny = Math.sin((near.a2 + 90) * DEG), ux = Math.cos(near.a2 * DEG), uy = Math.sin(near.a2 * DEG);
      p.poly([bx - nx * 7.4 - ux * 1.6, by - ny * 7.4 - uy * 1.6, bx + nx * 7.4 - ux * 1.6, by + ny * 7.4 - uy * 1.6, bx + nx * 7.4 + ux * 1.6, by + ny * 7.4 + uy * 1.6, bx - nx * 7.4 + ux * 1.6, by - ny * 7.4 + uy * 1.6], L.gold, { part: 'nearArm', paint: true });
      const fist = (): void => {
        p.ellipse(near.hx, near.hy, 6.4, 6, L.limb, { part: 'fist', tone: -0.04 });
        stroke(p, [near.hx - 3, near.hy - 1, near.hx + 3, near.hy + 2], L.seam, 'fist');
      };
      if (!front) fist();
      // Ближний наплечник — купол и нижняя пластина одной частью, золотая кромка по нижнему краю купола и пластины.
      // Ближний наплечник по мерке листа (≈ 25 × 24): колпак-раковина раскрыт вниз и наружу — золотая кромка обходит
      // его внешний край и низ уголком, под ним ступенью одна лямка. Купол-эллипс читался шаром, пластина крупнее
      // мерки с кромкой только снизу — шляпкой гриба.
      p.poly([19, 44, 22.5, 40, 28.5, 38.5, 34, 40.5, 35, 44.5, 31, 48.5, 24.5, 49.5, 19.5, 48.5], plate(L.limb), { part: 'pLame', bevel: 2, tone: -0.05 });
      edgeBand(p, [19.2, 44.6, 19.6, 48.4, 24.5, 49.4, 31, 48.4, 34.8, 44.6], 2.2, L.gold, 'pLame');
      stroke(p, [21.5, 41.5, 27.5, 39.4], L.glintDim, 'pLame');
      p.poly([26.5, 31, 28, 24.5, 33, 19.5, 40, 17.5, 46.5, 19, 50.5, 23.5, 51.5, 30, 49.5, 36, 44, 40.5, 36, 42, 29.5, 39.5], L.limb, { part: 'pauldron', bevel: 5, lift: 2 });
      p.poly([30, 25.5, 34, 20.8, 39.5, 19.2, 41.5, 21.5, 36.5, 24, 32.5, 28.5], L.limb, { part: 'pauldron', paint: true, tone: 0.32 });
      p.poly([34, 37.8, 41, 37.6, 47, 34.5, 50.6, 30, 49.5, 36, 44, 40.5, 36, 42], L.limb, { part: 'pauldron', paint: true, tone: -0.22 });
      // Ступени пластин по колпаку параллельно кромке: тёмный стык и светлый край нижней пластины под ним.
      stroke(p, [31, 21.6, 30.4, 29, 33.4, 35, 39.6, 36.8, 46.4, 34.6, 50.8, 29.6], L.seam, 'pauldron');
      stroke(p, [30, 22.6, 29.4, 29.4, 32.6, 35.8, 39.4, 37.8, 46.6, 35.6], L.edge, 'pauldron');
      stroke(p, [35.5, 18.6, 35.2, 25.6, 38.6, 30.2, 44, 30.8, 48.8, 27.4, 51, 23.4], L.seam, 'pauldron');
      stroke(p, [34.4, 19.4, 34.2, 26, 37.8, 31.2, 44, 31.8, 49.2, 28.4], L.edge, 'pauldron');
      edgeBand(p, [28.2, 24, 26.2, 31, 29.5, 39.6, 36, 42, 44, 40.6, 49.6, 36], 2.8, L.gold, 'pauldron');
      stroke(p, [26.8, 31.4, 29.8, 40.2, 36, 42.5], L.goldLit, 'pauldron');
      stroke(p, [29.5, 26.5, 33.5, 21.6, 39, 19.6], L.glint, 'pauldron');
      stroke(p, [45.5, 21.5, 49.2, 25.5], L.glintDim, 'pauldron');
      if (front) {
        drawWeapon(near.hx, near.hy, P.sw);
        fist();
      }
    });

    if (P.drop >= 0.05) {
      const k = ease(Math.min(1, P.drop));
      const [hx0, hy0] = toWorld(near.hx, near.hy);
      const x = lerp(hx0, 26, k), y = lerp(hy0, G - 3.5, k * k);
      const a = lerp(P.sw + (rot * 180) / Math.PI, 3, k);
      drawWeapon(x, y, a);
    }
    const [tipX, tipY] = toWorld(...at(near.hx, near.hy, P.sw, headLen));
    if (P.dust > 0.05) {
      const dx0 = Math.min(tipX, 150);
      for (let k = 0; k < 9; k++) {
        const r = (2 + 4 * P.dust) * (0.6 + ((k * 37) % 5) / 8);
        p.disc(dx0 + (k - 4) * 5 * P.dust, G - 2 - (k % 3) * 3 * P.dust - (k % 2) * 2, r * 0.5, k % 2 ? '#7a6c58c0' : '#9a8a70c0', true);
      }
    }
    if (paladinProbe.on) {
      const [hwx, hwy] = toWorld(near.hx, near.hy);
      paladinProbe.on({ ...probeInfo, hipX: hipX + P.x, hipY: hipY + P.y, handX: hwx + P.x, handY: hwy + P.y, tipX: tipX + P.x, tipY: tipY + P.y, ground: G });
    }
  });
}
