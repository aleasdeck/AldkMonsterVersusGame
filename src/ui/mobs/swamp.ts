import { along, keys, mixPt, type Keys, type Mat, type Model, type Painter, type Pt } from './pixel';

/**
 * Враги Болот пиксельной лепкой (v0.52.2). Все смотрят влево — на героя; единица — пиксель поля боя,
 * рост от макушки до земли — как в `ENEMY_BODY_HEIGHT` (characterSizes.ts).
 * Цвета продолжают палитры прежних спрайтов (`sprite` в enemies.ts): пиявка оливковая, жаба зелёная с жёлтыми
 * глазами, огонёк мятный, утопленник серо-голубой, тритон бирюзовый и т. д. Болото мокрое: у кожи и слизи блик.
 */

/** Линия толщиной в `n` пикселей рисунка — сдвигом вниз: у крупных разновидностей (Мать жаб) рот и зрачок не тонут. */
function thick(p: Painter, x1: number, y1: number, x2: number, y2: number, color: string, n: number, step: number): void {
  for (let i = 0; i < n; i++) p.line(x1, y1 + i * step, x2, y2 + i * step, color);
}

/**
 * Локоть руки из плеча S к кисти H при длинах плеча `l1` и предплечья `l2`: сустав сгибается в сторону `bend`
 * (+1 — по часовой от направления S→H, то есть вниз у руки, протянутой к герою). Кисть дальше длины руки
 * подтягивается к ней, и рука выпрямляется.
 */
function joint(sx: number, sy: number, hx: number, hy: number, l1: number, l2: number, bend: number): { ex: number; ey: number; hx: number; hy: number } {
  const dx = hx - sx, dy = hy - sy;
  const len = Math.hypot(dx, dy) || 1e-6;
  const d = Math.min(l1 + l2 - 1e-3, len);
  const ux = dx / len, uy = dy / len;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return { ex: sx + ux * a - uy * h * bend, ey: sy + uy * a + ux * h * bend, hx: sx + ux * d, hy: sy + uy * d };
}

// ─── Жаба и Мать жаб ────────────────────────────────────────────────────────

