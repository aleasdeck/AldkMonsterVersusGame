/**
 * Воин пиксельной лепкой — черновик модели для страницы обсуждения (в игру не входит).
 *
 * Референс — нарисованный лист `src/assets/heroes/warrior.png`, кадр боевой стойки. Мерки сняты с него в долях
 * рамки фигуры (она почти квадратная: ширина ≈ рост) и переведены в единицы поля при росте 128:
 * шлем крупный (≈ 36 × 33, четверть роста) и сидит низко между плечами, ближний наплечник — самая широкая
 * форма слева, меч длинный и широкий — от кулака у бедра наискось почти до земли у передней стопы, щит-капля
 * в перспективе занимает правую треть от плеча до колена, ноги короткие, колени широко и низко.
 *
 * Смотрит вправо, на врагов. Вполоборота к зрителю: ближняя сторона — левая (правая рука с мечом поверх
 * туловища), дальняя — правая (рука со щитом за туловищем, щит — перед ним). Свет сцены общий с врагами —
 * сверху слева.
 *
 * Облики A, B, C — одна лепка с разными шлемом, щитом и материалами. Анимаций пока нет (решение пользователя:
 * сначала модель) — поза задана точками стойки, покой только дышит.
 */
import { type Mat, type Model, type Painter } from '../../src/ui/mobs/pixel';
import { clipAt, HERO_CLIPS, poseAt, type HeroClip, type PoseKeys } from './hero';

const DEG = Math.PI / 180;

/** Точка на расстоянии `len` от (x, y) под углом `a` градусов: 0 — вперёд (к врагам), 90 — вниз, 180 — назад, 270 — вверх. */
function at(x: number, y: number, a: number, len: number): [number, number] {
  return [x + len * Math.cos(a * DEG), y + len * Math.sin(a * DEG)];
}

/** Рука из двух звеньев от плеча: направления плеча `a1` и предплечья `a2` (градусы, как в `at`). */
function limb2(sx: number, sy: number, a1: number, l1: number, a2: number, l2: number): { ex: number; ey: number; hx: number; hy: number } {
  const [ex, ey] = at(sx, sy, a1, l1);
  const [hx, hy] = at(ex, ey, a2, l2);
  return { ex, ey, hx, hy };
}

