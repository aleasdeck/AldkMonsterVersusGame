import { scaleModel, type Mat, type Model, type Painter } from './pixel';

/**
 * Лесные враги пиксельной лепкой. Все смотрят влево — на героя; единица — пиксель поля боя,
 * рост от макушки до земли — как в `ENEMY_BODY_HEIGHT` (characterSizes.ts).
 * Цвета продолжают палитры прежних спрайтов (`sprite` в enemies.ts): волк серый с жёлтыми глазами, кабан бурый и т. д.
 */

// ─── Волк ───────────────────────────────────────────────────────────────────

const WOLF = {
  fur: { base: '#76716c', shag: 0.18, tex: { kind: 'fur', scale: 2.5, amp: 0.24, stretch: 3 } } as Mat,
  back: { base: '#45413f', shag: 0.18, tex: { kind: 'fur', scale: 2.5, amp: 0.24, stretch: 3 } } as Mat,
  pale: { base: '#a8a197', shag: 0.2, tex: { kind: 'fur', scale: 2, amp: 0.18, stretch: 2.5, angle: 1.3 } } as Mat,
  nose: { base: '#26222c', shine: 1, dither: 0 } as Mat,
  mouth: { base: '#5a2228', dither: 0 } as Mat,
  ear: { base: '#4a3a3a', dither: 0 } as Mat,
  fang: { base: '#ece4d4', dither: 0 } as Mat,
  mane: { base: '#45413f', shag: 0.5, tex: { kind: 'fur', scale: 2, amp: 0.3, stretch: 2, angle: 1.2 } } as Mat,
};

/** Вид волка: рядовой и Вожак стаи — одна анатомия, у вожака грива, шрамы, оскал и красные глаза. */
interface WolfLook { M: typeof WOLF; alpha: boolean; eye: string; glint: string }

function wolfFigure(p: Painter, L: WolfLook): void {
  const M = L.M;
  const breath = p.wave(L.alpha ? 3 : 4);
  const hy = p.snap(0.9 * p.wave(L.alpha ? 3 : 4, 0.15));
  const tail = p.wave(1);
  const pant = (p.wave(L.alpha ? 3 : 4, 0.05) + 1) / 2;
  const ex = p.blink(0.62, 0.06) ? 2.5 : 0;
  p.shadow(64, 44, 3);

  // Дальние лапы: темнее, за туловищем.
  p.chain([[50, 46, 5.5], [52, 57, 3.8], [51, 69, 2.6], [50, 73, 2.4]], M.back, { part: 'far', tone: -0.1 });
  p.ellipse(48.5, 74, 3.8, 2.1, M.back, { part: 'far', tone: -0.12 });
  p.chain([[87, 44, 7], [92, 55, 4.2], [96, 64, 2.6], [93, 73, 2.3]], M.back, { part: 'far', tone: -0.1 });
  p.ellipse(91.5, 74, 3.8, 2.1, M.back, { part: 'far', tone: -0.12 });

  // Хвост висит поленом и мерно качается (у вожака — напряжён); верх и кончик темнее.
  const tx = (L.alpha ? 1.2 : 2.5) * tail;
  p.chain([[95, 35, 5], [104, 40, 5.5], [109 + tx * 0.5, 50, 5], [110 + tx, 60, 4], [108 + tx * 1.3, 68, 2]], M.fur, { part: 'tail' });
  p.chain([[109 + tx * 0.9, 58, 3.4], [108 + tx * 1.3, 68, 1.8]], M.back, { part: 'tail', paint: true });
  p.chain([[96, 33, 3], [104, 37, 3.2], [108 + tx * 0.5, 45, 2.5]], M.back, { part: 'tail', paint: true });

  // Туловище: глубокая грудь, поджарый живот, круп; тёмный чепрак по хребту, светлое брюхо.
  p.ellipse(66, 40, 21, 10 + 0.5 * breath, M.fur, { rot: 0.04 });
  p.ellipse(85, 40, 10.5, 10.5, M.fur);
  p.ellipse(48, 43, 13.5, 13 + 0.5 * breath, M.fur);
  p.ellipse(69, 31.5, 22, 5.5, M.back, { rot: 0.04, paint: true });
  p.ellipse(51, 32, 11, 5.5, M.back, { paint: true });
  p.ellipse(64, 50, 13, 3.5, M.pale, { paint: true });

  // Ближние лапы.
  p.chain([[43, 46, 6.5], [45, 57, 4.2], [43, 69, 2.8], [42, 73, 2.6]], M.fur, { part: 'near' });
  p.ellipse(40, 74, 4.4, 2.3, M.fur, { part: 'near' });
  p.chain([[81, 43, 8], [85, 55, 5], [90, 65, 3], [87, 73, 2.7]], M.fur, { part: 'near' });
  p.ellipse(85.5, 74, 4.4, 2.3, M.fur, { part: 'near' });
  p.px(36.5, 74.5, '#2a2630');
  p.px(39, 75, '#2a2630');
  if (L.alpha) {
    // Старые шрамы через плечо и бедро.
    p.line(52, 36, 58, 44, '#a8a2b8');
    p.line(55, 35, 60, 41, '#a8a2b8');
    p.line(80, 36, 84, 43, '#a8a2b8');
  }

  // Шея, светлая манишка и загривок дыбом; у вожака грива до середины спины и воротник шерсти.
  p.limb(45, 36, 12, 31, 30 + hy, 10, M.fur);
  p.ellipse(36, 43, 7.5, 9.5, M.pale, { paint: true });
  const tufts = L.alpha ? 7 : 4;
  const raise = L.alpha ? 1.2 * (breath + 1) : 0;
  for (let k = 0; k < tufts; k++) {
    const x = 36 + k * 6, y = 23 + k * 1.8 + (k < 1 ? hy : 0) - (L.alpha ? 3 - k * 0.3 + raise : 0);
    p.poly([x - 3, y + 7, x + 2, y - 2 - (k % 2), x + 4.5, y + 7], M.back, { bevel: 1.5 });
  }
  // Грива вожака: густой воротник вокруг шеи, лохматый край.
  if (L.alpha) p.ellipse(35, 36 + hy * 0.5, 11, 12.5, M.mane, { lift: 2 });

  // Голова в профиль: клин черепа, «стоп» у глаз, длинная прямая морда, ухо торчком, щёки в густой шерсти.
  p.poly([27, 23 + hy, 31 + ex * 0.6, 9 + hy, 36, 23 + hy], M.back, { part: 'ear', bevel: 2, tone: -0.1 });
  const jaw = L.alpha ? 2.2 + 1.2 * pant : 0.5 + 1.6 * pant;
  p.limb(19, 35.5 + hy, 3.6, 6, 36 + hy + jaw, 2.1, M.pale, { part: 'jaw', tone: -0.15 });
  p.ellipse(25, 27 + hy, 10.5, 8.5, M.fur, { part: 'head' });
  p.limb(21, 29.5 + hy, 6, 4, 31.5 + hy, 3.6, M.fur, { part: 'head' });
  p.poly([19, 22 + hy, 25 + ex, 6 + hy, 31, 21 + hy], M.fur, { part: 'head', bevel: 2.5 });
  p.poly([22.5, 19 + hy, 25 + ex, 10 + hy, 28, 19 + hy], M.ear, { part: 'head', paint: true });
  if (L.alpha) p.erase(29 + ex * 0.5, 13 + hy, 1.6, 1.6);
  p.limb(20, 28 + hy, 3, 6, 29.5 + hy, 1.8, M.pale, { part: 'head', paint: true, tone: 0.05 });
  p.ellipse(27, 33.5 + hy, 7.5, 5, M.pale, { part: 'head', paint: true });
  p.ellipse(2.8, 31 + hy, 2.4, 2.1, M.nose, { part: 'head', lift: 3 });
  p.line(6, 34.5 + hy, 18, 35 + hy, '#1c141a');
  if (L.alpha) {
    // Оскал: губа задрана, клыки наружу, морщины на переносице, шрам через морду.
    p.poly([6.5, 34.5 + hy, 8.5, 34.5 + hy, 7.8, 38.5 + hy], M.fang, { part: 'fang', bevel: 0.6 });
    p.poly([11, 36 + hy + jaw, 13, 36 + hy + jaw, 12, 32.5 + hy + jaw * 0.5], M.fang, { part: 'fang', bevel: 0.6 });
    p.line(9, 28.5 + hy, 12, 30 + hy, '#23222e');
    p.line(12.5, 28 + hy, 15, 29.5 + hy, '#23222e');
    p.line(16, 23 + hy, 21, 31 + hy, '#a8a2b8');
    p.glow(17.5, 26 + hy, 4, L.eye, 0.35);
  } else {
    p.px(7, 35.5 + hy, '#efe6d6');
    p.px(13, 36 + hy, '#efe6d6');
  }

  // Глаз под тяжёлой бровью, бровь скошена к носу — зверь смотрит исподлобья.
  p.eye(17.5, 26 + hy, 1.5, L.eye, { closed: p.blink(0.3), glint: L.glint });
  p.line(14, 24 + hy, 21, 23 + hy, '#2a2630');
}

export const wolf: Model = {
  id: 'wolf',
  w: 116,
  h: 80,
  ground: 76,
  draw(p: Painter) {
    wolfFigure(p, { M: WOLF, alpha: false, eye: '#ffd166', glint: '#fff6d8' });
  },
};

// ─── Вожак стаи ─────────────────────────────────────────────────────────────

