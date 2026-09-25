/**
 * Пиксельная лепка: процедурный враг из осмысленных фигур, а не из случайного пятна (v0.52).
 *
 * Модель врага — функция, которая каждым кадром заново «лепит» тело из эллипсов, конечностей и полигонов
 * в координатах логического кадра (1 единица = 1 px поля боя, рост тела — как в `characterSizes.ts`).
 * Движок растеризует фигуры в сетку со стороной `d` единиц, модели плотности не знают: прототип сравнивал
 * крупный пиксель (d = 3), пиксель фона (d = 2) и тонкий (d = 1), в игре — пиксель фона (`styles.ts`).
 *
 * Каждая фигура — купол своей высоты; фигуры одной части тела (`part`) сливаются мягким максимумом высот,
 * поэтому грудь, живот и круп волка светятся как одно тело, а не как набор шаров. Тон клетки — свет по нормали
 * этой общей поверхности (сверху-слева, со стороны героя), фактура (шерсть, кора, ткань) и сдвиг фигуры
 * (дальние лапы темнее), квантованные в рамп материала. Рамп строится из одного базового цвета со сдвигом
 * оттенка: тени уходят в синеву, свет — в тёплую желтизну, как у рисованного фона.
 * После фигур — пряди по краю шерсти, линии между частями, внешний контур, «декали» (глаза, блики, зубы) и тень на полу.
 *
 * Удар и урон — та же лепка, а не отдельный рисунок: модель читает ход клипа (`p.attack()` — замах и выпад,
 * `p.hurt()` — отдача) и наклоняет или сдвигает тело и его части (`p.pose`). Кривые у всех врагов общие,
 * поэтому контакт удара у всех приходится на один кадр, а последний кадр клипа — это первый кадр покоя.
 *
 * Модуль без DOM: отдаёт RGBA-кадры, которые запекает для игры `mobs/index.ts`, а тесты и превью считают в Node.
 */

export type RGB = [number, number, number];
type Lab = [number, number, number];

// ─── Цвет ───────────────────────────────────────────────────────────────────

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexAlpha(hex: string): number {
  return hex.length >= 9 ? parseInt(hex.slice(7, 9), 16) : 255;
}

const toLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number): number => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};

/** OKLab: светлота в нём равномерна на глаз, поэтому ступени рампа не проваливаются в одном тоне. */
function oklab([r, g, b]: RGB): Lab {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Оттенок, к которому уходят тени (синева), и оттенок света (тёплая желтизна) — градусы OKLCH. */
const COLD_HUE = 268;
const WARM_HUE = 88;

function towardHue(h: number, target: number, deg: number): number {
  let diff = ((target - h + 540) % 360) - 180;
  if (Math.abs(diff) < deg) return target;
  diff = Math.sign(diff) * deg;
  return h + diff;
}

/**
 * Рамп из одного цвета: `n` ступеней от тени к свету, базовый цвет — чуть выше середины.
 * Тени темнее и холоднее, свет светлее и теплее; у серых тканей и шерсти тень получает немного синевы,
 * иначе серый рамп выглядит мёртвым.
 */
export function buildRamp(base: string, n: number, spread = 0.46, shift = 16): RGB[] {
  const [L0, a0, b0] = oklab(hexToRgb(base));
  const C0 = Math.hypot(a0, b0);
  const h0 = (Math.atan2(b0, a0) * 180) / Math.PI;
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : i / (n - 1) - 0.58;
    const L = Math.max(0.1, Math.min(0.96, L0 + k * spread * 1.1));
    let C = C0 * (1 - 0.35 * k);
    let h = h0;
    // Почти серый без своего оттенка (сталь, пепел) берёт холодный в тенях и тёплый на свету.
    // Серый с оттенком (бурая шерсть крысы) свой оттенок сохраняет: иначе крыса синеет.
    const neutral = C0 < 0.008;
    if (k < 0) {
      h = neutral ? COLD_HUE : towardHue(h0, COLD_HUE, shift * -k * 2);
      if (C0 < 0.03) C = Math.max(C, (neutral ? 0.02 : 0.014) * -k * 2);
    } else if (k > 0) {
      h = neutral ? WARM_HUE : towardHue(h0, WARM_HUE, shift * k * 2);
      if (C0 < 0.03) C = Math.max(C, (neutral ? 0.016 : 0.012) * k * 2);
    }
    const rad = (h * Math.PI) / 180;
    out.push(fromOklab([L, C * Math.cos(rad), C * Math.sin(rad)]));
  }
  return out;
}

/** Темнее тёмной ступени — для контура: оттенок материала сохраняется, чтобы контур не был чужим чёрным. */
function deepen(rgb: RGB, amount: number): RGB {
  const [L, a, b] = oklab(rgb);
  return fromOklab([L * amount, a * 0.8, b * 0.8]);
}

// ─── Шум и фактура ──────────────────────────────────────────────────────────

function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Фактура поверхности в единицах кадра. Считается в локальных координатах фигуры, поэтому едет вместе с ней
 * и не «кипит» при покачивании. `angle` — направление шерсти или волокон, радианы.
 */
export interface Tex {
  kind: 'fur' | 'noise' | 'spots' | 'stripes' | 'bark';
  /** Шаг узора, единицы. */
  scale?: number;
  /** Сила −1..1 в долях освещённости. */
  amp?: number;
  angle?: number;
  /** Вытянутость пряди шерсти вдоль `angle`. */
  stretch?: number;
  /** Доля пятен (spots). */
  density?: number;
}