const TOAD = {
  skin: { base: '#587430', shine: 0.3, tex: { kind: 'noise', scale: 2.5, amp: 0.14 } } as Mat,
  back: { base: '#3b5420', shine: 0.3, tex: { kind: 'spots', scale: 4, amp: 0.3, density: 0.35 } } as Mat,
  belly: { base: '#b4ad74', tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  sac: { base: '#cfc594', shine: 0.5, dither: 0 } as Mat,
  wart: { base: '#7e9436', shine: 0.4 } as Mat,
  mouth: { base: '#6a2a2a', dither: 0 } as Mat,
  tongue: { base: '#d0707a', shine: 0.7, dither: 0 } as Mat,
  egg: { base: '#aab47c', shine: 0.5, dither: 0 } as Mat,
};

/**
 * Вид жабы: рядовая и Мать жаб — одна анатомия; у матери икра в спине, роговые гребни над глазами и оранжевые глаза.
 * `k` — масштаб лепки: линии рта и зрачка у крупной жабы в два пикселя, иначе они теряются.
 */
interface ToadLook { M: typeof TOAD; mother: boolean; eye: string; glint: string; tongue: number; k: number }

/** Бородавки по спине и боку: [x, y, r]. */
const WARTS: Array<[number, number, number]> = [
  [35, 22, 1.8], [47, 20, 2.1], [57, 24, 1.8], [65, 29, 1.6], [43, 28, 1.5], [52, 31, 1.9], [61, 36, 1.5], [37, 33, 1.4],
  [45, 38, 1.3], [70, 41, 1.6], [66, 47, 1.4], [58, 43, 1.3], [30, 24, 1.2], [18, 25, 1.1],
];
/** Икринки Матери жаб, вросшие в спину: [x, y]. */
const EGGS: Array<[number, number]> = [[45, 20.5], [50.5, 19.5], [56, 21.5], [61, 25], [48, 25.5], [53.5, 26], [59, 29.5], [64.5, 31], [43, 27]];

function toadFigure(p: Painter, L: ToadLook): void {
  const M = L.M;
  const G = 58;
  const px = 2 / L.k;
  const lw = L.k > 1.5 ? 2 : 1;
  // Язык: замах — присесть назад, глаза сощурены; выпад — пасть настежь, язык выстреливает к герою липким комом.
  // Урон: отбросило, глаза втянуты, пасть раскрыта в кваканье.
  const { wind, strike } = p.attack();
  const hurt = p.hurt();
  // Горловой мешок раздувается трижды за цикл, бока дышат вместе с ним.
  const puff = p.clip === 'idle' ? (p.wave(3) + 1) / 2 : 0.5 * (1 - hurt);
  const breath = p.wave(3, 0.2);
  const hy = p.snap(0.5 * p.wave(3, 0.35));
  const open = 5 * strike + 1.5 * wind + 4 * hurt;
  const shut = hurt > 0.4 ? 1 : wind > 0.5 ? 0.5 : p.blink(0.62, 0.07);

  p.pose({ dx: -6 * strike + 3 * wind + 5 * hurt, rot: -0.04 * strike + 0.05 * wind + 0.07 * hurt, px: 70, py: G }, () => {
    p.shadow(44, 36, 3);

    // Дальние лапы: задняя стопа и передняя, темнее, за телом.
    p.limb(72, 55, 3, 58, 56, 2, M.skin, { part: 'far', tone: -0.15 });
    p.chain([[40, 44, 4.5], [37, 52, 3.4], [36, 55.5, 2.4]], M.skin, { part: 'far', tone: -0.15 });
    p.limb(36, 56.5, 1.5, 30, 57, 1, M.skin, { part: 'far', tone: -0.15 });

    // Дальний глазной бугор выглядывает из-за головы.
    p.ellipse(34, 12 + hy, 5, 4.5, M.skin, { part: 'farBrow', tone: -0.12 });

    // Туловище грушей: круп на земле, грудь приподнята; голова без шеи, тёмная спина, светлое брюхо.
    p.ellipse(48, 36, 28, 18.5 + 0.4 * breath, M.skin, { rot: 0.18 });
    p.ellipse(25, 28 + hy, 17.5, 13.5, M.skin);
    p.limb(22, 30 + hy, 11, 9, 33 + hy, 6.5, M.skin);
    p.ellipse(52, 25, 25, 10, M.back, { rot: 0.2, paint: true });
    p.ellipse(26, 20 + hy, 12, 6, M.back, { paint: true });
    p.ellipse(34, 45, 20, 8, M.belly, { paint: true, rot: 0.1 });
    // Околоушная железа — вал за глазом.
    p.ellipse(41, 19 + hy, 8.5, 4.5, M.back, { rot: 0.35, lift: 2.5 });
    for (const [x, y, r] of WARTS) {
      if (L.mother && EGGS.some(([ex, ey]) => Math.hypot(ex - x, ey - y) < 4)) continue;
      p.ellipse(x, y, r, r, M.wart, { lift: 1.5 });
    }
    if (L.mother) {
      // Икра вросла в спину: светлые студенистые шарики в ямках, в каждом тёмный зародыш.
      for (const [x, y] of EGGS) p.ellipse(x, y, 2.5, 2.3, M.egg, { part: 'eggs', lift: 1 });
      for (const [x, y] of EGGS) p.disc(x + 0.4, y + 0.5, 0.9, '#2a3218');
    }

    // Задняя лапа сложена: бедро валиком, длинная стопа на земле перед ним.
    p.ellipse(62, 44, 14, 11, M.skin, { part: 'thigh', rot: -0.3 });
    p.ellipse(64, 40, 10, 5, M.back, { part: 'thigh', rot: -0.3, paint: true });
    p.limb(66, 54, 3.8, 50, 56, 2, M.skin, { part: 'foot' });
    for (const [x, y] of [[48, 57], [51, 57], [45, 57]]) p.limb(x + 4, y - 1, 1.2, x, y, 1, M.skin, { part: 'foot' });

    // Горловой мешок под подбородком: светлый пузырь, раздувается и опадает.
    const sac = 2.4 * puff;
    p.ellipse(14 - sac * 0.4, 42 + hy + sac * 0.5, 6.5 + sac, 4 + sac, M.sac, { part: 'sac', lift: 2, flat: 0.3 });

    // Нижняя челюсть: в ударе и в кваканье откидывается, под ней тёмная пасть.
    p.pose({ rot: 0.1 * open / 5, px: 30, py: 37 + hy }, () => {
      p.limb(30, 37 + hy, 5, 8, 37 + hy + open * 0.5, 3.2, M.skin, { part: 'jaw', tone: -0.05 });
      p.limb(29, 39 + hy, 3, 10, 39 + hy + open * 0.5, 2, M.belly, { part: 'jaw', paint: true });
    });
    if (open > 1.2) p.poly([6, 34 + hy, 30, 35.5 + hy, 30, 37 + hy + open * 0.3, 9, 36.5 + hy + open], M.mouth, { part: 'maw', bevel: 1, noLine: true });

    // Язык: липкий ком на конце летит к герою, у контакта — дальше всего.
    if (strike > 0.05) {
      const reach = L.tongue * strike;
      const tx = 8 - reach, ty = 36 + hy + open * 0.4 + 2 * strike;
      p.chain([[12, 35.5 + hy, 2.4], [8 - reach * 0.5, 36 + hy + open * 0.3, 2], [tx + 2, ty, 2.2]], M.tongue, { part: 'tongue' });
      p.ellipse(tx, ty, 3.4, 3, M.tongue, { part: 'tongue', lift: 1 });
    }

    // Передняя лапа: локоть в сторону, растопыренные пальцы на земле.
    p.chain([[30, 42 + hy * 0.5, 5], [23, 49, 3.8], [20, 54.5, 2.8]], M.skin, { part: 'near' });
    for (const [x, y] of [[13, 57], [16, 57], [20, 57], [23.5, 57]]) p.limb(20, 55.5, 1.3, x, y, 1, M.skin, { part: 'near' });

    // Рот: длинная линия до угла; ноздря; глаз на бугре — жёлтый, с горизонтальным зрачком.
    thick(p, 6, 34 + hy, 18, 35.5 + hy, '#1e2410', lw, px);
    thick(p, 18, 35.5 + hy, 30, 36.5 + hy, '#1e2410', lw, px);
    p.px(9, 29.5 + hy, '#1e2410');
    const ey = 13 + hy + (shut >= 1 ? 2 : 0);
    p.ellipse(26.5, ey + 1, 7.5, 6.5, M.skin, { part: 'brow' });
    if (L.mother) p.poly([19, ey - 1.5, 25, ey - 7, 34, ey - 4, 27, ey - 3], M.back, { part: 'crest', lift: 2, bevel: 1 });
    if (shut >= 1) thick(p, 22, ey + 1, 30, ey + 1, '#1e2410', lw, px);
    else {
      p.eye(25.5, ey + 0.5, 3.8, L.eye, { closed: shut });
      if (!shut) {
        // Зрачок — тёмная горизонтальная щель по центру радужки, у крупной жабы в два пикселя.
        const pw = L.mother ? 6 : 3;
        p.block(25.5 - (pw * px) / 2, ey + 0.5 - (lw * px) / 2, pw, lw, '#141008');
        p.px(23.5, ey - 1.5, L.glint);
      }
    }
  });
}

export const toad: Model = {
  id: 'toad',
  w: 86,
  h: 60,
  ground: 58,
  // Язык в кадре контакта выстреливает на 44 единицы вперёд морды.
  pad: 54,
  draw(p: Painter) {
    toadFigure(p, { M: TOAD, mother: false, eye: '#ffd166', glint: '#fff6d8', tongue: 44, k: 1 });
  },
};

/**
 * Мать жаб — старая жаба: тон рядовой, но тусклее и темнее, брюхо и икра грязнее. Прежняя палитра (ярче жабы)
 * на крупной фигуре выбивалась из Болот: светлее и насыщеннее всех врагов набора.
 */
const MOTHER: typeof TOAD = {
  ...TOAD,
  skin: { base: '#596b3a', shine: 0.3, tex: { kind: 'noise', scale: 3, amp: 0.14 } },
  back: { base: '#3c4b27', shine: 0.3, tex: { kind: 'spots', scale: 6, amp: 0.3, density: 0.35 } },
  belly: { base: '#9a936c', tex: { kind: 'noise', scale: 2, amp: 0.1 } },
  sac: { base: '#ada582', shine: 0.5, dither: 0 },
  wart: { base: '#737e46', shine: 0.4 },
  egg: { base: '#8c906d', shine: 0.5, dither: 0 },
};

/** Мать жаб — та же жаба в два с лишним раза крупнее (рост 132 против 56). */
const MOTHER_SCALE = 132 / 56;

export const toadMother: Model = {
  id: 'toad_mother',
  w: Math.ceil(86 * MOTHER_SCALE),
  h: Math.ceil(60 * MOTHER_SCALE),
  ground: 58 * MOTHER_SCALE,
  // Язык короче жабьего в её мерке, но в кадре контакта всё равно уходит на 80 единиц вперёд.
  pad: 86,
  draw(p: Painter) {
    p.scope(MOTHER_SCALE, 0, 0, () => toadFigure(p, { M: MOTHER, mother: true, eye: '#ff9f1c', glint: '#ffe2b8', tongue: 32, k: MOTHER_SCALE }));
  },
};

// ─── Пиявка ─────────────────────────────────────────────────────────────────

const LEECH = {
  skin: { base: '#2e4529', shine: 0.9, tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  belly: { base: '#7c7e48', shine: 0.6 } as Mat,
  stripe: { base: '#b07a2c', dither: 0 } as Mat,
  sucker: { base: '#5c3a32', shine: 0.5, dither: 0 } as Mat,
};

/**
 * Хребет пиявки от хвостовой присоски к голове: перед тела поднят вопросительным знаком, голова смотрит на героя.
 * Позы клипов — те же точки в замахе (голова отведена, тело сжато пружиной), в броске (вытянута к герою) и в отдаче.
 */
const LEECH_REST: Pt[] = [[64, 33, 4.6], [57, 32, 6.6], [49, 31, 7.6], [41, 29.5, 7.6], [34, 26, 7], [29.5, 20, 6.2], [27.5, 13.5, 5.4], [24.5, 8, 4.8], [19.5, 5.5, 4.3], [14.5, 6.5, 3.9]];
const LEECH_WIND: Array<[number, number]> = [[64, 33], [58, 32], [51, 30.5], [44, 27], [39, 21], [37, 14], [36, 8], [33, 3.5], [28, 2], [23, 3.5]];
const LEECH_HIT: Array<[number, number]> = [[64, 33], [56, 32.5], [47, 32], [38, 31], [29, 29.5], [20, 27.5], [11, 25.5], [3, 24], [-4, 23.5], [-10, 24]];
const LEECH_HURT: Array<[number, number]> = [[64, 33], [58, 31], [52, 28], [47, 23.5], [44, 17.5], [43, 11.5], [42, 6], [39, 2.5], [35, 1.5], [31, 3]];

export const leech: Model = {
  id: 'leech',
  w: 72,
  h: 38,
  ground: 36,
  // Бросок: присоска в кадре контакта — на 16 единиц левее рамки.
  pad: 26,
  draw(p: Painter) {
    const M = LEECH;
    // Присосаться: замах — голова отведена назад и вверх, тело сжато; бросок — вытянуться к герою, присоска раскрыта.
    // Урон: голову откинуло назад, тело сжалось, присоска стиснута.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const n = LEECH_REST.length;
    const calm = 1 - Math.max(wind, strike, hurt);
    // Волна сокращений бежит от хвоста к голове; поднятый перед покачивается, присоска пробует воздух.
    const spine: Pt[] = LEECH_REST.map(([x, y, r], i) => {
      const [mx, my] = mixPt([x, y], LEECH_WIND[i], LEECH_HIT[i], wind, strike);
      const w = i / (n - 1);
      const sway = calm * w * w;
      return [
        mx + (LEECH_HURT[i][0] - x) * hurt + sway * 2 * p.wave(1, 0.1),
        my + (LEECH_HURT[i][1] - y) * hurt + sway * 1.6 * p.wave(2, 0.3),
        r * (1 + 0.09 * p.wave(2, -i / 6)) * (1 + 0.15 * hurt * (1 - w)) * (1 - 0.12 * strike * w),
      ];
    });
    const open = hurt > 0.3 ? 0 : 0.3 + 0.4 * ((p.wave(3) + 1) / 2) * calm + 1.3 * strike + 0.5 * wind;

    p.pose({ dx: -3 * strike + 2 * wind + 3 * hurt, px: 64, py: 36 }, () => {
      p.shadow(40, 28, 2.4);
      // Задняя присоска плоским диском на земле.
      p.ellipse(64.5, 34, 6, 2.4, M.skin, { part: 'tailSucker', tone: -0.1, flat: 0.5 });
      p.chain(spine, M.skin, { part: 'body' });
      // Светлое брюхо снизу, по спине — рыжая полоса с тёмными крапинами, поперёк — кольца сегментов.
      const S = 34;
      for (let k = 0; k <= S; k++) {
        const { x, y, r, tx, ty } = along(spine, k / S);
        const sg = tx > 0 ? -1 : 1;
        const nx = -ty * sg, ny = tx * sg;
        p.disc(x - nx * r * 0.62, y - ny * r * 0.62, r * 0.3, '#7a7c4890');
        if (k % 2 === 0) p.px(x + nx * r * 0.45, y + ny * r * 0.45, '#b98233');
        if (k % 4 === 1 && k < S - 3) p.px(x + nx * r * 0.2, y + ny * r * 0.2, '#1c2412');
      }
      for (let k = 2; k < S - 2; k += 3) {
        const { x, y, r, tx, ty } = along(spine, k / S);
        p.line(x - ty * r * 0.8, y + tx * r * 0.8, x + ty * r * 0.8, y - tx * r * 0.8, '#162010a0');
      }
      // Голова: ротовая присоска смотрит на героя; вокруг тёмного рта — кольцо светлых зубчиков, над ним глазки.
      const [hx, hy, hr] = spine[n - 1];
      const [ax, ay] = spine[n - 2];
      const dx = hx - ax, dy = hy - ay, l = Math.hypot(dx, dy) || 1;
      const fx = hx + (dx / l) * hr * 0.7, fy = hy + (dy / l) * hr * 0.7;
      const rot = Math.atan2(dy, dx);
      p.ellipse(fx, fy, 1.6 + open * 0.7, hr * (0.85 + open * 0.3), M.sucker, { part: 'sucker', rot, lift: 1 });
      if (open > 0.9) {
        p.disc(fx + (dx / l) * 0.3, fy + (dy / l) * 0.3, 0.9 * open, '#1e0c10');
        for (let k = 0; k < 5; k++) {
          const a = rot + Math.PI / 2 + (k - 2) * 0.6;
          p.px(fx + Math.cos(a) * hr * 0.8, fy + Math.sin(a) * hr * 0.8, '#e8e0c4');
        }
      } else p.px(fx + dx / l, fy + dy / l, '#1e0c10');
      // Спинная сторона головы — поперёк хода тела, вверх: там пара светлых глазков.
      const ux = -dy / l, uy = dx / l, sg = uy > 0 ? -1 : 1;
      if (hurt < 0.4) {
        for (const back of [1.5, 4]) p.px(hx + sg * ux * hr * 0.55 - (dx / l) * back, hy + sg * uy * hr * 0.55 - (dy / l) * back, '#d0d0a0');
      }
    });
  },
};

// ─── Болотный огонёк ────────────────────────────────────────────────────────

const WISP = {
  outer: { base: '#3aa874', glow: true, dither: 0, ramp: ['#1f5a3e', '#2e7c55', '#3fa06c', '#57bf86', '#74d69c'] } as Mat,
  mid: { base: '#a0ffc0', glow: true, dither: 0, ramp: ['#5ecf8e', '#7ee2a4', '#9df0ba', '#bdf8d0', '#d8fde4'] } as Mat,
  core: { base: '#f0fff4', glow: true, dither: 0, noOutline: true, ramp: ['#c8f8da', '#dcfce6', '#ebfff1', '#f6fff9', '#ffffff'] } as Mat,
};

export const willOWisp: Model = {
  id: 'will_o_wisp',
  w: 56,
  h: 48,
  ground: 46,
  flies: true,
  // Язык пламени в кадре контакта — на 24 единицы левее рамки.
  pad: 30,
  draw(p: Painter) {
    const M = WISP;
    // Опаление: замах — пламя сжимается и отступает, разгораясь; выпад — бросок к герою, язык огня вытянут вперёд.
    // Урон: пламя сбито и гаснет, глаза зажмурены, искры разлетаются.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const bob = p.bob(2, 1);
    // Языки пламени пляшут: у каждого своя волна, целое число периодов за цикл — кольцо замыкается.
    const f1 = p.wave(4, 0.1), f2 = p.wave(3, 0.45), f3 = p.wave(5, 0.7);
    const flare = p.blink(0.5, 0.12);
    const cx = 28, cy = 31 + bob;
    const squash = 1 - 0.35 * hurt;
    const lean = -9 * strike + 3 * wind;

    p.pose({ dx: -12 * strike + 3 * wind + 5 * hurt, dy: -2 * wind + 2 * strike + 3 * hurt, px: cx, py: cy }, () => {
      // Отсвет на полу вместо тени: огонёк светит, а не заслоняет.
      p.line(cx - 9, 46, cx + 9, 46, '#a0ffc02a');
      p.line(cx - 5, 45, cx + 5, 45, '#a0ffc03a');
      p.glow(cx, cy - 4, 17 + 3 * flare + 4 * wind, '#a0ffc0', 0.16 + 0.08 * flare + 0.1 * wind - 0.08 * hurt);
      // Внешнее пламя: шар снизу, три языка вверх; в выпаде верхний язык тянется к герою.
      const tip = (dx: number, len: number, w: number): [number, number] => [cx + dx + lean * (len / 22), cy - len * squash + w];
      const [t1x, t1y] = tip(f1 * 1.5, 20 + 2 * flare + 3 * wind, 0);
      const [t2x, t2y] = tip(-6 + f2, 15 + 2 * f3, 0);
      const [t3x, t3y] = tip(6 - f3, 16 + 2 * f2, 0);
      p.ellipse(cx, cy + 1, 10, 9.5 * squash, M.outer, { part: 'flame' });
      p.chain([[cx, cy - 4, 8], [(cx + t1x) / 2 + f2 * 0.8, (cy + t1y) / 2, 4.5], [t1x, t1y, 1]], M.outer, { part: 'flame' });
      p.chain([[cx - 4, cy - 2, 5], [t2x, t2y, 1]], M.outer, { part: 'flame' });
      p.chain([[cx + 4, cy - 2, 5], [t3x, t3y, 1]], M.outer, { part: 'flame' });
      if (strike > 0.3) {
        // Язык огня выброшен к герою.
        const reach = 16 * strike;
        p.chain([[cx - 6, cy, 5], [cx - 8 - reach * 0.6, cy - 1, 3.5], [cx - 10 - reach, cy - 2, 1.2]], M.outer, { part: 'flame' });
        p.chain([[cx - 5, cy, 3], [cx - 8 - reach * 0.7, cy - 1, 1.5]], M.mid, { part: 'mid' });
      }
      // Светлая сердцевина и белое ядро.
      p.ellipse(cx, cy + 1.5, 7, 6.8 * squash, M.mid, { part: 'mid' });
      p.chain([[cx, cy - 2, 5.5], [cx + f1 * 1.2 + lean * 0.4, cy - 14 * squash - 2 * flare, 1]], M.mid, { part: 'mid' });
      p.ellipse(cx - 0.5, cy + 2, 4.2, 4 * squash, M.core, { part: 'core' });
      // Лицо: тёмные глазницы, в выпаде раскрытый рот.
      const shut = hurt > 0.4 ? 1 : p.blink(0.22, 0.05);
      if (shut >= 1) {
        p.line(cx - 4, cy + 1, cx - 2, cy + 1, '#1a5a3a');
        p.line(cx + 1, cy + 1, cx + 3, cy + 1, '#1a5a3a');
      } else {
        p.block(cx - 4, cy - 0.5, 1, 2 - shut, '#124a30');
        p.block(cx + 1.5, cy - 0.5, 1, 2 - shut, '#124a30');
      }
      if (strike > 0.3 || hurt > 0.4) p.block(cx - 1.5, cy + 3, 2, 1, '#124a30');
      // Искры кружат вокруг пламени.
      const sparks = hurt > 0.3 ? 6 : 3;
      for (let k = 0; k < sparks; k++) {
        const a = 2 * Math.PI * (p.t + k / sparks) + hurt * 2;
        const r = 13 + 6 * hurt + (k % 2) * 2;
        p.px(cx + r * Math.cos(a), cy - 6 + r * 0.7 * Math.sin(a), k % 2 ? '#d8ffe4' : '#a0ffc0');
      }
    });
  },
};

// ─── Комариный рой ──────────────────────────────────────────────────────────

const GNAT = {
  body: { base: '#8a8266', tex: { kind: 'noise', scale: 1.5, amp: 0.12 } } as Mat,
  far: { base: '#646050', dither: 0 } as Mat,
  blood: { base: '#962c2c', shine: 0.9, dither: 0 } as Mat,
};

/** Комар роя: [x, y, размер, глубина −1..0 (дальние темнее), налит кровью, фаза облёта]. */
type Gnat = [number, number, number, number, boolean, number];
const GNATS: Gnat[] = [
  [8, 18, 0.8, -0.3, false, 0.3], [58, 14, 0.75, -0.35, true, 0.8], [60, 40, 0.8, -0.35, false, 0.55],
  [36, 16, 1.15, -0.12, false, 0.65], [46, 32, 1.7, -0.04, false, 0.45], [18, 30, 2.1, 0, true, 0],
];
/** Мошкара вдали: точки со своим облётом. */
const SPECKS: Array<[number, number, number]> = [[4, 28, 0.2], [30, 26, 0.5], [60, 24, 0.7], [58, 44, 0.15], [30, 44, 0.85], [2, 12, 0.4], [62, 12, 0.6], [22, 10, 0.9], [4, 42, 0.75]];

/**
 * Прозрачный лепесток крыла: клетки внутри повёрнутого эллипса, каждая ровно одним пикселем — наложенные
 * полупрозрачные декали движок сделал бы непрозрачными. Сетка рисунка у роя — 2 единицы от чётного поля.
 */
function wing(p: Painter, x0: number, y0: number, len: number, wid: number, ang: number, color: string): void {
  const c = Math.cos(ang), s = Math.sin(ang);
  const cx = x0 + c * len, cy = y0 + s * len;
  const R = len + 2;
  for (let y = Math.floor((cy - R) / 2) * 2; y <= cy + R; y += 2) {
    for (let x = Math.floor((cx - R) / 2) * 2; x <= cx + R; x += 2) {
      const dx = x + 1 - cx, dy = y + 1 - cy;
      const u = (dx * c + dy * s) / len, v = (-dx * s + dy * c) / wid;
      if (u * u + v * v <= 1) p.px(x + 1, y + 1, color);
    }
  }
}

/**
 * Комар боком, хоботком к герою: горбатая грудь, тонкое брюшко в светлых кольцах (у сытых — налитое кровью),
 * длинные ноги с белыми перехватами, прозрачное крыло в каждом кадре то поднято, то опущено — рой звенит.
 */
function gnat(p: Painter, x: number, y: number, k: number, tone: number, blood: boolean, up: boolean, part: string): void {
  const M = GNAT;
  const far = tone < -0.2;
  const mat = far ? M.far : M.body;
  const leg = far ? '#2c2c24' : '#26261e';
  const band = far ? '#8a8a70' : '#d8d8b8';
  // Ноги свисают: передняя вперёд-вниз, задняя назад, у обеих колено в белом перехвате.
  p.line(x - 1 * k, y + 2 * k, x - 3.5 * k, y + 4.5 * k, leg);
  p.line(x - 3.5 * k, y + 4.5 * k, x - 4.5 * k, y + 8 * k, leg);
  p.line(x + 1.5 * k, y + 2 * k, x + 5 * k, y + 5 * k, leg);
  p.line(x + 5 * k, y + 5 * k, x + 7 * k, y + 8.5 * k, leg);
  if (k > 0.8) {
    p.px(x - 3.5 * k, y + 4.5 * k, band);
    p.px(x + 5 * k, y + 5 * k, band);
  }
  // Хоботок тянется к герою.
  p.line(x - 4 * k, y + 1.8 * k, x - 10 * k, y + 4.5 * k, '#1e1e18');
  // Одно тело — одна часть: у мелкой фигуры линии между грудью, головой и брюшком съели бы весь цвет.
  p.limb(x + 2 * k, y + 0.8 * k, 1.7 * k, x + 10 * k, y + 4.8 * k, 0.9 * k, blood ? M.blood : mat, { part, tone });
  if (!blood && k > 0.8) {
    for (const f of [0.3, 0.55, 0.8]) p.px(x + (2 + 8 * f) * k, y + (0.8 + 4 * f) * k - 1.2 * k * (1 - f * 0.4), band);
  }
  p.ellipse(x, y, 2.7 * k, 2.4 * k, mat, { part, tone });
  p.ellipse(x - 3 * k, y + 1 * k, 1.5 * k, 1.4 * k, mat, { part, tone });
  if (k > 0.8) p.px(x - 3.4 * k, y + 0.6 * k, '#c04040');
  // Крыло от груди назад: поднято или опущено.
  wing(p, x + 0.5 * k, y - 1.5 * k, 4.5 * k, 1.7 * k, up ? -1.25 : -0.25, far ? '#d0d0b060' : '#e8e8cc90');
}

export const mosquitoSwarm: Model = {
  id: 'mosquito_swarm',
  w: 66,
  h: 56,
  ground: 54,
  flies: true,
  ownHeight: 'парит: рой висит на уровне груди героя, в рамку от макушки до пола входит просвет под ним',
  // В кадре контакта передние комары уже у героя — на 44 единицы левее рамки.
  pad: 54,
  draw(p: Painter) {
    // Укусы: замах — рой сжимается в тучу; выпад — рой струёй бросается на героя, передние впереди.
    // Урон: рой разметало во все стороны, потом он собирается обратно.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const tick = p.clip === 'idle' ? Math.round(p.t * p.frames) : Math.round(p.u * 12);
    const cx = 32, cy = 29;
    // Где комар в кадре: облёт вокруг своего места (частоты целые — цикл замыкается, у каждого своя), сжатие, бросок и разлёт.
    const at = (x: number, y: number, ph: number, depth: number): [number, number] => {
      const fx = 2 + Math.round(ph * 3), fy = 3 + Math.round(ph * 2);
      const ox = 4 * Math.sin(2 * Math.PI * (p.t * fx + ph)) * (1 - strike);
      const oy = 3 * Math.sin(2 * Math.PI * (p.t * fy + ph * 1.7)) * (1 - strike);
      const lead = 1 - x / 64;
      const sx = -30 - 14 * lead + 8 * depth, sy = (cy - y) * 0.6;
      const wx = 6 + (cx - x) * 0.4, wy = (cy - y) * 0.4;
      const hx = (x - cx) * 0.6 + 5, hy = (y - cy) * 0.6 - 3;
      return [p.snap(x + ox + sx * strike + wx * wind + hx * hurt), p.snap(y + oy + sy * strike + wy * wind + hy * hurt)];
    };
    p.shadow(cx, 20, 2, 0.14);
    // Рой висит над полом на уровне груди героя, а не ползает по настилу (сдвиг чётный — сетка крыльев не сбивается).
    p.pose({ dy: -16 }, () => {
      // Светлая дымка роя: мошкара ловит лунный свет.
      const [hx, hy] = at(cx, cy, 0, -0.5);
      p.glow(hx, hy + 2, 30 - 8 * wind + 8 * hurt, '#c8c8a0', 0.14);
      for (const [x, y, ph] of SPECKS) {
        const [sx, sy] = at(x, y, ph, -1);
        p.px(sx, sy, '#34342a');
        if ((tick + Math.round(ph * 10)) % 2) p.px(sx + 2, sy - 2, '#e0e0c070');
      }
      GNATS.forEach(([x, y, k, depth, blood, ph], i) => {
        const [gx, gy] = at(x, y, ph, depth);
        gnat(p, gx, gy, k, depth, blood, (tick + i) % 2 === 0, `gnat${i}`);
      });
    });
  },
};

// ─── Кикимора ───────────────────────────────────────────────────────────────

const KIKI = {
  skin: { base: '#7a9a6a', tex: { kind: 'noise', scale: 2.5, amp: 0.12 } } as Mat,
  hair: { base: '#2c3c22', shag: 0.3, tex: { kind: 'fur', scale: 2, amp: 0.26, stretch: 3, angle: 1.45 } } as Mat,
  dress: { base: '#3a4a2a', shag: 0.2, tex: { kind: 'stripes', scale: 2.6, amp: 0.08, angle: 1.5 } } as Mat,
  weed: { base: '#5c7a36', dither: 0 } as Mat,
  leg: { base: '#4a5236', tex: { kind: 'stripes', scale: 1.5, amp: 0.12 } } as Mat,
  claw: { base: '#b6cc9c', shine: 0.5, dither: 0 } as Mat,
};

/**
 * Мах когтями: направления плеча и предплечья по ходу клипа, градусы (90 — вниз, 180 — к герою, 270 — вверх).
 * Замах — рука взлетает над головой, когти за макушкой; контакт — рука вытянута к герою во всю длину;
 * потом добивает вниз и возвращается в покой.
 */
const SWIPE_UPPER: Keys = [[0, 128], [0.14, 235], [0.3, 252], [0.43, 215], [0.57, 178], [0.72, 142], [0.86, 128], [1, 122]];
const SWIPE_FORE: Keys = [[0, 172], [0.14, 282], [0.3, 298], [0.43, 238], [0.57, 181], [0.72, 158], [0.86, 166], [1, 170]];

export const kikimora: Model = {
  id: 'kikimora',
  w: 82,
  h: 96,
  ground: 94,
  // Когти в верхней точке замаха выше макушки, в кадре контакта — на 20 единиц левее рамки.
  pad: 30,
  draw(p: Painter) {
    const M = KIKI;
    const G = 94;
    // Царапины: замах — когтистая рука взлетает над головой; удар — наотмашь вниз к герою, тело подаётся следом.
    // Урон: отбросило, голова запрокинута, космы взлетели, глаза зажмурены, рот раскрыт.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    // Сутулая, дышит горбом; космы колышутся, пальцы шевелятся; раз за цикл — хитрый смешок: голова набок, рот до ушей.
    const by = p.bob(1.2, 2);
    const sway = p.wave(1, 0.2);
    const giggle = p.clip === 'idle' ? p.blink(0.42, 0.14) : 0;
    const twitch = p.wave(3, 0.1);

    p.pose({ dx: -6 * strike + 2 * wind + 5 * hurt, rot: 0.05 * wind - 0.08 * strike + 0.07 * hurt, px: 38, py: G }, () => {
      p.shadow(40, 24, 3);

      // Птичьи ноги из-под подола: голень, пальцы с когтями вперёд и один назад.
      const foot = (x: number, part: string, tone = 0): void => {
        p.limb(x + 2, 72, 2.6, x, 88, 2, M.leg, { part, tone });
        for (const [tx, ty] of [[x - 9, 93], [x - 6, 94], [x - 2, 94]]) p.limb(x, 89, 1.6, tx, ty, 1, M.leg, { part, tone });
        p.limb(x, 89, 1.4, x + 5, 93, 1, M.leg, { part, tone });
        for (const [tx, ty] of [[x - 9, 93], [x - 6, 94], [x - 2, 94]]) p.px(tx - 1, ty, '#c8d0a8');
      };
      foot(47, 'far', -0.15);

      // Дальняя рука висит вдоль тела, когти до колен.
      p.chain([[46, 40 + by, 3], [52, 52 + by, 2.4], [50, 62 + by, 2]], M.skin, { part: 'farArm', tone: -0.15 });
      for (const [tx, ty] of [[46, 70], [49, 71], [52, 70]]) p.limb(50, 63 + by, 1.2, tx + twitch * 0.5, ty + by, 0.7, M.claw, { part: 'farArm', tone: -0.15 });

      // Космы за спиной свисают до пояса — плащом поверх горба.
      p.poly([36, 16 + by, 58, 18 + by, 68 + sway, 44, 70 + sway * 1.5, 64, 60 + sway, 58, 54, 66, 46, 50, 38, 30 + by], M.hair, { part: 'hairBack', bevel: 4, tone: -0.05 });

      // Балахон из тины и осоки: мешком до колен, рваный подол, нитки водорослей и ряска.
      p.poly([
        28, 34 + by, 46, 30 + by, 56, 44, 62, 62, 63 + sway * 0.5, 75, 58, 71, 54, 77, 49, 72, 44, 78, 39, 72, 34, 77, 29, 71, 24 + sway * 0.3, 76, 20, 70, 22, 54,
      ], M.dress, { bevel: 6 });
      p.ellipse(44, 36 + by, 13, 9, M.dress, { rot: -0.4 });
      for (const [x, y] of [[30, 48], [42, 56], [50, 44], [36, 62], [52, 60], [28, 60]]) p.px(x, y + (y < 50 ? by : 0), '#7a9a44');
      p.chain([[54, 64], [55 + sway, 72], [54 + sway * 1.5, 80]].map(([x, y]) => [x, y, 0.8] as [number, number, number]), M.weed, { part: 'strand' });
      p.chain([[26, 64], [25 + sway * 0.6, 72], [26 + sway, 79]].map(([x, y]) => [x, y, 0.7] as [number, number, number]), M.weed, { part: 'strand' });

      foot(33, 'near');

      // Голова вперёд и вниз: длинный крючковатый нос, ухмылка, глаза горят из-под косм.
      p.pose({ dx: p.snap(-2 * strike + 2 * hurt), dy: by + p.snap(wind - strike - 2 * hurt), rot: 0.12 * giggle + 0.05 * wind - 0.08 * strike + 0.24 * hurt, px: 32, py: 34 }, () => {
        const flip = 5 * hurt;
        // Дальние космы — за головой.
        p.poly([28, 14, 44, 10, 50 + flip, 30 - flip, 46, 40, 38, 36], M.hair, { part: 'hairFar', bevel: 3, tone: -0.1 });
        p.ellipse(28, 26, 9, 9.5, M.skin, { part: 'head' });
        p.limb(24, 30, 6, 21, 36, 4.5, M.skin, { part: 'head' });
        p.limb(22, 25, 3, 9, 33, 1.6, M.skin, { part: 'nose', lift: 3 });
        p.limb(9, 33, 1.6, 8, 36, 1.1, M.skin, { part: 'nose', lift: 3 });
        const grin = giggle + strike * 0.6;
        const mo = hurt > 0.4 ? 3 : 1.5 * grin;
        if (mo > 1) {
          p.poly([14, 35, 26, 34.5 - grin, 25, 36 + mo, 16, 37 + mo * 0.6], M.hair, { part: 'mouth', bevel: 0.8, tone: -0.5 });
          p.px(17, 36, '#e8e4c8');
          p.px(21, 36, '#e8e4c8');
        } else {
          p.line(14, 36, 20, 36.5, '#1a2412');
          p.line(20, 36.5, 26, 34.5 - grin, '#1a2412');
          p.px(18, 37, '#e8e4c8');
        }
        // Чёлка косм свисает до глаз, пряди по щеке.
        p.poly([19, 18, 30, 12, 40, 16, 38 + flip, 30, 33, 24, 28, 21, 24, 23, 21, 22], M.hair, { part: 'hair', bevel: 3 });
        p.chain([[32, 22, 2.2], [34 + sway * 0.5, 32, 1.6], [33 + sway, 40, 1]], M.hair, { part: 'hair' });
        // В космах запутались листья ряски.
        for (const [x, y] of [[26, 17], [33, 14], [37, 20]]) p.px(x, y, '#7a9a44');
        const shut = hurt > 0.4 ? 1 : giggle > 0.4 ? 0.5 : p.blink(0.8);
        p.eye(21.5, 26, 1.3, '#e6f27a', { closed: shut, glint: '#fbffd8' });
        p.eye(26.5, 25.5, 1.3, '#e6f27a', { closed: shut, glint: '#fbffd8' });
      });

      // Ближняя рука: длинная, костлявая, согнута у груди, когти растопырены к герою. В ударе — мах наотмашь.
      const deg = Math.PI / 180;
      const a1 = (p.clip === 'attack' ? keys(SWIPE_UPPER, p.u) : 122) * deg - 0.5 * hurt;
      const a2 = ((p.clip === 'attack' ? keys(SWIPE_FORE, p.u) : 170) + 4 * twitch) * deg - 0.7 * hurt;
      const sx = 32, sy = 38 + by;
      const ex = sx + 13 * Math.cos(a1), ey = sy + 13 * Math.sin(a1);
      const hx = ex + 11 * Math.cos(a2), hy = ey + 11 * Math.sin(a2);
      p.chain([[sx, sy, 3.4], [ex, ey, 2.6], [hx, hy, 2.2]], M.skin, { part: 'nearArm' });
      p.ellipse(hx - Math.cos(a2), hy - Math.sin(a2), 2.8, 2.4, M.skin, { part: 'nearArm' });
      const spread = 0.12 * twitch;
      for (const f of [-0.75, -0.25, 0.25, 0.7]) {
        const a = a2 + f * (0.9 + spread) - 0.15;
        const mx = hx + 5 * Math.cos(a + 0.25), my = hy + 5 * Math.sin(a + 0.25);
        p.chain([[hx, hy, 1.2], [mx, my, 0.9], [mx + 5 * Math.cos(a - 0.3), my + 5 * Math.sin(a - 0.3), 0.6]], M.claw, { part: 'claws' });
      }
    });
  },
};

// ─── Утопленник ─────────────────────────────────────────────────────────────

const DROWNED = {
  skin: { base: '#8fa8a0', shine: 0.45, tex: { kind: 'spots', scale: 5, amp: 0.25, density: 0.3 } } as Mat,
  feet: { base: '#6a8078', shine: 0.3, tex: { kind: 'spots', scale: 3, amp: 0.25, density: 0.4 } } as Mat,
  hair: { base: '#34443a', shine: 0.5, dither: 0 } as Mat,
  shirt: { base: '#58685c', tex: { kind: 'stripes', scale: 2.5, amp: 0.1, angle: 1.4 } } as Mat,
  pants: { base: '#2c3c32', tex: { kind: 'stripes', scale: 3, amp: 0.08, angle: 1.57 } } as Mat,
  rope: { base: '#6e5e3e', tex: { kind: 'stripes', scale: 1.2, amp: 0.2, angle: 0.8 } } as Mat,
  weed: { base: '#3e5c36', shag: 0.3, tex: { kind: 'fur', scale: 1.5, amp: 0.2, stretch: 3, angle: 1.5 } } as Mat,
  iron: { base: '#6a7a70', shine: 0.5, tex: { kind: 'noise', scale: 1.5, amp: 0.3 } } as Mat,
  mouth: { base: '#2a1c22', dither: 0 } as Mat,
  hollow: { base: '#1e2a26', dither: 0 } as Mat,
};

/**
 * Руки утопленника по ходу удара: направления плеча и предплечья, градусы (90 — вниз, 180 — к герою, 270 — вверх).
 * В покое руки вытянуты к герою и безвольно висят в запястьях, как у всплывшего мертвеца.
 */
const GRAB_UPPER: Keys = [[0, 150], [0.14, 222], [0.3, 236], [0.43, 208], [0.57, 180], [0.72, 162], [0.86, 150], [1, 146]];
const GRAB_FORE: Keys = [[0, 168], [0.14, 250], [0.3, 266], [0.43, 222], [0.57, 184], [0.72, 170], [0.86, 164], [1, 162]];

export const drowned: Model = {
  id: 'drowned',
  w: 86,
  h: 112,
  ground: 110,
  // Руки в кадре контакта вытянуты к герою — пальцы на 24 единицы левее рамки.
  pad: 34,
  draw(p: Painter) {
    const M = DROWNED;
    const G = 110;
    // Хватка: замах — руки взлетают над головой, корпус откинут; выпад — навалиться вперёд, руки хватают героя.
    // Урон: голову отбросило, с волос и плеч летят брызги, пустые глазницы зажмурены, рот разинут.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    // Покачивается, как в воде; челюсть отвисает и подбирается; цепь на запястье качается; с пальцев срывается капля.
    const lurch = p.wave(1);
    const up = -p.bob(1.2, 2, 0.15);
    const jaw = 1 + (p.wave(2, 0.4) + 1) * 0.8 + 3 * strike + 2 * wind + 3 * hurt;
    const swing = p.wave(1, 0.25) * (1 - strike) + 1.5 * hurt - 1.2 * strike;
    const drop = p.clip === 'idle' && p.t > 0.3 && p.t < 0.55 ? (p.t - 0.3) / 0.25 : -1;
    const deg = Math.PI / 180;
    // Рука: плечо в рукаве, голое предплечье, кисть висит в запястье (в ударе — растопырена, хватает).
    const arm = (sx: number, sy: number, lag: number, part: string, tone: number): [number, number, number, number] => {
      // Дальняя рука отстаёт на долю клипа, но приходит в покой в тот же последний кадр.
      const k = Math.max(0, (p.u - lag) / (1 - lag));
      const a1 = (p.clip === 'attack' ? keys(GRAB_UPPER, k) : 146 + 3 * lurch) * deg + 0.5 * hurt;
      const a2 = (p.clip === 'attack' ? keys(GRAB_FORE, k) : 162 + 4 * lurch) * deg + 0.8 * hurt;
      const ex = sx + 15 * Math.cos(a1), ey = sy + 15 * Math.sin(a1);
      const hx = ex + 13 * Math.cos(a2), hy = ey + 13 * Math.sin(a2);
      p.chain([[sx, sy, 4.6], [ex, ey, 3.8]], M.shirt, { part, tone });
      p.limb(ex, ey, 3.2, hx, hy, 2.8, M.skin, { part, tone });
      // Кисть: в покое свисает пальцами вниз, в хватке раскрыта вперёд.
      const grab = Math.max(strike, wind * 0.6);
      const wa = a2 + (1 - grab) * 1.1;
      const fx = Math.cos(wa), fy = Math.sin(wa);
      p.ellipse(hx + fx * 2.5, hy + fy * 2.5, 3.2, 2.8, M.skin, { part, tone, rot: wa });
      for (const o of [-1.6, 0, 1.6]) p.limb(hx + fx * 4 - fy * o, hy + fy * 4 + fx * o, 1.1, hx + fx * 9 - fy * o * 1.3, hy + fy * 9 + fx * o * 1.3, 0.8, M.skin, { part, tone });
      return [hx, hy, fx, fy];
    };

    p.pose({ dx: -9 * strike + 3 * wind + 5 * hurt, rot: 0.02 * lurch + 0.05 * wind - 0.08 * strike + 0.06 * hurt, px: 40, py: G }, () => {
      p.shadow(40, 26, 3.5);
      // Мокрый след под ногами.
      p.line(24, G, 56, G, '#8ab0b050');

      // Дальняя нога: штанина разорвана до колена, босая ступня.
      p.chain([[47, 68, 7], [50, 90, 5.2]], M.pants, { part: 'far', tone: -0.12 });
      p.chain([[50, 92, 3], [51, 104, 2.3]], M.feet, { part: 'farShin', tone: -0.14 });
      p.poly([48, 105, 54, 105, 54, G, 44, G, 45, 107.5], M.feet, { part: 'farShin', tone: -0.16, bevel: 1.2 });
      // Дальняя рука.
      arm(50, 36 + up, 0.03, 'farArm', -0.14);

      p.chain([[34, 68, 7.5], [31, 88, 5.6]], M.pants, { part: 'near' });
      p.poly([26, 86, 37, 86, 37, 95, 34, 92, 31, 97, 28, 92, 25, 95], M.pants, { part: 'near', bevel: 1.5 });
      p.chain([[31, 94, 3], [30, 104, 2.5]], M.feet, { part: 'nearShin' });
      p.poly([27, 105, 33, 105, 33, G, 23, G, 24, 107.5], M.feet, { part: 'nearShin', tone: -0.05, bevel: 1.2 });

      // Раздутое тело в рваной рубахе, верёвка вместо пояса; из дыр видна кожа.
      p.ellipse(42, 58, 16.5, 14, M.shirt);
      p.ellipse(42, 42 + up, 16, 13, M.shirt);
      p.ellipse(45, 31 + up, 12, 8, M.shirt);
      p.poly([26, 64, 58, 64, 60, 74, 54, 71, 49, 76, 43, 71, 37, 76, 31, 71, 25, 74], M.shirt, { bevel: 3 });
      p.ellipse(34, 52, 4, 5, M.skin, { paint: true });
      p.ellipse(52, 47 + up, 3, 3.5, M.skin, { paint: true });
      p.ellipse(40, 66, 4.5, 3, M.skin, { paint: true });
      p.poly([25, 63, 59, 63, 59, 67, 25, 67], M.rope, { paint: true });

      // Голова свесилась вперёд: голый череп, мокрые пряди сосульками, пустые глазницы с бледными огоньками, отвисшая челюсть.
      p.pose({ dx: p.snap(-3 * strike + 2 * hurt), dy: up + p.snap(-wind + strike - 2 * hurt), rot: -0.06 * strike + 0.05 * wind + 0.28 * hurt, px: 40, py: 30 }, () => {
        p.limb(41, 31, 5.5, 37, 22, 5.5, M.skin, { part: 'neck' });
        p.limb(31, 24, 4.6, 29, 26 + jaw, 3.6, M.skin, { part: 'jaw', tone: -0.1 });
        p.ellipse(36, 15, 8.5, 9.5, M.skin, { part: 'head' });
        p.limb(32, 18, 5.5, 29, 22, 4.2, M.skin, { part: 'head' });
        p.limb(29, 13, 1.7, 26.5, 18.5, 1.5, M.skin, { part: 'nose', lift: 2 });
        p.poly([26, 22.5, 32, 23, 31, 24 + jaw, 27, 23.5 + jaw * 0.8], M.mouth, { part: 'mouth', bevel: 0.6 });
        p.ellipse(30, 14, 2.6, 2.3, M.hollow, { part: 'head', paint: true });
        p.ellipse(35.5, 13.5, 2.4, 2.3, M.hollow, { part: 'head', paint: true });
        const shut = hurt > 0.4;
        if (!shut && !p.blink(0.7, 0.04)) {
          p.px(30, 14, '#d8fff0');
          p.px(35.5, 13.5, '#d8fff0');
        }
        // Мокрые пряди налипли на череп и висят сосульками до плеч; ряска на макушке.
        p.ellipse(39, 7.5, 7.5, 3.5, M.hair, { part: 'hair', rot: 0.2 });
        for (const [x0, y0, x1, y1] of [[36, 5, 33, 13], [39, 5, 39, 22], [42, 6, 44, 26], [45, 9, 49, 28], [40, 6, 42, 18]]) {
          p.chain([[x0, y0, 1.4], [x1 + swing * 0.5 + 2 * hurt, y1 - 4 * hurt, 0.7]], M.hair, { part: 'hair' });
        }
        for (const [x, y] of [[35, 5], [41, 4], [45, 8]]) p.px(x, y, '#7a9a44');
      });

      // Ближняя рука с кандалами: обрывок цепи раскачивается; с плеча свисают водоросли.
      const [hx, hy, fx, fy] = arm(34, 36 + up, 0, 'nearArm', 0);
      p.chain([[36, 30 + up, 2.6], [31, 38 + up, 2.2], [30 + swing, 47 + up, 1.6], [31 + swing * 1.5, 55, 1]], M.weed, { part: 'weed' });
      const cx = hx - fx, cy = hy - fy;
      p.ellipse(cx, cy, 3.4, 3.4, M.iron, { part: 'cuff' });
      for (let k = 1; k <= 4; k++) {
        const lx = cx + swing * k * 0.8 + 0.5 * k, ly = cy + 3 * k + 1;
        p.ellipse(lx, ly, k % 2 ? 1.2 : 1.6, k % 2 ? 1.8 : 1.2, M.iron, { part: `link${k % 2}` });
      }
      if (drop >= 0) p.disc(hx + fx * 9, hy + fy * 9 + drop * (G - hy - fy * 9 - 2), 0.9, '#b0d8d0');
      if (hurt > 0.3) {
        for (const [ox, oy] of [[-4, -4], [4, -8], [9, -2], [-2, -10]]) p.px(40 + ox * (1 + hurt) + 6, 10 + oy * (1 + hurt), '#c0e0d8');
      }
    });
  },
};

// ─── Тритон ─────────────────────────────────────────────────────────────────

const TRITON = {
  skin: { base: '#4a9a8a', shine: 0.45, tex: { kind: 'spots', scale: 2.5, amp: 0.18, density: 0.5 } } as Mat,
  belly: { base: '#9cc8b0', shine: 0.3, tex: { kind: 'stripes', scale: 2.5, amp: 0.1 } } as Mat,
  leg: { base: '#2e6258', shine: 0.35, tex: { kind: 'spots', scale: 2.5, amp: 0.18, density: 0.5 } } as Mat,
  fin: { base: '#2a6a5a', tex: { kind: 'stripes', scale: 1.6, amp: 0.25, angle: 1.2 } } as Mat,
  kelp: { base: '#2a5a5a', shag: 0.2, tex: { kind: 'stripes', scale: 2, amp: 0.12, angle: 1.57 } } as Mat,
  shell: { base: '#cdbb98', shine: 0.4, tex: { kind: 'stripes', scale: 1.6, amp: 0.2, angle: 0.3 } } as Mat,
  steel: { base: '#c0c0c0', shine: 1, dither: 0 } as Mat,
  shaft: { base: '#7a6448', tex: { kind: 'stripes', scale: 2, amp: 0.12 } } as Mat,
  mouth: { base: '#3a1e24', dither: 0 } as Mat,
};

/** Трезубец: [конец древка, острие] в покое (стоит у ноги зубцами вверх), в замахе (отведён) и в выпаде (вытянут к герою). */
const TRIDENT_REST: [number, number, number, number] = [30, 112, 16, 9];
const TRIDENT_WIND: [number, number, number, number] = [82, 80, 22, 40];
const TRIDENT_HIT: [number, number, number, number] = [44, 64, -40, 56];

export const triton: Model = {
  id: 'triton',
  w: 92,
  h: 116,
  ground: 114,
  // Трезубец в кадре контакта вытянут к герою — острие на 56 единиц левее рамки.
  pad: 62,
  draw(p: Painter) {
    const M = TRITON;
    const G = 114;
    // Трезубец: замах — отвести оружие назад, корпус отклонён; выпад — колющий бросок вперёд во всю длину древка.
    // Урон: отбросило, гребень прижат, глаз зажмурен, рот раскрыт.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.2, 2);
    // Жабры трепещут трижды за цикл, по гребню бежит волна, раз за цикл — мигательная перепонка.
    const gill = (p.wave(3) + 1) / 2;
    const flat = 1 - 0.6 * hurt;
    const sway = 1.2 * p.wave(1, 0.3);

    p.pose({ dx: -8 * strike + 3 * wind + 5 * hurt, rot: 0.04 * wind - 0.07 * strike + 0.06 * hurt, px: 42, py: G }, () => {
      p.shadow(42, 28, 3.5);
      // Трезубец: где древко в этом кадре.
      const [bx0, by0, tx0, ty0] = TRIDENT_REST;
      const bx = bx0 + (TRIDENT_WIND[0] - bx0) * wind + (TRIDENT_HIT[0] - bx0) * strike + 3 * hurt;
      const by = by0 + (TRIDENT_WIND[1] - by0) * wind + (TRIDENT_HIT[1] - by0) * strike + up;
      const tx = tx0 + (TRIDENT_WIND[2] - tx0) * wind + (TRIDENT_HIT[2] - tx0) * strike + sway * (1 - strike) + 5 * hurt;
      const ty = ty0 + (TRIDENT_WIND[3] - ty0) * wind + (TRIDENT_HIT[3] - ty0) * strike + up + 6 * hurt;
      const L = Math.hypot(tx - bx, ty - by), ux = (tx - bx) / L, uy = (ty - by) / L;
      const onShaft = (f: number): [number, number] => [bx + (tx - bx) * f, by + (ty - by) * f];

      // Дальняя нога и дальняя рука с древком.
      const foot = (x: number, part: string, tone: number): void => {
        p.poly([x - 9, G - 5, x + 3, G - 5, x + 4, G, x - 12, G, x - 11, G - 2], M.leg, { part, tone, bevel: 1.5 });
        p.line(x - 11, G - 1, x - 5, G - 4, '#1a3a36');
        p.poly([x + 2, G - 16, x + 7, G - 22, x + 4, G - 10], M.fin, { part: `${part}Fin`, tone, bevel: 0.8 });
      };
      p.chain([[48, 70, 7], [52, 88, 5.5], [52, 106, 4]], M.leg, { part: 'far', tone: -0.14 });
      foot(54, 'far', -0.14);
      const [fhx, fhy] = onShaft(0.32 + 0.04 * strike);
      const fa = joint(50, 40 + up, fhx, fhy, 17, 17, 1);
      p.chain([[50, 40 + up, 4.6], [fa.ex, fa.ey, 3.8], [fa.hx, fa.hy, 3.2]], M.skin, { part: 'farArm', tone: -0.14 });

      // Древко и три зубца с зазубринами — оружие светлее всего на тритоне.
      p.limb(bx, by, 1.5, tx - ux * 6, ty - uy * 6, 1.5, M.shaft, { part: 'shaft' });
      const nx = -uy, ny = ux;
      const [cx, cy] = [tx - ux * 9, ty - uy * 9];
      p.limb(cx + nx * 7, cy + ny * 7, 1.2, cx - nx * 7, cy - ny * 7, 1.2, M.steel, { part: 'tines' });
      p.limb(cx - ux * 3, cy - uy * 3, 1.8, cx, cy, 1.4, M.steel, { part: 'tines' });
      for (const o of [-7, 0, 7]) {
        const len = o === 0 ? 15 : 12;
        // Зазубрина смотрит внутрь, к среднему зубцу.
        const barb = o > 0 ? -2.5 : 2.5;
        p.limb(cx + nx * o, cy + ny * o, 1.1, cx + nx * o * 1.1 + ux * len, cy + ny * o * 1.1 + uy * len, 0.6, M.steel, { part: 'tines' });
        p.limb(cx + nx * o * 1.05 + ux * (len - 4), cy + ny * o * 1.05 + uy * (len - 4), 0.6, cx + nx * (o * 1.05 + barb) + ux * (len - 6.5), cy + ny * (o * 1.05 + barb) + uy * (len - 6.5), 0.5, M.steel, { part: 'tines' });
      }

      // Ближняя нога.
      p.chain([[36, 70, 7.5], [32, 88, 6], [31, 106, 4.2]], M.leg, { part: 'near' });
      foot(33, 'near', 0);

      // Туловище: широкая грудь в чешуе, светлое брюхо, пояс из ламинарии с набедренными лентами.
      p.ellipse(43, 46 + up, 15, 13, M.skin);
      p.ellipse(42, 60, 11.5, 10, M.skin);
      p.ellipse(38, 52 + up * 0.5, 7, 12, M.belly, { paint: true });
      // Перевязь из ламинарии через грудь, на ней ракушки.
      p.poly([48, 34 + up, 53, 36 + up, 36, 64, 31, 62], M.kelp, { paint: true });
      for (const [x, y] of [[46, 40], [42, 48], [38, 56]]) p.ellipse(x, y + up * 0.5, 1.8, 1.5, M.shell, { part: 'shells', lift: 1 });
      p.poly([30, 64, 55, 64, 57, 70, 29, 70], M.kelp, { part: 'belt', bevel: 2 });
      p.poly([30, 69, 38, 69, 36, 84, 33, 80, 31, 86], M.kelp, { part: 'loin', bevel: 1.5 });
      p.poly([42, 69, 52, 69, 53, 82, 49, 78, 46, 84, 43, 79], M.kelp, { part: 'loin', bevel: 1.5, tone: -0.08 });
      p.ellipse(42, 67, 2.5, 2.2, M.shell, { part: 'buckle', lift: 1 });

      // Голова рыбы: покатый лоб, широкий рот уголками вниз, круглый жёлтый глаз, жабры, гребень до лопаток.
      p.pose({ dx: p.snap(-2 * strike + 2 * hurt), dy: up + p.snap(-wind - 2 * hurt), rot: -0.06 * strike + 0.04 * wind + 0.18 * hurt, px: 44, py: 30 }, () => {
        // Гребень: перепонка на лучах от бровей через макушку до лопаток; по лучам бежит волна, от удара прижат.
        const crest: number[] = [];
        const rays: Array<[number, number, number, number]> = [];
        for (let k = 0; k <= 6; k++) {
          const f = k / 6;
          const bx2 = 34 + f * 22, by2 = 7 + f * 20 - Math.sin(f * Math.PI) * 5;
          const hgt = (7 + 3 * Math.sin(f * Math.PI)) * flat + 1.2 * p.wave(1, -f * 0.8);
          const ax2 = bx2 + (3 + 5 * f) * flat, ay2 = by2 - hgt;
          rays.push([bx2, by2, ax2, ay2]);
          crest.push(ax2, ay2);
        }
        p.poly([...crest, 57, 30, 50, 24, 34, 9], M.fin, { part: 'crest', bevel: 2 });
        for (const [x1, y1, x2, y2] of rays) p.line(x1, y1, x2, y2, '#7cc8b0');
        p.limb(46, 32, 6.5, 41, 22, 6.5, M.skin, { part: 'neck' });
        p.ellipse(40, 17, 10, 10.5, M.skin, { part: 'head' });
        p.limb(36, 19, 8, 29, 23, 5.5, M.skin, { part: 'head' });
        p.ellipse(33, 27, 8, 3.5, M.belly, { part: 'head', paint: true });
        // Боковой плавник-ухо веером назад.
        p.poly([45, 17, 55 + 2 * hurt, 12, 57, 19, 54 + 2 * hurt, 25, 46, 22], M.fin, { part: 'earFin', bevel: 1.2 });
        p.line(46, 19, 55 + 2 * hurt, 13, '#7cc8b0');
        p.line(46, 20, 55, 19, '#7cc8b0');
        p.line(46, 21, 53 + 2 * hurt, 24, '#7cc8b0');
        // Рот: в выпаде оскал, от удара разинут.
        const open = 3 * hurt + 1.5 * strike;
        if (open > 0.8) {
          p.poly([25, 24, 36, 25.5, 35, 26 + open, 27, 25 + open], M.mouth, { part: 'mouth', bevel: 0.6 });
          p.px(28, 25, '#e8e0cc');
          p.px(31, 25.5, '#e8e0cc');
        } else {
          p.line(25, 24, 31, 25, '#123a34');
          p.line(31, 25, 36, 27, '#123a34');
        }
        // Жабры: три щели на шее, приоткрываются алым.
        for (const k of [0, 1, 2]) {
          const x = 44 + k * 2.2, y = 23 + k * 0.8;
          p.line(x, y, x + 1, y + 5, '#163c36');
          if (gill > 0.55 && hurt < 0.4) p.px(x + 1, y + 2, '#b85a5a');
        }
        const shut = hurt > 0.4 ? 1 : p.blink(0.58, 0.05);
        p.eye(35, 14.5, 2.6, '#f0d86a', { closed: shut, pupil: '#101818', glint: '#fffbe0' });
      });

      // Ближняя рука сжимает древко.
      const [nhx, nhy] = onShaft(0.58);
      const na = joint(38, 40 + up, nhx, nhy, 16, 16, 1);
      p.chain([[38, 40 + up, 5], [na.ex, na.ey, 4], [na.hx, na.hy, 3.4]], M.skin, { part: 'nearArm' });
      p.ellipse(na.hx, na.hy, 3.4, 3.2, M.skin, { part: 'fist' });
      // Перепонки между пальцами кисти на древке.
      p.px(na.hx - 2, na.hy + 2.5, '#2a6a5a');
    });
  },
};

// ─── Гидра ──────────────────────────────────────────────────────────────────

/** Гидра — в оливковой гамме Болот: изумрудная кожа и светлые гребни прежнего спрайта выбивались из набора. */
const HYDRA = {
  skin: { base: '#455d3c', shine: 0.35, tex: { kind: 'spots', scale: 3, amp: 0.22, density: 0.45 } } as Mat,
  back: { base: '#2a3e25', shine: 0.3, tex: { kind: 'spots', scale: 3, amp: 0.2, density: 0.45 } } as Mat,
  belly: { base: '#85825c', tex: { kind: 'stripes', scale: 2.4, amp: 0.2 } } as Mat,
  horn: { base: '#908667', dither: 0 } as Mat,
  mouth: { base: '#5a1e22', dither: 0 } as Mat,
  tongue: { base: '#c84a5a', dither: 0 } as Mat,
};

/**
 * Шея гидры: точки от плеча к голове в покое, куда голова уходит в замахе, в броске и в отдаче,
 * фаза покачивания и сдвиг тона (дальняя шея темнее). Середина шеи идёт за головой долей своего места.
 */
interface HydraNeck { rest: Pt[]; wind: [number, number]; hit: [number, number]; hurt: [number, number]; ph: number; tone: number; lag: number }
const HYDRA_NECKS: HydraNeck[] = [
  // Дальняя, задняя голова.
  { rest: [[104, 122, 12], [110, 98, 10], [112, 78, 8.5], [108, 62, 7.5], [100, 52, 7]], wind: [14, -12], hit: [-66, 22], hurt: [16, -8], ph: 0.5, tone: -0.14, lag: 0.04 },
  // Средняя, самая высокая.
  { rest: [[92, 118, 12.5], [88, 92, 10.5], [80, 62, 9], [70, 38, 8], [58, 24, 7.5]], wind: [18, -10], hit: [-46, 40], hurt: [16, -6], ph: 0.2, tone: -0.05, lag: 0.02 },
  // Ближняя, нижняя — бьёт первой.
  { rest: [[80, 128, 13], [64, 116, 11], [50, 102, 9.5], [40, 90, 8.5], [30, 84, 8]], wind: [20, -14], hit: [-48, 14], hurt: [18, -10], ph: 0.8, tone: 0, lag: 0 },
];

/** Голова гидры в профиль к герою: череп с гребнем рогов, узкая морда, нижняя челюсть, жёлтый глаз со щелью зрачка. */
function hydraHead(p: Painter, x: number, y: number, ang: number, open: number, shut: number, tongue: number, tone: number, i: number): void {
  const M = HYDRA;
  const part = `head${i}`;
  // Голова крупнее шеи в полтора её обхвата: пасти — главная черта гидры.
  const S = 1.25;
  p.pose({ rot: ang, px: x, py: y }, () => p.scope(S, x * (1 - S), y * (1 - S), () => {
    // Рога-гребень на затылке.
    p.poly([x + 4, y - 6, x + 15, y - 11, x + 9, y - 3], M.horn, { part: `horn${i}`, tone, bevel: 1 });
    p.poly([x + 6, y - 2, x + 16, y - 3, x + 8, y + 2], M.horn, { part: `horn${i}`, tone: tone - 0.1, bevel: 1 });
    // Нижняя челюсть откидывается вниз.
    p.pose({ rot: -0.07 * open, px: x + 2, py: y + 4 }, () => {
      p.limb(x + 2, y + 4, 4.5, x - 15, y + 5 + open * 0.9, 2.6, M.skin, { part: `jaw${i}`, tone: tone - 0.12 });
      p.limb(x + 1, y + 6, 3, x - 13, y + 6.5 + open * 0.9, 1.6, M.belly, { part: `jaw${i}`, tone: tone - 0.1, paint: true });
    });
    if (open > 1) {
      p.poly([x - 17, y + 3, x + 1, y + 3, x + 1, y + 5 + open * 0.5, x - 14, y + 4 + open], M.mouth, { part: `maw${i}`, bevel: 0.8, tone });
      // Клыки сверху и снизу.
      for (const k of [0, 1, 2]) {
        p.px(x - 14 + k * 4.5, y + 4.5, '#ece4d0');
        p.px(x - 12 + k * 4.5, y + 2.5 + open * (0.75 + k * 0.08), '#ece4d0');
      }
      if (tongue > 0) p.chain([[x - 8, y + 4 + open * 0.4, 1], [x - 17 - 6 * tongue, y + 4.5 + open * 0.4, 0.8]], M.tongue, { part: `tongue${i}` });
    } else if (tongue > 0) {
      // Раздвоенный язык пробует воздух.
      p.line(x - 17, y + 3.5, x - 17 - 7 * tongue, y + 3.5, '#c84a5a');
      p.line(x - 17 - 7 * tongue, y + 3.5, x - 19 - 7 * tongue, y + 2, '#c84a5a');
      p.line(x - 17 - 7 * tongue, y + 3.5, x - 19 - 7 * tongue, y + 5, '#c84a5a');
    }
    p.ellipse(x, y, 9, 7.5, M.skin, { part, tone });
    p.limb(x - 4, y + 0.5, 6, x - 17, y + 2.5, 3.4, M.skin, { part, tone });
    p.ellipse(x + 1, y - 4, 7, 3, M.back, { part, tone, paint: true });
    p.limb(x - 7, y - 3.5, 2.2, x - 1, y - 5.5, 2.2, M.skin, { part: `brow${i}`, tone, lift: 2 });
    p.px(x - 17, y + 0.5, '#0e1a10');
    if (shut >= 1) p.line(x - 6, y - 2, x - 1, y - 2, '#0e1a10');
    else {
      p.eye(x - 4, y - 1.5, 2, '#ffd166', { closed: shut });
      if (!shut) p.line(x - 4, y - 3, x - 4, y - 0.5, '#161008');
    }
  }));
}

export const hydra: Model = {
  id: 'hydra',
  w: 204,
  h: 172,
  ground: 170,
  // Головы в кадре контакта вытянуты к герою — ближняя морда на 58 единиц левее рамки.
  pad: 66,
  draw(p: Painter) {
    const M = HYDRA;
    const G = 170;
    // Три пасти: замах — все головы вскинуты назад, пасти раскрыты; бросок — головы бьют к герою, ближняя первой.
    // Урон: головы отдёрнуты назад и вверх, глаза зажмурены, пасти раскрыты в шипении.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const breath = p.wave(2);
    // Раз за цикл средняя голова пробует воздух раздвоенным языком.
    const hiss = p.clip === 'idle' ? p.blink(0.62, 0.12) : 0;

    p.pose({ dx: -6 * strike + 3 * wind + 5 * hurt, rot: 0.03 * wind - 0.03 * strike + 0.04 * hurt, px: 150, py: G }, () => {
      p.shadow(116, 84, 5);
      const paw = (x: number, part: string, tone: number): void => {
        p.ellipse(x, G - 4, 10, 4.5, M.skin, { part, tone, flat: 0.3 });
        for (const k of [0, 1, 2]) p.limb(x - 7 + k * 4, G - 4, 1.4, x - 11 + k * 4, G - 0.5, 0.8, M.horn, { part: `${part}Claw`, tone });
      };
      // Дальние лапы.
      p.chain([[98, 142, 10], [100, 158, 7.5], [98, 164, 6]], M.skin, { part: 'far', tone: -0.14 });
      paw(96, 'far', -0.14);
      p.chain([[152, 146, 12], [160, 158, 8], [156, 165, 6]], M.skin, { part: 'far', tone: -0.14 });
      paw(154, 'far', -0.14);

      // Хвост тяжёлым бревном по земле, кончик загнут.
      const tw = 1.5 * p.wave(1, 0.4);
      p.chain([[150, 146, 17], [172, 154, 12], [190, 160, 8], [200 + tw, 164, 5], [204 + tw, 158, 3]], M.skin, { part: 'tail' });
      p.chain([[152, 138, 7], [174, 146, 5], [191, 153, 3]], M.back, { part: 'tail', paint: true });

      // Шеи за телом — дальняя и средняя (ближняя — поверх груди, ниже).
      const neck = (n: HydraNeck, i: number): void => {
        // Дальние головы бьют чуть позже ближней, но клип у всех кончается в один кадр.
        const { wind: w, strike: st } = p.attack(n.lag);
        const last = n.rest.length - 1;
        const pts: Pt[] = n.rest.map(([x, y, r], k) => {
          const f = (k / last) ** 1.4;
          const calm = 1 - Math.max(w, st, hurt);
          const sx = 3 * p.wave(1, n.ph) * calm, sy = 2.5 * p.wave(2, n.ph + 0.1) * calm;
          return [x + f * (n.wind[0] * w + n.hit[0] * st + n.hurt[0] * hurt + sx), y + f * (n.wind[1] * w + n.hit[1] * st + n.hurt[1] * hurt + sy) + (k === 0 ? breath * 0.5 : 0), r];
        });
        p.chain(pts, M.skin, { part: `neck${i}`, tone: n.tone });
        // Гребень шипов по загривку шеи.
        for (let k = 1; k < 7; k++) {
          const { x, y, r, tx, ty } = along(pts, 0.08 + k * 0.12);
          const sg = ty - tx > 0 ? 1 : -1;
          const nx = ty * sg, ny = -tx * sg;
          p.poly([x + nx * r * 0.7 - tx * 2.5, y + ny * r * 0.7 - ty * 2.5, x + nx * (r + 4.5) + tx, y + ny * (r + 4.5) + ty, x + nx * r * 0.7 + tx * 2.5, y + ny * r * 0.7 + ty * 2.5], M.horn, { part: `frill${i}`, tone: n.tone - 0.05, bevel: 0.8 });
        }
        // Светлое горло снизу шеи.
        for (let k = 0; k + 1 < pts.length; k++) {
          const [ax, ay, ar] = pts[k], [bx, by, br] = pts[k + 1];
          p.limb(ax - ar * 0.45, ay + ar * 0.35, ar * 0.45, bx - br * 0.45, by + br * 0.35, br * 0.45, M.belly, { part: `neck${i}`, tone: n.tone, paint: true });
        }
        const [hx, hy] = pts[last];
        const [px2, py2] = pts[last - 1];
        const ang = Math.atan2(hy - py2, hx - px2) + Math.PI;
        const open = 7 * Math.max(w, st) + 6 * hurt + 3 * (i === 1 ? hiss : 0);
        const shut = hurt > 0.4 ? 1 : p.blink(0.2 + i * 0.27, 0.05);
        hydraHead(p, hx - 6, hy, Math.max(-0.5, Math.min(0.5, ang * 0.35 - 0.1 * st + 0.3 * w * (i === 1 ? 1 : 0.6))), open, shut, i === 1 ? hiss : 0, n.tone, i);
      };
      neck(HYDRA_NECKS[0], 0);
      neck(HYDRA_NECKS[1], 1);

      // Туловище: тяжёлое, приземистое, спина с гребнем шипов, светлые брюшные щитки.
      p.ellipse(120, 140, 48, 25 + 0.8 * breath, M.skin);
      p.ellipse(88, 130, 24, 24 + 0.6 * breath, M.skin);
      p.ellipse(120, 124, 42, 8, M.back, { paint: true, rot: 0.05 });
      p.ellipse(108, 158, 40, 7, M.belly, { paint: true });
      for (let k = 0; k < 9; k++) {
        const x = 82 + k * 10, y = 112 + Math.abs(k - 3) * 1.8 + (k > 5 ? (k - 5) * 2 : 0);
        p.poly([x - 4, y + 6, x + 1, y - 4 - (k < 5 ? 2 : 0), x + 4, y + 6], M.horn, { part: 'spines', bevel: 1.2, lift: 10 });
      }

      // Ближние лапы.
      p.chain([[84, 146, 11], [80, 158, 8], [80, 164, 6.5]], M.skin, { part: 'near' });
      paw(78, 'near', 0);
      p.ellipse(140, 150, 16, 12, M.skin, { part: 'thigh', rot: -0.4 });
      p.chain([[146, 156, 8], [140, 164, 6]], M.skin, { part: 'thigh' });
      paw(136, 'thigh', 0);

      // Ближняя шея поверх груди.
      neck(HYDRA_NECKS[2], 2);
    });
  },
};

// ─── Топяной ужас ───────────────────────────────────────────────────────────

const BOG = {
  mud: { base: '#2f4229', shag: 0.22, tex: { kind: 'noise', scale: 3, amp: 0.22 } } as Mat,
  moss: { base: '#465f30', shag: 0.4, tex: { kind: 'fur', scale: 2, amp: 0.24, stretch: 3, angle: 1.5 } } as Mat,
  dark: { base: '#1e2e1e', tex: { kind: 'noise', scale: 3, amp: 0.2 } } as Mat,
  wood: { base: '#4a3c2e', tex: { kind: 'bark', scale: 1.6, amp: 0.25, angle: 1.4 } } as Mat,
  bone: { base: '#c8c0a0', dither: 0 } as Mat,
  pool: { base: '#1e2a22', shine: 0.9, dither: 0 } as Mat,
  tentacle: { base: '#3a5236', shine: 0.6, tex: { kind: 'stripes', scale: 2.4, amp: 0.14, angle: 1.57 } } as Mat,
  maw: { base: '#1a0e10', dither: 0 } as Mat,
};

/** Щупальце-хлыст: от тела к кончику — покой (свито у земли), замах (поднято над горбом), удар (выброшено к герою). */
const LASH_REST: Pt[] = [[56, 148, 10], [42, 158, 8.5], [28, 164, 7], [16, 167, 5.5], [8, 163, 4], [5, 155, 3], [9, 149, 2]];
const LASH_WIND: Array<[number, number]> = [[56, 148], [52, 128], [54, 106], [60, 84], [70, 64], [82, 50], [94, 44]];
const LASH_HIT: Array<[number, number]> = [[56, 148], [38, 146], [18, 142], [-2, 136], [-22, 130], [-40, 126], [-56, 124]];
/** Глаза вразнобой по голове: [x, y, радиус, момент моргания]. */
const BOG_EYES: Array<[number, number, number, number]> = [[46, 90, 3.8, 0.15], [64, 84, 3.4, 0.4], [80, 90, 2.4, 0.7], [34, 98, 1.8, 0.85], [90, 98, 1.8, 0.3], [56, 76, 1.6, 0.6], [74, 76, 1.4, 0.95]];

export const bogHorror: Model = {
  id: 'bog_horror',
  w: 214,
  h: 186,
  ground: 182,
  // Щупальце в кадре контакта хлещет на 70 единиц левее рамки.
  pad: 78,
  draw(p: Painter) {
    const M = BOG;
    const G = 182;
    // Щупальца: замах — хлыст взмывает над горбом, туша откидывается; удар — хлыст выброшен к герою, пасть разинута.
    // Урон: тушу качнуло назад, глаза зажмурены, пасть в рёве, во все стороны летят брызги грязи.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    // Туша тяжело вздымается; щупальца извиваются; глаза моргают вразнобой; раз за цикл в луже лопается пузырь.
    const breath = p.wave(2);
    const up = -p.bob(1.5, 2);
    const calm = 1 - Math.max(wind, strike, hurt);
    const bubble = p.clip === 'idle' && p.t > 0.1 && p.t < 0.4 ? (p.t - 0.1) / 0.3 : -1;
    const drip = p.clip === 'idle' && p.t > 0.55 && p.t < 0.85 ? (p.t - 0.55) / 0.3 : -1;
    const open = 3 + 1.5 * (breath + 1) * calm + 12 * strike + 6 * wind + 12 * hurt;

    p.pose({ dx: -6 * strike + 4 * wind + 6 * hurt, rot: 0.03 * wind - 0.04 * strike + 0.05 * hurt, px: 130, py: G }, () => {
      p.shadow(108, 96, 5);
      // Лужа трясины под тушей: блестящая чёрная вода растекается по настилу.
      p.ellipse(108, G - 2, 92, 4, M.pool, { part: 'pool', flat: 0.8 });
      if (bubble >= 0) {
        const r = 1.5 + 3 * bubble;
        if (bubble < 0.8) p.ellipse(168 + 4 * bubble, G - 3 - r * 0.6, r, r * 0.8, M.pool, { part: 'bubble', lift: 1 });
        else for (const [ox, oy] of [[-4, -3], [3, -5], [6, -2]]) p.px(172 + ox, G - 3 + oy, '#6a8a6a');
      }

      // Заднее щупальце аркой над правым боком.
      const tw = p.wave(1, 0.3) * calm, tw2 = p.wave(2, 0.6) * calm;
      p.chain([[172, 132, 9], [192, 120 + tw2 * 2, 7.5], [204 + tw * 2, 102, 6], [204 + tw * 3, 84, 4.5], [196 + tw * 3, 74 + tw2, 3], [188 + tw * 2, 78, 2]], M.tentacle, { part: 'tentacleBack', tone: -0.12 });
      // Дальняя лапа-коряга упирается в землю за тушей.
      p.chain([[150, 120, 14], [164, 150, 10], [168, 172, 7]], M.mud, { part: 'farArm', tone: -0.15 });
      for (const o of [-8, 0, 8]) p.chain([[168, 172, 3], [172 + o, G - 1, 1.6]], M.wood, { part: 'farRoots', tone: -0.15 });

      // Туша: низ горой, горб над плечами; голова-холм выдвинута к герою и опущена ниже горба, как у сутулого зверя.
      p.ellipse(120, 154, 80, 28 + breath * 0.6, M.mud);
      p.ellipse(114, 120 + up * 0.5, 60, 40 + breath, M.mud);
      p.ellipse(122, 86 + up, 44, 32 + breath * 0.6, M.mud);
      p.ellipse(152, 72 + up, 16, 13, M.mud);
      p.ellipse(94, 70 + up, 14, 11, M.mud);
      p.ellipse(164, 106 + up * 0.5, 18, 16, M.mud);
      p.ellipse(62, 98 + up, 38, 28, M.mud);
      p.ellipse(56, 120 + up, 32, 13, M.mud);
      p.ellipse(124, 62 + up, 36, 10, M.moss, { paint: true, rot: -0.15 });
      p.ellipse(60, 76 + up, 30, 8, M.moss, { paint: true });
      p.ellipse(154, 66 + up, 12, 6, M.moss, { paint: true });
      p.ellipse(120, 174, 68, 10, M.dark, { paint: true });
      // Вросший череп и рёбра тех, кого болото уже утянуло.
      p.ellipse(150, 126 + up * 0.5, 8, 7.5, M.bone, { part: 'skull' });
      p.limb(146, 130 + up * 0.5, 4.5, 142, 133 + up * 0.5, 3.5, M.bone, { part: 'skull' });
      p.disc(146, 125 + up * 0.5, 1.8, '#231a16');
      p.disc(152, 125 + up * 0.5, 1.6, '#231a16');
      p.ellipse(156, 132 + up * 0.5, 7, 5, M.mud, { part: 'skull', tone: -0.05 });
      for (let k = 0; k < 4; k++) p.chain([[112 + k * 6, 148, 1.3], [118 + k * 6, 156, 1.1], [116 + k * 6, 166, 0.9]], M.bone, { part: 'ribs' });
      // Мох свисает бородой с головы и горба.
      for (const [x, y, l] of [[30, 112, 14], [86, 126, 12], [150, 98, 18], [178, 120, 14], [110, 94, 10], [40, 84, 8], [134, 60, 12]]) {
        const sw = 1.2 * p.wave(1, x / 60) * calm;
        p.chain([[x, y + up, 3], [x + sw, y + l * 0.6 + up, 2.2], [x + sw * 1.5, y + l + up, 1.2]], M.moss, { part: 'beard' });
      }

      // Мёртвые коряги рогами из горба и макушки.
      p.chain([[118, 58 + up, 6], [112, 40 + up, 4.5], [106, 22 + up, 3.2], [100, 8 + up, 2]], M.wood, { part: 'antler' });
      p.chain([[110, 34 + up, 2.6], [96, 26 + up, 1.8], [90, 18 + up, 1.1]], M.wood, { part: 'antler' });
      p.chain([[138, 62 + up, 5], [150, 42 + up, 3.6], [158, 28 + up, 2.4], [168, 22 + up, 1.4]], M.wood, { part: 'antler2' });
      p.chain([[152, 40 + up, 2], [164, 38 + up, 1.3]], M.wood, { part: 'antler2' });
      p.chain([[66, 74 + up, 3.4], [60, 62 + up, 2.2], [52, 56 + up, 1.2]], M.wood, { part: 'antler3' });
      p.chain([[60, 64 + up, 1.6], [66, 56 + up, 1]], M.wood, { part: 'antler3' });

      // Пасть поперёк морды: тьма с зелёным отсветом, кривые клыки сверху и снизу.
      const my = 106 + up;
      p.poly([26, my, 56, my - 3, 90, my + 1, 88, my + 4 + open * 0.8, 58, my + 6 + open, 30, my + 3 + open * 0.6], M.maw, { part: 'maw', bevel: 1.5 });
      p.glow(58, my + 4 + open * 0.5, 6 + open * 0.5, '#c0ff60', 0.22 + 0.3 * Math.max(strike, hurt));
      for (let k = 0; k < 8; k++) {
        const x = 30 + k * 7.5;
        const ty = my - 1.5 + (k % 2 ? 1 : 0);
        p.poly([x - 2, ty, x + 2, ty, x + 0.5, ty + 5 + (k % 3 === 1 ? 3 : 0)], M.bone, { part: 'teeth', bevel: 0.6 });
        const by = my + 4 + open * (0.6 + 0.4 * Math.sin((k / 7) * Math.PI));
        if (k > 0 && k < 7) p.poly([x + 2, by, x + 6, by, x + 4.5, by - 4 - (k % 3 === 0 ? 2 : 0)], M.bone, { part: 'teeth', bevel: 0.6 });
      }
      if (drip >= 0) p.disc(44, my + 8 + open + drip * (G - my - 12 - open), 1.1, '#3a4a30');

      // Глаза гроздью над пастью: светятся ядовитой зеленью, моргают каждый в свой момент.
      for (const [x, y, r, ph] of BOG_EYES) {
        const shut = hurt > 0.4 ? 1 : p.blink(ph, 0.05);
        p.glow(x, y + up, r * 2.6, '#c0ff60', 0.3);
        p.eye(x, y + up, r, '#c0ff60', { closed: shut, glint: '#f4ffd8', lid: '#1a2616' });
      }

      // Ближняя лапа: глыба грязи до земли, пальцы-корни расползаются по настилу.
      p.chain([[100, 122 + up * 0.5, 15], [88, 148, 12], [80, 168, 9]], M.mud, { part: 'nearArm' });
      p.ellipse(98, 118 + up * 0.5, 14, 8, M.moss, { part: 'nearArm', paint: true });
      for (const [o, l] of [[-12, 1], [-4, 1.2], [6, 1]]) p.chain([[80, 170, 3.4], [80 + o * 0.6, 176, 2.4], [80 + o * l, G - 0.5, 1.4]], M.wood, { part: 'roots' });

      // Щупальце-хлыст у земли: в ударе взмывает и хлещет к герою.
      const lash = LASH_REST.map(([x, y, r], k) => {
        const [mx, my2] = mixPt([x, y], LASH_WIND[k], LASH_HIT[k], wind, strike);
        const f = k / (LASH_REST.length - 1);
        return [mx + 2 * p.wave(1, 0.2 - f * 0.5) * f * calm + 6 * hurt * f, my2 + 1.5 * p.wave(2, -f * 0.5) * f * calm - 8 * hurt * f, r] as Pt;
      });
      p.chain(lash, M.tentacle, { part: 'lash' });
      for (let k = 1; k < 12; k++) {
        const { x, y, r, tx, ty } = along(lash, k / 12);
        p.px(x + ty * r * 0.5, y - tx * r * 0.5, '#9ab888');
      }

      // Брызги грязи от удара.
      if (hurt > 0.3) {
        for (const [ox, oy] of [[-30, -40], [10, -60], [40, -50], [-10, -70], [60, -30]]) p.disc(100 + ox * (0.6 + hurt), 90 + oy * (0.4 + hurt * 0.6), 1.4, '#3a4a2c');
      }
    });
  },
};

export const SWAMP_MODELS: Record<string, Model> = {
  leech, mosquito_swarm: mosquitoSwarm, toad, will_o_wisp: willOWisp, kikimora, drowned, triton, hydra, toad_mother: toadMother, bog_horror: bogHorror,
};
