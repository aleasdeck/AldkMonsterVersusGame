import { type Mat, type Painter } from '../mobs/pixel';
import type { AvatarSpec } from './avatar';
import type { HeroModel, HeroProbe } from './model';
import { clipAt } from './clips';
import { at, DEG, ik, lerp, reachFoot, solid, stroke } from './rig';

/**
 * Берсерк пиксельной лепкой — шаги 2–3 рецепта (docs/lepka-geroev.md): модель в стойке и варианты на обсуждение.
 * В игру ещё не входит: записи в `HERO_MODELS` нет, инструменты находят модель по имени файла (`berserkModel()`),
 * страница обсуждения — tools/hero-proto/berserk-page.ts. Клипов пока нет — сначала модель (порядок пользователя).
 *
 * Референс — прежний рисованный лист `src/assets/heroes/berserk.png` (один ряд покоя, ячейка 194, фигура первого
 * кадра 182 точки: x 6…186, y 7…188). Контуры частей обведены по первому кадру в точках листа и переводятся в
 * единицы поля функциями `X`, `Y`, `S` (k = 136 / 182, левый край фигуры → 4, низ → земля): в коде стоят числа
 * листа, чтобы сверку можно было повторить по сетке. Урок Паладина — «анатомия на глаз»: с листа сняты не только
 * суставы, но и контур каждой части.
 *
 * Что на листе: огромная шкура на плечах — горб меха выше головы и плащ за спиной до колен; маленький рогатый шлем
 * низко и впереди, у дальнего плеча; голый торс с перевязью наискось, пояс из круглых бляшек с ромбом-пряжкой,
 * красная набедренная повязка; ближняя рука голая до кожаного наруча, кулак пустой у бедра; дальняя рука держит
 * топор впереди-внизу — древко почти горизонтально к врагам, лезвие-«борода» висит вниз, в крови; штаны из тёмной
 * кожи, на коленях и голенях светлый мех, сапоги крупные; стойка широкая и низкая.
 *
 * Смотрит вправо, на врагов. Ближняя сторона — левая (пустая рука поверх туловища), дальняя — правая: рука с топором
 * за туловищем, кулак и топор перед ним. Свет общий с врагами — сверху слева, из-за спины героя.
 *
 * Варианты на обсуждение: облик (материалы), голова, хват оружия — одна лепка; после выбора лишнее уйдёт, как у
 * Паладина (его варианты — в истории ветки).
 */

// ─── Варианты ───────────────────────────────────────────────────────────────

export type BerserkLookId = 'A' | 'B' | 'C';
/** Голова: `horns` — рогатый шлем с листа, `wolf` — волчья голова капюшоном, `mane` — без шлема: грива и борода. */
export type BerserkHead = 'horns' | 'wolf' | 'mane';
/** Оружие: `axe` — топор в дальней руке, как на листе; `great` — секира двумя руками; `pair` — ещё топорик в ближней. */
export type BerserkWeapon = 'axe' | 'great' | 'pair';

export interface BerserkLook {
  id: BerserkLookId;
  name: string;
  /** Мех горба и манжет, плаща (темнее), волосы гривы. */
  fur: string[];
  cape: string[];
  hair: string[];
  skin: string[];
  /** Боевая раскраска на коже (C — вайда); без поля — нет. */
  paint?: string;
  /** Полоса на глазах у гривы: сажа или вайда. */
  mask: string;
  leather: string[];
  cloth: string[];
  steel: string[];
  horn: string[];
  wood: string;
  blood: string;
  bloodDark: string;
}

export const BERSERK_LOOKS: Record<BerserkLookId, BerserkLook> = {
  // A — как на листе: светлый розовато-бежевый мех, розовая загорелая кожа, алая повязка, светлая сталь.
  A: {
    id: 'A',
    name: 'С листа',
    fur: ['#3a2422', '#75554d', '#a5796a', '#c59a88', '#e2bea8'],
    cape: ['#1c0e0f', '#34201f', '#4e3431', '#6d4a44', '#8e6658'],
    hair: ['#1e0e0a', '#3e1e14', '#62321e', '#86482a', '#a8643a'],
    skin: ['#5a2a24', '#a84e40', '#e07e62', '#f4a888', '#fcd4b4'],
    mask: '#1a1012',
    leather: ['#140a0a', '#291718', '#472a29', '#6d4a44', '#8e6658'],
    cloth: ['#2c0a0c', '#5a181c', '#8a242a', '#a83036', '#c44844'],
    steel: ['#221a1c', '#4a3e40', '#776669', '#a89898', '#dccfcb'],
    horn: ['#3a302e', '#766a66', '#a89c98', '#d0c6c2', '#f0eae6'],
    wood: '#4a2e22',
    blood: '#b8483c',
    bloodDark: '#7a2426',
  },
  // B — палитра листа, приглушённая под сцену (как Пепельный храмовник у Паладина): пепельно-бурый мех, обветренная
  // кожа без розового, повязка цвета запёкшейся крови, тёмная сталь, рог — жёлтая кость.
  B: {
    id: 'B',
    name: 'Северянин',
    fur: ['#261c18', '#56443a', '#836b5a', '#a88c76', '#c6aa92'],
    cape: ['#140d0b', '#281c18', '#3e2f28', '#56443a', '#6e5a4c'],
    hair: ['#140c08', '#2a1a12', '#46301e', '#624430', '#7e5a40'],
    skin: ['#4a2a22', '#8a4e3a', '#bc7454', '#d89a74', '#eebe98'],
    mask: '#140e0e',
    leather: ['#110b0a', '#231816', '#3a2824', '#56403a', '#76584c'],
    cloth: ['#1e0708', '#3e0e10', '#62171a', '#822426', '#9a3632'],
    steel: ['#1a1618', '#363032', '#5a5254', '#8a8082', '#bab0ac'],
    horn: ['#2e2620', '#5e5246', '#8e806e', '#b6a892', '#d4c8b2'],
    wood: '#3a281c',
    blood: '#8e2c24',
    bloodDark: '#561614',
  },
  // C — тёмный волчий мех, бледная холодная кожа в полосах вайды (синяя боевая раскраска), повязка тёмно-красная.
  C: {
    id: 'C',
    name: 'Вайда',
    fur: ['#1a1a1c', '#3a3a3e', '#5e5e62', '#86857f', '#aaa69c'],
    cape: ['#0c0c0e', '#1a1a1e', '#2a2a2e', '#3c3c40', '#525256'],
    hair: ['#0e0c0c', '#1c1818', '#2e2826', '#443c38', '#5a504a'],
    skin: ['#3a2a2a', '#6e5250', '#a08480', '#c4aaa2', '#e0cac0'],
    paint: '#34568e',
    mask: '#2a4a80',
    leather: ['#0e0a0a', '#1c1614', '#2e2420', '#463830', '#5e4c40'],
    cloth: ['#1a0608', '#360c10', '#561418', '#721e22', '#8a2c2c'],
    steel: ['#16181c', '#30343a', '#50565e', '#7c848c', '#aeb4b8'],
    horn: ['#1e1a18', '#3e3630', '#6a5e52', '#968a7a', '#bcb2a2'],
    wood: '#2e2218',
    blood: '#8a2a24',
    bloodDark: '#521414',
  },
};

/**
 * Материалы облика — свой объект на каждую часть (движок заводит зерно фактуры на объект). Мех — прядями вниз
 * (`fur` с `stretch`, рваный край `shag`), кожа — тёплый рамп без блика, сталь — `metal`; шлем без фактуры и
 * дизеринга: зерно на крупных плоскостях шлема в пикселе 1,5 читалось рябью (урок Паладина).
 */