function texture(tx: Tex, lx: number, ly: number, seed: number): number {
  const sc = tx.scale ?? 4;
  const ang = tx.angle ?? 0;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const u = lx * ca + ly * sa;
  const v = -lx * sa + ly * ca;
  switch (tx.kind) {
    case 'fur': {
      const st = tx.stretch ?? 3;
      const n = vnoise(u / (sc * st), v / sc, seed) * 0.7 + vnoise(u / (sc * st * 0.5), v / (sc * 0.5), seed + 7) * 0.3;
      return (n - 0.5) * 2;
    }
    case 'noise':
      return (vnoise(u / sc, v / sc, seed) - 0.5) * 2;
    case 'stripes':
      return Math.sin((v / sc) * Math.PI) * 0.8 + (vnoise(u / sc, v / sc, seed) - 0.5) * 0.4;
    case 'bark': {
      const n = vnoise(u / (sc * 4), v / sc, seed);
      return n < 0.3 ? -1 : (n - 0.5) * 0.8;
    }
    case 'spots': {
      const cx = Math.floor(u / sc), cy = Math.floor(v / sc);
      const r = hash(cx, cy, seed);
      if (r > (tx.density ?? 0.3)) return 0;
      const ox = (hash(cx, cy, seed + 1) - 0.5) * 0.6, oy = (hash(cx, cy, seed + 2) - 0.5) * 0.6;
      const dx = u / sc - cx - 0.5 - ox, dy = v / sc - cy - 0.5 - oy;
      return dx * dx + dy * dy < 0.09 ? -1 : 0;
    }
  }
}

// ─── Стиль и материалы ──────────────────────────────────────────────────────

/** Набор правил отрисовки: одна модель врага — любой из них. */
export interface Style {
  id: string;
  /** Единиц логического кадра на пиксель рисунка. */
  d: number;
  /** Ступеней рампа. */
  tones: number;
  /** Упорядоченный дизеринг на стыке ступеней, 0..1. */
  dither: number;
  /** Сила фактуры, 0..1. */
  texture: number;
  /** Контур: тёмный везде или выборочный — со стороны света светлее, из тона самого материала. */
  outline: 'dark' | 'selective';
  /** Линии между частями тела (лапа поверх туловища, челюсть под головой). */
  inner: boolean;
  /** Контровой свет по правому краю, 0..1: отделяет силуэт от тёмного фона. */
  rim: number;
  /** Кадров в цикле покоя и их частота. */
  frames: number;
  fps: number;
  /** Клипы действий: удар и урон (кадры, частота, кадр контакта, вспышка по кадрам). */
  clips: Record<'attack' | 'hurt', ClipSpec>;
}

/** Клип действия. Действие быстрее покоя, поэтому своя частота кадров. */
export interface ClipSpec {
  frames: number;
  fps: number;
  /** Кадр контакта удара: к нему игра приурочивает цифру урона и снаряд. */
  contact?: number;
  /** Белая вспышка по кадрам: доля смешения с белым (урон: первый кадр ярче). */
  flash?: number[];
}

/** Что рисует модель: цикл покоя или клип действия. */
export type MobClip = 'idle' | 'attack' | 'hurt';

export interface Mat {
  /** Средний тон материала; рамп строится из него. */
  base: string;
  /** Явный рамп от тени к свету — вместо построенного (пересэмплируется под число ступеней стиля). */
  ramp?: string[];
  /** Размах светлоты рампа. */
  spread?: number;
  tex?: Tex;
  /** Множитель дизеринга стиля: 0 — без дизеринга (глаза, металл). */
  dither?: number;
  /** Светится сам: освещение не действует, берётся верх рампа с лёгким спадом к краю. */
  glow?: boolean;
  /** Блик: металл, мокрый нос, глаз. */
  shine?: number;
  /** Без внешнего контура (тонкие нити, дымка). */
  noOutline?: boolean;
  /** Рваный край: доля клеток силуэта, из которых торчит прядь (шерсть, мох, лохмотья). Вниз и назад чаще. */
  shag?: number;
}

interface RMat {
  ramp: RGB[];
  dark: RGB;
  lit: RGB;
  line: RGB;
  mat: Mat;
  seed: number;
}

/** Опции фигуры. */
export interface Shape {
  /** Часть тела: её фигуры сливаются в одну поверхность, между разными частями рисуется линия (у той, что позади). */
  part?: string;
  /** Сдвиг освещённости −1..1: дальние лапы темнее, брюхо в тени. */
  tone?: number;
  /** Плоскость поверхности 0..1: 0 — шар, 1 — плоский лист. */
  flat?: number;
  /** Поворот эллипса, радианы. */
  rot?: number;
  /** Не давать соседям линию об эту фигуру. */
  noLine?: boolean;
  /** Подъём купола над своей частью, единицы: мышца или щека выступают над туловищем, а не тонут в нём. */
  lift?: number;
  /** Ширина фаски полигона, единицы. */
  bevel?: number;
  /** Только перекрасить свою часть: пятно, чепрак, узор — форма остаётся от тела под ним. */
  paint?: boolean;
}

// ─── Холст ──────────────────────────────────────────────────────────────────

function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

/** Свет — сверху слева, со стороны героя: верх и морда светлые, брюхо и дальний бок в тени. */
const LIGHT = norm3(-0.45, -0.8, 0.42);
const HALF = norm3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);
const AMBIENT = 0.1;
/**
 * Мягкость слияния фигур одной части, 1/единица. Высота части — «мягкий максимум» высот её фигур,
 * поэтому грудь, живот и круп светятся как одно тело, а на стыке остаётся плавная складка, а не шов.
 */
const SOFT = 0.3;
/**
 * Рельеф: во сколько раз купол фигуры выше её полутолщины. Пиксель-арт преувеличивает форму — светлая
 * верхняя треть, средняя и тёмная нижняя; с честной полусферой свет занимал бы только тонкую кромку.
 */
const RELIEF = 1.6;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export interface Model {
  id: string;
  /** Рамка в единицах логического кадра; существо смотрит влево — на героя. */
  w: number;
  h: number;
  /** Линия земли, y в единицах: по ней враг встаёт на пол поля. */
  ground: number;
  /** Поле вокруг рамки для клипов, единицы: выпад, замах дубиной и отдача не должны упираться в край кадра. */
  pad?: number;
  /**
   * Каждый кадр лепит тело заново. `p.t` — фаза цикла покоя 0..1, `p.clip` и `p.u` — клип действия и его ход 0..1;
   * позы клипа модель берёт из `p.attack()` и `p.hurt()`, целиком тело наклоняет и сдвигает `p.pose`.
   */
  draw(p: Painter): void;
}

/** Поле вокруг рамки модели по умолчанию, единицы. */
const PAD = 22;

