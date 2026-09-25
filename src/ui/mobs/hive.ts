import { along, keys, mixPt, scaleModel, type Keys, type Mat, type Model, type Painter, type Pt } from './pixel';

/**
 * Враги Осквернённого улья пиксельной лепкой. Все смотрят влево — на героя; единица — пиксель поля боя,
 * рост от макушки до земли — как в `ENEMY_BODY_HEIGHT` (characterSizes.ts).
 * Цвета продолжают палитры прежних спрайтов (`sprite` в enemies.ts): Трутень бурый с кислотными глазами,
 * Оса золотая с красными, Личинка бледная, жуки и колосс в лиловом хитине, Споровик фиолетовый со светящимися
 * пятнами, Кладка сиреневая, Сердце улья багровое. Улей липкий: у хитина и слизи блик, крылья прозрачные (`film`).
 */

// ─── Общее ──────────────────────────────────────────────────────────────────

/** Хребет в кадре: покой, замах, выпад и отдача по точкам — пиявка Болот, здесь брюшко осы и тело личинки. */
function spineAt(rest: Pt[], wind: Array<[number, number]>, hit: Array<[number, number]>, hurtPts: Array<[number, number]>, w: number, s: number, h: number): Pt[] {
  return rest.map(([x, y, r], i) => {
    const [mx, my] = mixPt([x, y], wind[i], hit[i], w, s);
    return [mx + (hurtPts[i][0] - x) * h, my + (hurtPts[i][1] - y) * h, r];
  });
}

/** Поперечная полоса по хребту на доле `f`: пояс брюшка осы, складка личинки. */
function band(p: Painter, spine: Pt[], f: number, wid: number, mat: Mat, part: string, k = 1): void {
  const { x, y, r, tx, ty } = along(spine, f);
  p.limb(x - ty * r * 1.1 * k, y + tx * r * 1.1 * k, wid, x + ty * r * 1.1 * k, y - tx * r * 1.1 * k, wid, mat, { part, paint: true });
}

/**
 * Крыло насекомого: вытянутый лепесток от корня (x, y) под углом `ang` (радианы, 0 — назад, к хвосту; минус — вверх),
 * длина `len`, ширина `wid`. Плёнка полупрозрачная; жилки — светлые линии вдоль.
 */
function wingPts(x: number, y: number, len: number, wid: number, ang: number): number[] {
  const c = Math.cos(ang), s = Math.sin(ang);
  const out: number[] = [];
  const n = 12;
  for (let k = 0; k <= n; k++) {
    const a = Math.PI * (k / n);
    // Лепесток: передний край ровнее, задний круглее; корень узкий.
    const u = (1 - Math.cos(a)) / 2;
    const v = Math.sin(a) * wid * (k < n / 2 ? 0.7 : 1) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.15)));
    const lx = u * len, ly = -v;
    out.push(x + lx * c - ly * s, y + lx * s + ly * c);
  }
  for (let k = n - 1; k > 0; k--) {
    const a = Math.PI * (k / n);
    const u = (1 - Math.cos(a)) / 2;
    const v = Math.sin(a) * wid * 0.28;
    const lx = u * len, ly = v;
    out.push(x + lx * c - ly * s, y + lx * s + ly * c);
  }
  return out;
}

function wing(p: Painter, x: number, y: number, len: number, wid: number, ang: number, color: string, vein: string, under: boolean): void {
  p.film(wingPts(x, y, len, wid, ang), color, under);
  const c = Math.cos(ang), s = Math.sin(ang);
  // Передняя жилка — по краю, от корня до двух третей длины.
  p.line(x, y, x + len * 0.7 * c + wid * 0.45 * s, y + len * 0.7 * s - wid * 0.45 * c, vein, under);
}

// ─── Личинка ────────────────────────────────────────────────────────────────

const LARVA = {
  skin: { base: '#d0bc8e', shine: 0.45, tex: { kind: 'noise', scale: 3, amp: 0.05 } } as Mat,
  gut: { base: '#9a7a8e', shine: 0.2 } as Mat,
  head: { base: '#9a6232', shine: 0.6, tex: { kind: 'noise', scale: 1.5, amp: 0.08 } } as Mat,
  jaw: { base: '#3e2626', shine: 0.4, dither: 0 } as Mat,
};

/**
 * Тело личинки от хвоста к голове: жирная дуга — зад и голова у земли, спина горбом.
 * Замах — голова поднята и отведена, дуга круче; бросок — тело вытянуто к герою; урон — свернулась калачиком.
 */
const LARVA_REST: Pt[] = [[72, 33, 6], [68, 27, 8.5], [61, 22, 10.5], [51, 19.5, 12], [40, 20, 12], [30, 23, 11], [22, 28, 9.5], [16, 31, 8]];
const LARVA_WIND: Array<[number, number]> = [[72, 33], [69, 26], [63, 19], [55, 15], [45, 14], [36, 15], [29, 16], [24, 16]];
const LARVA_HIT: Array<[number, number]> = [[72, 33], [65, 29], [56, 26], [46, 25], [36, 26], [26, 28], [16, 30], [6, 31]];
const LARVA_HURT: Array<[number, number]> = [[72, 33], [70, 25], [65, 18], [56, 15], [46, 16], [38, 20], [34, 26], [32, 31]];

export const larva: Model = {
  id: 'larva',
  w: 80,
  h: 42,
  ground: 40,
  // Бросок: жвалы в кадре контакта — на 14 единиц левее рамки.
  pad: 26,
  draw(p: Painter) {
    const M = LARVA;
    const G = 40;
    // Грызть: замах — голова поднята и отведена, дуга круче; бросок — вытянуться к герою, жвалы настежь.
    // Урон: свернулась калачиком, голову поджала, глаза зажмурены.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const n = LARVA_REST.length;
    const calm = 1 - Math.max(wind, strike, hurt);
    const base = spineAt(LARVA_REST, LARVA_WIND, LARVA_HIT, LARVA_HURT, wind, strike, hurt);
    // Волна сокращений бежит от хвоста к голове: горб то выше, то ниже; голова водит жвалами по земле.
    const spine: Pt[] = base.map(([x, y, r], i) => {
      const w = i / (n - 1);
      const hump = Math.sin(w * Math.PI);
      return [x + calm * w * 0.8 * p.wave(1, 0.15), y - calm * hump * p.bob(1, 2, 0.1 - w * 0.3), r * (1 + 0.1 * hurt * hump)];
    });
    const chew = hurt > 0.3 ? 1.2 : calm * (p.wave(4) > 0.3 ? 0.7 : 0) + 1.8 * strike + 0.9 * wind;

    p.pose({ dx: -3 * strike + 2 * wind + 3 * hurt, px: 60, py: G }, () => {
      p.shadow(44, 30, 2.6);
      // Грудные ножки — три пары крючков под передом: дальние темнее.
      const legs = (tone: number, part: string, off: number): void => {
        for (const f of [0.66, 0.76, 0.86]) {
          const { x, y, r } = along(spine, f);
          const kick = calm * 1.2 * p.wave(2, f * 2);
          const by = y + r * 0.7;
          p.chain([[x + off, by, 1.5], [x + off - 1.5 + kick, Math.min(G - 2, by + 3), 1.1], [x + off - 3 + kick, Math.min(G - 0.5, by + 5), 0.8]], M.head, { part, tone });
        }
      };
      legs(-0.25, 'farLegs', 2);
      // Тело: гладкий хребет и кольца сегментов валиками поверх — силуэт личинки бугристый.
      p.chain(spine, M.skin, { part: 'body' });
      const S = 9;
      for (let k = 0; k < S; k++) {
        const { x, y, r, tx, ty } = along(spine, (k + 0.5) / S);
        p.ellipse(x, y, 3.4, r * 1.06, M.skin, { part: 'body', rot: Math.atan2(ty, tx), lift: 0.5 });
      }
      // Сквозь тонкую кожу заднего конца просвечивает лиловое нутро — улей осквернён.
      for (const f of [0.14, 0.26]) {
        const { x, y, r } = along(spine, f);
        p.ellipse(x, y + r * 0.1, r * 0.5, r * 0.42, M.gut, { part: 'body', paint: true });
      }
      // Складки между сегментами и дыхальца по боку.
      for (let k = 1; k < S; k++) {
        const { x, y, r, tx, ty } = along(spine, k / S);
        const nx = -ty, ny = tx;
        p.line(x + nx * r * 0.95, y + ny * r * 0.95, x - nx * r * 0.6, y - ny * r * 0.6, '#8a6a4890');
        if (k > 1 && k < S - 1) p.px(x + tx * 1.6 + nx * r * 0.2, y + ty * 1.6 + ny * r * 0.2, '#6a4c36');
      }
      legs(0, 'legs', 0);

      // Голова: бурая хитиновая капсула на конце тела, жвалы к герою и тёмные бусины глаз.
      const [hx, hy] = spine[n - 1];
      const [ax, ay] = spine[n - 2];
      const ang = Math.atan2(hy - ay, hx - ax);
      const rest = Math.atan2(LARVA_REST[n - 1][1] - LARVA_REST[n - 2][1], LARVA_REST[n - 1][0] - LARVA_REST[n - 2][0]);
      p.pose({ rot: (ang - rest) * 0.8 - 0.3 * hurt, px: hx, py: hy }, () => {
        const x = hx - 3, y = hy - 1;
        // Жвалы: верхняя и нижняя, раскрываются в грызне.
        p.limb(x - 4, y + 2, 1.9, x - 9.5 - chew * 0.5, y + 1 - chew * 1.2, 1.1, M.jaw, { part: 'jaw' });
        p.limb(x - 4, y + 4, 1.7, x - 9 - chew * 0.3, y + 5.5 + chew * 1.2, 1, M.jaw, { part: 'jaw', tone: -0.1 });
        p.ellipse(x, y, 7, 6.4, M.head, { part: 'head' });
        p.ellipse(x - 4, y + 2, 3, 2.4, M.head, { part: 'head', lift: 1 });
        const shut = hurt > 0.4 ? 1 : p.blink(0.7, 0.05);
        p.eye(x - 2.5, y - 2.5, 1.3, '#3a1e48', { closed: shut, glint: '#d8b8f0', lid: '#4a3020' });
      });
    });
  },
};