function matsOf(L: BerserkLook) {
  const fur = (angle: number, shag: number, ramp = L.fur): Mat => ({ base: ramp[2], ramp, shag, tex: { kind: 'fur', scale: 1.8, amp: 0.22, stretch: 1.8, angle } });
  const skin = (): Mat => ({ base: L.skin[2], ramp: L.skin, dither: 0.4, tex: { kind: 'noise', scale: 2.6, amp: 0.08 } });
  const leather = (): Mat => ({ base: L.leather[2], ramp: L.leather, tex: { kind: 'noise', scale: 2, amp: 0.16 } });
  const flat = (c: string): Mat => ({ base: c, ramp: [c, c, c, c, c], dither: 0 });
  return {
    cape: fur(1.5, 0.4, L.cape),
    mantle: fur(1.35, 0.34),
    collar: fur(1.6, 0.36),
    cuff: fur(1.57, 0.42),
    wolf: fur(0.3, 0.22),
    hair: fur(1.2, 0.4, L.hair),
    beard: fur(1.57, 0.3, L.hair),
    torso: skin(),
    armN: skin(),
    armF: skin(),
    face: skin(),
    paint: L.paint ? flat(L.paint) : undefined,
    pants: leather(),
    bracer: { base: L.leather[3], ramp: [L.leather[0], L.leather[1], L.leather[2], L.leather[3], L.leather[4]], tex: { kind: 'noise', scale: 2, amp: 0.14 } } as Mat,
    boot: leather(),
    belt: { base: L.leather[2], ramp: L.leather, dither: 0.2 } as Mat,
    strap: { base: L.leather[2], ramp: L.leather, dither: 0 } as Mat,
    cloth: { base: L.cloth[2], ramp: L.cloth, shag: 0.12, tex: { kind: 'stripes', scale: 2.4, amp: 0.14, angle: 1.5 } } as Mat,
    helm: { base: L.steel[2], ramp: L.steel, dither: 0, metal: 0.55 } as Mat,
    axe: { base: L.steel[2], ramp: L.steel, dither: 0.2, metal: 0.5, tex: { kind: 'spots', scale: 2.2, amp: 0.18, density: 0.2 } } as Mat,
    hatchet: { base: L.steel[2], ramp: L.steel, dither: 0.2, metal: 0.5, tex: { kind: 'spots', scale: 2, amp: 0.18, density: 0.2 } } as Mat,
    buckle: { base: L.steel[3], ramp: L.steel, dither: 0, metal: 0.6 } as Mat,
    horn: { base: L.horn[2], ramp: L.horn, dither: 0, tex: { kind: 'stripes', scale: 1.5, amp: 0.2, angle: 0 } } as Mat,
    wood: { base: L.wood, tex: { kind: 'stripes', scale: 2, amp: 0.14, angle: 0 } } as Mat,
    dark: flat('#120a0a'),
    /** Штрихи: стык, светлая кромка кожи, складка ткани, кромка лезвия, кровь. */
    seam: L.leather[0],
    lace: L.leather[4],
    fold: L.cloth[0],
    edge: L.steel[4],
    glint: '#f4ece4',
    blood: L.blood,
    bloodDark: L.bloodDark,
    skinDark: L.skin[1],
    skinLit: L.skin[4],
    mask: L.mask,
    /** Щель между прядями — темнее тени меха; светлый кончик пряди. */
    furGap: L.fur[0],
    capeGap: L.cape[0],
    hornDark: L.horn[1],
  };
}
type Mats = ReturnType<typeof matsOf>;

// ─── Мерки: точки листа → единицы поля ─────────────────────────────────────

/** Земля модели и масштаб листа: фигура первого кадра (182 точки) → рост 136. */
const G = 140;
const K = 136 / 182;
/** Точка листа по x и y → единицы поля: левый край фигуры (6) → 4, низ (189) → земля. */
const X = (px: number): number => 4 + (px - 6) * K;
const Y = (py: number): number => G - (189 - py) * K;
const P = (px: number, py: number): [number, number] => [X(px), Y(py)];
/** Контур в точках листа [x0, y0, x1, y1, …] → в единицах поля. */
const S = (...pts: number[]): number[] => pts.map((v, i) => (i % 2 ? Y(v) : X(v)));
/** Размер в точках листа → в единицах. */
const R = (v: number): number => v * K;

/**
 * Суставы стойки — точки первого кадра листа. Ноги расставлены широко, ближняя (к зрителю) уходит влево-назад и в
 * перспективе длиннее дальней; рука с топором дальняя, её плечо укорочено ракурсом.
 */
const M = {
  /** Центр шлема и шея — опора наклона головы. */
  helm: P(122, 36),
  neck: P(116, 54),
  pelvis: P(106, 108),
  legN: { hip: P(88, 110), knee: P(48, 143), ank: P(38, 176) },
  legF: { hip: P(121, 110), knee: P(130, 143), ank: P(132, 176) },
  armN: { sh: P(76, 62), el: P(42, 78), hand: P(50, 117) },
  armF: { sh: P(127, 72), el: P(127, 87), hand: P(146, 104) },
};

const len = (a: readonly number[], b: readonly number[]): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
const ARM_N = { l1: len(M.armN.sh, M.armN.el), l2: len(M.armN.el, M.armN.hand) };
const ARM_F = { l1: len(M.armF.sh, M.armF.el), l2: len(M.armF.el, M.armF.hand) };
const LEG_N = { l1: len(M.legN.hip, M.legN.knee), l2: len(M.legN.knee, M.legN.ank) };
const LEG_F = { l1: len(M.legF.hip, M.legF.knee), l2: len(M.legF.knee, M.legF.ank) };
const PELVIS = M.pelvis;

// ─── Мех ────────────────────────────────────────────────────────────────────

/**
 * Рваный край меха: ломаная (единицы поля) с прядями — между вершинами через `step` торчит зубец на `amp` по нормали
 * (`side` 1 — налево от хода на экране), кончик отнесён вдоль хода на `lean`; длина зубцов гуляет 1 / 0,5 / 0,8.
 * У листа край шкуры — пики прядей, гладкий контур с `shag` читался стриженым.
 */
function furEdge(pts: number[], amp: number, step: number, side: 1 | -1, lean = 0): number[] {
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

/**
 * Пряди меха краской по его части: вдоль ломаной `pts` через `step` — «язычок» длиной `len` и полушириной `w` по
 * направлению `dir(x, y)` (градусы): светлый язычок и тёмная щель с одной стороны. Мех листа — слои прядей, а фактура
 * `fur` даёт только зерно.
 */
function locks(p: Painter, mat: Mat, part: string, pts: number[], o: { step: number; len: number; w: number; dir: (x: number, y: number) => number; tone?: number; gap: string; shift?: number }): void {
  let k = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
    const l = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(l / o.step));
    for (let j = 0; j < n; j++) {
      const f = (j + (o.shift ?? 0.5)) / n;
      const bx = x0 + (x1 - x0) * f, by = y0 + (y1 - y0) * f;
      const a = o.dir(bx, by) * DEG, L2 = o.len * [1, 0.8, 0.92][k % 3];
      const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
      p.poly([bx - nx * o.w, by - ny * o.w, bx + nx * o.w, by + ny * o.w, bx + dx * L2, by + dy * L2], mat, { part, paint: true, tone: (o.tone ?? 0.14) * (k % 2 ? 0.45 : 1) });
      stroke(p, [bx + nx * o.w * 1.1, by + ny * o.w * 1.1, bx + dx * L2 * 0.92 + nx * 0.4, by + dy * L2 * 0.92 + ny * 0.4], o.gap, part);
      k++;
    }
  }
}