/** Ключевые точки кривой: [ход клипа 0..1, значение]; между ними — линейно. */
export type Keys = ReadonlyArray<readonly [number, number]>;
export function keys(k: Keys, u: number): number {
  if (u <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    const [u1, v1] = k[i];
    if (u <= u1) {
      const [u0, v0] = k[i - 1];
      return v0 + ((v1 - v0) * (u - u0)) / (u1 - u0 || 1);
    }
  }
  return k[k.length - 1][1];
}

/**
 * Удар: замах (отвести тело и оружие назад) держится первые кадры, выпад приходит в кадр контакта (4 из 8)
 * и тает к последнему — последний кадр совпадает с первым кадром покоя, переход без скачка.
 */
const WIND: Keys = [[0, 0.35], [0.14, 1], [0.3, 1], [0.43, 0.15], [0.55, 0], [1, 0]];
const STRIKE: Keys = [[0, 0], [0.36, 0], [0.5, 0.7], [0.57, 1], [0.72, 0.7], [0.86, 0.3], [1, 0]];
/** Урон: отдача сильнее всего в первом кадре (там же вспышка) и сходит на нет к последнему. */
const RECOIL: Keys = [[0, 1], [0.25, 0.85], [0.5, 0.45], [0.75, 0.15], [1, 0]];

type Decal = { i: number; j: number; rgb: RGB; a: number; under: boolean };
/** Глаз: `closed` 1 — веко опущено, 0.5 — прищур; блик, цвет века и зрачок. */
export interface EyeOpts { closed?: number; glint?: string; lid?: string; pupil?: string }
interface PartBuf { S: Float32Array; GX: Float32Array; GY: Float32Array }

export class Painter {
  readonly W: number;
  readonly H: number;
  readonly d: number;
  /** Фаза цикла покоя 0..1 (в клипах действий — 0: покой замирает). */
  readonly t: number;
  /** Клип, который рисуется, и его ход 0..1 (первый кадр — 0, последний — 1). */
  readonly clip: MobClip;
  readonly u: number;
  readonly frames: number;
  readonly style: Style;
  readonly ground: number;
  /** Высота полосы у земли, где тело темнеет. */
  private readonly aoSpan: number;
  private readonly m: Int16Array;
  private readonly part: Int16Array;
  private readonly z: Int32Array;
  private readonly toneAt: Float32Array;
  private readonly lxAt: Float32Array;
  private readonly lyAt: Float32Array;
  private readonly seedAt: Int32Array;
  private readonly anchor: Int32Array;
  private readonly noLineAt: Uint8Array;
  private readonly bufs: PartBuf[] = [];
  private readonly mats: RMat[] = [];
  private readonly matIndex = new Map<Mat, number>();
  private readonly parts = new Map<string, number>();
  private order = 0;
  private readonly decals: Decal[] = [];
  /**
   * Текущее преобразование модели в кадр (`scope`, `pose`): X = a·x − b·y + tx, Y = b·x + a·y + ty —
   * масштаб, поворот и сдвиг. Модель рисует в своих координатах, холст — в координатах кадра с полем `pad`.
   */
  private ta = 1;
  private tb = 0;
  private tx: number;
  private ty: number;

  constructor(model: Model, style: Style, t: number, clip: MobClip = 'idle', u = 0) {
    this.d = style.d;
    this.style = style;
    this.t = t;
    this.clip = clip;
    this.u = u;
    this.frames = style.frames;
    const pad = model.pad ?? PAD;
    this.tx = pad;
    this.ty = pad;
    this.W = Math.ceil((model.w + 2 * pad) / style.d);
    this.H = Math.ceil((model.h + pad) / style.d);
    this.ground = model.ground + pad;
    this.aoSpan = model.ground * 0.3;
    const n = this.W * this.H;
    this.m = new Int16Array(n).fill(-1);
    this.part = new Int16Array(n);
    this.z = new Int32Array(n);
    this.toneAt = new Float32Array(n);
    this.lxAt = new Float32Array(n);
    this.lyAt = new Float32Array(n);
    this.seedAt = new Int32Array(n);
    this.anchor = new Int32Array(n);
    this.noLineAt = new Uint8Array(n);
  }

  /** Масштаб текущего преобразования: радиусы, подъёмы и фаски растут вместе с ним. */
  private get ts(): number {
    return Math.hypot(this.ta, this.tb);
  }

  /** Поворот текущего преобразования: эллипсы поворачиваются вместе с телом. */
  private get tr(): number {
    return Math.atan2(this.tb, this.ta);
  }

  /** Вложить преобразование p ↦ (a + ib)·p + (ox, oy) в текущее на время `fn`. */
  private nest(a: number, b: number, ox: number, oy: number, fn: () => void): void {
    const prev = [this.ta, this.tb, this.tx, this.ty] as const;
    const [pa, pb, px, py] = prev;
    this.ta = pa * a - pb * b;
    this.tb = pa * b + pb * a;
    this.tx = pa * ox - pb * oy + px;
    this.ty = pb * ox + pa * oy + py;
    try {
      fn();
    } finally {
      [this.ta, this.tb, this.tx, this.ty] = prev;
    }
  }

  /**
   * Нарисовать часть модели в своём масштабе: `fn` рисует в координатах, умноженных на `s` и сдвинутых на (ox, oy).
   * Так Вожак стаи — тот же волк крупнее, а не отдельная лепка.
   */
  scope(s: number, ox: number, oy: number, fn: () => void): void {
    this.nest(s, 0, ox, oy, fn);
  }

  /**
   * Поза в клипе: наклон `rot` (радианы; минус — вперёд, к герою, плюс — назад) вокруг опоры (px, py)
   * и сдвиг (dx, dy). Сдвиг прижат к сетке — выпад идёт целыми пикселями, без дрожи.
   */
  pose(o: { dx?: number; dy?: number; rot?: number; px?: number; py?: number }, fn: () => void): void {
    const rot = o.rot ?? 0;
    const c = Math.cos(rot), s = Math.sin(rot);
    const px = o.px ?? 0, py = o.py ?? 0;
    const dx = this.snap(o.dx ?? 0), dy = this.snap(o.dy ?? 0);
    this.nest(c, s, px - (c * px - s * py) + dx, py - (s * px + c * py) + dy, fn);
  }