// ─── Кладка ─────────────────────────────────────────────────────────────────

const EGGS = {
  shell: { base: '#a898bc', shine: 0.55, tex: { kind: 'noise', scale: 2.5, amp: 0.08 } } as Mat,
  embryo: { base: '#4a2c62', tex: { kind: 'noise', scale: 2, amp: 0.12 } } as Mat,
  resin: { base: '#7a5a2e', shine: 0.7, tex: { kind: 'noise', scale: 3, amp: 0.1 } } as Mat,
};

/** Яйца кладки: [x, y, rx, ry, наклон, тон, зародыш виден, фаза пульса]. */
type Egg = [number, number, number, number, number, number, boolean, number];
const EGG_LIST: Egg[] = [
  // Задний ряд.
  [21, 35, 7, 9, -0.25, -0.16, false, 0.1], [35, 32, 7.5, 9.5, 0.05, -0.14, true, 0.6], [49, 34, 7, 9, 0.3, -0.16, false, 0.35],
  // Верх кучи.
  [29, 21, 6.5, 8.5, -0.2, -0.06, true, 0.8], [42, 20, 6.5, 8.5, 0.22, -0.06, false, 0.25], [36, 11.5, 5.5, 7, 0.05, 0, true, 0.5],
  // Передний ряд.
  [13, 42, 6.5, 7.8, -0.45, 0, true, 0.9], [26, 42, 7, 8, -0.1, 0.02, false, 0.45], [40, 42, 7, 8, 0.15, 0.02, true, 0.15], [54, 42, 6.5, 7.8, 0.45, 0, false, 0.7],
];
/** Иглы щетины из щелей между яйцами: [x, y, угол]. */
const BRISTLES: Array<[number, number, number]> = [
  [8, 34, -2.6], [15, 26, -2.2], [21, 18, -2], [30, 11, -2.2], [42, 10, -1], [50, 17, -1.05], [56, 25, -0.8], [61, 34, -0.5], [5, 44, -2.95], [65, 44, -0.2],
];

export const eggCluster: Model = {
  id: 'egg_cluster',
  w: 72,
  h: 52,
  ground: 50,
  pad: 26,
  draw(p: Painter) {
    const M = EGGS;
    const G = 50;
    // Кладка не нападает; клип удара — «щетина»: сжаться и выбросить иглы к герою (в игре его играют только приёмы с атакой).
    // Урон: кладку сплющило и качнуло, зародыши сжались, во все стороны брызги смолы.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const calm = 1 - Math.max(wind, strike, hurt);
    // Яйца дышат по очереди; раз за цикл зародыш в верхнем яйце вздрагивает, с основания тянется капля смолы.
    const kick = p.clip === 'idle' ? p.blink(0.4, 0.08) : 0;
    const drip = p.clip === 'idle' && p.t > 0.6 && p.t < 0.92 ? (p.t - 0.6) / 0.32 : -1;
    const squash = 1 - 0.14 * hurt - 0.06 * wind + 0.08 * strike;

    p.pose({ dx: -4 * strike + 2 * wind + 3 * hurt, rot: -0.05 * strike + 0.03 * wind + 0.05 * hurt, px: 36, py: G }, () => {
      p.shadow(36, 32, 3);
      // Смола-основа: липкий натёк, в котором сидят яйца.
      p.ellipse(35, 46.5, 29, 5, M.resin, { part: 'resin', flat: 0.4 });
      p.ellipse(35, 40, 18, 6, M.resin, { part: 'resin', tone: -0.1 });
      // Иглы щетины — светлые, из щелей между яйцами; в «щетине» вытягиваются вдвое.
      const long = 1 + 1.4 * strike + 0.5 * hurt - 0.4 * wind;
      for (const [x, y, a] of BRISTLES) {
        const len = (5 + (x % 3)) * long;
        const w0 = calm * 0.25 * p.wave(1, x / 40);
        p.line(x, y, x + Math.cos(a + w0) * len, y + Math.sin(a + w0) * len, '#d8c8b0');
      }
      EGG_LIST.forEach(([x, y, rx, ry, rot, tone, embryo, ph], i) => {
        const beat = 1 + 0.05 * p.wave(2, ph) * calm;
        const sy = beat * squash, sx = beat * (2 - squash) * 0.5 + 0.5;
        const cy = G - (G - y) * squash;
        p.ellipse(x, cy, rx * sx, ry * sy, M.shell, { part: `egg${i}`, rot, tone });
        if (embryo) {
          // Зародыш: свёрнутая запятая тени внутри скорлупы; вздрагивает и сжимается от удара.
          const jx = i === 5 ? kick * 1.5 : 0;
          const e = 1 - 0.3 * hurt;
          p.ellipse(x + 0.5 + jx, cy + 1, rx * 0.5 * e, ry * 0.45 * e, M.embryo, { part: `egg${i}`, paint: true, rot: rot + 0.6 });
          p.ellipse(x - 1.5 + jx, cy - 2, rx * 0.3 * e, ry * 0.28 * e, M.embryo, { part: `egg${i}`, paint: true });
          if (hurt < 0.4 && !p.blink(0.15 + ph * 0.7, 0.04)) p.px(x - 2 + jx, cy - 2, '#c8a0e8');
        }
      });
      // Лиловые жилки оплетают кладку.
      for (const [x1, y1, x2, y2] of [[16, 38, 24, 30], [24, 30, 31, 25], [44, 14, 48, 26], [48, 26, 56, 37], [33, 14, 38, 5], [30, 44, 36, 36]]) p.line(x1, G - (G - y1) * squash, x2, G - (G - y2) * squash, '#5a2a6aa0');
      if (drip >= 0) p.disc(58, 44 + drip * 5, 0.9, '#9a7236');
      if (hurt > 0.3) {
        for (const [ox, oy] of [[-18, -20], [16, -24], [24, -10], [-24, -8], [4, -32]]) p.px(36 + ox * (0.6 + hurt), 30 + oy * (0.5 + hurt * 0.6), '#b08a48');
      }
    });
  },
};

// ─── Оса-страж ──────────────────────────────────────────────────────────────

const WASP = {
  gold: { base: '#c8931e', shine: 0.45, tex: { kind: 'noise', scale: 2, amp: 0.08 } } as Mat,
  black: { base: '#2c201c', shine: 0.5, dither: 0 } as Mat,
  eye: { base: '#c8302a', shine: 0.8, dither: 0, tex: { kind: 'spots', scale: 1.4, amp: 0.25, density: 0.5 } } as Mat,
  sting: { base: '#1e1614', shine: 0.6, dither: 0 } as Mat,
};

/** Брюшко осы от стебелька к кончику: в покое отведено назад и подогнуто, в замахе взведено вверх, в ударе — жалом к герою под грудью. */
const WASP_REST: Pt[] = [[43, 31, 4], [51, 34, 8.5], [59, 38.5, 9], [64, 44.5, 6.8], [64, 50, 3.4]];
const WASP_WIND: Array<[number, number]> = [[43, 31], [52, 30], [60, 30], [66, 33], [69, 38]];
const WASP_HIT: Array<[number, number]> = [[43, 31], [46, 39], [42, 46], [34, 50], [26, 51]];
const WASP_HURT: Array<[number, number]> = [[43, 31], [51, 31], [59, 33], [65, 37], [68, 42]];

/** Нога насекомого линией в пиксель: бедро, голень, лапка. На мелкой фигуре контур превратил бы шесть ног в кашу. */
function leg(p: Painter, pts: Array<[number, number]>, color: string, under = false): void {
  for (let k = 0; k + 1 < pts.length; k++) p.line(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], color, under);
}