/** Направление прядей горба: от шеи наружу, наполовину вниз. */
const NECK_FUR = P(114, 44);
function fromNeck(x: number, y: number): number {
  const a = Math.atan2(y - NECK_FUR[1], x - NECK_FUR[0]) / DEG;
  return a + (((110 - a + 540) % 360) - 180) * 0.45;
}

// ─── Топор ──────────────────────────────────────────────────────────────────

/**
 * Топор с листа: древко почти горизонтально (−16° — чуть вверх к врагам), кулак у верхнего конца, за лезвием;
 * голова — длинная «борода»: узкий верх над древком, лезвие вниз почти до колена, кромки — правая (рубящая) и
 * нижняя — заточены и светлые, по лезвию кровь. Контур головы снят в точках листа и переведён в координаты топора:
 * `s` — вдоль древка от проушины, `t` — поперёк (плюс — вниз от древка). Так его можно вращать в клипах.
 */
const AXE_ANGLE = -16;
/** Проушина (где древко входит в голову) — точка листа. */
const AXE_EYE = P(156, 99);
const AXE_HEAD_SHEET = [
  156, 90, 158, 85, 162, 80, 168, 78, 172, 81, 174, 90, 176, 100, 178, 108, 181, 116, 184, 123, 185, 131, 184, 139, 181, 144, 177, 147,
  170, 143, 163, 138, 157, 134, 152, 131, 148, 128, 151, 125, 155, 120, 157, 112, 157, 104, 156, 97,
];
/** Скос заточки — полоса вдоль правой и нижней кромки, на ширину в 4 точки листа внутрь. */
const AXE_EDGE_SHEET = [172, 81, 174, 90, 176, 100, 178, 108, 181, 116, 184, 123, 185, 131, 184, 139, 181, 144, 177, 147, 170, 143, 163, 138, 157, 134, 152, 131, 148, 128];
const AXE_BLOOD_SHEET = [
  [176, 112, 180, 116, 182, 124, 182, 134, 178, 140, 172, 138, 168, 132, 172, 124, 170, 118],
  [163, 134, 169, 130, 172, 136, 168, 139],
  [174, 101, 176, 107, 172, 110],
];

/** Полоса вдоль ломаной шириной `w` (в точках листа) внутрь — справа от хода на экране. */
function band(pts: number[], w: number): number[] {
  const n = pts.length / 2, inner: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
    const tx = pts[b * 2] - pts[a * 2], ty = pts[b * 2 + 1] - pts[a * 2 + 1], l = Math.hypot(tx, ty) || 1;
    inner.push(pts[k * 2] - (ty / l) * w, pts[k * 2 + 1] + (tx / l) * w);
  }
  const out = [...pts];
  for (let k = n - 1; k >= 0; k--) out.push(inner[k * 2], inner[k * 2 + 1]);
  return out;
}

/** Точки листа → координаты топора (s, t) от проушины при угле `AXE_ANGLE`. */
function axeLocal(pts: number[]): number[] {
  const c = Math.cos(AXE_ANGLE * DEG), s = Math.sin(AXE_ANGLE * DEG);
  const out: number[] = [];
  for (let k = 0; k < pts.length; k += 2) {
    const dx = X(pts[k]) - AXE_EYE[0], dy = Y(pts[k + 1]) - AXE_EYE[1];
    out.push(dx * c + dy * s, -dx * s + dy * c);
  }
  return out;
}
const AXE_HEAD = axeLocal(AXE_HEAD_SHEET);
const AXE_BEVEL = axeLocal(band(AXE_EDGE_SHEET, 4.5));
const AXE_EDGE = axeLocal(AXE_EDGE_SHEET);
const AXE_BLOOD = AXE_BLOOD_SHEET.map(axeLocal);
/** От кулака до проушины вдоль древка. */
const AXE_GRIP = len(M.armF.hand, AXE_EYE);

/**
 * Топор от кулака (x, y) под углом `a` (градусы, как в `at`): древко с обмоткой, окованный конец, голова. `size` —
 * масштаб головы (топорик — 0,55), `butt` — длина древка за кулаком, `grip` — от кулака до проушины.
 */
function axe(p: Painter, m: Mats, x: number, y: number, a: number, o: { size?: number; butt?: number; grip?: number; mat?: Mat; id?: string } = {}): void {
  const size = o.size ?? 1, butt = o.butt ?? 29, grip = o.grip ?? AXE_GRIP, id = o.id ?? 'axe';
  const mat = o.mat ?? m.axe;
  const u: [number, number] = [Math.cos(a * DEG), Math.sin(a * DEG)];
  const n: [number, number] = [-u[1], u[0]];
  const [ex, ey] = at(x, y, a, grip);
  /** Точка головы в координатах топора → кадр. */
  const q = (pts: number[]): number[] => {
    const out: number[] = [];
    for (let k = 0; k < pts.length; k += 2) out.push(ex + (u[0] * pts[k] + n[0] * pts[k + 1]) * size, ey + (u[1] * pts[k] + n[1] * pts[k + 1]) * size);
    return out;
  };
  const r = 2.3 * Math.max(0.7, size);
  const haft = `${id}Haft`, head = `${id}Head`;
  p.limb(...at(x, y, a, -butt), r, ...at(x, y, a, grip + 1), r, m.wood, { part: haft });
  // Окованный конец древка и кожаная обмотка у кулака.
  p.limb(...at(x, y, a, -butt - 0.5), r + 0.5, ...at(x, y, a, -butt + 3.5), r + 0.5, mat, { part: `${id}Butt` });
  for (let s = -10; s <= -4; s += 2.4) {
    const [cx, cy] = at(x, y, a, s);
    stroke(p, [cx - n[0] * r, cy - n[1] * r, cx + n[0] * r + u[0] * 1.2, cy + n[1] * r + u[1] * 1.2], m.lace, haft);
  }
  p.poly(q(AXE_HEAD), mat, { part: head, bevel: 1.5 * size, flat: 0.75, lift: 1 });
  // Плоскость у проушины темнее, скос заточки светлее, по самой кромке — светлая черта.
  p.poly(q(AXE_BEVEL), mat, { part: head, paint: true, tone: 0.24 });
  stroke(p, q(AXE_EDGE), m.edge, head);
  for (const b of AXE_BLOOD) p.poly(q(b), solid(m.blood), { part: head, paint: true });
  stroke(p, q(AXE_BLOOD[0].slice(0, 8)), m.bloodDark, head);
  // Проушина — кованая втулка поперёк древка.
  const [e0x, e0y, e1x, e1y] = q([-3, 0, 3, 0]);
  p.limb(e0x, e0y, 3 * size, e1x, e1y, 3 * size, mat, { part: `${id}Eye`, lift: 1.2, tone: -0.12 });
}

// ─── Головы ─────────────────────────────────────────────────────────────────

/**
 * Рогатый шлем с листа: круглый купол, обод с заклёпками на уровне глаз, наносник; лицо в проёме под ободом — в
 * тени, светлее только нос и борода внизу; один рог (дальний закрыт куполом) — светлая кость, растёт из купола
 * назад-вверх, острие выше горба меха. Ухо торчит назад из-под шлема. Координаты — точки листа.
 */