  private pt(x: number, y: number): [number, number] {
    return [this.ta * x - this.tb * y + this.tx, this.tb * x + this.ta * y + this.ty];
  }

  private scaled(o: Shape): Shape {
    const k = this.ts;
    if (k === 1) return o;
    return { ...o, lift: o.lift === undefined ? undefined : o.lift * k, bevel: o.bevel === undefined ? undefined : o.bevel * k };
  }

  /** Эллипс-купол: высота как у полусферы толщиной `min(rx, ry)`; `rot` поворачивает его вместе с фактурой. */
  ellipse(cx: number, cy: number, rx: number, ry: number, mat: Mat, o: Shape = {}): void {
    const [X, Y] = this.pt(cx, cy);
    const k = this.ts;
    const tr = this.tr;
    this.wEllipse(X, Y, rx * k, ry * k, mat, tr ? { ...this.scaled(o), rot: (o.rot ?? 0) + tr } : this.scaled(o));
  }

  /** Конечность: сужающаяся капсула от (x1, y1, r1) к (x2, y2, r2), высота как у цилиндра. */
  limb(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, mat: Mat, o: Shape = {}): void {
    const [X1, Y1] = this.pt(x1, y1);
    const [X2, Y2] = this.pt(x2, y2);
    const k = this.ts;
    this.wLimb(X1, Y1, r1 * k, X2, Y2, r2 * k, mat, this.scaled(o));
  }