export const wasp: Model = {
  id: 'wasp',
  w: 78,
  h: 64,
  ground: 62,
  flies: true,
  // Пикирование: в кадре контакта жало — на 30 единиц левее рамки.
  pad: 38,
  draw(p: Painter) {
    const M = WASP;
    // Жало: замах — взмыть и взвести брюшко; выпад — нырок к герою, брюшко под грудью, жало вперёд.
    // Урон: отбросило назад и вверх, крылья вскинуты, ноги растопырены.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const tick = p.clip === 'idle' ? Math.round(p.t * p.frames) : Math.round(p.u * 12);
    const up = tick % 2 === 0;
    const hover = -p.bob(2, 2);
    const pump = p.wave(3, 0.2) * (1 - strike);

    p.pose({ dx: -14 * strike + 3 * wind + 6 * hurt, dy: hover - 5 * wind + 6 * strike - 4 * hurt, rot: -0.1 * strike + 0.06 * wind + 0.22 * hurt, px: 32, py: 28 }, () => {
      p.shadow(38, 18, 2, 0.2);
      const abd = spineAt(WASP_REST, WASP_WIND, WASP_HIT, WASP_HURT, wind, strike, hurt).map(([x, y, r], i): Pt => [x + (i > 1 ? pump * 0.6 * (i - 1) : 0), y - (i > 1 ? pump * 0.4 * (i - 1) : 0), r]);
      // Крылья: ближнее раньше дальнего — плёнки не складываются в непрозрачное пятно.
      const wa = hurt > 0.2 ? -1.35 : up ? -1 : -0.3;
      wing(p, 33, 18, 32, 6.5, wa + 0.1, '#fff6e088', '#fff4dc80', false);
      wing(p, 35, 19, 22, 5, wa + 0.45, '#fff6e070', '#fff4dc60', false);
      wing(p, 31, 17, 30, 6, wa - 0.22, '#f0e8d060', '#e8dcc060', true);
      // Дальние ноги — тёмные линии за телом.
      const splay = 4 * hurt - 2 * strike;
      const legs = (color: string, off: number, under: boolean): void => {
        leg(p, [[25 + off, 32], [19 + off - splay, 39], [17 + off - splay, 46 + splay * 0.5], [14 + off - splay, 48]], color, under);
        leg(p, [[31 + off, 33], [30 + off, 41], [30 + off + splay * 0.3, 48], [28 + off, 50]], color, under);
        leg(p, [[36 + off, 33], [42 + off + splay, 40], [44 + off + splay, 48], [47 + off + splay, 50]], color, under);
      };
      legs('#5a4418', 3, true);
      // Брюшко: золото с чёрными поясами; стебелёк тонкий, чёрный.
      p.chain(abd, M.gold, { part: 'abd' });
      for (const f of [0.3, 0.52, 0.72, 0.9]) band(p, abd, f, 1.7, M.black, 'abd');
      p.limb(abd[0][0] + 1, abd[0][1], 2.4, abd[0][0] - 3, abd[0][1] - 1.5, 2.2, M.black, { part: 'waist' });
      // Жало с кончика брюшка — по ходу хребта.
      const { x: sx, y: sy, tx, ty } = along(abd, 1);
      p.limb(sx, sy, 1.3, sx + tx * 7, sy + ty * 7, 0.5, M.sting, { part: 'sting' });
      // Грудь: золото, чёрная спинка с жёлтыми пятнами.
      p.ellipse(31, 26, 11, 9.5, M.gold, { part: 'thorax' });
      p.ellipse(33, 20.5, 9, 4.5, M.black, { part: 'thorax', paint: true, rot: 0.1 });
      p.ellipse(33, 33, 7, 2.5, M.black, { part: 'thorax', paint: true });
      p.block(29, 20, 1, 1, '#e0b038');
      p.block(36, 21, 1, 1, '#e0b038');
      legs('#b08a2a', 0, false);
      // Голова: крупный красный фасеточный глаз, жёлтое «лицо», чёрные жвалы, усики коленом вперёд.
      p.pose({ rot: -0.1 * strike + 0.06 * wind + 0.2 * hurt, px: 22, py: 26 }, () => {
        const open = 1.5 * strike + 1.5 * hurt;
        p.limb(9, 30, 2, 5 - open * 0.5, 33 + open * 0.3, 1.2, M.black, { part: 'jaw' });
        p.limb(10, 32, 1.8, 7 - open * 0.3, 36 + open, 1.1, M.black, { part: 'jaw', tone: -0.1 });
        p.ellipse(15, 26, 8, 8.5, M.gold, { part: 'head' });
        p.ellipse(11, 30.5, 4.5, 3, M.gold, { part: 'head', lift: 1 });
        p.ellipse(17, 23.5, 4.6, 6.8, M.eye, { part: 'eye', rot: 0.25, lift: 1 });
        if (hurt < 0.4) {
          p.px(15, 20, '#ffd8c8');
          p.px(16, 20, '#ffb0a0');
        }
        const tw = p.wave(2, 0.3) + p.blink(0.62, 0.06) * 2;
        for (const [ox, oy] of [[0, 0], [3, 1]]) {
          p.line(12 + ox, 18 + oy, 9 + ox, 10 + oy + tw * 0.3, '#2c201c');
          p.line(9 + ox, 10 + oy + tw * 0.3, 2 + ox - hurt * 2, 6 + oy + tw - hurt * 3, '#2c201c');
        }
      });
    });
  },
};

// ─── Трутень ────────────────────────────────────────────────────────────────

const DRONE = {
  fur: { base: '#a8782a', shag: 0.28, tex: { kind: 'fur', scale: 1.6, amp: 0.22, stretch: 1.4, angle: 1.3 } } as Mat,
  band: { base: '#3a2616', shag: 0.2, tex: { kind: 'fur', scale: 1.6, amp: 0.2, stretch: 1.4, angle: 1.3 } } as Mat,
  eye: { base: '#a8c238', shine: 0.7, dither: 0, tex: { kind: 'spots', scale: 1.6, amp: 0.3, density: 0.55 } } as Mat,
  chitin: { base: '#3e2e20', shine: 0.5, dither: 0 } as Mat,
};

const droneBase: Model = {
  id: 'drone',
  w: 82,
  h: 62,
  ground: 60,
  flies: true,
  // Бросок: жвалы в кадре контакта — на 24 единицы левее рамки.
  pad: 30,
  draw(p: Painter) {
    const M = DRONE;
    // Жвалы: замах — осадить назад и вверх; бросок — навалиться на героя, жвалы настежь, с них капает кислота.
    // Урон: отбросило назад и вверх, жвалы разжаты, глаза тускнеют.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const tick = p.clip === 'idle' ? Math.round(p.t * p.frames) : Math.round(p.u * 12);
    const up = tick % 2 === 0;
    const hover = -p.bob(1.5, 2, 0.3);
    const breath = p.wave(3);
    const open = 1.5 * strike + 1 * wind + 1.2 * hurt + (p.clip === 'idle' ? 0.5 * (p.wave(2, 0.1) + 1) / 2 : 0);
    // Раз за цикл с жвал срывается капля кислоты.
    const drip = p.clip === 'idle' && p.t > 0.45 && p.t < 0.75 ? (p.t - 0.45) / 0.3 : -1;

    p.pose({ dx: -12 * strike + 3 * wind + 6 * hurt, dy: hover - 4 * wind + 4 * strike - 3 * hurt, rot: -0.08 * strike + 0.08 * wind + 0.18 * hurt, px: 40, py: 32 }, () => {
      p.shadow(40, 22, 2.5, 0.26);
      const wa = hurt > 0.2 ? -1.25 : up ? -0.95 : -0.3;
      wing(p, 42, 15, 30, 8, wa + 0.12, '#fff6e088', '#fff4dc80', false);
      wing(p, 40, 14, 28, 7.5, wa - 0.22, '#f0e8d060', '#e8dcc060', true);
      // Ноги свисают из-под груди, мохнатые голени у задних.
      const swing = 1.5 * p.wave(1, 0.2) * (1 - strike);
      const legs = (color: string, off: number, under: boolean): void => {
        leg(p, [[30 + off, 40], [25 + off + swing, 46], [22 + off + swing, 52], [19 + off + swing, 53]], color, under);
        leg(p, [[37 + off, 42], [37 + off, 49], [37 + off + swing, 54], [35 + off + swing, 55]], color, under);
        leg(p, [[45 + off, 42], [50 + off, 48], [51 + off - swing, 54], [54 + off - swing, 55]], color, under);
        p.line(50 + off, 48, 51 + off - swing, 53, color, under);
      };
      legs('#2a1e14', 3, true);
      // Брюшко: мохнатое, в тёмных поясах, свисает за грудью и дышит.
      p.ellipse(58, 36, 15.5, 13 + 0.6 * breath, M.fur, { part: 'abd', rot: 0.35 });
      for (const [x, y] of [[53, 32], [60.5, 36], [67.5, 40.5]]) p.ellipse(x, y, 2.6, 13, M.band, { part: 'abd', paint: true, rot: 0.4 });
      // Грудь — самый большой шар: светлый воротник, тёмный пояс посередине.
      p.ellipse(37, 28, 15, 14 + 0.4 * breath, M.fur, { part: 'thorax' });
      p.ellipse(41, 29, 4.5, 14, M.band, { part: 'thorax', paint: true, rot: -0.15 });
      legs('#4a3624', 0, false);
      // Голова: огромные кислотные глаза смыкаются на макушке, короткие усики, тёмные жвалы.
      p.pose({ rot: -0.1 * strike + 0.06 * wind + 0.22 * hurt, px: 26, py: 30 }, () => {
        p.limb(12, 37, 2.4, 7 - open, 39 - open * 1.5, 1.4, M.chitin, { part: 'jaw' });
        p.limb(13, 39, 2.2, 8 - open * 0.5, 43 + open * 1.2, 1.3, M.chitin, { part: 'jaw', tone: -0.1 });
        p.ellipse(19, 31, 10, 10, M.fur, { part: 'head' });
        p.ellipse(14.5, 35.5, 5, 4, M.chitin, { part: 'face', lift: 1 });
        p.ellipse(20, 25.5, 7, 8.5, M.eye, { part: 'eye', rot: 0.3, lift: 1.5 });
        p.glow(20, 25.5, 13, '#d8f060', 0.14 * (1 - hurt));
        if (hurt < 0.4) {
          p.px(16, 21, '#f4ffd0');
          p.px(18, 20, '#f4ffd0');
        }
        const tw = p.wave(2, 0.6) * 0.8 + p.blink(0.3, 0.06) * 1.5;
        p.line(15, 19, 12, 13 + tw, '#2e2218');
        p.line(12, 13 + tw, 6, 11 + tw, '#2e2218');
        if (strike > 0.3 || wind > 0.5) p.disc(7 - open, 43, 1.2, '#b8e040');
        if (drip >= 0) p.disc(8, 41 + drip * 17, 0.9, '#b8e040');
      });
    });
  },
};