function hornedHelm(p: Painter, m: Mats): void {
  // Ухо — за шлемом.
  p.poly(S(107, 37, 101, 36, 95, 31, 100, 30, 107, 31), m.face, { part: 'ear', bevel: 1.2, tone: -0.1 });
  // Рог — цепочкой сужающихся звеньев от основания в куполе к острию; кольца — полосами кости.
  p.chain([[X(117), Y(29), R(9)], [X(112), Y(22), R(7.6)], [X(107.5), Y(16), R(5.8)], [X(104), Y(11.5), R(3.4)], [X(102.5), Y(8.5), R(1.2)]], m.horn, { part: 'horn', tone: 0.2, flat: 0.25 });
  stroke(p, S(112.5, 19, 107, 22), m.hornDark, 'horn');
  stroke(p, S(108.5, 14, 104.5, 16), m.hornDark, 'horn');
  const H = m.helm;
  const o = { part: 'helm', paint: true };
  // Купол и нащёчная часть одним контуром, сверху купол-эллипс для света.
  p.poly(S(108, 41, 108, 32, 111, 25, 116, 20, 122, 18, 128, 19, 133, 22, 136, 28, 137, 36, 136, 44, 133, 50, 128, 53, 124, 57, 117, 57, 112, 54, 109, 48), H, { part: 'helm', bevel: 3, flat: 0.3 });
  p.ellipse(X(122), Y(31), R(14), R(13), H, { part: 'helm', lift: 1.4 });
  // Блик купола сверху слева, тень у лица.
  p.poly(S(112, 27, 116, 22, 121, 20, 119, 25, 114, 30), H, { ...o, tone: 0.32 });
  p.poly(S(131, 23, 136, 29, 137, 36, 133, 36, 132, 29), H, { ...o, tone: -0.14 });
  // Обод на уровне глаз — светлая полоса с заклёпками.
  p.poly(S(108, 37, 122, 35, 137, 33, 137, 37, 122, 39, 108, 41), H, { ...o, tone: 0.16 });
  for (const [x, y] of [[111, 38.5], [116, 38], [121, 37]]) p.px(X(x), Y(y), m.edge);
  // Проём лица: тень под ободом, лицо в ней — нижняя половина, нос и борода чуть светлее.
  p.poly(S(119, 39, 134, 37.5, 134, 44, 131, 50, 127, 54, 121, 54, 118, 47), m.dark, o);
  p.poly(S(121, 45, 132, 44, 131, 49, 127, 53, 122, 52), m.face, { ...o, tone: -0.35 });
  p.poly(S(124, 50, 131, 48, 129, 54, 124, 55), m.beard, { ...o, tone: -0.1 });
  // Наносник — узкая стальная полоса от обода вниз.
  p.poly(S(127, 37, 130, 37, 130, 46, 128, 47), H, { ...o, tone: 0.08 });
  stroke(p, S(108.5, 37.5, 122, 35.5, 136.5, 33.5), m.edge, 'helm');
}

/**
 * Волчья голова капюшоном: череп в меху, уши торчком, морда поверх лба вперёд к врагам, верхняя челюсть с клыками над
 * лицом; глазницы шкуры пустые и тёмные — глаза не светятся. Лицо берсерка под челюстью в тени, борода.
 */
function wolfHead(p: Painter, m: Mats): void {
  // Шкура свисает по бокам к горбу меха.
  p.poly(S(104, 30, 116, 38, 118, 56, 110, 60, 101, 48), m.wolf, { part: 'wolfSide', tone: -0.16, bevel: 3 });
  // Дальнее ухо темнее.
  p.poly(S(120, 23, 126, 6, 132, 20), m.wolf, { part: 'wolfEarF', bevel: 1.5, tone: -0.12 });
  // Лицо под челюстью: тень, борода.
  p.poly(S(118, 42, 136, 44, 134, 50, 128, 56, 121, 55, 116, 48), m.face, { part: 'face', tone: -0.3, bevel: 2 });
  p.poly(S(121, 49, 134, 48, 132, 55, 125, 60, 119, 56), m.beard, { part: 'beard', tone: -0.1, bevel: 2 });
  // Череп и морда — одна часть, светлее горба (морда серее и светлее — так волк читается на своём же мехе):
  // купол, длинная морда вперёд к врагам, нос на конце.
  p.ellipse(X(120), Y(28), R(15), R(12), m.wolf, { part: 'wolf', lift: 1.2, tone: 0.1 });
  p.limb(X(126), Y(30), R(9.5), X(147), Y(38), R(5.4), m.wolf, { part: 'wolf', lift: 1.8, tone: 0.14 });
  p.poly(S(104, 27, 105, 7, 118, 20), m.wolf, { part: 'wolfEar', bevel: 1.6, tone: 0.08 });
  p.poly(S(107, 22, 107, 13, 113, 20), m.dark, { part: 'wolfEar', paint: true });
  // Светлая морда снизу, нос.
  p.poly(S(132, 36, 147, 38, 146, 42, 132, 42), m.wolf, { part: 'wolf', paint: true, tone: 0.3 });
  p.ellipse(X(149.5), Y(38), R(3.2), R(2.8), m.dark, { part: 'nose', lift: 2 });
  // Верхняя челюсть: тёмная пасть в два пикселя и клыки вниз.
  p.poly(S(127, 41, 146, 42, 145, 44.5, 127, 44), m.dark, { part: 'wolf', paint: true });
  for (const [x, y] of [[131, 44], [138, 45], [144, 44.5]]) p.poly(S(x - 1.2, y - 1, x + 1.2, y - 1, x, y + 3.2), solid(m.glint), { part: 'fang', bevel: 0.5 });
  // Пустая глазница шкуры и надбровье.
  p.poly(S(127, 27.5, 134, 28.5, 133, 31.5, 127, 31), m.dark, { part: 'wolf', paint: true });
  stroke(p, S(125, 26, 135, 27), m.furGap, 'wolf');
  locks(p, m.wolf, 'wolf', S(108, 25, 118, 19, 126, 21), { step: R(6), len: R(8), w: R(2.4), dir: () => 165, gap: m.furGap, tone: 0.18 });
}

/**
 * Без шлема: грива назад, на затылке узел, борода с косицей; лицо в профиль к врагам, на глазах — полоса краски
 * (сажа, у вайды — синяя): глаз не видно, как положено герою.
 */
function maneHead(p: Painter, m: Mats): void {
  // Грива — назад и вниз, за лицом, падает на горб меха.
  p.poly(S(104, 50, 102, 38, 105, 28, 110, 21, 118, 17, 126, 17, 131, 20, 132, 25, 126, 26, 120, 30, 116, 38, 113, 48, 109, 56), m.hair, { part: 'hair', bevel: 3 });
  locks(p, m.hair, 'hair', S(128, 20, 118, 20, 110, 26, 106, 36), { step: R(5), len: R(9), w: R(2), dir: () => 150, gap: m.furGap, tone: 0.16 });
  // Узел на макушке.
  p.ellipse(X(112), Y(18), R(5), R(4.5), m.hair, { part: 'knot', lift: 1 });
  // Лицо: лоб, надбровье, нос, щека — в профиль вправо.
  p.poly(S(116, 30, 124, 25, 131, 26, 134, 30, 134, 35, 137, 40, 135, 42, 133, 43, 132, 47, 126, 51, 118, 50, 114, 42), m.face, { part: 'face', bevel: 2.4 });
  p.poly(S(114, 36, 121, 33, 118, 45, 114, 44), m.face, { part: 'face', paint: true, tone: -0.2 });
  // Полоса краски на глазах и ухо.
  p.poly(S(119, 31.5, 134, 30.5, 135, 35, 119, 36.5), solid(m.mask), { part: 'face', paint: true });
  p.ellipse(X(116), Y(38), R(2.6), R(3.4), m.face, { part: 'ear', lift: 1, tone: -0.1 });
  // Борода с косицей.
  p.poly(S(118, 44, 128, 47, 134, 46, 135, 51, 131, 57, 126, 62, 119, 60, 114, 52), m.beard, { part: 'beard', bevel: 2.5 });
  p.chain([[X(125), Y(60), R(2.6)], [X(124), Y(66), R(2.2)], [X(123), Y(71), R(1.6)]], m.beard, { part: 'braid' });
  p.px(X(123.5), Y(68.5), m.lace);
}