  /** Цепочка конечностей по точкам [x, y, r]: хвост, лапа паука, нить. */
  chain(pts: Array<[number, number, number]>, mat: Mat, o: Shape = {}): void {
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay, ar] = pts[k];
      const [bx, by, br] = pts[k + 1];
      this.limb(ax, ay, ar, bx, by, br, mat, o);
    }
  }

  /**
   * Многоугольник по точкам [x0, y0, x1, y1, …]: одежда, уши, клыки, клинок.
   * Край скруглён фаской шириной `bevel` (по умолчанию треть меньшей стороны): плоская середина, светлый верхний край.
   */
  poly(pts: number[], mat: Mat, o: Shape = {}): void {
    const out: number[] = [];
    for (let k = 0; k + 1 < pts.length; k += 2) out.push(...this.pt(pts[k], pts[k + 1]));
    this.wPoly(out, mat, this.scaled(o));
  }

  /** Стереть клетки эллипсом — просвет, вырез пасти. */
  erase(cx: number, cy: number, rx: number, ry: number): void {
    const [X, Y] = this.pt(cx, cy);
    this.wErase(X, Y, rx * this.ts, ry * this.ts);
  }

  /** Один пиксель рисунка в точке (x, y). */
  px(x: number, y: number, color: string): void {
    const [X, Y] = this.pt(x, y);
    this.wPx(X, Y, color);
  }

  /** Прямоугольник w×h пикселей рисунка от точки (x, y): размер в пикселях, а не в единицах. */
  block(x: number, y: number, w: number, h: number, color: string): void {
    const [X, Y] = this.pt(x, y);
    this.wBlock(X, Y, w, h, color);
  }

  /** Линия в один пиксель рисунка (Брезенхем): тетива, усы, рот. `under` — только по пустым клеткам. */
  line(x1: number, y1: number, x2: number, y2: number, color: string, under = false): void {
    const [X1, Y1] = this.pt(x1, y1);
    const [X2, Y2] = this.pt(x2, y2);
    this.wLine(X1, Y1, X2, Y2, color, under);
  }

  /** Диск пикселей радиуса r (не меньше пикселя): зрачок, монета, огонёк. */
  disc(x: number, y: number, r: number, color: string, under = false): void {
    const [X, Y] = this.pt(x, y);
    this.wDisc(X, Y, r * this.ts, color, under);
  }

  /**
   * Глаз: светящаяся радужка с бликом. `closed` 1 — веко опущено (черта), 0.5 — прищур.
   * Размер не меньше пикселя — на крупном пикселе глаз остаётся одной яркой точкой.
   */
  eye(x: number, y: number, r: number, color: string, o: EyeOpts = {}): void {
    const [X, Y] = this.pt(x, y);
    this.wEye(X, Y, r * this.ts, color, o);
  }

  /** Свечение: кольца полупрозрачного цвета в пустых клетках вокруг точки — огонёк посоха, блеск монет. */
  glow(x: number, y: number, r: number, color: string, alpha = 0.5): void {
    const [X, Y] = this.pt(x, y);
    this.wGlow(X, Y, r * this.ts, color, alpha);
  }

  /**
   * Тень на земле: плоский эллипс под существом, только в пустых клетках. Без `y` лежит на линии земли под той
   * точкой модели, что над ней: выпад и наклон тела тень сдвигают, но от пола не отрывают.
   */
  shadow(cx: number, rx: number, ry: number, alpha = 0.34, y?: number): void {
    const k = this.ts;
    if (y !== undefined) {
      const [X, Y] = this.pt(cx, y);
      this.wShadow(X, rx * k, ry * k, alpha, Y);
      return;
    }
    const ym = (this.ground - this.ty - this.tb * cx) / (this.ta || 1e-6);
    this.wShadow(this.ta * cx - this.tb * ym + this.tx, rx * k, ry * k, alpha, this.ground);
  }

  /** Замах и выпад клипа атаки, 0..1; вне атаки и в её последнем кадре — нули. */
  attack(): { wind: number; strike: number } {
    if (this.clip !== 'attack') return { wind: 0, strike: 0 };
    return { wind: keys(WIND, this.u), strike: keys(STRIKE, this.u) };
  }

  /** Отдача клипа урона, 0..1: сильнее всего в первом кадре; вне клипа — 0. */
  hurt(): number {
    return this.clip === 'hurt' ? keys(RECOIL, this.u) : 0;
  }

  /** Координата, прижатая к сетке рисунка: сдвиги частей целыми пикселями не дрожат. */
  snap(v: number): number {
    return (Math.round((v * this.ts) / this.d) * this.d) / this.ts;
  }

  /**
   * Смещение покоя целыми пикселями: от 0 до `amp` единиц по волне, но хотя бы на один пиксель рисунка —
   * иначе на крупном пикселе дыхание округлится в ноль и враг замрёт.
   */
  bob(amp: number, k = 1, phase = 0): number {
    const n = Math.max(1, Math.round((amp * this.ts) / this.d));
    return (Math.round(((this.wave(k, phase) + 1) / 2) * n) * this.d) / this.ts;
  }

  /** Волна цикла: `k` полных периодов за цикл, фаза в долях периода. */
  wave(k = 1, phase = 0): number {
    return Math.sin(2 * Math.PI * (k * this.t + phase));
  }

  /** Короткое событие цикла (моргание, дёрнуть ухом): 1 в середине окна длиной `len` вокруг `at`, 0.5 на краях. */
  blink(at: number, len = 0.05): number {
    const dt = Math.abs(((this.t - at + 1.5) % 1) - 0.5);
    return dt < len / 2 ? 1 : dt < len ? 0.5 : 0;
  }

  private resolve(mat: Mat): number {
    const hit = this.matIndex.get(mat);
    if (hit !== undefined) return hit;
    const n = this.style.tones;
    let ramp: RGB[];
    if (mat.ramp) {
      const src = mat.ramp.map(hexToRgb);
      ramp = Array.from({ length: n }, (_, i) => src[Math.round((i / Math.max(1, n - 1)) * (src.length - 1))]);
    } else ramp = buildRamp(mat.base, n, mat.spread);
    const dark = this.style.outline === 'dark' ? deepen(ramp[0], 0.32) : deepen(ramp[0], 0.55);
    const lit = this.style.outline === 'dark' ? dark : deepen(ramp[0], 0.85);
    const line = this.style.outline === 'dark' ? dark : deepen(ramp[0], 0.8);
    const seed = (parseInt(mat.base.slice(1, 7), 16) ^ (this.mats.length * 7919)) & 0xffff;
    this.mats.push({ ramp, dark, lit, line, mat, seed });
    this.matIndex.set(mat, this.mats.length - 1);
    return this.mats.length - 1;
  }

  private partId(name: string): number {
    let id = this.parts.get(name);
    if (id === undefined) {
      id = this.parts.size;
      this.parts.set(name, id);
      const n = this.W * this.H;
      this.bufs.push({ S: new Float32Array(n), GX: new Float32Array(n), GY: new Float32Array(n) });
    }
    return id;
  }

  private range(x0: number, x1: number, y0: number, y1: number): [number, number, number, number] {
    const d = this.d;
    return [
      Math.max(0, Math.floor(x0 / d - 0.5)),
      Math.min(this.W - 1, Math.ceil(x1 / d + 0.5)),
      Math.max(0, Math.floor(y0 / d - 0.5)),
      Math.min(this.H - 1, Math.ceil(y1 / d + 0.5)),
    ];
  }

  /** Начало фигуры: материал, часть, зерно фактуры. */
  private begin(mat: Mat, o: Shape): { mi: number; pid: number; seed: number } {
    const mi = this.resolve(mat);
    const pid = this.partId(o.part ?? 'body');
    const seed = this.mats[mi].seed + this.order * 31;
    this.order++;
    return { mi, pid, seed };
  }

  /**
   * Клетка под фигурой: высота `h` и её наклон (gx, gy) идут в мягкий максимум части, материал — последней фигуре.
   * `paint` только перекрашивает клетки своей же части: пятно шерсти, чепрак, узор ткани не меняют форму.
   */
  private cover(k: number, mi: number, pid: number, h: number, gx: number, gy: number, lx: number, ly: number, ai: number, aj: number, seed: number, o: Shape): void {
    if (o.paint) {
      if (this.m[k] < 0 || this.part[k] !== pid) return;
    } else {
      const b = this.bufs[pid];
      const e = Math.exp(Math.min(60, SOFT * h));
      b.S[k] += e;
      b.GX[k] += e * gx;
      b.GY[k] += e * gy;
      this.z[k] = this.order;
      this.part[k] = pid;
      this.noLineAt[k] = o.noLine ? 1 : 0;
    }
    this.m[k] = mi;
    this.toneAt[k] = o.tone ?? 0;
    this.lxAt[k] = lx;
    this.lyAt[k] = ly;
    this.seedAt[k] = seed;
    this.anchor[k] = ((ai & 0xffff) << 16) | (aj & 0xffff);
  }

  // ─── Фигуры и декали в координатах кадра: публичные обёртки выше переводят в них координаты модели ───

  private wEllipse(cx: number, cy: number, rx: number, ry: number, mat: Mat, o: Shape): void {
    const d = this.d;
    rx = Math.max(rx, 0.72 * d);
    ry = Math.max(ry, 0.72 * d);
    const { mi, pid, seed } = this.begin(mat, o);
    const rot = o.rot ?? 0;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const R = Math.max(rx, ry);
    const [i0, i1, j0, j1] = this.range(cx - R, cx + R, cy - R, cy + R);
    const T = RELIEF * Math.min(rx, ry) * (1 - 0.8 * (o.flat ?? 0));
    const lift = o.lift ?? 0;
    const ai = Math.round(cx / d), aj = Math.round(cy / d);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const X = (i + 0.5) * d - cx, Y = (j + 0.5) * d - cy;
        const lx = X * cr + Y * sr, ly = -X * sr + Y * cr;
        const u = lx / rx, v = ly / ry;
        const r2 = u * u + v * v;
        if (r2 > 1) continue;
        const s = Math.sqrt(Math.max(0.0025, 1 - r2));
        const dx = (-T * u) / (rx * s), dy = (-T * v) / (ry * s);
        this.cover(j * this.W + i, mi, pid, T * s + lift, dx * cr - dy * sr, dx * sr + dy * cr, lx, ly, i - ai, j - aj, seed, o);
      }
    }
  }

  private wLimb(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, mat: Mat, o: Shape): void {
    const d = this.d;
    r1 = Math.max(r1, 0.5 * d);
    r2 = Math.max(r2, 0.5 * d);
    const { mi, pid, seed } = this.begin(mat, o);
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-6;
    const len = Math.sqrt(len2);
    const ux = dx / len, uy = dy / len;
    const R = Math.max(r1, r2);
    const [i0, i1, j0, j1] = this.range(Math.min(x1, x2) - R, Math.max(x1, x2) + R, Math.min(y1, y2) - R, Math.max(y1, y2) + R);
    const flat = RELIEF * (1 - 0.8 * (o.flat ?? 0));
    const lift = o.lift ?? 0;
    const ai = Math.round(x1 / d), aj = Math.round(y1 / d);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const X = (i + 0.5) * d, Y = (j + 0.5) * d;
        const s = Math.max(0, Math.min(1, ((X - x1) * dx + (Y - y1) * dy) / len2));
        const r = r1 + (r2 - r1) * s;
        const ex = X - (x1 + dx * s), ey = Y - (y1 + dy * s);
        const dist = Math.hypot(ex, ey);
        if (dist > r) continue;
        const q = dist / r;
        const sq = Math.sqrt(Math.max(0.0025, 1 - q * q));
        const T = r * flat;
        const g = dist > 1e-6 ? (-T * q) / (r * sq * dist) : 0;
        // Фактура вдоль конечности: шерсть лап и волокна дубины идут по её оси.
        const along = (X - x1) * ux + (Y - y1) * uy;
        const across = -(X - x1) * uy + (Y - y1) * ux;
        this.cover(j * this.W + i, mi, pid, T * sq + lift, g * ex, g * ey, along, across, i - ai, j - aj, seed, o);
      }
    }
  }

  private wPoly(pts: number[], mat: Mat, o: Shape): void {
    const d = this.d;
    const { mi, pid, seed } = this.begin(mat, o);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let k = 0; k < pts.length; k += 2) {
      minX = Math.min(minX, pts[k]); maxX = Math.max(maxX, pts[k]);
      minY = Math.min(minY, pts[k + 1]); maxY = Math.max(maxY, pts[k + 1]);
    }
    const [i0, i1, j0, j1] = this.range(minX, maxX, minY, maxY);
    const B = Math.max(0.5, o.bevel ?? Math.min(maxX - minX, maxY - minY) / 3);
    const T = RELIEF * B * (1 - 0.8 * (o.flat ?? 0));
    const lift = o.lift ?? 0;
    const ai = Math.round(pts[0] / d), aj = Math.round(pts[1] / d);
    const n = pts.length / 2;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const X = (i + 0.5) * d, Y = (j + 0.5) * d;
        let inside = false;
        let best = Infinity, qx = X, qy = Y;
        for (let a = 0, b = n - 1; a < n; b = a++) {
          const xa = pts[a * 2], ya = pts[a * 2 + 1], xb = pts[b * 2], yb = pts[b * 2 + 1];
          if (ya > Y !== yb > Y && X < ((xb - xa) * (Y - ya)) / (yb - ya) + xa) inside = !inside;
          const ex = xb - xa, ey = yb - ya;
          const s = Math.max(0, Math.min(1, ((X - xa) * ex + (Y - ya) * ey) / (ex * ex + ey * ey || 1e-6)));
          const px = xa + ex * s, py = ya + ey * s;
          const dd = (X - px) ** 2 + (Y - py) ** 2;
          if (dd < best) { best = dd; qx = px; qy = py; }
        }
        if (!inside) continue;
        const e = Math.sqrt(best);
        const tq = Math.min(1, e / B);
        const sq = Math.sqrt(Math.max(0.0025, 1 - (1 - tq) ** 2));
        const g = tq < 1 && e > 1e-6 ? (T * (1 - tq)) / (B * sq * e) : 0;
        this.cover(j * this.W + i, mi, pid, T * sq + lift, g * (X - qx), g * (Y - qy), X - pts[0], Y - pts[1], i - ai, j - aj, seed, o);
      }
    }
  }

  private wErase(cx: number, cy: number, rx: number, ry: number): void {
    const d = this.d;
    const [i0, i1, j0, j1] = this.range(cx - rx, cx + rx, cy - ry, cy + ry);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const u = ((i + 0.5) * d - cx) / rx, v = ((j + 0.5) * d - cy) / ry;
        if (u * u + v * v <= 1) this.m[j * this.W + i] = -1;
      }
    }
  }

  // ─── Декали: поверх готового тела, точным цветом ───

  private cell(x: number, y: number): [number, number] {
    return [Math.floor(x / this.d), Math.floor(y / this.d)];
  }

  private wPx(x: number, y: number, color: string): void {
    const [i, j] = this.cell(x, y);
    this.decal(i, j, color);
  }

  private decal(i: number, j: number, color: string, under = false): void {
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return;
    this.decals.push({ i, j, rgb: hexToRgb(color), a: hexAlpha(color), under });
  }

  private wBlock(x: number, y: number, w: number, h: number, color: string): void {
    const [i0, j0] = this.cell(x, y);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.decal(i0 + i, j0 + j, color);
  }

  private wLine(x1: number, y1: number, x2: number, y2: number, color: string, under: boolean): void {
    let [i, j] = this.cell(x1, y1);
    const [i2, j2] = this.cell(x2, y2);
    const di = Math.abs(i2 - i), dj = -Math.abs(j2 - j);
    const si = i < i2 ? 1 : -1, sj = j < j2 ? 1 : -1;
    let err = di + dj;
    for (;;) {
      this.decal(i, j, color, under);
      if (i === i2 && j === j2) break;
      const e2 = 2 * err;
      if (e2 >= dj) { err += dj; i += si; }
      if (e2 <= di) { err += di; j += sj; }
    }
  }

  private wDisc(x: number, y: number, r: number, color: string, under: boolean): void {
    const d = this.d;
    const R = Math.max(r, 0.5 * d);
    const [i0, i1, j0, j1] = this.range(x - R, x + R, y - R, y + R);
    let any = false;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const X = (i + 0.5) * d - x, Y = (j + 0.5) * d - y;
        if (X * X + Y * Y <= R * R) { this.decal(i, j, color, under); any = true; }
      }
    }
    if (!any) this.wPx(x, y, color);
  }

  private wEye(x: number, y: number, r: number, color: string, o: EyeOpts): void {
    const closed = o.closed ?? 0;
    const lid = o.lid ?? '#141018';
    if (closed >= 1) {
      this.wLine(x - r, y, x + r * 0.6, y, lid, false);
      return;
    }
    const d = this.d;
    const rr = Math.max(r, 0.5 * d);
    if (closed > 0) this.wDisc(x, y + rr * 0.35, rr * 0.7, color, false);
    else this.wDisc(x, y, rr, color, false);
    if (o.pupil && rr >= 1.2 * d) this.wDisc(x - rr * 0.25, y + rr * 0.1, rr * 0.45, o.pupil, false);
    if (o.glint && rr >= d) this.wPx(x - rr * 0.45, y - rr * 0.45, o.glint);
  }

  private wGlow(x: number, y: number, r: number, color: string, alpha: number): void {
    const d = this.d;
    const [i0, i1, j0, j1] = this.range(x - r, x + r, y - r, y + r);
    const rgb = color.slice(0, 7);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const X = (i + 0.5) * d - x, Y = (j + 0.5) * d - y;
        const q = Math.hypot(X, Y) / r;
        if (q > 1) continue;
        // Две-три ступени прозрачности с дизерингом на стыке: пиксельный ореол, а не размытие.
        const level = q < 0.45 ? 1 : q < 0.75 ? 0.6 : BAYER[(j & 3) * 4 + (i & 3)] > 0.5 ? 0.3 : 0;
        if (!level) continue;
        const a = Math.round(alpha * level * 255).toString(16).padStart(2, '0');
        this.decal(i, j, `${rgb}${a}`, true);
      }
    }
  }

  private wShadow(cx: number, rx: number, ry: number, alpha: number, y: number): void {
    const d = this.d;
    const [i0, i1, j0, j1] = this.range(cx - rx, cx + rx, y - ry, y + ry);
    const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const u = ((i + 0.5) * d - cx) / rx, v = ((j + 0.5) * d - y) / ry;
        if (u * u + v * v <= 1) this.decal(i, j, `#0a0810${a}`, true);
      }
    }
  }

  /** Тон клетки: свет по нормали части, фактура, сдвиг фигуры, блик и контровой свет — индекс в рампе. */
  private shade(k: number, i: number, j: number): number {
    const rm = this.mats[this.m[k]];
    const mat = rm.mat;
    const st = this.style;
    const b = this.bufs[this.part[k]];
    const S = b.S[k];
    const gx = S > 0 ? b.GX[k] / S : 0, gy = S > 0 ? b.GY[k] / S : 0;
    const [nx, ny, nz] = norm3(-gx, -gy, 1);
    let v: number;
    if (mat.glow) v = 0.7 + 0.3 * nz;
    else {
      const dot = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
      // Слегка «обёрнутый» свет: верх тела светлый, брюхо и дальний бок уходят в тень чётким терминатором,
      // обращённая к зрителю поверхность сидит на базовом тоне.
      v = AMBIENT + (1 - AMBIENT) * Math.max(0, (dot + 0.12) / 1.12) ** 1.35;
      // Земля затеняет низ: лапы и брюхо у пола темнее, враг стоит, а не парит.
      const low = (j + 0.5) * this.d - (this.ground - this.aoSpan);
      if (low > 0) v -= 0.14 * Math.min(1, low / this.aoSpan);
      // Контровой свет луны за спиной врага: тонкая светлая кромка по верхнему правому краю силуэта.
      if (st.rim > 0 && nx > 0.55 && ny < 0.15 && nz < 0.75) v = Math.max(v, 0.3 + 0.35 * st.rim * Math.min(1, (nx - 0.55) / 0.3));
    }
    v += this.toneAt[k];
    if (mat.tex && st.texture > 0) v += texture(mat.tex, this.lxAt[k], this.lyAt[k], this.seedAt[k]) * (mat.tex.amp ?? 0.15) * st.texture;
    if (mat.shine && !mat.glow) {
      const sp = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]) ** 24;
      if (sp * mat.shine > 0.35) v = 1.2;
    }
    const n = st.tones;
    const dith = st.dither * (mat.dither ?? 1);
    const a = this.anchor[k];
    const bi = (i - (a >> 16)) & 3, bj = (j - ((a << 16) >> 16)) & 3;
    const x = Math.max(0, Math.min(1, v)) * (n - 1);
    return Math.max(0, Math.min(n - 1, Math.floor(x + 0.5 + dith * (BAYER[bj * 4 + bi] - 0.5))));
  }

  /**
   * Пряди по силуэту: из граничной клетки материала с `shag` торчит 1–2 клетки того же тона.
   * Жребий — по локальным координатам фигуры, поэтому прядь едет вместе с ней и не мерцает.
   * Шерсть висит вниз и назад (враг смотрит влево — назад значит вправо), поэтому эти стороны лохматее.
   */
  private tufts(tone: Int8Array): void {
    const { W, H, m, d } = this;
    // Ниже линии земли шерсть не свисает: иначе лапы тонут в полу на пару пикселей.
    const floor = Math.round(this.ground / d);
    const dirs: Array<[number, number, number]> = [[1, 0, 0.8], [0, 1, 1], [-1, 0, 0.3], [0, -1, 0.25]];
    const add: Array<[number, number, number]> = [];
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        if (m[k] < 0) continue;
        const shag = this.mats[m[k]].mat.shag;
        if (!shag) continue;
        const qi = Math.floor(this.lxAt[k] / d), qj = Math.floor(this.lyAt[k] / d);
        for (let di = 0; di < 4; di++) {
          const [ox, oy, wgt] = dirs[di];
          const ni = i + ox, nj = j + oy;
          if (ni < 0 || nj < 0 || ni >= W || nj >= H || m[nj * W + ni] >= 0) continue;
          const r = hash(qi, qj, this.seedAt[k] + di * 101);
          if (r >= shag * wgt) continue;
          const len = d >= 2 ? 1 : r < shag * wgt * 0.4 ? 2 : 1;
          for (let s2 = 1; s2 <= len; s2++) {
            const ti = i + ox * s2, tj = j + oy * s2;
            if (ti < 0 || tj < 0 || ti >= W || tj >= floor || m[tj * W + ti] >= 0) break;
            add.push([tj * W + ti, k, s2]);
          }
        }
      }
    }
    for (const [q, k, s2] of add) {
      if (m[q] >= 0) continue;
      m[q] = m[k];
      this.part[q] = this.part[k];
      this.z[q] = this.z[k];
      tone[q] = Math.max(0, tone[k] - (s2 > 1 ? 1 : 0));
    }
  }

  /** Готовый кадр RGBA: тело, пряди, линии, контур, декали, свечение и тень. */
  finish(): Uint8ClampedArray {
    const { W, H, m, part, z } = this;
    const st = this.style;
    const out = new Uint8ClampedArray(W * H * 4);
    const tone = new Int8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (m[j * W + i] >= 0) tone[j * W + i] = this.shade(j * W + i, i, j);
    if (st.texture > 0) this.tufts(tone);
    const line = new Uint8Array(W * H);
    if (st.inner) {
      for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
          const k = j * W + i;
          if (m[k] < 0) continue;
          const nb = [i > 0 ? k - 1 : -1, i < W - 1 ? k + 1 : -1, j > 0 ? k - W : -1, j < H - 1 ? k + W : -1];
          for (const q of nb) {
            if (q < 0 || m[q] < 0) continue;
            if (part[q] !== part[k] && z[q] > z[k] && !this.noLineAt[q]) { line[k] = 1; break; }
          }
        }
      }
    }
    const setPx = (k: number, rgb: RGB, a: number): void => {
      out[k * 4] = rgb[0]; out[k * 4 + 1] = rgb[1]; out[k * 4 + 2] = rgb[2]; out[k * 4 + 3] = a;
    };
    for (let k = 0; k < W * H; k++) {
      if (m[k] < 0) continue;
      const rm = this.mats[m[k]];
      if (line[k]) setPx(k, st.outline === 'dark' ? rm.dark : rm.line, 255);
      else setPx(k, rm.ramp[tone[k]], 255);
    }
    // Внешний контур: пустая клетка рядом с телом. Со стороны света (тело справа или снизу) — светлее.
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        if (m[k] >= 0) continue;
        let best = -1, bestZ = -1, litSide = false;
        const check = (q: number, lit: boolean): void => {
          if (q < 0 || m[q] < 0 || this.mats[m[q]].mat.noOutline) return;
          if (z[q] > bestZ) { best = q; bestZ = z[q]; litSide = lit; }
        };
        check(i < W - 1 ? k + 1 : -1, true);
        check(j < H - 1 ? k + W : -1, true);
        check(i > 0 ? k - 1 : -1, false);
        check(j > 0 ? k - W : -1, false);
        if (best < 0) continue;
        const rm = this.mats[m[best]];
        setPx(k, litSide && st.outline === 'selective' ? rm.lit : rm.dark, 255);
      }
    }
    for (const dc of this.decals) {
      const k = dc.j * W + dc.i;
      const filled = out[k * 4 + 3] > 0;
      if (dc.under) {
        if (filled) continue;
        setPx(k, dc.rgb, dc.a);
      } else if (dc.a >= 255 || !filled) setPx(k, dc.rgb, dc.a);
      else {
        const a = dc.a / 255;
        setPx(k, [0, 1, 2].map((ch) => Math.round(out[k * 4 + ch] * (1 - a) + dc.rgb[ch] * a)) as RGB, 255);
      }
    }
    return out;
  }
}