const ALPHA: typeof WOLF = {
  fur: { base: '#555a78', shag: 0.22, tex: { kind: 'fur', scale: 2.5, amp: 0.24, stretch: 3 } },
  back: { base: '#2c2f45', shag: 0.25, tex: { kind: 'fur', scale: 2.5, amp: 0.24, stretch: 3 } },
  pale: { base: '#8f93ad', shag: 0.25, tex: { kind: 'fur', scale: 2, amp: 0.18, stretch: 2.5, angle: 1.3 } },
  nose: WOLF.nose,
  mouth: WOLF.mouth,
  ear: { base: '#3a2a3a', dither: 0 },
  fang: WOLF.fang,
  mane: { base: '#3a3d58', shag: 0.55, tex: { kind: 'fur', scale: 2, amp: 0.3, stretch: 2, angle: 1.2 } },
};

/** Вожак — тот же волк в полтора с лишним раза крупнее (рост 120 против 72). */
const ALPHA_SCALE = 120 / 72;

export const alphaWolf: Model = {
  id: 'alpha_wolf',
  w: Math.ceil(116 * ALPHA_SCALE),
  h: Math.ceil(80 * ALPHA_SCALE),
  ground: 76 * ALPHA_SCALE,
  draw(p: Painter) {
    p.scope(ALPHA_SCALE, 0, 0, () => wolfFigure(p, { M: ALPHA, alpha: true, eye: '#ff3b3b', glint: '#ffd0d0' }));
  },
};

// ─── Кабан ──────────────────────────────────────────────────────────────────