// ─── Поза ───────────────────────────────────────────────────────────────────

/**
 * Поза стойки: таз и верх (`x`, `y`, `crouch`, `lean`), голова, кисти обеих рук точкой в координатах верха
 * (локти — ik), угол топора, плащ. Клипы добавят свои поля на шаге 4 (как у Воина и Паладина).
 */
export interface BerserkPose extends Record<string, number> {
  x: number; y: number;
  crouch: number;
  lean: number;
  head: number;
  /** Кисти: ближняя (пустая или топорик), дальняя (топор). */
  nhx: number; nhy: number;
  fhx: number; fhy: number;
  /** Угол топора в координатах верха, градусы. */
  sw: number;
  /** Плащ и повязка: 0 — висят, 1 — взвились назад. */
  cape: number;
}

const REST: BerserkPose = {
  x: 0, y: 0, crouch: 0, lean: 0, head: 0,
  nhx: M.armN.hand[0], nhy: M.armN.hand[1],
  fhx: M.armF.hand[0], fhy: M.armF.hand[1],
  sw: AXE_ANGLE, cape: 0,
};

/**
 * Секира двумя руками: ближняя кисть берёт древко у ближнего бедра (рука висит, локоть назад), дальняя — у головы,
 * как на листе; древко длиннее и проходит перед поясом, голова та же, но крупнее. `GREAT_LOW` — от дальнего кулака
 * до ближнего вдоль древка.
 */
const GREAT_LOW = 44;
const GREAT_SIZE = 1.12;
/** Топорик в ближней руке (`pair`): висит вниз-вперёд, лезвием к врагам. */
const HATCHET_ANGLE = 74;

/**
 * Покой: берсерк тяжело дышит — грудь и горб меха поднимаются на пиксель-два, таз оседает на четверть цикла позже,
 * раз за цикл вес переходит с ноги на ногу; стопы стоят, колени в малых сдвигах идут за тазом (урок Паладина:
 * ik на каждый пиксель приседа разводил колени). Руки не приклеены к корпусу: кисти повторяют 40 % его движения,
 * топор качается маятником ±2° с запаздыванием, плащ колышется. Сдвиги — целыми пикселями.
 */
function idlePose(p: Painter): BerserkPose {
  const P = { ...REST };
  P.crouch += p.bob(1.5, 2, 0.25);
  P.x += p.snap(1.4 * p.wave(1, 0.3));
  const bodyX = P.x, bodyY = P.crouch - p.bob(2.5, 2);
  P.nhx -= 0.6 * bodyX;
  P.nhy -= 0.6 * bodyY;
  P.fhx -= 0.6 * bodyX;
  P.fhy -= 0.6 * bodyY;
  P.sw += 2 * p.wave(1, 0.45);
  return P;
}

/** Поза кадра: пока только покой (клипы — шаг 4); в клипах — фаза 0 покоя. */
function framePose(p: Painter): BerserkPose {
  const P = idlePose(p);
  if (!clipAt(p)) {
    P.cape += 0.06 * (1 - Math.cos(2 * Math.PI * p.t));
    P.head += 3 * p.blink(0.62, 0.16);
  }
  return P;
}

/** Зонд: таз, кисть с топором, нижний рог лезвия, стопы. Клипов ещё нет — оружие в земле нигде не нарочно. */
export const berserkProbe: HeroProbe = { grounded: ['death'] };

// ─── Модель ─────────────────────────────────────────────────────────────────

export interface BerserkVariant { look: BerserkLookId; head: BerserkHead; weapon: BerserkWeapon }

/**
 * Аватарка — шаг 5 рецепта; пока бюст из покоя в кадре прежнего портрета (шлем, горб меха, перевязь, край топора)
 * и цвета с него — тёмно-красное небо, кровавая луна.
 */
function avatarOf(v: BerserkVariant, m: Mats): AvatarSpec {
  return {
    draw: (p) => drawBerserk(p, REST, v, m),
    crop: [36, -8, 90],
    halo: [84, 20, 24],
    colors: { top: '#5a1a16', bottom: '#1c0a08', halo: '#7a2218', haloEdge: '#a2361f', skyline: '#260c0a', frameDark: '#120606', frame: '#46140f', frameLight: '#7a2a1e' },
    skyline: [[0.06, 0.05, 0.5, 0.3], [0.94, 0.05, 0.55, 0.32]],
  };
}

/** Берсерк; рост в покое — `HERO_BODY_HEIGHT.berserk` (136) в пикселе `HERO_PIXEL`. */
export function berserkModel(look: BerserkLookId = 'B', head: BerserkHead = 'horns', weapon: BerserkWeapon = 'axe'): HeroModel {
  const v: BerserkVariant = { look, head, weapon };
  const m = matsOf(BERSERK_LOOKS[look]);
  return {
    id: 'berserk',
    avatar: avatarOf(v, m),
    probe: berserkProbe,
    w: 146,
    h: 144,
    ground: G,
    pad: 80,
    draw: (p: Painter) => drawBerserk(p, framePose(p), v, m),
  };
}

// ─── Рисунок ────────────────────────────────────────────────────────────────

/**
 * Сапоги — контуры листа от щиколотки (разница в точках листа). Ближний носком наружу (влево) и в ракурсе короче,
 * дальний — носком к врагам, длинный.
 */
const BOOT_N = [13, -10, 14, 0, 13, 8, 11, 13, -19, 13, -21, 9, -19, 4, -13, 0, -6, -3, -2, -9];
const BOOT_F = [-13, -11, 5, -11, 8, -6, 16, -2, 24, 1, 30, 5, 32, 10, 31, 13, -13, 13, -15, 6, -14, -4];

/** Верхний край горба (точки листа) — от шлема к левому краю; по нему — зубцы прядей. */
const MANTLE_TOP = [108, 26, 104, 18, 97, 15, 90, 15, 83, 14, 75, 16, 66, 18, 57, 21, 50, 26, 44, 32, 38, 37, 33, 44, 29, 51];
/** Внешний край плаща — от горба вниз до подола. */
const CAPE_EDGE = [29, 51, 24, 60, 19, 70, 15, 80, 11, 92, 8, 104, 6, 116, 7, 127, 9, 135];

