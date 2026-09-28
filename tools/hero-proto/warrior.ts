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

const DEG = Math.PI / 180;

/** Точка на расстоянии `len` от (x, y) под углом `a` градусов: 0 — вперёд (к врагам), 90 — вниз, 180 — назад, 270 — вверх. */
function at(x: number, y: number, a: number, len: number): [number, number] {
  return [x + len * Math.cos(a * DEG), y + len * Math.sin(a * DEG)];
}

// ─── Облики ─────────────────────────────────────────────────────────────────

export type WarriorLookId = 'A' | 'B' | 'C';
export type WeaponKind = 'sword' | 'axe' | 'mace';

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
  /** Кромка лат: светлый и тёмный тон линии (латунь у A); null — без кромки. */
  trim: { lit: string; dark: string; mat: Mat } | null;
  cloth: Mat;
  leather: Mat;
  /** Длина плаща 0..1: у A — нет (только шарф), у B — длинный рваный плащ. */
  cape: number;
  helmKind: 'great' | 'tslit' | 'nasal';
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
    helm: { base: '#4a4348', ramp: ['#131016', '#2c262d', '#4b434a', '#7a7076', '#b8acaa'], shine: 1, dither: 0.3, tex: { kind: 'spots', scale: 2.2, amp: 0.2, density: 0.14 } },
    joint: { base: '#1a1518', dither: 0 },
    trim: null,
    cloth: { base: '#6a161d', ramp: ['#22060a', '#420d13', '#68161d', '#8a2228', '#a83a34'], shag: 0.26, tex: { kind: 'stripes', scale: 2.2, amp: 0.16, angle: 1.5 } },
    leather: { base: '#2e2118' },
    cape: 1,
    helmKind: 'tslit',
    shieldKind: 'heater',
    shieldFace: { base: '#2c262a', ramp: ['#100c0f', '#1c171b', '#2b2529', '#3f373c', '#5a5055'], tex: { kind: 'noise', scale: 2, amp: 0.16 } },
    shieldRim: { base: '#4a4446', ramp: ['#161315', '#2a2527', '#484244', '#6e676a', '#9c9496'], shine: 0.5, dither: 0 },
    emblem: { base: '#6a161d', ramp: ['#22060a', '#420d13', '#68161d', '#7e1e24', '#943028'], dither: 0 },
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
  const n: [number, number] = [-Math.sin(a * DEG), Math.cos(a * DEG)];
  const [bx, by] = at(x, y, a, 5);
  const [tx, ty] = at(x, y, a, len);
  p.poly([bx + n[0] * w, by + n[1] * w, ...at(tx + n[0] * w * 0.85, ty + n[1] * w * 0.85, a, -10), tx, ty, ...at(tx - n[0] * w * 0.85, ty - n[1] * w * 0.85, a, -10), bx - n[0] * w, by - n[1] * w], BLADE, { part: 'blade', bevel: 1.6 });
  // Дол — тёмная черта по середине клинка.
  p.line(...at(bx, by, a, 4), ...at(bx, by, a, len - 24), '#626872');
  const hilt = L.trim?.mat ?? IRON;
  p.limb(bx - n[0] * 7, by - n[1] * 7, 1.6, bx + n[0] * 7, by + n[1] * 7, 1.6, hilt, { part: 'guard' });
  p.limb(x, y, 1.8, ...at(x, y, a, -8), 1.6, L.leather, { part: 'grip' });
  p.ellipse(...at(x, y, a, -9.5), 2.6, 2.6, hilt, { part: 'pommel' });
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
function helm(p: Painter, L: WarriorLook): void {
  const M = L.helm;
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
    p.ellipse(0, -2.5, 11, 11.5, M, { part: 'helm' });
    p.poly([-6, -12.5, 2, -15.5, 8, -10, 2, -12.5], M, { part: 'helm', bevel: 1 });
  } else {
    p.ellipse(0, -2, 11, 11, M, { part: 'helm' });
  }
  p.poly([-11, -2, 11, -3, 12, 11, 3, 13, -9, 12], M, { part: 'helm', bevel: 4 });
  // Лицо шлема: пластина вперёд, её верх — ребро над прорезью.
  p.poly([3, -6, 12, -5, 13, 11, 4, 13], M, { part: 'helm', lift: 1.2, bevel: 2.5, tone: -0.02 });
  // Прорезь — чёрная черта поперёк лица, продолжается на висок.
  p.poly([-2, -1.4, 13, -1.8, 13, 0.8, -2, 0.8], { base: SLIT, dither: 0 }, { part: 'helm', paint: true });
  if (L.helmKind === 'tslit') {
    p.poly([6.5, 0, 9.5, 0, 9, 9, 7, 9], { base: SLIT, dither: 0 }, { part: 'helm', paint: true });
    // Вмятины и сколы.
    p.line(-5, -9, -3, -8, '#16121a');
    p.line(-8, 5, -6, 9, '#1e1a20');
    p.px(10, 5, '#16121a');
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
    p.poly(P([-11, -13, 11, -13, 11.5, 2, 6.5, 13, 0, 19, -6.5, 13, -11.5, 2]), R, { part: 'shield', bevel: 3, flat: 0.5 });
    p.poly(P([-9, -11, 9, -11, 9.5, 1.5, 5.3, 11.5, 0, 16.5, -5.3, 11.5, -9.5, 1.5]), F, { part: 'shield', paint: true });
    if (L.emblem) p.poly(P([-12, -14, -5, -14, 12, 6, 12, 14]), L.emblem, { part: 'shield', paint: true });
    p.line(...seg([-10, -2, -7, 0]), '#0e0b0e');
    p.line(...seg([7, -11, 9, -7]), '#0e0b0e');
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
const EDGE = '#b6aaa6';

function warriorBase(look: WarriorLookId, weapon: WeaponKind): Model {
  const L = WARRIOR_LOOKS[look];
  const plate = look !== 'C';
  const lit = L.trim?.lit ?? EDGE;
  const dim = L.trim?.dark ?? '#3a3236';
  /** Жёсткие части — у C поверх кольчуги стальные наплечники, налокотники и наколенники, как у шлема. */
  const hard = plate ? L.limb : L.helm;
  /** Голени и башмаки — у C кожаные сапоги. */
  const boot = plate ? L.limb : L.leather;
  return {
    id: `warrior_${look}_${weapon}`,
    w: 128,
    h: 136,
    ground: G,
    pad: 40,
    draw(p: Painter) {
      // Покой: два вдоха за цикл — плечи и голова на пиксель вверх; раз за цикл шлем поворачивается к врагам.
      const breath = p.bob(2, 2);
      const turn = p.blink(0.62, 0.16);

      p.shadow(62, 48, 4);

      // ── Плащ (B) — за спиной, до земли, рваный. ──
      if (L.cape > 0) p.poly([54, 30, 42, 34, 30, 46, 22, 74, 17, 104, 12, 127, 20, 121, 26, 129, 31, 117, 37, 126, 41, 108, 46, 84, 50, 60], L.cloth, { part: 'cape', tone: -0.16, bevel: 3 });

      // ── Ноги: набедренник, наколенник с крылом, поножи, латный башмак из пластин. Дальняя — темнее и раньше. ──
      for (const [g, side, tone] of [[M.legF, 'far', -0.03], [M.legN, 'near', 0]] as const) {
        const [hx, hy] = g.hip, [kx, ky] = g.knee, [ax, ay] = g.ank;
        const out = g.toe === 0 ? 1 : -1;
        const leg = `${side}Leg`, knee = `${side}Knee`, foot = `${side}Foot`;
        p.limb(hx, hy, 8.5, kx, ky, 6.8, L.limb, { part: leg, tone });
        p.limb(kx, ky, 6.2, ax, ay, 5.2, boot, { part: leg, tone });
        if (plate) {
          // Стык набедренника посередине бедра и кромка поножи спереди (к врагам).
          const mx = (hx + kx) / 2, my = (hy + ky) / 2;
          stroke(p, [mx - 7, my + 1 * out, mx + 7, my - 1 * out], SEAM, leg);
          stroke(p, [kx + 4, ky + 5, ax + 3.5, ay - 3], EDGE, leg);
        }
        // Башмак: пятка у щиколотки, носок наружу; пластины поперёк.
        const [fx] = at(ax, ay, g.toe, 14);
        p.poly([ax - 5.5, ay - 2, ax + 5.5, ay - 2, fx + 3 * out, G - 3.5, fx, G, ax - 6 * out, G], boot, { part: foot, tone: tone - 0.04, bevel: 2.5 });
        if (plate) {
          stroke(p, [ax - 5, ay + 3, ax + 5, ay + 3], SEAM, foot);
          stroke(p, [ax + 2 * out, ay + 7, ax + 9 * out, G - 3], SEAM, foot);
          stroke(p, [ax - 5, ay - 1, ax + 5, ay - 1], lit, foot);
        }
        // Наколенник — чаша с крылом наружу и кромкой.
        p.ellipse(kx, ky, 7.4, 6.6, hard, { part: knee, lift: 1.5, tone: tone + 0.04 });
        p.poly([kx - 1 * out, ky - 4, kx + 11 * out, ky - 1, kx + 9 * out, ky + 5, kx, ky + 4], hard, { part: knee, tone: tone - 0.02, bevel: 2 });
        arcStroke(p, kx, ky, 7, 6.2, 25, 155, side === 'far' ? dim : lit, knee);
      }

      // ── Верх: дышит — поднимается на пиксель. ──
      p.pose({ dy: -breath, rot: HUNCH, px: 60, py: 74 }, () => {
        // Дальняя рука — за туловищем, кулак за щитом.
        const F = M.armF;
        p.limb(F.sh[0], F.sh[1], 7, F.el[0], F.el[1], 6, L.limb, { part: 'farArm', tone: -0.16 });
        p.limb(F.el[0], F.el[1], 6, F.hand[0], F.hand[1], 5, plate ? L.limb : L.leather, { part: 'farArm', tone: -0.16 });

        // Туловище: таз, живот и кираса — одна часть; под кирасой — два ряда пластин живота.
        p.ellipse(60, 70, 17, 8, L.chest, { part: 'torso', tone: -0.06 });
        p.ellipse(61, 59, 17, 11, L.chest, { part: 'torso' });
        p.ellipse(59, 46, 22, 16, L.chest, { part: 'torso', lift: 1.5 });
        if (plate) {
          arcStroke(p, 60, 44, 19, 12, 25, 155, SEAM, 'torso');
          arcStroke(p, 60, 48, 18, 11, 30, 150, SEAM, 'torso');
          arcStroke(p, 60, 43, 19, 12, 30, 150, lit, 'torso');
          // Ребро кирасы и блик на груди слева от шарфа.
          stroke(p, [44, 38, 42, 50], EDGE, 'torso');
        } else {
          // Кольчуга видна у ворота; полы хауберка — двумя клиньями по бёдрам, разрез спереди.
          p.ellipse(60, 32, 16, 5, L.limb, { part: 'torso', paint: true });
          p.poly([40, 64, 58, 66, 56, 90, 38, 86], L.limb, { part: 'mailN', bevel: 2 });
          p.poly([66, 66, 82, 64, 84, 84, 70, 90], L.limb, { part: 'mailF', bevel: 2, tone: -0.08 });
        }
        // Пояс с круглой пряжкой.
        p.poly([44, 62, 79, 61, 80, 66, 44, 67], L.leather, { part: 'belt', bevel: 1.5 });
        p.ellipse(66, 64.5, 3.6, 3.6, L.trim?.mat ?? IRON, { part: 'buckle', lift: 1 });
        stroke(p, [65, 64, 66, 64], '#1a120c', 'buckle');
        // Набедренные пластины — в два ряда, с кромкой.
        if (plate) {
          // Набедренные пластины — выпуклые лепестки в два ряда поверх бёдер.
          p.ellipse(47, 72, 11, 6.5, L.limb, { part: 'tassetN', rot: 0.35, lift: 1 });
          p.ellipse(44, 79, 10, 5.5, L.limb, { part: 'tassetN', rot: 0.5 });
          arcStroke(p, 47, 72, 10, 5.8, 20, 160, SEAM, 'tassetN');
          arcStroke(p, 44, 79, 9.4, 5, 30, 160, lit, 'tassetN');
          p.ellipse(77, 72, 9, 6, L.limb, { part: 'tassetF', rot: -0.3, tone: -0.08 });
          arcStroke(p, 77, 72, 8.4, 5.4, 20, 160, dim, 'tassetF');
        }
        // Табард со складками и рваным подолом.
        p.poly([55, 66, 71, 66, 73, 82, 71, 102, 67, 95, 63, 110, 59, 97, 56, 84], L.cloth, { part: 'tabard', bevel: 2.5 });
        stroke(p, [61, 70, 60, 96], '#420c16', 'tabard');
        stroke(p, [67, 70, 68, 92], '#561420', 'tabard');

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
        p.ellipse(82, 36, 11, 10, hard, { part: 'farPauldron', tone: -0.12 });
        arcStroke(p, 82, 37, 10, 8, 30, 150, dim, 'farPauldron');

        // Голова — низко между плечами, к врагам; раз за цикл чуть поворачивается.
        p.pose({ rot: 0.05 * turn, px: M.neck[0], py: M.neck[1] }, () => {
          p.scope(1.36, M.helm[0], M.helm[1], () => helm(p, L));
        });

        // Щит — перед туловищем, в перспективе.
        p.scope(1.62, F.shield[0], F.shield[1], () => shield(p, L));

        // Ближняя рука с оружием — поверх туловища: наруч, налокотник с крылом, латная перчатка, наплечник.
        const N = M.armN;
        WEAPONS[weapon](p, N.hand[0], N.hand[1], N.sword + 1.5 * p.wave(1, 0.15), L);
        p.limb(N.sh[0], N.sh[1], 8, N.el[0], N.el[1], 7, L.limb, { part: 'nearArm' });
        p.limb(N.el[0], N.el[1], 6.6, N.hand[0], N.hand[1], 5.6, plate ? L.limb : L.leather, { part: 'nearArm' });
        if (plate) stroke(p, [N.el[0] + 5, N.el[1] + 4, N.hand[0] + 2, N.hand[1] - 6], EDGE, 'nearArm');
        p.ellipse(N.el[0], N.el[1], 8, 7.4, hard, { part: 'elbow', lift: 1.4 });
        p.poly([N.el[0] + 2, N.el[1] - 5, N.el[0] - 9, N.el[1] - 2, N.el[0] - 8, N.el[1] + 5, N.el[0], N.el[1] + 4], hard, { part: 'elbow', bevel: 2 });
        arcStroke(p, N.el[0], N.el[1], 7.4, 6.8, 200, 330, lit, 'elbow');
        // Раструб латной перчатки и кулак.
        p.ellipse(N.hand[0] - 2, N.hand[1] - 3, 6.8, 5, hard, { part: 'cuff', rot: 0.9, tone: 0.02 });
        p.ellipse(N.hand[0], N.hand[1], 6, 5.6, hard, { part: 'fist', tone: -0.04 });
        stroke(p, [N.hand[0] - 3, N.hand[1] - 1, N.hand[0] + 3, N.hand[1] + 2], SEAM, 'fist');
        // Ближний наплечник — самая широкая форма силуэта: купол и два ряда пластин одной частью, стыки и кромка.
        p.ellipse(34, 41, 15.5, 12.5, hard, { part: 'pauldron', lift: 1.5, flat: 0.2 });
        p.ellipse(29, 51, 12, 6, hard, { part: 'pauldron', flat: 0.3 });
        arcStroke(p, 33, 42, 14, 10.5, 30, 165, SEAM, 'pauldron');
        arcStroke(p, 34, 41, 14.8, 11.8, 35, 160, lit, 'pauldron');
        arcStroke(p, 29, 51, 11, 5.4, 30, 160, dim, 'pauldron');
      });
    },
  };
}

/** Воин облика `look` с оружием `weapon`; рост в покое — `HERO_BODY_HEIGHT.warrior` (128). */
export function warriorModel(look: WarriorLookId, weapon: WeaponKind = 'sword'): Model {
  return warriorBase(look, weapon);
}