/**
 * Та же модель в другом масштабе: рамка, поле и линия земли растут вместе с рисунком.
 * Так подгоняется рост под `ENEMY_BODY_HEIGHT`, не переписывая координаты лепки.
 */
export function scaleModel(model: Model, s: number): Model {
  return {
    id: model.id,
    w: Math.ceil(model.w * s),
    h: Math.ceil(model.h * s),
    ground: model.ground * s,
    pad: Math.round((model.pad ?? PAD) * s),
    draw: (p) => p.scope(s, 0, 0, () => model.draw(p)),
  };
}

// ─── Лист кадров ────────────────────────────────────────────────────────────

export interface Sheet {
  /** Размер кадра в пикселях рисунка (рамка модели с полем вокруг). */
  w: number;
  h: number;
  /** Единиц логического кадра на пиксель. */
  d: number;
  frames: Uint8ClampedArray[];
  fps: number;
  /** Первая занятая строка по всем кадрам (без тени): от неё начинается фигура. */
  top: number;
  /** Строк ниже линии земли: на столько лист опускается под пол. */
  foot: number;
  /** Пустых столбцов слева и справа по всем кадрам: видимая ширина фигуры — w − left − right. */
  left: number;
  right: number;
}

/**
 * Лист кадров клипа. Покой — `style.frames` кадров по фазе цикла; удар и урон — кадры `style.clips` по ходу 0..1
 * при замершем покое (фаза 0), поэтому последний кадр клипа совпадает с первым кадром покоя.
 * Урон вспыхивает белым в первых кадрах (`flash`), как принято у пиксельных бойцов.
 */
