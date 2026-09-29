import { type Mat, type Painter } from '../mobs/pixel';
import type { AvatarSpec } from './avatar';
import type { HeroModel, HeroProbe } from './model';
import { clipAt, HERO_CLIPS, poseAt, type PoseKeys, type SculptClip } from './clips';
import { arcStroke, at, DEG, ease, ik, lerp, limb2, reachFoot, solid, stroke } from './rig';

/**
 * Паладин пиксельной лепкой — шаг 4 рецепта (docs/lepka-geroev.md): модель в стойке, облик выбран, клипы нарисованы.
 * В игру ещё не входит: записи в `HERO_MODELS` нет, инструменты находят модель по имени файла (`paladinModel()`),
 * страница обсуждения — tools/hero-proto/paladin-page.ts. Поля позы — как у Воина (плюс свет и щит за корпусом),
 * ключи его клипов подогнаны под короткий молот и большой щит; у удара, сильного удара, лечения и своего клипа
 * «Молот света» по два варианта на выбор (`paladinModel(pick)`).
 *
 * Решения пользователя со страницы «Лепка Паладина»: облик B «Пепельный храмовник» (тусклая побитая сталь, латунь
 * вместо золота, табард цвета пепла, крест и плащ цвета запёкшейся крови), топхельм по контуру листа с вырезом
 * крестом, молот; пиксель 1,5, как у Воина. Отвергнутые облики (A «Храмовник», C «Светоносец»), разрезы (Т-крест,
 * широкая щель, венец), булава и первые шлемы — в истории ветки.
 *
 * Референс — прежний рисованный лист `src/assets/heroes/paladin.png` (один ряд покоя, ячейка 188, фигура 180).
 * Контуры частей обведены по первому кадру в пикселях листа и переведены в единицы поля при росте 132
 * (k = 132 / 180): топхельм сидит в золотом горжете, наплечники — купола с толстой каймой (ниже и меньше листа,
 * «плечи высоко»), корпус прямой и широкий, табард с крестом на груди и длинным полотнищем между ног, плащ за спиной;
 * ближняя рука массивная, прижата к боку — пластина плеча, наруч с золотыми поясами, кулак у бедра держит молот,
 * боёк-барабан у ближнего колена; щит-«утюг» с крестом от плеча до колена; колени низко и широко, голени толстые,
 * наколенники и башмаки крупные.
 *
 * Смотрит вправо, на врагов. Ближняя сторона — левая (рука с молотом поверх туловища), дальняя — правая (рука со
 * щитом за туловищем, щит перед ним). Свет общий с врагами — сверху слева, из-за спины героя.
 */

// ─── Материалы ──────────────────────────────────────────────────────────────

/** Тусклая побитая сталь: тёмный рамп, фактура сколов; свой объект на каждую часть — у каждой своё зерно. */
const STEEL = ['#191417', '#352e32', '#564d51', '#857a7a', '#b8aea4'];
const steel = (): Mat => ({ base: STEEL[2], ramp: STEEL, dither: 0.3, metal: 0.6, tex: { kind: 'spots', scale: 2.4, amp: 0.2, density: 0.18 } });

/**
 * Материалы Паладина. Сталь шлема — та же, но чистая: без фактуры и дизеринга — зерно, царапины и полутона на пикселе
 * 1,5 превращали крупные плоскости шлема в рябь («шлем не чёткий»).
 */