/** Колено по бедру и щиколотке (кости `l1`, `l2`): из двух решений — то, что ближе к направлению (dx, dy). */
function ik(ax: number, ay: number, bx: number, by: number, l1: number, l2: number, dx: number, dy: number): [number, number] {
  const vx = bx - ax, vy = by - ay;
  const dist = Math.hypot(vx, vy) || 1;
  const d = Math.min(dist, l1 + l2 - 0.01);
  const ux = vx / dist, uy = vy / dist;
  const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const k1: [number, number] = [ax + l1 * (ux * Math.cos(a) - uy * Math.sin(a)), ay + l1 * (ux * Math.sin(a) + uy * Math.cos(a))];
  const k2: [number, number] = [ax + l1 * (ux * Math.cos(a) + uy * Math.sin(a)), ay + l1 * (-ux * Math.sin(a) + uy * Math.cos(a))];
  return (k1[0] - ax) * dx + (k1[1] - ay) * dy >= (k2[0] - ax) * dx + (k2[1] - ay) * dy ? k1 : k2;
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const ease = (k: number): number => k * k * (3 - 2 * k);

// ─── Облики ─────────────────────────────────────────────────────────────────

export type WarriorLookId = 'A' | 'B' | 'C';
export type WeaponKind = 'sword' | 'axe' | 'mace';
/**
 * Шлем: `great` — горшок A, `tslit` — круглый горшок B с Т-прорезью (отвергнут: «круглый не нравится»), `nasal` — C.
 * Угловатые для Чёрного рыцаря: `flat` — ведро с плоским верхом, `sugarloaf` — «сахарная голова» с острым верхом,
 * `faceted` — гранёный с ребром посреди лица, `hounskull` — бацинет с забралом-клювом («собачья морда»).
 */
export type HelmKind = 'great' | 'tslit' | 'nasal' | 'flat' | 'sugarloaf' | 'faceted' | 'hounskull';
export const ANGULAR_HELMS: HelmKind[] = ['flat', 'sugarloaf', 'faceted', 'hounskull'];

export interface WarriorLook {
  id: WarriorLookId;
  name: string;
  /** Латы рук и ног, наплечники; у C — кольчуга. */
  limb: Mat;
  /** Кираса; у C — багровое сюрко поверх кольчуги. */
  chest: Mat;
  helm: Mat;
  /** Стыки, поддоспешник, прорези. */
  joint: Mat;
  /** Металл гарды и навершия; без него — латунь кромки или железо. */
  hilt?: Mat;
  /** Кромка лат: светлый и тёмный тон линии (латунь у A); null — без кромки. */
  trim: { lit: string; dark: string; mat: Mat } | null;
  cloth: Mat;
  leather: Mat;
  /** Длина плаща 0..1: у A — нет (только шарф), у B — длинный рваный плащ. */
  cape: number;
  helmKind: HelmKind;
  /** Гребень шлема (B): рваная грива цвета ткани. */
  crest?: Mat;
  /** Лицевая пластина шлема: свой рамп (светлее шлема) — лицо в тени сцены иначе сливается с прорезью. */
  face?: Mat;
  /** Или та же сталь, что шлем, но светлее на столько (тон краски), — чтобы шлем оставался из того же сета. */
  faceTone?: number;
  /** Цвет светлых рёбер угловатого шлема. */
  edge?: string;
  /** Насколько светлее верхняя грань угловатого шлема (по умолчанию 0.3). */
  topTone?: number;
  shieldKind: 'kite' | 'heater' | 'round';
  shieldFace: Mat;
  shieldRim: Mat;
  emblem: Mat | null;
  skin?: Mat;
  beard?: Mat;
}

/** Сталь героя по референсу: тёплая серая, контрастная — тени почти чёрные, блик почти белый. */
const STEEL: string[] = ['#1e181c', '#3a3236', '#5c5255', '#8a7f80', '#c2b7ae'];
const BRASS: Mat = { base: '#a8743a', ramp: ['#3e2410', '#704620', '#a8743a', '#d6a050', '#f4d488'], shine: 0.7, dither: 0 };
const CRIMSON: string[] = ['#2e0810', '#561220', '#86202c', '#ae3440', '#cc5048'];

const BLADE: Mat = { base: '#b0aca8', ramp: ['#403c3c', '#76716f', '#aca7a4', '#d8d4d0', '#f8f6f2'], shine: 1, dither: 0 };
const IRON: Mat = { base: '#55504e', shine: 0.5, tex: { kind: 'spots', scale: 2.2, amp: 0.25, density: 0.3 } };
const WOOD: Mat = { base: '#5a3d26', tex: { kind: 'stripes', scale: 2.2, amp: 0.14, angle: 0 } };
const SLIT = '#0b080b';

export const WARRIOR_LOOKS: Record<WarriorLookId, WarriorLook> = {
  // A — как на листе: закрытый шлем, латунная кромка, багровый шарф и табард, щит-капля с бледным крестом.
  A: {
    id: 'A',
    name: 'Рыцарь',
    limb: { base: '#5c5255', ramp: STEEL, dither: 0.3, metal: 0.7, tex: { kind: 'noise', scale: 1.6, amp: 0.14 } },
    chest: { base: '#5c5255', ramp: STEEL, dither: 0.3, metal: 0.7, tex: { kind: 'noise', scale: 1.6, amp: 0.14 } },
    helm: { base: '#625759', ramp: ['#201a1e', '#3f363a', '#625759', '#958a8a', '#d2c8be'], dither: 0.3, metal: 0.8, tex: { kind: 'noise', scale: 1.6, amp: 0.12 } },
    joint: { base: '#2a2226', dither: 0 },
    trim: { lit: '#e2b060', dark: '#8a5a26', mat: BRASS },
    cloth: { base: '#86202c', ramp: CRIMSON, shag: 0.16, tex: { kind: 'stripes', scale: 2.6, amp: 0.12, angle: 1.45 } },
    leather: { base: '#3e2b1d' },
    cape: 0,
    helmKind: 'great',
    shieldKind: 'kite',
    shieldFace: { base: '#3e3639', ramp: ['#161114', '#282124', '#3c3437', '#564c50', '#7a6e70'], tex: { kind: 'noise', scale: 3, amp: 0.14 } },
    shieldRim: BRASS,
    emblem: { base: '#b8a078', ramp: ['#4e4030', '#7a6648', '#a89070', '#cab494', '#e8d8b8'], dither: 0 },
  },
  // B — мрачнее: воронёная побитая сталь, без латуни, шлем с Т-прорезью и гребнем, длинный рваный плащ,
  // щит-«утюг» со сколами и выцветшей багровой перевязью (крест остаётся Паладину).
  B: {
    id: 'B',
    name: 'Чёрный рыцарь',
    limb: { base: '#4a4348', ramp: ['#110e12', '#28222a', '#453e45', '#71686d', '#aea3a2'], shine: 0.8, dither: 0.3, tex: { kind: 'spots', scale: 2.4, amp: 0.2, density: 0.16 } },
    chest: { base: '#4a4348', ramp: ['#110e12', '#28222a', '#453e45', '#71686d', '#aea3a2'], shine: 0.9, dither: 0.3, tex: { kind: 'spots', scale: 2.6, amp: 0.22, density: 0.18 } },
    // Шлем — та же воронёная сталь, что латы (светлый шлем выглядел «от другого сета»); голову выделяют грани,
    // светлая лицевая плоскость на полступени выше (`faceTone`), светлые рёбра и багровая грива.
    helm: { base: '#4a4348', ramp: ['#110e12', '#28222a', '#453e45', '#71686d', '#aea3a2'], shine: 0.8, dither: 0.3, tex: { kind: 'spots', scale: 2.4, amp: 0.2, density: 0.16 } },
    edge: '#8e8486',
    faceTone: 0.1,
    topTone: 0.14,
    joint: { base: '#1a1518', dither: 0 },
    trim: null,
    cloth: { base: '#6a161d', ramp: ['#22060a', '#420d13', '#68161d', '#8a2228', '#a83a34'], shag: 0.26, tex: { kind: 'stripes', scale: 2.2, amp: 0.16, angle: 1.5 } },
    leather: { base: '#2e2118' },
    cape: 1,
    // Круглый горшок (tslit) отвергнут пользователем — по умолчанию гранёный.
    helmKind: 'faceted',
    crest: { base: '#7a1a22', ramp: ['#2a070c', '#4c0f16', '#7a1a22', '#9e2a2e', '#bc4038'], shag: 0.3, tex: { kind: 'stripes', scale: 1.6, amp: 0.18, angle: 0.5 } },
    shieldKind: 'heater',
    // Щит светлее лат и с ярким ободом: тёмное на тёмном фоне сливалось.
    shieldFace: { base: '#3c3439', ramp: ['#141013', '#241e22', '#3a3237', '#52484e', '#6e6268'], tex: { kind: 'noise', scale: 2, amp: 0.16 } },
    shieldRim: { base: '#6e666a', ramp: ['#1c181a', '#3a3436', '#645c60', '#9a9094', '#d0c6c0'], dither: 0, metal: 0.8 },
    // Гарда и навершие — багровый металл в тон гриве и перевязи: воронёная гарда тонула в латной перчатке, светлая
    // стальная — всё ещё терялась на фоне лат (отзыв пользователя); красный — единственный тёплый цвет героя.
    hilt: { base: '#8e1f26', ramp: ['#2e0a0f', '#5c1219', '#8e1f26', '#bc3533', '#e2604e'], dither: 0, shine: 0.9 },
    emblem: { base: '#8a1e26', ramp: ['#2c080d', '#521018', '#841c24', '#a42a2e', '#c0403a'], dither: 0 },
  },
  // C — ветеран в кольчуге (стартовая броня Воина — Кольчуга): шлем с наносником и бармицей, лицо в тени и борода,
  // багровое сюрко поверх кольчуги, круглый деревянный щит с умбоном.
  C: {
    id: 'C',
    name: 'Ветеран',
    limb: { base: '#6a6668', ramp: ['#1e1c20', '#3a373b', '#5e5a5d', '#8a8587', '#bcb6b2'], dither: 0.2, tex: { kind: 'spots', scale: 1.6, amp: 0.35, density: 0.55 } },
    chest: { base: '#86202c', ramp: CRIMSON, tex: { kind: 'stripes', scale: 2.6, amp: 0.1, angle: 1.5 } },
    helm: { base: '#6b6164', ramp: ['#1c181b', '#3c3538', '#6a6063', '#a0969a', '#e0d8d2'], shine: 1, dither: 0.3 },
    joint: { base: '#241e20', dither: 0 },
    trim: { lit: '#b8a080', dark: '#5a4636', mat: { base: '#6e5a44', ramp: ['#241a12', '#44342a', '#6a5644', '#907a60', '#b8a080'], dither: 0 } },
    cloth: { base: '#86202c', ramp: CRIMSON, shag: 0.18, tex: { kind: 'stripes', scale: 2.4, amp: 0.12, angle: 1.45 } },
    leather: { base: '#4a3222' },
    cape: 0,
    helmKind: 'nasal',
    shieldKind: 'round',
    shieldFace: { base: '#6e2a22', ramp: ['#24100c', '#401a14', '#662820', '#8a3a2c', '#a8543e'], tex: { kind: 'stripes', scale: 3, amp: 0.14, angle: 1.57 } },
    shieldRim: IRON,
    emblem: { base: '#7c7674', ramp: ['#242022', '#433e3f', '#6c6664', '#9a9490', '#d4ccc4'], shine: 0.9, dither: 0 },
    skin: { base: '#a87858', tex: { kind: 'noise', scale: 2, amp: 0.1 } },
    beard: { base: '#5a483c', shag: 0.3, tex: { kind: 'noise', scale: 1.4, amp: 0.2 } },
  },
};

// ─── Оружие ─────────────────────────────────────────────────────────────────

/**
 * Длинный меч от кулака (x, y) под углом `a`: широкий клинок с долом, крестовина, рукоять, навершие.
 * По референсу клинок длинный — от бедра почти до земли у передней стопы.
 */
function sword(p: Painter, x: number, y: number, a: number, L: WarriorLook): void {
  const len = 70, w = 3.6;
  const u: [number, number] = [Math.cos(a * DEG), Math.sin(a * DEG)];
  const n: [number, number] = [-Math.sin(a * DEG), Math.cos(a * DEG)];
  // Крестовина стоит сразу за кулаком: ближе к кисти её закрывала латная перчатка (радиус 6), и гарды не было видно.
  const [gx, gy] = at(x, y, a, 7.5);
  const [bx, by] = at(x, y, a, 8.5);
  const [tx, ty] = at(x, y, a, len);
  p.poly([bx + n[0] * w, by + n[1] * w, ...at(tx + n[0] * w * 0.85, ty + n[1] * w * 0.85, a, -10), tx, ty, ...at(tx - n[0] * w * 0.85, ty - n[1] * w * 0.85, a, -10), bx - n[0] * w, by - n[1] * w], BLADE, { part: 'blade', bevel: 1.6 });
  // Дол — тёмная черта по середине клинка.
  p.line(...at(bx, by, a, 3), ...at(bx, by, a, len - 26), '#626872');
  const hilt = L.hilt ?? L.trim?.mat ?? IRON;
  // Рукоять в кулаке и навершие.
  p.limb(...at(x, y, a, 6), 1.8, ...at(x, y, a, -8), 1.6, L.leather, { part: 'grip' });
  p.ellipse(...at(x, y, a, -9.8), 3, 3, hilt, { part: 'pommel', lift: 1 });
  // Гарда: плечи поперёк клинка, концы загнуты к острию и с шариками, посередине — ромб-щиток на клинок.
  for (const side of [-1, 1]) {
    const mid: [number, number] = [gx + n[0] * 6 * side, gy + n[1] * 6 * side];
    const end: [number, number] = [gx + n[0] * 11 * side + u[0] * 2.6, gy + n[1] * 11 * side + u[1] * 2.6];
    p.chain([[gx, gy, 3], [mid[0], mid[1], 2.5], [end[0], end[1], 2]], hilt, { part: 'guard' });
    p.ellipse(end[0], end[1], 2.8, 2.8, hilt, { part: 'guard', lift: 1 });
  }
  p.poly([gx - u[0] * 1.5, gy - u[1] * 1.5, gx + n[0] * 3 + u[0] * 1.5, gy + n[1] * 3 + u[1] * 1.5, gx + u[0] * 5, gy + u[1] * 5, gx - n[0] * 3 + u[0] * 1.5, gy - n[1] * 3 + u[1] * 1.5], hilt, { part: 'guard', lift: 1.5, bevel: 1.2 });
  // Отблеск по верхней кромке крестовины (к свету) и тёмный стык с клинком.
  stroke(p, [gx - n[0] * 10 - u[0] * 1.2, gy - n[1] * 10 - u[1] * 1.2, gx - n[0] * 1 - u[0] * 2, gy - n[1] * 1 - u[1] * 2], GLINT, 'guard');
}

/** Боевой топор: рукоять и широкое бородовидное лезвие у конца. */
function axe(p: Painter, x: number, y: number, a: number, L: WarriorLook): void {
  const len = 44;
  const n: [number, number] = [-Math.sin(a * DEG), Math.cos(a * DEG)];
  const [tx, ty] = at(x, y, a, len);
  p.limb(...at(x, y, a, -8), 2, tx, ty, 2, WOOD, { part: 'haft' });
  const [ax, ay] = at(x, y, a, len - 9);
  p.poly([ax + n[0] * 2, ay + n[1] * 2, ...at(ax + n[0] * 16, ay + n[1] * 16, a, -7), ...at(ax + n[0] * 17, ay + n[1] * 17, a, 12), ...at(ax + n[0] * 2, ay + n[1] * 2, a, 9)], BLADE, { part: 'axeHead', bevel: 1.6 });
  p.poly([ax - n[0] * 2, ay - n[1] * 2, ...at(ax - n[0] * 7, ay - n[1] * 7, a, 1), ...at(ax - n[0] * 7, ay - n[1] * 7, a, 5), ...at(ax - n[0] * 2, ay - n[1] * 2, a, 8)], IRON, { part: 'axeHead', bevel: 1.2 });
  p.limb(...at(ax, ay, a, -1), 2.4, ...at(ax, ay, a, 10), 2.4, L.trim?.mat ?? IRON, { part: 'axeBand' });
}

/** Булава: рукоять с обмоткой и шестопёр — перья навершия шипами. */
function mace(p: Painter, x: number, y: number, a: number, L: WarriorLook): void {
  const len = 42;
  const [tx, ty] = at(x, y, a, len);
  p.limb(...at(x, y, a, -8), 1.8, ...at(x, y, a, len - 5), 1.7, IRON, { part: 'haft' });
  p.limb(...at(x, y, a, -7), 2.1, ...at(x, y, a, 4), 2.1, L.leather, { part: 'grip' });
  for (let k = 0; k < 6; k++) {
    const b = a + k * 60;
    p.poly([tx, ty, ...at(...at(tx, ty, b - 20, 4), b, 4.5), ...at(...at(tx, ty, b + 20, 4), b, 4.5)], IRON, { part: 'maceHead', bevel: 1.2 });
  }
  p.ellipse(tx, ty, 6, 6, L.trim?.mat ?? IRON, { part: 'maceHead' });
}

const WEAPONS: Record<WeaponKind, typeof sword> = { sword, axe, mace };

// ─── Шлемы ──────────────────────────────────────────────────────────────────

/**
 * Шлем в своих координатах: центр (0, 0), лицо к врагам (вправо), рамка около 22 × 25 (в модели — ×1.5).
 * Горшок с круглым верхом; лицевая пластина — справа, она выступает к врагам. Свет сверху слева, поэтому
 * верх и затылок светлые, лицо в полутени, прорезь — чёрная черта поперёк лица.
 */
/** Кольчуга бармицы у бацинета — мелкие кольца. */
const MAIL: Mat = { base: '#4e484c', ramp: ['#161316', '#2c272b', '#4c464a', '#746c70', '#a49a9a'], dither: 0.2, tex: { kind: 'spots', scale: 1.4, amp: 0.4, density: 0.6 } };

/**
 * Угловатые шлемы Чёрного рыцаря: силуэт — многоугольник с фаской (плоские грани, а не купол), грани разведены
 * светлотой краской по части: верх и бок к свету светлее, лицо — светлая плоскость (`L.face`) с чёрной прорезью,
 * дальняя грань к врагам темнее. Гребень — своей формы у каждого шлема, рисуется раньше и уходит назад.
 */
function angularHelm(p: Painter, L: WarriorLook): void {
  const M = L.helm, F = L.face ?? M;
  const slit = solid(SLIT);
  const o = { part: 'helm', paint: true };
  /** Лицевая плоскость: свой рамп или сталь шлема светлее на `faceTone`. */
  const fo = { ...o, tone: L.face ? 0 : (L.faceTone ?? 0) };
  const EDGE = L.edge ?? EDGE_LIGHT;
  switch (L.helmKind) {
    case 'flat': {
      // Ведро с плоским верхом: гребень — рваный намёт с затылка на плечи.
      if (L.crest) p.poly([-5, -12.5, -11.5, -10, -15.5, -3, -19, 6, -15.5, 3.5, -14, 9, -10.5, 3, -9, -4], L.crest, { part: 'crest', bevel: 2 });
      p.poly([-11.5, 10.5, -11.5, -10, -9.5, -13, 11, -13.5, 13, -11.5, 13.5, 11, 4.5, 13, -9, 12.5], M, { part: 'helm', bevel: 4.5 });
      // Крышка видна чуть сверху — светлая полоса; лицо — светлая плоскость; Т-прорезь с усилением-крестом.
      p.poly([-9.5, -13, 11, -13.5, 12.5, -11.5, -10.5, -10.3], M, { ...o, tone: L.topTone ?? 0.28 });
      p.poly([4, -10.5, 12.8, -11, 13.3, 11, 4.8, 12.6], F, fo);
      p.poly([-1, -2.6, 13.5, -3, 13.5, 0.8, -1, 0.8], slit, o);
      p.poly([7.4, 0.8, 10, 0.8, 9.8, 10.6, 7.6, 10.6], slit, o);
      stroke(p, [4, -10.2, 4.8, 12.6], SEAM, 'helm');
      stroke(p, [-10.5, -11, 11.5, -11.8], EDGE, 'helm');
      stroke(p, [-10.5, 11.5, 4, 12.8], SEAM, 'helm');
      for (const [x, y] of [[-8, -6], [-4, -6.2], [0, -6.4], [11.5, 4], [11.5, 8]]) p.px(x, y, '#9a9094');
      return;
    }
    case 'sugarloaf': {
      // «Сахарная голова»: стрельчатый верх с ребром от острия вниз по лицу, кисть гребня на острие.
      if (L.crest) p.poly([0, -16.5, -3, -21.5, -5, -18.5, -9.5, -20.5, -8.5, -16, -13, -15, -8, -12, -3, -13.5], L.crest, { part: 'crest', bevel: 2 });
      p.poly([-11, 10.5, -11.5, -1, -10, -7, -6, -12, 0.5, -17.5, 5.5, -13, 10, -7, 13, -1, 13.5, 11, 4.5, 13, -9, 12.5], M, { part: 'helm', bevel: 5 });
      // Скат к свету — светлее, лицо — светлая плоскость под ребром.
      p.poly([-11.5, -1, -10, -7, -6, -12, 0.5, -17.5, -1, -8, -9, -2], M, { ...o, tone: L.topTone ?? 0.18 });
      p.poly([4.5, -8, 10, -7, 13, -1, 13.3, 11, 5, 12.6], F, fo);
      p.poly([-1, -2.6, 13.5, -3, 13.5, 0.8, -1, 0.8], slit, o);
      for (const [x, y] of [[8, 4], [10, 4], [8, 6.5], [10, 6.5], [8, 9], [10, 9]]) p.px(x, y, SLIT);
      stroke(p, [0.8, -16.5, 4.8, -8, 5, 12.4], EDGE, 'helm');
      stroke(p, [-10.5, 11.5, 4, 12.8], SEAM, 'helm');
      return;
    }
    case 'faceted': {
      // Гранёный: двускатный верх с острым коньком, ребро от конька вниз посреди лица делит его на светлую и тёмную
      // половины («клюв»), прорезь поперёк обеих. Фаска узкая — грани острые. Гребень — грива по коньку назад.
      if (L.crest) p.poly([2, -16, -1, -20, -4, -17, -8, -19, -9, -14, -13.5, -12.5, -16, -7, -20, -3, -16.5, -2.5, -14, 0, -11, -5, -6, -11, 0, -14.5], L.crest, { part: 'crest', bevel: 2 });
      p.poly([-11, 9, -12, -5, -6, -13, 2, -16.5, 10, -12.5, 13.5, -4, 15.5, 2, 13, 11, 6, 14, -8, 13], M, { part: 'helm', bevel: 1.6 });
      p.poly([-12, -5, -6, -13, 2, -16.5, 2.5, -7, -9, -3.5], M, { ...o, tone: L.topTone ?? 0.3 });
      p.poly([2.5, -7, 2, -16.5, 9, -8, 9.5, 14, 3, 13], F, fo);
      p.poly([9, -8, 2, -16.5, 10, -12.5, 13.5, -4, 15.5, 2, 13, 11, 9.5, 14], M, { ...o, tone: -0.14 });
      // Лицо — только прорезь: дыхальца столбиком на щеке читались «тремя точками» (отзыв пользователя) — убраны.
      p.poly([-1, -2.2, 15.5, -1.4, 15.5, 1.2, -1, 0.8], slit, o);
      stroke(p, [2.2, -16, 9, -8, 9.5, 13.6], EDGE, 'helm');
      stroke(p, [-11.5, -5, -6, -12.8, 2, -16.2], EDGE, 'helm');
      stroke(p, [2.5, -7, 3, 12.8], SEAM, 'helm');
      stroke(p, [-9, -3.5, 2.5, -7], SEAM, 'helm');
      stroke(p, [-10.5, 10.5, 6, 13.5], SEAM, 'helm');
      // Отблески: грани плоские, и блик движка на них почти не загорается — ставим его руками на свету:
      // верх конька, передняя кромка верхней грани, пятно на ней, край лица под коньком, нижний край бока.
      stroke(p, [2.2, -15.8, 5.5, -12], GLINT, 'helm');
      stroke(p, [-10, -6.5, -6.8, -11.2], GLINT, 'helm');
      stroke(p, [-4.5, -8.4, -2, -9.6], GLINT_DIM, 'helm');
      stroke(p, [3.8, -5.2, 4, -3], GLINT_DIM, 'helm');
      stroke(p, [-11.3, 3.5, -11, 7.5], GLINT_DIM, 'helm');
      // Заклёпки по нижнему краю бока.
      for (const x of [-8, -4, 0]) p.px(x, 10.5, GLINT_DIM);
      return;
    }
    case 'hounskull': {
      // Бацинет с забралом-клювом: купол стрелой назад-вверх, клюв вперёд к врагам со щелью глаз и дыхальцами,
      // кольчужная бармица на плечи. Гребень — по куполу.
      if (L.crest) p.poly([1, -14, -2, -18.5, -5, -15.5, -8.5, -17, -9.5, -12, -14, -10, -16, -4, -19.5, 1, -15.5, 0, -12, -5, -7, -10, -1, -12.5], L.crest, { part: 'crest', bevel: 2 });
      p.poly([-12.5, 4, -12.5, 14.5, -2, 16.5, 8, 14.5, 9, 8, -4, 6], MAIL, { part: 'aventail', bevel: 3 });
      p.poly([-11, 6, -12, -3, -8.5, -11, -2, -15.5, 4, -13, 8, -7, 7, 2, -2, 6], M, { part: 'helm', bevel: 4.5 });
      p.poly([-12, -3, -8.5, -11, -2, -15.5, -2.5, -7, -9, -1], M, { ...o, tone: L.topTone ?? 0.2 });
      // Забрало — отдельная часть: клюв светлее, щель глаз поперёк, дыхальца на нижнем скате.
      p.poly([2.5, -7.5, 9.5, -6.5, 19, 1.5, 9.5, 9, 2.5, 10, 0.5, 1], F, { part: 'visor', bevel: 3 });
      p.poly([3, -7.2, 9.5, -6.2, 19, 1.5, 3, 1.5], F, { part: 'visor', paint: true, tone: 0.15 + fo.tone });
      p.poly([3, -3.8, 14, -1.3, 14, 0.2, 3, -2.2], slit, { part: 'visor', paint: true });
      for (const [x, y] of [[8, 3.5], [10.5, 3.5], [13, 3], [8, 6], [10.5, 5.8]]) p.px(x, y, SLIT);
      stroke(p, [9.5, -6.4, 18.5, 1.5], EDGE, 'visor');
      p.px(2, -1, '#b0a6a6');
      return;
    }
    default:
  }
}

function helm(p: Painter, L: WarriorLook): void {
  const M = L.helm;
  if (ANGULAR_HELMS.includes(L.helmKind)) {
    angularHelm(p, L);
    return;
  }
  if (L.helmKind === 'nasal') {
    // Бармица — кольчужный капюшон вокруг лица, на плечи; лицо открыто со стороны врагов.
    p.ellipse(-3, 3, 9.5, 11, L.limb, { part: 'coif' });
    p.poly([-12, 3, -10, 15, 4, 16.5, 6, 12, -2, 8], L.limb, { part: 'coif' });
    // Лицо в тени под краем шлема: нос, скула, борода.
    p.ellipse(5.5, 3.5, 5.6, 6.6, L.skin!, { part: 'face' });
    // Тень под краем шлема — глаза прорезями из тени, нос светлой гранью.
    p.poly([0, -1, 12, -1.5, 12, 2, 0, 2.5], solid('#2a1a14'), { part: 'face', paint: true });
    p.px(6.5, 1, '#d8c8a0');
    p.px(10, 0.8, '#b8a888');
    p.poly([1, 7, 12, 6, 11.5, 11, 7.5, 15.5, 2, 13.5], L.beard!, { part: 'beard' });
    p.line(7, 8.5, 10, 8.2, '#1e140e');
    // Купол шлема с наносником.
    p.ellipse(0, -4, 10.5, 9, M, { part: 'helm' });
    p.poly([-10.5, -4, 10.5, -4, 11, -1, -10.5, 0], M, { part: 'helm', bevel: 1.5 });
    p.limb(-10.5, -0.5, 1.4, 11, -1.5, 1.4, L.trim?.mat ?? M, { part: 'rim' });
    p.limb(8.5, -1, 1.3, 9, 6, 1.1, M, { part: 'nasal' });
    for (const x of [-7, -3, 1, 5]) p.px(x, -0.5, '#c8bcae');
    return;
  }
  // Горшок: купол и стенки одной частью; лицевая пластина — выпуклый клин к врагам.
  if (L.helmKind === 'tslit') {
    // Гребень — рваная багровая грива от темени назад: единственное яркое пятно на тёмном шлеме, голова читается
    // по нему сразу. Рисуется раньше шлема и уходит за затылок.
    if (L.crest) p.poly([7, -11, 5, -16.5, 2, -14.5, -1, -18.5, -4, -15.5, -7.5, -17.5, -9, -13, -13.5, -12, -16, -7, -20, -3, -16.5, -2.5, -14, 0, -11, -5, -6, -9, 0, -11.5, 5, -10], L.crest, { part: 'crest', bevel: 2 });
    p.ellipse(0, -4.5, 11, 10, M, { part: 'helm' });
    p.poly([-6, -12.5, 2, -15.5, 8, -10, 2, -12.5], M, { part: 'helm', bevel: 1 });
  } else {
    p.ellipse(0, -4, 11, 9, M, { part: 'helm' });
  }
  // Стенки горшка — вертикальный цилиндр: бок к свету светлый, к врагам темнее. Шаром (купол до подбородка)
  // низ шлема уходил в тень, как подбрюшье, и голова читалась тёмным комом.
  p.limb(0, -3, 11, 0, 9, 10.5, M, { part: 'helm' });
  p.poly([-10.5, 6, 10.5, 5, 11.5, 11, 3, 13, -9, 12], M, { part: 'helm', bevel: 3 });
  // Лицо шлема: плоская пластина к врагам, её верх — ребро над прорезью. Подъём выше купола: иначе мягкий максимум
  // отдаёт лицо правому скату купола, и оно уходит в тень целиком.
  p.poly([3, -6, 12, -5, 13, 11, 4, 13], M, { part: 'helm', lift: 13, bevel: 2.5, tone: -0.02 });
  // Прорезь — чёрная черта поперёк лица, продолжается на висок.
  p.poly([-2, -1.4, 13, -1.8, 13, 0.8, -2, 0.8], { base: SLIT, dither: 0 }, { part: 'helm', paint: true });
  if (L.helmKind === 'tslit') {
    // Лицевая пластина — светлая плоскость: свет сцены из-за спины героя оставлял лицо в тени, и прорезь на нём
    // не читалась. Т-прорезь на ней — почти чёрная: поперёк лица и вниз до края шлема.
    p.poly([3.5, -5.5, 12.5, -4.8, 13.2, 11, 4.5, 12.6], L.face ?? M, { part: 'helm', paint: true });
    p.poly([-1, -2.2, 13.5, -2.6, 13.5, 1, -1, 1], solid(SLIT), { part: 'helm', paint: true });
    p.poly([7, 0.5, 10.2, 0.5, 9.8, 10.5, 7.4, 10.5], solid(SLIT), { part: 'helm', paint: true });
    // Кромки: светлая дуга по куполу на свету, тёмный стык бока и лица, тёмный низ шлема.
    arcStroke(p, 0, -2.5, 10.2, 10.6, 195, 300, EDGE, 'helm');
    stroke(p, [3.2, -5.8, 4.2, 12.6], SEAM, 'helm');
    stroke(p, [-9.5, 11.5, 3, 12.8], SEAM, 'helm');
    // Вмятины и сколы.
    stroke(p, [-5, -8, -3, -7], SEAM, 'helm');
    stroke(p, [-8, 4, -6.5, 8], SEAM, 'helm');
  } else {
    // Дыхательные отверстия на щеке — столбиком, латунная кромка по низу и по краю лица.
    for (const [x, y] of [[8, 4], [10, 4], [8, 6.5], [10, 6.5], [8, 9], [10, 9]]) p.px(x, y, SLIT);
    if (L.trim) {
      p.line(-9, 12, 3, 13, L.trim.dark);
      p.line(3, -6, 12, -5, L.trim.lit);
    }
  }
}

// ─── Щиты ───────────────────────────────────────────────────────────────────

/**
 * Щит в своих координатах: центр (0, 0). В перспективе — повёрнут лицом к зрителю и к врагам: верхняя кромка
 * поднимается к врагам, остриё уходит вниз и вперёд.
 */
function shield(p: Painter, L: WarriorLook): void {
  const F = L.shieldFace, R = L.shieldRim;
  // Перспектива: x чуть сжат, y сдвинут по x — верхняя кромка поднимается к врагам.
  const P = (pts: number[]): number[] => pts.map((v, k) => (k % 2 === 0 ? v * 0.92 : v - pts[k - 1] * 0.42));
  const seg = (pts: number[]): [number, number, number, number] => P(pts) as [number, number, number, number];
  if (L.shieldKind === 'round') {
    p.ellipse(0, 0, 11.5, 14, R, { part: 'shield', flat: 0.6, rot: -0.3 });
    p.ellipse(0.4, 0, 9.8, 12.2, F, { part: 'shield', paint: true, rot: -0.3 });
    // Раскраска четвертями — выцветшая кость по багровому дереву.
    p.poly([0, -16, 16, -16, 16, 0, 0, 0], { base: '#a89478', tex: { kind: 'stripes', scale: 3, amp: 0.14, angle: 1.57 } }, { part: 'shield', paint: true });
    p.poly([-16, 0, 0, 0, 0, 16, -16, 16], { base: '#a89478', tex: { kind: 'stripes', scale: 3, amp: 0.14, angle: 1.57 } }, { part: 'shield', paint: true });
    p.ellipse(0.4, 0, 9.8, 12.2, R, { part: 'shield', paint: true, rot: -0.3 });
    p.ellipse(0.4, 0, 8.6, 11, F, { part: 'shieldIn', rot: -0.3, flat: 0.8 });
    p.poly([0, -14, 14, -14, 14, 0, 0, 0], { base: '#a89478', tex: { kind: 'stripes', scale: 3, amp: 0.14, angle: 1.57 } }, { part: 'shieldIn', paint: true });
    p.poly([-14, 0, 0, 0, 0, 14, -14, 14], { base: '#a89478', tex: { kind: 'stripes', scale: 3, amp: 0.14, angle: 1.57 } }, { part: 'shieldIn', paint: true });
    p.ellipse(0.5, 0.5, 4, 4.6, L.emblem ?? IRON, { part: 'boss', lift: 1.2 });
    for (const [x, y] of [[-6, -6], [6, -11], [-7, 10], [7, 6]]) p.px(x, y, '#9a948e');
    return;
  }
  if (L.shieldKind === 'heater') {
    // «Утюг» в перспективе мягче капли: плоский верх с лёгкой дугой, широкий обод, перевязь наискось.
    const H = (pts: number[]): number[] => pts.map((v, k) => (k % 2 === 0 ? v * 0.9 : v - pts[k - 1] * 0.28));
    const hs = (pts: number[]): number[] => H(pts);
    p.poly(H([-11.5, -13, 0, -14.2, 11.5, -13, 12, 2, 7, 13, 0, 19.5, -7, 13, -12, 2]), R, { part: 'shield', bevel: 3.5, flat: 0.5 });
    p.poly(H([-9, -10.6, 0, -11.6, 9, -10.6, 9.4, 1.5, 5.4, 11, 0, 16, -5.4, 11, -9.4, 1.5]), F, { part: 'shield', paint: true });
    if (L.emblem) p.poly(H([-12, -9, -6, -15, 13, 8, 13, 15]), L.emblem, { part: 'shield', paint: true });
    p.poly(H([-9, -10.6, 0, -11.6, 9, -10.6, 9.4, 1.5, 5.4, 11, 0, 16, -5.4, 11, -9.4, 1.5]), F, { part: 'shieldIn', flat: 0.9, lift: 0.4, noLine: true });
    if (L.emblem) p.poly(H([-12, -9, -6, -15, 13, 8, 13, 15]), L.emblem, { part: 'shieldIn', paint: true });
    // Светлая кромка обода сверху и слева — на свету, сколы — тёмными зарубками.
    stroke(p, hs([-11, -12.6, 0, -13.8, 11, -12.6]), EDGE, 'shield');
    stroke(p, hs([-11.6, -12, -11.6, 2, -7, 12.4]), '#9a9094', 'shield');
    stroke(p, hs([-9, -3, -6.5, -1.5]), SEAM, 'shieldIn');
    stroke(p, hs([6, -10.5, 8, -7]), SEAM, 'shieldIn');
    stroke(p, hs([2, 8, 4.5, 10]), SEAM, 'shieldIn');
    return;
  }
  // Капля: плоский верх, острый низ, толстая латунная кромка.
  p.poly(P([-11.5, -14, 0, -16, 11.5, -14, 12, 1, 7.5, 13, 0, 23, -7.5, 13, -12, 1]), R, { part: 'shield', bevel: 3, flat: 0.5 });
  p.poly(P([-9.4, -12, 0, -13.8, 9.4, -12, 9.8, 0.8, 5.8, 11.8, 0, 19.6, -5.8, 11.8, -9.8, 0.8]), F, { part: 'shield', paint: true });
  if (L.emblem) {
    p.poly(P([-1.5, -10, 1.5, -10, 1.3, 12, -1.3, 12]), L.emblem, { part: 'shield', paint: true });
    p.poly(P([-6.5, -4, 6.5, -4, 6.5, -1.2, -6.5, -1.2]), L.emblem, { part: 'shield', paint: true });
  }
  // Царапины на лице щита.
  p.line(...seg([-7, 5, -3, 8]), '#1a1417');
  p.line(...seg([4, -9, 7, -6]), '#5a4e52');
}

// ─── Модель ─────────────────────────────────────────────────────────────────

/**
 * Мерки стойки в единицах поля (рост 128, земля 132, рамка фигуры ≈ 128 × 128 — как у референса).
 * Ближнее — слева, дальнее — справа, к врагам.
 */
const G = 132;
/** Сутулость: верх подан к врагам вокруг таза — стойка бойца, а не «смирно». */
const HUNCH = 7 * DEG;
/** Масштаб угловатых шлемов Чёрного рыцаря: 1.36, как у горшка, выходил «сильно большим» (отзыв пользователя). */
const HELM_ANGULAR_SCALE = 1.14;
const M = {
  helm: [65, 24],
  neck: [61, 38],
  /** Бёдра, колени, щиколотки; носок — наружу (ближний назад, дальний к врагам). */
  legN: { hip: [50, 76], knee: [31, 97], ank: [20, 121], toe: 180 },
  legF: { hip: [71, 76], knee: [91, 95], ank: [101, 120], toe: 0 },
  /** Ближняя рука: плечо, локоть, кулак; меч от кулака под углом. */
  armN: { sh: [31, 44], el: [15, 62], hand: [27, 82], sword: 22 },
  /** Дальняя рука: плечо, локоть, кулак за щитом; центр щита. */
  armF: { sh: [80, 40], el: [89, 54], hand: [101, 60], shield: [106, 70] },
};

/** Материал одного цвета — для штрихов краской по части: стык, кромка, блик. Кэш: движок узнаёт материал по объекту. */
const SOLID = new Map<string, Mat>();
function solid(c: string): Mat {
  let m = SOLID.get(c);
  if (!m) SOLID.set(c, (m = { base: c, ramp: [c, c, c, c, c], dither: 0 }));
  return m;
}

/**
 * Штрих в пиксель краской по своей части (`paint`): в отличие от декали его закрывает всё, что нарисовано позже, —
 * меч поверх ноги не пересекается чертой наколенника.
 */
function stroke(p: Painter, pts: number[], color: string, part: string): void {
  for (let k = 0; k + 3 < pts.length; k += 2) p.limb(pts[k], pts[k + 1], 0.6, pts[k + 2], pts[k + 3], 0.6, solid(color), { part, paint: true });
}

/** Дуга эллипса штрихом краской по части. */
function arcStroke(p: Painter, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, color: string, part: string): void {
  const n = Math.max(3, Math.ceil((Math.abs(a1 - a0) / 360) * (rx + ry) * 1.2));
  const pts: number[] = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + ((a1 - a0) * k) / n) * DEG;
    pts.push(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
  }
  stroke(p, pts, color, part);
}