function drawBerserk(p: Painter, P: BerserkPose, v: BerserkVariant, m: Mats): void {
  const breath = p.bob(2.5, 2);
  const turn = p.blink(0.62, 0.16);
  const hipX = PELVIS[0], hipY = PELVIS[1] + P.crouch;
  const rot = P.lean * DEG;
  const up = { dx: 0, dy: hipY - PELVIS[1] - breath, rot, px: PELVIS[0], py: PELVIS[1] };
  const probeInfo: Record<string, number> = {};

  p.pose({ dx: P.x, dy: P.y }, () => {
    p.shadow(70 - P.x * 0.5, 60, 4.5);

    // ── Плащ из шкуры — за спиной от горба до колен, виден слева и между ног; рваный подол колышется. ──
    p.pose(up, () => {
      const edge = furEdge(S(...CAPE_EDGE), R(4.5), R(7), -1, R(2));
      const pts = [
        ...S(104, 22, 92, 16, 80, 15, 68, 18, 58, 21, 50, 27, 42, 34, 35, 41),
        ...edge,
        ...S(12, 141, 16, 136, 20, 145, 25, 138, 30, 147, 36, 140, 44, 150, 54, 150, 62, 158, 68, 153, 74, 163, 80, 155, 86, 162, 92, 150, 98, 120, 104, 95, 110, 70, 118, 50),
      ];
      for (let k = 0; k < pts.length; k += 2) {
        const t = Math.max(0, (pts[k + 1] - 40) / 80);
        pts[k] -= P.cape * 10 * t * t;
      }
      p.poly(pts, m.cape, { part: 'fur', tone: -0.06, bevel: 6 });
      locks(p, m.cape, 'fur', S(30, 58, 20, 80, 14, 104, 12, 124), { step: R(10), len: R(16), w: R(4), dir: () => 100, gap: m.capeGap, tone: 0.12 });
      locks(p, m.cape, 'fur', S(46, 62, 36, 84, 28, 110, 26, 130), { step: R(10), len: R(16), w: R(4), dir: () => 96, gap: m.capeGap, tone: 0.1, shift: 0 });
    });

    // ── Ноги: бедро от таза, колено — ik в больших сдвигах, стопы стоят. Штаны тёмной кожи, на колене и голени
    //    светлый мех, сапоги крупные с ремнями. ──
    const legs = [
      { g: M.legF, L2: LEG_F, side: 'far', tone: -0.08, boot: BOOT_F, bend: [1, -0.1] },
      { g: M.legN, L2: LEG_N, side: 'near', tone: 0, boot: BOOT_N, bend: [-1, -0.3] },
    ] as const;
    for (const lg of legs) {
      const dhy = hipY - PELVIS[1];
      const hx = lg.g.hip[0], hy = lg.g.hip[1] + dhy;
      let ax = lg.g.ank[0] - P.x, ay = lg.g.ank[1] - P.y;
      const dax = ax - lg.g.ank[0], day = ay - lg.g.ank[1];
      const big = Math.max(Math.abs(dhy), Math.hypot(dax, day));
      const w = Math.max(0, Math.min(1, (big - 3) / 4));
      if (w > 0) [ax, ay] = reachFoot(hx, hy, ax, ay, lg.L2.l1 + lg.L2.l2 - 0.2);
      const [ikx, iky] = ik(hx, hy, ax, ay, lg.L2.l1, lg.L2.l2, lg.bend[0], lg.bend[1]);
      const kx = lerp(lg.g.knee[0] + dax / 2, ikx, w), ky = lerp(lg.g.knee[1] + (dhy + day) / 2, iky, w);
      if (lg.side === 'far') probeInfo.footF = ax + P.x;
      else probeInfo.footN = ax + P.x;
      const far = lg.side === 'far';
      const leg = `${lg.side}Leg`, foot = `${lg.side}Foot`, cuff = `${lg.side}Cuff`;
      const tone = lg.tone;
      // Бедро толстое (у листа ≈ 22–28 точек), голень уже; ремень поперёк бедра.
      p.limb(hx, hy, R(far ? 15 : 14), kx, ky, R(12), m.pants, { part: leg, tone });
      p.limb(kx, ky, R(10.5), ax, ay, R(8.5), m.pants, { part: leg, tone });
      const [mx, my] = [lerp(hx, kx, 0.5), lerp(hy, ky, 0.5)];
      stroke(p, [mx - R(12), my - R(4), mx + R(12), my + R(1)], m.lace, leg);
      stroke(p, [mx - R(11), my - R(1), mx + R(11), my + R(4)], m.seam, leg);
      // Сапог: подошва на земле, отворот сверху, ремни.
      const b: number[] = [];
      for (let k = 0; k < lg.boot.length; k += 2) b.push(ax + R(lg.boot[k]), Math.min(G, ay + R(lg.boot[k + 1])));
      p.poly(b, m.boot, { part: foot, bevel: 3.4, tone: tone - 0.02 });
      stroke(p, far ? [ax - R(13), ay - R(8), ax + R(6), ay - R(8.5)] : [ax - R(3), ay - R(7), ax + R(13), ay - R(7.5)], m.lace, foot);
      stroke(p, far ? [ax - R(12), ay + R(2), ax + R(14), ay - R(1)] : [ax - R(14), ay + R(1), ax + R(12), ay + R(1)], m.seam, foot);
      stroke(p, far ? [ax + R(16), ay + R(3), ax + R(27), ay + R(7)] : [ax - R(17), ay + R(6), ax - R(10), ay + R(3)], m.lace, foot);
      // Мех на колене и голени: пышный, низ — пряди вниз.
      const cx = kx + R(far ? 1 : 2), cy = ky + R(far ? 7 : 9);
      const rx = R(far ? 19 : 19), ry = R(far ? 10 : 11);
      const arc: number[] = [];
      for (let k = 0; k <= 6; k++) {
        const a = Math.PI + (Math.PI * k) / 6;
        arc.push(cx + rx * Math.cos(a), cy + ry * 0.8 * Math.sin(a));
      }
      const top = furEdge(arc, R(3.5), R(5), 1, R(1.5));
      const bottom = furEdge([cx + rx, cy + R(2), cx - rx, cy + R(2)], R(7), R(4.5), 1, 0);
      p.poly([...top, ...bottom], m.cuff, { part: cuff, bevel: 3, lift: 1, flat: 0.3, tone: tone - 0.02 });
      locks(p, m.cuff, cuff, [cx - rx * 0.8, cy - ry * 0.3, cx + rx * 0.8, cy - ry * 0.3], { step: R(7), len: R(10), w: R(3), dir: () => 92, gap: m.furGap, tone: 0.14 });
    }

    // ── Верх: дыхание поднимает торс, горб меха и голову; наклон — в клипах. ──
    const near = arm(M.armN.sh, P.nhx, P.nhy, ARM_N, -1, 0.2);
    const farA = arm(M.armF.sh, P.fhx, P.fhy, ARM_F, -1, 0.5);
    const great = v.weapon === 'great';
    // У секиры ближняя кисть — на древке ниже дальней.
    const na = great ? arm(M.armN.sh, ...at(P.fhx, P.fhy, P.sw, -GREAT_LOW), ARM_N, -1, -0.2) : near;
    p.pose(up, () => {
      // Торс — широкий, от ближнего плеча до дальнего; грудь и пресс буграми одной части.
      p.poly(S(73, 60, 88, 57, 104, 55, 118, 53, 128, 57, 136, 64, 140, 74, 139, 86, 137, 96, 104, 98, 76, 97, 72, 86, 70, 72), m.torso, { part: 'torso', bevel: 6, lift: 1, tone: 0.06 });
      p.ellipse(X(96), Y(70), R(18), R(11), m.torso, { part: 'torso', lift: 2.8, flat: 0.45, tone: 0.14 });
      p.ellipse(X(122), Y(69), R(12), R(10), m.torso, { part: 'torso', lift: 2.2, flat: 0.45, tone: 0.06 });
      p.ellipse(X(113), Y(89), R(14), R(8), m.torso, { part: 'torso', lift: 1.6, flat: 0.5, tone: 0.1 });
      stroke(p, S(86, 62, 100, 60, 110, 62), m.skinLit, 'torso');
      // Подмышка — тень между плечом и грудью: без неё рука и грудь сливались в одну полосу.
      p.poly(S(72, 66, 81, 63, 85, 71, 80, 80, 72, 80), m.torso, { part: 'torso', paint: true, tone: -0.34 });
      // Тень под грудью, линия пресса.
      p.poly(S(84, 80, 98, 82, 114, 80, 112, 83, 98, 85, 88, 84), m.torso, { part: 'torso', paint: true, tone: -0.18 });
      stroke(p, S(113, 84, 112, 96), m.skinDark, 'torso');
      stroke(p, S(104, 90, 121, 89), m.skinDark, 'torso');
      if (m.paint) {
        // Вайда: три полосы по груди.
        for (const dx of [0, 7, 14]) p.poly(S(88 + dx, 64, 92 + dx, 63, 88 + dx, 78, 84 + dx, 79), m.paint, { part: 'torso', paint: true });
      }
      // Перевязь наискось — от дальнего плеча к ближнему боку.
      p.poly(S(122, 52, 128, 55, 80, 96, 74, 93), m.strap, { part: 'torso', paint: true });
      stroke(p, S(122.5, 53, 75, 93.5), m.lace, 'torso');
      p.ellipse(X(104), Y(75), R(3.2), R(3.2), m.buckle, { part: 'strapRing', lift: 1 });

      // Кожаная юбка под поясом: ближний бок со светлой меховой полосой, дальний — тёмные ремни.
      p.poly(S(106, 97, 142, 94, 145, 106, 142, 119, 136, 113, 130, 121, 124, 114, 116, 121, 108, 115), m.pants, { part: 'skirtF', bevel: 2.5, tone: -0.1 });
      p.poly(S(72, 96, 90, 98, 90, 112, 86, 123, 80, 117, 73, 126, 68, 119, 62, 122, 64, 110), m.pants, { part: 'skirtN', bevel: 2.5 });
      p.poly([...S(56, 121, 68, 116, 80, 120, 89, 128), ...furEdge(S(89, 131, 56, 127), R(4), R(4), -1, 0)], m.cuff, { part: 'hipFur', bevel: 2 });
      p.poly(S(68, 99, 76, 99, 78, 112, 73, 117, 69, 109), m.cuff, { part: 'hipFur', bevel: 1.6, tone: 0.05 });

      // Набедренная повязка — красная, рваный низ; на выпаде относит назад.
      const tf = P.cape * 5;
      p.poly(S(88, 99, 106, 99, 107, 120, 106 - tf, 145, 106 - tf, 160, 103 - tf, 167, 100 - tf, 158, 97 - tf, 165, 94 - tf, 157, 91 - tf, 163, 88 - tf, 156, 87 - tf * 0.5, 140, 87, 120), m.cloth, { part: 'cloth', bevel: 2.4 });
      stroke(p, S(93, 104, 92 - tf, 150), m.fold, 'cloth');
      stroke(p, S(101, 104, 101 - tf, 152), m.fold, 'cloth');

      // Пояс из круглых бляшек, ромб-пряжка.
      p.poly(S(72, 90, 105, 92, 141, 87, 142, 97, 105, 101, 72, 99), m.belt, { part: 'belt', bevel: 2 });
      for (let k = 0; k < 7; k++) {
        const bx = 76 + k * 10.5;
        if (bx > 90 && bx < 102) continue;
        p.ellipse(X(bx), Y(95.5 - (bx - 76) * 0.04), R(4.2), R(4), m.belt, { part: 'belt', lift: 1.2, tone: 0.1 });
      }
      p.poly(S(96, 89, 101.5, 95, 96, 102, 90.5, 95), m.buckle, { part: 'buckle', bevel: 1.6, lift: 1.2 });

      // Дальняя рука: плечо — бугор кожи на боку, дальше наруч и кулак на древке, топор — перед ними.
      p.limb(farA.sx, farA.sy, R(11), farA.ex, farA.ey, R(9.5), m.armF, { part: 'farArm', tone: 0.02, lift: 1, flat: 0.45 });
      p.ellipse(farA.sx - R(1), farA.sy + R(3), R(11), R(10), m.armF, { part: 'farArm', lift: 2.2, flat: 0.35, tone: 0.04 });
      if (m.paint) p.poly(S(119, 76, 134, 74, 134, 78, 119, 80), m.paint, { part: 'farArm', paint: true });
      if (great) axe(p, m, farA.hx, farA.hy, P.sw, { size: GREAT_SIZE, butt: GREAT_LOW + 10, grip: AXE_GRIP + 2 });
      else axe(p, m, farA.hx, farA.hy, P.sw);
      const fa2 = Math.atan2(farA.hy - farA.ey, farA.hx - farA.ex) / DEG;
      bracer(p, m, farA.ex, farA.ey, farA.hx, farA.hy, R(11), R(9.5), -0.06, 'farBracer');
      fist(p, m, m.armF, farA.hx, farA.hy, fa2, R(9), -0.06, 'fistF');

      // Горб меха на плечах — выше головы, пряди от шеи вниз; нижний край рваный над грудью и плечом.
      const top = furEdge(S(...MANTLE_TOP), R(5), R(6), -1, -R(2));
      const fringe = furEdge(S(29, 51, 40, 55, 52, 57, 64, 59, 76, 60, 88, 60, 100, 60, 110, 57, 116, 57), R(4), R(5), 1, 0);
      p.poly([...top, ...fringe, ...S(118, 50, 112, 40, 110, 32)], m.mantle, { part: 'fur', bevel: 8, flat: 0.25, lift: 3 });
      p.ellipse(X(80), Y(34), R(30), R(15), m.mantle, { part: 'fur', lift: 4, flat: 0.3 });
      const rows: Array<[number[], number]> = [
        [[104, 23, 92, 21, 80, 20, 68, 23, 58, 26, 50, 31, 43, 37, 37, 43], 0.5],
        [[106, 35, 94, 32, 82, 31, 70, 33, 60, 36, 52, 41, 45, 47], 0],
        [[106, 48, 94, 46, 82, 46, 70, 48, 60, 50], 0.5],
      ];
      for (const [row, shift] of rows) locks(p, m.mantle, 'fur', S(...row), { step: R(10), len: R(15), w: R(4.2), dir: fromNeck, gap: m.furGap, tone: 0.22, shift });

      // Голова: раз за цикл поворачивается к врагам.
      p.pose({ rot: 0.05 * turn + P.head * DEG, px: M.neck[0], py: M.neck[1] }, () => {
        if (v.head === 'wolf') wolfHead(p, m);
        else if (v.head === 'mane') maneHead(p, m);
        else hornedHelm(p, m);
      });

      // Мех на дальнем плече — узкой полосой вокруг шеи справа от головы, в тени; низ шлема уходит в него.
      const collar = [...S(126, 52, 132, 45, 137, 47, 140, 55, 141, 62), ...furEdge(S(141, 66, 126, 64), R(5), R(4), -1, 0), ...S(125, 58)];
      p.poly(collar, m.collar, { part: 'collar', bevel: 3.5, lift: 1.5, tone: -0.1 });
      locks(p, m.collar, 'collar', S(128, 54, 138, 60), { step: R(6), len: R(10), w: R(2.6), dir: () => 80, gap: m.furGap, tone: 0.12 });

      // Ближняя рука — поверх торса: голое плечо с бицепсом, кожаный наруч с обмоткой, кулак.
      if (v.weapon === 'pair') axe(p, m, na.hx, na.hy, HATCHET_ANGLE + P.sw - AXE_ANGLE, { size: 0.55, butt: 7, grip: 17, mat: m.hatchet, id: 'hatchet' });
      const ua = Math.atan2(na.ey - na.sy, na.ex - na.sx) / DEG, ul = len([na.sx, na.sy], [na.ex, na.ey]);
      // Плечо — дельта у сустава и бицепс книзу, свет сверху: гладкая «колбаса» читалась протезом.
      const along = (f: number, off = 0): [number, number] => at(...at(na.sx, na.sy, ua, ul * f), ua + 90, off);
      p.limb(na.sx, na.sy, R(10.5), na.ex, na.ey, R(8.5), m.armN, { part: 'nearArm', lift: 1, flat: 0.5, tone: 0.12 });
      p.ellipse(...along(0.14, -R(1)), R(14), R(12), m.armN, { part: 'nearArm', lift: 2.8, rot: ua * DEG, flat: 0.45, tone: 0.14 });
      p.ellipse(...along(0.58, R(2)), R(12), R(10), m.armN, { part: 'nearArm', lift: 2.6, rot: ua * DEG, flat: 0.45, tone: 0.12 });
      // Граница дельты и бицепса, блик по верху плеча, тень под бицепсом.
      stroke(p, [...along(0.42, -R(3)), ...along(0.36, R(9))], m.skinDark, 'nearArm');
      stroke(p, [...along(0.08, -R(10)), ...along(0.3, -R(10.5)), ...along(0.7, -R(8))], m.skinLit, 'nearArm');
      stroke(p, [...along(0.45, R(11.5)), ...along(0.78, R(10))], m.skinDark, 'nearArm');
      if (m.paint) {
        for (const f of [0.35, 0.62]) {
          const [bx, by] = at(na.sx, na.sy, ua, ul * f);
          const nx = Math.cos((ua + 90) * DEG), ny = Math.sin((ua + 90) * DEG), tx = Math.cos(ua * DEG) * 1.4, ty = Math.sin(ua * DEG) * 1.4;
          p.poly([bx - nx * R(13) - tx, by - ny * R(13) - ty, bx - nx * R(13) + tx, by - ny * R(13) + ty, bx + nx * R(13) + tx, by + ny * R(13) + ty, bx + nx * R(13) - tx, by + ny * R(13) - ty], m.paint, { part: 'nearArm', paint: true });
        }
      }
      const fa = Math.atan2(na.hy - na.ey, na.hx - na.ex) / DEG;
      bracer(p, m, na.ex, na.ey, na.hx, na.hy, R(14), R(12), 0, 'nearBracer');
      fist(p, m, m.armN, na.hx, na.hy, fa, R(11), 0, 'fistN');

      // Край горба над ближним плечом — поверх верха руки, рваной бахромой.
      const over = [...S(30, 50, 42, 45, 56, 48, 70, 50, 84, 52), ...furEdge(S(86, 56, 70, 58, 56, 58, 42, 56, 32, 54), R(4.5), R(4.5), -1, 0)];
      p.poly(over, m.mantle, { part: 'fur', bevel: 3, flat: 0.3, lift: 3 });
      locks(p, m.mantle, 'fur', S(80, 51, 66, 50, 52, 49, 40, 48), { step: R(8), len: R(9), w: R(3), dir: fromNeck, gap: m.furGap, tone: 0.14, shift: 0.25 });
    });

    if (berserkProbe.on) {
      const toWorld = (x: number, y: number): [number, number] => {
        const c = Math.cos(rot), s = Math.sin(rot);
        return [PELVIS[0] + c * (x - PELVIS[0]) - s * (y - PELVIS[1]) + up.dx, PELVIS[1] + s * (x - PELVIS[0]) + c * (y - PELVIS[1]) + up.dy];
      };
      const [hwx, hwy] = toWorld(farA.hx, farA.hy);
      // Конец оружия — нижний рог лезвия: он ближе всего к земле.
      const [tx, ty] = toWorld(...at(farA.hx, farA.hy, P.sw, AXE_GRIP));
      berserkProbe.on({ ...probeInfo, hipX: hipX + P.x, hipY: hipY + P.y, handX: hwx + P.x, handY: hwy + P.y, tipX: tx + P.x, tipY: ty + P.y + 25, ground: G });
    }
  });
}