/** Трутень крупнее своей лепки: рост по таблице. */
export const drone = scaleModel(droneBase, 1);

// ─── Споровик ───────────────────────────────────────────────────────────────

const SPORE = {
  cap: { base: '#7e4e94', shine: 0.25, tex: { kind: 'noise', scale: 3, amp: 0.1 } } as Mat,
  gills: { base: '#4a2a58', tex: { kind: 'stripes', scale: 1.4, amp: 0.3, angle: 1.57 } } as Mat,
  stalk: { base: '#b4a092', tex: { kind: 'stripes', scale: 2.2, amp: 0.08, angle: 1.57 } } as Mat,
  foot: { base: '#8a7688', tex: { kind: 'noise', scale: 2, amp: 0.12 } } as Mat,
  spot: { base: '#d8f098', glow: true, dither: 0, ramp: ['#8aa860', '#a8c878', '#c4e090', '#dcf2a8', '#f0ffc8'] } as Mat,
};

/** Светящиеся пятна на шляпке: [x, y, r, фаза]. */
const SPORE_SPOTS: Array<[number, number, number, number]> = [[20, 18, 2.6, 0], [31, 11, 3.2, 0.3], [44, 13, 2.6, 0.55], [54, 20, 2.2, 0.8], [36, 21, 2, 0.15], [25, 25, 1.6, 0.65], [47, 24, 1.8, 0.4]];
/** Споры, что поднимаются от шляпки: [x, фаза, снос]. */
const SPORES: Array<[number, number, number]> = [[16, 0, 2], [28, 0.35, -2], [40, 0.7, 3], [52, 0.2, -1], [60, 0.55, 2]];

export const sporeling: Model = {
  id: 'sporeling',
  w: 72,
  h: 68,
  ground: 66,
  // Лопнуть: облако спор в кадре контакта — на 34 единицы левее рамки.
  pad: 42,
  draw(p: Painter) {
    const M = SPORE;
    const G = 66;
    // Лопнуть: замах — шляпка раздувается, ножка приседает; выпад — рывок к герою, облако спор из-под шляпки.
    // Урон: шляпку сплющило, глаза зажмурены, споры разлетаются во все стороны.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const calm = 1 - Math.max(wind, strike, hurt);
    const breath = p.bob(1, 2);
    const puff = 1 + 0.1 * wind - 0.06 * strike;
    const flat = 1 - 0.18 * hurt + 0.12 * wind;
    const capY = 18 + breath + 3 * hurt - 2 * wind;

    p.pose({ dx: -7 * strike + 2 * wind + 4 * hurt, rot: -0.1 * strike + 0.06 * wind + 0.06 * hurt, px: 34, py: G }, () => {
      p.shadow(34, 20, 3);
      // Нога-луковица с корешками по полу.
      p.ellipse(35, G - 6, 15, 7, M.foot, { part: 'foot' });
      for (const [x, l] of [[22, -6], [28, -4], [44, 4], [50, 6]]) p.limb(x, G - 3, 2, x + l, G - 0.5, 1, M.foot, { part: 'roots' });
      // Ножка-тело: светлая, в волокнах, с тёмной юбкой-кольцом под шляпкой.
      p.ellipse(34, 47 + breath * 0.5, 12, 15 * (1 - 0.1 * wind), M.stalk, { part: 'stalk' });
      p.limb(34, 38, 10, 34, 58, 11, M.stalk, { part: 'stalk' });
      // Ручки-гифы по бокам ножки.
      const sway = p.wave(1, 0.2) * calm;
      p.chain([[25, 44, 2.4], [18 + sway, 49 - 3 * strike, 1.8], [15 + sway - 6 * strike, 54 - 6 * strike, 1.2]], M.stalk, { part: 'arm' });
      p.chain([[44, 45, 2.2], [50 - sway, 51, 1.6], [53 - sway, 56, 1]], M.stalk, { part: 'arm', tone: -0.15 });
      // Лицо на ножке: светящиеся глаза и рот.
      const shut = hurt > 0.4 ? 1 : p.blink(0.35, 0.05);
      p.eye(26, 38 + breath, 1.8, '#e0ffa0', { closed: shut, glint: '#ffffff', lid: '#4a3a40' });
      p.eye(33, 38.5 + breath, 1.6, '#e0ffa0', { closed: shut, lid: '#4a3a40' });
      const mo = 1 + 2 * strike + 2 * hurt;
      p.block(27, 44 + breath, 3, Math.max(1, Math.round(mo)), '#3a2230');
      // Шляпка: пластинки снизу, купол сверху, пятна светятся.
      p.pose({ px: 34, py: capY + 8, rot: 0.05 * sway }, () => {
        p.ellipse(34, capY, 28 * puff, 14 * puff * flat, M.cap, { part: 'cap' });
        p.ellipse(34, capY + 10 * flat, 26 * puff, 5 * flat, M.gills, { part: 'gills' });
        for (const [x, y, r, ph] of SPORE_SPOTS) {
          const cx = 34 + (x - 34) * puff, cy = capY + (y - 24) * puff * flat;
          p.ellipse(cx, cy, r * puff, r * 0.8 * puff, M.spot, { part: 'cap', paint: true });
          p.glow(cx, cy, r * 3, '#e0ffa0', 0.1 + 0.1 * ((p.wave(1, ph) + 1) / 2) + 0.2 * wind);
        }
      });
      // Споры: в покое поднимаются от шляпки и тают; в выпаде — облако к герою; в уроне — во все стороны.
      if (p.clip === 'idle') {
        for (const [x, ph, drift] of SPORES) {
          const f = (p.t + ph) % 1;
          p.px(x + drift * f + sway, capY - 4 - f * 18, f < 0.7 ? '#e0ffa0' : '#e0ffa080');
        }
      }
      if (strike > 0.2 || hurt > 0.2) {
        const k = Math.max(strike, hurt);
        const cloud = strike >= hurt;
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2 + i * 0.7;
          const r = (4 + (i % 4) * 3) * k;
          const ox = cloud ? -2 - 12 * k + Math.cos(a) * r : 34 + Math.cos(a) * r * 2.2;
          const oy = cloud ? 34 + Math.sin(a) * r * 0.7 : capY + Math.sin(a) * r * 1.4;
          p.px(ox, oy, i % 3 ? '#e0ffa0' : '#c8f080');
        }
        if (cloud) p.glow(-2 - 12 * k, 34, 12 * k, '#e0ffa0', 0.25);
      }
    });
  },
};

// ─── Хитиновый жук ──────────────────────────────────────────────────────────