export function renderSheet(model: Model, style: Style, clip: MobClip = 'idle'): Sheet {
  const spec = clip === 'idle' ? null : style.clips[clip];
  const n = spec ? spec.frames : style.frames;
  const frames: Uint8ClampedArray[] = [];
  let w = 0, h = 0, top = Infinity, minX = Infinity, maxX = -1;
  for (let f = 0; f < n; f++) {
    const p = spec ? new Painter(model, style, 0, clip, n > 1 ? f / (n - 1) : 0) : new Painter(model, style, f / n);
    model.draw(p);
    const px = p.finish();
    w = p.W;
    h = p.H;
    const flash = spec?.flash?.[f] ?? 0;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4;
        if (px[k + 3] !== 255) continue;
        if (j < top) top = j;
        if (i < minX) minX = i;
        if (i > maxX) maxX = i;
        if (flash) for (let c = 0; c < 3; c++) px[k + c] = Math.round(px[k + c] + (255 - px[k + c]) * flash);
      }
    }
    frames.push(px);
  }
  const groundRow = Math.round((model.ground + (model.pad ?? PAD)) / style.d);
  return {
    w, h, d: style.d, frames, fps: spec ? spec.fps : style.fps,
    top: Number.isFinite(top) ? top : 0,
    foot: Math.max(0, h - groundRow),
    left: Number.isFinite(minX) ? minX : 0,
    right: maxX >= 0 ? w - 1 - maxX : 0,
  };
}