/** Тёмный стык пластин и светлая кромка стали. */
const SEAM = '#140f13';
const EDGE_LIGHT = '#b6aaa6';
/** Отблески на гранях шлема: яркий — на кромке к свету, приглушённый — пятна на плоскостях. */
const GLINT = '#e4dad2';
const GLINT_DIM = '#b8aeaa';
const EDGE = EDGE_LIGHT;

// ─── Поза и клипы ───────────────────────────────────────────────────────────

/** Длина оружия от кулака до острия — для свечения на острие. */
const WEAPON_LEN: Record<WeaponKind, number> = { sword: 70, axe: 44, mace: 42 };

/** Длины звеньев рук и ног — из мерок стойки, поэтому поза покоя собирается углами ровно в мерки. */
const len = (a: readonly number[], b: readonly number[]): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
const dir = (a: readonly number[], b: readonly number[]): number => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const ARM_N = { l1: len(M.armN.sh, M.armN.el), l2: len(M.armN.el, M.armN.hand), a1: dir(M.armN.sh, M.armN.el), a2: dir(M.armN.el, M.armN.hand) };
const ARM_F = { l1: len(M.armF.sh, M.armF.el), l2: len(M.armF.el, M.armF.hand), a1: dir(M.armF.sh, M.armF.el), a2: dir(M.armF.el, M.armF.hand) };
const LEG_N = { l1: len(M.legN.hip, M.legN.knee), l2: len(M.legN.knee, M.legN.ank) };
const LEG_F = { l1: len(M.legF.hip, M.legF.knee), l2: len(M.legF.knee, M.legF.ank) };
/** Таз — опора наклона верха; бёдра ног — от него. */
const PELVIS: [number, number] = [60, 74];