const BOAR = {
  fur: { base: '#6a4b36', shag: 0.25, tex: { kind: 'fur', scale: 1.8, amp: 0.18, stretch: 3, angle: 0.25 } } as Mat,
  mane: { base: '#3a2a20', shag: 0.45, tex: { kind: 'fur', scale: 2, amp: 0.2, stretch: 2, angle: -1.2 } } as Mat,
  snout: { base: '#9a6c5c', tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  tusk: { base: '#e2d6b8', shine: 0.6, dither: 0 } as Mat,
  hoof: { base: '#2c231f', dither: 0 } as Mat,
};

const boarBase: Model = {
  id: 'boar',
  w: 118,
  h: 74,
  ground: 70,
  draw(p: Painter) {
    const M = BOAR;
    const G = 70;
    const breath = p.wave(2);
    const hy = p.snap(0.6 * p.wave(2, 0.2));
    const sniff = 0.7 * p.wave(6);
    // Роет копытом: ближняя передняя нога на миг уходит назад и вверх — вот-вот сорвётся в разгон.
    const scrape = p.blink(0.36, 0.16);
    const flick = p.blink(0.55, 0.08);
    p.shadow(64, 48, 3);

    const hoof = (x: number, part: string, tone = 0, lift = 0): void => {
      p.poly([x - 3.6, G - 4.5 - lift, x + 3.4, G - 4.5 - lift, x + 3.8, G - lift, x - 4, G - lift], M.hoof, { part, tone, bevel: 1 });
    };
    // Дальние ноги.
    p.chain([[49, 50, 5], [51, 60, 3.8], [50, 66, 3.1]], M.fur, { part: 'far', tone: -0.15 });
    hoof(50, 'far', -0.1);
    p.chain([[93, 48, 6.5], [97, 58, 4], [95, 66, 3]], M.fur, { part: 'far', tone: -0.15 });
    hoof(95, 'far', -0.1);

    // Хвостик-плеть с кисточкой: изредка дёргается.
    const tf = flick ? 3 : 0;
    p.chain([[99, 34, 1.6], [104, 36 - tf, 1.3], [106 + tf, 40 - tf, 1], [104 + tf * 1.5, 44 - tf, 0.8]], M.fur, { part: 'tail' });
    p.ellipse(104 + tf * 1.5, 45 - tf, 1.6, 2, M.mane, { part: 'tail' });

    // Туловище: горб над лопатками, туловище клином вниз к крупу.
    p.ellipse(66, 38, 31, 15.5 + 0.7 * breath, M.fur, { rot: 0.1 });
    p.ellipse(46, 32, 17, 17 + 0.5 * breath, M.fur);
    p.ellipse(88, 40, 13, 13, M.fur);
    p.ellipse(60, 49, 18, 4, M.mane, { paint: true, tone: -0.05 });

    // Щетина по хребту: выше всего на горбу, поднимается с каждым вдохом.
    const bristle = 0.8 * (breath + 1);
    for (let k = 0; k < 9; k++) {
      const x = 30 + k * 6.5;
      const top = 17 + Math.abs(k - 2.5) * 1.6 + (k > 5 ? (k - 5) * 1.2 : 0);
      const hgt = 7 - Math.abs(k - 2.5) * 0.5 + (k < 6 ? bristle : 0);
      p.poly([x - 4, top + hgt + 4, x + 1, top - (k < 6 ? bristle : 0), x + 5, top + hgt + 4], M.mane, { bevel: 1.5, lift: 14 });
    }

    // Ближние ноги.
    const sx = 3 * scrape, sy = 2.5 * scrape;
    p.chain([[42, 50, 6.5], [43 + sx * 0.5, 59 - sy * 0.5, 4.5], [42 + sx, 66 - sy, 3.6]], M.fur, { part: 'near' });
    hoof(42 + sx, 'near', 0, sy);
    p.chain([[84, 47, 8], [88, 57, 5], [86, 66, 3.6]], M.fur, { part: 'near' });
    hoof(86, 'near');

    // Голова клином к земле: ухо назад, пятак, клыки из нижней челюсти.
    p.poly([31, 34 + hy, 37, 23 + hy, 41, 33 + hy], M.fur, { part: 'ear', bevel: 1.8, tone: -0.05 });
    p.poly([34, 32 + hy, 37, 26 + hy, 39, 32 + hy], M.mane, { part: 'ear', paint: true });
    p.limb(23, 54 + hy, 4.5, 11, 57.5 + hy, 3.2, M.fur, { part: 'jaw', tone: -0.15 });
    p.ellipse(27, 42 + hy, 13, 10.5, M.fur, { part: 'head', rot: 0.35 });
    p.limb(19, 47 + hy, 7.5, 7, 52.5 + hy + sniff, 5.2, M.fur, { part: 'head' });
    p.ellipse(4.5, 53 + hy + sniff, 2.5, 4.6, M.snout, { part: 'head', lift: 3 });
    p.px(3.5, 51.5 + hy + sniff, '#2a1414');
    p.px(3.5, 54.5 + hy + sniff, '#2a1414');
    p.chain([[13, 57 + hy, 1.9], [10, 52 + hy, 1.5], [10, 47 + hy, 0.9]], M.tusk, { part: 'tusk' });
    p.chain([[17, 57 + hy, 1.4], [15, 53 + hy, 1.1], [15.5, 50 + hy, 0.7]], M.tusk, { part: 'tusk2', tone: -0.2 });
    p.line(9, 55.5 + hy, 20, 55 + hy, '#2a1414');

    p.eye(22, 40.5 + hy, 1.3, '#ff8a3d', { closed: p.blink(0.7), glint: '#ffe0c0' });
    p.line(18.5, 38 + hy, 25, 39.5 + hy, '#1e1512');
  },
};

// ─── Крыса ──────────────────────────────────────────────────────────────────

const RAT = {
  fur: { base: '#5e5046', shag: 0.3, tex: { kind: 'fur', scale: 2, amp: 0.25, stretch: 2.5 } } as Mat,
  belly: { base: '#8c7c68', shag: 0.2 } as Mat,
  skin: { base: '#b98079', dither: 0 } as Mat,
  earIn: { base: '#8a4e50', dither: 0 } as Mat,
};

export const rat: Model = {
  id: 'rat',
  w: 80,
  h: 44,
  ground: 42,
  draw(p: Painter) {
    const M = RAT;
    const breath = p.wave(6);
    const sniff = 0.6 * p.wave(9);
    const hy = p.snap(0.5 * p.wave(3, 0.1));
    const sw = p.wave(1), sw2 = p.wave(1, 0.2);
    const ear = p.blink(0.42, 0.06);
    p.shadow(42, 30, 2.2);

    // Голый хвост лежит кольцом по земле и лениво пошевеливает кончиком.
    p.chain([[60, 31, 2.2], [69, 34, 1.8], [74, 39, 1.5], [70 + sw, 41.5, 1.2], [60 + sw2 * 2, 41.5, 0.9], [52 + sw2 * 3, 40.5 - sw * 0.5, 0.6]], M.skin, { part: 'tail' });

    // Дальние лапы.
    p.limb(29, 37, 2, 28, 40.5, 1.4, M.fur, { part: 'far', tone: -0.2 });
    p.limb(54, 38, 2, 58, 41, 1.2, M.skin, { part: 'far', tone: -0.2 });

    // Тело грушей: круп выше и толще плеч.
    p.ellipse(47, 28, 15, 12 + 0.5 * breath, M.fur);
    p.ellipse(33, 31, 11, 9 + 0.4 * breath, M.fur);
    p.ellipse(40, 36.5, 13, 4, M.belly, { paint: true });

    // Ближние лапы: задняя — длинная ступня, передняя — ручка у груди.
    p.limb(53, 35, 4.5, 50, 40, 2.4, M.fur, { part: 'near' });
    p.limb(46, 41, 1.3, 55, 41.5, 1.2, M.skin, { part: 'near' });
    p.limb(26, 36, 2.3, 24, 40, 1.6, M.fur, { part: 'near' });
    p.limb(21.5, 41, 1.1, 26, 41.2, 1.1, M.skin, { part: 'near' });

    // Голова: острая морда, розовый нос, круглое ухо.
    p.ellipse(20, 30 + hy, 8.5, 6.5, M.fur, { part: 'head', rot: 0.2 });
    p.limb(16, 32 + hy, 4.5, 5 + sniff * 0.5, 35 + hy + sniff, 1.8, M.fur, { part: 'head' });
    p.ellipse(18, 34.5 + hy, 5, 2.2, M.belly, { part: 'head', paint: true });
    p.disc(4 + sniff * 0.5, 35 + hy + sniff, 1.1, '#d49a94');
    p.ellipse(25.5, 24 + hy - ear, 3.4, 3.8, M.skin, { part: 'ear', rot: 0.3 });
    p.ellipse(25.2, 24.6 + hy - ear, 2, 2.4, M.earIn, { part: 'ear', paint: true, rot: 0.3 });
    p.px(6.5, 37 + hy + sniff, '#f0e2c4');

    if (p.d < 3) {
      const wy = 34 + hy + sniff;
      p.line(8, wy, 1, wy - 3 - sniff, '#bdb4a4');
      p.line(8, wy + 1, 0, wy + 1.5, '#bdb4a4');
    }
    p.eye(15.5, 29 + hy, 1.3, '#ff5555', { closed: p.blink(0.75), glint: '#ffd0d0' });
  },
};

// ─── Летучая мышь ───────────────────────────────────────────────────────────

const BAT = {
  fur: { base: '#3d3552', shag: 0.3, tex: { kind: 'fur', scale: 1.8, amp: 0.22, stretch: 1.5, angle: 1.57 } } as Mat,
  belly: { base: '#5c5070' } as Mat,
  wing: { base: '#4b3e5e', tex: { kind: 'stripes', scale: 3.5, amp: 0.08, angle: 0.4 } } as Mat,
  bone: { base: '#2a2238', dither: 0 } as Mat,
  earIn: { base: '#8a5a70', dither: 0 } as Mat,
};

export const bat: Model = {
  id: 'bat',
  w: 96,
  h: 72,
  ground: 70,
  draw(p: Painter) {
    const M = BAT;
    // Четыре кадра на взмах при любом стиле: частота крыльев не зависит от числа кадров цикла.
    const k = Math.max(1, Math.round(p.frames / 4));
    const a = p.wave(k, 0.25);
    const by = 7 + p.snap(1.6 * a);
    const cx = 48;
    p.shadow(cx, 11 - a, 2, 0.22);

    const wing = (sgn: number): void => {
      const sx = cx + sgn * 5, sy = 21 + by;
      const phi = -sgn * a * 0.6;
      const c = Math.cos(phi), s = Math.sin(phi);
      const at = (x: number, y: number, curl = 0): [number, number] => {
        const yy = y + curl * a * -4;
        return [sx + (sgn * x) * c - yy * s, sy + (sgn * x) * s + yy * c];
      };
      const W = at(15, -9), F1 = at(40, -6, 1), F2 = at(36, 9, 0.6), F3 = at(24, 16, 0.3), H = at(3, 13);
      const M1 = at(31, 3, 0.8), M2 = at(26, 11, 0.4), M3 = at(13, 13);
      const S = at(0, 0);
      p.poly([...S, ...W, ...F1, ...M1, ...F2, ...M2, ...F3, ...M3, ...H], M.wing, { part: sgn < 0 ? 'wingL' : 'wingR', flat: 0.6, bevel: 3 });
      p.limb(S[0], S[1], 1.4, W[0], W[1], 1.1, M.bone, { part: sgn < 0 ? 'wingL' : 'wingR', paint: true });
      for (const F of [F1, F2, F3]) p.limb(W[0], W[1], 0.9, F[0], F[1], 0.5, M.bone, { part: sgn < 0 ? 'wingL' : 'wingR', paint: true });
      p.poly([W[0] - 1.5, W[1], W[0] + sgn * 0.5, W[1] - 3.5, W[0] + 1.5, W[1]], M.bone, { part: 'claw' });
    };
    wing(-1);
    wing(1);

    // Тело — пушистый комок, голова с огромными ушами.
    p.ellipse(cx, 29 + by, 7.5, 9.5, M.fur);
    p.ellipse(cx, 31 + by, 4.5, 6, M.belly, { paint: true });
    p.limb(cx - 2.5, 37 + by, 1, cx - 3, 41 + by, 0.8, M.bone, { part: 'feet' });
    p.limb(cx + 2.5, 37 + by, 1, cx + 3, 41 + by, 0.8, M.bone, { part: 'feet' });
    p.poly([cx - 7, 16 + by, cx - 9, 3 + by, cx - 2, 12 + by], M.fur, { part: 'ear', bevel: 1.5 });
    p.poly([cx + 7, 16 + by, cx + 9, 3 + by, cx + 2, 12 + by], M.fur, { part: 'ear', bevel: 1.5 });
    p.poly([cx - 6.5, 14 + by, cx - 8, 6 + by, cx - 4, 12 + by], M.earIn, { part: 'ear', paint: true });
    p.poly([cx + 6.5, 14 + by, cx + 8, 6 + by, cx + 4, 12 + by], M.earIn, { part: 'ear', paint: true });
    p.ellipse(cx, 17.5 + by, 6.5, 5.5, M.fur, { part: 'head' });
    p.ellipse(cx - 0.5, 20.5 + by, 3.2, 2.2, M.belly, { part: 'head', lift: 1 });
    if (p.d < 3) {
      p.px(cx - 2, 22.5 + by, '#f2ead8');
      p.px(cx + 1.5, 22.5 + by, '#f2ead8');
    }
    const closed = p.blink(0.5, 0.04);
    p.eye(cx - 3, 16.5 + by, 1.2, '#ffd166', { closed, glint: '#fff6d8' });
    p.eye(cx + 3, 16.5 + by, 1.2, '#ffd166', { closed, glint: '#fff6d8' });
  },
};

// ─── Паук ───────────────────────────────────────────────────────────────────

const SPIDER = {
  chitin: { base: '#4b4353', shine: 0.35, tex: { kind: 'noise', scale: 3, amp: 0.12 } } as Mat,
  hair: { base: '#403a4a', shag: 0.2, tex: { kind: 'fur', scale: 1.5, amp: 0.2, stretch: 1.5 } } as Mat,
  leg: { base: '#48404f', shag: 0.1, tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  /** На крупном пикселе лапы — линии без контура, светлее тела: так их восемь, а не каша. */
  legLine: { base: '#6a6174', noOutline: true, dither: 0 } as Mat,
  legFar: { base: '#2c2833', noOutline: true, dither: 0 } as Mat,
  mark: { base: '#a8303a', dither: 0 } as Mat,
  fang: { base: '#b9a898', shine: 0.5, dither: 0 } as Mat,
};

/** Нога паука: корень у головогруди, колено выше спины, стопа на земле. */
type Leg = [number, number, number, number, number, number, number, number];
const SPIDER_NEAR: Leg[] = [
  [34, 36, 20, 15, 10, 38, 6, 51],
  [38, 37, 31, 11, 24, 36, 22, 51],
  [43, 37, 56, 12, 64, 36, 68, 51],
  [47, 36, 72, 18, 84, 38, 90, 51],
];
const SPIDER_FAR: Leg[] = [
  [36, 35, 25, 18, 16, 38, 13, 50],
  [40, 35, 38, 14, 32, 36, 31, 50],
  [45, 35, 60, 16, 72, 36, 77, 50],
  [49, 35, 78, 22, 92, 40, 97, 50],
];

export const spider: Model = {
  id: 'spider',
  w: 104,
  h: 54,
  ground: 51,
  draw(p: Painter) {
    const M = SPIDER;
    const by = p.snap(0.8 * p.wave(3));
    const breath = p.wave(2);
    const palp = 0.8 * p.wave(6);
    p.shadow(52, 46, 3);

    // Ноги по очереди переступают: стопа приподнимается на пару пикселей и встаёт обратно.
    // На крупном пикселе лапа в два пикселя с контуром превращается в столб: тоньше, чтобы восемь лап не слились.
    const thin = p.d >= 2 ? 0.7 : 1;
    const leg = ([rx, ry, kx, ky, ax, ay, fx, fy]: Leg, i: number, part: string, tone: number, r0: number): void => {
      const r = r0 * thin;
      const lift = 2.5 * p.blink(0.12 + i * 0.22, 0.1);
      const mat = p.d >= 2 ? (part === 'near' ? M.legLine : M.legFar) : M.leg;
      p.chain([[rx, ry + by, 1.9 * r], [kx, ky + by * 0.6, 1.4 * r], [ax, ay - lift, 1 * r], [fx, fy - lift * 1.2, 0.6 * r]], mat, { part, tone });
      // Светлый сустав на колене: без него нога сливается с соседней.
      if (part === 'near') p.disc(kx, ky + by * 0.6 - 0.5, 0.9, '#6a6072');
    };
    SPIDER_FAR.forEach((l, i) => leg(l, (i + 2) % 4, 'far', -0.3, 0.8));

    // Брюшко поднято, дышит; по нему красный узор.
    p.ellipse(68, 24 + by, 22, 16 + 0.6 * breath, M.hair, { part: 'abd', rot: -0.25 });
    p.ellipse(71, 19.5 + by, 9, 3.2, M.mark, { part: 'abd', paint: true, rot: -0.25 });
    p.ellipse(63, 24 + by, 4.5, 2.2, M.mark, { part: 'abd', paint: true, rot: -0.25 });
    p.ellipse(77, 15 + by, 3.5, 1.8, M.mark, { part: 'abd', paint: true, rot: -0.25 });

    p.ellipse(40, 33 + by, 12.5, 9, M.chitin);
    SPIDER_NEAR.forEach((l, i) => leg(l, i, 'near', 0.05, 1));

    // Хелицеры с клыками, педипальпы подёргиваются, гроздь красных глаз.
    p.limb(29, 36 + by, 2.4, 27, 42 + by, 1.5, M.chitin, { part: 'fang' });
    p.limb(32, 37 + by, 2.2, 31, 42.5 + by, 1.4, M.chitin, { part: 'fang', tone: -0.15 });
    p.chain([[27, 42 + by, 1.2], [26, 45 + by, 0.8]], M.fang, { part: 'fang' });
    p.chain([[30, 34 + by, 1.3], [22, 37 + by + palp, 1.1], [20 + palp, 42 + by, 0.9]], M.hair, { part: 'palp' });

    const glow = '#ff3b3b';
    p.eye(30.5, 28.5 + by, 1.5, glow, { glint: '#ffd0d0' });
    p.eye(34.5, 27.5 + by, 1.5, glow, { glint: '#ffd0d0' });
    for (const [x, y] of [[28, 31.5], [31.5, 31.2], [35.5, 30.6], [38.5, 29.4]]) p.eye(x, y + by, 0.8, glow);
  },
};

// ─── Бандит-лучник ──────────────────────────────────────────────────────────

const ARCHER = {
  cloak: { base: '#3d5c43', tex: { kind: 'noise', scale: 3, amp: 0.1 } } as Mat,
  hollow: { base: '#1f2e23', dither: 0 } as Mat,
  skin: { base: '#c9966e' } as Mat,
  mask: { base: '#4d3c30', tex: { kind: 'stripes', scale: 2, amp: 0.08 } } as Mat,
  tunic: { base: '#6b4f3a', tex: { kind: 'noise', scale: 2.5, amp: 0.12 } } as Mat,
  leather: { base: '#4a3526' } as Mat,
  belt: { base: '#2e2420' } as Mat,
  pants: { base: '#3c3a37', tex: { kind: 'stripes', scale: 3, amp: 0.06, angle: 1.57 } } as Mat,
  boot: { base: '#3a2a1e' } as Mat,
  wood: { base: '#a67c52', tex: { kind: 'bark', scale: 1.5, amp: 0.15, angle: 1.57 } } as Mat,
  quiver: { base: '#5a3e2a', tex: { kind: 'stripes', scale: 2, amp: 0.1 } } as Mat,
  metal: { base: '#9aa3ad', shine: 0.8, dither: 0 } as Mat,
  fletch: { base: '#a83a32', dither: 0 } as Mat,
};

export const banditArcher: Model = {
  id: 'bandit_archer',
  w: 84,
  h: 112,
  ground: 110,
  draw(p: Painter) {
    const M = ARCHER;
    const G = 110;
    // Вдох поднимает плечи, голову и руки на пиксель; ноги и бёдра стоят.
    const up = -p.bob(1.2, 3);
    const sway = 1.6 * p.wave(1);
    const aim = p.bob(1.2, 1, 0.3);
    p.shadow(38, 24, 3);

    // Дальняя нога и сапог.
    p.chain([[46, 66, 6], [49, 86, 5], [50, 103, 3.6]], M.pants, { part: 'far', tone: -0.12 });
    p.poly([44, 100, 54, 100, 55, G, 41, G, 41, 105], M.boot, { part: 'far', tone: -0.1, bevel: 2 });

    // Плащ за спиной: полы качаются.
    p.poly([30, 30 + up, 56, 30 + up, 62, 60, 65 + sway, 92, 57 + sway * 0.6, 95, 48, 90, 38, 60], M.cloak, { part: 'cloak', bevel: 4, tone: -0.1 });
    // Колчан на спине, оперение над плечом.
    p.poly([51, 24 + up, 60, 26 + up, 57, 62, 48, 60], M.quiver, { part: 'quiver', bevel: 2 });
    for (let k = 0; k < 3; k++) {
      const x = 53 + k * 2.6, y = 22 - k * 1.5 + up;
      p.limb(x, y + 6, 0.7, x + 1.5, y - 4, 0.7, M.wood, { part: 'arrows' });
      p.poly([x, y - 2, x + 3.5, y - 8, x + 3.2, y - 1], M.fletch, { part: 'arrows', bevel: 0.8 });
    }

    // Ближняя нога.
    p.chain([[35, 66, 6.5], [31, 86, 5.2], [30, 103, 3.8]], M.pants, { part: 'near' });
    p.poly([25, 100, 35, 101, 35, G, 20, G, 21, 105], M.boot, { part: 'near', bevel: 2 });

    // Плечо тянущей руки — за туловищем.
    p.limb(48, 36 + up, 4.2, 47, 49 + up, 3.6, M.tunic, { part: 'farArm', tone: -0.12 });

    // Туловище: куртка, пояс с пряжкой, подол.
    p.poly([30, 32 + up, 51, 32 + up, 53, 58, 52, 66, 32, 66, 31, 58], M.tunic, { bevel: 6 });
    p.poly([31, 62, 53, 62, 56, 76, 29, 76], M.tunic, { bevel: 3, tone: -0.05 });
    p.poly([30, 58, 54, 58, 54, 63, 30, 63], M.belt, { paint: true });
    p.block(40, 59, 2, 2, '#c8b070');

    // Капюшон с пелериной, лицо в тени, нижняя половина под платком; из тени блестят глаза.
    p.poly([27, 25 + up, 53, 25 + up, 57, 36 + up, 25, 36 + up], M.cloak, { part: 'hood', bevel: 4 });
    p.ellipse(40, 16 + up, 10, 11, M.cloak, { part: 'hood' });
    p.poly([37, 9 + up, 46, 1 + up, 49, 11 + up], M.cloak, { part: 'hood', bevel: 2 });
    p.ellipse(33, 18.5 + up, 6.5, 8, M.hollow, { part: 'hood', paint: true });
    p.ellipse(31.5, 18.5 + up, 4.5, 6, M.skin, { part: 'face', tone: -0.3 });
    p.poly([26, 19.5 + up, 37, 19.5 + up, 37.5, 26 + up, 28, 26.5 + up], M.mask, { part: 'mask', bevel: 1.5 });
    const shut = p.blink(0.55, 0.05);
    if (!shut) {
      p.px(29, 16.5 + up, '#e8dcb0');
      p.px(33.5, 16.5 + up, '#e8dcb0');
    }

    // Лук в вытянутой руке, стрела на тетиве смотрит на героя.
    const bx = aim * 0.5, byy = aim;
    p.chain([[21, 28 + up + byy, 1], [17, 38 + byy, 1.4], [14 + bx, 56 + byy, 1.9], [17, 74 + byy, 1.4], [21, 84 + byy, 1]], M.wood, { part: 'bow' });
    p.limb(14 + bx, 53 + byy, 2.1, 14 + bx, 59 + byy, 2.1, M.leather, { part: 'bow', paint: true });
    const hx = 31, hy = 56 + byy * 0.5;
    p.line(21.5, 28 + up + byy, hx, hy, '#d8d0c0');
    p.line(hx, hy, 21.5, 84 + byy, '#d8d0c0');
    p.line(hx, hy, 8, hy, '#8a6a4a');
    p.poly([3, hy, 8.5, hy - 2.4, 8.5, hy + 2.4], M.metal, { part: 'arrow', bevel: 1 });
    p.px(hx - 1, hy - 1, '#c83a32');
    // Кисть тянущей руки у тетивы — перед грудью.
    p.limb(47, 49 + up, 3.4, hx + 1, hy, 2.6, M.tunic, { part: 'drawArm', tone: -0.05 });
    p.ellipse(hx, hy, 2.6, 2.4, M.skin, { part: 'drawArm' });

    // Рука с луком: наруч, кисть на рукояти.
    p.chain([[32, 36 + up, 4.3], [24, 46 + byy * 0.5, 3.6], [16 + bx, 55 + byy, 3]], M.tunic, { part: 'nearArm' });
    p.limb(24, 46 + byy * 0.5, 3.5, 17 + bx, 54 + byy, 3, M.leather, { part: 'nearArm', paint: true });
    p.ellipse(14.5 + bx, 56 + byy, 2.8, 2.6, M.skin, { part: 'nearArm' });
  },
};

// ─── Головорез ──────────────────────────────────────────────────────────────

const CUT = {
  skin: { base: '#c48b5c', tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  beard: { base: '#4a3222', shag: 0.3, tex: { kind: 'noise', scale: 1.5, amp: 0.2 } } as Mat,
  shirt: { base: '#8b1e2d', tex: { kind: 'noise', scale: 3, amp: 0.1 } } as Mat,
  vest: { base: '#5a3f28', tex: { kind: 'noise', scale: 2.5, amp: 0.14 } } as Mat,
  pants: { base: '#3b3533', tex: { kind: 'stripes', scale: 3, amp: 0.06, angle: 1.57 } } as Mat,
  boot: { base: '#2e241e' } as Mat,
  belt: { base: '#2a201c' } as Mat,
  steel: { base: '#8f979f', shine: 1, dither: 0 } as Mat,
  handle: { base: '#4a3020' } as Mat,
  band: { base: '#26222a', tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
};

export const cutthroat: Model = {
  id: 'cutthroat',
  w: 92,
  h: 116,
  ground: 114,
  draw(p: Painter) {
    const M = CUT;
    const G = 114;
    const up = -p.bob(1.5, 2);
    const heave = (p.wave(2) + 1) / 2;
    p.shadow(42, 30, 3.5);

    // Широкая стойка: дальняя нога, сапог.
    p.chain([[50, 70, 8], [58, 88, 6.5], [60, 106, 4.5]], M.pants, { part: 'far', tone: -0.12 });
    p.poly([54, 102, 66, 102, 67, G, 50, G, 51, 108], M.boot, { part: 'far', tone: -0.1, bevel: 2 });
    // Дальняя рука: кулак сжат.
    p.limb(60, 38 + up, 8, 67, 52 + up, 6.5, M.shirt, { part: 'farArm', tone: -0.12 });
    p.limb(67, 52 + up, 6, 66, 66 + up, 5, M.skin, { part: 'farArm', tone: -0.12 });
    p.ellipse(66, 70 + up, 5.5, 5, M.skin, { part: 'farArm', tone: -0.12 });

    p.chain([[36, 70, 8.5], [28, 89, 7], [26, 106, 4.8]], M.pants, { part: 'near' });
    p.poly([20, 102, 32, 103, 32, G, 13, G, 14, 108], M.boot, { part: 'near', bevel: 2 });

    // Бочка груди в красной рубахе, распахнутый кожаный жилет, ремень.
    p.ellipse(43, 67, 16, 6, M.pants);
    p.ellipse(43, 60 + up * 0.5, 17, 11, M.shirt);
    p.ellipse(44, 45 + up, 21, 15 + heave, M.shirt);
    p.poly([21, 37 + up, 36, 32 + up, 36, 50 + up, 33, 66, 24, 64], M.vest, { paint: true });
    p.poly([51, 32 + up, 67, 37 + up, 62, 64, 52, 66, 52, 50 + up], M.vest, { paint: true });
    p.poly([25, 63, 61, 63, 61, 70, 25, 70], M.belt, { paint: true });
    p.block(41, 65, 3, 2, '#a89060');

    // Голова вжата в плечи: тяжёлая челюсть в бороде, сломанный нос, шрам через глаз,
    // чёрная бандана с концами, которые треплет ветер.
    const knot = 1.5 * p.wave(2, 0.3);
    p.chain([[49, 14 + up, 2.2], [56, 17 + up + knot * 0.5, 1.8], [60, 22 + up + knot, 1.2]], M.band, { part: 'knot' });
    p.chain([[49, 15 + up, 2], [54, 22 + up + knot * 0.3, 1.6], [55, 27 + up + knot * 0.6, 1.1]], M.band, { part: 'knot', tone: -0.1 });
    p.limb(43, 31 + up, 9, 43, 38 + up, 10, M.skin);
    p.ellipse(46.5, 21 + up, 2.4, 3.3, M.skin, { part: 'ear' });
    p.ellipse(40, 19 + up, 10, 10.5, M.skin, { part: 'head' });
    p.ellipse(35.5, 26 + up, 8.5, 6.5, M.skin, { part: 'head' });
    p.poly([28, 25 + up, 38, 24.5 + up, 44, 22 + up, 44, 30 + up, 37, 33 + up, 29, 31 + up], M.beard, { part: 'head', paint: true });
    p.poly([29.5, 8 + up, 44, 7 + up, 50.5, 14 + up, 50, 18 + up, 30, 14.5 + up], M.band, { part: 'head', paint: true });
    p.limb(31.5, 17 + up, 2.3, 28.5, 22.5 + up, 2.1, M.skin, { part: 'nose', lift: 3 });
    p.line(30, 26.5 + up, 35.5, 27 + up, '#140e0c');
    p.line(30.5, 15 + up, 37, 16.5 + up, '#241a14');
    p.eye(34, 18.5 + up, 1.1, '#e8e0d0', { closed: p.blink(0.42), pupil: '#1a1210' });
    p.line(35.5, 14.5 + up, 32.5, 22 + up, '#9a5a44');
    p.px(46.5, 25 + up, '#e8c060');

    // Ближняя рука с тесаком: лезвие чуть покачивается, по кромке пробегает блик.
    p.limb(26, 38 + up, 8.5, 19, 53 + up, 6.5, M.shirt, { part: 'nearArm' });
    p.limb(19, 53 + up, 6, 16, 65 + up, 5, M.skin, { part: 'nearArm' });
    const ang = 0.06 * p.wave(1, 0.1);
    const rot = (x: number, y: number): [number, number] => {
      const cx = 15, cy = 71 + up;
      const dx = x - cx, dy = y - cy;
      return [cx + dx * Math.cos(ang) - dy * Math.sin(ang), cy + dx * Math.sin(ang) + dy * Math.cos(ang)];
    };
    const blade = [[11, 73], [19, 73], [17, 93], [4, 96], [6, 84]].flatMap(([x, y]) => rot(x, y + up));
    p.poly(blade, M.steel, { part: 'blade', bevel: 1.5 });
    const [ex, ey] = rot(5, 90 + up);
    const [fx, fy] = rot(16.5, 94 + up);
    p.line(ex, ey, fx, fy, '#dfe6ee');
    const g = p.t < 0.3 ? p.t / 0.3 : -1;
    if (g >= 0) {
      const [gx, gy] = rot(17 - 12 * g, 76 + 18 * g + up);
      p.px(gx, gy, '#ffffff');
    }
    p.ellipse(15, 70 + up, 5.6, 5, M.skin, { part: 'fist' });
    p.limb(15, 64 + up, 1.8, 15, 76 + up, 1.8, M.handle, { part: 'handle' });
  },
};

// ─── Гоблин ─────────────────────────────────────────────────────────────────

const GOB = {
  skin: { base: '#5f8f4a', tex: { kind: 'noise', scale: 2.5, amp: 0.12 } } as Mat,
  skinDark: { base: '#3f6a34' } as Mat,
  jerkin: { base: '#6b4f3a', tex: { kind: 'noise', scale: 2, amp: 0.12 } } as Mat,
  cloth: { base: '#5a4632', tex: { kind: 'stripes', scale: 2, amp: 0.1, angle: 1.57 } } as Mat,
  wood: { base: '#7a5a3a', tex: { kind: 'stripes', scale: 2.5, amp: 0.15, angle: 1.57 } } as Mat,
  iron: { base: '#8f969e', shine: 0.8, dither: 0 } as Mat,
  rust: { base: '#8a6448', tex: { kind: 'noise', scale: 1.5, amp: 0.3 } } as Mat,
};

export const goblin: Model = {
  id: 'goblin',
  w: 88,
  h: 76,
  ground: 74,
  draw(p: Painter) {
    const M = GOB;
    // Пружинит на полусогнутых: верх тела вниз-вверх, ступни стоят.
    const by = p.bob(1.5, 3);
    const ear = 2 * p.wave(3, 0.2);
    const wig = 1.2 * p.wave(3, 0.5);
    p.shadow(36, 22, 2.5);

    p.chain([[44, 54 + by, 4.5], [48, 63 + by * 0.5, 3.5], [47, 71, 2.6]], M.skin, { part: 'far', tone: -0.15 });
    p.limb(47, 72, 2.4, 40, 73, 1.8, M.skin, { part: 'far', tone: -0.15 });

    // Дальняя рука с ржавым клинком занесена над головой.
    p.chain([[46, 37 + by, 3.4], [55, 31 + by, 3], [58, 21 + by, 2.8]], M.skin, { part: 'farArm', tone: -0.12 });
    p.poly([56 + wig * 0.3, 20 + by, 60 + wig * 0.3, 20 + by, 62 + wig, 4 + by, 59.5 + wig, 0 + by, 57.5 + wig, 3 + by], M.iron, { part: 'blade', bevel: 1 });
    p.ellipse(59 + wig * 0.6, 11 + by, 1.3, 2.5, M.rust, { part: 'blade', paint: true });
    p.limb(54.5, 21 + by, 1.1, 62.5, 21 + by, 1.1, M.rust, { part: 'guard' });
    p.ellipse(58, 22 + by, 2.8, 2.6, M.skin, { part: 'fist', tone: -0.1 });

    p.chain([[36, 54 + by, 5], [30, 63 + by * 0.5, 4], [30, 71, 2.8]], M.skin, { part: 'near' });
    p.limb(30, 72, 2.6, 21, 73, 2, M.skin, { part: 'near' });
    p.px(21, 73.5, '#2a3a20');
    p.px(24, 73.5, '#2a3a20');

    // Тщедушное тело в куртке, пузо наружу, набедренная повязка.
    p.ellipse(40, 43 + by, 11, 12, M.jerkin);
    p.ellipse(36, 50 + by, 7, 5, M.skin, { paint: true });
    p.poly([30, 52 + by, 48, 52 + by, 47, 62, 39, 58, 32, 62], M.cloth, { part: 'loin', bevel: 2 });

    // Уши-лопухи: дальнее за головой, ближнее поверх.
    p.poly([26, 14 + by, 11, 5 + by - ear * 0.5, 23, 20 + by], M.skin, { part: 'ear2', bevel: 2, tone: -0.1 });
    p.ellipse(32, 20 + by, 12, 10.5, M.skin, { part: 'head' });
    p.poly([40, 15 + by, 64, 8 + by + ear, 42, 24 + by], M.skin, { part: 'ear', bevel: 2.5 });
    p.poly([43, 17 + by, 58, 11 + by + ear, 44, 21 + by], M.skinDark, { part: 'ear', paint: true });
    p.limb(23, 20 + by, 3.4, 13, 27 + by, 1.8, M.skin, { part: 'nose', lift: 3 });

    // Ухмылка с кривыми зубами, жёлтые глаза, злые брови.
    p.line(17, 28 + by, 29, 30 + by, '#1c2414');
    p.px(19, 29 + by, '#e8e0c0');
    p.px(23, 29.5 + by, '#e8e0c0');
    p.px(27, 30 + by, '#e8e0c0');
    const shut = p.blink(0.8);
    p.eye(22, 17 + by, 1.9, '#ffd23a', { closed: shut, pupil: '#1a1a10', glint: '#fff8d0' });
    p.eye(30, 16.5 + by, 1.9, '#ffd23a', { closed: shut, pupil: '#1a1a10', glint: '#fff8d0' });
    p.line(18.5, 13.5 + by, 24, 15 + by, '#23301c');
    p.line(27, 14 + by, 33, 13 + by, '#23301c');

    // Круглый щит в ближней руке: доски, железный обод и умбон.
    p.limb(33, 38 + by, 3.8, 24, 46 + by, 3.2, M.skin, { part: 'nearArm' });
    p.ellipse(18, 48 + by, 10.5, 12.5, M.iron, { part: 'shield', flat: 0.6 });
    p.ellipse(18, 48 + by, 9, 11, M.wood, { part: 'shield', flat: 0.6, lift: 1 });
    p.ellipse(18, 48 + by, 3, 3.2, M.iron, { part: 'shield', lift: 4 });
    if (p.d < 3) {
      p.line(13, 38 + by, 13, 58 + by, '#4a3422');
      p.line(23, 38 + by, 23, 58 + by, '#4a3422');
    }
  },
};

// ─── Гоблин-шаман ───────────────────────────────────────────────────────────

const SHAMAN = {
  skin: GOB.skin,
  hat: { base: '#6e3470', tex: { kind: 'noise', scale: 3, amp: 0.1 } } as Mat,
  band: { base: '#2e1a3a' } as Mat,
  robe: { base: '#4d2c5e', tex: { kind: 'stripes', scale: 3, amp: 0.1, angle: 1.4 } } as Mat,
  wood: { base: '#6a4a2e', tex: { kind: 'bark', scale: 1.5, amp: 0.2, angle: 1.57 } } as Mat,
  crystal: { base: '#e8d24a', glow: true, dither: 0 } as Mat,
  bone: { base: '#e2d8c0', dither: 0 } as Mat,
  feather: { base: '#c0603e', dither: 0 } as Mat,
  skinDark: GOB.skinDark,
};

export const goblinShaman: Model = {
  id: 'goblin_shaman',
  w: 88,
  h: 82,
  ground: 80,
  draw(p: Painter) {
    const M = SHAMAN;
    const G = 80;
    const hy = p.bob(1.2, 2);
    const hem = 1.6 * p.wave(1);
    const tip = 1.5 * p.wave(1, 0.3);
    const pulse = (p.wave(2) + 1) / 2;
    p.shadow(38, 24, 3);

    // Дальний рукав, когтистая кисть.
    p.limb(46, 38 + hy, 4, 52, 52 + hy, 5, M.robe, { part: 'farArm', tone: -0.15 });
    p.ellipse(53, 56 + hy, 2.4, 2.2, M.skin, { part: 'farArm', tone: -0.15 });

    // Балахон до земли с рваным подолом.
    p.poly([
      26, 34 + hy, 46, 34 + hy, 52, 56, 58 + hem, 78, 53 + hem, G, 47 + hem * 0.7, 77, 41 + hem * 0.5, G,
      35 + hem * 0.4, 77, 29 + hem * 0.3, G, 23 + hem * 0.2, 77, 20, 60,
    ], M.robe, { bevel: 7 });
    p.ellipse(36, 50, 12, 1.8, M.band, { paint: true });

    // Мантия-воротник с зубчатым краем и светлой оторочкой по полам.
    p.poly([21, 36 + hy, 49, 36 + hy, 51, 46 + hy, 46, 43 + hy, 41, 47 + hy, 36, 43 + hy, 31, 47 + hy, 26, 43 + hy, 20, 46 + hy], M.band, { part: 'mantle', bevel: 3 });
    p.line(36, 48 + hy, 37, 78, '#7a5a8a');

    // Голова: длинный крючковатый нос, висячие уши; верх лица в тени полей — глаза горят из неё.
    p.poly([38, 27 + hy, 55, 32 + hy + tip * 0.5, 40, 33 + hy], M.skin, { part: 'ear', bevel: 1.5, tone: -0.1 });
    p.ellipse(29, 30.5 + hy, 9.5, 8, M.skin, { part: 'head' });
    p.ellipse(30, 25.5 + hy, 10, 3.2, M.skinDark, { part: 'head', paint: true });
    p.limb(23, 31 + hy, 3.2, 12, 38 + hy, 1.6, M.skin, { part: 'nose', lift: 3 });
    p.line(18, 36.5 + hy, 26, 37.5 + hy, '#1c2414');
    p.px(21, 37.5 + hy, '#e8e0c0');

    // Шляпа: поля, конус, заломленный кончик, перо.
    p.ellipse(33, 20 + hy, 17, 3.8, M.hat, { part: 'hat', flat: 0.5 });
    p.poly([22, 20 + hy, 45, 20 + hy, 39, 6 + hy, 33, 3 + hy], M.hat, { part: 'hat', bevel: 4 });
    p.chain([[35, 5 + hy, 3], [43, 1 + hy, 2], [50 + tip, 3 + hy + tip, 1.2]], M.hat, { part: 'hat' });
    p.poly([23, 16.5 + hy, 44, 16.5 + hy, 45, 19.5 + hy, 22, 19.5 + hy], M.band, { part: 'hat', paint: true });
    p.poly([43, 16 + hy, 47, 9 + hy, 53, 5 + hy, 51, 11 + hy, 45, 17 + hy], M.feather, { part: 'feather', bevel: 1.2 });
    p.line(44, 16 + hy, 52, 6 + hy, '#6a2a1e');

    const shut = p.blink(0.3);
    p.eye(23.5, 28 + hy, 1.5, '#ffe066', { closed: shut, glint: '#fffbe0' });
    p.eye(29.5, 27.5 + hy, 1.5, '#ffe066', { closed: shut, glint: '#fffbe0' });

    // Ожерелье из клыков и черепок-оберег на груди.
    for (const [x, y] of [[26, 49], [29, 50.5], [32.5, 51.5], [39.5, 51.5], [43, 50]]) p.px(x, y + hy, '#e2d8c0');
    p.disc(36, 53 + hy, 2, '#e2d8c0');
    if (p.d < 3) {
      p.px(35, 53 + hy, '#2a2030');
      p.px(37, 53 + hy, '#2a2030');
    }

    // Посох с кристаллом: свечение дышит, вокруг кружат искры.
    p.chain([[16, G, 1.4], [15, 50, 1.6], [17, 20, 1.8], [15, 12, 2.2]], M.wood, { part: 'staff' });
    p.limb(15, 12, 1.2, 11, 7, 0.8, M.wood, { part: 'staff' });
    p.limb(15, 12, 1.2, 19.5, 6.5, 0.8, M.wood, { part: 'staff' });
    p.glow(15, 6, 7 + 3 * pulse, '#e8d24a', 0.25 + 0.15 * pulse);
    p.poly([15, 0, 19, 5, 15, 11, 11, 5], M.crystal, { part: 'crystal', bevel: 1.5 });
    for (let k = 0; k < 3; k++) {
      const a = 2 * Math.PI * (p.t * 2 + k / 3);
      p.px(15 + 10 * Math.cos(a), 6 + 6 * Math.sin(a), '#fff4a0');
    }

    // Ближний рукав, кисть на посохе.
    p.limb(32, 42 + hy, 4.2, 22, 48 + hy, 5.6, M.robe, { part: 'nearArm' });
    p.poly([18, 44 + hy, 25, 42 + hy, 26, 54 + hy, 20, 53 + hy], M.robe, { part: 'nearArm', bevel: 2, tone: -0.1 });
    p.ellipse(15.5, 47 + hy, 3.2, 3.2, M.skin, { part: 'hand' });
    p.px(13, 49 + hy, '#2a3a20');
  },
};

// ─── Медведь ────────────────────────────────────────────────────────────────

const BEAR = {
  fur: { base: '#5e4130', shag: 0.3, tex: { kind: 'fur', scale: 3.5, amp: 0.18, stretch: 3, angle: 0.3 } } as Mat,
  dark: { base: '#3c2a20', shag: 0.3, tex: { kind: 'fur', scale: 3.5, amp: 0.18, stretch: 3, angle: 1.4 } } as Mat,
  tip: { base: '#75573f', shag: 0.35, tex: { kind: 'fur', scale: 3, amp: 0.2, stretch: 2.5 } } as Mat,
  muzzle: { base: '#8a6a4a', tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  nose: { base: '#1e1818', shine: 1, dither: 0 } as Mat,
  claw: { base: '#b8aa90', dither: 0 } as Mat,
  mouth: { base: '#5a2020', dither: 0 } as Mat,
};

export const bear: Model = {
  id: 'bear',
  w: 226,
  h: 148,
  ground: 144,
  draw(p: Painter) {
    const M = BEAR;
    const G = 144;
    // Тяжёлое дыхание: бока ходят, голова покачивается, на выдохе пасть приоткрывается.
    const breath = p.wave(2);
    const huff = (p.wave(2, 0.1) + 1) / 2;
    const hy = p.snap(1.4 * p.wave(2, 0.25));
    const hx = p.snap(1 * p.wave(1));
    const ear = p.blink(0.7, 0.06);
    p.shadow(112, 96, 5);

    const paw = (x: number, part: string, tone = 0): void => {
      p.ellipse(x, G - 5, 15, 6, M.dark, { part, tone, flat: 0.3 });
      for (let k = 0; k < 3; k++) p.chain([[x - 11 + k * 4.5, G - 6, 1.5], [x - 15 + k * 4.5, G - 3, 1.1], [x - 16.5 + k * 4.5, G - 0.5, 0.6]], M.claw, { part: `${part}Claw`, tone });
    };
    // Дальние лапы.
    p.chain([[102, 84, 16], [102, 112, 12], [99, 134, 10]], M.dark, { part: 'far', tone: -0.12 });
    paw(99, 'far', -0.1);
    p.chain([[196, 84, 20], [204, 110, 14], [200, 134, 10]], M.dark, { part: 'far', tone: -0.12 });
    paw(198, 'far', -0.1);

    // Туловище: горб над лопатками — самая высокая точка, спина уходит к крупу.
    p.ellipse(136, 64, 60, 36 + breath, M.fur, { rot: 0.06 });
    p.ellipse(186, 68, 30, 31, M.fur);
    p.ellipse(98, 46, 40, 38 + breath * 0.8, M.fur);
    p.ellipse(104, 22, 30, 16, M.tip, { paint: true });
    p.ellipse(150, 38, 40, 10, M.tip, { paint: true, rot: 0.08 });
    p.ellipse(140, 96, 44, 8, M.dark, { paint: true });

    // Ближние лапы: столбы с когтями.
    p.chain([[80, 80, 20], [75, 110, 15], [70, 134, 12]], M.fur, { part: 'near' });
    paw(66, 'near');
    p.chain([[176, 84, 24], [184, 110, 16], [176, 134, 12]], M.fur, { part: 'near' });
    paw(172, 'near');

    // Голова: круглые уши, широкий лоб, светлая морда, чёрный нос.
    const X = hx, Y = hy;
    p.ellipse(60 + X, 34 + Y - ear * 2, 7.5, 7.5, M.dark, { part: 'ear', tone: -0.1 });
    p.limb(30 + X, 81 + Y + huff * 2, 9.5, 16 + X, 82 + Y + huff * 4, 6.5, M.muzzle, { part: 'jaw', tone: -0.2 });
    p.ellipse(50 + X, 58 + Y, 27, 23, M.fur, { part: 'head' });
    p.ellipse(44 + X, 36 + Y, 7, 7, M.fur, { part: 'head', lift: 4 });
    p.ellipse(44 + X, 36 + Y, 3.8, 3.8, M.dark, { part: 'head', paint: true });
    p.ellipse(40 + X, 50 + Y, 15, 11, M.fur, { part: 'head', lift: 8 });
    p.limb(32 + X, 68 + Y, 13, 17 + X, 73 + Y, 9.5, M.muzzle, { part: 'head', lift: 4 });
    p.ellipse(10 + X, 70 + Y, 6, 5, M.nose, { part: 'head', lift: 10 });
    p.line(12 + X, 79 + Y, 28 + X, 80 + Y + huff, '#1a1010');
    if (huff > 0.5) p.line(15 + X, 80.5 + Y + huff * 2, 24 + X, 81 + Y + huff * 2, '#5a2020');
    p.eye(33 + X, 56 + Y, 2.2, '#ffe8a3', { closed: p.blink(0.45), glint: '#fffbe8' });
    p.line(27 + X, 51 + Y, 38 + X, 53 + Y, '#20150f');
  },
};

// ─── Тролль ─────────────────────────────────────────────────────────────────

const TROLL = {
  skin: { base: '#6a8258', tex: { kind: 'spots', scale: 6, amp: 0.35, density: 0.22 } } as Mat,
  moss: { base: '#3e5a2c', shag: 0.35, tex: { kind: 'noise', scale: 1.8, amp: 0.3 } } as Mat,
  loin: { base: '#5a4632', tex: { kind: 'fur', scale: 2, amp: 0.2, stretch: 2, angle: 1.57 } } as Mat,
  wood: { base: '#6a4a2e', tex: { kind: 'bark', scale: 2, amp: 0.25, angle: 1.1 } } as Mat,
  tusk: { base: '#d8ccb0', dither: 0 } as Mat,
  nail: { base: '#8a9098', shine: 0.8, dither: 0 } as Mat,
  cap: { base: '#b03a2e', dither: 0 } as Mat,
};

const trollBase: Model = {
  id: 'troll',
  w: 150,
  h: 162,
  ground: 158,
  draw(p: Painter) {
    const M = TROLL;
    const G = 158;
    const breath = p.wave(2);
    const up = -p.bob(2, 2);
    const hy = p.snap(1.2 * p.wave(2, 0.2));
    // Капля слюны срывается с губы и падает к земле во второй половине цикла.
    const drop = p.t > 0.55 && p.t < 0.8 ? (p.t - 0.55) / 0.25 : -1;
    p.shadow(78, 62, 5);

    const foot = (x: number, part: string, tone = 0): void => {
      p.ellipse(x, G - 5, 13, 5.5, M.skin, { part, tone, flat: 0.3 });
      for (let k = 0; k < 3; k++) p.ellipse(x - 11 + k * 4, G - 3.5, 2.4, 2.6, M.skin, { part: `${part}Toe`, tone: tone - 0.05 });
    };
    // Дальние нога и рука.
    p.chain([[88, 112, 14], [95, 132, 11.5], [93, 148, 9]], M.skin, { part: 'far', tone: -0.12 });
    foot(92, 'far', -0.1);
    p.chain([[106, 58 + up, 13], [120, 90 + up, 10], [118, 116 + up, 9]], M.skin, { part: 'farArm', tone: -0.14 });
    p.ellipse(118, 124 + up, 10, 9.5, M.skin, { part: 'farArm', tone: -0.14 });

    p.chain([[66, 112, 15], [58, 132, 12.5], [56, 148, 10]], M.skin, { part: 'near' });
    foot(54, 'near');

    // Туловище: горб, брюхо, мох на плечах, набедренная шкура.
    p.ellipse(80, 82 + up * 0.5, 33, 36 + breath, M.skin);
    p.ellipse(88, 46 + up, 29, 27, M.skin);
    p.ellipse(72, 104, 27, 16 + breath * 0.8, M.skin);
    p.ellipse(94, 30 + up, 20, 9, M.moss, { paint: true, rot: 0.2 });
    p.ellipse(106, 44 + up, 9, 13, M.moss, { paint: true });
    p.poly([46, 110, 100, 110, 103, 128, 88, 124, 78, 132, 66, 124, 50, 130], M.loin, { part: 'loin', bevel: 4 });
    p.disc(70, 100 + up * 0.5, 1, '#3a4a2c');
    // Два крошечных мухомора выросли на горбу.
    if (p.d < 3) {
      p.limb(98, 20 + up, 0.8, 98, 24 + up, 0.8, M.tusk, { part: 'shroom' });
      p.ellipse(98, 19 + up, 2.6, 1.6, M.cap, { part: 'shroom' });
      p.limb(104, 22 + up, 0.7, 104, 25 + up, 0.7, M.tusk, { part: 'shroom' });
      p.ellipse(104, 21.5 + up, 2, 1.3, M.cap, { part: 'shroom' });
    }

    // Ближняя рука до колен, в кулаке дубина с гвоздями, упёртая в землю.
    p.chain([[62, 62 + up, 14], [44, 94 + up, 11], [34, 120 + up, 9]], M.skin, { part: 'nearArm' });
    p.chain([[32, 122 + up, 5], [21, 138, 8], [12, 150, 11]], M.wood, { part: 'club' });
    for (const [x, y] of [[5, 142], [15, 145], [9, 154]]) p.limb(x, y, 1, x - 3, y - 2, 0.7, M.nail, { part: 'nail' });
    p.ellipse(32, 126 + up, 11, 10, M.skin, { part: 'fist' });

    // Голова вжата в плечи и выдвинута вперёд: ухо, тяжёлое надбровье, нос-картошка, выпирающая челюсть с клыками.
    p.poly([54, 34 + hy, 72, 22 + hy, 64, 44 + hy], M.skin, { part: 'ear', bevel: 2, tone: -0.1 });
    p.ellipse(36, 63 + hy, 17, 10, M.skin, { part: 'jaw' });
    p.ellipse(41, 44 + hy, 21, 18, M.skin, { part: 'head' });
    p.ellipse(35, 34 + hy, 16, 6, M.skin, { part: 'head', lift: 6 });
    p.ellipse(40, 28 + hy, 14, 4.5, M.moss, { part: 'head', paint: true, tone: -0.1 });
    p.limb(27, 43 + hy, 8.5, 14, 56 + hy, 7.5, M.skin, { part: 'nose', lift: 4 });
    p.poly([22, 64 + hy, 26, 64 + hy, 25.5, 51 + hy], M.tusk, { part: 'tusk', bevel: 1 });
    p.poly([37, 65.5 + hy, 41, 65.5 + hy, 40, 53.5 + hy], M.tusk, { part: 'tusk', bevel: 1 });
    p.line(21, 61 + hy, 47, 62.5 + hy, '#1a2012');
    const shut = p.blink(0.35);
    p.eye(26, 39 + hy, 2.2, '#ffe8a3', { closed: shut, glint: '#fffbe8' });
    p.eye(38, 38.5 + hy, 2.2, '#ffe8a3', { closed: shut, glint: '#fffbe8' });
    p.line(20, 35.5 + hy, 30, 37.5 + hy, '#1e2616');
    p.line(34, 36.5 + hy, 44, 35 + hy, '#1e2616');
    if (drop >= 0) p.disc(28, 67 + hy + drop * (G - 71), 0.9, '#a8c8a0');
  },
};

// ─── Гномы-воры ─────────────────────────────────────────────────────────────

const GNOME = {
  skin: { base: '#d6a07c' } as Mat,
  nose: { base: '#d67f6a' } as Mat,
  beard: { base: '#d8d2c6', shag: 0.35, tex: { kind: 'fur', scale: 1.5, amp: 0.2, stretch: 2, angle: 1.4 } } as Mat,
  cap: { base: '#2f6e3e', tex: { kind: 'noise', scale: 2.5, amp: 0.1 } } as Mat,
  jacket: { base: '#7a5230', tex: { kind: 'noise', scale: 2, amp: 0.12 } } as Mat,
  belt: { base: '#2a1e16' } as Mat,
  pants: { base: '#4a3a30' } as Mat,
  shoe: { base: '#3a2a20' } as Mat,
  sack: { base: '#8a6d48', tex: { kind: 'stripes', scale: 1.5, amp: 0.15, angle: 0.8 } } as Mat,
  rope: { base: '#5a4630' } as Mat,
  gold: { base: '#f2c14e', shine: 1, dither: 0 } as Mat,
};

/** Ноги гнома в остроносых башмаках с загнутым носком. */
function gnomeLegs(p: Painter, pants: Mat, shoe: Mat, G: number, by: number): void {
  p.chain([[38, 52 + by, 3.4], [40, 58, 3], [39, 63, 2.6]], pants, { part: 'far', tone: -0.12 });
  p.poly([34, 61, 43, 61, 43, G, 31, G, 28.5, 62.5], shoe, { part: 'far', tone: -0.1, bevel: 1.5 });
  p.chain([[31, 52 + by, 3.6], [28, 58, 3], [27, 63, 2.6]], pants, { part: 'near' });
  p.poly([22, 61, 31, 61, 31, G, 19, G, 16, 62], shoe, { part: 'near', bevel: 1.5 });
  p.chain([[17.5, 62.5, 1.2], [15, 60, 0.9]], shoe, { part: 'toe' });
}

export const gnomeThief: Model = {
  id: 'gnome_thief',
  w: 84,
  h: 70,
  ground: 67,
  draw(p: Painter) {
    const M = GNOME;
    const G = 67;
    const by = p.bob(1, 3);
    // Глаза бегают: то на героя, то через плечо на мешок.
    const look = p.t < 0.3 ? -0.8 : p.t < 0.6 ? 0.9 : -0.3;
    p.shadow(38, 22, 2.5);

    // Мешок с золотом за спиной, из горловины блестят монеты.
    p.ellipse(55, 40 + by, 14, 15, M.sack, { part: 'sack' });
    p.limb(45, 26 + by, 3, 49, 31 + by, 4.2, M.sack, { part: 'sack' });
    p.limb(46, 29 + by, 4.4, 47.5, 30.5 + by, 4.4, M.rope, { part: 'sack', paint: true });
    for (const [x, y] of [[42, 24], [45.5, 22], [48, 25]]) p.ellipse(x, y + by, 2.2, 1.8, M.gold, { part: 'coins' });
    p.ellipse(43, 29 + by, 3, 2.8, M.skin, { part: 'farHand', tone: -0.1 });

    gnomeLegs(p, M.pants, M.shoe, G, by);

    // Кругленький в куртке, ремень с пряжкой.
    p.ellipse(34, 45 + by, 10.5, 10, M.jacket);
    p.poly([24, 47 + by, 45, 47 + by, 45, 51 + by, 24, 51 + by], M.belt, { paint: true });
    p.block(33, 48 + by, 2, 2, '#e8c060');

    // Голова: колпак с заломленным кончиком, нос-картошка, борода лопатой, бегающие глаза.
    p.ellipse(30, 30 + by, 9, 8, M.skin, { part: 'head' });
    p.poly([21, 31 + by, 38, 31 + by, 37, 40 + by, 31, 46 + by, 25, 44 + by, 20.5, 38 + by], M.beard, { part: 'beard', bevel: 3 });
    p.ellipse(21.5, 31 + by, 4, 3.2, M.nose, { part: 'nose', lift: 4 });
    const shut = p.blink(0.85);
    p.eye(24.5, 27 + by, 1.3, '#f4efe4', { closed: shut, pupil: '#1a1410' });
    p.eye(30, 26.5 + by, 1.3, '#f4efe4', { closed: shut, pupil: '#1a1410' });
    if (!shut && p.d < 3) {
      p.px(24.5 + look, 27 + by, '#1a1410');
      p.px(30 + look, 26.5 + by, '#1a1410');
    }
    p.line(22, 24.5 + by, 26, 24 + by, '#e8e2d6');
    p.line(28.5, 24 + by, 32, 23.5 + by, '#e8e2d6');
    p.poly([19.5, 24 + by, 42, 24 + by, 36, 8 + by, 31, 4 + by], M.cap, { part: 'cap', bevel: 3 });
    p.chain([[32, 6 + by, 2.6], [40, 2 + by, 1.8], [46.5, 6 + by, 1]], M.cap, { part: 'cap' });
    p.ellipse(31, 24.5 + by, 12, 2.6, M.cap, { part: 'cap', tone: -0.2, flat: 0.5 });

    // Ближняя рука ладонью вверх: подбрасывает монету — она вертится в воздухе ребром и плашмя.
    p.chain([[26, 38 + by, 3.2], [20, 44 + by, 2.8], [15.5, 41 + by, 2.6]], M.jacket, { part: 'nearArm' });
    p.ellipse(14.5, 40 + by, 2.8, 2.3, M.skin, { part: 'hand' });
    const u = (p.t - 0.1) / 0.4;
    const fly = u > 0 && u < 1;
    const cy = 36 + by - (fly ? 16 * 4 * u * (1 - u) : 0);
    const edge = fly && Math.floor(u * 8) % 2 === 1;
    if (edge) p.line(13, cy, 16, cy, '#f2c14e');
    else p.ellipse(14.5, cy, 2.2, 1.9, M.gold, { part: 'coin' });
  },
};

const SNATCH = {
  hood: { base: '#6a2438', tex: { kind: 'noise', scale: 2.5, amp: 0.1 } } as Mat,
  coat: { base: '#9c3b4e', tex: { kind: 'stripes', scale: 2.5, amp: 0.08, angle: 1.4 } } as Mat,
  hollow: { base: '#241018', dither: 0 } as Mat,
  skin: { base: '#c99270' } as Mat,
  pack: { base: '#5a4030', tex: { kind: 'stripes', scale: 2, amp: 0.12 } } as Mat,
  silver: { base: '#c8c8da', shine: 1, dither: 0 } as Mat,
  gold: GNOME.gold,
  scroll: { base: '#d8ccaa' } as Mat,
  gem: { base: '#5cf0ff', glow: true, dither: 0 } as Mat,
  shoe: { base: '#2a1a1e' } as Mat,
  pants: { base: '#3a1a22' } as Mat,
};

const snatcherBase: Model = {
  id: 'gnome_snatcher',
  w: 84,
  h: 70,
  ground: 67,
  draw(p: Painter) {
    const M = SNATCH;
    const G = 67;
    const by = p.bob(1, 3, 0.2);
    const sway = 1.5 * p.wave(1);
    // Украденный амулет качается маятником на цепочке.
    const swing = p.wave(2);
    p.shadow(38, 22, 2.5);

    // Котомка с добычей: подсвечник, рукоять меча, свиток.
    p.limb(50, 24 + by, 1.2, 52, 12 + by, 1.2, M.gold, { part: 'loot' });
    p.ellipse(52, 11 + by, 2, 1.2, M.gold, { part: 'loot' });
    p.limb(58, 26 + by, 1, 62, 14 + by, 1, M.silver, { part: 'loot' });
    p.limb(59, 16 + by, 0.9, 65, 17.5 + by, 0.9, M.silver, { part: 'loot' });
    p.limb(44, 26 + by, 1.8, 47, 18 + by, 1.8, M.scroll, { part: 'loot' });
    p.poly([43, 24 + by, 64, 24 + by, 66, 48 + by, 44, 50 + by], M.pack, { part: 'pack', bevel: 4 });

    gnomeLegs(p, M.pants, M.shoe, G, by);

    // Дальняя рука с когтистой кистью.
    p.chain([[42, 36 + by, 3], [46, 44 + by, 2.6], [45, 50 + by, 2.2]], M.coat, { part: 'farArm', tone: -0.15 });
    p.ellipse(45, 52 + by, 2.2, 2, M.skin, { part: 'farArm', tone: -0.15 });

    // Кафтан с поясом, полы качаются.
    p.poly([24, 32 + by, 44, 32 + by, 48 + sway * 0.5, 58, 40, 60, 30, 59, 18 + sway * 0.3, 58], M.coat, { bevel: 5 });
    p.poly([23, 46 + by, 46, 46 + by, 46, 50 + by, 22, 50 + by], M.hollow, { paint: true });

    // Капюшон с острым кончиком, из тени торчит нос и блестят глаза.
    p.poly([32, 18 + by, 50 + sway, 14 + by, 41, 28 + by], M.hood, { part: 'hood', bevel: 2 });
    p.ellipse(31, 27 + by, 11, 10.5, M.hood, { part: 'hood' });
    p.ellipse(26.5, 29 + by, 7, 7, M.hollow, { part: 'hood', paint: true });
    p.limb(24, 30 + by, 2.6, 15, 34 + by, 1.6, M.skin, { part: 'nose', lift: 3 });
    if (!p.blink(0.62)) {
      p.px(23.5, 27 + by, '#d8e8ff');
      p.px(28, 26.5 + by, '#d8e8ff');
    }

    // Ближняя рука поднята: на пальцах цепочка, внизу качается амулет.
    p.chain([[27, 37 + by, 3.2], [20, 40 + by, 2.8], [15, 33 + by, 2.4]], M.coat, { part: 'nearArm' });
    p.ellipse(14.5, 31.5 + by, 2.5, 2.3, M.skin, { part: 'hand' });
    const ax = 14.5 + 4 * swing, ay = 44 + by - Math.abs(swing) * 1.2;
    p.line(14.5, 33 + by, ax, ay - 2, '#b8b8c8');
    p.ellipse(ax, ay, 2.4, 2.4, M.silver, { part: 'amulet' });
    p.ellipse(ax, ay, 1.3, 1.3, M.gem, { part: 'amulet', lift: 2 });
    if (Math.abs(swing) < 0.3) p.px(ax - 1, ay - 1, '#ffffff');
  },
};

// Рост по таблице ENEMY_BODY_HEIGHT: лепка шла в своих координатах, масштаб подгоняет её целиком.
export const boar = scaleModel(boarBase, 1.12);
export const troll = scaleModel(trollBase, 156 / 144);
export const gnomeSnatcher = scaleModel(snatcherBase, 64 / 59);

export const FOREST_MODELS: Record<string, Model> = { gnome_thief: gnomeThief, gnome_snatcher: gnomeSnatcher, bear, troll, wolf, alpha_wolf: alphaWolf, boar, rat, bat, spider, bandit_archer: banditArcher, cutthroat, goblin, goblin_shaman: goblinShaman };