const MAT = {
  limb: steel(),
  chest: steel(),
  helm: { base: STEEL[2], ramp: STEEL, dither: 0, metal: 0.6 } as Mat,
  head: steel(),
  /** Латунь вместо золота и её кромка на свету и в тени. */
  gold: { base: '#8a6230', ramp: ['#2a1a0a', '#4c3216', '#7a5528', '#a67c40', '#d0aa66'], dither: 0, metal: 0.5 } as Mat,
  goldLit: '#bf9652',
  goldDark: '#5a3c1a',
  /** Табард цвета пепла с грязным подолом и его складки. */
  tabard: { base: '#aa9a88', ramp: ['#3a302c', '#6a5c52', '#978676', '#bcac98', '#d8cab4'], shag: 0.12, tex: { kind: 'noise', scale: 2.2, amp: 0.18 } } as Mat,
  fold: '#6a5c52',
  /** Крест и кайма табарда, плащ — цвета запёкшейся крови. */
  red: { base: '#6e1a20', ramp: ['#200709', '#3e0e12', '#62171c', '#842428', '#a0383a'], dither: 0 } as Mat,
  cape: { base: '#5e161c', ramp: ['#1c0609', '#380c11', '#5c151b', '#7e2026', '#9a3432'], shag: 0.3, tex: { kind: 'stripes', scale: 2.2, amp: 0.16, angle: 1.5 } } as Mat,
  capeFold: '#24070b',
  /** Боёк, раскалённый светом (Молот света, приём, клич), и крест щита, залитый светом (лечение B). */
  lightHead: { base: '#e2c078', ramp: ['#6e5024', '#a88444', '#dcb86e', '#f4e0a4', '#fff8e0'], dither: 0, metal: 0.4 } as Mat,
  lightCross: { base: '#f4e2a8', ramp: ['#b08a48', '#d8b870', '#f4e2a8', '#fff4d0', '#fffcf0'], dither: 0 } as Mat,
  shieldFace: { base: '#b2a290', ramp: ['#3e342e', '#6e6056', '#9c8c7c', '#c0b09c', '#dccdb6'], tex: { kind: 'noise', scale: 2, amp: 0.2 } } as Mat,
  leather: { base: '#3e2a1e' } as Mat,
  wood: { base: '#3a281c', tex: { kind: 'stripes', scale: 2, amp: 0.14, angle: 0 } } as Mat,
  /** Стык пластин, светлая кромка стали, кромка в тени, отблески. */
  seam: '#140e11',
  edge: '#a89c96',
  dim: '#3a3034',
  glint: '#d8cec4',
  glintDim: '#a89e98',
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

/** От кулака до середины бойка: молот держится у верхней трети древка. */
const HEAD_AT = 31;

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
 * Топхельм по контуру листа в своих координатах: центр (0, 0) = `M.helm`, лицо к врагам (вправо). Верх скруглён, но
 * ниже купола — отвесные спина и лицо, а низ срезан прямым скосом: от затылка (y ≈ 4) вниз к подбородку (≈ 13), у
 * подбородка фаска. Шлем-цилиндр со скруглённым низом читался «просто сферой». Под скосом на затылке — тёмная
 * бармица до горжета (`aventail`, рисуется до шлема).
 */
const HELM_BODY: number[] = (() => {
  const pts: number[] = [];
  // Купол: дуга от спины через макушку к лицу.
  for (let a = 180; a <= 360; a += 15) pts.push(-0.1 + 11.4 * Math.cos(a * DEG), -5 + 10.6 * Math.sin(a * DEG));
  // Лицо отвесно вниз, фаска подбородка, прямой скос низа к затылку, отвесная спина.
  pts.push(11.3, 4, 9.6, 10.6, 6.9, 13.4, 3.5, 13, -10.8, 3.8, -11.5, 2.6);
  return pts;
})();

/** Бармица под скосом шлема — тёмная кольчуга от затылка до горжета; в своих координатах шлема. */
function aventail(p: Painter): void {
  p.poly([-11, 1.5, -3, 7, 4, 12.2, 5, 18, -11.5, 17, -12.5, 8], solid('#221c20'), { part: 'aventail', bevel: 2 });
  stroke(p, [-10.5, 9, 1, 14], '#3a3236', 'aventail');
  stroke(p, [-11, 13, 2, 17], '#3a3236', 'aventail');
}

/**
 * Шлем: плоские стороны с фаской, скруглённый купол, лицо за вертикалью в тени, пластина под прорезью светлая, по
 * скосу — светлая кромка. Разрез — вырез крестом (выбор пользователя из четырёх: Т-крест, вырез крестом, широкая щель,
 * венец): щель для глаз поперёк и прорезь вниз по оси лица в золотой кромке, выше — золотое ребро по куполу. Щели
 * и золото по два пикселя, края прямые — разрез листа в пикселе 1,5 выходил кашей.
 */
function helm(p: Painter): void {
  const H = MAT.helm;
  const o = { part: 'helm', paint: true };
  const slit = solid(SLIT);
  p.poly(HELM_BODY, H, { part: 'helm', bevel: 2.6, flat: 0.35 });
  p.ellipse(-0.1, -6, 11, 9.4, H, { part: 'helm', lift: 1.2 });
  // Плоскости: блик на куполе, лицо за вертикалью — в тени, низ спины — в полутени, пластина под прорезью — светлее.
  p.poly([-8.6, -9.5, -5.5, -13.3, -1.5, -14.6, -2.5, -10.5, -6.5, -6.5], H, { ...o, tone: 0.3 });
  p.poly([5.5, -15, 8.8, -13.2, 11.3, -9, 11.3, 4, 9.6, 10.6, 6.9, 13.4, 5.5, 13.3], H, { ...o, tone: -0.2 });
  p.poly([-11.5, -2, -9.5, -2, -9.5, 4.9, -10.8, 3.8, -11.5, 2.6], H, { ...o, tone: -0.12 });
  p.poly([-9.5, 2.4, 3.5, 2.4, 3.5, 13, -9.5, 4.9], H, { ...o, tone: 0.16 });
  // Светлая кромка по скосу — сплошной полосой: штрих в пиксель на сетке 1,5 рвался пунктиром.
  p.poly([-10.8, 3.8, 3.5, 13, 3.5, 11.2, -10.2, 2.4], solid(MAT.glint), o);
  stroke(p, [-2.8, -12.5, -2.8, -3.5], MAT.edge, 'helm');
  // Вырез крестом в золотой кромке и золотое ребро по куполу над ним.
  p.poly([-4, -3.8, 11.3, -3.8, 11.3, 3.4, 7.6, 3.4, 7.6, 12.4, 2.8, 12.2, 2.8, 3.4, -4, 3.4], MAT.gold, o);
  p.poly([-2.6, -2.2, 11.3, -2.2, 11.3, 1.4, 6.2, 1.4, 6.2, 11, 4.2, 11, 4.2, 1.4, -2.6, 1.4], slit, o);
  p.poly([3.8, -15.4, 6.6, -15.2, 6.6, -3.8, 3.8, -3.8], MAT.gold, o);
  stroke(p, [-3.8, -3.6, 4, -3.6], MAT.goldLit, 'helm');
  stroke(p, [3, 3.6, 3, 12], MAT.goldLit, 'helm');
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
function crossBar(p: Painter, x0: number, y0: number, x1: number, y1: number, w: number, mat: Mat = MAT.red): void {
  const l = Math.hypot(x1 - x0, y1 - y0), nx = (-(y1 - y0) / l) * w, ny = ((x1 - x0) / l) * w;
  p.poly([x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny], mat, { part: 'shieldIn', paint: true });
}

/**
 * Щит. `shine` — свет креста (лечение B): крест светлеет до латуни и до белого золота, вокруг щита ореол, с 0,9 — лучи
 * по плечам креста за кромкой, прямо по вертикали, как бы ни стоял щит (`tilt` — его наклон в мире, градусы).
 */
function shield(p: Painter, shine = 0, tilt = 0): void {
  p.poly(SHIELD, MAT.gold, { part: 'shield', bevel: 2.4, flat: 0.6 });
  p.poly(inset(SHIELD, 3), MAT.shieldFace, { part: 'shieldIn', flat: 0.9, lift: 0.4, noLine: true });
  const cross = shine > 0.75 ? MAT.lightCross : shine > 0.35 ? MAT.gold : MAT.red;
  crossBar(p, 0.5, -34, 11, 30, 2.4, cross);
  crossBar(p, -18, -1.5, 21, -7.8, 2.3, cross);
  if (shine > 0.9) for (const k of [0, 90, 180, 270]) ray(p, 5.2, -5.3, k - tilt, 30, 40 + 10 * (shine - 0.9), LIGHT.ray);
  if (shine > 0.02) p.glow(5.2, -5.3, 26 + 14 * Math.min(shine, 1.2), LIGHT.halo, 0.25 + 0.3 * Math.min(shine, 1));
  // Кромка обода на свету — сверху и слева, в тени — справа и снизу; потёртости поля.
  stroke(p, [-18.2, -19.4, -6.8, -28.6, 5, -34.4], MAT.goldLit, 'shield');
  stroke(p, [-17, -9, -12.6, 1.6, -6.8, 14.2], MAT.goldLit, 'shield');
  stroke(p, [18.6, 9, 15.6, 21.6, 11.4, 31.6], MAT.goldDark, 'shield');
  stroke(p, [-11, -10, -8, -9], MAT.fold, 'shieldIn');
  stroke(p, [11, 6, 13.5, 8.5], MAT.fold, 'shieldIn');
  stroke(p, [-2, 16, 0, 19], MAT.fold, 'shieldIn');
}

// ─── Оружие ─────────────────────────────────────────────────────────────────

/**
 * Молот с листа: древко с золотой обмоткой между кулаком и бойком, золотое навершие за кулаком. Боёк — стальной
 * барабан вдоль древка (на листе ≈ 19 × 20): золотое кольцо у древка, ударная грань к зрителю внизу справа в золотом
 * ободе, блик по верху. Боёк-шар того же тона, что наколенник, сливался с ногой — у барабана светлая грань и обод.
 */
function hammer(p: Painter, x: number, y: number, a: number, lit = 0): void {
  const head = lit > 0.55 ? MAT.lightHead : MAT.head;
  const u: [number, number] = [Math.cos(a * DEG), Math.sin(a * DEG)];
  const n: [number, number] = [-u[1], u[0]];
  /** Точка бойка: `s` — вдоль древка от кулака, `t` — поперёк. */
  const q = (s: number, t: number): [number, number] => [x + u[0] * s + n[0] * t, y + u[1] * s + n[1] * t];
  const s0 = 21.5, s1 = 40, r = 10;
  p.limb(...at(x, y, a, -12), 2.1, ...at(x, y, a, s0 + 2), 2.1, MAT.wood, { part: 'haft' });
  for (let s = 6; s <= s0 - 2; s += 3.4) {
    const [cx, cy] = at(x, y, a, s);
    stroke(p, [cx - n[0] * 2.4 - u[0] * 0.9, cy - n[1] * 2.4 - u[1] * 0.9, cx + n[0] * 2.4 + u[0] * 0.9, cy + n[1] * 2.4 + u[1] * 0.9], MAT.goldLit, 'haft');
  }
  p.ellipse(...at(x, y, a, -13.5), 3, 3, MAT.gold, { part: 'hPommel', lift: 1 });
  // Тело барабана — цилиндр поперёк: свет по верху, тень снизу; скруглённые концы закрывают кольцо и грань.
  p.limb(...q(s0 + 3, 0), r, ...q(s1 - 3, 0), r, head, { part: 'hHead', lift: 1.5 });
  p.poly([...q(s0 + 3, -r + 2.2), ...q(s1 - 4, -r + 2.2), ...q(s1 - 5, -r + 4.4), ...q(s0 + 4, -r + 4.4)], head, { part: 'hHead', paint: true, tone: 0.3 });
  // Кольцо у древка — золотой пояс чуть шире тела.
  p.poly([...q(s0, -r - 0.6), ...q(s0 + 3.4, -r - 0.6), ...q(s0 + 3.4, r + 0.6), ...q(s0, r + 0.6)], MAT.gold, { part: 'hCollar', bevel: 1.2, lift: 1 });
  stroke(p, [...q(s0 + 0.6, -r), ...q(s0 + 0.6, r - 2)], MAT.goldLit, 'hCollar');
  // Ударная грань — эллипс поперёк (торец в ракурсе), светлее тела, в золотом ободе.
  p.ellipse(...q(s1 - 1.5, 0), 4.4, r + 0.4, head, { part: 'hFace', rot: a * DEG, lift: 2, tone: 0.12 });
  rimBand(p, ...q(s1 - 1.5, 0), 4.4, r + 0.4, 2, 0, 360, MAT.gold, 'hFace', a * DEG);
  stroke(p, [...q(s1 - 2.5, -r + 2), ...q(s1 - 0.5, r - 3)], MAT.goldLit, 'hFace');
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
  /** Свет на бойке (Молот света, клич, приём), пыль у бойка, искры о кромку щита. */
  glow: number; dust: number; spark: number;
  /** Вспышка света у бойка в кадр удара, луч с неба на боёк, свет креста на щите (лечение). */
  burst: number; beam: number; shine: number;
  /** Щит за туловищем (1): размах удара, дальнее плечо ушло назад. */
  sback: number;
  /** Оружие поверх ближнего наплечника — для портрета. */
  front: number;
}

const REST: PaladinPose = {
  x: 0, y: 0, crouch: 0, lean: 0, head: 0,
  n1: ARM_N.a1, n2: ARM_N.a2, sw: M.armN.weapon,
  nh: 0, hx: M.armN.hand[0], hy: M.armN.hand[1],
  f1: ARM_F.a1, f2: ARM_F.a2, sh: 0, shx: 0, shy: 0,
  footF: 0, footN: 0, liftF: 0, liftN: 0, kneel: 0,
  cape: 0, fall: 0, drop: 0, glow: 0, dust: 0, spark: 0, burst: 0, beam: 0, shine: 0, sback: 0, front: 0,
};

/** Клипы, которые рисует Паладин: общие и свой Молот света; чужие личные (Воина) играют замену. */
type PaladinClip = Exclude<SculptClip, 'idle' | 'bash' | 'riposte'>;
/** Клипы, у которых два варианта на выбор. */
export type PaladinVariant = 'attack' | 'heavy' | 'heal' | 'smite';
/** Выбор вариантов: без записи — первый (A). */
export type PaladinChoice = Partial<Record<PaladinVariant, 'A' | 'B'>>;

/**
 * Ключи клипов по кадрам (номер кадра с нуля; кадр контакта — `contact` в HERO_CLIPS). Правила те же, что у Воина:
 * поле, которого нет в ключе, держит свою интерполяцию; после последнего ключа — покой к последнему кадру (смерть
 * держится); вспышки (`spark`, `dust`, `burst`) — явным нулём на кадре перед контактом. Рука с молотом — всегда путём
 * кисти (`hx`, `hy` в координатах верха, локоть — ik): в покое кисть висит тем же путём, и клип начинается с него.
 *
 * Молот короткий (от кулака до середины бойка 31, у меча Воина — 70), а рука короче и массивнее: до земли боёк
 * не достаёт даже из выпада (присед 20 и наклон 26 сминали фигуру в ком, а боёк всё равно висел выше земли), поэтому
 * сильные удары бьют врага в корпус, а не в землю. Щит на ударе уходит вниз и назад — висящий перед корпусом, он
 * закрывал боёк в кадр контакта.
 *
 * Где решение за пользователем, у клипа два варианта: первый — здесь, второй — в `CLIPS_B`.
 */
const CLIPS: Record<PaladinClip, PoseKeys<PaladinPose>> = {
  // Удар A «Сверху»: кисть над плечом, боёк за шлемом — шаг, и молот через верх на врага; щит прижат.
  attack: [
    [0, { x: -1, crouch: 2, lean: -3, hx: 30, hy: 56, sw: -40, cape: 0.1 }],
    [1, { x: -4, crouch: 3, lean: -8, head: -4, hx: 36, hy: 14, sw: -150, f1: 60, f2: 30, sh: -4, liftF: 2, cape: 0.25 }],
    [2, { x: -5, crouch: 3, lean: -10, head: -6, hx: 38, hy: 11, sw: -170, f1: 60, f2: 30, sh: -4, liftF: 3, cape: 0.3 }],
    [3, { x: 4, crouch: 4, lean: 2, head: 0, hx: 60, hy: 16, sw: -55, f1: 80, f2: 55, sh: 4, liftF: 4, footF: 7, cape: 0.6 }],
    [4, { x: 11, crouch: 8, lean: 12, head: 6, hx: 72, hy: 50, sw: 30, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, liftF: 0, footF: 12, cape: 1 }],
    [5, { x: 11, crouch: 8, lean: 12, head: 6, hx: 71, hy: 52, sw: 36, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, footF: 12, cape: 0.85 }],
    [6, { x: 5, crouch: 4, lean: 5, head: 3, hx: 46, hy: 66, sw: 40, liftF: 3, footF: 6, cape: 0.4 }],
  ],
  // Сильный удар A «Сверху с шагом»: привстал на носки, молот за спиной — широкий шаг, молот через верх на врага,
  // щит уходит вниз и назад, чтобы не закрыть удар; из-под шага — пыль.
  heavy: [
    [0, { x: -1, crouch: 4, lean: 2, head: 2, hx: 34, hy: 50, sw: -40, cape: 0.1, dust: 0 }],
    [1, { x: -5, y: -2, crouch: 1, lean: -12, head: -8, hx: 38, hy: 9, sw: -160, f1: 60, f2: 30, sh: 2, liftF: 1, cape: 0.3 }],
    [2, { x: -6, y: -4, crouch: 0, lean: -15, head: -10, hx: 40, hy: 6, sw: -200, f1: 60, f2: 30, sh: 2, liftF: 3, footF: -2, cape: 0.4 }],
    [3, { x: -4, y: -4, crouch: 0, lean: -14, head: -9, hx: 41, hy: 6, sw: -206, f1: 62, f2: 32, sh: 3, liftF: 5, footF: 2, cape: 0.45 }],
    [4, { x: 6, y: -2, crouch: 4, lean: 4, head: 2, hx: 66, hy: 14, sw: -110, f1: 78, f2: 55, sh: 8, liftF: 6, footF: 12, cape: 0.7, dust: 0 }],
    [5, { x: 16, y: 0, crouch: 10, lean: 16, head: 8, hx: 74, hy: 44, sw: 30, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, liftF: 0, footF: 18, footN: -2, cape: 0.8, dust: 0 }],
    [6, { x: 17, crouch: 12, lean: 18, head: 10, hx: 72, hy: 52, sw: 55, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, footF: 18, footN: -2, cape: 0.7, dust: 1 }],
    [7, { x: 16, crouch: 12, lean: 17, head: 10, hx: 71, hy: 54, sw: 58, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, footF: 18, footN: -2, cape: 0.6, dust: 0.6 }],
    [8, { x: 7, crouch: 6, lean: 8, head: 5, hx: 46, hy: 70, sw: 50, liftF: 4, footF: 9, footN: -1, cape: 0.3, dust: 0.15 }],
  ],
  // Приём (заклинание, бросок): молот вскинут к небу, свет собирается на бойке — и боёк на цель, рука во всю длину.
  power: [
    [0, { lean: -2, hx: 34, hy: 50, sw: -40 }],
    [1, { x: -2, lean: -6, head: -6, hx: 42, hy: 12, sw: -100, f1: 80, f2: 60, glow: 0.3, cape: 0.2 }],
    [2, { x: -2, lean: -6, head: -6, hx: 43, hy: 10, sw: -102, f1: 80, f2: 60, glow: 0.6, cape: 0.25 }],
    [3, { x: 4, lean: 6, head: 2, hx: 64, hy: 26, sw: -40, f1: 84, f2: 66, glow: 0.8, footF: 4, liftF: 2, cape: 0.5 }],
    [4, { x: 6, lean: 8, head: 4, hx: 72, hy: 36, sw: -8, f1: 86, f2: 70, glow: 1.1, footF: 6, cape: 0.6 }],
    [5, { x: 6, lean: 8, head: 4, hx: 71, hy: 37, sw: -6, f1: 86, f2: 70, glow: 0.6, footF: 6, cape: 0.5 }],
    [6, { x: 3, lean: 5, head: 3, hx: 48, hy: 60, sw: 20, glow: 0.2, footF: 3 }],
  ],
  // Лечение A «На колено»: опустился на заднее колено, молот бойком в землю перед собой, шлем склонён — боёк светится.
  heal: [
    [0, { x: 2, crouch: 6, lean: 4, head: 4, hx: 44, hy: 62, sw: 80, kneel: 0.2 }],
    [1, { x: 3, crouch: 16, lean: 3, head: 8, hx: 58, hy: 62, sw: 88, f1: 88, f2: 84, sh: 4, shy: -6, kneel: 0.6, glow: 0.2 }],
    [2, { x: 4, crouch: 24, lean: 2, head: 14, hx: 62, hy: 64, sw: 90, f1: 92, f2: 88, sh: 0, shy: -12, kneel: 1, dust: 0.35, glow: 0.7 }],
    [3, { x: 4, crouch: 25, lean: 3, head: 16, hx: 62, hy: 64, sw: 90, f1: 92, f2: 88, shy: -12, kneel: 1, dust: 0.1, glow: 1.1 }],
    [7, { x: 4, crouch: 24, lean: 2, head: 14, hx: 62, hy: 64, sw: 90, f1: 92, f2: 88, shy: -12, kneel: 1, dust: 0, glow: 1 }],
    [8, { x: 4, crouch: 23, lean: 0, head: 4, hx: 62, hy: 64, sw: 90, f1: 90, f2: 86, shy: -12, kneel: 1, glow: 0.5 }],
    [9, { x: 3, crouch: 14, lean: 2, head: 4, hx: 52, hy: 64, sw: 78, f1: 86, f2: 80, shy: -6, kneel: 0.5, glow: 0.15 }],
    [10, { x: 1, crouch: 5, lean: 2, head: 2, hx: 36, hy: 70, sw: 50, kneel: 0.1, glow: 0 }],
  ],
  // Клич: молот к небу, щит в сторону, грудь вперёд, шлем запрокинут, боёк светится — рёв рисует слой эффектов.
  buff: [
    [0, { lean: -2, head: -2, hx: 34, hy: 46, sw: -50 }],
    [1, { x: -2, crouch: 3, lean: -10, head: -12, hx: 44, hy: 7, sw: -92, f1: 15, f2: 5, sh: -10, cape: 0.4 }],
    [2, { x: -2, crouch: 3, lean: -14, head: -18, hx: 45, hy: 5, sw: -95, f1: 5, f2: -5, sh: -16, cape: 0.7, glow: 0.6 }],
    [5, { x: -2, crouch: 3, lean: -14, head: -18, hx: 45, hy: 5, sw: -96, f1: 5, f2: -5, sh: -16, cape: 1, glow: 1 }],
    [7, { x: -1, crouch: 2, lean: -8, head: -10, hx: 42, hy: 11, sw: -88, f1: 30, f2: 15, sh: -6, cape: 0.6, glow: 0.4 }],
    [8, { lean: -2, head: -2, hx: 34, hy: 50, sw: -40, cape: 0.3, glow: 0 }],
  ],
  // Блок: щит к лицу, присел и спрятал голову, молот отведён к бедру; в кадре контакта — толчок назад и искры.
  block: [
    [0, { crouch: 2, lean: 3, head: 8, f1: 0, f2: -45, sh: -6, shy: -6, spark: 0 }],
    [1, { crouch: 4, lean: 2, head: 12, f1: -25, f2: -75, sh: -10, shy: -12, hx: 30, hy: 66, sw: 120, spark: 0 }],
    [2, { x: -4, crouch: 5, lean: -2, head: 14, f1: -22, f2: -72, sh: -14, shy: -12, hx: 29, hy: 66, sw: 122, spark: 1 }],
    [3, { x: -3, crouch: 4, lean: 0, head: 12, f1: -23, f2: -73, sh: -11, shy: -12, hx: 29, hy: 67, sw: 118, spark: 0.4 }],
    [4, { x: -1, crouch: 2, lean: 2, head: 6, f1: 20, f2: -20, sh: -4, shy: -4, hx: 27, hy: 72, sw: 70, spark: 0 }],
  ],
  // Урон: отбросило назад, шлем запрокинут, молот отлетел назад, щит в сторону; вспышку добавляет движок.
  hurt: [
    [0, { x: -7, crouch: 2, lean: -14, head: -20, hx: 20, hy: 66, sw: 150, f1: 85, f2: 75, sh: 18, cape: 0.6 }],
    [1, { x: -6, crouch: 2, lean: -12, head: -16, hx: 21, hy: 68, sw: 140, f1: 82, f2: 68, sh: 15, cape: 0.5 }],
    [2, { x: -3, crouch: 1, lean: -5, head: -7, hx: 23, hy: 72, sw: 90, f1: 68, f2: 45, sh: 8, cape: 0.3 }],
    [3, { x: -1, lean: -1, head: -1, cape: 0.1 }],
  ],
  // Смерть: отбросило, молот выскользнул, колено на землю, упал на спину — щит на груди, молот рядом.
  death: [
    [0, { x: -6, crouch: 2, lean: -14, head: -20, hx: 20, hy: 66, sw: 150, f1: 85, f2: 75, sh: 18, cape: 0.6 }],
    [1, { x: -8, crouch: 7, lean: -10, head: -12, hx: 20, hy: 70, sw: 140, drop: 0.12, cape: 0.5 }],
    [2, { x: -8, crouch: 15, lean: -2, head: 10, hx: 24, hy: 74, f1: 95, f2: 90, drop: 0.45, cape: 0.4, kneel: 0.6 }],
    [3, { x: -8, crouch: 22, lean: 4, head: 16, hx: 26, hy: 76, f1: 92, f2: 85, drop: 0.8, cape: 0.3, kneel: 1 }],
    [4, { x: -8, crouch: 24, lean: 0, head: 12, drop: 1, fall: 0.05, kneel: 1 }],
    [5, { fall: 0.25, head: -4 }],
    [6, { fall: 0.5, head: -10, f1: 88, f2: 86, sh: 4, kneel: 0 }],
    [7, { fall: 0.78, head: -14, cape: 0.1 }],
    [8, { fall: 1, head: -10 }],
    [9, { fall: 1.04, y: -2, head: -6 }],
    [10, { fall: 1, y: 0, head: -4, f1: 90, f2: 90, sh: 0, cape: 0 }],
  ],
  // Молот света A «Крест лучей»: молот вскинут к небу, свет собирается на бойке крестом лучей — и удар сильного
  // удара: в кадр контакта боёк вспыхивает.
  smite: [
    [0, { lean: -2, hx: 36, hy: 46, sw: -50, glow: 0.1 }],
    [1, { x: -3, y: -2, lean: -10, head: -10, hx: 44, hy: 7, sw: -92, f1: 30, f2: 10, sh: -10, glow: 0.5, cape: 0.3 }],
    [2, { x: -3, y: -3, lean: -12, head: -14, hx: 45, hy: 5, sw: -94, f1: 25, f2: 5, sh: -12, glow: 0.95, cape: 0.45 }],
    [3, { x: -4, y: -4, lean: -14, head: -12, hx: 42, hy: 6, sw: -150, f1: 40, f2: 15, sh: -6, glow: 1.2, liftF: 3, cape: 0.5, burst: 0 }],
    [4, { x: 6, y: -2, crouch: 4, lean: 4, head: 2, hx: 66, hy: 14, sw: -100, f1: 78, f2: 55, sh: 8, glow: 1.3, liftF: 6, footF: 12, cape: 0.7, dust: 0, burst: 0 }],
    [5, { x: 16, y: 0, crouch: 10, lean: 16, head: 8, hx: 74, hy: 44, sw: 30, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, glow: 1.6, liftF: 0, footF: 18, footN: -2, cape: 0.8, burst: 1 }],
    [6, { x: 17, crouch: 12, lean: 18, head: 10, hx: 72, hy: 52, sw: 55, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, glow: 1.1, footF: 18, footN: -2, cape: 0.7, burst: 0.6 }],
    [7, { x: 16, crouch: 12, lean: 17, head: 10, hx: 71, hy: 54, sw: 58, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, glow: 0.6, footF: 18, footN: -2, cape: 0.6, burst: 0.2 }],
    [8, { x: 7, crouch: 6, lean: 8, head: 5, hx: 46, hy: 70, sw: 50, glow: 0.2, liftF: 4, footF: 9, footN: -1, cape: 0.3, burst: 0 }],
  ],
};

/** Вторые варианты клипов, где выбирает пользователь (страница обсуждения). */
const CLIPS_B: Record<PaladinVariant, PoseKeys<PaladinPose>> = {
  // Удар B «Снизу»: молот уходит назад к земле — шаг, и боёк снизу вверх под щит врага.
  attack: [
    [0, { x: -1, crouch: 3, lean: 2, hx: 28, hy: 72, sw: 90 }],
    [1, { x: -4, crouch: 5, lean: -3, hx: 22, hy: 70, sw: 150, f1: 55, f2: 25, sh: -4, liftF: 2, cape: 0.2 }],
    [2, { x: -5, crouch: 6, lean: -4, hx: 21, hy: 69, sw: 162, f1: 55, f2: 25, sh: -4, liftF: 3, cape: 0.25 }],
    [3, { x: 4, crouch: 5, lean: 4, hx: 50, hy: 70, sw: 70, f1: 80, f2: 55, sh: 4, footF: 7, liftF: 4, cape: 0.6 }],
    [4, { x: 11, crouch: 4, lean: 8, head: 2, hx: 72, hy: 44, sw: -22, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, liftF: 0, footF: 12, cape: 1 }],
    [5, { x: 11, crouch: 3, lean: 6, head: 1, hx: 71, hy: 40, sw: -34, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, footF: 12, cape: 0.85 }],
    [6, { x: 5, crouch: 2, lean: 3, hx: 46, hy: 60, sw: 20, liftF: 3, footF: 6, cape: 0.4 }],
  ],
  // Сильный удар B «Прыжок»: присел, молот назад к земле — прыжок, молот над головой, и приземление с ударом в землю.
  heavy: [
    [0, { x: -1, crouch: 6, lean: 4, head: 2, hx: 32, hy: 60, sw: 70, cape: 0.1, dust: 0 }],
    [1, { x: -3, crouch: 13, lean: 10, head: 4, hx: 26, hy: 68, sw: 130, f1: 82, f2: 62, cape: 0.2 }],
    [2, { x: 4, y: -14, crouch: -2, lean: -10, head: -8, hx: 40, hy: 8, sw: -150, f1: 55, f2: 25, sh: -4, liftF: 12, liftN: 10, footF: 6, footN: 2, cape: 0.6 }],
    [3, { x: 10, y: -18, crouch: -2, lean: -12, head: -10, hx: 42, hy: 6, sw: -200, f1: 55, f2: 25, sh: -4, liftF: 14, liftN: 12, footF: 10, footN: 5, cape: 0.8 }],
    [4, { x: 14, y: -8, crouch: 3, lean: 6, head: 4, hx: 64, hy: 14, sw: -100, f1: 78, f2: 55, sh: 8, liftF: 6, liftN: 4, footF: 14, footN: 8, cape: 1, dust: 0 }],
    [5, { x: 18, y: 0, crouch: 11, lean: 15, head: 9, hx: 74, hy: 40, sw: 18, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, liftF: 0, liftN: 0, footF: 14, footN: 8, cape: 0.8, dust: 0 }],
    [6, { x: 18, crouch: 14, lean: 18, head: 12, hx: 72, hy: 52, sw: 55, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, footF: 14, footN: 8, cape: 0.7, dust: 1 }],
    [7, { x: 17, crouch: 13, lean: 17, head: 11, hx: 71, hy: 54, sw: 58, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, footF: 14, footN: 8, cape: 0.6, dust: 0.6 }],
    [8, { x: 8, crouch: 7, lean: 8, head: 5, hx: 46, hy: 70, sw: 50, liftF: 4, footF: 10, footN: 4, cape: 0.3, dust: 0.15 }],
  ],
  // Лечение B «Свет щита»: стоя, щит поднят к груди крестом к небу, шлем склонён, молот опущен — крест светится.
  heal: [
    [0, { crouch: 2, lean: 2, head: 4, hx: 28, hy: 74, sw: 60, f1: 40, f2: 0, sh: -6 }],
    [1, { crouch: 4, lean: 0, head: 10, hx: 30, hy: 74, sw: 75, f1: 5, f2: -40, sh: -14, shx: -6, shy: -8, shine: 0.3, cape: 0.2 }],
    [2, { crouch: 5, lean: -2, head: 14, hx: 30, hy: 75, sw: 78, f1: -5, f2: -55, sh: -18, shx: -8, shy: -12, shine: 0.8, cape: 0.3 }],
    [3, { crouch: 5, lean: -2, head: 14, hx: 30, hy: 75, sw: 78, f1: -5, f2: -55, sh: -18, shx: -8, shy: -12, shine: 1.1, cape: 0.35 }],
    [7, { crouch: 5, lean: -2, head: 12, hx: 30, hy: 75, sw: 78, f1: -5, f2: -55, sh: -18, shx: -8, shy: -12, shine: 1, cape: 0.4 }],
    [8, { crouch: 4, lean: -1, head: 4, hx: 30, hy: 75, sw: 75, f1: 5, f2: -40, sh: -14, shx: -6, shy: -8, shine: 0.5, cape: 0.3 }],
    [9, { crouch: 2, lean: 1, head: 2, hx: 28, hy: 75, sw: 60, f1: 40, f2: 10, sh: -6, shx: -2, shy: -3, shine: 0.15, cape: 0.15 }],
    [10, { crouch: 1, lean: 0, head: 1, shine: 0 }],
  ],
  // Молот света B «Луч с неба»: молот к небу, на боёк падает луч света — и удар с шагом прямо в грудь врага,
  // боёк вспыхивает.
  smite: [
    [0, { lean: -2, hx: 36, hy: 46, sw: -50, glow: 0.1 }],
    [1, { x: -2, y: -1, lean: -8, head: -14, hx: 44, hy: 7, sw: -92, f1: 40, f2: 15, sh: -8, glow: 0.4, beam: 0.3, cape: 0.2 }],
    [2, { x: -2, y: -2, lean: -10, head: -18, hx: 45, hy: 5, sw: -93, f1: 35, f2: 10, sh: -10, glow: 1, beam: 1, cape: 0.3 }],
    [3, { x: -3, y: -2, lean: -11, head: -16, hx: 44, hy: 6, sw: -110, f1: 40, f2: 15, sh: -8, glow: 1.3, beam: 0.5, cape: 0.35, burst: 0 }],
    [4, { x: 5, crouch: 4, lean: 2, head: 0, hx: 62, hy: 16, sw: -70, f1: 80, f2: 55, sh: 4, glow: 1.3, beam: 0, liftF: 4, footF: 8, cape: 0.6, burst: 0 }],
    [5, { x: 12, crouch: 9, lean: 13, head: 6, hx: 73, hy: 48, sw: 25, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, glow: 1.6, liftF: 0, footF: 13, cape: 0.9, burst: 1 }],
    [6, { x: 12, crouch: 9, lean: 13, head: 6, hx: 72, hy: 50, sw: 30, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, glow: 1.1, footF: 13, cape: 0.85, burst: 0.6 }],
    [7, { x: 10, crouch: 8, lean: 11, head: 5, hx: 70, hy: 52, sw: 33, f1: 150, f2: 175, sh: -20, shx: -6, shy: 6, sback: 1, glow: 0.6, footF: 12, cape: 0.7, burst: 0.2 }],
    [8, { x: 5, crouch: 4, lean: 5, head: 3, hx: 46, hy: 66, sw: 40, glow: 0.2, liftF: 3, footF: 6, cape: 0.4, burst: 0 }],
  ],
};

/** Клипы с вариантами на выбор и их имена — для страницы обсуждения. */
export const PALADIN_VARIANTS: Record<PaladinVariant, { A: string; B: string }> = {
  attack: { A: 'Сверху', B: 'Снизу' },
  heavy: { A: 'Сверху с шагом', B: 'Прыжок' },
  heal: { A: 'На колено', B: 'Свет щита' },
  smite: { A: 'Крест лучей', B: 'Луч с неба' },
};

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

/** Зонд: точки кадра — таз, кисть, середина бойка, стопы. Боёк у земли нарочно — лечение на колене, падение. */
export const paladinProbe: HeroProbe = { grounded: ['heal', 'death'] };

/**
 * Покой в фазе `p.t`. Клипы рисуются в фазе 0 и начинаются и кончаются этой позой — так стык с покоем без скачка,
 * хотя в покое таз осел, вес на ноге и рука висит своим путём.
 *
 * Покой в ногах: таз оседает на пиксель на четверть цикла дыхания позже груди, а верх догоняет волной; раз за цикл вес
 * переходит с ноги на ногу. Стопы стоят, колени идут за тазом наполовину (см. колено в `drawPaladin`). Без этого дышал
 * только верх и ноги стояли намертво («ноги снизу не двигаются совсем»); присед на два пикселя через ik разводил почти
 * прямые ноги коленями в стороны. Сдвиги — целыми пикселями, иначе латы на ногах рябят.
 */
function idlePose(p: Painter): PaladinPose {
  const P = { ...REST };
  P.crouch += p.bob(1.5, 2, 0.25);
  P.x += p.snap(1.4 * p.wave(1, 0.3));
  // Рука с молотом висит, а не приклеена к корпусу («неестественно двигается вместе с телом»): кисть повторяет только
  // 40 % движения корпуса — дыхания (тот же `bob(2, 2)`, что в рисунке), оседания и переноса веса, — локоть при этом
  // сгибается сам (ik), а молот качается маятником ±2° с запаздыванием за переносом веса.
  const bodyX = P.x, bodyY = P.crouch - p.bob(2, 2);
  P.nh = 1;
  P.hx = REST.hx - 0.6 * bodyX;
  P.hy = REST.hy - 0.6 * bodyY;
  P.sw += 2.2 * p.wave(1, 0.45);
  P.sh += 1 * p.wave(1, 0.55);
  return P;
}

/** Поза кадра: ключи клипа (вариант — по выбору `pick`) поверх покоя в фазе 0 или сам покой. */
function framePose(p: Painter, pick: PaladinChoice): PaladinPose {
  const base = idlePose(p);
  const c = clipAt(p);
  let P = base;
  if (c) {
    const clip = c.clip as PaladinClip;
    const keys = (pick[clip as PaladinVariant] === 'B' ? CLIPS_B[clip as PaladinVariant] : undefined) ?? CLIPS[clip];
    if (keys) P = poseAt(base, keys, c.f, c.n, HERO_CLIPS[c.clip].hold);
  }
  // Покой: плащ колышется, раз за цикл шлем поворачивается к врагам (в клипах фаза 0 — оба нуля).
  P.cape += 0.05 * (1 - Math.cos(2 * Math.PI * p.t));
  P.head += 3 * p.blink(0.62, 0.16);
  return P;
}

/**
 * Черновик аватарки (шаг 5 — после клипов): бюст из кадра покоя на золотом фоне прежнего портрета. Своя поза
 * портрета — следующим шагом, после выбора вариантов клипов.
 */
const AVATAR: AvatarSpec = {
  crop: [20, -6, 96],
  halo: [70, 20, 30],
  colors: { top: '#6a4410', bottom: '#1f1306', halo: '#a8741f', haloEdge: '#d09a38', skyline: '#2a1a08', frameDark: '#120a04', frame: '#4a2e0e', frameLight: '#8a5a1e' },
  skyline: [[0.06, 0.1, 0.6, 0.2], [0.14, 0.06, 0.5, 0.12], [0.9, 0.08, 0.62, 0.2], [0.96, 0.06, 0.5, 0.1]],
};

/** Паладин; рост в покое — `HERO_BODY_HEIGHT.paladin` (132) в пикселе `HERO_PIXEL`. `pick` — варианты клипов. */
export function paladinModel(pick: PaladinChoice = {}): HeroModel {
  return {
    id: 'paladin',
    own: ['smite'],
    avatar: AVATAR,
    probe: paladinProbe,
    w: 132,
    h: 140,
    ground: G,
    pad: 80,
    draw: (p: Painter) => drawPaladin(p, framePose(p, pick)),
  };
}

/** Свет Паладина: ореол, лучи, луч с неба, крест щита. */
const LIGHT = { halo: '#ffe2a8', core: '#fff6e0', ray: '#fff2cc', rayDim: '#ffe0a0', beam: '#ffe9a870', burst: '#ffd98a' };

/**
 * Луч света в два пикселя шириной от `r0` до `r1` по направлению `ang` — только по пустым клеткам. Рисуется раньше
 * ореола: декаль «под» ложится только в пустую клетку, и ореол, нарисованный первым, съедал бы лучи.
 */
function ray(p: Painter, x: number, y: number, ang: number, r0: number, r1: number, color: string): void {
  const nx = Math.cos((ang + 90) * DEG) * 0.75, ny = Math.sin((ang + 90) * DEG) * 0.75;
  const [x0, y0] = at(x, y, ang, r0), [x1, y1] = at(x, y, ang, r1);
  p.line(x0 + nx, y0 + ny, x1 + nx, y1 + ny, color, true);
  p.line(x0 - nx, y0 - ny, x1 - nx, y1 - ny, color, true);
}

/**
 * Свет на бойке. С 0,55 сам боёк раскаляется светом (латунь до белого золота — `hammer`, `lit`), вокруг ореол; с 0,9 —
 * крест лучей: свет Паладина — крестом, как на щите и табарде, и лучи стоят прямо, как бы ни наклонился корпус
 * (`upright` — наклон верха, градусы). Вспышка удара (`burst`) — широкий ореол и восемь лучей: четыре длинных крестом
 * и четыре коротких между ними.
 */
function headGlow(p: Painter, x: number, y: number, a: number, len2: number, glow: number, burst: number, upright: number): void {
  const [gx, gy] = at(x, y, a, len2);
  if (burst > 0.02) {
    const r = 12 + 6 * burst;
    for (let k = 0; k < 8; k++) ray(p, gx, gy, k * 45 - upright, r, r + (k % 2 ? 5 : 12) * (0.5 + burst), k % 2 ? LIGHT.rayDim : LIGHT.core);
  }
  if (glow > 0.9) {
    const r1 = 16 + 12 * Math.min(1, (glow - 0.9) / 0.6);
    for (const k of [0, 90, 180, 270]) ray(p, gx, gy, k - upright, 11, r1, LIGHT.ray);
  }
  const g = Math.max(Math.min(glow, 1.5), 1.2 * burst);
  if (g > 0.02) p.glow(gx, gy, 8 + 11 * g, burst > 0.3 ? LIGHT.burst : LIGHT.halo, 0.35 + 0.3 * Math.min(g, 1));
}

/**
 * Луч с неба на боёк (Молот света B): столб полупрозрачного света от верха кадра до бойка и яркая сердцевина. Верх —
 * чуть ниже края листа: тест края (`tests/heroes.test.ts`) ловит всё, что касается рамки.
 */
function skyBeam(p: Painter, x: number, top: number, bottom: number, beam: number): void {
  if (beam <= 0.02) return;
  const w = 2 + 4 * beam;
  p.film([x - w, top, x + w, top, x + w * 0.7, bottom, x - w * 0.7, bottom], LIGHT.beam);
  if (beam > 0.4) p.line(x, top + 2, x, bottom, LIGHT.core);
}

function drawPaladin(p: Painter, P: PaladinPose): void {
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
  const drawWeapon = (x: number, y: number, a: number): void => hammer(p, x, y, a, Math.max(P.glow, P.burst));
  const headLen = HEAD_AT;

  p.pose({ dx: P.x, dy: P.y }, () => {
    p.shadow(68 - 10 * fall - P.x * 0.5 * (1 - fall), 54 + 16 * fall, 4);

    if (fall > 0.55) p.poly([hipX - 78, G - 5, hipX - 34, G - 7, hipX + 2, G - 4, hipX + 4, G, hipX - 82, G], MAT.cape, { part: 'capeGround', tone: -0.18 });

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
        p.poly(pts, MAT.cape, { part: 'cape', tone: -0.12, bevel: 3 });
        stroke(p, [30, 52, 20, 92], MAT.capeFold, 'cape');
        stroke(p, [26, 80, 16, 104], MAT.capeFold, 'cape');
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
      p.limb(hx, hy, 10, kx, ky, 8.4, MAT.limb, { part: leg, tone });
      p.limb(kx, ky, 8.2, ax, ay, 6.6, MAT.limb, { part: leg, tone });
      // Блик по голени к свету и стык поножи.
      stroke(p, [kx - 3.5 * out + 1, ky + 7, ax - 2.4 * out + 1, ay - 4], MAT.edge, leg);
      stroke(p, [ax - 5.8, ay - 3.6, ax + 5.8, ay - 3.6], MAT.seam, leg);
      // Башмак — большой и круглый: пятка назад, носок наружу, подошва на земле; по подъёму — золотой пояс.
      const S = G - lg.g.ank[1] - 0.5;
      p.pose({ rot: toeRot * out, px: ax, py: ay }, () => {
        p.poly([ax - 6.5 * out, ay - 2.2, ax + 5 * out, ay - 2.6, ax + 12 * out, ay + 3, ax + 15 * out, ay + 8, ax + 15.5 * out, ay + S, ax - 7.5 * out, ay + S, ax - 8 * out, ay + 5], MAT.limb, { part: foot, tone: tone - 0.02, bevel: 4 });
        edgeBand(p, out > 0 ? [ax - 7.4 * out, ay + 1.8, ax + 6.5 * out, ay + 1.4] : [ax + 6.5 * out, ay + 1.4, ax - 7.4 * out, ay + 1.8], 2.6, MAT.gold, foot);
        stroke(p, [ax + 1 * out, ay + 3.4, ax + 9 * out, ay + 5], far ? MAT.goldDark : MAT.goldLit, foot);
        stroke(p, [ax + 4 * out, ay + 7.5, ax + 11 * out, ay + 8.5], MAT.glintDim, foot);
      });
      // Наколенник — крупная чаша (≈ 15 × 16 на листе) с толстой золотой каймой снизу и снаружи, блик сверху.
      p.ellipse(kx, ky, 8.4, 8, MAT.limb, { part: knee, lift: 2, flat: 0.3, tone: tone + 0.04 });
      rimBand(p, kx, ky, 8.4, 8, 2.4, out > 0 ? 10 : 20, out > 0 ? 160 : 170, MAT.gold, knee);
      p.poly([kx - 4, ky - 5, kx, ky - 7, kx + 3, ky - 6, kx - 1, ky - 3], MAT.limb, { part: knee, paint: true, tone: 0.26 });
    }

    // ── Верх: без сутулости, наклон — только в клипах; дыхание. ──
    const near = nearArm(P);
    const far = limb2(M.armF.sh[0], M.armF.sh[1], P.f1, ARM_F.l1, P.f2, ARM_F.l2);
    // Щит — от кисти дальней руки, перед туловищем; на размахе (`sback`) — за ним: корпус разворачивается в удар,
    // дальнее плечо уходит назад, и щит, висящий перед грудью, не закрывает боёк в кадр контакта.
    const drawShield = (): void => {
      const cx = far.hx + (M.armF.shield[0] - M.armF.hand[0]) + P.shx, cy = far.hy + (M.armF.shield[1] - M.armF.hand[1]) + P.shy;
      p.pose({ rot: P.sh * DEG, px: cx, py: cy }, () => {
        p.scope(1, cx, cy, () => {
          shield(p, P.shine, P.sh + (rot * 180) / Math.PI);
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
    };
    p.pose(up, () => {
      p.limb(M.armF.sh[0], M.armF.sh[1], 7.5, far.ex, far.ey, 6.5, MAT.limb, { part: 'farArm', tone: -0.16 });
      p.limb(far.ex, far.ey, 6.5, far.hx, far.hy, 5.5, MAT.limb, { part: 'farArm', tone: -0.16 });
      if (P.sback > 0.5) drawShield();

      // Туловище — широкое, от ближнего наплечника до дальнего; стальные бока видны по краям табарда.
      // Ближний бок кирасы — в тени: на листе между рукой и грудью тёмная сталь, а не плащ.
      p.poly([41, 37, 88, 35, 90, 50, 87, 66, 46, 67, 40, 53], MAT.chest, { part: 'torso', bevel: 6, lift: 1 });
      p.poly([41, 37, 54, 36.5, 52, 50, 55, 62, 46, 67, 40, 53], MAT.chest, { part: 'torso', paint: true, tone: -0.24 });
      // Табард на груди — своя плоская ткань (краской по кирасе белое уходило в тень), крест по мерке листа.
      p.poly([53.5, 36.5, 69, 33.8, 84.5, 36.5, 86.5, 48, 84.5, 60.5, 55, 61, 52, 48], MAT.tabard, { part: 'surcoat', flat: 0.55, lift: 1, bevel: 3.5 });
      p.poly([65.2, 40.5, 69.6, 40.5, 69.6, 58.4, 65.2, 58.4], MAT.red, { part: 'surcoat', paint: true });
      p.poly([59, 45.8, 77.4, 45.8, 77.4, 50.2, 59, 50.2], MAT.red, { part: 'surcoat', paint: true });
      stroke(p, [57, 53, 56.5, 60], MAT.fold, 'surcoat');
      stroke(p, [81.5, 52, 81, 60], MAT.fold, 'surcoat');

      // Набедренники — по бокам от полотнища, не шире бедра; дальний в тени.
      p.poly([44, 66.5, 61, 66.5, 62, 74, 58, 81.5, 48, 82, 43, 76], MAT.limb, { part: 'tassetN', bevel: 3.2, lift: 1 });
      stroke(p, [44.5, 74.5, 60.5, 73.5], MAT.seam, 'tassetN');
      edgeBand(p, [43.4, 76.2, 48, 81.8, 58, 81.3], 1.6, MAT.gold, 'tassetN');
      p.poly([78.5, 68, 90, 68.5, 92, 80, 90, 92, 83, 93, 79, 84], MAT.limb, { part: 'tassetF', bevel: 3, tone: -0.1 });
      stroke(p, [79, 79, 91.5, 79.5], MAT.seam, 'tassetF');

      // Полотнище табарда между ног: белое с красной каймой, рваный подол; на выпаде относит назад.
      const tf = P.cape * 6;
      // На листе полотнище расходится к подолу, кайма слева узкая, справа (в тени) — шире.
      const hem = [60.5, 66, 78.5, 66, 80 - tf * 0.3, 88, 81.5 - tf, 111, 78 - tf, 107, 74.5 - tf * 1.1, 114, 71 - tf, 108, 67.5 - tf, 113.5, 64 - tf * 0.8, 107.5, 60 - tf * 0.6, 111, 58.5 - tf * 0.3, 88];
      p.poly(hem, MAT.tabard, { part: 'tabard', bevel: 2.5 });
      p.poly([58.5, 66, 62.6, 66, 62.4 - tf * 0.3, 88, 63 - tf * 0.6, 108, 60 - tf * 0.6, 111, 58.5 - tf * 0.3, 88], MAT.red, { part: 'tabard', paint: true });
      p.poly([74.5, 66, 78.5, 66, 80 - tf * 0.3, 88, 81.5 - tf, 111, 78 - tf, 107, 76.5 - tf * 0.6, 100, 75.5 - tf * 0.3, 88], MAT.red, { part: 'tabard', paint: true, tone: -0.1 });
      stroke(p, [66.5, 70, 66 - tf * 0.8, 104], MAT.fold, 'tabard');
      stroke(p, [71, 70, 71.5 - tf * 0.8, 100], MAT.fold, 'tabard');

      // Пояс с золотой пряжкой и сумками по бокам — поверх верха набедренников и полотнища.
      p.poly([44, 59.5, 85, 59.5, 85.5, 67, 44, 67.5], MAT.leather, { part: 'belt', bevel: 1.8 });
      p.ellipse(69.5, 63.3, 3.8, 3.4, MAT.gold, { part: 'buckle', lift: 1 });
      stroke(p, [68.4, 63.2, 70.6, 63.2], MAT.goldDark, 'buckle');
      // Сумки висят под поясом — коробки с клапаном, а не шары.
      p.poly([46.5, 64.5, 57.5, 64, 58, 73, 55.5, 75, 48.5, 75, 46, 72.5], MAT.leather, { part: 'pouchN', bevel: 2, lift: 1 });
      p.poly([46.5, 64.5, 57.5, 64, 57.8, 68.5, 46.3, 69], MAT.leather, { part: 'pouchN', paint: true, tone: 0.14 });
      stroke(p, [46.6, 69.2, 57.8, 68.7], '#1e140e', 'pouchN');
      p.px(52, 69.5, MAT.goldLit);
      p.poly([78.5, 64.5, 85, 64.5, 85.5, 72, 83.5, 74, 79.5, 74, 78, 71.5], MAT.leather, { part: 'pouchF', bevel: 1.8, tone: -0.12 });

      // Дальний наплечник — купол по контуру листа (≈ 17 × 24), в тени; золото — к зрителю: слева и снизу. Мельче и ниже, как ближний: верх на уровне подбородка.
      p.scope(0.8, 94 * 0.2, 47 * 0.2 + 3, () => {
        p.poly([86, 30, 88, 25, 93, 22.5, 99, 24, 102.5, 30, 102.5, 38, 99.5, 44, 93, 47, 88, 45, 86, 38], MAT.limb, { part: 'farPauldron', bevel: 5.5, lift: 1.5, tone: -0.06 });
        p.poly([89, 29, 92, 25.5, 95, 25, 93, 29.5, 90.5, 33], MAT.limb, { part: 'farPauldron', paint: true, tone: 0.26 });
        edgeBand(p, [87.6, 25.8, 86, 30, 86, 38, 88, 45, 93, 47, 99.5, 44], 3.2, MAT.gold, 'farPauldron');
      });

      // Тень шеи в вороте — за шлемом.
      p.ellipse(69, 34, 11, 5, solid('#1a1418'), { part: 'neck', tone: -0.3 });
      // Шлем на шее: раз за цикл поворачивается к врагам.
      p.pose({ rot: 0.05 * turn + P.head * DEG, px: M.neck[0], py: M.neck[1] }, () => {
        p.scope(1, M.helm[0], M.helm[1], () => {
          aventail(p);
          helm(p);
        });
      });
      // Горжет — золотой ворот полумесяцем после шлема: низ шлема уходит в него, как на листе.
      const gor: number[] = [];
      for (let a = 0; a <= 180; a += 12) gor.push(69 + 15 * Math.cos(a * DEG), 33.5 + 7 * Math.sin(a * DEG));
      for (let a = 180; a >= 0; a -= 12) gor.push(69 + 11.4 * Math.cos(a * DEG), 33.5 + 3.4 * Math.sin(a * DEG));
      p.poly(gor, MAT.gold, { part: 'gorget', bevel: 1.4, lift: 1 });
      arcStroke(p, 69, 33.5, 14.4, 6.4, 30, 150, MAT.goldLit, 'gorget');

      if (P.sback <= 0.5) drawShield();

      // Ближняя рука с оружием — поверх туловища: пластина плеча, наруч с золотыми поясами, кулак на древке.
      const front = P.front > 0.5 && P.drop < 0.05;
      if (P.drop < 0.05 && !front) {
        drawWeapon(near.hx, near.hy, P.sw);
        headGlow(p, near.hx, near.hy, P.sw, headLen, P.glow, P.burst, (rot * 180) / Math.PI);
      }
      p.limb(M.armN.sh[0], M.armN.sh[1], 8.2, near.ex, near.ey, 8, MAT.limb, { part: 'nearArm' });
      p.limb(near.ex, near.ey, 8.4, near.hx, near.hy, 7, MAT.limb, { part: 'nearArm' });
      const [ex, ey] = at(near.ex, near.ey, near.a2, 4), [hx2, hy2] = at(near.hx, near.hy, near.a2, -8);
      stroke(p, [ex - 3.5, ey + 1, hx2 - 3, hy2], MAT.edge, 'nearArm');
      // Золотые пояса наруча: у локтя и раструб перчатки над кулаком.
      const band = (along: number, half: number, w: number): void => {
        const [bx, by] = at(near.hx, near.hy, near.a2, -along);
        const nx = Math.cos((near.a2 + 90) * DEG), ny = Math.sin((near.a2 + 90) * DEG), ux = Math.cos(near.a2 * DEG), uy = Math.sin(near.a2 * DEG);
        p.poly([bx - nx * half - ux * w, by - ny * half - uy * w, bx + nx * half - ux * w, by + ny * half - uy * w, bx + nx * half + ux * w, by + ny * half + uy * w, bx - nx * half + ux * w, by - ny * half + uy * w], MAT.gold, { part: 'nearArm', paint: true });
      };
      band(6.8, 8.6, 1.6);
      band(ARM_N.l2 - 3.5, 9, 1.6);
      const fist = (): void => {
        p.ellipse(near.hx, near.hy, 6.8, 7.2, MAT.limb, { part: 'fist', tone: -0.02, lift: 1 });
        stroke(p, [near.hx - 3.5, near.hy - 1.5, near.hx + 3, near.hy + 2.5], MAT.seam, 'fist');
        p.poly([near.hx - 4, near.hy - 3, near.hx - 1.5, near.hy - 5.5, near.hx + 1, near.hy - 5, near.hx - 2, near.hy - 2], MAT.limb, { part: 'fist', paint: true, tone: 0.28 });
      };
      if (!front) fist();
      // Пластина плеча — ступенью под наплечником, золото по верхней кромке; мельче, чем по контуру листа (вторым
      // куполом рядом с наплечником она делала плечо огромным), и вместе с рукой ближе к телу.
      p.scope(0.8, 24 * 0.2 + 6, 50 * 0.2 + 5.5, () => {
        p.poly([14.5, 45.1, 18.2, 40.7, 24.1, 38.5, 29.2, 39.9, 31.4, 45.1, 28.5, 49.5, 21.9, 50.9, 16, 50.2], MAT.limb, { part: 'pLame', bevel: 2.6, tone: -0.06 });
        edgeBand(p, [29.2, 40.4, 24.1, 39, 18.2, 41.2, 14.9, 45.3], 2.4, MAT.gold, 'pLame');
      });
      // Ближний наплечник — купол по контуру листа (≈ 24 × 27) с толстой золотой каймой слева, снизу и справа
      // у шеи и бликом посередине: так он читается латным наплечником, а не шаром. Масштаб 0,88, верх на уровне
      // подбородка шлема (в мерку листа купол был «большим и выше, чем должен» — на уровне глаз), середина — над
      // плечевым суставом (x ≈ 38): сдвинутый к шее, он садился на угол груди, а рука торчала из-под него слева.
      p.scope(0.88, 3.5, 13, () => {
        p.poly([27.7, 36.3, 28.5, 28.9, 32.1, 23.1, 37.3, 18.7, 43.1, 16.5, 47.5, 17.9, 50.5, 23.1, 51.9, 30.4, 50.5, 37.7, 46.1, 42.1, 38.7, 43.6, 31.4, 41.4], MAT.limb, { part: 'pauldron', bevel: 7, lift: 2.5 });
        p.poly([35, 26, 39, 22, 43, 21.5, 44, 25, 40.5, 29.5, 36.5, 30.5], MAT.limb, { part: 'pauldron', paint: true, tone: 0.34 });
        p.poly([33, 37.5, 40, 39.5, 46, 37.5, 49.5, 33, 50.5, 37.7, 46.1, 42.1, 38.7, 43.6, 31.4, 41.4], MAT.limb, { part: 'pauldron', paint: true, tone: -0.2 });
        edgeBand(p, [29.2, 26, 28, 30, 27.8, 36.3, 31.4, 41.4, 38.7, 43.6, 46.1, 42.1, 50.5, 37.7, 51.9, 30.4, 50.5, 23.1, 47.5, 18.2], 3.5, MAT.gold, 'pauldron');
        stroke(p, [28.6, 36.6, 31.8, 41.6, 38.7, 43.8], MAT.goldLit, 'pauldron');
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
      // Пыль от бойка; удар со светом (боёк светится) поднимает золотую пыль.
      const dx0 = Math.min(tipX, 150), lit = P.glow > 0.4 || P.burst > 0.05;
      for (let k = 0; k < 9; k++) {
        const r = (2 + 4 * P.dust) * (0.6 + ((k * 37) % 5) / 8);
        const c = lit ? (k % 2 ? '#c8a060c0' : '#f0d898c0') : k % 2 ? '#7a6c58c0' : '#9a8a70c0';
        p.disc(dx0 + (k - 4) * 5 * P.dust, G - 2 - (k % 3) * 3 * P.dust - (k % 2) * 2, r * 0.5, c, true);
      }
    }
    skyBeam(p, tipX, -76 - P.y, tipY - 12, P.beam);
    if (paladinProbe.on) {
      const [hwx, hwy] = toWorld(near.hx, near.hy);
      paladinProbe.on({ ...probeInfo, hipX: hipX + P.x, hipY: hipY + P.y, handX: hwx + P.x, handY: hwy + P.y, tipX: tipX + P.x, tipY: tipY + P.y, ground: G });
    }
  });
}