/**
 * Поза героя. Углы рук — градусы по `at` (0 — к врагам, 90 — вниз, 270 — вверх; можно и за 360 и в минус —
 * интерполяция идёт по числу, а не по кругу), наклоны — градусы (плюс — вперёд, к врагам).
 * `x`/`y` двигают таз и верх, а ступни стоят на земле (шаг — `footF`/`footN`): ноги сгибаются сами, а не достают —
 * пятка отрывается и нога встаёт на носок. Ближнюю руку можно вести углами (`n1`, `n2`) или кистью в точку
 * (`hx`, `hy` при `nh` = 1): удары задаются путём кисти и углом клинка, локоть решает ik.
 */
export interface WarriorPose extends Record<string, number> {
  x: number; y: number;
  /** Присед: таз ниже, колени шире. */
  crouch: number;
  /** Наклон верха вокруг таза поверх сутулости. */
  lean: number;
  /** Наклон головы вокруг шеи (плюс — вниз, к врагам). */
  head: number;
  /** Ближняя рука (оружие): плечо, предплечье, оружие. */
  n1: number; n2: number; sw: number;
  /** Ближняя рука кистью: точка кисти в координатах верха и доля (0 — углы `n1`/`n2`, 1 — кисть в точке). */
  nh: number; hx: number; hy: number;
  /** Дальняя рука (щит): плечо, предплечье; наклон щита и сдвиг от кисти. */
  f1: number; f2: number; sh: number; shx: number; shy: number;
  /** Шаг: сдвиг стоп по x и подъём над полом. */
  footF: number; footN: number; liftF: number; liftN: number;
  /** Колено ближней (задней) ноги на земле: 0 — стоит, 1 — на колене (таз опускать приседом ~23). */
  kneel: number;
  /** Плащ, грива, табард: 0 — висят, 1 — взвились назад. */
  cape: number;
  /** Смерть: 0 — стоит, 1 — лежит на спине. */
  fall: number;
  /** Смерть: оружие выпало (0 — в руке, 1 — лежит на земле). */
  drop: number;
  /** Свечение на острие (приём, клич), пыль у ног (сильный удар), искры о кромку щита. */
  glow: number; dust: number; spark: number;
}

