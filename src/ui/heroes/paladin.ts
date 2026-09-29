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
 * Контуры частей обведены по первому кадру в пикселях листа и переведены в единицы поля при росте 132
 * (k = 132 / 180): топхельм с золотым крестом сидит в золотом горжете между двумя куполами наплечников с толстой
 * каймой, корпус прямой и широкий, белый табард с красным крестом на груди и длинным полотнищем между ног, красный
 * плащ за спиной; ближняя рука массивная, висит вдоль тела — пластина плеча, наруч с золотыми поясами, кулак у бедра
 * держит молот, боёк-барабан у ближнего колена; щит-«утюг» с крестом от плеча до колена; колени низко и широко,
 * голени толстые, наколенники и башмаки крупные.
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

/**
 * Сталь шлема — та же, но чистая: без фактуры и дизеринга. Зерно, царапины и полутона на пикселе 1,5 превращали
 * крупные плоскости шлема в рябь («шлем не чёткий»); голова читается тонами плоскостей, крестом и прорезью.
 */
function helmOf(ramp: string[], metal: number): Mat {
  return { base: ramp[2], ramp, dither: 0, metal };
}

const A_STEEL = steelOf(['#211a1e', '#433a3f', '#6a5f63', '#9c9090', '#d6ccc4'], 0.7, { kind: 'noise', scale: 1.8, amp: 0.14 });
const B_STEEL = steelOf(['#191417', '#352e32', '#564d51', '#857a7a', '#b8aea4'], 0.6, { kind: 'spots', scale: 2.4, amp: 0.2, density: 0.18 });
const C_STEEL = steelOf(['#29242a', '#4e474d', '#7a7276', '#b0a8a6', '#ece6dc'], 0.8, { kind: 'noise', scale: 1.6, amp: 0.1 });