const BEETLE = {
  shell: { base: '#553478', shine: 0.7, tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  horn: { base: '#5c3a7e', shine: 0.8, dither: 0 } as Mat,
  under: { base: '#34204a', shine: 0.4, tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  leg: { base: '#3a2452', shine: 0.5 } as Mat,
  wing: { base: '#8a6a60', tex: { kind: 'stripes', scale: 1.6, amp: 0.18, angle: 0.3 } } as Mat,
};

/** Нога жука: корень, колено, голень со шпорой, лапка: [x, y] по суставам. */
type BugLeg = Array<[number, number]>;
const BEETLE_NEAR: BugLeg[] = [
  [[36, 70], [24, 72], [16, 82], [10, 90]],
  [[52, 74], [50, 80], [44, 86], [40, 90]],
  [[72, 74], [86, 78], [94, 85], [100, 90]],
];

export const beetle: Model = {
  id: 'beetle',
  w: 108,
  h: 92,
  ground: 90,
  // Таран: рог в кадре контакта — на 22 единицы левее рамки.
  pad: 30,
  draw(p: Painter) {
    const M = BEETLE;
    const G = 90;
    // Таран и Рог: замах — осесть назад, рог опущен; выпад — рывок к герою, рог поддевает вверх.
    // Урон: отбросило назад, рог вскинут, лапы поджаты.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const breath = p.bob(1, 2);
    // Раз за цикл надкрылья приоткрываются — из-под них видно перепончатое крыло.
    const lift = p.clip === 'idle' ? p.blink(0.55, 0.12) : 0;

    p.pose({ dx: -14 * strike + 4 * wind + 5 * hurt, rot: 0.04 * wind - 0.03 * strike + 0.05 * hurt, px: 90, py: G }, () => {
      p.shadow(58, 44, 3.5);
      const legRow = (legs: BugLeg[], part: string, tone: number, off: number): void => {
        legs.forEach((pts, i) => {
          // Лапы переступают: одна за цикл приподнимается на пару пикселей.
          const step = part === 'near' ? 2 * p.blink(0.1 + i * 0.3, 0.08) : 0;
          const tuck = hurt * 4;
          const q = pts.map(([x, y], k) => [x + off + (k > 1 ? (i === 2 ? -tuck : tuck) : 0), y - (k > 1 ? step : 0) - (k === 3 ? 0 : 0)] as [number, number]);
          const r = [3.4, 2.8, 2.2, 1.2];
          for (let k = 0; k + 1 < q.length; k++) p.limb(q[k][0], q[k][1], r[k], q[k + 1][0], q[k + 1][1], r[k + 1], M.leg, { part: `${part}${i}`, tone });
          // Шпора на голени.
          const [kx, ky] = q[2];
          p.limb(kx, ky, 1, kx + (i === 2 ? -3 : 3), ky - 1, 0.5, M.leg, { part: `${part}${i}`, tone });
        });
      };
      legRow(BEETLE_NEAR, 'far', -0.22, 5);
      // Брюшко снизу и надкрылья куполом.
      p.ellipse(66, 68, 26, 9, M.under, { part: 'belly' });
      if (lift > 0) p.poly([66, 40, 104, 50, 108, 66, 86, 60], M.wing, { part: 'wing', flat: 0.8, bevel: 2 });
      p.pose({ rot: -0.06 * lift, px: 46, py: 50 }, () => {
        p.ellipse(70, 54 - breath * 0.5, 31, 23 + breath * 0.5, M.shell, { part: 'elytra' });
        // Шов надкрылий и продольные бороздки блеска.
        p.line(46, 36, 98, 52, '#7a5aa0');
        p.line(56, 46, 94, 60, '#3a2250a0');
      });
      // Переднеспинка щитом, малый рог на ней.
      p.ellipse(42, 54, 15, 16, M.shell, { part: 'pronotum' });
      p.chain([[40, 41, 4], [33, 33, 2.8], [28, 28, 1.4]], M.horn, { part: 'pronotum' });
      // Голова с большим рогом: в замахе опущена, в выпаде поддевает вверх.
      p.pose({ rot: -0.3 * wind + 0.32 * strike + 0.25 * hurt, px: 32, py: 62 }, () => {
        p.chain([[26, 60, 5], [18, 49, 4.2], [13, 36, 3.4], [12, 23, 2.6], [14, 12, 1.8], [18, 5, 1]], M.horn, { part: 'horn' });
        p.ellipse(27, 64, 9, 8, M.shell, { part: 'head' });
        p.line(20, 67, 14, 70, '#2a1a38');
        p.line(14, 70, 12, 68, '#2a1a38');
        const shut = hurt > 0.4 ? 1 : p.blink(0.8, 0.04);
        p.eye(23, 62, 1.8, '#ff9f1c', { closed: shut, glint: '#ffe0b0', lid: '#2a1a38' });
      });
      legRow(BEETLE_NEAR, 'near', 0, 0);
    });
  },
};

// ─── Хитиновый колосс ───────────────────────────────────────────────────────

/** Колосс — в тоне Хитинового жука, но темнее и глуше: элита не должна быть ярче рядовых (docs/lepka.md, ловушки). */
const COLOSSUS = {
  shell: { base: '#4a2f60', shine: 0.6, tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  plate: { base: '#56386c', shine: 0.7, tex: { kind: 'noise', scale: 3, amp: 0.06 } } as Mat,
  under: { base: '#2e1e3c', shine: 0.3, tex: { kind: 'noise', scale: 2.5, amp: 0.1 } } as Mat,
  leg: { base: '#3c2852', shine: 0.5, tex: { kind: 'noise', scale: 2, amp: 0.06 } } as Mat,
  claw: { base: '#523468', shine: 0.8, tex: { kind: 'noise', scale: 3, amp: 0.05 } } as Mat,
  tip: { base: '#a89478', shine: 0.6, dither: 0 } as Mat,
  jaw: { base: '#241828', shine: 0.5, dither: 0 } as Mat,
};

/**
 * Клешня колосса по ходу удара: направления плеча и предплечья, градусы (90 — вниз, 180 — к герою, 270 — вверх).
 * В покое клешня поднята перед мордой; замах — над головой; контакт — вытянута к герою во всю длину и смыкается.
 */
const CLAW_UPPER: Keys = [[0, 135], [0.14, 225], [0.3, 244], [0.43, 212], [0.57, 181], [0.72, 165], [0.86, 145], [1, 135]];
const CLAW_FORE: Keys = [[0, 250], [0.14, 292], [0.3, 304], [0.43, 240], [0.57, 186], [0.72, 205], [0.86, 235], [1, 250]];

/** Нога колосса: корень, колено, голень, коготь — с шипом на колене. */
const COLOSSUS_LEGS: BugLeg[] = [
  [[62, 104], [44, 122], [40, 146], [36, 170]],
  [[100, 112], [122, 128], [128, 150], [132, 170]],
];

/**
 * Клешня: плечо и предплечье из плеча (sx, sy) под углами a1, a2 (радианы), ладонь и два пальца; `open` 0..1 — раскрыта.
 * `k` — размер: ближняя клешня колосса огромная, как у краба-скрипача, дальняя — обычная.
 */
function claw(p: Painter, sx: number, sy: number, a1: number, a2: number, open: number, part: string, tone: number, k: number): void {
  p.scope(k, sx * (1 - k), sy * (1 - k), () => clawShape(p, sx, sy, a1, a2, open, part, tone));
}

function clawShape(p: Painter, sx: number, sy: number, a1: number, a2: number, open: number, part: string, tone: number): void {
  const M = COLOSSUS;
  const ex = sx + 28 * Math.cos(a1), ey = sy + 28 * Math.sin(a1);
  const hx = ex + 24 * Math.cos(a2), hy = ey + 24 * Math.sin(a2);
  p.limb(sx, sy, 8, ex, ey, 6.5, M.claw, { part: `${part}Arm`, tone });
  p.limb(ex, ey, 6.5, hx, hy, 6.5, M.claw, { part: `${part}Fore`, tone });
  p.disc(ex, ey, 1.2, '#7a5a94');
  const dx = Math.cos(a2), dy = Math.sin(a2);
  // Нормаль к ходу предплечья: у клешни, поднятой к герою, — «вниз», к неподвижному пальцу.
  const nx = -dy, ny = dx;
  const px = hx + dx * 10, py = hy + dy * 10;
  p.ellipse(px, py, 15, 10.5, M.claw, { part: `${part}Palm`, tone, rot: a2 });
  p.ellipse(px - nx * 3, py - ny * 3, 9, 4, M.plate, { part: `${part}Palm`, tone, rot: a2, paint: true });
  // Неподвижный палец — продолжение ладони, чуть загнут внутрь; подвижный — на шарнире сверху, раскрывается.
  const fx = px + dx * 12, fy = py + dy * 12;
  const f1: Pt[] = [[fx + nx * 3.5, fy + ny * 3.5, 5.5], [fx + dx * 11 + nx * 3.5, fy + dy * 11 + ny * 3.5, 4], [fx + dx * 21 + nx * 0.5, fy + dy * 21 + ny * 0.5, 1.4]];
  p.chain(f1, M.claw, { part: `${part}Finger`, tone });
  p.limb(f1[1][0], f1[1][1], 2.6, f1[2][0], f1[2][1], 1.2, M.tip, { part: `${part}Finger`, tone });
  for (const f of [0.35, 0.6]) p.px(fx + dx * 21 * f - nx * 0.5, fy + dy * 21 * f - ny * 0.5, '#c8b498');
  const b = a2 - 0.12 - 0.75 * open;
  const bx = Math.cos(b), by = Math.sin(b);
  const gx = fx - nx * 4.5, gy = fy - ny * 4.5;
  const f2: Pt[] = [[gx, gy, 4.8], [gx + bx * 10 - by * 2, gy + by * 10 + bx * 2, 3.6], [gx + bx * 19 - by * 4, gy + by * 19 + bx * 4, 1.2]];
  p.chain(f2, M.claw, { part: `${part}Dactyl`, tone });
  p.limb(f2[1][0], f2[1][1], 2.4, f2[2][0], f2[2][1], 1.1, M.tip, { part: `${part}Dactyl`, tone });
}

export const chitinColossus: Model = {
  id: 'chitin_colossus',
  w: 156,
  h: 174,
  ground: 170,
  // Клешня в кадре контакта вытянута к герою — палец на 70 единиц левее рамки.
  pad: 80,
  draw(p: Painter) {
    const M = COLOSSUS;
    const G = 170;
    const deg = Math.PI / 180;
    // Клешни: замах — ближняя клешня взлетает над головой, корпус откинут; удар — клешня обрушивается на героя и смыкается.
    // Урон: отбросило назад, клешни вскинуты для защиты, глаза зажмурены, жвалы разжаты.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const breath = p.bob(1.5, 2);
    // Клешни медленно щёлкают вразнобой, жвалы шевелятся, раз за цикл по гребню пробегает дрожь.
    // В клипах фаза покоя стоит на нуле, поэтому та же волна даёт позу первого кадра покоя — клип кончается в ней.
    const snip = (p.wave(1, 0.1) + 1) / 2;
    const chew = p.wave(3, 0.2) * 0.8;

    p.pose({ dx: -8 * strike + 3 * wind + 6 * hurt, rot: 0.04 * wind - 0.06 * strike + 0.05 * hurt, px: 130, py: G }, () => {
      p.shadow(84, 66, 4.5);
      const legRow = (part: string, tone: number, off: number): void => {
        COLOSSUS_LEGS.forEach((pts, i) => {
          const q = pts.map(([x, y], k) => [x + off + (k > 0 ? (i ? -2 : 2) * hurt : 0), k === 0 ? y + breath : y] as [number, number]);
          const r = [10, 8, 6, 3];
          for (let k = 0; k + 1 < q.length; k++) p.limb(q[k][0], q[k][1], r[k], q[k + 1][0], q[k + 1][1], r[k + 1], M.leg, { part: `${part}${i}`, tone });
          const [kx, ky] = q[1];
          p.poly([kx - 2, ky - 3, kx + (i ? 6 : -6), ky - 9, kx + 2, ky + 1], M.leg, { part: `${part}${i}`, tone, bevel: 1 });
          p.limb(q[3][0], q[3][1], 2.5, q[3][0] + (i ? 5 : -5), G, 1, M.tip, { part: `${part}Toe${i}`, tone });
        });
      };
      legRow('far', -0.22, 10);
      // Дальняя клешня поднята за корпусом — страж на изготовку.
      const far = p.attack(0.08);
      claw(p, 76, 80 + breath, (172 + 30 * far.wind - 6 * far.strike) * deg - 0.4 * hurt, (246 + 20 * far.wind - 20 * far.strike + 4 * p.wave(1, 0.5)) * deg - 0.5 * hurt, 0.3 + 0.3 * (1 - snip) + 0.4 * far.wind, 'far', -0.2, 0.9);

      // Брюшко плитами, горб груди, гребень шипов.
      p.ellipse(108, 86 + breath * 0.5, 38, 33, M.shell, { part: 'abd', rot: 0.15 });
      for (let k = 0; k < 4; k++) {
        const x = 90 + k * 13;
        p.ellipse(x, 70 + k * 3 + breath * 0.5, 7, 30 - k * 3, M.plate, { part: 'abd', paint: true, rot: 0.3 });
        p.line(x + 6, 56 + k * 4, x + 1, 108 - k * 2, '#26182f');
      }
      p.ellipse(88, 110, 34, 9, M.under, { part: 'abd', paint: true });
      p.ellipse(70, 66 + breath, 30, 38, M.shell, { part: 'thorax', rot: -0.1 });
      p.ellipse(62, 54 + breath, 20, 20, M.plate, { part: 'thorax', paint: true, rot: -0.3 });
      p.line(46, 72, 90, 50, '#2a1a36');
      const shiver = p.clip === 'idle' ? p.blink(0.7, 0.1) : 0;
      for (let k = 0; k < 8; k++) {
        const f = k / 7;
        const x = 50 + f * 92, y = (k < 4 ? 32 - 10 * Math.sin((f / 0.43) * Math.PI * 0.5) : 50 + (f - 0.43) * 40) + breath;
        const hgt = (k < 4 ? 12 : 10 - (k - 4) * 1.5) + (k % 2) * 2;
        const lean = 3 + 2 * shiver * (k % 2 ? 1 : -1);
        p.poly([x - 4, y + 5, x + lean, y - hgt, x + 5, y + 5], M.plate, { part: 'spines', bevel: 1.2, lift: 8 });
      }

      // Голова под шлемом: жвалы, гроздь золотых глаз из-под надбровного щитка.
      p.pose({ dx: -2 * strike + 2 * hurt, rot: 0.05 * wind - 0.06 * strike + 0.2 * hurt, px: 52, py: 78 }, () => {
        const open = 2 + 1.5 * chew * (1 - hurt) + 4 * hurt + 3 * strike;
        p.limb(32, 88, 3.5, 20, 96 + open * 0.3, 1.5, M.jaw, { part: 'jaw' });
        p.limb(36, 91, 3.2, 26, 100 + open, 1.4, M.jaw, { part: 'jaw', tone: -0.1 });
        p.ellipse(42, 80 + breath, 16, 14, M.shell, { part: 'head' });
        p.poly([24, 74 + breath, 38, 62 + breath, 56, 64 + breath, 54, 74 + breath, 32, 78 + breath], M.plate, { part: 'brow', bevel: 2.5 });
        const shut = hurt > 0.4 ? 1 : p.blink(0.3, 0.05);
        for (const [x, y, r] of [[30, 80, 2.2], [37, 78, 2], [33, 85, 1.5], [41, 83, 1.3]] as Array<[number, number, number]>) {
          p.eye(x, y + breath, r, '#ffd166', { closed: shut, glint: '#fff3cf', lid: '#241828' });
        }
      });

      legRow('near', 0, 0);
      // Ближняя клешня: в покое поднята перед мордой, в ударе — обрушивается на героя.
      const a1 = ((p.clip === 'attack' ? keys(CLAW_UPPER, p.u) : 135) + 3 * p.wave(1, 0.2)) * deg + 0.6 * hurt;
      const a2 = ((p.clip === 'attack' ? keys(CLAW_FORE, p.u) : 250) + 4 * p.wave(1, 0.35)) * deg + 0.3 * hurt;
      const rest = 0.2 + 0.5 * snip;
      const open = rest * Math.max(0, 1 - wind - strike) + 1.1 * wind * (1 - strike) + 0.6 * hurt;
      claw(p, 62, 96 + breath, a1, a2, open, 'near', 0, 1.3);
      if (strike > 0.6) {
        // Хитиновая крошка от удара.
        for (const [ox, oy] of [[-6, -4], [4, -8], [-12, 2], [8, -2]]) p.px(-20 + ox * strike, 88 + oy * strike, '#8a7090');
      }
    });
  },
};

// ─── Осиная королева ────────────────────────────────────────────────────────

/** Королева — золото темнее и глуше, чем у Осы-стража: элита не ярче рядовых; глаз и корона — главное пятно. */
const QUEEN = {
  gold: { base: '#a47824', shine: 0.45, tex: { kind: 'noise', scale: 2.5, amp: 0.08 } } as Mat,
  black: { base: '#2a1e1a', shine: 0.5, tex: { kind: 'noise', scale: 3, amp: 0.05 } } as Mat,
  leg: { base: '#8a6420', shine: 0.4, dither: 0 } as Mat,
  eye: { base: '#b02a30', shine: 0.8, dither: 0, tex: { kind: 'spots', scale: 1.8, amp: 0.25, density: 0.5 } } as Mat,
  crown: { base: '#6e4418', shine: 0.7, dither: 0 } as Mat,
  sting: { base: '#1e1614', shine: 0.6, dither: 0 } as Mat,
};

/** Брюшко королевы от стебелька к кончику: в покое лежит на земле за ней, в замахе взведено, в ударе — жалом к герою под грудью. */
const QUEEN_REST: Pt[] = [[66, 80, 6], [78, 94, 16], [94, 108, 21], [112, 118, 20], [128, 126, 14], [140, 132, 6]];
const QUEEN_WIND: Array<[number, number]> = [[66, 80], [80, 84], [96, 86], [112, 84], [124, 76], [130, 66]];
const QUEEN_HIT: Array<[number, number]> = [[66, 80], [66, 96], [58, 110], [42, 118], [24, 120], [8, 118]];
const QUEEN_HURT: Array<[number, number]> = [[66, 80], [80, 90], [96, 100], [112, 106], [126, 108], [136, 104]];

/** Нога королевы: бедро тёмное, голень и лапка золотые — у крупной фигуры ноги объёмные, а не линией. */
function queenLeg(p: Painter, pts: Array<[number, number]>, part: string, tone: number): void {
  const M = QUEEN;
  const r = [2.8, 2.2, 1.6, 1.1];
  for (let k = 0; k + 1 < pts.length; k++) p.limb(pts[k][0], pts[k][1], r[k], pts[k + 1][0], pts[k + 1][1], r[k + 1], k === 0 ? M.black : M.leg, { part, tone });
}

export const waspQueen: Model = {
  id: 'wasp_queen',
  w: 150,
  h: 144,
  ground: 142,
  // Жало в кадре контакта — на 30 единиц левее рамки.
  pad: 40,
  draw(p: Painter) {
    const M = QUEEN;
    const G = 142;
    // Жало: замах — брюшко взведено над землёй, передние лапы вскинуты; удар — брюшко под грудью, жало к герою.
    // Урон: отбросило назад, голову запрокинуло, крылья вскинуты, лапы растопырены.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const breath = p.bob(1, 2);
    const pump = p.wave(2, 0.2) * (1 - Math.max(wind, strike, hurt));
    // Раз за цикл крылья вздрагивают — королева жужжит на свой выводок.
    const flick = p.clip === 'idle' ? p.blink(0.5, 0.1) : 0;
    const tick = p.clip === 'idle' ? Math.round(p.t * p.frames) : 0;
    const splay = 4 * hurt;

    p.pose({ dx: -6 * strike + 3 * wind + 5 * hurt, rot: 0.03 * wind - 0.05 * strike + 0.05 * hurt, px: 80, py: G }, () => {
      p.shadow(84, 58, 4);
      const abd = spineAt(QUEEN_REST, QUEEN_WIND, QUEEN_HIT, QUEEN_HURT, wind, strike, hurt).map(([x, y, r], i): Pt => [x, y - (i > 1 && i < 5 ? pump * 0.8 : 0), r * (1 + 0.03 * pump)]);
      // Крылья сложены назад над брюшком; ближние раньше дальних.
      const wa = -0.45 - 0.35 * flick * (tick % 2 ? 1 : 0.4) - 0.5 * hurt - 0.25 * wind;
      wing(p, 58, 46 + breath, 66, 11, wa, '#fff4dc70', '#fff0d850', false);
      wing(p, 60, 48 + breath, 48, 9, wa + 0.3, '#fff4dc60', '#fff0d840', false);
      wing(p, 56, 44 + breath, 62, 10, wa - 0.18, '#f0e6d058', '#e8dcc040', true);
      // Дальние ноги — темнее, за телом.
      queenLeg(p, [[56, 74], [48 - splay, 96], [48 - splay, 120], [44 - splay, 142]], 'farLeg1', -0.3);
      queenLeg(p, [[64, 78], [78 + splay, 98], [86 + splay, 120], [92 + splay, 142]], 'farLeg2', -0.3);
      // Брюшко: огромное, в чёрных поясах, дышит; жало на кончике.
      p.chain(abd, M.gold, { part: 'abd' });
      for (const f of [0.22, 0.4, 0.57, 0.73, 0.87]) band(p, abd, f, 2.6, M.black, 'abd');
      const { x: sx, y: sy, tx, ty } = along(abd, 1);
      p.limb(sx, sy, 2.2, sx + tx * 11, sy + ty * 11, 0.6, M.sting, { part: 'sting' });
      p.limb(66, 80, 4, 60, 73, 3.8, M.black, { part: 'waist' });
      // Грудь стоймя: золото, чёрная спинка.
      p.ellipse(54, 58 + breath, 14, 18, M.gold, { part: 'thorax', rot: -0.35 });
      p.ellipse(60, 50 + breath, 6, 9, M.black, { part: 'thorax', paint: true, rot: -0.35 });
      p.ellipse(50, 64 + breath, 5, 4, M.black, { part: 'thorax', paint: true, rot: -0.35 });
      p.px(57, 45 + breath, '#d0a030');
      p.px(60, 55 + breath, '#d0a030');
      // Ближние ноги стоят на земле: средняя впереди, задняя поперёк брюшка.
      queenLeg(p, [[50, 72], [38 - splay, 94], [36 - splay, 120], [30 - splay, 142]], 'leg1', 0);
      queenLeg(p, [[60, 76], [72 + splay, 100], [78 + splay, 122], [84 + splay, 142]], 'leg2', 0);
      // Передние лапы вскинуты, как руки: в замахе выше, в ударе тянутся к герою.
      const arm = (off: number, part: string, tone: number): void => {
        const [ex, ey] = mixPt([32, 76], [30, 56], [20, 70], wind, strike);
        const [hx, hy] = mixPt([24, 62], [22, 42], [6, 64], wind, strike);
        queenLeg(p, [[46 + off, 64 + breath], [ex + off + 3 * hurt, ey + breath], [hx + off + 5 * hurt, hy + breath - 4 * hurt], [hx + off - 4 + 5 * hurt, hy + breath + 3 - 4 * hurt]], part, tone);
      };
      arm(5, 'farArm', -0.3);
      // Голова: корона шипов, огромный красный глаз, чёрные жвалы, усики.
      p.pose({ dx: -2 * strike + 2 * hurt, dy: breath, rot: -0.08 * strike + 0.06 * wind + 0.26 * hurt, px: 48, py: 46 }, () => {
        const open = 1.5 * strike + 2 * hurt + 0.6 * pump;
        p.limb(26, 41, 3, 19 - open * 0.4, 46 + open * 0.3, 1.6, M.black, { part: 'jaw' });
        p.limb(28, 44, 2.8, 22 - open * 0.2, 50 + open, 1.5, M.black, { part: 'jaw', tone: -0.1 });
        p.ellipse(37, 34, 13.5, 14, M.gold, { part: 'head' });
        p.ellipse(30, 42, 6.5, 4.5, M.gold, { part: 'head', lift: 1.5 });
        p.ellipse(40, 30, 7, 10, M.eye, { part: 'eye', rot: 0.25, lift: 1.5 });
        if (hurt < 0.4) {
          p.px(38, 23, '#ffd8c8');
          p.px(39, 23, '#ffb0a0');
        }
        // Корона: пять хитиновых зубцов по темени.
        for (const [x, h, a] of [[28, 8, -0.45], [33, 11, -0.2], [39, 13, 0], [45, 11, 0.25], [50, 8, 0.5]] as Array<[number, number, number]>) {
          p.poly([x - 2.8, 24, x + Math.sin(a) * h, 23 - Math.cos(a) * h, x + 2.8, 24], M.crown, { part: 'crown', bevel: 1 });
        }
        const tw = p.wave(2, 0.4) + 2 * flick;
        for (const [ox, oy] of [[0, 0], [3, 1]]) {
          p.line(29 + ox, 22 + oy, 25 + ox, 12 + oy + tw * 0.3, '#2a1e1a');
          p.line(25 + ox, 12 + oy + tw * 0.3, 16 + ox - hurt * 3, 6 + oy + tw - hurt * 3, '#2a1e1a');
        }
      });
      arm(0, 'arm', 0);
    });
  },
};

// ─── Сердце улья ────────────────────────────────────────────────────────────

const HEART = {
  flesh: { base: '#9a2a38', shine: 0.55, tex: { kind: 'noise', scale: 4, amp: 0.1 } } as Mat,
  vessel: { base: '#7c2232', shine: 0.6, tex: { kind: 'stripes', scale: 2, amp: 0.08, angle: 1.57 } } as Mat,
  fat: { base: '#b89260', shine: 0.3, tex: { kind: 'noise', scale: 2, amp: 0.12 } } as Mat,
  chitin: { base: '#3e2650', shine: 0.7, dither: 0 } as Mat,
  wax: { base: '#8c6428', shine: 0.3, tex: { kind: 'noise', scale: 3, amp: 0.1 } } as Mat,
  cell: { base: '#2a160c', dither: 0 } as Mat,
  cap: { base: '#b08a40', shine: 0.4, dither: 0 } as Mat,
  grub: { base: '#cdb890', shine: 0.4, dither: 0 } as Mat,
  hole: { base: '#1e0a10', dither: 0 } as Mat,
  acid: { base: '#b8e040', glow: true, dither: 0 } as Mat,
  tentacle: { base: '#842a48', shine: 0.6, tex: { kind: 'stripes', scale: 2.4, amp: 0.14, angle: 1.57 } } as Mat,
};

/** Щупальце-хлыст: от тела к кончику — покой (свито у земли), замах (взметнулось над сердцем), удар (обрушено на героя). */
const SLAM_REST: Pt[] = [[62, 152, 11], [46, 162, 9], [32, 168, 7.5], [20, 170, 6], [11, 166, 4.5], [7, 158, 3], [11, 152, 2]];
const SLAM_WIND: Array<[number, number]> = [[62, 152], [56, 128], [56, 104], [62, 80], [72, 60], [84, 46], [96, 42]];
const SLAM_HIT: Array<[number, number]> = [[62, 152], [42, 148], [20, 142], [-2, 136], [-24, 132], [-44, 130], [-62, 132]];
/** Глаза на сердце: [x, y, r, момент моргания]. Самый крупный — посередине желудочка. */
const HEART_EYES: Array<[number, number, number, number]> = [[96, 92, 6, 0.15], [120, 112, 4.4, 0.45], [74, 122, 3.6, 0.7], [134, 80, 3.4, 0.9], [110, 68, 3, 0.3], [98, 134, 2.6, 0.58]];

/** Соты рядами: [x, y, что внутри: 0 пусто, 1 запечатано, 2 личинка, 3 кислота]. */
/** Восковая гора сот за сердцем: три холма [x, y, rx, ry]. */
const COMB_HILLS: Array<[number, number, number, number]> = [[40, 150, 40, 32], [166, 138, 48, 44], [106, 162, 104, 22]];
/** Ячейки только внутри горы, с восковой стенкой до края. */
function combCells(x0: number, x1: number, y0: number, rows: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const inside = (x: number, y: number): boolean => COMB_HILLS.some(([cx, cy, rx, ry]) => ((x - cx) / (rx - 7)) ** 2 + ((y - cy) / (ry - 7)) ** 2 <= 1);
  for (let r = 0; r < rows; r++) {
    for (let x = x0 + (r % 2) * 9, k = 0; x <= x1; x += 18, k++) {
      const y = y0 - r * 15;
      if (!inside(x, y)) continue;
      const n = (k * 7 + r * 5) % 11;
      out.push([x, y, n === 0 ? 2 : n === 3 || n === 8 ? 1 : n === 5 ? 3 : 0]);
    }
  }
  return out;
}
const COMB = combCells(4, 214, 166, 5);

/** Ячейки сот поверх восковой горы: тёмная шестигранная яма с восковой стенкой, в некоторых — личинка, крышка или кислота. */
function cells(p: Painter, list: Array<[number, number, number]>, part: string): void {
  const M = HEART;
  for (const [x, y, kind] of list) {
    const hex = [x - 7.5, y, x - 3.8, y - 6.4, x + 3.8, y - 6.4, x + 7.5, y, x + 3.8, y + 6.4, x - 3.8, y + 6.4];
    p.poly(hex, kind === 1 ? M.cap : M.cell, { part, paint: true, bevel: 2 });
    if (kind === 2) p.ellipse(x + 0.5, y + 1, 4, 3.4, M.grub, { part, paint: true });
    if (kind === 3) p.ellipse(x, y + 1, 2.6, 2.4, M.acid, { part, paint: true });
  }
}

export const hiveHeart: Model = {
  id: 'hive_heart',
  w: 214,
  h: 186,
  ground: 182,
  // Щупальце в кадре контакта обрушено на героя — на 70 единиц левее рамки.
  pad: 78,
  draw(p: Painter) {
    const M = HEART;
    const G = 182;
    // Удар щупальцем: замах — щупальце взметнулось над сердцем; удар — обрушено на героя.
    // Урон: сердце сжалось, глаза зажмурены, во все стороны брызжет кислота.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const calm = 1 - Math.max(wind, strike, hurt);
    // Сердце бьётся дважды за цикл — «тук-тук» и пауза; сосуды вздуваются в такт.
    const lub = p.clip === 'idle' ? Math.max(p.blink(0.1, 0.08), 0.6 * p.blink(0.2, 0.08), p.blink(0.6, 0.08), 0.6 * p.blink(0.7, 0.08)) : 0;
    const beat = 1 + 0.035 * lub + 0.04 * wind - 0.07 * hurt;
    const drip = p.clip === 'idle' && p.t > 0.3 && p.t < 0.62 ? (p.t - 0.3) / 0.32 : -1;
    const ox = 104, oy = 156;
    const S = (x: number, y: number): [number, number] => [ox + (x - ox) * beat, oy + (y - oy) * beat];

    p.pose({ dx: -5 * strike + 3 * wind + 5 * hurt, rot: 0.02 * wind - 0.03 * strike + 0.03 * hurt, px: 150, py: G }, () => {
      p.shadow(106, 100, 5);
      // Дальнее щупальце за сердцем, колышется аркой.
      const tw = p.wave(1, 0.3) * calm, tw2 = p.wave(2, 0.6) * calm;
      p.chain([[160, 130, 10], [180, 110 + tw2 * 2, 8], [194 + tw * 2, 90, 6], [198 + tw * 3, 70, 4.5], [192 + tw * 3, 58 + tw2, 3], [184 + tw * 2, 60, 2]], M.tentacle, { part: 'tentacleBack', tone: -0.15 });
      // Соты горой за сердцем: восковые стенки, в ячейках личинки, крышки и кислота.
      for (const [x, y, rx, ry] of COMB_HILLS) p.ellipse(x, y, rx, ry, M.wax, { part: 'comb' });
      cells(p, COMB, 'comb');
      // Полая вена уходит в соты.
      const [vx, vy] = S(150, 84);
      p.chain([[vx, vy, 9], [168, 104, 8], [178, 124, 7], [182, 142, 6]], M.vessel, { part: 'cava', tone: -0.1 });

      // Сердце: желудочек, верхушка книзу-влево, два предсердия, дуга аорты с тремя обрубками.
      const [a0x, a0y] = S(104, 54), [p0x, p0y] = S(120, 56);
      p.chain([[a0x, a0y, 11], [104, 30, 10], [94, 16, 9], [80, 14, 8.5], [70, 22, 8]], M.vessel, { part: 'aorta' });
      for (const [x, y, a] of [[92, 10, -1.7], [100, 12, -1.3], [84, 10, -2]] as Array<[number, number, number]>) {
        p.limb(x, y + 2, 3.4, x + Math.cos(a) * 6, y + Math.sin(a) * 6, 3, M.vessel, { part: 'aorta' });
        p.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 2.2, 1.5, M.hole, { part: 'aorta', paint: true, rot: a + Math.PI / 2 });
      }
      p.chain([[p0x, p0y, 9], [128, 38, 8], [140, 30, 7], [152, 32, 6.5]], M.vessel, { part: 'trunk', tone: -0.05 });
      p.ellipse(154, 32, 3, 5, M.hole, { part: 'trunk', paint: true });
      // Сердце конусом: широкое основание вверху справа, верхушка книзу-влево, к герою; ушко предсердия над ним.
      const [c1x, c1y] = S(102, 100), [c2x, c2y] = S(70, 136), [c3x, c3y] = S(138, 68), [c4x, c4y] = S(78, 62);
      p.ellipse(c4x, c4y, 17 * beat, 12 * beat, M.flesh, { part: 'atrium', tone: -0.08, rot: -0.4 });
      p.ellipse(c3x, c3y, 26 * beat, 22 * beat, M.flesh, { part: 'atrium', tone: -0.04 });
      p.ellipse(c1x, c1y, 44 * beat, 56 * beat, M.flesh, { part: 'heart', rot: 0.55 });
      p.ellipse(c2x, c2y, 20 * beat, 16 * beat, M.flesh, { part: 'heart', rot: 0.55 });
      // Жир в венечной борозде и хитиновые осколки, вросшие в мышцу, — улей бронирует своё сердце.
      const [gx, gy] = S(120, 62);
      p.ellipse(gx, gy, 14, 4, M.fat, { part: 'heart', paint: true, rot: 0.5 });
      for (const [x, y, a, l] of [[56, 104, -2.4, 18], [148, 104, -0.5, 20], [132, 132, 0.3, 14]] as Array<[number, number, number, number]>) {
        const [sx, sy] = S(x, y);
        const c = Math.cos(a), s2 = Math.sin(a);
        p.poly([sx - s2 * 5, sy + c * 5, sx + c * l, sy + s2 * l, sx + s2 * 5, sy - c * 5, sx - c * 4, sy - s2 * 4], M.chitin, { part: `plate${x}`, lift: 3, bevel: 2 });
      }
      // Борозда между желудочками и сосуды по ней; в такт биению вздуваются светлым.
      const vein = lub > 0.5 ? '#e07a90' : '#c0506a';
      const groove: Array<[number, number]> = [[122, 56], [116, 80], [106, 104], [94, 128], [84, 146]];
      for (let k = 0; k + 1 < groove.length; k++) {
        const [x1, y1] = S(groove[k][0], groove[k][1]), [x2, y2] = S(groove[k + 1][0], groove[k + 1][1]);
        p.line(x1, y1, x2, y2, '#4a0c22');
        p.line(x1 + 2, y1, x2 + 2, y2, vein);
      }
      for (const pts of [[[116, 80], [132, 92], [140, 106]], [[106, 104], [120, 126]], [[110, 66], [96, 78], [82, 90], [72, 104]], [[94, 128], [80, 140]]]) {
        for (let k = 0; k + 1 < pts.length; k++) {
          const [x1, y1] = S(pts[k][0], pts[k][1]), [x2, y2] = S(pts[k + 1][0], pts[k + 1][1]);
          p.line(x1, y1, x2, y2, vein);
        }
      }
      // Глаза россыпью: кислотные, моргают каждый в свой момент; у крупных — щель зрачка.
      for (const [x, y, r, ph] of HEART_EYES) {
        const [ex, ey] = S(x, y);
        const shut = hurt > 0.4 ? 1 : p.blink(ph, 0.05);
        p.ellipse(ex, ey, r + 1.6, r + 1.2, M.flesh, { part: `lid${x}`, lift: 2 });
        p.glow(ex, ey, r * 2.4, '#e0ff60', 0.22);
        p.eye(ex, ey, r, '#c8e040', { closed: shut, glint: '#f4ffd8', lid: '#3a0c20' });
        if (!shut && r > 3) p.line(ex, ey - r * 0.7, ex, ey + r * 0.7, '#2a3808');
      }
      if (drip >= 0) p.disc(62, 132 + drip * 30, 1.2, '#b8e040');

      // Щупальце-хлыст у земли: в ударе взмывает и обрушивается на героя.
      const lash = SLAM_REST.map(([x, y, r], k) => {
        const [mx, my] = mixPt([x, y], SLAM_WIND[k], SLAM_HIT[k], wind, strike);
        const f = k / (SLAM_REST.length - 1);
        return [mx + 2 * p.wave(1, 0.2 - f * 0.5) * f * calm + 6 * hurt * f, my + 1.5 * p.wave(2, -f * 0.5) * f * calm - 8 * hurt * f, r] as Pt;
      });
      p.chain(lash, M.tentacle, { part: 'lash' });
      for (let k = 1; k < 12; k++) {
        const { x, y, r, tx, ty } = along(lash, k / 12);
        p.px(x + ty * r * 0.5, y - tx * r * 0.5, '#d07a98');
      }
      if (hurt > 0.3) {
        for (const [bx, by] of [[-40, -50], [10, -70], [40, -56], [-10, -80], [60, -30], [-50, -20]]) p.disc(104 + bx * (0.6 + hurt), 96 + by * (0.4 + hurt * 0.6), 1.3, '#b8e040');
      }
    });
  },
};

export const HIVE_MODELS: Record<string, Model> = {
  larva, egg_cluster: eggCluster, wasp, drone, sporeling, beetle, chitin_colossus: chitinColossus, wasp_queen: waspQueen, hive_heart: hiveHeart,
};