const REST: WarriorPose = {
  x: 0, y: 0, crouch: 0, lean: 0, head: 0,
  n1: ARM_N.a1, n2: ARM_N.a2, sw: M.armN.sword,
  nh: 0, hx: M.armN.hand[0], hy: M.armN.hand[1],
  f1: ARM_F.a1, f2: ARM_F.a2, sh: 0, shx: 0, shy: 0,
  footF: 0, footN: 0, liftF: 0, liftN: 0, kneel: 0,
  cape: 0, fall: 0, drop: 0, glow: 0, dust: 0, spark: 0,
};

/**
 * Ключи клипов по кадрам (номер кадра с нуля; кадр контакта — `contact` в HERO_CLIPS). Поле, которого нет в ключе,
 * держит свою интерполяцию между соседними ключами; после последнего ключа — покой к последнему кадру (смерть держится).
 * Вспышки (`spark`, `dust`) ставятся явным нулём на кадре перед контактом — иначе они растекаются по замаху.
 */
const CLIPS: Record<Exclude<HeroClip, 'idle'>, PoseKeys<WarriorPose>> = {
  // Удар A «С плеча»: кисть уходит за ближнее плечо, клинок ложится за спину; шаг передней ногой — и кисть идёт дугой
  // над шлемом вперёд-вниз, клинок отстаёт от кисти и догоняет её в кадр контакта (прямая линия руки и меча на врага),
  // потом уходит вниз-вперёд, не доставая земли. Задняя нога стоит, пятка отрывается сама.
  attack: [
    [0, { x: -2, crouch: 2, lean: -4, head: -3, nh: 1, hx: 36, hy: 34, sw: -70, cape: 0.1 }],
    [1, { x: -5, crouch: 4, lean: -9, head: -6, hx: 28, hy: 10, sw: -198, f1: 70, f2: 40, sh: 4, liftF: 2, cape: 0.3 }],
    [2, { x: -6, crouch: 5, lean: -10, head: -6, hx: 25, hy: 8, sw: -210, f1: 72, f2: 42, sh: 5, liftF: 3, footF: -1, cape: 0.35 }],
    [3, { x: 3, crouch: 3, lean: 0, head: 2, hx: 56, hy: 4, sw: -110, f1: 80, f2: 60, sh: 8, liftF: 5, footF: 7, cape: 0.6 }],
    [4, { x: 10, crouch: 8, lean: 8, head: 6, hx: 76, hy: 42, sw: 10, f1: 86, f2: 72, sh: 10, liftF: 0, footF: 12, cape: 1 }],
    [5, { x: 11, crouch: 9, lean: 10, head: 7, hx: 70, hy: 62, sw: 30, f1: 84, f2: 68, sh: 9, footF: 12, cape: 0.85 }],
    [6, { x: 5, crouch: 4, lean: 5, head: 3, nh: 1, hx: 46, hy: 72, sw: 28, liftF: 3, footF: 6, cape: 0.4 }],
  ],
  // Удар B «Укол»: кисть к бедру, клинок вперёд вдоль предплечья, щит прикрывает; шаг — и рука во всю длину, клинок по
  // горизонтали в грудь врага.
  attack_thrust: [
    [0, { x: -2, crouch: 2, lean: -2, nh: 1, hx: 30, hy: 60, sw: 2, cape: 0.1 }],
    [1, { x: -4, crouch: 4, lean: -4, hx: 20, hy: 58, sw: -2, f1: 45, f2: 15, sh: -4, liftF: 2, cape: 0.2 }],
    [2, { x: -4, crouch: 4, lean: -4, hx: 19, hy: 57, sw: -3, f1: 45, f2: 15, sh: -4, liftF: 3, cape: 0.25 }],
    [3, { x: 4, crouch: 5, lean: 4, hx: 50, hy: 52, sw: -8, f1: 70, f2: 45, sh: 2, liftF: 4, footF: 7, cape: 0.6 }],
    [4, { x: 11, crouch: 8, lean: 9, head: 4, hx: 80, hy: 46, sw: -15, f1: 86, f2: 70, sh: 10, liftF: 0, footF: 12, cape: 1 }],
    [5, { x: 11, crouch: 8, lean: 9, head: 4, hx: 78, hy: 47, sw: -14, f1: 85, f2: 68, sh: 9, footF: 12, cape: 0.85 }],
    [6, { x: 5, crouch: 4, lean: 4, head: 2, nh: 1, hx: 46, hy: 62, sw: 4, liftF: 3, footF: 6, cape: 0.4 }],
  ],
  // Сильный удар A «Сверху с шагом»: присел — и привстал на носки, кисть высоко над плечом, клинок висит за спиной;
  // широкий шаг, кисть дугой над шлемом, клинок догоняет в кадр контакта и уходит в землю перед врагом — пыль.
  heavy: [
    [0, { x: -1, crouch: 4, lean: 2, head: 2, nh: 1, hx: 38, hy: 40, sw: -50, cape: 0.1, dust: 0 }],
    [1, { x: -5, y: -2, crouch: 1, lean: -10, head: -8, hx: 34, hy: 6, sw: -170, f1: 60, f2: 30, sh: 2, liftF: 1, cape: 0.3 }],
    [2, { x: -6, y: -4, crouch: 0, lean: -13, head: -9, hx: 36, hy: -2, sw: -235, f1: 60, f2: 30, sh: 2, liftF: 3, footF: -2, cape: 0.4 }],
    [3, { x: -4, y: -4, crouch: 0, lean: -12, head: -8, hx: 38, hy: -3, sw: -240, f1: 62, f2: 32, sh: 3, liftF: 5, footF: 2, cape: 0.45 }],
    [4, { x: 6, y: -2, crouch: 3, lean: 0, head: 2, hx: 62, hy: 2, sw: -150, f1: 78, f2: 55, sh: 8, liftF: 6, footF: 12, cape: 0.7, dust: 0 }],
    [5, { x: 15, y: 0, crouch: 12, lean: 12, head: 10, hx: 78, hy: 40, sw: 5, f1: 88, f2: 76, sh: 12, liftF: 0, footF: 18, cape: 1, dust: 0 }],
    [6, { x: 16, crouch: 13, lean: 14, head: 12, hx: 72, hy: 60, sw: 35, f1: 88, f2: 76, sh: 12, footF: 18, cape: 0.9, dust: 1 }],
    [7, { x: 15, crouch: 12, lean: 13, head: 11, hx: 71, hy: 61, sw: 36, footF: 18, cape: 0.7, dust: 0.6 }],
    [8, { x: 7, crouch: 6, lean: 6, head: 4, nh: 1, hx: 50, hy: 70, sw: 30, liftF: 4, footF: 9, cape: 0.3, dust: 0.15 }],
  ],
  // Сильный удар B «Глубокий выпад»: кисть отведена к заднему бедру, щит выставлен вперёд; длинный шаг, таз низко, задняя
  // нога вытянута на носке — рука и клинок одной прямой в грудь врага, щит уходит назад противовесом.
  heavy_thrust: [
    [0, { x: -2, crouch: 3, lean: -3, nh: 1, hx: 30, hy: 56, sw: 0, f1: 40, f2: 10, sh: -6, cape: 0.1 }],
    [1, { x: -6, crouch: 7, lean: -6, head: 2, hx: 18, hy: 54, sw: -4, f1: 30, f2: 0, sh: -8, liftF: 2, cape: 0.2 }],
    [2, { x: -7, crouch: 8, lean: -7, head: 2, hx: 16, hy: 53, sw: -5, f1: 30, f2: 0, sh: -8, liftF: 3, cape: 0.25 }],
    [3, { x: -2, crouch: 6, lean: -2, hx: 30, hy: 50, sw: -6, f1: 50, f2: 20, sh: -4, liftF: 6, footF: 6, cape: 0.4 }],
    [4, { x: 8, crouch: 8, lean: 6, head: 2, hx: 58, hy: 46, sw: -10, f1: 85, f2: 60, sh: 8, liftF: 3, footF: 16, cape: 0.8 }],
    [5, { x: 18, crouch: 12, lean: 12, head: 4, hx: 80, hy: 44, sw: -17, f1: 92, f2: 80, sh: 12, liftF: 0, footF: 22, footN: 4, cape: 1 }],
    [6, { x: 18, crouch: 12, lean: 12, head: 4, hx: 80, hy: 44, sw: -16, f1: 92, f2: 80, sh: 12, footF: 22, footN: 4, cape: 0.9 }],
    [7, { x: 12, crouch: 9, lean: 8, head: 3, hx: 55, hy: 52, sw: -8, f1: 80, f2: 60, sh: 8, footF: 18, footN: 3, cape: 0.6 }],
    [8, { x: 5, crouch: 4, lean: 3, nh: 1, hx: 36, hy: 64, sw: 10, liftF: 4, footF: 8, footN: 1, cape: 0.3 }],
  ],
  // Приём (заклинание, бросок): меч вскинут вертикально, потом остриём на цель — рука во всю длину, свет на острие.
  power: [
    [0, { n1: 170, n2: -20, sw: -50, lean: -2 }],
    [1, { x: -2, lean: -6, head: -6, n1: 225, n2: -82, sw: -92, f1: 80, f2: 60, glow: 0.3, cape: 0.2 }],
    [2, { x: -2, lean: -6, head: -6, n1: 228, n2: -86, sw: -94, f1: 80, f2: 60, glow: 0.6, cape: 0.25 }],
    [3, { x: 4, lean: 6, head: 2, n1: 318, n2: -30, sw: -18, f1: 84, f2: 66, glow: 0.8, footF: 4, liftF: 2, cape: 0.5 }],
    [4, { x: 6, lean: 8, head: 4, n1: 350, n2: -4, sw: -4, f1: 86, f2: 70, glow: 1, footF: 6, cape: 0.6 }],
    [5, { x: 6, lean: 8, head: 4, n1: 352, n2: -2, sw: -2, f1: 86, f2: 70, glow: 0.6, footF: 6, cape: 0.5 }],
    [6, { x: 3, lean: 5, head: 3, n1: 420, n2: 30, sw: 12, glow: 0.2, footF: 3 }],
  ],
  // Лечение A «Второе дыхание»: передняя нога шагает назад, задняя — вперёд: встал прямо, стопы под тазом; меч остриём
  // вниз вонзён в землю перед собой, кисть на рукояти, щит опущен; голова склонилась — выдох, поднялась — вдох;
  // вынул меч и шагнул обратно в стойку. 12 кадров — на два шага туда и обратно.
  heal: [
    [0, { x: 0, lean: 2, head: 2, nh: 1, hx: 50, hy: 58, sw: 60, liftF: 3, footF: -4, cape: 0.05 }],
    [1, { x: -2, crouch: -1, lean: 0, head: 6, hx: 64, hy: 58, sw: 84, f1: 88, f2: 88, sh: 2, liftF: 4, footF: -12, liftN: 3, footN: 6 }],
    [2, { x: -2, crouch: -4, lean: -1, head: 10, hx: 68, hy: 67, sw: 84, f1: 92, f2: 92, sh: 0, liftF: 0, footF: -18, liftN: 3, footN: 16, dust: 0.35 }],
    [3, { x: -2, crouch: -5, lean: 0, head: 14, hx: 68, hy: 69, sw: 84, f1: 92, f2: 92, footF: -18, liftN: 0, footN: 20, dust: 0.15 }],
    [5, { x: -2, crouch: -5, lean: 0, head: 14, hx: 68, hy: 69, sw: 84, footF: -18, footN: 20, dust: 0 }],
    [6, { x: -2, y: -1, crouch: -6, lean: -4, head: -6, hx: 69, hy: 70, sw: 85, f1: 90, f2: 88, footF: -18, footN: 20 }],
    [7, { x: -2, y: -1, crouch: -6, lean: -4, head: -8, hx: 69, hy: 70, sw: 85, footF: -18, footN: 20 }],
    [8, { x: -2, crouch: -6, lean: -2, head: -2, hx: 68, hy: 69, sw: 84, footF: -18, footN: 20 }],
    [9, { x: -1, crouch: -3, lean: 0, head: 0, hx: 62, hy: 58, sw: 76, footF: -18, liftN: 3, footN: 10 }],
    [10, { x: 0, crouch: 1, lean: 1, nh: 1, hx: 48, hy: 64, sw: 50, liftF: 4, footF: -8, liftN: 1, footN: 2 }],
  ],
  // Лечение B «На колено»: опустился на заднее колено, меч остриём в землю перед передним коленом, голова склонена;
  // встаёт. Дольше A: 12 кадров.
  heal_kneel: [
    [0, { x: 2, crouch: 6, lean: 4, head: 4, nh: 1, hx: 56, hy: 58, sw: 70, kneel: 0.2 }],
    [1, { x: 3, crouch: 16, lean: 3, head: 8, hx: 68, hy: 48, sw: 82, f1: 88, f2: 84, sh: 4, shy: -6, kneel: 0.6 }],
    [2, { x: 4, crouch: 24, lean: 2, head: 14, hx: 70, hy: 42, sw: 83, f1: 92, f2: 88, sh: 0, shy: -12, kneel: 1, dust: 0.35 }],
    [3, { x: 4, crouch: 25, lean: 3, head: 16, hx: 70, hy: 41, sw: 83, f1: 92, f2: 88, shy: -12, kneel: 1, dust: 0.1 }],
    [7, { x: 4, crouch: 24, lean: 2, head: 14, hx: 70, hy: 42, sw: 83, f1: 92, f2: 88, shy: -12, kneel: 1, dust: 0 }],
    [8, { x: 4, crouch: 23, lean: 0, head: 4, hx: 70, hy: 43, sw: 83, f1: 90, f2: 86, shy: -12, kneel: 1 }],
    [9, { x: 3, crouch: 14, lean: 2, head: 4, hx: 60, hy: 52, sw: 70, f1: 86, f2: 80, shy: -6, kneel: 0.5 }],
    [10, { x: 1, crouch: 5, lean: 2, head: 2, nh: 1, hx: 44, hy: 66, sw: 40, kneel: 0.1 }],
  ],
  // Клич: меч к небу, щит в сторону, грудь вперёд, шлем запрокинут — рёв рисует слой эффектов (cry.ts).
  buff: [
    [0, { lean: -2, head: -2, n1: 175, n2: -30, sw: -60 }],
    [1, { x: -2, crouch: 3, lean: -10, head: -12, n1: 238, n2: -84, sw: -92, f1: 15, f2: 5, sh: -10, cape: 0.4 }],
    [2, { x: -2, crouch: 3, lean: -14, head: -18, n1: 250, n2: -90, sw: -95, f1: 5, f2: -5, sh: -16, cape: 0.7, glow: 0.6 }],
    [5, { x: -2, crouch: 3, lean: -14, head: -18, n1: 252, n2: -91, sw: -96, f1: 5, f2: -5, sh: -16, cape: 1, glow: 1 }],
    [7, { x: -1, crouch: 2, lean: -8, head: -10, n1: 236, n2: -80, sw: -88, f1: 30, f2: 15, sh: -6, cape: 0.6, glow: 0.4 }],
    [8, { lean: -2, head: -2, n1: 175, n2: -20, sw: -40, cape: 0.3 }],
  ],
  // Блок: щит к лицу, присел и спрятал голову; в кадре контакта — толчок назад и искры о кромку.
  block: [
    [0, { crouch: 2, lean: 3, head: 8, f1: 0, f2: -45, sh: -6, shy: -6, spark: 0 }],
    [1, { crouch: 4, lean: 2, head: 12, f1: -25, f2: -75, sh: -10, shy: -12, n1: 140, n2: 70, sw: 18, spark: 0 }],
    [2, { x: -4, crouch: 5, lean: -2, head: 14, f1: -22, f2: -72, sh: -14, shy: -12, n1: 145, n2: 74, sw: 20, spark: 1 }],
    [3, { x: -3, crouch: 4, lean: 0, head: 12, f1: -23, f2: -73, sh: -11, shy: -12, n1: 142, n2: 72, sw: 19, spark: 0.4 }],
    [4, { x: -1, crouch: 2, lean: 2, head: 6, f1: 20, f2: -20, sh: -4, shy: -4, spark: 0 }],
  ],
  // Урон: отбросило назад, шлем запрокинут, руки разлетелись; вспышку добавляет движок.
  hurt: [
    [0, { x: -7, crouch: 2, lean: -14, head: -20, n1: 155, n2: 95, sw: 5, f1: 85, f2: 75, sh: 18, cape: 0.6 }],
    [1, { x: -6, crouch: 2, lean: -12, head: -16, n1: 150, n2: 88, sw: 8, f1: 82, f2: 68, sh: 15, cape: 0.5 }],
    [2, { x: -3, crouch: 1, lean: -5, head: -7, n1: 140, n2: 72, sw: 15, f1: 68, f2: 45, sh: 8, cape: 0.3 }],
    [3, { x: -1, lean: -1, head: -1, cape: 0.1 }],
  ],
  // Смерть: отбросило, меч выскользнул, колени подломились, упал на спину — щит на груди, меч рядом.
  death: [
    [0, { x: -6, crouch: 2, lean: -14, head: -20, n1: 155, n2: 95, sw: 5, f1: 85, f2: 75, sh: 18, cape: 0.6 }],
    [1, { x: -8, crouch: 7, lean: -10, head: -12, n1: 140, n2: 100, drop: 0.12, cape: 0.5 }],
    [2, { x: -8, crouch: 15, lean: -2, head: 10, n1: 120, n2: 95, f1: 95, f2: 90, drop: 0.45, cape: 0.4, kneel: 0.6 }],
    [3, { x: -8, crouch: 22, lean: 4, head: 16, n1: 105, n2: 92, f1: 92, f2: 85, drop: 0.8, cape: 0.3, kneel: 1 }],
    [4, { x: -8, crouch: 24, lean: 0, head: 12, drop: 1, fall: 0.05, kneel: 1 }],
    [5, { fall: 0.25, head: -4 }],
    [6, { fall: 0.5, head: -10, f1: 88, f2: 86, sh: 4, kneel: 0 }],
    [7, { fall: 0.78, head: -14, cape: 0.1 }],
    [8, { fall: 1, head: -10 }],
    [9, { fall: 1.04, y: -2, head: -6 }],
    [10, { fall: 1, y: 0, head: -4, f1: 90, f2: 90, sh: 0, n1: 95, n2: 88, cape: 0 }],
  ],
  // Щитовой удар: щит к груди, отвёл корпус — и рывок вперёд кромкой щита, меч отведён назад.
  bash: [
    [0, { x: -1, crouch: 2, lean: -2, f1: 88, f2: 62, sh: 6, shx: -4, spark: 0 }],
    [1, { x: -4, crouch: 4, lean: -8, head: 4, f1: 100, f2: 80, sh: 10, shx: -8, n1: 150, n2: 125, sw: 140, cape: 0.3, spark: 0 }],
    [2, { x: -4, crouch: 4, lean: -8, head: 4, f1: 102, f2: 84, sh: 10, shx: -9, n1: 152, n2: 128, sw: 142, cape: 0.35, spark: 0 }],
    [3, { x: 8, crouch: 3, lean: 12, head: 10, f1: 25, f2: 5, sh: -6, shx: 4, n1: 150, n2: 122, sw: 138, footF: 8, liftF: 4, cape: 0.7, spark: 0 }],
    [4, { x: 16, crouch: 3, lean: 18, head: 12, f1: 2, f2: -5, sh: -12, shx: 9, n1: 148, n2: 118, sw: 134, footF: 16, footN: 6, cape: 1, spark: 1 }],
    [5, { x: 15, crouch: 3, lean: 16, head: 10, f1: 8, f2: -2, sh: -8, shx: 7, n1: 148, n2: 118, sw: 134, footF: 16, footN: 6, cape: 0.8, spark: 0.4 }],
    [6, { x: 7, crouch: 2, lean: 9, f1: 40, f2: 12, sh: -2, shx: 2, n1: 140, n2: 90, sw: 60, footF: 7, footN: 3, cape: 0.4, spark: 0 }],
  ],
  // Ответный удар: щит принял удар (искры), меч опущен назад-вниз за бедро; щит уходит в сторону — и снизу вверх:
  // кисть идёт вперёд и вверх, клинок проходит под кистью у самой земли и выходит острием вверх в кадр контакта.
  riposte: [
    [0, { crouch: 3, lean: 2, head: 10, f1: -15, f2: -65, sh: -8, shy: -10, nh: 1, hx: 24, hy: 70, sw: 120, spark: 0 }],
    [1, { x: -3, crouch: 5, lean: -2, head: 12, f1: -24, f2: -74, sh: -14, shy: -12, hx: 14, hy: 74, sw: 150, footF: -2, footN: -2, spark: 1 }],
    [2, { x: -2, crouch: 6, lean: 0, head: 10, f1: 40, f2: 0, sh: -4, shy: -4, hx: 16, hy: 76, sw: 155, footF: -2, footN: -2, cape: 0.3, spark: 0 }],
    [3, { x: 5, crouch: 6, lean: 6, head: 6, f1: 76, f2: 50, sh: 6, shy: 0, hx: 50, hy: 72, sw: 30, liftF: 4, footF: 6, footN: -2, cape: 0.6 }],
    [4, { x: 11, crouch: 6, lean: 8, head: 4, f1: 84, f2: 66, sh: 10, hx: 76, hy: 40, sw: -35, liftF: 0, footF: 10, footN: -1, cape: 1 }],
    [5, { x: 11, crouch: 5, lean: 6, head: 2, f1: 82, f2: 62, hx: 64, hy: 16, sw: -70, footF: 10, cape: 0.8 }],
    [6, { x: 5, crouch: 2, lean: 3, nh: 1, hx: 46, hy: 62, sw: 4, liftF: 3, footF: 5, cape: 0.4 }],
  ],
};