/** Рука от плеча `sh` к кисти (hx, hy): локоть — ik, сгиб в сторону (dx, dy). */
function arm(sh: readonly number[], hx: number, hy: number, L2: { l1: number; l2: number }, dx: number, dy: number): { sx: number; sy: number; ex: number; ey: number; hx: number; hy: number } {
  const [sx, sy] = sh;
  const vx = hx - sx, vy = hy - sy, d = Math.hypot(vx, vy), reach = L2.l1 + L2.l2 - 0.05;
  if (d > reach) {
    hx = sx + (vx * reach) / d;
    hy = sy + (vy * reach) / d;
  }
  const [ex, ey] = ik(sx, sy, hx, hy, L2.l1, L2.l2, dx, dy);
  return { sx, sy, ex, ey, hx, hy };
}

/**
 * Наруч — кожаная обмотка от чуть ниже локтя до кулака, с плоским верхним краем (капсула закрывала локоть и низ плеча),
 * `w0`/`w1` — полуширина сверху и у запястья; поперёк — тёмные стыки и светлый ремень.
 */
function bracer(p: Painter, m: Mats, ex: number, ey: number, hx: number, hy: number, w0: number, w1: number, tone: number, part: string): void {
  const fa = Math.atan2(hy - ey, hx - ex) / DEG, l = len([ex, ey], [hx, hy]);
  const nx = Math.cos((fa + 90) * DEG), ny = Math.sin((fa + 90) * DEG);
  const [ax, ay] = at(ex, ey, fa, l * 0.16), [bx, by] = at(ex, ey, fa, l * 0.94);
  p.poly([ax - nx * w0, ay - ny * w0, ax + nx * w0, ay + ny * w0, bx + nx * w1, by + ny * w1, bx - nx * w1, by - ny * w1], m.bracer, { part, bevel: Math.min(w0, w1) * 0.8, tone });
  for (const [f, c] of [[0.3, m.seam], [0.52, m.lace], [0.58, m.lace], [0.8, m.seam]] as const) {
    const [cx, cy] = at(ex, ey, fa, l * f);
    const w = lerp(w0, w1, (f - 0.16) / 0.78);
    stroke(p, [cx - nx * w, cy - ny * w - 0.8, cx + nx * w, cy + ny * w + 0.8], c, part);
  }
  // Светлый край обмотки сверху.
  stroke(p, [ax - nx * w0 * 0.9, ay - ny * w0 * 0.9 + 0.7, ax + nx * w0 * 0.9, ay + ny * w0 * 0.9 + 0.7], m.lace, part);
}