export const PALADIN_LOOKS: Record<PaladinLookId, PaladinLook> = {
  // A — как на листе: светлая сталь, яркое золото кромок, белый табард и красный крест, красный плащ.
  A: {
    id: 'A',
    name: 'Храмовник',
    limb: A_STEEL(), chest: A_STEEL(), helm: helmOf(['#211a1e', '#433a3f', '#6a5f63', '#9c9090', '#d6ccc4'], 0.7), head: A_STEEL(),
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
    limb: B_STEEL(), chest: B_STEEL(), helm: helmOf(['#191417', '#352e32', '#564d51', '#857a7a', '#b8aea4'], 0.6), head: B_STEEL(),
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
    limb: C_STEEL(), chest: C_STEEL(), helm: helmOf(['#29242a', '#4e474d', '#7a7276', '#b0a8a6', '#ece6dc'], 0.8), head: C_STEEL(),
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

// ─── Мерки ──────────────────────────────────────────────────────────────────

/**
 * Мерки стойки в единицах поля — обводка первого кадра прежнего листа (ячейка 188, фигура 180 точек): каждая точка
 * контура листа переведена как x = 5 + (px − 12)·k, y = 136 − (184 − py)·k, k = 132 / 180. Рамка фигуры ≈ 122 × 132.
 * Первая лепка брала только суставы и собирала части «на глаз» — узкий корпус, тонкая рука за плащом, длинные тонкие
 * голени, щит-доска («анатомия вышла из чата»); теперь контуры шлема, наплечников, щита, полотнища, башмаков и толщины
 * рук и ног сняты с листа. Проверка — наложение силуэтов в одной сетке (лист, лепка, расхождения).
 */
const G = 136;
/** Сутулости нет: на листе корпус прямой, вперёд подан только шлем. Наклон в клипах — поле `lean`. */
const HUNCH = 0;
const M = {
  /** Центр шлема (≈ 24 × 31) и шея — опора наклона головы. */
  helm: [70, 20],
  neck: [69, 36],
  /** Бёдра, колени, щиколотки; носок наружу. Колени низко и широко, голени толстые. */
  legN: { hip: [55, 78], knee: [35.5, 101], ank: [27, 122.3], toe: 180 },
  legF: { hip: [81, 78], knee: [99.5, 98], ank: [99.5, 122.5], toe: 0 },
  /**
   * Ближняя рука висит вдоль тела, прижата к боку: плечо под наплечником, локоть под пластиной плеча, кулак у бедра;
   * молот наискось, боёк у колена. По контуру листа рука стояла на 6 левее — «сильно отведена», в щель до груди
   * виден плащ.
   */
  armN: { sh: [38, 41], el: [30, 55], hand: [25, 76], weapon: 38 },
  /** Дальняя рука за щитом; центр щита — опора его наклона. */
  armF: { sh: [91, 44], el: [95, 57], hand: [102, 64], shield: [106, 73] },
};

const len = (a: readonly number[], b: readonly number[]): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
const dir = (a: readonly number[], b: readonly number[]): number => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const ARM_N = { l1: len(M.armN.sh, M.armN.el), l2: len(M.armN.el, M.armN.hand), a1: dir(M.armN.sh, M.armN.el), a2: dir(M.armN.el, M.armN.hand) };
const ARM_F = { l1: len(M.armF.sh, M.armF.el), l2: len(M.armF.el, M.armF.hand), a1: dir(M.armF.sh, M.armF.el), a2: dir(M.armF.el, M.armF.hand) };
const LEG_N = { l1: len(M.legN.hip, M.legN.knee), l2: len(M.legN.knee, M.legN.ank) };
const LEG_F = { l1: len(M.legF.hip, M.legF.knee), l2: len(M.legF.knee, M.legF.ank) };
/** Таз — опора наклона верха; бёдра ног — от него на ±13. */
const PELVIS: [number, number] = [68, 76];

/** От кулака до середины бойка: молот держится у верхней трети древка, булава — у навершия. */
const HEAD_AT: Record<PaladinWeapon, number> = { hammer: 31, mace: 30 };

// ─── Кромки ─────────────────────────────────────────────────────────────────

/**
 * Кайма краской по части — полоса между дугами эллипса (cx, cy, rx, ry) и такой же, уже на `w`, от угла `a0` до `a1`:
 * золотой обод бойка, наколенника, горжета. Штрих в пиксель читался ниткой, у листа кайма толстая.
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
 * Кайма вдоль ломаной `pts` шириной `w` внутрь пластины — краской по части. Обход — против часовой на экране: низ
 * слева направо, правый край снизу вверх, верх справа налево, левый край сверху вниз (внутрь — слева от хода).
 */
function edgeBand(p: Painter, pts: number[], w: number, mat: Mat, part: string): void {
  const inner: number[] = [];
  const n = pts.length / 2;
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
    const tx = pts[b * 2] - pts[a * 2], ty = pts[b * 2 + 1] - pts[a * 2 + 1], l = Math.hypot(tx, ty) || 1;
    inner.push(pts[k * 2] + (ty / l) * w, pts[k * 2 + 1] - (tx / l) * w);
  }
  const out = [...pts];
  for (let k = n - 1; k >= 0; k--) out.push(inner[k * 2], inner[k * 2 + 1]);
  p.poly(out, mat, { part, paint: true });
}

/** Выпуклый многоугольник, ужатый внутрь на `w` (поле щита внутри обода). */
function inset(pts: number[], w: number): number[] {
  const n = pts.length / 2;
  let cx = 0, cy = 0;
  for (let k = 0; k < n; k++) {
    cx += pts[k * 2] / n;
    cy += pts[k * 2 + 1] / n;
  }
  const out: number[] = [];
  const normal = (i: number, j: number): [number, number] => {
    const tx = pts[j * 2] - pts[i * 2], ty = pts[j * 2 + 1] - pts[i * 2 + 1], l = Math.hypot(tx, ty) || 1;
    let nx = -ty / l, ny = tx / l;
    const mx = (pts[i * 2] + pts[j * 2]) / 2, my = (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2;
    if (nx * (cx - mx) + ny * (cy - my) < 0) [nx, ny] = [-nx, -ny];
    return [nx, ny];
  };
  for (let k = 0; k < n; k++) {
    const [ax, ay] = normal((k + n - 1) % n, k), [bx, by] = normal(k, (k + 1) % n);
    const s = 1 + ax * bx + ay * by;
    out.push(pts[k * 2] + ((ax + bx) / s) * w, pts[k * 2 + 1] + ((ay + by) / s) * w);
  }
  return out;
}

// ─── Шлем ───────────────────────────────────────────────────────────────────

/**
 * Шлем в своих координатах: центр (0, 0) = `M.helm`, лицо к врагам (вправо). Топхельм по контуру листа — 24 × 31:
 * скруглённый верх, отвесные бока, низ сужается к подбородку. Основа — вертикальный цилиндр (свет и блик металла
 * ложатся по объёму), киль лица на трёх пятых ширины: золотая вертикаль креста чуть наискось от макушки до низа,
 * бровь над прорезью, прорезь — ниже середины, как на листе. Правая плоскость лица и подбородок — в тени.
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
    // Барбют того же размера: купол черепа и щёки одной частью, затылок расходится колоколом к шее.
    p.ellipse(-0.5, -3.5, 12, 12, H, { part: 'helm', lift: 1 });
    p.poly([-12.3, -3, -13.4, 8.5, -12, 15, -4, 16, 5, 15.5, 10.8, 13, 12, 3, 11.4, -5], H, { part: 'helm', bevel: 4 });
    stroke(p, [-2.5, -15.2, 2.5, -12.4, 5.6, -5.5], L.edge, 'helm');
    p.poly([8.6, -3.5, 12, -3.5, 12, 3, 10.8, 13, 8.6, 14], H, { ...o, tone: -0.14 });
    // Т-вырез в золочёной кромке — сам вырез читается крестом, лицо в нём в глубокой тени.
    p.poly([-0.5, -6.6, 12.6, -6.6, 12.6, -3.2, 12.2, -2.4, 8.4, -2.2, 8.4, 15, 4.6, 15.2, 4.6, -2.2, -0.5, -2.2], L.gold, o);
    p.poly([0.9, -5.4, 12, -5.4, 12, -3.6, 7.2, -3.4, 7.2, 14.6, 5.8, 14.6, 5.8, -3.4, 0.9, -3.4], solid('#140e12'), o);
    stroke(p, [-0.4, -6.6, 12.2, -6.6], L.goldLit, 'helm');
    stroke(p, [4.6, -2, 4.6, 14.8], L.goldLit, 'helm');
    p.poly([-8, -11, -4, -13.6, -1, -13.4, -4.5, -9.5, -7.5, -7], H, { ...o, tone: 0.24 });
    stroke(p, [-10.6, -4.5, -10.8, 2], L.glintDim, 'helm');
    return;
  }
  // Колпак — цилиндр со скруглённым верхом, низ — сужение к подбородку. Тонов мало и плоскости крупные: бок на свету,
  // лицо в полутени, правая плоскость за крестом в тени; ни зерна, ни царапин — на пикселе 1,5 они давали рябь.
  p.limb(-0.4, -3.4, 11.9, 0, 0, 11.7, H, { part: 'helm' });
  p.poly([-11.6, -2, 11.8, -2, 11.8, 10.5, 7.5, 15.5, -4, 15.5, -10.8, 12.4], H, { part: 'helm', bevel: 2.4, flat: 0.3 });
  p.poly([-9.4, -8.5, -6, -12.8, -2, -14.4, -3.5, -10, -7.5, -5.5], H, { ...o, tone: 0.3 });
  p.poly([-2.5, -14.8, 3, -15.4, 3, 15.5, -2.5, 15.5], H, { ...o, tone: -0.04 });
  p.poly([6, -15, 9, -13.6, 11.2, -9.6, 12, -3.5, 11.8, 10.5, 7.5, 15.5, 6, 15.5], H, { ...o, tone: -0.2 });
  // Прорезь — два пикселя чёрного поперёк лица, над ней золотая бровь, крест — прямая золотая вертикаль в два пикселя:
  // наклонная полоса на пикселе 1,5 ломалась ступеньками.
  p.poly([-2.8, 1, 11.8, 1, 11.8, 4.2, -2.8, 4.2], slit, o);
  p.poly([-2.8, -2.4, 11.8, -2.4, 11.8, 1, -2.8, 1], L.gold, o);
  p.poly([3, -15.6, 6, -15.4, 6, 15.6, 3, 15.6], L.gold, o);
  stroke(p, [3.3, -14.6, 3.3, 15], L.goldLit, 'helm');
  stroke(p, [-2.8, -2.1, 3, -2.1], L.goldLit, 'helm');
  stroke(p, [-2.9, -12.8, -2.9, 13.8], L.edge, 'helm');
  if (kind === 'crown') {
    // Венец: золотой обруч вокруг макушки (передняя половина — поверх шлема) и зубцы над ним.
    const cx = -0.5, cy = -10.5, rx = 11.4, ry = 2.8;
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
  const x = -0.5 + 11.4 * Math.cos(a * DEG), y = -10.5 + 2.8 * Math.sin(a * DEG) - 2.2;
  const w = 1.2 * (0.5 + 0.5 * Math.abs(Math.sin(a * DEG)));
  const back = part === 'crownBack';
  p.poly([x - w, y, x, y - 3.6, x + w, y], L.gold, { part, bevel: 0.6, tone: back ? -0.15 : 0 });
  p.ellipse(x, y - 4.2, 1.1, 1.1, L.gold, { part, tone: back ? -0.15 : 0.05 });
}

// ─── Щит ────────────────────────────────────────────────────────────────────

/**
 * Щит-«утюг» — контур листа относительно `M.armF.shield`: 38 × 71, верхняя кромка поднимается к врагам, правая
 * половина шире левой (щит выпуклый и развёрнут к зрителю), острие у дальнего колена. Первый щит был уже на треть —
 * «доска». Обод — золото шириной 3, поле ужато внутрь; крест по листу почти прямой: вертикаль наклонена на 10°,
 * перекладина на трети высоты поднимается к врагам на 9° (крест по оси щита и вдоль кромки заваливался).
 */
const SHIELD: number[] = [-18.9, -19.9, -7.1, -29.4, 5.3, -35.3, 9.7, -31.6, 14.9, -20.6, 19.3, -5.9, 19.3, 8.7, 16.3, 21.9, 11.9, 32.2, 9, 35.9, 0.2, 27.1, -7.1, 14.6, -13, 1.4, -17.4, -9.6];

/** Полоса креста от (x0, y0) до (x1, y1) полушириной `w` — краской по полю щита, обод её обрезает. */
function crossBar(p: Painter, L: PaladinLook, x0: number, y0: number, x1: number, y1: number, w: number): void {
  const l = Math.hypot(x1 - x0, y1 - y0), nx = (-(y1 - y0) / l) * w, ny = ((x1 - x0) / l) * w;
  p.poly([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny], L.red, { part: 'shieldIn', paint: true });
}

function shield(p: Painter, L: PaladinLook): void {
  p.poly(SHIELD, L.gold, { part: 'shield', bevel: 2.4, flat: 0.6 });
  p.poly(inset(SHIELD, 3), L.shieldFace, { part: 'shieldIn', flat: 0.9, lift: 0.4, noLine: true });
  crossBar(p, L, 0.5, -34, 11, 30, 2.4);
  crossBar(p, L, -18, -1.5, 21, -7.8, 2.3);
  // Кромка обода на свету — сверху и слева, в тени — справа и снизу; потёртости поля.
  stroke(p, [-18.2, -19.4, -6.8, -28.6, 5, -34.4], L.goldLit, 'shield');
  stroke(p, [-17, -9, -12.6, 1.6, -6.8, 14.2], L.goldLit, 'shield');
  stroke(p, [18.6, 9, 15.6, 21.6, 11.4, 31.6], L.goldDark, 'shield');
  stroke(p, [-11, -10, -8, -9], L.fold, 'shieldIn');
  stroke(p, [11, 6, 13.5, 8.5], L.fold, 'shieldIn');
  stroke(p, [-2, 16, 0, 19], L.fold, 'shieldIn');
}

// ─── Оружие ─────────────────────────────────────────────────────────────────

/**
 * Молот с листа: древко с золотой обмоткой между кулаком и бойком, золотое навершие за кулаком. Боёк — стальной
 * барабан вдоль древка (на листе ≈ 19 × 20): золотое кольцо у древка, ударная грань к зрителю внизу справа в золотом
 * ободе, блик по верху. Боёк-шар того же тона, что наколенник, сливался с ногой — у барабана светлая грань и обод.
 */
function hammer(p: Painter, L: PaladinLook, x: number, y: number, a: number): void {
  const u: [number, number] = [Math.cos(a * DEG), Math.sin(a * DEG)];
  const n: [number, number] = [-u[1], u[0]];
  /** Точка бойка: `s` — вдоль древка от кулака, `t` — поперёк. */
  const q = (s: number, t: number): [number, number] => [x + u[0] * s + n[0] * t, y + u[1] * s + n[1] * t];
  const s0 = 21.5, s1 = 40, r = 10;
  p.limb(...at(x, y, a, -12), 2.1, ...at(x, y, a, s0 + 2), 2.1, L.wood, { part: 'haft' });
  for (let s = 6; s <= s0 - 2; s += 3.4) {
    const [cx, cy] = at(x, y, a, s);
    stroke(p, [cx - n[0] * 2.4 - u[0] * 0.9, cy - n[1] * 2.4 - u[1] * 0.9, cx + n[0] * 2.4 + u[0] * 0.9, cy + n[1] * 2.4 + u[1] * 0.9], L.goldLit, 'haft');
  }
  p.ellipse(...at(x, y, a, -13.5), 3, 3, L.gold, { part: 'hPommel', lift: 1 });
  // Тело барабана — цилиндр поперёк: свет по верху, тень снизу; скруглённые концы закрывают кольцо и грань.
  p.limb(...q(s0 + 3, 0), r, ...q(s1 - 3, 0), r, L.head, { part: 'hHead', lift: 1.5 });
  p.poly([...q(s0 + 3, -r + 2.2), ...q(s1 - 4, -r + 2.2), ...q(s1 - 5, -r + 4.4), ...q(s0 + 4, -r + 4.4)], L.head, { part: 'hHead', paint: true, tone: 0.3 });
  // Кольцо у древка — золотой пояс чуть шире тела.
  p.poly([...q(s0, -r - 0.6), ...q(s0 + 3.4, -r - 0.6), ...q(s0 + 3.4, r + 0.6), ...q(s0, r + 0.6)], L.gold, { part: 'hCollar', bevel: 1.2, lift: 1 });
  stroke(p, [...q(s0 + 0.6, -r), ...q(s0 + 0.6, r - 2)], L.goldLit, 'hCollar');
  // Ударная грань — эллипс поперёк (торец в ракурсе), светлее тела, в золотом ободе.
  p.ellipse(...q(s1 - 1.5, 0), 4.4, r + 0.4, L.head, { part: 'hFace', rot: a * DEG, lift: 2, tone: 0.12 });
  rimBand(p, ...q(s1 - 1.5, 0), 4.4, r + 0.4, 2, 0, 360, L.gold, 'hFace', a * DEG);
  stroke(p, [...q(s1 - 2.5, -r + 2), ...q(s1 - 0.5, r - 3)], L.goldLit, 'hFace');
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
  p.limb(...at(x, y, a, -7), 2, ...at(x, y, a, HEAD_AT.mace - 5), 1.9, L.wood, { part: 'haft' });
  for (let s = -4; s <= 6; s += 3) {
    const [cx, cy] = at(x, y, a, s);
    stroke(p, [cx - n[0] * 2.3 - u[0] * 0.9, cy - n[1] * 2.3 - u[1] * 0.9, cx + n[0] * 2.3 + u[0] * 0.9, cy + n[1] * 2.3 + u[1] * 0.9], '#2a1a12', 'haft');
  }
  p.ellipse(...at(x, y, a, -8.5), 2.8, 2.8, L.gold, { part: 'hPommel', lift: 1 });
  p.poly([...q(-9, -3.5), ...q(-5, -11.5), ...q(5.5, -12), ...q(10, -4.5), ...q(10, 4.5), ...q(5.5, 12), ...q(-5, 11.5), ...q(-9, 3.5)], L.gold, { part: 'hHead', bevel: 2.2 });
  p.ellipse(...q(0.5, 0), 8.5, 6, L.gold, { part: 'hHead', lift: 2.5, rot: a * DEG });
  stroke(p, [...q(-6.5, 0), ...q(9, 0)], L.goldLit, 'hHead');
  stroke(p, [...q(-4.5, -10.8), ...q(5, -11.2)], L.goldLit, 'hHead');
  stroke(p, [...q(-4.5, 10.6), ...q(5, 11)], L.goldDark, 'hHead');
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
  /** Плащ и полотнище табарда: 0 — висят, 1 — взвились назад. */
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
  // Покой в ногах: таз оседает на пиксель на четверть цикла дыхания позже груди, а верх догоняет волной; раз за цикл
  // вес переходит с ноги на ногу. Стопы стоят, колени идут за тазом наполовину (см. колено в `drawPaladin`). Без этого
  // дышал только верх и ноги стояли намертво («ноги снизу не двигаются совсем»); присед на два пикселя через ik
  // разводил почти прямые ноги коленями в стороны. Сдвиги — целыми пикселями, иначе латы на ногах рябят.
  if (!c) {
    P.crouch += p.bob(1.5, 2, 0.25);
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
  crop: [20, -6, 96],
  halo: [70, 20, 30],
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
    p.shadow(68 - 10 * fall - P.x * 0.5 * (1 - fall), 54 + 16 * fall, 4);

    if (fall > 0.55) p.poly([hipX - 78, G - 5, hipX - 34, G - 7, hipX + 2, G - 4, hipX + 4, G, hipX - 82, G], L.cape, { part: 'capeGround', tone: -0.18 });

    // ── Плащ — за спиной от плеч почти до земли: виден слева за рукой, между рукой и телом и между ног. ──
    if (fall < 0.6) {
      p.pose(up, () => {
        const fl = P.cape, keep = 1 - fall / 0.6;
        const pts = [54, 32, 38, 35, 28, 45, 20, 62, 14, 80, 9, 95, 8.5, 108, 13, 104, 17, 111, 22, 104, 27, 110, 33, 105, 40, 116, 47, 112, 54, 121, 61, 115, 68, 122, 75, 116, 82, 121, 88, 112, 90, 90, 88, 62, 84, 40, 72, 32];
        for (let k = 0; k < pts.length; k += 2) {
          const t = Math.max(0, (pts[k + 1] - 32) / 90);
          pts[k + 1] = 32 + (pts[k + 1] - 32) * keep - fl * 34 * t * t;
          pts[k] = pts[k] - fl * 30 * t;
        }
        p.poly(pts, L.cape, { part: 'cape', tone: -0.12, bevel: 3 });
        stroke(p, [30, 52, 20, 92], L.capeFold, 'cape');
        stroke(p, [26, 80, 16, 104], L.capeFold, 'cape');
      });
    }

    // ── Ноги: бедро от таза, колено — ik, стопы стоят на земле. Голени толстые, наколенники крупные с золотой
    //    каймой, башмаки большие и круглые — как на листе. ──
    const legRot = lerp(0, -Math.PI / 2, fall);
    const legs = [
      { g: M.legF, L2: LEG_F, side: 'far', tone: -0.05, off: [13, 2], foot: P.footF, lift: P.liftF, kneel: 0, lie: [hipX + 46, G - 6], lieRot: -1.4, bend: [lerp(1, 0.2, fall), lerp(-0.2, -1, fall)] },
      { g: M.legN, L2: LEG_N, side: 'near', tone: 0, off: [-13, 2], foot: P.footN, lift: P.liftN, kneel: P.kneel, lie: [hipX + 40, G - 5], lieRot: 1.4, bend: [lerp(-1, 0.3, fall), lerp(-0.2, -1, fall)] },
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
      // Малый сдвиг таза и стопы от стойки (покой, отдача) — колено идёт за ними наполовину от своей мерки, ноги чуть
      // растягиваются и сжимаются незаметно глазу. Большой (шаг, выпад, колено на земле, падение) — сустав решает ik.
      // У Паладина ноги в стойке почти прямые, и ik на каждый пиксель приседа выбрасывал колени в стороны.
      const rhx = PELVIS[0] + lg.off[0], rhy = PELVIS[1] + lg.off[1];
      const dhx = hx - rhx, dhy = hy - rhy, dax = ax - lg.g.ank[0], day = ay - lg.g.ank[1];
      const big = Math.max(Math.hypot(dhx, dhy), Math.hypot(dax, day));
      const w = lg.kneel > 0 || fall > 0 ? 1 : Math.max(0, Math.min(1, (big - 3) / 4));
      if (w > 0) [ax, ay] = reachFoot(hx, hy, ax, ay, lg.L2.l1 + lg.L2.l2 - 0.2);
      toe += w * Math.max(0, floor - ay) / 14;
      ax = lerp(ax, lg.lie[0], fall);
      ay = lerp(ay, lg.lie[1], fall);
      const toeRot = lerp(toe, lg.lieRot, fall);
      if (lg.side === 'far') probeInfo.footF = ax + P.x;
      else probeInfo.footN = ax + P.x;
      const [ikx, iky] = ik(hx, hy, ax, ay, lg.L2.l1, lg.L2.l2, bend[0], bend[1]);
      const kx = lerp(lg.g.knee[0] + (dhx + dax) / 2, ikx, w), ky = lerp(lg.g.knee[1] + (dhy + day) / 2, iky, w);
      const tone = lg.tone;
      const far = lg.side === 'far';
      const leg = `${lg.side}Leg`, knee = `${lg.side}Knee`, foot = `${lg.side}Foot`;
      p.limb(hx, hy, 10, kx, ky, 8.4, L.limb, { part: leg, tone });
      p.limb(kx, ky, 8.2, ax, ay, 6.6, L.limb, { part: leg, tone });
      // Блик по голени к свету и стык поножи.
      stroke(p, [kx - 3.5 * out + 1, ky + 7, ax - 2.4 * out + 1, ay - 4], L.edge, leg);
      stroke(p, [ax - 5.8, ay - 3.6, ax + 5.8, ay - 3.6], L.seam, leg);
      // Башмак — большой и круглый: пятка назад, носок наружу, подошва на земле; по подъёму — золотой пояс.
      const S = G - lg.g.ank[1] - 0.5;
      p.pose({ rot: toeRot * out, px: ax, py: ay }, () => {
        p.poly([ax - 6.5 * out, ay - 2.2, ax + 5 * out, ay - 2.6, ax + 12 * out, ay + 3, ax + 15 * out, ay + 8, ax + 15.5 * out, ay + S, ax - 7.5 * out, ay + S, ax - 8 * out, ay + 5], L.limb, { part: foot, tone: tone - 0.02, bevel: 4 });
        edgeBand(p, out > 0 ? [ax - 7.4 * out, ay + 1.8, ax + 6.5 * out, ay + 1.4] : [ax + 6.5 * out, ay + 1.4, ax - 7.4 * out, ay + 1.8], 2.6, L.gold, foot);
        stroke(p, [ax + 1 * out, ay + 3.4, ax + 9 * out, ay + 5], far ? L.goldDark : L.goldLit, foot);
        stroke(p, [ax + 4 * out, ay + 7.5, ax + 11 * out, ay + 8.5], L.glintDim, foot);
      });
      // Наколенник — крупная чаша (≈ 15 × 16 на листе) с толстой золотой каймой снизу и снаружи, блик сверху.
      p.ellipse(kx, ky, 8.4, 8, plate(L.limb), { part: knee, lift: 2, flat: 0.3, tone: tone + 0.04 });
      rimBand(p, kx, ky, 8.4, 8, 2.4, out > 0 ? 10 : 20, out > 0 ? 160 : 170, L.gold, knee);
      p.poly([kx - 4, ky - 5, kx, ky - 7, kx + 3, ky - 6, kx - 1, ky - 3], L.limb, { part: knee, paint: true, tone: 0.26 });
    }

    // ── Верх: без сутулости, наклон — только в клипах; дыхание. ──
    const near = nearArm(P);
    const far = limb2(M.armF.sh[0], M.armF.sh[1], P.f1, ARM_F.l1, P.f2, ARM_F.l2);
    p.pose(up, () => {
      p.limb(M.armF.sh[0], M.armF.sh[1], 7.5, far.ex, far.ey, 6.5, L.limb, { part: 'farArm', tone: -0.16 });
      p.limb(far.ex, far.ey, 6.5, far.hx, far.hy, 5.5, L.limb, { part: 'farArm', tone: -0.16 });

      // Туловище — широкое, от ближнего наплечника до дальнего; стальные бока видны по краям табарда.
      // Ближний бок кирасы — в тени: на листе между рукой и грудью тёмная сталь, а не плащ.
      p.poly([41, 37, 88, 35, 90, 50, 87, 66, 46, 67, 40, 53], L.chest, { part: 'torso', bevel: 6, lift: 1 });
      p.poly([41, 37, 54, 36.5, 52, 50, 55, 62, 46, 67, 40, 53], L.chest, { part: 'torso', paint: true, tone: -0.24 });
      // Табард на груди — своя плоская ткань (краской по кирасе белое уходило в тень), крест по мерке листа.
      p.poly([53.5, 36.5, 69, 33.8, 84.5, 36.5, 86.5, 48, 84.5, 60.5, 55, 61, 52, 48], L.tabard, { part: 'surcoat', flat: 0.55, lift: 1, bevel: 3.5 });
      p.poly([65.2, 40.5, 69.6, 40.5, 69.6, 58.4, 65.2, 58.4], L.red, { part: 'surcoat', paint: true });
      p.poly([59, 45.8, 77.4, 45.8, 77.4, 50.2, 59, 50.2], L.red, { part: 'surcoat', paint: true });
      stroke(p, [57, 53, 56.5, 60], L.fold, 'surcoat');
      stroke(p, [81.5, 52, 81, 60], L.fold, 'surcoat');

      // Набедренники — по бокам от полотнища, не шире бедра; дальний в тени.
      p.poly([44, 66.5, 61, 66.5, 62, 74, 58, 81.5, 48, 82, 43, 76], L.limb, { part: 'tassetN', bevel: 3.2, lift: 1 });
      stroke(p, [44.5, 74.5, 60.5, 73.5], L.seam, 'tassetN');
      edgeBand(p, [43.4, 76.2, 48, 81.8, 58, 81.3], 1.6, L.gold, 'tassetN');
      p.poly([78.5, 68, 90, 68.5, 92, 80, 90, 92, 83, 93, 79, 84], L.limb, { part: 'tassetF', bevel: 3, tone: -0.1 });
      stroke(p, [79, 79, 91.5, 79.5], L.seam, 'tassetF');

      // Полотнище табарда между ног: белое с красной каймой, рваный подол; на выпаде относит назад.
      const tf = P.cape * 6;
      // На листе полотнище расходится к подолу, кайма слева узкая, справа (в тени) — шире.
      const hem = [60.5, 66, 78.5, 66, 80 - tf * 0.3, 88, 81.5 - tf, 111, 78 - tf, 107, 74.5 - tf * 1.1, 114, 71 - tf, 108, 67.5 - tf, 113.5, 64 - tf * 0.8, 107.5, 60 - tf * 0.6, 111, 58.5 - tf * 0.3, 88];
      p.poly(hem, L.tabard, { part: 'tabard', bevel: 2.5 });
      p.poly([58.5, 66, 62.6, 66, 62.4 - tf * 0.3, 88, 63 - tf * 0.6, 108, 60 - tf * 0.6, 111, 58.5 - tf * 0.3, 88], L.red, { part: 'tabard', paint: true });
      p.poly([74.5, 66, 78.5, 66, 80 - tf * 0.3, 88, 81.5 - tf, 111, 78 - tf, 107, 76.5 - tf * 0.6, 100, 75.5 - tf * 0.3, 88], L.red, { part: 'tabard', paint: true, tone: -0.1 });
      stroke(p, [66.5, 70, 66 - tf * 0.8, 104], L.fold, 'tabard');
      stroke(p, [71, 70, 71.5 - tf * 0.8, 100], L.fold, 'tabard');

      // Пояс с золотой пряжкой и сумками по бокам — поверх верха набедренников и полотнища.
      p.poly([44, 59.5, 85, 59.5, 85.5, 67, 44, 67.5], L.leather, { part: 'belt', bevel: 1.8 });
      p.ellipse(69.5, 63.3, 3.8, 3.4, L.gold, { part: 'buckle', lift: 1 });
      stroke(p, [68.4, 63.2, 70.6, 63.2], L.goldDark, 'buckle');
      // Сумки висят под поясом — коробки с клапаном, а не шары.
      p.poly([46.5, 64.5, 57.5, 64, 58, 73, 55.5, 75, 48.5, 75, 46, 72.5], L.leather, { part: 'pouchN', bevel: 2, lift: 1 });
      p.poly([46.5, 64.5, 57.5, 64, 57.8, 68.5, 46.3, 69], L.leather, { part: 'pouchN', paint: true, tone: 0.14 });
      stroke(p, [46.6, 69.2, 57.8, 68.7], '#1e140e', 'pouchN');
      p.px(52, 69.5, L.goldLit);
      p.poly([78.5, 64.5, 85, 64.5, 85.5, 72, 83.5, 74, 79.5, 74, 78, 71.5], L.leather, { part: 'pouchF', bevel: 1.8, tone: -0.12 });

      // Дальний наплечник — купол по контуру листа (≈ 17 × 24), в тени; золото — к зрителю: слева и снизу. Мельче и ниже, как ближний: верх на уровне подбородка.
      p.scope(0.8, 94 * 0.2, 47 * 0.2 + 3, () => {
        p.poly([86, 30, 88, 25, 93, 22.5, 99, 24, 102.5, 30, 102.5, 38, 99.5, 44, 93, 47, 88, 45, 86, 38], L.limb, { part: 'farPauldron', bevel: 5.5, lift: 1.5, tone: -0.06 });
        p.poly([89, 29, 92, 25.5, 95, 25, 93, 29.5, 90.5, 33], L.limb, { part: 'farPauldron', paint: true, tone: 0.26 });
        edgeBand(p, [87.6, 25.8, 86, 30, 86, 38, 88, 45, 93, 47, 99.5, 44], 3.2, L.gold, 'farPauldron');
      });

      // Тень шеи в вороте — за шлемом.
      p.ellipse(69, 34, 11, 5, solid('#1a1418'), { part: 'neck', tone: -0.3 });
      // Шлем на шее: раз за цикл поворачивается к врагам.
      p.pose({ rot: 0.05 * turn + P.head * DEG, px: M.neck[0], py: M.neck[1] }, () => {
        p.scope(1, M.helm[0], M.helm[1], () => helm(p, L, helmKind));
      });
      // Горжет — золотой ворот полумесяцем после шлема: низ шлема уходит в него, как на листе.
      const gor: number[] = [];
      for (let a = 0; a <= 180; a += 12) gor.push(69 + 15 * Math.cos(a * DEG), 33.5 + 7 * Math.sin(a * DEG));
      for (let a = 180; a >= 0; a -= 12) gor.push(69 + 11.4 * Math.cos(a * DEG), 33.5 + 3.4 * Math.sin(a * DEG));
      p.poly(gor, L.gold, { part: 'gorget', bevel: 1.4, lift: 1 });
      arcStroke(p, 69, 33.5, 14.4, 6.4, 30, 150, L.goldLit, 'gorget');

      // Щит — перед туловищем, от кисти дальней руки.
      const cx = far.hx + (M.armF.shield[0] - M.armF.hand[0]) + P.shx, cy = far.hy + (M.armF.shield[1] - M.armF.hand[1]) + P.shy;
      p.pose({ rot: P.sh * DEG, px: cx, py: cy }, () => {
        p.scope(1, cx, cy, () => {
          shield(p, L);
          if (P.spark > 0.05) {
            const n = Math.round(7 * P.spark);
            for (let k = 0; k < n; k++) {
              const [x, y] = at(10, -30, -80 + k * 26, 3 + 5 * P.spark + (k % 2) * 2.5);
              p.px(x, y, k % 2 ? '#ffd890' : '#fff6d8');
            }
            p.glow(10, -30, 5 * P.spark, '#ffc870', 0.5);
          }
        });
      });

      // Ближняя рука с оружием — поверх туловища: пластина плеча, наруч с золотыми поясами, кулак на древке.
      const front = P.front > 0.5 && P.drop < 0.05;
      if (P.drop < 0.05 && !front) {
        drawWeapon(near.hx, near.hy, P.sw);
        headGlow(p, near.hx, near.hy, P.sw, headLen, P.glow);
      }
      p.limb(M.armN.sh[0], M.armN.sh[1], 8.2, near.ex, near.ey, 8, L.limb, { part: 'nearArm' });
      p.limb(near.ex, near.ey, 8.4, near.hx, near.hy, 7, L.limb, { part: 'nearArm' });
      const [ex, ey] = at(near.ex, near.ey, near.a2, 4), [hx2, hy2] = at(near.hx, near.hy, near.a2, -8);
      stroke(p, [ex - 3.5, ey + 1, hx2 - 3, hy2], L.edge, 'nearArm');
      // Золотые пояса наруча: у локтя и раструб перчатки над кулаком.
      const band = (along: number, half: number, w: number): void => {
        const [bx, by] = at(near.hx, near.hy, near.a2, -along);
        const nx = Math.cos((near.a2 + 90) * DEG), ny = Math.sin((near.a2 + 90) * DEG), ux = Math.cos(near.a2 * DEG), uy = Math.sin(near.a2 * DEG);
        p.poly([bx - nx * half - ux * w, by - ny * half - uy * w, bx + nx * half - ux * w, by + ny * half - uy * w, bx + nx * half + ux * w, by + ny * half + uy * w, bx - nx * half + ux * w, by - ny * half + uy * w], L.gold, { part: 'nearArm', paint: true });
      };
      band(6.8, 8.6, 1.6);
      band(ARM_N.l2 - 3.5, 9, 1.6);
      const fist = (): void => {
        p.ellipse(near.hx, near.hy, 6.8, 7.2, plate(L.limb), { part: 'fist', tone: -0.02, lift: 1 });
        stroke(p, [near.hx - 3.5, near.hy - 1.5, near.hx + 3, near.hy + 2.5], L.seam, 'fist');
        p.poly([near.hx - 4, near.hy - 3, near.hx - 1.5, near.hy - 5.5, near.hx + 1, near.hy - 5, near.hx - 2, near.hy - 2], L.limb, { part: 'fist', paint: true, tone: 0.28 });
      };
      if (!front) fist();
      // Пластина плеча — ступенью под наплечником, золото по верхней кромке; мельче, чем по контуру листа (вторым
      // куполом рядом с наплечником она делала плечо огромным), и вместе с рукой ближе к телу.
      p.scope(0.8, 24 * 0.2 + 6, 50 * 0.2 + 5.5, () => {
        p.poly([14.5, 45.1, 18.2, 40.7, 24.1, 38.5, 29.2, 39.9, 31.4, 45.1, 28.5, 49.5, 21.9, 50.9, 16, 50.2], plate(L.limb), { part: 'pLame', bevel: 2.6, tone: -0.06 });
        edgeBand(p, [29.2, 40.4, 24.1, 39, 18.2, 41.2, 14.9, 45.3], 2.4, L.gold, 'pLame');
      });
      // Ближний наплечник — купол по контуру листа (≈ 24 × 27) с толстой золотой каймой слева, снизу и справа
      // у шеи и бликом посередине: так он читается латным наплечником, а не шаром. Масштаб 0,8 к низу плеча, на 6 ниже
      // и на 5 ближе к телу, чем контур листа: в мерку листа купол выглядел «большим и выше, чем должен», верх — на
      // уровне глаз шлема; теперь верх на уровне подбородка, купол сидит на плече над рукой.
      p.scope(0.8, 40 * 0.2 + 5, 44 * 0.2 + 6, () => {
        p.poly([27.7, 36.3, 28.5, 28.9, 32.1, 23.1, 37.3, 18.7, 43.1, 16.5, 47.5, 17.9, 50.5, 23.1, 51.9, 30.4, 50.5, 37.7, 46.1, 42.1, 38.7, 43.6, 31.4, 41.4], L.limb, { part: 'pauldron', bevel: 7, lift: 2.5 });
        p.poly([35, 26, 39, 22, 43, 21.5, 44, 25, 40.5, 29.5, 36.5, 30.5], L.limb, { part: 'pauldron', paint: true, tone: 0.34 });
        p.poly([33, 37.5, 40, 39.5, 46, 37.5, 49.5, 33, 50.5, 37.7, 46.1, 42.1, 38.7, 43.6, 31.4, 41.4], L.limb, { part: 'pauldron', paint: true, tone: -0.2 });
        edgeBand(p, [29.2, 26, 28, 30, 27.8, 36.3, 31.4, 41.4, 38.7, 43.6, 46.1, 42.1, 50.5, 37.7, 51.9, 30.4, 50.5, 23.1, 47.5, 18.2], 3.5, L.gold, 'pauldron');
        stroke(p, [28.6, 36.6, 31.8, 41.6, 38.7, 43.8], L.goldLit, 'pauldron');
      });
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