/**
 * Ближняя рука: углами `n1`/`n2` или кистью в точке (`hx`, `hy`, доля `nh`). Локоть — ik с изгибом наружу, как у
 * живой руки: слева от направления «плечо → кисть» (опущенная рука — локоть назад, поднятая — вперёд).
 */
function nearArm(P: WarriorPose): { ex: number; ey: number; hx: number; hy: number; a1: number; a2: number } {
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

/** Для инструментов (`tools/hero-proto/probe.mjs`): точки кадра в координатах поля — кисть, острие, стопы, таз. */
export const warriorProbe: { on?: (info: Record<string, number>) => void } = {};

/** Поза кадра: ключи клипа или покой. Покой прибавляется и в клипах — там фаза 0, первый кадр покоя. */
function framePose(p: Painter): WarriorPose {
  const c = clipAt(p);
  const P = c ? poseAt(REST, CLIPS[c.clip as Exclude<HeroClip, 'idle'>], c.f, c.n, HERO_CLIPS[c.clip].hold) : { ...REST };
  // Покой: меч и щит чуть качаются, плащ колышется, раз за цикл шлем поворачивается к врагам.
  P.sw += 1.5 * p.wave(1, 0.15);
  P.sh += 1 * p.wave(1, 0.55);
  P.cape += 0.04 * (1 - Math.cos(2 * Math.PI * p.t));
  P.head += 3 * p.blink(0.62, 0.16);
  return P;
}

/** Свечение на острие оружия: приём и клич. */
function tipGlow(p: Painter, x: number, y: number, a: number, length: number, glow: number): void {
  if (glow <= 0.02) return;
  const [gx, gy] = at(x, y, a, length - 2);
  p.glow(gx, gy, 6 + 9 * glow, '#ffd8b0', 0.3 + 0.35 * glow);
  if (glow > 0.5) p.px(gx, gy, '#fff4e0');
}

function warriorBase(look: WarriorLookId, weapon: WeaponKind, helmKind?: HelmKind): Model {
  const L = helmKind ? { ...WARRIOR_LOOKS[look], helmKind } : WARRIOR_LOOKS[look];
  const plate = look !== 'C';
  const lit = L.trim?.lit ?? EDGE;
  const dim = L.trim?.dark ?? '#3a3236';
  /** Жёсткие части — у C поверх кольчуги стальные наплечники, налокотники и наколенники, как у шлема. */
  const hard = plate ? L.limb : L.helm;
  /** Голени и башмаки — у C кожаные сапоги. */
  const boot = plate ? L.limb : L.leather;
  return {
    id: `warrior_${look}_${weapon}_${L.helmKind}`,
    w: 128,
    h: 136,
    ground: G,
    // Поле под клипы: выпад с мечом к врагам, меч над шлемом, лежащее тело головой назад.
    pad: 80,
    draw(p: Painter) {
      const P = framePose(p);
      // Дыхание: два вдоха за цикл — верх на пиксель вверх.
      const breath = p.bob(2, 2);
      const turn = p.blink(0.62, 0.16);
      const fall = ease(Math.max(0, Math.min(1, P.fall)));
      const bounce = P.fall > 1 ? (P.fall - 1) * 50 : 0;
      // Таз: присед опускает, падение кладёт на спину головой назад (от врагов).
      const hipX = lerp(PELVIS[0], PELVIS[0] - 6, fall);
      const hipY = lerp(PELVIS[1] + P.crouch, G - 16, fall) - bounce;
      const rot = lerp(HUNCH + P.lean * DEG, -Math.PI / 2, fall);
      const up = { dx: hipX - PELVIS[0], dy: hipY - PELVIS[1] - breath * (1 - fall), rot, px: PELVIS[0], py: PELVIS[1] };
      const probeInfo: Record<string, number> = {};
      /** Точка верха (координаты стойки) в кадре — для выпавшего меча и острия. */
      const toWorld = (x: number, y: number): [number, number] => {
        const c = Math.cos(rot), s = Math.sin(rot);
        return [PELVIS[0] + c * (x - PELVIS[0]) - s * (y - PELVIS[1]) + up.dx, PELVIS[1] + s * (x - PELVIS[0]) + c * (y - PELVIS[1]) + up.dy];
      };

      p.pose({ dx: P.x, dy: P.y }, () => {
        // Тень — между стопами и тазом: стопы стоят, таз уходит вперёд или назад.
        p.shadow(62 - 10 * fall - P.x * 0.5 * (1 - fall), 48 + 16 * fall, 4);

        // Плащ, упавший под тело, — на земле.
        if (fall > 0.55 && L.cape > 0) p.poly([hipX - 78, G - 5, hipX - 34, G - 7, hipX + 2, G - 4, hipX + 4, G, hipX - 82, G], L.cloth, { part: 'capeGround', tone: -0.18 });

        // ── Плащ (B) — за спиной, в кадре верха; на замахе и выпаде взвивается назад, при падении уходит под тело. ──
        if (L.cape > 0 && fall < 0.6) {
          p.pose(up, () => {
            const fl = P.cape, keep = 1 - fall / 0.6;
            const pts = [54, 30, 42, 34, 30, 46, 22, 74, 17, 104, 12, 127, 20, 121, 26, 129, 31, 117, 37, 126, 41, 108, 46, 84, 50, 60];
            for (let k = 0; k < pts.length; k += 2) {
              const t = Math.max(0, (pts[k + 1] - 30) / 99);
              pts[k + 1] = 30 + (pts[k + 1] - 30) * keep - fl * 34 * t * t;
              pts[k] = pts[k] - fl * 30 * t;
            }
            p.poly(pts, L.cloth, { part: 'cape', tone: -0.16, bevel: 3 });
          });
        }

        // ── Ноги: бедро от таза, колено — ik. Стопы стоят на земле: `x`/`y` двигают таз, а не стопы (шаг — `footF`/`footN`,
        //    подъём — `liftF`/`liftN`); нога не достаёт — пятка отрывается, носок на полу. `kneel` ставит ближнее колено
        //    на землю; при падении ноги вытягиваются к врагам. ──
        const legRot = lerp(0, -Math.PI / 2, fall);
        const legs = [
          { g: M.legF, L2: LEG_F, side: 'far', tone: -0.03, off: [11, 2], foot: P.footF, lift: P.liftF, kneel: 0, lie: [hipX + 46, G - 6], lieRot: -1.4, bend: [lerp(1, 0.2, fall), lerp(-0.2, -1, fall)] },
          { g: M.legN, L2: LEG_N, side: 'near', tone: 0, off: [-10, 2], foot: P.footN, lift: P.liftN, kneel: P.kneel, lie: [hipX + 40, G - 5], lieRot: 1.4, bend: [lerp(-1, 0.3, fall), lerp(-0.2, -1, fall)] },
        ] as const;
        for (const lg of legs) {
          const c = Math.cos(legRot), sn = Math.sin(legRot);
          const hx = hipX + c * lg.off[0] - sn * lg.off[1], hy = hipY + sn * lg.off[0] + c * lg.off[1];
          const out = lg.g.toe === 0 ? 1 : -1;
          // Стопа в координатах поля: сдвиг тела её не двигает (в этой позе поле сдвинуто на x, y — вычитаем).
          const floor = lg.g.ank[1] - P.y;
          let ax = lg.g.ank[0] + lg.foot - P.x, ay = floor - lg.lift;
          let bend: [number, number] = [lg.bend[0], lg.bend[1]];
          let toe = 0;
          if (lg.kneel > 0) {
            // Колено на земле чуть впереди бедра, голень назад-вверх, стопа на носке.
            ax = lerp(ax, hx + 6 - 23.5, lg.kneel);
            ay = lerp(ay, G - P.y - 17, lg.kneel);
            bend = [lerp(bend[0], 0.3, lg.kneel), lerp(bend[1], 1, lg.kneel)];
            toe += 0.5 * lg.kneel;
          }
          // Не достаёт — щиколотка поднимается (пятка отрывается), носок остаётся на полу.
          const reach = lg.L2.l1 + lg.L2.l2 - 0.2;
          const ddx = ax - hx;
          if (Math.hypot(ddx, ay - hy) > reach) {
            if (Math.abs(ddx) < reach) ay = hy + Math.sqrt(reach * reach - ddx * ddx);
            else {
              ax = hx + Math.sign(ddx) * reach;
              ay = hy;
            }
          }
          toe += Math.max(0, floor - ay) / 14;
          ax = lerp(ax, lg.lie[0], fall);
          ay = lerp(ay, lg.lie[1], fall);
          const toeRot = lerp(toe, lg.lieRot, fall);
          if (lg.side === 'far') probeInfo.footF = ax + P.x;
          else probeInfo.footN = ax + P.x;
          const [kx, ky] = ik(hx, hy, ax, ay, lg.L2.l1, lg.L2.l2, bend[0], bend[1]);
          const tone = lg.tone;
          const leg = `${lg.side}Leg`, knee = `${lg.side}Knee`, foot = `${lg.side}Foot`;
          p.limb(hx, hy, 8.5, kx, ky, 6.8, L.limb, { part: leg, tone });
          p.limb(kx, ky, 6.2, ax, ay, 5.2, boot, { part: leg, tone });
          if (plate) {
            // Стык набедренника посередине бедра и кромка поножи спереди (к врагам).
            const mx = (hx + kx) / 2, my = (hy + ky) / 2;
            stroke(p, [mx - 7, my + 1 * out, mx + 7, my - 1 * out], SEAM, leg);
            stroke(p, [kx + 4, ky + 5, ax + 3.5, ay - 3], EDGE, leg);
          }
          // Башмак в своих координатах от щиколотки: носок наружу, подошва на земле; при шаге носок клюёт вниз.
          p.pose({ rot: toeRot * out, px: ax, py: ay }, () => {
            const S = G - M.legF.ank[1] - 0.5;
            p.poly([ax - 5.5, ay - 2, ax + 5.5, ay - 2, ax + 17 * out, ay + S - 4, ax + 14 * out, ay + S, ax - 6 * out, ay + S], boot, { part: foot, tone: tone - 0.04, bevel: 2.5 });
            if (plate) {
              stroke(p, [ax - 5, ay + 3, ax + 5, ay + 3], SEAM, foot);
              stroke(p, [ax + 2 * out, ay + 7, ax + 9 * out, ay + S - 3], SEAM, foot);
              stroke(p, [ax - 5, ay - 1, ax + 5, ay - 1], lit, foot);
            }
          });
          // Наколенник — чаша с крылом наружу и кромкой.
          p.ellipse(kx, ky, 7.4, 6.6, hard, { part: knee, lift: 1.5, tone: tone + 0.04 });
          p.poly([kx - 1 * out, ky - 4, kx + 11 * out, ky - 1, kx + 9 * out, ky + 5, kx, ky + 4], hard, { part: knee, tone: tone - 0.02, bevel: 2 });
          arcStroke(p, kx, ky, 7, 6.2, 25, 155, lg.side === 'far' ? dim : lit, knee);
        }

        // ── Верх: наклон вокруг таза, присед, дыхание; при падении — на спину. ──
        const near = nearArm(P);
        const far = limb2(M.armF.sh[0], M.armF.sh[1], P.f1, ARM_F.l1, P.f2, ARM_F.l2);
        p.pose(up, () => {
          // Дальняя рука — за туловищем, кулак за щитом.
          p.limb(M.armF.sh[0], M.armF.sh[1], 7, far.ex, far.ey, 6, L.limb, { part: 'farArm', tone: -0.16 });
          p.limb(far.ex, far.ey, 6, far.hx, far.hy, 5, plate ? L.limb : L.leather, { part: 'farArm', tone: -0.16 });

          // Туловище: таз, живот и кираса — одна часть; под кирасой — два ряда пластин живота.
          p.ellipse(60, 70, 17, 8, L.chest, { part: 'torso', tone: -0.06 });
          p.ellipse(61, 59, 17, 11, L.chest, { part: 'torso' });
          p.ellipse(59, 46, 22, 16, L.chest, { part: 'torso', lift: 1.5 });
          if (plate) {
            arcStroke(p, 60, 44, 19, 12, 25, 155, SEAM, 'torso');
            arcStroke(p, 60, 48, 18, 11, 30, 150, SEAM, 'torso');
            arcStroke(p, 60, 43, 19, 12, 30, 150, lit, 'torso');
            stroke(p, [44, 38, 42, 50], EDGE, 'torso');
          } else {
            p.ellipse(60, 32, 16, 5, L.limb, { part: 'torso', paint: true });
            p.poly([40, 64, 58, 66, 56, 90, 38, 86], L.limb, { part: 'mailN', bevel: 2 });
            p.poly([66, 66, 82, 64, 84, 84, 70, 90], L.limb, { part: 'mailF', bevel: 2, tone: -0.08 });
          }
          // Пояс с круглой пряжкой.
          p.poly([44, 62, 79, 61, 80, 66, 44, 67], L.leather, { part: 'belt', bevel: 1.5 });
          p.ellipse(66, 64.5, 3.6, 3.6, L.trim?.mat ?? IRON, { part: 'buckle', lift: 1 });
          stroke(p, [65, 64, 66, 64], '#1a120c', 'buckle');
          if (plate) {
            // Набедренные пластины — выпуклые лепестки в два ряда поверх бёдер.
            p.ellipse(47, 72, 11, 6.5, L.limb, { part: 'tassetN', rot: 0.35, lift: 1 });
            p.ellipse(44, 79, 10, 5.5, L.limb, { part: 'tassetN', rot: 0.5 });
            arcStroke(p, 47, 72, 10, 5.8, 20, 160, SEAM, 'tassetN');
            arcStroke(p, 44, 79, 9.4, 5, 30, 160, lit, 'tassetN');
            p.ellipse(77, 72, 9, 6, L.limb, { part: 'tassetF', rot: -0.3, tone: -0.08 });
            arcStroke(p, 77, 72, 8.4, 5.4, 20, 160, dim, 'tassetF');
          }
          // Табард со складками и рваным подолом; на выпаде подол относит назад.
          const tf = P.cape * 6;
          p.poly([55, 66, 71, 66, 73 - tf * 0.3, 82, 71 - tf, 102, 67 - tf, 95, 63 - tf * 1.2, 110 - tf * 0.5, 59 - tf, 97, 56 - tf * 0.3, 84], L.cloth, { part: 'tabard', bevel: 2.5 });
          stroke(p, [61, 70, 60 - tf * 0.8, 96], '#420c16', 'tabard');
          stroke(p, [67, 70, 68 - tf * 0.8, 92], '#561420', 'tabard');

          // Шарф лежит на ближнем наплечнике, обвивает шею под шлемом и широким концом свисает по груди до пояса.
          if (plate) {
            p.poly([30, 30, 48, 25, 70, 27, 86, 31, 84, 40, 75, 50, 71, 63, 62, 65, 52, 57, 42, 47, 33, 40], L.cloth, { part: 'scarf', bevel: 4 });
            p.ellipse(47, 32, 11, 8, L.cloth, { part: 'scarf', lift: 1 });
            p.poly([50, 50, 66, 46, 71, 60, 64, 65, 56, 58], L.cloth, { part: 'scarf', paint: true, tone: -0.1 });
            stroke(p, [44, 38, 58, 56], '#420c16', 'scarf');
            stroke(p, [56, 40, 64, 58], '#420c16', 'scarf');
            stroke(p, [72, 36, 78, 42], '#561420', 'scarf');
          }

          // Дальний наплечник — за шлемом и щитом, темнее.
          p.ellipse(82, look === 'B' ? 38 : 36, look === 'B' ? 9.5 : 11, look === 'B' ? 8.5 : 10, hard, { part: 'farPauldron', tone: look === 'B' ? -0.2 : -0.12 });
          arcStroke(p, 82, 37, 10, 8, 30, 150, dim, 'farPauldron');

          // Голова на шее: раз за цикл поворачивается, в клипах — запрокидывается и склоняется.
          p.pose({ rot: (0.05 * turn) + P.head * DEG, px: M.neck[0], py: M.neck[1] }, () => {
            const angular = ANGULAR_HELMS.includes(L.helmKind);
            const hs = angular ? HELM_ANGULAR_SCALE : 1.36;
            p.scope(hs, M.helm[0] + (angular ? -4 : 0), M.helm[1] + (angular ? 14 * (1.36 - hs) : 0), () => helm(p, L));
          });

          // Щит — перед туловищем, от кисти дальней руки; в покое — ровно на мерке.
          const cx = far.hx + (M.armF.shield[0] - M.armF.hand[0]) + P.shx, cy = far.hy + (M.armF.shield[1] - M.armF.hand[1]) + P.shy;
          p.pose({ rot: P.sh * DEG, px: cx, py: cy }, () => {
            p.scope(1.62, cx, cy, () => {
              shield(p, L);
              // Искры о кромку щита со стороны врагов.
              if (P.spark > 0.05) {
                const n = Math.round(7 * P.spark);
                for (let k = 0; k < n; k++) {
                  const [x, y] = at(10, -6, -80 + k * 26, 3 + 5 * P.spark + (k % 2) * 2.5);
                  p.px(x, y, k % 2 ? '#ffd890' : '#fff6d8');
                }
                p.glow(10, -6, 5 * P.spark, '#ffc870', 0.5);
              }
            });
          });

          // Ближняя рука с оружием — поверх туловища; оружие выпадает из руки при смерти.
          if (P.drop < 0.05) {
            WEAPONS[weapon](p, near.hx, near.hy, P.sw, L);
            tipGlow(p, near.hx, near.hy, P.sw, WEAPON_LEN[weapon], P.glow);
          }
          p.limb(M.armN.sh[0], M.armN.sh[1], 8, near.ex, near.ey, 7, L.limb, { part: 'nearArm' });
          p.limb(near.ex, near.ey, 6.6, near.hx, near.hy, 5.6, plate ? L.limb : L.leather, { part: 'nearArm' });
          if (plate) {
            const [ex, ey] = at(near.ex, near.ey, near.a2, 6), [hx2, hy2] = at(near.hx, near.hy, near.a2, -6);
            stroke(p, [ex + 3, ey + 1, hx2 + 3, hy2 + 1], EDGE, 'nearArm');
          }
          // Налокотник с крылом — крыло смотрит наружу от сгиба (против биссектрисы плеча и предплечья).
          let ox = -(Math.cos((near.a1 + 180) * DEG) + Math.cos(near.a2 * DEG)), oy = -(Math.sin((near.a1 + 180) * DEG) + Math.sin(near.a2 * DEG));
          const ol = Math.hypot(ox, oy);
          if (ol < 0.2) [ox, oy] = [Math.cos((near.a1 + 90) * DEG), Math.sin((near.a1 + 90) * DEG)];
          else [ox, oy] = [ox / ol, oy / ol];
          const [wx, wy] = [near.ex + ox * 9, near.ey + oy * 9];
          p.ellipse(near.ex, near.ey, 8, 7.4, hard, { part: 'elbow', lift: 1.4 });
          p.poly([near.ex - oy * 5, near.ey + ox * 5, wx - oy * 3.5, wy + ox * 3.5, wx + oy * 3.5, wy - ox * 3.5, near.ex + oy * 4, near.ey - ox * 4], hard, { part: 'elbow', bevel: 2 });
          arcStroke(p, near.ex, near.ey, 7.4, 6.8, 200, 330, lit, 'elbow');
          // Раструб латной перчатки и кулак.
          const [cfx, cfy] = at(near.hx, near.hy, near.a2, -3.5);
          p.ellipse(cfx, cfy, 6.8, 5, hard, { part: 'cuff', rot: (near.a2 + 90) * DEG, tone: 0.02 });
          p.ellipse(near.hx, near.hy, 6, 5.6, hard, { part: 'fist', tone: -0.04 });
          stroke(p, [near.hx - 3, near.hy - 1, near.hx + 3, near.hy + 2], SEAM, 'fist');
          // Ближний наплечник — купол и нижний ряд пластин одной частью, стыки и кромка.
          const pb = look === 'B' ? 0.78 : 1;
          p.ellipse(35, 42, 15.5 * pb, 12.5 * pb, hard, { part: 'pauldron', lift: 1.5, flat: 0.2 });
          p.ellipse(31, 42 + 9 * pb, 12 * pb, 6 * pb, hard, { part: 'pauldron', flat: 0.3 });
          arcStroke(p, 34, 43, 14 * pb, 10.5 * pb, 30, 165, SEAM, 'pauldron');
          arcStroke(p, 35, 42, 14.8 * pb, 11.8 * pb, 35, 160, lit, 'pauldron');
          arcStroke(p, 31, 42 + 9 * pb, 11 * pb, 5.4 * pb, 30, 160, dim, 'pauldron');
        });

        // Выпавшее оружие: соскальзывает из руки и ложится на землю перед телом.
        if (P.drop >= 0.05) {
          const k = ease(Math.min(1, P.drop));
          const [hx0, hy0] = toWorld(near.hx, near.hy);
          const x = lerp(hx0, 26, k), y = lerp(hy0, G - 3.5, k * k);
          const a = lerp(P.sw + (rot * 180) / Math.PI, 3, k);
          WEAPONS[weapon](p, x, y, a, L);
        }
        // Острие в координатах кадра: пыль сильного удара встаёт там, где клинок у земли.
        const [tipX, tipY] = toWorld(...at(near.hx, near.hy, P.sw, WEAPON_LEN[weapon]));
        if (P.dust > 0.05) {
          const dx0 = Math.min(tipX, 150);
          for (let k = 0; k < 9; k++) {
            const r = (2 + 4 * P.dust) * (0.6 + ((k * 37) % 5) / 8);
            p.disc(dx0 + (k - 4) * 5 * P.dust, G - 2 - (k % 3) * 3 * P.dust - (k % 2) * 2, r * 0.5, k % 2 ? '#7a6c58c0' : '#9a8a70c0', true);
          }
        }
        if (warriorProbe.on) {
          const [hwx, hwy] = toWorld(near.hx, near.hy);
          warriorProbe.on({ ...probeInfo, hipX: hipX + P.x, hipY: hipY + P.y, handX: hwx + P.x, handY: hwy + P.y, tipX: tipX + P.x, tipY: tipY + P.y, ground: G });
        }
      });
    },
  };
}

/** Воин облика `look` с оружием `weapon`; рост в покое — `HERO_BODY_HEIGHT.warrior` (128). */
export function warriorModel(look: WarriorLookId, weapon: WeaponKind = 'sword', helmKind?: HelmKind): Model {
  return warriorBase(look, weapon, helmKind);
}