/**
 * Кулак: шире предплечья, костяшки к врагам (по ходу предплечья `fa`), пальцы — тёмные черты поперёк, большой палец
 * сверху, блик.
 */
function fist(p: Painter, m: Mats, mat: Mat, x: number, y: number, fa: number, r: number, tone: number, part: string): void {
  p.ellipse(x, y, r * 1.15, r * 0.85, mat, { part, lift: 1.2, tone, rot: (fa + 90) * DEG });
  const ux = Math.cos(fa * DEG), uy = Math.sin(fa * DEG), nx = -uy, ny = ux;
  for (const t of [-0.35, 0.1, 0.55]) stroke(p, [x + nx * r * t + ux * r * 0.2, y + ny * r * t + uy * r * 0.2, x + nx * r * t + ux * r * 0.8, y + ny * r * t + uy * r * 0.8], m.skinDark, part);
  p.ellipse(x - nx * r * 0.75 - ux * r * 0.1, y - ny * r * 0.75 - uy * r * 0.1, r * 0.4, r * 0.34, mat, { part, lift: 2, tone: tone + 0.06 });
  p.poly([x - r * 0.7, y - r * 0.4, x - r * 0.25, y - r * 0.75, x + r * 0.1, y - r * 0.65, x - r * 0.35, y - r * 0.2], mat, { part, paint: true, tone: tone + 0.28 });
}
