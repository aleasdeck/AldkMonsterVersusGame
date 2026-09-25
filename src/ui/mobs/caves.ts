import { arc, keys, mixPt, scaleModel, type Keys, type Mat, type Model, type Painter } from './pixel';

/**
 * Враги Пещер огня пиксельной лепкой. Все смотрят влево — на героя; единица — пиксель поля боя,
 * рост от макушки до земли — как в `ENEMY_BODY_HEIGHT` (characterSizes.ts).
 * Цвета продолжают палитры прежних спрайтов (`sprite` в enemies.ts): Имп красный с жёлтыми глазами,
 * бомбардир рыже-оранжевый, мышь и Гончая почти чёрные с огнём, Саламандра и слизень оранжевые,
 * культисты в багровом (жрец — с золотым клобуком), Демон-мучитель малиновый, голем серый камень,
 * элементаль — пламя, Минотавр бурый с костяными рогами, Древний дракон тёмно-красный с золотыми глазами.
 * В Пещерах свет от лавы снизу и сзади (тонировка `caves` в tint.ts ведёт всех в жар): огонь в модели —
 * материал с `glow`, он светится сам и остаётся самым ярким пятном рядом с глазами.
 */

// ─── Общее ──────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/** Угол по ключам клипа удара; вне удара — угол покоя `rest`. */
function ang(p: Painter, k: Keys, rest: number): number {
  return p.clip === 'attack' ? keys(k, p.u) : rest;
}

/**
 * Рука из двух звеньев: плечо S, направления плеча `a1` и предплечья `a2` в градусах
 * (90 — вниз, 180 — к герою, 270 — вверх, 360 — назад), длины `l1` и `l2`. Отдаёт локоть и кисть.
 */
function limb2(sx: number, sy: number, a1: number, l1: number, a2: number, l2: number): { ex: number; ey: number; hx: number; hy: number } {
  const ex = sx + l1 * Math.cos(a1 * DEG), ey = sy + l1 * Math.sin(a1 * DEG);
  return { ex, ey, hx: ex + l2 * Math.cos(a2 * DEG), hy: ey + l2 * Math.sin(a2 * DEG) };
}

/** Точка на расстоянии `len` от (x, y) под углом `a` градусов (90 — вниз, 180 — к герою). */
function at(x: number, y: number, a: number, len: number): [number, number] {
  return [x + len * Math.cos(a * DEG), y + len * Math.sin(a * DEG)];
}

/** Альфа в два знака для декалей: 0..1 → '00'..'ff'. */
const hexA = (a: number): string => Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

/** Пламя из трёх светящихся слоёв: тёмно-красный край, оранжевая середина, жёлтое ядро. Общее для всех огней Пещер. */
const FLAME = {
  outer: { base: '#e83c10', glow: true, dither: 0, ramp: ['#c8300a', '#d8380c', '#e8420e', '#f85414', '#ff6a1a'] } as Mat,
  mid: { base: '#ff8a14', glow: true, dither: 0, ramp: ['#f06a10', '#ff7c14', '#ff8e18', '#ffa21e', '#ffb428'] } as Mat,
  core: { base: '#ffd23a', glow: true, dither: 0, noOutline: true, ramp: ['#ffb82a', '#ffc632', '#ffd23a', '#ffe060', '#ffec90'] } as Mat,
};

/**
 * Язык пламени от основания (x, y) вверх длиной `len`: три слоя, кончик клонится на `lean` и дрожит `sway`.
 * `r` — полуширина у основания. Части — `flame`, `flameMid`, `flameCore` с суффиксом `tag`.
 */
function flame(p: Painter, x: number, y: number, r: number, len: number, sway: number, lean = 0, tag = ''): void {
  const tip: [number, number] = [x + lean + sway, y - len];
  const mid: [number, number] = [x + lean * 0.45 - sway * 0.5, y - len * 0.5];
  p.chain([[x, y, r], [mid[0], mid[1], r * 0.62], [tip[0], tip[1], 0.6]], FLAME.outer, { part: `flame${tag}` });
  p.chain([[x, y + r * 0.15, r * 0.66], [mid[0] + 0.3, mid[1] + len * 0.08, r * 0.38], [tip[0] - sway * 0.3, tip[1] + len * 0.28, 0.5]], FLAME.mid, { part: `flameMid${tag}`, noLine: true });
  if (r > 2.2) p.chain([[x, y + r * 0.25, r * 0.36], [mid[0] + 0.3, mid[1] + len * 0.2, r * 0.18]], FLAME.core, { part: `flameCore${tag}`, noLine: true });
}

/**
 * Гребень пламени вдоль хребта: зубчатая полоса языков над точками основания `base`, высоты языков — `hs`
 * (по одному на промежуток между точками). Языки клонятся на `lean` назад, каждый дрожит своей волной `sway(i)`.
 * Три слоя — край, середина, ядро; низ полосы прячется в теле.
 */
function flameRow(p: Painter, base: Array<[number, number]>, hs: number[], lean: number, sway: (i: number) => number, tag = ''): void {
  const layer = (k: number, drop: number, mat: Mat, part: string, noLine = false): void => {
    const pts: number[] = [];
    for (let i = base.length - 1; i >= 0; i--) pts.push(base[i][0], base[i][1] + drop);
    for (let i = 0; i < base.length; i++) {
      const [x, y] = base[i];
      const hv = i === 0 || i === base.length - 1 ? 0 : (hs[i - 1] + hs[i]) * 0.12 * k;
      pts.push(x, y - hv);
      if (i < hs.length) {
        const [nx, ny] = base[i + 1];
        pts.push((x + nx) / 2 + lean * k + sway(i) * k, (y + ny) / 2 - hs[i] * k);
      }
    }
    p.poly(pts, mat, { part, bevel: 1.2, noLine });
  };
  layer(1, 2, FLAME.outer, `row${tag}`);
  layer(0.6, 0.5, FLAME.mid, `rowMid${tag}`, true);
  // Ядро — у самых высоких языков, а не сплошной полосой.
  for (let i = 0; i < hs.length; i++) {
    if (hs[i] < 8) continue;
    const x = (base[i][0] + base[i + 1][0]) / 2, y = (base[i][1] + base[i + 1][1]) / 2;
    p.chain([[x, y, 1.6], [x + lean * 0.25 + sway(i) * 0.2, y - hs[i] * 0.32, 0.7]], FLAME.core, { part: `rowCore${tag}`, noLine: true });
  }
}

/** Огненный шар (плевок, снаряд): светящееся ядро и хвост искр позади — по ходу полёта вправо. */
function fireball(p: Painter, x: number, y: number, r: number, tail: number, tag = ''): void {
  p.glow(x, y, r * 2.4, '#ff9a2a', 0.35);
  p.chain([[x + tail, y + 0.5, r * 0.35], [x + tail * 0.45, y - 0.5, r * 0.75], [x, y, r]], FLAME.outer, { part: `ball${tag}` });
  p.ellipse(x - r * 0.1, y, r * 0.7, r * 0.66, FLAME.mid, { part: `ballMid${tag}`, noLine: true });
  p.ellipse(x - r * 0.25, y - r * 0.1, r * 0.38, r * 0.36, FLAME.core, { part: `ballCore${tag}`, noLine: true });
}

// ─── Имп ────────────────────────────────────────────────────────────────────

const IMP = {
  skin: { base: '#c8422e', tex: { kind: 'noise', scale: 2.5, amp: 0.12 } } as Mat,
  belly: { base: '#9a3226' } as Mat,
  wing: { base: '#7a2a2c', tex: { kind: 'stripes', scale: 2.5, amp: 0.08, angle: 0.5 } } as Mat,
  bone: { base: '#3a1216', dither: 0 } as Mat,
  horn: { base: '#8a6a52', tex: { kind: 'stripes', scale: 1.4, amp: 0.2, angle: 0.3 } } as Mat,
  claw: { base: '#2a1414', dither: 0 } as Mat,
  mouth: { base: '#3a0a0e', dither: 0 } as Mat,
};

export const imp: Model = {
  id: 'imp',
  w: 64,
  h: 64,
  ground: 62,
  // Огненный плевок в кадре контакта — на 22 единицы левее рамки.
  pad: 32,
  draw(p: Painter) {
    const M = IMP;
    const G = 62;
    // Огненный плевок: замах — откинуться, щёки надуты, в пасти разгорается огонь; выпад — голова вперёд,
    // пасть раскрыта, шар огня летит к герою. Урон: отбросило, голова назад, крылья вскинуты, глаза зажмурены.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const by = p.bob(1, 2);
    const flap = 0.12 * p.wave(2, 0.1) + 0.35 * hurt - 0.15 * wind;
    const tail = p.wave(1, 0.3);
    const flick = 1.5 * p.wave(4, 0.2);

    p.pose({ dx: -6 * strike + 3 * wind + 4 * hurt, rot: 0.08 * wind - 0.07 * strike + 0.08 * hurt, px: 32, py: G }, () => {
      p.shadow(32, 16, 2.5);
      // Хвост-плеть со стрелкой на конце: лежит дугой за спиной и лениво виляет кончиком.
      const tx = 2 * tail;
      p.chain([[40, 49, 2], [49, 52, 1.6], [56, 47 + tx * 0.3, 1.3], [57 + tx, 39, 1], [54 + tx * 1.4, 34, 0.8]], M.skin, { part: 'tail', tone: -0.1 });
      p.poly([54 + tx * 1.4, 31, 57.5 + tx * 1.4, 35.5, 51 + tx * 1.4, 36.5], M.claw, { part: 'tailTip', bevel: 1 });

      // Крылья летучей мыши за спиной: дальнее выше, темнее; в покое подрагивают, от удара вскинуты.
      const wing = (sx: number, sy: number, s: number, tone: number, part: string): void => {
        p.pose({ rot: -flap * s, px: sx, py: sy + by }, () => {
          const y = sy + by;
          p.poly([sx, y, sx + 8 * s, y - 16, sx + 19 * s, y - 20, sx + 17 * s, y - 11, sx + 20 * s, y - 4, sx + 13 * s, y - 2, sx + 12 * s, y + 5], M.wing, { part, tone, flat: 0.6, bevel: 2 });
          p.limb(sx, y, 1.1, sx + 19 * s, y - 20, 0.7, M.bone, { part, paint: true });
          p.limb(sx + 8 * s, y - 16, 0.6, sx + 17 * s, y - 11, 0.5, M.bone, { part, paint: true });
        });
      };
      wing(40, 31, 1, -0.15, 'wingFar');

      // Дальняя нога: бедро, голень назад, когтистая стопа.
      p.chain([[37, 48, 3.8], [41, 54, 2.4], [39, 59, 2]], M.skin, { part: 'far', tone: -0.15 });
      p.ellipse(37.5, 60.5, 3.6, 1.8, M.skin, { part: 'far', tone: -0.15 });
      // Дальняя рука висит, когти у бедра.
      p.chain([[38, 34 + by, 2.4], [41, 39 + by, 2], [41, 44 + by, 1.8]], M.skin, { part: 'farArm', tone: -0.15 });

      // Пузатое тельце, брюхо темнее.
      p.ellipse(32, 41 + by * 0.5, 9.5, 10.5, M.skin);
      p.ellipse(30, 45 + by * 0.5, 6, 6, M.belly, { paint: true });
      wing(35, 33, 0.75, 0, 'wingNear');

      // Ближняя нога: колено вперёд, стопа с когтями к герою.
      p.chain([[27, 48, 4], [23, 54, 2.6], [25, 59, 2.1]], M.skin, { part: 'near' });
      p.ellipse(23.5, 60.5, 4, 1.9, M.skin, { part: 'near' });
      p.px(19.5, 61.5, '#2a1414');
      p.px(22, 62, '#2a1414');

      // Голова — больше тела: уши-стрелки, рожки, острый подбородок; в замахе запрокинута, в плевке подана вперёд.
      p.pose({ dx: p.snap(-2 * strike + 1.5 * hurt), dy: by, rot: 0.26 * wind - 0.16 * strike + 0.26 * hurt, px: 28, py: 31 }, () => {
        const ear = 1.5 * p.blink(0.62, 0.06) + 3 * hurt;
        p.poly([33, 20, 45 + ear, 13 + ear, 35, 26], M.skin, { part: 'ear', bevel: 1.5, tone: -0.05 });
        p.poly([35, 21, 42 + ear, 16 + ear, 36, 24], M.belly, { part: 'ear', paint: true });
        const open = 2.5 * strike + 2 * hurt;
        p.ellipse(19, 29 + open * 0.6, 5, 2.6, M.skin, { part: 'jaw', tone: -0.15 });
        p.ellipse(26, 21, 10.5, 9.5, M.skin, { part: 'head' });
        p.ellipse(19.5, 25.5, 6, 4.8, M.skin, { part: 'head' });
        // Надутые щёки в замахе.
        if (wind > 0.3) p.ellipse(22, 26, 3.5 + wind, 3 + wind, M.skin, { part: 'head', lift: 2 });
        // Рожки: дальний короче.
        p.chain([[27, 13, 1.8], [28, 8, 1.3], [31.5, 5, 0.7]], M.horn, { part: 'hornFar', tone: -0.15 });
        p.chain([[21, 13, 2.1], [19.5, 7, 1.5], [22.5, 2.5, 0.7]], M.horn, { part: 'horn' });
        if (open > 1) {
          p.poly([13, 26.5, 22, 26.5, 21, 27.5 + open, 14, 27.5 + open], M.mouth, { part: 'maw', bevel: 0.6 });
          if (strike > 0.3) p.glow(14, 27.5, 5, '#ffb43c', 0.5);
        } else {
          // Ухмылка с клычком.
          p.line(13.5, 26.5, 21, 27.5, '#2a0a0e');
          p.px(15.5, 27.5, '#f0e2c4');
        }
        if (wind > 0.3) p.glow(15, 27, 3 + 3 * wind, '#ff9a2a', 0.3 + 0.3 * wind);
        p.eye(19, 19.5, 2.2, '#ffe066', { closed: hurt > 0.4 ? 1 : wind > 0.5 ? 0.5 : p.blink(0.3), pupil: '#3a1a0a', glint: '#fffbe0' });
        p.line(15.5, 16, 22, 17.5 + 1.2 * wind, '#3a0a0e');
      });

      // Ближняя рука: огонёк на ладони пляшет; в замахе рука отведена, в плевке — к пасти.
      const [hx, hy] = mixPt([19, 42], [23, 40], [17, 38], wind, strike);
      p.chain([[27, 34 + by, 2.6], [22, 38 + by, 2.1], [hx, hy + by, 1.9]], M.skin, { part: 'nearArm' });
      p.ellipse(hx - 0.5, hy + by + 0.5, 2.2, 1.8, M.skin, { part: 'nearArm' });
      if (strike < 0.3 && hurt < 0.4) flame(p, hx - 1, hy + by - 2, 2.2, 6 + 1.5 * flick + 2 * wind, 0.6 * flick, 0.5, 'Palm');

      // Плевок: шар огня из пасти летит к герою в кадрах 4–5.
      if (p.clip === 'attack' && p.u > 0.4 && p.u < 0.62) {
        const x = p.u < 0.5 ? 6 : -14;
        fireball(p, x, 27, 3.6, 7);
      }
    });
  },
};

// ─── Имп-бомбардир ──────────────────────────────────────────────────────────

const BOMBER = {
  skin: { base: '#e2562e', tex: { kind: 'noise', scale: 2.5, amp: 0.1 } } as Mat,
  belly: { base: '#f0904a' } as Mat,
  horn: { base: '#5a3a2a', dither: 0 } as Mat,
  iron: { base: '#34343e', shine: 0.9, tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  strap: { base: '#4a3020' } as Mat,
  wood: { base: '#7a5230', tex: { kind: 'stripes', scale: 1.5, amp: 0.15 } } as Mat,
  rag: { base: '#9a8060', dither: 0 } as Mat,
  mouth: { base: '#4a0e0a', dither: 0 } as Mat,
};

export const kamikazeImp: Model = {
  id: 'kamikaze_imp',
  w: 60,
  h: 56,
  ground: 54,
  // Факел в кадре контакта выброшен к герою — пламя на 20 единиц левее рамки.
  pad: 30,
  draw(p: Painter) {
    const M = BOMBER;
    const G = 54;
    // Поджог: замах — факел заброшен за голову; выпад — тычок факелом к герою, пламя сорвано назад.
    // Урон: отбросило, бомбу на спине качнуло, фитиль сыплет искрами, глаза зажмурены.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    // Не стоит на месте: подпрыгивает на носках, будто вот-вот сорвётся.
    const by = -p.bob(1.5, 3);
    const flick = p.wave(5, 0.3);
    const spark = p.wave(6, 0.15);

    p.pose({ dx: -6 * strike + 2 * wind + 4 * hurt, rot: 0.05 * wind - 0.06 * strike + 0.08 * hurt, px: 28, py: G }, () => {
      p.shadow(29, 14, 2.2);
      // Хвостик крючком.
      p.chain([[35, 44 + by, 1.5], [42, 47 + by, 1.2], [45, 43 + by + spark * 0.6, 0.9]], M.skin, { part: 'tail', tone: -0.1 });

      // Бомба на лямках за спиной: чугунный шар, фитиль тлеет и сыплет искрами.
      p.pose({ rot: 0.12 * hurt - 0.04 * strike, px: 34, py: 40 + by }, () => {
        p.ellipse(37, 29 + by, 11, 11, M.iron, { part: 'bomb' });
        p.limb(35, 18 + by, 3, 38, 18.5 + by, 3, M.iron, { part: 'bombCap', tone: -0.1 });
        const fx = 42 + 1.2 * spark, fy = 9 + by;
        p.chain([[37, 17 + by, 0.9], [40, 13 + by, 0.8], [fx, fy, 0.7]], M.rag, { part: 'fuse' });
        p.glow(fx, fy, 4 + 1.5 * spark + 4 * hurt, '#ffb43c', 0.45);
        p.px(fx, fy - 1, '#fff6c0');
        const n = hurt > 0.3 ? 6 : 3;
        for (let k = 0; k < n; k++) {
          const a = 2 * Math.PI * (k / n + p.t * 3) + hurt;
          const r = 2.5 + 2 * ((k + Math.floor(p.t * 12)) % 2) + 3 * hurt;
          p.px(fx + r * Math.cos(a), fy - 1 + r * Math.sin(a) * 0.8, k % 2 ? '#ffe27a' : '#ff9a2a');
        }
      });

      // Ножки.
      p.chain([[31, 45 + by, 3.4], [33, 50 + by * 0.5, 2.2], [32, 52, 1.9]], M.skin, { part: 'far', tone: -0.15 });
      p.ellipse(31, 53, 3.2, 1.6, M.skin, { part: 'far', tone: -0.15 });
      p.chain([[24, 45 + by, 3.6], [21, 50 + by * 0.5, 2.3], [22, 52, 2]], M.skin, { part: 'near' });
      p.ellipse(20.5, 53, 3.6, 1.7, M.skin, { part: 'near' });

      // Пузатое тельце с лямкой через грудь.
      p.ellipse(28, 39 + by, 9.5, 9.5, M.skin);
      p.ellipse(25.5, 42 + by, 6, 5.5, M.belly, { paint: true });
      p.poly([21, 31 + by, 25, 30 + by, 35, 45 + by, 31, 46 + by], M.strap, { paint: true });
      p.block(27, 37 + by, 2, 2, '#b08a4a');

      // Голова: круглая, рожки-пеньки, рот до ушей, глаза навыкате.
      p.pose({ dx: p.snap(-1.5 * strike + hurt), dy: by, rot: 0.08 * wind - 0.1 * strike + 0.24 * hurt, px: 26, py: 30 }, () => {
        p.poly([30, 17, 38 + 2 * hurt, 12 + 2 * hurt, 31, 22], M.skin, { part: 'ear', bevel: 1.2, tone: -0.1 });
        p.ellipse(23, 22, 9, 8.5, M.skin, { part: 'head' });
        p.ellipse(17.5, 25, 5, 4, M.skin, { part: 'head' });
        p.limb(20, 15, 1.6, 18.5, 11, 0.9, M.horn, { part: 'horn' });
        p.limb(26, 14.5, 1.4, 27, 10.5, 0.8, M.horn, { part: 'hornFar', tone: -0.15 });
        const open = 1 + 2 * strike + 2 * hurt + wind;
        p.poly([12.5, 25.5, 22, 26, 20.5, 26 + open, 14, 26 + open * 0.8], M.mouth, { part: 'mouth', bevel: 0.5 });
        p.line(13.5, 26, 21, 26.5, '#f4ead0');
        const shut = hurt > 0.4 ? 1 : p.blink(0.7, 0.05);
        p.eye(17.5, 19.5, 2, '#ffff88', { closed: shut, pupil: '#3a1a0a', glint: '#ffffff' });
        p.eye(23, 19, 1.7, '#ffff88', { closed: shut, pupil: '#3a1a0a' });
        p.line(14.5, 16 + wind, 19.5, 17, '#5a1a0a');
      });

      // Рука с факелом: в покое факел вверх у плеча, в замахе заброшен за голову, в выпаде — тычок к герою.
      const [hx, hy] = mixPt([16, 37], [29, 22], [7, 33], wind, strike);
      const a = 250 + 60 * wind - 58 * strike - 30 * hurt;
      p.chain([[24, 33 + by, 2.3], [20, 36 + by * 0.5 - 4 * wind, 2], [hx, hy + by, 1.8]], M.skin, { part: 'nearArm' });
      const [tx, ty] = at(hx, hy + by, a, 11);
      const [bx, by2] = at(hx, hy + by, a + 180, 3);
      p.limb(bx, by2, 1.2, tx, ty, 1.5, M.wood, { part: 'torch' });
      p.limb(...at(hx, hy + by, a, 8), 1.9, tx, ty, 2, M.rag, { part: 'torch', tone: -0.2 });
      p.ellipse(hx, hy + by, 2.2, 2, M.skin, { part: 'fist' });
      flame(p, tx, ty, 2.6, 7 + 1.5 * flick + 2 * strike, 0.8 * flick, 4 * strike - wind, 'Torch');
    });
  },
};

// ─── Огненная мышь ──────────────────────────────────────────────────────────

const FBAT = {
  fur: { base: '#6a2226', shag: 0.3, tex: { kind: 'fur', scale: 1.8, amp: 0.22, stretch: 1.5, angle: 1.57 } } as Mat,
  belly: { base: '#8a3a2a' } as Mat,
  wing: { base: '#4e1a1e', tex: { kind: 'stripes', scale: 3.5, amp: 0.08, angle: 0.4 } } as Mat,
  earIn: { base: '#c85a3a', dither: 0 } as Mat,
  /** Кости крыла тлеют, как угли: тёмно-огненная жила по перепонке, раз в полтакта разгорается. */
  bone: { base: '#b8260a', glow: true, dither: 0, ramp: ['#6a1408', '#8a1a08', '#a8220a', '#c02a0c', '#d8340e'] } as Mat,
  boneHot: { base: '#e03a0e', glow: true, dither: 0, ramp: ['#a8220a', '#c02a0c', '#e03a0e', '#f04c12', '#ff6a1a'] } as Mat,
};

export const fireBat: Model = {
  id: 'fire_bat',
  w: 96,
  h: 72,
  ground: 70,
  flies: true,
  ownHeight: 'парит: в рамку от макушки до пола входит просвет под крыльями, как у летучей мыши Леса',
  draw(p: Painter) {
    const M = FBAT;
    // Пикирование: замах — взмыть, крылья вверх; выпад — нырок к герою, клыки, крылья бьют вниз.
    // Урон: отбросило вверх-назад, крылья вскинуты, с перепонок сыплются угли.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const k = Math.max(1, Math.round(p.frames / 4));
    const a = p.clip === 'idle' ? p.wave(k, 0.25) : p.clip === 'attack' ? 1 - 2 * strike : 1;
    const by = 7 + p.snap(1.6 * a);
    const cx = 48;
    const glowV = (p.wave(3, 0.1) + 1) / 2;

    p.pose({ dx: -16 * strike + 3 * wind + 6 * hurt, dy: -6 * wind + 9 * strike - 4 * hurt, rot: -0.2 * strike + 0.25 * hurt, px: cx, py: 30 }, () => {
      // Отсвет углей на полу вместо тени.
      p.line(cx - 8, 70, cx + 8, 70, '#ff7a2a30');
      p.shadow(cx, 9 - a, 1.6, 0.18);
      const wing = (sgn: number): void => {
        const sx = cx + sgn * 5, sy = 21 + by;
        const phi = -sgn * a * 0.6;
        const c = Math.cos(phi), s = Math.sin(phi);
        const pt = (x: number, y: number, curl = 0): [number, number] => {
          const yy = y + curl * a * -4;
          return [sx + (sgn * x) * c - yy * s, sy + (sgn * x) * s + yy * c];
        };
        const W = pt(15, -9), F1 = pt(40, -6, 1), F2 = pt(36, 9, 0.6), F3 = pt(24, 16, 0.3), H = pt(3, 13);
        const M1 = pt(31, 3, 0.8), M2 = pt(26, 11, 0.4), M3 = pt(13, 13);
        const S = pt(0, 0);
        const part = sgn < 0 ? 'wingL' : 'wingR';
        p.poly([...S, ...W, ...F1, ...M1, ...F2, ...M2, ...F3, ...M3, ...H], M.wing, { part, flat: 0.6, bevel: 3 });
        // Кости крыла тлеют, как угли: светлая жила по тёмной перепонке.
        p.limb(S[0], S[1], 1.1, W[0], W[1], 0.8, M.bone, { part, paint: true });
        for (const F of [F1, F2, F3]) p.limb(W[0], W[1], 0.7, F[0], F[1], 0.4, glowV > 0.5 ? M.boneHot : M.bone, { part, paint: true });
        // Край перепонки тлеет у кончиков пальцев, как прогоревшая бумага.
        for (const F of [F1, F2, F3]) p.px(F[0], F[1], '#ff8a14');
        p.poly([W[0] - 1.5, W[1], W[0] + sgn * 0.5, W[1] - 3.5, W[0] + 1.5, W[1]], FLAME.core, { part: 'claw' });
      };
      wing(-1);
      wing(1);

      // Тело — комок тёмной шерсти, уши с тлеющими кончиками.
      p.ellipse(cx, 29 + by, 7.5, 9.5, M.fur);
      p.ellipse(cx, 31 + by, 4.5, 6, M.belly, { paint: true });
      p.limb(cx - 2.5, 37 + by, 1, cx - 3, 41 + by, 0.8, M.fur, { part: 'feet', tone: -0.2 });
      p.limb(cx + 2.5, 37 + by, 1, cx + 3, 41 + by, 0.8, M.fur, { part: 'feet', tone: -0.2 });
      p.poly([cx - 7, 16 + by, cx - 9, 3 + by, cx - 2, 12 + by], M.fur, { part: 'ear', bevel: 1.5 });
      p.poly([cx + 7, 16 + by, cx + 9, 3 + by, cx + 2, 12 + by], M.fur, { part: 'ear', bevel: 1.5 });
      p.poly([cx - 6.5, 14 + by, cx - 8, 6 + by, cx - 4, 12 + by], M.earIn, { part: 'ear', paint: true });
      p.poly([cx + 6.5, 14 + by, cx + 8, 6 + by, cx + 4, 12 + by], M.earIn, { part: 'ear', paint: true });
      p.ellipse(cx, 17.5 + by, 6.5, 5.5, M.fur, { part: 'head' });
      p.ellipse(cx - 0.5, 20.5 + by, 3.2, 2.2, M.belly, { part: 'head', lift: 1 });
      if (strike > 0.3 || hurt > 0.4) {
        p.block(cx - 2, 21.5 + by, 3, 1, '#2a0a0a');
        p.block(cx - 2.5, 22.5 + by, 1, 2, '#f2ead8');
        p.block(cx + 1.5, 22.5 + by, 1, 2, '#f2ead8');
        if (strike > 0.3) p.glow(cx, 23 + by, 4, '#ff9a2a', 0.4);
      } else {
        p.px(cx - 2, 22.5 + by, '#f2ead8');
        p.px(cx + 1.5, 22.5 + by, '#f2ead8');
      }
      const closed = hurt > 0.4 ? 1 : p.blink(0.5, 0.04);
      p.eye(cx - 3, 16.5 + by, 1.3, '#ffe066', { closed, glint: '#fffbe0' });
      p.eye(cx + 3, 16.5 + by, 1.3, '#ffe066', { closed, glint: '#fffbe0' });

      // Угли сыплются с крыльев и гаснут на лету.
      const n = hurt > 0.3 ? 6 : 3;
      for (let e = 0; e < n; e++) {
        const f = (p.t * 2 + e / n) % 1;
        const x = cx + (e % 2 ? 1 : -1) * (14 + e * 5) + 2 * Math.sin((f + e) * 6);
        const y = 36 + by + f * 22 - 8 * hurt;
        p.px(x, y, f < 0.5 ? '#ffc850' : '#c8401a');
      }
    });
  },
};

// ─── Лавовый слизень ────────────────────────────────────────────────────────

const LSLUG = {
  body: { base: '#f28a34', tex: { kind: 'noise', scale: 3, amp: 0.14 } } as Mat,
  crust: { base: '#3e2620', tex: { kind: 'noise', scale: 1.6, amp: 0.25 } } as Mat,
  hot: { base: '#ff8a14', glow: true, dither: 0, ramp: ['#e05a10', '#f06a10', '#ff7c14', '#ff8e18', '#ffa21e'] } as Mat,
  stalk: { base: '#c04e18', tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  eye: { base: '#fff2a8', glow: true, dither: 0, ramp: ['#f0c850', '#f8dc70', '#fff2a8', '#fff8d0', '#ffffff'] } as Mat,
  mouth: { base: '#4a1206', dither: 0 } as Mat,
};

export const lavaSlime: Model = {
  id: 'lava_slime',
  w: 100,
  h: 68,
  ground: 66,
  // Лавовый плевок в кадре контакта — на 24 единицы левее рамки.
  pad: 34,
  draw(p: Painter) {
    const M = LSLUG;
    const G = 66;
    // Лавовый плевок: замах — перед тела встаёт на дыбы, рожки назад; выпад — бросок вперёд, из пасти летит ком лавы.
    // Урон: сплющило, рожки втянулись и поникли, брызги лавы во все стороны.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const sq = 1 - 0.22 * hurt;
    // Тело дышит волной от головы к хвосту; остывшая корка плитами, в трещинах светится лава.
    const wv = (k: number): number => p.snap(1.2 * p.wave(2, k * 0.12));
    const rise = 6 * wind - 3 * strike;
    const fwd = -3 * wind - 8 * strike + 4 * hurt;

    p.pose({ dx: -2 * strike + 2 * hurt, px: 60, py: G }, () => {
      p.shadow(56, 44, 3, 0.5);
      // Горб слизня: голова, мантия, спина, хвост — одна поверхность; низ ровно на земле.
      const hx = 24 + fwd, hy = 48 - rise + wv(0);
      p.ellipse(hx, hy + 3 * hurt, 13, (G - hy) * sq, M.body);
      p.ellipse(42 + fwd * 0.45, 45 - rise * 0.4 + wv(1) + 6 * hurt, 18, (21 + rise * 0.4) * sq, M.body);
      p.ellipse(64, 52 + wv(2) + 4 * hurt, 18, 14 * sq, M.body);
      p.ellipse(84, 59 + wv(3) + 2 * hurt, 11, 7 * sq, M.body);
      p.limb(88, 62, 4, 97, 64.5, 1.5, M.body);
      // Низ светится: слизень ползёт по лаве.
      p.poly([12 + fwd, G - 3, 98, G - 1.5, 98, G, 12 + fwd, G], M.hot, { paint: true, bevel: 1 });
      p.glow(52, G, 12, '#ff8a14', 0.22);
      // Плиты корки по горбу: угловатые, с тёмными краями; между ними — огненные швы.
      const plate = (x: number, y: number, r: number, k: number, f: number): void => {
        const pts: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * 2 * Math.PI + k;
          const rr = r * (0.8 + 0.2 * Math.sin(k * 3 + i * 2.1));
          pts.push(x + rr * Math.cos(a) * 1.5, y + rr * Math.sin(a) * 1.05 * sq);
        }
        p.poly(pts.map((v, i) => (i % 2 ? v : v + f)), M.crust, { paint: true });
      };
      const lift = 6 * hurt;
      const plates: Array<[number, number, number, number, number]> = [
        // x, y, радиус, поворот, насколько плита едет с головой (0 — стоит с телом)
        [30, 36, 6.5, 1.1, 0.8], [43, 27, 8, 2.3, 0.45], [56, 32, 7.5, 0.7, 0.2], [67, 40, 6.5, 1.9, 0],
        [78, 48, 5, 2.8, 0], [87, 55, 3.5, 0.5, 0], [48, 40, 5, 0.2, 0.3], [61, 46, 4, 1.4, 0.1],
      ];
      plates.forEach(([x, y, r, k, f]) => plate(x + fwd * f, y - rise * f + wv(Math.round((1 - f) * 3)) + lift * (0.3 + 0.7 * f), r, k, 0));
      // Пузырь вздувается на горбу и лопается.
      if (p.clip === 'idle') {
        const b = p.t > 0.3 && p.t < 0.5 ? (p.t - 0.3) / 0.2 : -1;
        if (b >= 0 && b < 0.8) p.disc(46, 24 + wv(1) - b * 2, 1 + 2 * b, '#ffa21e');
        else if (b >= 0.8) for (const [ox, oy] of [[-3, -1], [3, -1], [0, -3]]) p.px(46 + ox, 21 + oy, '#ffc850');
      }

      // Рожки с глазами: дальний темнее; в замахе запрокинуты, от удара втянуты.
      const stalk = (x0: number, y0: number, len: number, a: number, part: string, tone: number, ph: number): void => {
        const aa = a + 18 * wind - 22 * strike + 35 * hurt + 5 * p.wave(1, ph);
        const L = len * (1 - 0.4 * hurt);
        const [mx, my] = at(x0, y0, aa + 10, L * 0.5);
        const [ex, ey] = at(mx, my, aa - 6, L * 0.5);
        p.chain([[x0, y0, 2.4], [mx, my, 1.5], [ex, ey, 1.3]], M.stalk, { part, tone });
        p.ellipse(ex, ey, 2.4, 2.4, M.eye, { part: `${part}Eye` });
        const shut = hurt > 0.4 || p.blink(0.8, 0.05) > 0.5;
        if (shut) p.line(ex - 2, ey, ex + 2, ey, '#6a2a0a');
        else p.px(ex - 1, ey + 0.5, '#3a1206');
      };
      stalk(hx + 7, hy - 9, 24, 285, 'stalkFar', -0.15, 0.4);
      stalk(hx + 1, hy - 10, 26, 265, 'stalk', 0, 0.1);

      // Пасть снизу спереди: в плевке раскрыта и светится.
      const open = 3 * strike + 2 * hurt;
      if (open > 1) {
        p.ellipse(hx - 10, hy + 8, 2.5, 1 + open * 0.6, M.mouth, { part: 'maw' });
        p.glow(hx - 11, hy + 8, 5, '#ffb428', 0.4 * strike);
      } else p.line(hx - 12, hy + 8, hx - 6, hy + 9, '#5a1a08');

      // Капли лавы стекают с боков.
      if (p.clip === 'idle') {
        for (const [x, y, ph] of [[36, 58, 0.1], [70, 60, 0.55]] as const) {
          const f = (p.t + ph) % 1;
          if (f < 0.5) p.px(x, y + f * 10, f < 0.3 ? '#ffb428' : '#e05a10');
        }
      }
      // Брызги от удара.
      if (hurt > 0.2) for (const [ox, oy] of [[-10, -12], [6, -16], [20, -10], [32, -14]]) p.disc(46 + ox * (1.5 - hurt), 34 + oy * hurt, 1.2, '#ffa21e');

      // Ком лавы летит к герою в кадрах 4–5.
      if (p.clip === 'attack' && p.u > 0.4 && p.u < 0.62) {
        const x = p.u < 0.5 ? 2 : -18;
        fireball(p, x, hy + 6, 4, 8);
      }
    });
  },
};

// ─── Саламандра ─────────────────────────────────────────────────────────────

const SALA = {
  skin: { base: '#d8702e', tex: { kind: 'spots', scale: 5, amp: 0.4, density: 0.3 } } as Mat,
  belly: { base: '#e8a85a', tex: { kind: 'stripes', scale: 2, amp: 0.1, angle: 1.57 } } as Mat,
  dark: { base: '#8a3a14' } as Mat,
  claw: { base: '#3a1a08', dither: 0 } as Mat,
  mouth: { base: '#5a1408', dither: 0 } as Mat,
  tongue: { base: '#e0506a', dither: 0 } as Mat,
};

export const salamander: Model = {
  id: 'salamander',
  w: 132,
  h: 70,
  ground: 68,
  // Струя огня в кадре контакта — на 40 единиц левее рамки.
  pad: 50,
  draw(p: Painter) {
    const M = SALA;
    const G = 68;
    // Огненное дыхание: замах — голова назад и вверх, горло разгорается; выпад — голова вперёд-вниз,
    // пасть раскрыта, из неё конус пламени. Урон: отбросило, голова вскинута, гребень огня прибит.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const breath = p.wave(3);
    const sway = p.wave(1, 0.2);
    const tongue = p.clip === 'idle' ? p.blink(0.45, 0.08) : 0;
    const crestK = 1 - 0.45 * hurt + 0.3 * wind;

    p.pose({ dx: -8 * strike + 3 * wind + 5 * hurt, rot: 0.04 * wind - 0.03 * strike + 0.05 * hurt, px: 90, py: G }, () => {
      p.shadow(72, 52, 3);
      const foot = (x: number, part: string, tone = 0): void => {
        p.ellipse(x, G - 1.8, 4.5, 1.8, M.skin, { part, tone, flat: 0.4 });
        for (let k = 0; k < 3; k++) p.px(x - 5 + k * 1.5, G - 0.5, '#3a1a08');
      };
      // Дальние лапы: локти наружу, как у ящерицы.
      p.chain([[48, 48, 5], [42, 56, 3.4], [40, 64, 2.6]], M.skin, { part: 'far', tone: -0.15 });
      foot(39, 'far', -0.15);
      p.chain([[88, 48, 6], [98, 55, 3.8], [96, 64, 2.8]], M.skin, { part: 'far', tone: -0.15 });
      foot(95, 'far', -0.15);

      // Хвост: толстый у основания, лежит волной, кончик в пламени.
      const tw = 3 * sway;
      const tail: Array<[number, number, number]> = [[92, 48, 9], [106, 54, 7], [117, 58 + tw * 0.3, 5], [125, 60 + tw * 0.6, 3.2], [130, 56 + tw, 1.8]];
      p.chain(tail, M.skin, { part: 'tail' });
      p.chain([[92, 53, 5], [106, 58, 3.6], [117, 61 + tw * 0.3, 2.4]], M.belly, { part: 'tail', paint: true });
      flame(p, 130, 56 + tw, 2.8, 8 + 2 * p.wave(4), 1.2 * p.wave(5, 0.3), 2, 'Tail');

      // Туловище: длинное, приземистое, светлое брюхо.
      p.ellipse(66, 46, 27, 11 + 0.6 * breath, M.skin, { rot: 0.02 });
      p.ellipse(46, 44, 12, 10.5, M.skin);
      p.ellipse(86, 47, 10, 9.5, M.skin);
      p.ellipse(64, 53, 24, 4.5, M.belly, { paint: true });

      // Огненный гребень по хребту: языки пламени пляшут, в замахе вздыблены.
      flameRow(p, [[36, 38], [45, 35], [54, 34], [63, 34], [72, 35], [81, 37], [90, 39], [98, 43]], [9, 11, 12, 11, 10, 8, 6].map((h) => h * crestK), 2 + 3 * hurt, (i) => 1.1 * p.wave(4, i * 0.19), 'Crest');

      // Ближние лапы.
      p.chain([[42, 50, 5.5], [34, 57, 3.6], [32, 64, 2.8]], M.skin, { part: 'near' });
      foot(30, 'near');
      p.chain([[82, 50, 6.5], [90, 58, 4], [88, 64, 3]], M.skin, { part: 'near' });
      foot(87, 'near');

      // Шея и голова: плоская голова ящерицы на поднятой шее; в замахе запрокинута, в дыхании — вперёд-вниз.
      const hx = p.snap(-7 * strike + 5 * wind + 2 * hurt), hy = p.snap(-4 * wind + 7 * strike - 3 * hurt);
      p.chain([[42, 42, 9], [33 + hx * 0.5, 32 + hy * 0.5, 7], [27 + hx, 25 + hy, 6]], M.skin, { part: 'neck' });
      p.chain([[40, 48, 5], [32 + hx * 0.5, 38 + hy * 0.5, 4.5], [26 + hx, 31 + hy, 4]], M.belly, { part: 'neck', paint: true });
      p.pose({ dx: hx, dy: hy, rot: 0.2 * wind - 0.12 * strike + 0.28 * hurt, px: 27, py: 25 }, () => {
        const open = 5 * strike + 3 * hurt;
        // Нижняя челюсть.
        p.poly([28, 27, 8, 26 + open * 0.8, 6, 28 + open, 26, 31], M.belly, { part: 'jaw', bevel: 1.2, tone: -0.1 });
        p.ellipse(22, 20, 11.5, 7, M.skin, { part: 'head', rot: 0.08 });
        p.ellipse(11, 23, 7.5, 4.5, M.skin, { part: 'head', rot: 0.12 });
        p.ellipse(18, 25, 10, 2.5, M.belly, { part: 'head', paint: true });
        // Гребень-корона на затылке — самый высокий огонь.
        flame(p, 26, 14, 2.4, (11 + 2 * p.wave(4, 0.6)) * crestK, 1.1 * p.wave(5, 0.1), 3 + 2 * hurt, 'Head');
        flame(p, 31, 16, 2, 8 * crestK, 0.9 * p.wave(4, 0.9), 3 + 2 * hurt, 'Head2');
        if (open > 1.5) {
          p.poly([7, 26, 26, 25.5, 25, 26.5 + open * 0.6, 8, 26 + open * 0.9], M.mouth, { part: 'maw', bevel: 0.6 });
          p.glow(10, 27, 5 + 3 * strike, '#ffb43c', 0.5 * strike);
        } else p.line(6, 25.5, 24, 26.5, '#4a1a08');
        if (tongue > 0) p.chain([[7, 26, 0.6], [2 - 2 * tongue, 27, 0.5], [-1 - 2 * tongue, 26, 0.4]], M.tongue, { part: 'tongue' });
        p.px(4.5, 22, '#4a1a08');
        // Горло разгорается перед выдохом.
        if (wind > 0.2) p.glow(22, 29, 4 + 4 * wind, '#ff9a2a', 0.45 * wind);
        p.eye(17, 17.5, 1.8, '#fff2a8', { closed: hurt > 0.4 ? 1 : p.blink(0.7), pupil: '#3a1206', glint: '#ffffff' });
        p.line(13, 15, 21, 15 + wind, '#6a2a0a');
        // Струя огня из пасти.
        if (strike > 0.3) {
          const L = 28 * strike;
          p.glow(-L * 0.5 + 6, 27, 10 + 6 * strike, '#ff9a2a', 0.35);
          p.poly([7, 25, -L, 19 - 4 * strike, -L - 4, 27, -L, 34 + 4 * strike, 7, 29], FLAME.outer, { part: 'breath', bevel: 3 });
          p.poly([6, 26, -L * 0.8, 23, -L * 0.8 - 2, 27.5, -L * 0.8, 31, 6, 28.5], FLAME.mid, { part: 'breathMid', bevel: 2 });
          p.poly([5, 26.8, -L * 0.45, 25.5, -L * 0.45, 29.5, 5, 28], FLAME.core, { part: 'breathCore', bevel: 1 });
        }
      });
    });
  },
};

// ─── Гончая ада ─────────────────────────────────────────────────────────────

const HOUND = {
  fur: { base: '#4a2426', shag: 0.12, tex: { kind: 'fur', scale: 2, amp: 0.2, stretch: 3 } } as Mat,
  back: { base: '#2e1618', shag: 0.12, tex: { kind: 'fur', scale: 2, amp: 0.2, stretch: 3 } } as Mat,
  bone: { base: '#8a7a6a', dither: 0 } as Mat,
  nose: { base: '#1a1012', shine: 1, dither: 0 } as Mat,
  fang: { base: '#ece0c8', dither: 0 } as Mat,
  maw: { base: '#ff6a1a', glow: true, dither: 0, ramp: ['#8a1a08', '#b8260a', '#e03a0e', '#f85414', '#ff7a1a'] } as Mat,
  claw: { base: '#1a1012', dither: 0 } as Mat,
};

export const hellhound: Model = {
  id: 'hellhound',
  w: 124,
  h: 86,
  ground: 84,
  // Бросок с пастью в кадре контакта — нос на 20 единиц левее рамки.
  pad: 30,
  draw(p: Painter) {
    const M = HOUND;
    const G = 84;
    // Укус: замах — присесть, морду к земле, огонь по хребту вздыблен; выпад — бросок вперёд, пасть с огнём.
    // Урон: отбросило, морда вверх в визге, пламя сбито, глаза погасли.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const breath = p.wave(4);
    const pant = (p.wave(4, 0.05) + 1) / 2;
    const tail = p.wave(1);
    const mane = 1 - 0.5 * hurt + 0.35 * wind;

    p.pose({ dx: -14 * strike + 4 * wind + 5 * hurt, rot: -0.05 * strike + 0.05 * wind + 0.07 * hurt, px: 94, py: G }, () => {
      p.shadow(68, 44, 3);
      const paw = (x: number, part: string, tone = 0, lift = 0, dx = 0): void => {
        p.ellipse(x + dx, G - 2 - lift, 3.8, 2, M.back, { part, tone });
        p.px(x + dx - 3.5, G - 1 - lift, '#1a1012');
        p.px(x + dx - 1.5, G - 0.5 - lift, '#1a1012');
      };
      // Дальние лапы: длинные, сухие, темнее.
      p.chain([[54, 50, 5], [56, 62, 3.2], [55, 74, 2.3], [54, 81, 2]], M.back, { part: 'far', tone: -0.1 });
      paw(53, 'far', -0.1);
      p.chain([[94, 46, 6.5], [100, 57, 4], [104, 68, 2.4], [100, 81, 2]], M.back, { part: 'far', tone: -0.1 });
      paw(99, 'far', -0.1);

      // Хвост-плеть с огнём на конце: задран в атаке, от удара поджат.
      const lift = 6 * (wind + strike) - 8 * hurt;
      const tx = 2 * tail;
      p.chain([[100, 38, 3.2], [108, 36 - lift * 0.3, 2.4], [114 + tx * 0.5, 30 - lift * 0.6, 1.8], [117 + tx, 24 - lift, 1.2]], M.fur, { part: 'tail' });
      flame(p, 117 + tx, 24 - lift, 2.2, 9 * mane, 1.2 * p.wave(4, 0.4), 2, 'Tail');

      // Туловище: глубокая узкая грудь, подтянутый живот, сухой круп; рёбра проступают.
      p.ellipse(56, 44, 14, 13 + 0.5 * breath, M.fur);
      p.ellipse(75, 40, 17, 6.5 + 0.4 * breath, M.fur, { rot: -0.05 });
      p.ellipse(93, 40, 10, 10, M.fur);
      p.ellipse(72, 34, 22, 4, M.back, { paint: true });
      for (let k = 0; k < 4; k++) p.line(56 + k * 4.5, 38 + k * 0.4, 53 + k * 4.5, 50 - k, '#1e0c0e');
      // Тлеющие трещины на бедре и лопатке.
      p.line(90, 36, 94, 42, '#c8401a');
      p.line(94, 42, 92, 46, '#c8401a');
      p.line(52, 40, 55, 44, '#a8300a');

      // Огненная грива по хребту: выше всего на загривке, языки клонятся назад, в замахе вздыблены.
      flameRow(p, [[42, 36], [50, 31], [58, 30], [66, 32], [74, 33], [82, 33], [90, 32], [97, 34]], [15, 14, 11, 9, 8, 8, 6].map((h) => h * mane), 3 + 4 * hurt + 2 * strike, (i) => 1.3 * p.wave(4, i * 0.23), 'Mane');

      // Ближние лапы: на выпаде передняя выброшена вперёд.
      const reach = 5 * strike;
      p.chain([[48, 48, 6.2], [50 - reach * 0.5, 61, 4], [47 - reach, 73 - reach * 0.6, 2.6], [46 - reach, 80 - reach * 0.6, 2.4]], M.fur, { part: 'near' });
      paw(44, 'near', 0, reach * 0.6, -reach);
      p.chain([[89, 44, 8], [93, 56, 4.8], [98, 67, 2.8], [94, 80, 2.4]], M.fur, { part: 'near' });
      paw(92, 'near');

      // Шея и голова: череп клином, длинная морда, уши торчком; оскал всегда, в укусе пасть горит.
      const hx = p.snap(-4 * strike + 2 * wind + hurt);
      const hy = p.snap(4 * wind + strike - 4 * hurt);
      p.limb(52, 38, 10, 36 + hx, 30 + hy, 8, M.fur);
      p.pose({ dx: hx, dy: hy, rot: -0.1 * strike + 0.12 * wind + 0.3 * hurt, px: 34, py: 30 }, () => {
        const back = 4 * hurt;
        p.poly([30, 22, 36 + back, 5 + back * 0.6, 40, 22], M.back, { part: 'earFar', bevel: 1.8, tone: -0.1 });
        const jaw = 1 + 1.5 * pant + 5 * strike + 3 * hurt;
        p.limb(24, 33.5, 3.4, 8, 34 + jaw, 2, M.fur, { part: 'jaw', tone: -0.15 });
        p.ellipse(29, 26, 9.5, 7.5, M.fur, { part: 'head' });
        p.limb(24, 28.5, 5.6, 6, 30.5, 3.4, M.fur, { part: 'head' });
        p.poly([23, 21, 29 + back, 2 + back * 0.7, 34, 20], M.fur, { part: 'head', bevel: 2 });
        p.ellipse(4.8, 30, 2.3, 2, M.nose, { part: 'head', lift: 3 });
        // Пасть: раскалённое нутро между челюстями, клыки сверху и снизу.
        if (jaw > 2.2) {
          p.poly([7, 32.5, 22, 32.5, 21, 33.5 + jaw * 0.6, 8, 33 + jaw * 0.9], M.maw, { part: 'maw', bevel: 0.8 });
          p.glow(10, 33 + jaw * 0.5, 4 + 3 * strike, '#ff8a14', 0.3 + 0.3 * strike);
        } else p.line(7, 32.5, 21, 33, '#ff6a1a');
        p.poly([8.5, 32, 10.5, 32, 9.6, 36], M.fang, { part: 'fang', bevel: 0.6 });
        p.poly([14, 32.5, 15.8, 32.5, 15, 35.5], M.fang, { part: 'fang', bevel: 0.6 });
        p.poly([11, 34 + jaw, 12.8, 34 + jaw, 12, 31 + jaw * 0.6], M.fang, { part: 'fang', bevel: 0.6 });
        // Глаз горит: самое яркое пятно головы; от удара гаснет.
        const shut = hurt > 0.4 ? 1 : p.blink(0.3);
        if (shut < 1) p.glow(21, 24.5, 4 + wind * 2, '#ff3b00', 0.4);
        p.eye(21, 24.5, 1.6, '#ff5a1a', { closed: shut, glint: '#ffd8a0', lid: '#1a0a0a' });
        p.line(17.5, 22.5, 25, 22 + wind, '#140a0c');
      });
    });
  },
};

// ─── Культист ───────────────────────────────────────────────────────────────

const CULT = {
  robe: { base: '#7a1a2a', tex: { kind: 'stripes', scale: 3, amp: 0.1, angle: 1.45 } } as Mat,
  hood: { base: '#5a1220', tex: { kind: 'noise', scale: 3, amp: 0.1 } } as Mat,
  shade: { base: '#1e0a10' } as Mat,
  skin: { base: '#d8a880', tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  rope: { base: '#8a7050', tex: { kind: 'stripes', scale: 1, amp: 0.2, angle: 0.8 } } as Mat,
  steel: { base: '#c0c0c8', shine: 1, dither: 0 } as Mat,
  hilt: { base: '#3a2418' } as Mat,
  gem: { base: '#ff5a2a', glow: true, dither: 0 } as Mat,
};

/**
 * Удар ритуальным кинжалом сверху: рука из покоя (кулак у пояса, клинок вверх) уходит назад-вверх,
 * через голову обрушивается вперёд-вниз и возвращается (угол 0 — покой, −2π — снова он).
 */
const STAB: Keys = [[0, -0.55], [0.14, -2.1], [0.3, -2.4], [0.43, -3.5], [0.57, -4.75], [0.72, -5.1], [0.86, -5.8], [1, -2 * Math.PI]];

export const cultist: Model = {
  id: 'cultist',
  w: 76,
  h: 112,
  ground: 110,
  // Кинжал в кадре контакта выброшен к герою, в замахе поднят над капюшоном.
  pad: 36,
  draw(p: Painter) {
    const M = CULT;
    const G = 110;
    // Ритуальный кинжал: замах — кинжал над головой, выпад — удар сверху вниз к герою, корпус подаётся за ним.
    // Урон: отбросило, капюшон откинуло назад, из тени виден раскрытый рот.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.2, 2);
    const hem = 1.5 * p.wave(1);
    // Шепчет молитву: губы шевелятся, амулет мерцает.
    const murmur = p.clip === 'idle' && p.wave(6) > 0.3;
    const pulse = (p.wave(2, 0.3) + 1) / 2;

    p.pose({ dx: -6 * strike + 2 * wind + 4 * hurt, rot: 0.04 * wind - 0.06 * strike + 0.05 * hurt, px: 38, py: G }, () => {
      p.shadow(38, 22, 3);
      // Дальний рукав, кисть сложена у груди.
      p.limb(46, 44 + up, 5, 50, 62 + up, 6, M.robe, { part: 'farArm', tone: -0.15 });
      p.ellipse(49, 66 + up, 2.6, 2.4, M.skin, { part: 'farArm', tone: -0.2 });

      // Балахон до земли с обтрёпанным подолом, стоит колоколом.
      p.poly([
        28, 42 + up, 48, 42 + up, 54, 70, 60 + hem, 98, 58 + hem, G, 52 + hem * 0.8, 106, 46 + hem * 0.6, G, 40 + hem * 0.4, 106,
        34 + hem * 0.3, G, 28 + hem * 0.2, 106, 22, G, 18, 98, 24, 70,
      ], M.robe, { bevel: 8 });
      // Верёвочный пояс с кистями.
      p.limb(24, 70, 1.6, 52, 70, 1.6, M.rope, { part: 'belt' });
      p.chain([[30, 71, 1.2], [29 + hem * 0.3, 80, 1], [30 + hem * 0.5, 88, 0.9]], M.rope, { part: 'belt' });

      // Капюшон с мантией на плечах: острый верх назад, лицо в тени, видны нос и подбородок.
      p.pose({ dx: p.snap(1.5 * hurt), rot: 0.16 * hurt - 0.04 * strike, px: 38, py: 42 + up }, () => {
        p.poly([22, 46 + up, 30, 36 + up, 48, 36 + up, 56, 48 + up, 48, 52 + up, 38, 50 + up, 28, 53 + up], M.hood, { part: 'mantle', bevel: 4 });
        p.ellipse(38, 26 + up, 13, 14, M.hood, { part: 'hood' });
        p.poly([40, 14 + up, 54 + hurt * 3, 8 + up + hurt * 4, 50, 24 + up], M.hood, { part: 'hood', bevel: 3 });
        // Проём капюшона: тень, в ней лицо.
        p.ellipse(31, 29 + up, 8, 10, M.shade, { part: 'hood', paint: true });
        p.ellipse(28.5, 34 + up, 4.5, 4.5, M.skin, { part: 'face', tone: -0.1 });
        p.limb(27, 27 + up, 1.6, 24, 31 + up, 1.6, M.skin, { part: 'face', tone: -0.2 });
        // Рот: шепчет, в ударе оскал, от удара раскрыт.
        if (hurt > 0.4 || strike > 0.4) p.block(25, 35 + up, 2, 2, '#1a0808');
        else if (murmur) p.block(25, 35.5 + up, 2, 1, '#2a0e0e');
        else p.line(25, 35.5 + up, 27.5, 35.5 + up, '#3a1a14');
        // Глаза блестят из тени.
        if (hurt < 0.4 && !p.blink(0.55, 0.05)) {
          p.px(26, 27 + up, '#e8c8a0');
          p.px(30, 27 + up, '#b89878');
        }
      });

      // Амулет-знак на груди тлеет в такт молитве.
      p.line(32, 44 + up, 36, 52 + up, '#8a7050');
      p.line(42, 44 + up, 38, 52 + up, '#8a7050');
      p.glow(37, 55 + up, 3 + 2 * pulse, '#ff5a2a', 0.25 + 0.2 * pulse);
      p.poly([37, 52 + up, 40, 55 + up, 37, 58 + up, 34, 55 + up], M.gem, { part: 'amulet', bevel: 1 });

      // Ближняя рука с ритуальным кинжалом: в покое клинок вверх у груди, в ударе рука идёт дугой через голову.
      p.pose({ rot: arc(p, STAB) - 0.3 * hurt, px: 30, py: 46 + up }, () => {
        p.limb(30, 46 + up, 5.2, 24, 58 + up, 5.6, M.robe, { part: 'nearArm' });
        p.poly([18, 55 + up, 27, 54 + up, 29, 66 + up, 21, 66 + up], M.robe, { part: 'nearArm', bevel: 2, tone: -0.1 });
        // Волнистый клинок-крис и рукоять с навершием.
        const wig = 0.8;
        p.poly([19, 60 + up, 21.5, 60 + up, 22 + wig, 55 + up, 20.5 - wig, 51 + up, 22 + wig, 47 + up, 20.2, 42 + up, 18.5 - wig, 47 + up, 19.5 + wig, 51 + up, 18 - wig, 55 + up], M.steel, { part: 'blade', bevel: 0.8 });
        p.limb(16, 61 + up, 1, 24, 61 + up, 1, M.hilt, { part: 'guard' });
        p.limb(20.2, 62 + up, 1.2, 20.2, 67 + up, 1.2, M.hilt, { part: 'grip' });
        p.ellipse(20.2, 64.5 + up, 3.2, 3, M.skin, { part: 'fist' });
        // Блик бежит по клинку в начале цикла, но не в первом кадре.
        const g = p.clip === 'idle' && p.t > 0.05 && p.t < 0.3 ? (p.t - 0.05) / 0.25 : -1;
        if (g >= 0) p.px(20.3, 58 + up - 15 * g, '#ffffff');
      });
    });
  },
};

// ─── Огненный жрец ──────────────────────────────────────────────────────────

const PRIEST = {
  robe: { base: '#7a1a2a', tex: { kind: 'stripes', scale: 3, amp: 0.1, angle: 1.45 } } as Mat,
  under: { base: '#3a0a14' } as Mat,
  gold: { base: '#b8860b', shine: 0.7, tex: { kind: 'noise', scale: 2, amp: 0.12 } } as Mat,
  trim: { base: '#d8a830', dither: 0 } as Mat,
  skin: { base: '#d8a880', tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  beard: { base: '#a8a098', shag: 0.3, tex: { kind: 'fur', scale: 1.4, amp: 0.2, stretch: 2, angle: 1.4 } } as Mat,
  brass: { base: '#a07a2a', shine: 0.8, dither: 0 } as Mat,
  coal: { base: '#2a1a14' } as Mat,
};

export const firePriest: Model = {
  id: 'fire_priest',
  w: 84,
  h: 120,
  ground: 118,
  // Посох с жаровней в кадре контакта выброшен вперёд, язык пламени — на 26 единиц за рамкой.
  pad: 36,
  draw(p: Painter) {
    const M = PRIEST;
    const G = 118;
    // Пламя: замах — посох вскинут, огонь в жаровне взвивается; выпад — посох к герою, из жаровни бьёт пламя.
    // Урон: отбросило, клобук набок, огонь сбит, глаза зажмурены.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.2, 2);
    const hem = 1.4 * p.wave(1, 0.2);
    const fl = p.wave(4, 0.1), fl2 = p.wave(5, 0.6);

    p.pose({ dx: -4 * strike + 4 * hurt, rot: 0.03 * wind - 0.04 * strike + 0.05 * hurt, px: 42, py: G }, () => {
      p.shadow(42, 24, 3);
      // Дальний рукав: ладонь поднята в благословении.
      const bless = p.blink(0.5, 0.2) * (1 - wind - strike);
      p.chain([[52, 48 + up, 5], [58, 58 + up - 4 * bless, 5.5], [58, 52 + up - 10 * bless, 3]], M.robe, { part: 'farArm', tone: -0.15 });
      p.ellipse(58, 50 + up - 10 * bless, 2.6, 3, M.skin, { part: 'farArm', tone: -0.2 });

      // Ряса до земли: багровая, с золотой каймой по полам и подолу.
      p.poly([30, 44 + up, 54, 44 + up, 60, 74, 64 + hem, 104, 62 + hem, G, 22 + hem * 0.3, G, 20, 104, 26, 74], M.robe, { bevel: 8 });
      // Золотая епитрахиль от ворота до подола с огненной вышивкой.
      p.poly([38, 46 + up, 46, 46 + up, 47 + hem * 0.3, G, 37 + hem * 0.2, G], M.gold, { paint: true });
      for (let k = 0; k < 4; k++) p.poly([42, 78 + k * 10, 44, 82 + k * 10, 42, 86 + k * 10, 40, 82 + k * 10], M.under, { paint: true });
      p.line(21 + hem * 0.3, G - 2, 63 + hem, G - 2, '#d8a830');
      // Золотой пояс и солнце-огонь на груди.
      p.poly([28, 66, 56, 66, 56, 71, 28, 71], M.gold, { paint: true });
      p.glow(42, 54 + up, 4, '#ff8a14', 0.3);
      p.disc(42, 54 + up, 2.2, '#d8a830');
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * 2 * Math.PI + p.t * Math.PI;
        p.px(42 + 4.2 * Math.cos(a), 54 + up + 4.2 * Math.sin(a), '#d8a830');
      }

      // Голова: высокий золотой клобук, седая борода, глаза отражают огонь.
      p.pose({ dx: p.snap(hurt), rot: 0.12 * hurt, px: 40, py: 44 + up }, () => {
        p.ellipse(38, 32 + up, 8, 9, M.skin, { part: 'head' });
        p.poly([30, 34 + up, 38, 35 + up, 44, 33 + up, 44, 44 + up, 38, 50 + up, 32, 44 + up], M.beard, { part: 'beard', bevel: 3 });
        p.limb(32, 30 + up, 1.8, 29, 34 + up, 1.7, M.skin, { part: 'nose', lift: 3 });
        if (strike > 0.4 || hurt > 0.4) p.block(32, 37 + up, 2, 2, '#2a0e0e');
        // Клобук: высокий колпак с загнутым вперёд верхом, золото с огненной вышивкой.
        p.pose({ rot: 0.2 * hurt, px: 40, py: 26 + up }, () => {
          p.poly([28, 28 + up, 48, 28 + up, 46, 12 + up, 40, 3 + up, 34, 6 + up, 30, 14 + up], M.gold, { part: 'mitre', bevel: 3 });
          p.poly([28, 26 + up, 48, 26 + up, 48, 29 + up, 28, 29 + up], M.trim, { part: 'mitre', paint: true });
          p.poly([36, 25 + up, 38.5, 16 + up, 40, 20 + up, 42, 14 + up, 43, 25 + up], M.under, { part: 'mitre', paint: true });
        });
        const shut = hurt > 0.4 ? 1 : p.blink(0.35);
        p.eye(33, 31 + up, 1.2, '#ffc850', { closed: shut, glint: '#fff4c0' });
        p.line(30, 28.5 + up, 35, 29 + up + wind, '#6a5a50');
      });

      // Посох с жаровней: в атаке ходит вокруг кисти; огонь пляшет, искры поднимаются.
      p.pose({ dy: -5 * wind, rot: 0.14 * wind - 0.5 * strike + 0.12 * hurt, px: 20, py: 60 + up }, () => {
        const Y = 30;
        p.chain([[21, G, 1.4], [20, 60, 1.6], [20, Y + 6, 1.7]], M.brass, { part: 'staff' });
        // Чаша жаровни на ножке.
        p.poly([12, Y, 28, Y, 25, Y + 6, 15, Y + 6], M.brass, { part: 'bowl', bevel: 1.5 });
        p.ellipse(20, Y, 8, 1.8, M.coal, { part: 'bowl', lift: 1 });
        p.limb(20, Y + 6, 1.2, 20, Y + 10, 1.2, M.brass, { part: 'bowl' });
        const big = 1 + 0.5 * wind + 0.3 * strike - 0.5 * hurt;
        p.glow(20, Y - 8, 9 + 2 * fl + 5 * wind, '#ff8a14', 0.3 + 0.2 * wind);
        flame(p, 17, Y, 4, (14 + 2 * fl) * big, 1.4 * fl2, 2 * hurt, 'B1');
        flame(p, 23.5, Y, 3.4, (10 + 2 * fl2) * big, 1.2 * fl, 1 + 2 * hurt, 'B2');
        // Искры над огнём.
        for (let k = 0; k < 3; k++) {
          const f = (p.t * 2 + k / 3) % 1;
          p.px(20 + 4 * Math.sin((f + k) * 7), Y - 14 - f * 12, f < 0.5 ? '#ffd23a' : '#e03a0e');
        }
        if (strike > 0.5) {
          p.glow(8, Y - 6, 12, '#ffb428', 0.5);
          p.disc(16, Y - 4, 3.5, '#ffec90');
        }
      });

      // Ближний рукав, кисть на посохе.
      p.limb(34, 48 + up, 5.2, 24, 58 + up, 6.2, M.robe, { part: 'nearArm' });
      p.poly([18, 54 + up, 27, 52 + up, 29, 66 + up, 20, 66 + up], M.robe, { part: 'nearArm', bevel: 2, tone: -0.1 });
      p.line(20, 66 + up, 29, 66 + up, '#d8a830');
      p.ellipse(20, 60 + up, 3, 3, M.skin, { part: 'hand' });
    });
  },
};

// ─── Демон-мучитель ─────────────────────────────────────────────────────────

const TORM = {
  skin: { base: '#9a2a36', tex: { kind: 'noise', scale: 3, amp: 0.12 } } as Mat,
  dark: { base: '#6a1a24' } as Mat,
  fur: { base: '#5e2c2a', shag: 0.3, tex: { kind: 'fur', scale: 2, amp: 0.22, stretch: 2.5, angle: 1.4 } } as Mat,
  horn: { base: '#3a1c1c', tex: { kind: 'stripes', scale: 2, amp: 0.25, angle: 0.4 } } as Mat,
  hornTip: { base: '#b8a898', dither: 0 } as Mat,
  hoof: { base: '#1e1214', dither: 0 } as Mat,
  leather: { base: '#3a1a1e', tex: { kind: 'noise', scale: 2, amp: 0.14 } } as Mat,
  iron: { base: '#8a8a90', shine: 0.8, dither: 0 } as Mat,
  whip: { base: '#3a2420', tex: { kind: 'stripes', scale: 1.2, amp: 0.2, angle: 0.8 } } as Mat,
  barb: { base: '#e0e0e0', shine: 0.6, dither: 0 } as Mat,
  mouth: { base: '#2a0608', dither: 0 } as Mat,
};

/** Плеть: точки относительно кулака — лежит петлёй на полу (покой), закинута за плечо (замах), вытянута к герою (удар). */
const WHIP_REST: Array<[number, number]> = [[0, 0], [-1, 9], [-3, 18], [-6, 27], [-11, 34], [-18, 38], [-26, 39], [-33, 37]];
const WHIP_WIND: Array<[number, number]> = [[0, 0], [5, -3], [11, -4], [17, -2], [22, 3], [26, 10], [28, 18], [28, 26]];
const WHIP_HIT: Array<[number, number]> = [[0, 0], [-8, 1], [-16, 2], [-24, 4], [-32, 6], [-40, 8], [-47, 11], [-53, 15]];
/** Рука с плетью: плечо и предплечье по ходу клипа, градусы. */
const WHIP_UPPER: Keys = [[0, 120], [0.14, 240], [0.3, 250], [0.43, 210], [0.57, 165], [0.72, 130], [0.86, 118], [1, 115]];
const WHIP_FORE: Keys = [[0, 140], [0.14, 280], [0.3, 292], [0.43, 225], [0.57, 170], [0.72, 140], [0.86, 128], [1, 125]];

export const tormentor: Model = {
  id: 'tormentor',
  w: 110,
  h: 140,
  ground: 138,
  // Плеть в кадре контакта вытянута к герою на 50 единиц левее рамки.
  pad: 62,
  draw(p: Painter) {
    const M = TORM;
    const G = 138;
    // Плеть: замах — рука над головой, плеть закинута за плечо; удар — хлёст к герою, корпус подаётся вперёд.
    // Урон: отбросило, голову запрокинуло, пасть раскрыта, хвост дёрнулся.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.5, 2);
    const breath = p.wave(2);
    const tail = p.wave(1, 0.4);
    // Плеть лениво подрагивает на полу: кончик ползёт, как живой.
    const creep = p.wave(1, 0.1) * (1 - wind - strike);

    p.pose({ dx: -6 * strike + 2 * wind + 5 * hurt, rot: 0.04 * wind - 0.05 * strike + 0.06 * hurt, px: 58, py: G }, () => {
      p.shadow(58, 30, 3.5);
      // Козлиные ноги: бедро вперёд, голень назад, копыто.
      const leg = (x: number, part: string, tone: number): void => {
        p.chain([[x, 94, 8], [x - 9, 110, 6], [x + 1, 125, 4], [x - 3, G - 4, 3.4]], M.fur, { part, tone });
        p.poly([x - 9, G - 5, x + 1, G - 6, x + 2, G, x - 10, G], M.hoof, { part: `${part}Hoof`, tone, bevel: 1.5 });
      };
      leg(70, 'far', -0.15);

      // Хвост со стрелкой: хлещет за спиной.
      const tx = 3 * tail + 6 * hurt;
      p.chain([[76, 92, 3.5], [88, 100, 2.8], [98, 96 + tx * 0.3, 2.2], [104 + tx * 0.5, 84 + tx * 0.5, 1.6], [102 + tx, 74 + tx * 0.6, 1.2]], M.skin, { part: 'tail', tone: -0.1 });
      p.poly([102 + tx, 68 + tx * 0.6, 107 + tx, 75 + tx * 0.6, 97 + tx, 76 + tx * 0.6], M.dark, { part: 'tailTip', bevel: 1 });

      // Дальняя рука висит: когти, на запястье — кандалы с обрывком цепи.
      p.chain([[74, 50 + up, 9], [82, 70 + up, 7], [84, 86 + up, 6]], M.skin, { part: 'farArm', tone: -0.15 });
      p.ellipse(84, 91 + up, 6, 5.5, M.skin, { part: 'farArm', tone: -0.15 });
      p.limb(80, 82 + up, 3, 88, 82 + up, 3, M.iron, { part: 'cuff', tone: -0.15 });
      p.chain([[86, 84 + up, 1.1], [88, 92 + up, 1], [87, 100 + up + creep, 1]], M.iron, { part: 'chain', tone: -0.2 });

      leg(54, 'near', 0);

      // Торс: горбатая мощная спина, широкие плечи, узкая талия; ремни крест-накрест, кожаные полы с заклёпками.
      p.ellipse(60, 86, 12, 10, M.skin);
      p.ellipse(60, 62 + up, 21, 18 + breath * 0.8, M.skin);
      p.ellipse(70, 45 + up, 17, 11, M.skin, { rot: -0.3 });
      p.ellipse(50, 60 + up, 9, 7, M.skin, { lift: 3 });
      p.ellipse(56, 76 + up * 0.5, 8, 7, M.dark, { paint: true });
      p.line(52, 72 + up * 0.5, 60, 72 + up * 0.5, '#5a1420');
      p.line(52, 78 + up * 0.5, 60, 78 + up * 0.5, '#5a1420');
      p.poly([40, 50 + up, 46, 46 + up, 76, 86, 70, 88], M.leather, { paint: true });
      p.poly([74, 46 + up, 80, 50 + up, 52, 88, 46, 84], M.leather, { paint: true });
      p.poly([44, 86, 76, 86, 76, 93, 44, 93], M.leather, { part: 'belt', bevel: 1.5 });
      p.ellipse(60, 89.5, 3, 3, M.iron, { part: 'buckle' });
      // Кожаные полы: передняя и задняя, между ними видны ноги.
      p.poly([46, 92, 58, 92, 57 + creep * 0.5, 116, 52, 119, 46 + creep * 0.4, 115], M.leather, { part: 'flap', bevel: 2 });
      p.poly([64, 92, 76, 92, 78 + creep * 0.3, 112, 72, 114, 66, 110], M.leather, { part: 'flapFar', bevel: 2, tone: -0.15 });
      for (const [x, y] of [[50, 98], [54, 106], [50, 112], [70, 98]]) p.px(x, y, '#a8a8b0');
      // Крюки на поясе.
      p.chain([[76, 94, 1], [78, 100, 1], [76, 104, 0.9], [73, 102, 0.8]], M.iron, { part: 'hook' });

      // Голова вжата в плечи и выдвинута вперёд: рога дугой, острое ухо, пасть с клыками, глаза горят.
      p.pose({ dx: p.snap(-2 * strike + 2 * hurt), dy: up, rot: 0.06 * wind - 0.05 * strike + 0.22 * hurt, px: 44, py: 42 }, () => {
        // Дальний рог.
        p.chain([[48, 22, 4], [58, 14, 3.2], [64, 6, 2.2], [62, 1, 1]], M.horn, { part: 'hornFar', tone: -0.15 });
        p.poly([60, 8, 65, 5, 62, 0.5], M.hornTip, { part: 'hornFar', paint: true });
        p.poly([46, 30, 60 + 2 * hurt, 26 + 3 * hurt, 48, 36], M.skin, { part: 'ear', bevel: 1.5, tone: -0.1 });
        const open = 2 * wind + 3 * strike + 4 * hurt;
        p.ellipse(34, 42 + open * 0.6, 9, 5.5, M.skin, { part: 'jaw', tone: -0.1 });
        p.ellipse(40, 30, 13, 12, M.skin, { part: 'head' });
        p.ellipse(30, 35, 9, 7, M.skin, { part: 'head' });
        p.ellipse(33, 25, 9, 3.2, M.dark, { part: 'head', paint: true });
        // Ближний рог: толстый, загибается вверх и назад.
        p.chain([[40, 21, 4.5], [34, 12, 3.6], [36, 4, 2.4], [42, 1, 1.2]], M.horn, { part: 'horn' });
        p.poly([34, 6, 38, 1, 43, 1.5, 37, 5], M.hornTip, { part: 'horn', paint: true });
        if (open > 1.5) {
          p.poly([25, 38, 38, 38, 37, 39 + open, 26, 39 + open * 0.8], M.mouth, { part: 'maw', bevel: 0.6 });
          p.poly([27, 38, 29, 38, 28, 41], M.hornTip, { part: 'fang' });
          p.poly([33, 38, 35, 38, 34, 41], M.hornTip, { part: 'fang' });
        } else {
          p.line(25, 38.5, 38, 39, '#2a0608');
          p.px(27, 39.5, '#e8e0d0');
          p.px(34, 39.5, '#e8e0d0');
        }
        const shut = hurt > 0.4 ? 1 : p.blink(0.62);
        if (shut < 1) p.glow(31, 29, 3.5 + 2 * wind, '#ffc830', 0.4);
        p.eye(31, 29, 1.7, '#ffd23a', { closed: shut, glint: '#fffbe0', lid: '#2a0608' });
        p.line(26, 25.5, 36, 27 + 1.5 * wind, '#2a0608');
      });

      // Ближняя рука с плетью: в покое плеть петлёй на полу, в ударе хлещет к герою.
      const a1 = ang(p, WHIP_UPPER, 115) - 20 * hurt;
      const a2 = ang(p, WHIP_FORE, 125) - 25 * hurt;
      const { ex, ey, hx, hy } = limb2(44, 52 + up, a1, 18, a2, 17);
      const pts = WHIP_REST.map((r, k) => {
        const [mx, my] = mixPt(r, WHIP_WIND[k], WHIP_HIT[k], wind, strike);
        const f = k / (WHIP_REST.length - 1);
        // В покое кончик лежит на полу: плеть под кулаком опирается на землю.
        const floor = G - 2 - (hy + my);
        const dy = wind + strike < 0.05 && floor < 0 ? floor : 0;
        return [hx + mx + 2 * creep * f * f + 10 * hurt * f, hy + my + dy - 6 * hurt * f, 1.8 - 0.9 * f] as [number, number, number];
      });
      p.chain(pts, M.whip, { part: 'whip' });
      // Стальные крючья по плети и на конце.
      for (const k of [3, 5, 7]) p.poly([pts[k][0] - 1.5, pts[k][1] + 1, pts[k][0], pts[k][1] - 2.5, pts[k][0] + 1.5, pts[k][1] + 1], M.barb, { part: 'barb' });
      p.limb(44, 52 + up, 9, ex, ey, 7.5, M.skin, { part: 'nearArm' });
      p.limb(ex, ey, 7, hx, hy, 5.5, M.skin, { part: 'nearArm' });
      p.limb(ex - 1, ey + 2, 6.5, (ex + hx) / 2, (ey + hy) / 2, 6, M.leather, { part: 'bracer' });
      p.ellipse(hx, hy, 5.8, 5.4, M.skin, { part: 'fist' });
      p.limb(hx, hy - 4, 2, hx, hy + 3, 2, M.leather, { part: 'grip' });
    });
  },
};

// ─── Каменный голем ─────────────────────────────────────────────────────────

const GOLEM = {
  stone: { base: '#6e6a68', tex: { kind: 'noise', scale: 4, amp: 0.2 } } as Mat,
  dark: { base: '#4e4a48', tex: { kind: 'noise', scale: 3, amp: 0.2 } } as Mat,
  moss: { base: '#4a4640', tex: { kind: 'noise', scale: 1.5, amp: 0.3 } } as Mat,
  magma: { base: '#ff8a14', glow: true, dither: 0, ramp: ['#c83c0c', '#e0520e', '#f06a10', '#ff8414', '#ffa21e'] } as Mat,
};

/**
 * Удар кулаком сверху: каменная рука из покоя (кулак у земли) уходит назад за спину, через верх обрушивается
 * вперёд и бьёт в землю чуть впереди места, где лежала (угол 0 — покой, −2π — снова он).
 */
const POUND: Keys = [[0, -0.5], [0.14, -2.2], [0.3, -2.5], [0.43, -4.1], [0.57, -6.08], [0.72, -6.08], [0.86, -6.2], [1, -2 * Math.PI]];

const golemBase: Model = {
  id: 'golem',
  w: 150,
  h: 152,
  ground: 150,
  // Кулак над головой в замахе поднимается выше плеч на длину руки.
  pad: 56,
  draw(p: Painter) {
    const M = GOLEM;
    const G = 150;
    // Кулак: замах — рука из-за спины через голову, выпад — кулак в землю, осколки и пыль.
    // Урон: откололись камешки, голову откинуло, огонь в швах вспыхнул и погас.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const breath = p.wave(1);
    const up = -p.bob(1.5, 1);
    // Лава в швах пульсирует; раз за цикл с плеча срывается камешек.
    const heat = (p.wave(2, 0.3) + 1) / 2;
    const pebble = p.clip === 'idle' && p.t > 0.6 && p.t < 0.85 ? (p.t - 0.6) / 0.25 : -1;
    const seam = (x1: number, y1: number, x2: number, y2: number, x3?: number, y3?: number): void => {
      const c = hurt > 0.3 ? '#ffe060' : heat > 0.5 ? '#ffa21e' : '#f06a10';
      p.line(x1, y1, x2, y2, c);
      if (x3 !== undefined && y3 !== undefined) p.line(x2, y2, x3, y3, c);
    };

    p.pose({ dx: -5 * strike + 2 * wind + 4 * hurt, rot: 0.03 * wind - 0.04 * strike + 0.04 * hurt, px: 76, py: G }, () => {
      p.shadow(76, 50, 4.5);
      // Ноги — короткие столбы из глыб.
      p.chain([[90, 112, 14], [94, 132, 13], [93, 142, 12]], M.dark, { part: 'far', tone: -0.12 });
      p.ellipse(92, G - 5, 16, 6, M.dark, { part: 'farFoot', tone: -0.12, flat: 0.3 });
      p.chain([[60, 112, 15], [56, 132, 14], [56, 142, 13]], M.stone, { part: 'near' });
      p.ellipse(54, G - 5, 17, 6, M.stone, { part: 'nearFoot', flat: 0.3 });

      // Дальняя рука висит до земли, кулак-валун.
      p.chain([[106, 50 + up, 14], [114, 80 + up, 12], [116, 104 + up, 11]], M.dark, { part: 'farArm', tone: -0.12 });
      p.ellipse(116, 120 + up, 15, 14, M.dark, { part: 'farFist', tone: -0.12 });

      // Туловище — огромный валун, таз — плита, плечи — глыбы; в швах светится лава.
      p.ellipse(74, 108, 26, 13, M.dark, { part: 'pelvis' });
      p.ellipse(76, 74 + up, 38, 32 + breath, M.stone, { part: 'chest' });
      p.ellipse(60, 56 + up, 22, 16, M.stone, { part: 'chest', lift: 4 });
      p.ellipse(100, 42 + up, 18, 15, M.dark, { part: 'shoulderFar', tone: -0.05 });
      p.ellipse(70, 60 + up, 6, 4, M.moss, { part: 'chest', paint: true });
      seam(62, 70 + up, 72, 80 + up, 70, 94 + up);
      seam(84, 60 + up, 90, 72 + up, 100, 76 + up);
      seam(56, 88 + up, 64, 96 + up);
      // Сердце-горнило в груди: светится сквозь трещину.
      p.glow(78, 82 + up, 6 + 3 * heat, '#ff8a14', 0.3 + 0.2 * heat);
      p.poly([74, 78 + up, 80, 76 + up, 83, 84 + up, 76, 88 + up], M.magma, { part: 'core', bevel: 1.5 });

      // Голова — глыба, вросшая между плеч и выдвинутая вперёд: тяжёлый лоб, глаза-угли, рот-трещина.
      p.pose({ dx: p.snap(-3 * strike + 2 * hurt), dy: up + p.snap(-2 * wind - 2 * hurt), rot: 0.05 * wind - 0.04 * strike + 0.14 * hurt, px: 48, py: 50 }, () => {
        p.ellipse(44, 40, 15, 13, M.stone, { part: 'head' });
        p.ellipse(40, 32, 14, 5, M.dark, { part: 'head', lift: 6 });
        p.ellipse(36, 48, 10, 6, M.stone, { part: 'head', lift: 2 });
        const glow = hurt > 0.4 ? 0.1 : 0.45 + 0.2 * heat + 0.3 * wind;
        p.glow(34, 38, 5, '#ff9f1c', glow);
        p.glow(44, 38, 4, '#ff9f1c', glow * 0.8);
        if (hurt > 0.4) {
          p.line(31, 38, 36, 38, '#3a2a20');
          p.line(41, 38, 45, 38, '#3a2a20');
        } else {
          p.block(32, 37, 2, 1 + (p.blink(0.4, 0.05) ? 0 : 1), '#ffb428');
          p.block(42, 37, 2, 1 + (p.blink(0.4, 0.05) ? 0 : 1), '#ff9f1c');
        }
        const open = 2 * strike + 3 * hurt + wind;
        p.line(29, 48, 42, 49 + open * 0.3, open > 1 ? '#ffb428' : '#f06a10');
        if (open > 1.5) p.line(30, 49, 41, 50 + open * 0.6, '#ff8a14');
      });

      // Ближнее плечо и рука: кулак-валун у земли; в ударе рука дугой через голову бьёт в землю.
      p.ellipse(48, 48 + up, 19, 16, M.stone, { part: 'shoulder' });
      seam(40, 44 + up, 50, 50 + up, 56, 46 + up);
      const phi = arc(p, POUND);
      p.pose({ rot: phi - 0.15 * hurt, px: 46, py: 54 + up }, () => {
        p.chain([[46, 54 + up, 13], [38, 84 + up, 11]], M.stone, { part: 'upper' });
        p.chain([[38, 86 + up, 11], [34, 110 + up, 10]], M.stone, { part: 'fore' });
        seam(36, 94 + up, 40, 102 + up);
        p.ellipse(32, 124 + up, 17, 16, M.stone, { part: 'fist' });
        p.ellipse(26, 118 + up, 8, 7, M.dark, { part: 'fist', lift: 3, tone: -0.1 });
        seam(24, 124 + up, 34, 130 + up);
      });
      // Пыль и осколки из-под кулака в кадрах удара о землю.
      if (strike > 0.6) {
        const c = Math.cos(phi), sn = Math.sin(phi);
        const dx = 32 - 46, dy = 138 - (54 + up);
        const cx = 46 + dx * c - dy * sn;
        for (const [ox, r] of [[-16, 4], [-6, 5], [8, 4.5], [18, 3]]) p.disc(cx + ox * strike, G - 3 - r * 0.4, r * strike, '#8a7a6ab0', true);
        for (const [ox, oy] of [[-12, -14], [4, -18], [14, -10]]) p.block(cx + ox, G - 6 + oy * strike, 2, 2, '#6a6560');
      }
      // Камешки от удара.
      if (hurt > 0.2) for (const [ox, oy] of [[-4, -20], [10, -26], [24, -16]]) p.block(60 + ox * (1.6 - hurt), 50 + oy * hurt, 2, 2, '#8a8580');
      if (pebble >= 0) p.block(64, 44 + pebble * (G - 48), 1, 1, '#8a8580');
    });
  },
};

// ─── Огненный элементаль ────────────────────────────────────────────────────

const ELEM = {
  /** Тёмно-красная кромка пламени: даёт фигуре силуэт на светлом огне пещеры. */
  edge: { base: '#a8200a', glow: true, dither: 0, ramp: ['#701004', '#861406', '#9a1a08', '#ae200a', '#c0260a'] } as Mat,
  rock: { base: '#3a2a26', tex: { kind: 'noise', scale: 2, amp: 0.25 } } as Mat,
  socket: { base: '#6a1a08', glow: true, dither: 0, ramp: ['#4a0e04', '#5a1206', '#6a1608', '#7a1a08', '#8a1e0a'] } as Mat,
};

export const fireElemental: Model = {
  id: 'fire_elemental',
  w: 120,
  h: 152,
  ground: 150,
  // Огненный шар в кадре контакта — на 30 единиц левее рамки, в замахе — над головой.
  pad: 44,
  draw(p: Painter) {
    const M = ELEM;
    const G = 150;
    // Пламя: замах — руки вскинуты, над головой собирается огненный шар; выпад — шар брошен к герою, рука вперёд.
    // Урон: пламя прибило и сплющило, искры во все стороны, глаза зажмурены.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const sq = 1 - 0.18 * hurt;
    const f1 = p.wave(4, 0.1), f2 = p.wave(3, 0.45), f3 = p.wave(5, 0.7), f4 = p.wave(4, 0.8);
    const sway = p.wave(1, 0.2);
    const bob = p.bob(1.5, 2);
    // Точка от земли вверх с приплюснутостью урона: элементаль сжимается к полу, а не отрывается от него.
    const Y = (y: number): number => G - (G - y) * sq + bob * (1 - (y - 40) / 110);

    p.pose({ dx: -5 * strike + 3 * wind + 5 * hurt, rot: 0.04 * wind - 0.05 * strike + 0.06 * hurt, px: 62, py: G }, () => {
      // Отсвет на полу и лужа огня у основания.
      p.glow(62, G - 2, 30, '#ff8a14', 0.2);
      p.ellipse(62, G - 2.5, 24, 2.5, M.edge, { part: 'pool' });
      p.ellipse(62, G - 2.5, 15, 1.6, FLAME.mid, { part: 'poolMid', noLine: true });
      for (let k = 0; k < 5; k++) flame(p, 44 + k * 9, G - 3, 2.6, 7 + 3 * p.wave(4, k * 0.23), 1.2 * p.wave(5, k * 0.31), 1, `P${k % 2}`);

      // Тело — одни и те же фигуры в четыре слоя: кромка, пламя, середина, ядро. Слои тоньше к центру.
      const tw = 3 * sway;
      const [hx, hy] = mixPt([36, 94], [44, 14], [18, 60], wind, strike);
      const [ex, ey] = mixPt([38, 74], [34, 34], [28, 58], wind, strike);
      const [fx, fy] = mixPt([90, 96], [80, 20], [84, 70], wind, strike);
      const body = (k: number, mat: Mat, part: string, inner: boolean): void => {
        const o = { part, noLine: inner };
        p.chain([[78, Y(58), 8 * k], [88, Y(76), 6 * k], [fx, Y(fy), 5 * k]], mat, o);
        p.chain([[62, Y(86), 15 * k], [60 + tw * 0.5, Y(108), 10 * k], [64 - tw * 0.5, Y(128), 8 * k], [62, Y(146), 13 * k]], mat, o);
        p.ellipse(60, Y(66), 22 * k, 20 * sq * k, mat, o);
        p.ellipse(56, Y(50), 18 * k, 10 * k, mat, o);
      };
      body(1, M.edge, 'body', false);
      // Языки с плеч, спины и боков столба рвутся вверх и назад.
      flame(p, 72, Y(50), 5, (20 + 3 * f1) * sq, 1.6 * f2, 6 + 3 * hurt, 'S1');
      flame(p, 82, Y(66), 4, (15 + 2 * f2) * sq, 1.4 * f1, 7 + 3 * hurt, 'S2');
      flame(p, 72, Y(96), 3.5, (13 + 2 * f3) * sq, 1.2 * f4, 6 + 2 * hurt, 'S3');
      flame(p, 68, Y(122), 3, (11 + 2 * f4) * sq, 1.2 * f2, 5, 'S4');
      flame(p, 50, Y(110), 3, (10 + 2 * f1) * sq, 1.2 * f3, 3, 'S5');
      // Рваный край: мелкие языки по всему силуэту, у каждого своя волна.
      const tongues: Array<[number, number, number]> = [
        [42, 60, 8], [44, 72, 7], [48, 84, 7], [76, 80, 8], [74, 108, 7], [52, 96, 6], [56, 132, 6], [70, 136, 6], [64, 44, 9], [50, 44, 7],
        [(78 + 88) / 2, (58 + 76) / 2, 7], [fx - 2, fy - 4, 8],
      ];
      tongues.forEach(([x, y, len], k) => flame(p, x, Y(y), 2.6, len * sq * (1 + 0.25 * p.wave(4, k * 0.37)), 1.2 * p.wave(5, k * 0.29), 3 + 3 * hurt, 'T'));
      body(0.6, FLAME.outer, 'bodyMid', true);
      body(0.34, FLAME.mid, 'bodyIn', true);
      // Сердце-ядро светится жёлтым сквозь грудь.
      p.ellipse(56, Y(70), 7, 7 * sq, FLAME.core, { part: 'heart', noLine: true });
      p.glow(56, Y(70), 10 + 2 * f2, '#ffd23a', 0.25);

      // Базальтовые наплечники — остывшие камни парят над плечами и дают пламени форму.
      const rock = (x: number, y: number, r: number, k: number, part: string, tone = 0): void => {
        const pts: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * 2 * Math.PI + k;
          const rr = r * (0.8 + 0.2 * Math.sin(k * 5 + i * 2.3));
          pts.push(x + rr * Math.cos(a), y + rr * Math.sin(a) * 0.8);
        }
        p.poly(pts, M.rock, { part, tone, bevel: 2 });
        p.line(x - r * 0.5, y, x + r * 0.2, y + r * 0.3, '#ff8a14');
      };
      rock(76, Y(44) + p.snap(1.2 * p.wave(1, 0.5)), 7, 0.4, 'rockFar', -0.1);

      // Голова: пламя-грива вверх и назад; глазницы тёмные, в них белый жар.
      p.pose({ dx: p.snap(-2 * strike + 2 * hurt), dy: p.snap(bob + 2 * hurt), rot: 0.06 * wind - 0.05 * strike + 0.2 * hurt, px: 54, py: 44 }, () => {
        const hy0 = Y(34) - bob;
        p.ellipse(52, hy0, 12, 13 * sq, M.edge, { part: 'head' });
        flame(p, 57, hy0 - 6, 7, (28 + 3 * f1 + 4 * wind) * sq, 2 * f2, 8 + 5 * hurt, 'H1');
        flame(p, 47, hy0 - 6, 5, (19 + 3 * f3) * sq, 1.6 * f4, 5 + 4 * hurt, 'H2');
        flame(p, 64, hy0 - 1, 4.5, (16 + 2 * f4) * sq, 1.4 * f1, 9 + 4 * hurt, 'H3');
        p.ellipse(50, hy0 + 2, 8, 9 * sq, FLAME.outer, { part: 'headMid', noLine: true });
        p.ellipse(47, hy0 + 4, 5, 5.5 * sq, FLAME.mid, { part: 'headIn', noLine: true });
        const shut = hurt > 0.4 ? 1 : p.blink(0.45, 0.05);
        p.ellipse(44, hy0 - 1, 3.4, 2.6, M.socket, { part: 'socket', noLine: true });
        p.ellipse(53, hy0 - 1.5, 3, 2.4, M.socket, { part: 'socket', noLine: true });
        if (shut >= 1) {
          p.line(42, hy0 - 1, 46, hy0 - 1, '#ffe060');
          p.line(51, hy0 - 1.5, 55, hy0 - 1.5, '#ffe060');
        } else {
          p.block(43, hy0 - 1.5, 2, 2 - shut, '#ffffff');
          p.block(52, hy0 - 2, 2, 2 - shut, '#fff6d8');
        }
        const open = 1 + 2 * strike + 3 * hurt + wind;
        p.ellipse(46, hy0 + 7, 3.5, open * 0.9, M.socket, { part: 'mouth', noLine: true });
      });

      // Ближняя рука: в покое опущена, пальцы-языки; в замахе вскинута над головой, в выпаде — к герою.
      p.chain([[44, Y(56), 8.5], [ex, Y(ey), 6.5], [hx, Y(hy), 5.5]], M.edge, { part: 'nearArm' });
      flame(p, (44 + ex) / 2 + 3, (Y(56) + Y(ey)) / 2, 3, 10 + 2 * f2, 1.2 * f3, 5, 'Arm');
      flame(p, ex + 3, Y(ey), 2.6, 8 + 2 * f4, 1.2 * f1, 4, 'T');
      p.chain([[44, Y(56), 5], [ex, Y(ey), 3.8], [hx, Y(hy), 3.4]], FLAME.outer, { part: 'nearArmMid', noLine: true });
      p.chain([[44, Y(58), 2.6], [ex, Y(ey), 2], [hx, Y(hy), 1.8]], FLAME.mid, { part: 'nearArmIn', noLine: true });
      flame(p, hx, Y(hy) - 1, 3.4, 10 + 2 * f3, 1.2 * f1, 3 + 6 * strike, 'Hand');
      rock(40, Y(50) + p.snap(1.2 * p.wave(1)), 8, 1.3, 'rock');

      // Шар огня: копится над головой на замахе, летит к герою в кадрах 4–5.
      if (p.clip === 'attack') {
        if (p.u < 0.43) fireball(p, 46, 8, 3 + 5 * wind, 0);
        else if (p.u < 0.62) fireball(p, p.u < 0.5 ? 6 : -16, 58, 7, 12);
      }
      // Искры кружат, от удара разлетаются.
      const n = hurt > 0.3 ? 8 : 4;
      for (let k = 0; k < n; k++) {
        const f = (p.t * 2 + k / n) % 1;
        const a = k * 2.4 + hurt * 3;
        const r = hurt > 0.3 ? 30 * (1.2 - hurt) : 0;
        p.px(62 + 26 * Math.cos(a) * (0.5 + f * 0.5) + r * Math.cos(a), Y(120) - f * 90 + r * Math.sin(a), f < 0.5 ? '#ffd23a' : '#e03a0e');
      }
    });
  },
};

// ─── Минотавр ───────────────────────────────────────────────────────────────

const MINO = {
  fur: { base: '#7a5230', shag: 0.15, tex: { kind: 'fur', scale: 2.5, amp: 0.2, stretch: 2.5, angle: 1.4 } } as Mat,
  dark: { base: '#4e3320', shag: 0.35, tex: { kind: 'fur', scale: 2, amp: 0.25, stretch: 2, angle: 1.3 } } as Mat,
  legs: { base: '#3e2a1a', shag: 0.3, tex: { kind: 'fur', scale: 2, amp: 0.22, stretch: 2.5, angle: 1.5 } } as Mat,
  muzzle: { base: '#9a7a5a', tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  horn: { base: '#ede0d4', tex: { kind: 'stripes', scale: 2, amp: 0.15, angle: 0.3 } } as Mat,
  hoof: { base: '#241a14', dither: 0 } as Mat,
  leather: { base: '#5b3a1e', tex: { kind: 'noise', scale: 2, amp: 0.14 } } as Mat,
  gold: { base: '#c89a3a', shine: 0.9, dither: 0 } as Mat,
  steel: { base: '#9aa0a8', shine: 1, dither: 0 } as Mat,
  haft: { base: '#5a3a22', tex: { kind: 'stripes', scale: 1.5, amp: 0.15 } } as Mat,
  nostril: { base: '#1e1410', dither: 0 } as Mat,
};

/**
 * Удар секирой: рука с секирой из покоя (лезвие у земли впереди) уходит назад-вверх за спину, через голову
 * обрушивается и врубается в землю чуть впереди места покоя (угол 0 — покой, −2π — снова он).
 */
const CLEAVE: Keys = [[0, -0.7], [0.14, -2.25], [0.3, -2.55], [0.43, -4.15], [0.57, -6.08], [0.72, -6.08], [0.86, -6.2], [1, -2 * Math.PI]];

export const minotaur: Model = {
  id: 'minotaur',
  w: 132,
  h: 160,
  ground: 158,
  // Секира над головой в замахе поднимается выше рогов на длину древка.
  pad: 64,
  draw(p: Painter) {
    const M = MINO;
    const G = 158;
    // Секира: замах — из-за спины через голову, выпад — лезвие врубается в землю перед героем, корпус валится вперёд.
    // Урон: голову запрокинуло, пасть в рёве, пар из ноздрей клубом.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const breath = p.wave(2);
    const up = -p.bob(1.5, 2);
    const tail = p.wave(1, 0.2);
    // Раз за цикл фыркает: из ноздрей бьют две струи пара.
    const snort = p.clip === 'idle' && p.t > 0.3 && p.t < 0.55 ? (p.t - 0.3) / 0.25 : -1;

    p.pose({ dx: -7 * strike + 2 * wind + 6 * hurt, rot: 0.05 * wind - 0.06 * strike + 0.05 * hurt, px: 68, py: G }, () => {
      p.shadow(68, 40, 4);
      // Ноги быка: бедро, скакательный сустав назад, раздвоенное копыто.
      const leg = (x: number, part: string, tone: number): void => {
        p.chain([[x, 108, 11], [x - 6, 124, 8], [x + 4, 140, 5.5], [x, G - 5, 4.5]], M.legs, { part, tone });
        p.poly([x - 7, G - 6, x + 5, G - 6, x + 6, G, x - 8, G], M.hoof, { part: `${part}Hoof`, tone, bevel: 1.5 });
        p.line(x - 1, G - 5, x - 1, G - 1, '#4a3a30');
      };
      leg(80, 'far', -0.15);
      // Хвост с кисточкой.
      const tx = 3 * tail + 5 * hurt;
      p.chain([[88, 100, 2.6], [98, 106, 2], [104 + tx * 0.5, 118, 1.6], [106 + tx, 130, 1.3]], M.fur, { part: 'tail', tone: -0.1 });
      p.ellipse(106 + tx, 134, 2.6, 4, M.dark, { part: 'tail' });

      // Дальняя рука висит, кулак сжат; золотой браслет.
      p.chain([[86, 58 + up, 11], [94, 82 + up, 9], [96, 102 + up, 7.5]], M.fur, { part: 'farArm', tone: -0.15 });
      p.ellipse(96, 108 + up, 7.5, 7, M.fur, { part: 'farArm', tone: -0.15 });
      p.limb(90, 96 + up, 4, 101, 96 + up, 4, M.gold, { part: 'bracelet', tone: -0.15 });

      leg(58, 'near', 0);

      // Торс: мощная грудь и плечи, живот; тёмная шерсть на груди, кожаный пояс и килт с бляхами.
      p.ellipse(68, 96, 20, 12, M.fur);
      p.ellipse(68, 70 + up, 28, 24 + breath, M.fur);
      p.ellipse(76, 50 + up, 22, 12, M.fur, { rot: -0.2 });
      p.ellipse(56, 64 + up, 14, 9, M.dark, { paint: true });
      p.line(62, 80 + up * 0.5, 62, 94, '#4e3320');
      p.poly([44, 94, 92, 94, 92, 101, 44, 101], M.leather, { part: 'belt', bevel: 1.5 });
      p.ellipse(66, 97.5, 4, 3.5, M.gold, { part: 'belt', lift: 2 });
      p.poly([44, 100, 90, 100, 94, 120, 84, 124, 74, 118, 64, 124, 54, 118, 42, 122], M.leather, { part: 'kilt', bevel: 3 });
      for (const x of [52, 64, 76, 86]) p.px(x, 108, '#c89a3a');

      // Голова быка на толстой шее: рога дугой вперёд-вверх, морда вниз, кольцо в носу, грива на загривке.
      p.pose({ dx: p.snap(-3 * strike + 2 * hurt), dy: up + p.snap(2 * wind - 3 * hurt), rot: -0.08 * wind + 0.1 * strike + 0.24 * hurt, px: 56, py: 48 }, () => {
        p.ellipse(70, 36, 12, 16, M.dark, { part: 'mane' });
        // Дальний рог.
        p.chain([[62, 22, 4.5], [74, 16, 3.8], [82, 8, 2.8], [80, 1, 1.2]], M.horn, { part: 'hornFar', tone: -0.2 });
        p.poly([66, 26, 80 + 2 * hurt, 28, 70, 32], M.fur, { part: 'earFar', bevel: 1.5, tone: -0.15 });
        const open = 2 * wind + 2 * strike + 5 * hurt;
        p.ellipse(40, 54 + open * 0.5, 8, 4.5, M.muzzle, { part: 'jaw', tone: -0.15 });
        p.ellipse(52, 34, 13, 13, M.fur, { part: 'head' });
        p.limb(48, 40, 10, 38, 50, 8.5, M.fur, { part: 'head' });
        p.ellipse(36, 50, 9, 6.5, M.muzzle, { part: 'head', lift: 3 });
        p.ellipse(56, 24, 9, 4, M.dark, { part: 'head', paint: true });
        // Ноздри и кольцо.
        p.ellipse(30.5, 49, 1.6, 1.4, M.nostril, { part: 'nose', lift: 6 });
        p.ellipse(35, 47.5, 1.4, 1.2, M.nostril, { part: 'nose', lift: 6 });
        p.limb(31, 51, 0.9, 30, 56, 0.9, M.gold, { part: 'ring' });
        p.limb(30, 56, 0.9, 34, 55, 0.9, M.gold, { part: 'ring' });
        p.limb(34, 55, 0.9, 33, 51, 0.9, M.gold, { part: 'ring' });
        if (open > 2) p.poly([30, 54, 42, 54, 41, 55 + open, 31, 55 + open * 0.8], M.nostril, { part: 'maw', bevel: 0.6 });
        // Ухо в сторону и ближний рог: толстый у лба, дугой вперёд и вверх, острие светлее.
        p.poly([56, 30, 66 + 3 * hurt, 36 + 2 * hurt, 58, 38], M.fur, { part: 'ear', bevel: 1.5 });
        p.chain([[50, 24, 5], [40, 20, 4], [32, 12, 3], [32, 3, 1.4]], M.horn, { part: 'horn' });
        const shut = hurt > 0.4 ? 1 : p.blink(0.7);
        p.eye(43, 34, 1.7, '#ff5a2a', { closed: shut, glint: '#ffd0a0', lid: '#1e1410' });
        p.line(38, 30.5, 47, 32 + 2 * wind, '#2a1a10');
        // Пар из ноздрей.
        const steam = (f: number, a: number): void => {
          for (let k = 0; k < 3; k++) {
            const g = Math.min(1, f + k * 0.15);
            p.disc(29 - g * 12, 50 + g * 6 + k, 1.2 + g * 2, `#d8d0c8${hexA(a * (1 - g))}`);
          }
        };
        if (snort >= 0) steam(snort, 0.6);
        if (hurt > 0.3) steam(1 - hurt, 0.7);
      });

      // Ближняя рука с секирой: в покое лезвие стоит на земле перед копытами; в ударе — дугой через голову в землю.
      const phi = arc(p, CLEAVE);
      p.pose({ rot: phi - 0.12 * hurt, px: 48, py: 56 + up }, () => {
        p.chain([[48, 56 + up, 11], [40, 80 + up, 9], [34, 100 + up, 8]], M.fur, { part: 'nearArm' });
        // Древко от кулака вниз, двусторонняя секира у земли.
        p.limb(35, 92 + up, 2.2, 22, 150, 2.4, M.haft, { part: 'haft' });
        p.limb(23, 146, 2.6, 21, 154, 2.6, M.gold, { part: 'pommel' });
        const ax = 26, ay = 126;
        p.poly([ax + 2, ay - 10, ax - 14, ay - 20, ax - 21, ay - 5, ax - 14, ay + 11, ax + 2, ay + 2], M.steel, { part: 'blade', bevel: 1.8 });
        p.poly([ax + 3, ay - 10, ax + 16, ay - 16, ax + 20, ay - 4, ax + 16, ay + 8, ax + 3, ay + 2], M.steel, { part: 'bladeBack', bevel: 1.8, tone: -0.1 });
        p.line(ax - 20, ay - 4, ax - 14, ay + 10, '#e8eef4');
        p.limb(ax, ay - 11, 3.2, ax + 1.5, ay + 3, 3.2, M.leather, { part: 'socket' });
        p.ellipse(34, 100 + up, 7.5, 7, M.fur, { part: 'fist' });
        p.limb(34, 90 + up, 4.5, 36, 94 + up, 4.5, M.gold, { part: 'bracer' });
      });
      // Искры и пыль из-под лезвия в кадрах удара о землю.
      if (strike > 0.6) {
        const c = Math.cos(phi), sn = Math.sin(phi);
        const dx = 12 - 48, dy = 150 - (56 + up);
        const cx = 48 + dx * c - dy * sn;
        for (const [ox, r] of [[-12, 3.5], [-4, 4.5], [6, 3.5], [13, 2.5]]) p.disc(cx + ox * strike, G - 3 - r * 0.4, r * strike, '#8a7a6ab0', true);
        for (const [ox, oy] of [[-8, -12], [2, -16], [10, -9]]) p.px(cx + ox, G - 4 + oy * strike, '#ffe8a0');
      }
    });
  },
};

// ─── Древний дракон ─────────────────────────────────────────────────────────

const DRAGON = {
  scale: { base: '#8b1a14', tex: { kind: 'spots', scale: 4, amp: 0.25, density: 0.35 } } as Mat,
  dark: { base: '#5a0e0e', tex: { kind: 'noise', scale: 3, amp: 0.15 } } as Mat,
  belly: { base: '#b8844a', tex: { kind: 'stripes', scale: 3.5, amp: 0.3, angle: 1.57 } } as Mat,
  wing: { base: '#5e1216', tex: { kind: 'stripes', scale: 4, amp: 0.1, angle: 0.5 } } as Mat,
  wingBone: { base: '#3a0a0c' } as Mat,
  horn: { base: '#c8b8a0', tex: { kind: 'stripes', scale: 2, amp: 0.2, angle: 0.4 } } as Mat,
  spike: { base: '#2a1210', dither: 0 } as Mat,
  claw: { base: '#d8ccb8', dither: 0 } as Mat,
  mouth: { base: '#3a0606', dither: 0 } as Mat,
  fang: { base: '#f0e6d0', dither: 0 } as Mat,
};

export const dragon: Model = {
  id: 'dragon',
  w: 276,
  h: 192,
  ground: 188,
  // Пламя из пасти в кадре контакта — на 76 единиц левее рамки; крылья в замахе выше рамки.
  pad: 84,
  draw(p: Painter) {
    const M = DRAGON;
    const G = 188;
    // Дыхание: замах — шея назад и вверх, крылья вскинуты, в горле разгорается огонь; выпад — голова вниз-вперёд,
    // пасть раскрыта, из неё поток пламени к герою, крылья бьют вниз. Урон: голову откинуло, крылья вздыбило, рёв.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const breath = p.wave(1);
    const up = -p.bob(1.5, 1);
    const tail = p.wave(1, 0.3);
    // Дым из ноздрей; жар в горле тлеет и разгорается.
    const ember = (p.wave(2, 0.2) + 1) / 2;
    const wingUp = 0.1 * p.wave(1, 0.1) + 0.3 * wind - 0.35 * strike + 0.4 * hurt;

    p.pose({ dx: -8 * strike + 3 * wind + 6 * hurt, rot: 0.03 * wind - 0.03 * strike + 0.04 * hurt, px: 190, py: G }, () => {
      p.shadow(160, 96, 5);
      const foot = (x: number, part: string, tone = 0): void => {
        p.ellipse(x, G - 5, 12, 5, M.scale, { part, tone, flat: 0.3 });
        for (let k = 0; k < 3; k++) p.chain([[x - 8 + k * 4, G - 5, 1.8], [x - 12 + k * 4, G - 2, 1.3], [x - 14 + k * 4, G, 0.8]], M.claw, { part: `${part}Claw`, tone });
      };
      // Дальнее крыло: поднято над спиной, перепонка между пальцами.
      const wing = (sx: number, sy: number, s: number, part: string, tone: number, lift = 0): void => {
        p.pose({ rot: -wingUp * s - lift, px: sx, py: sy }, () => {
          // Запястье высоко над плечом, от него веером четыре пальца; перепонка между ними провисает дугами.
          const W = [sx + 30 * s, sy - 70];
          const F1 = [sx + 116 * s, sy - 68], F2 = [sx + 122 * s, sy - 38], F3 = [sx + 98 * s, sy - 8], F4 = [sx + 62 * s, sy + 6];
          const T1 = [sx + 94 * s, sy - 54], T2 = [sx + 90 * s, sy - 24], T3 = [sx + 70 * s, sy - 8], T4 = [sx + 40 * s, sy - 2];
          p.poly([sx, sy, ...W, ...F1, ...T1, ...F2, ...T2, ...F3, ...T3, ...F4, ...T4, sx + 12 * s, sy + 10], M.wing, { part, tone, flat: 0.6, bevel: 4 });
          p.limb(sx, sy, 5, W[0], W[1], 3.5, M.wingBone, { part, paint: true });
          for (const F of [F1, F2, F3, F4]) p.limb(W[0], W[1], 2.2, F[0], F[1], 0.9, M.wingBone, { part, paint: true });
          p.chain([[W[0], W[1], 3], [W[0] - 4 * s, W[1] - 7, 1]], M.claw, { part: `${part}Claw` });
        });
      };
      wing(166, 96 + up, 0.8, 'wingFar', -0.15, 0.14);

      // Дальние лапы.
      p.chain([[206, 132, 14], [214, 154, 10], [206, 174, 7]], M.dark, { part: 'farHind', tone: -0.1 });
      foot(204, 'farHind', -0.1);
      p.chain([[122, 136, 11], [118, 158, 8], [112, 176, 6.5]], M.dark, { part: 'farFront', tone: -0.1 });
      foot(110, 'farFront', -0.1);

      // Хвост: толстый у крупа, лежит волной по земле, кончик с шипом-лопатой покачивается.
      const tx = 4 * tail + 8 * hurt;
      p.chain([[210, 120, 18], [236, 140, 13], [256, 160, 9], [266 + tx * 0.4, 174, 6], [254 + tx, 182, 4], [240 + tx, 180, 2.5]], M.scale, { part: 'tail' });
      p.chain([[214, 132, 10], [238, 150, 7], [256, 167, 5]], M.belly, { part: 'tail', paint: true });
      p.poly([240 + tx, 174, 232 + tx, 180, 240 + tx, 186, 246 + tx, 180], M.spike, { part: 'tailTip', bevel: 1.5 });

      // Туловище: бочка с глубокой грудью, пластины брюха.
      p.ellipse(168, 122 + up * 0.5, 50, 32 + breath * 1.2, M.scale);
      p.ellipse(124, 118 + up, 30, 30 + breath, M.scale);
      p.ellipse(202, 124, 20, 22, M.scale);
      p.ellipse(158, 146, 44, 8, M.belly, { paint: true });
      p.ellipse(118, 136 + up, 20, 12, M.belly, { paint: true });
      // Шипы по хребту.
      for (let k = 0; k < 7; k++) {
        const x = 132 + k * 14, y = 90 + Math.abs(k - 2) * 1.8 + up * 0.5;
        const h = 9 - Math.abs(k - 2) * 0.8;
        p.poly([x - 4, y + 4, x + 3, y - h, x + 5, y + 4], M.spike, { part: 'spikes', bevel: 1.2 });
      }

      // Ближние лапы: задняя — мощное бедро; передняя — локоть и когти, в выпаде подаётся вперёд.
      p.chain([[190, 128, 20], [182, 156, 12], [176, 174, 8]], M.scale, { part: 'nearHind' });
      foot(172, 'nearHind');
      const reach = 6 * strike;
      p.chain([[108, 132 + up, 13], [100 - reach * 0.5, 156, 9], [94 - reach, 176, 7]], M.scale, { part: 'nearFront' });
      foot(92 - reach, 'nearFront');

      // Шея дугой: от груди вверх и вперёд к голове; в замахе оттянута назад, в выпаде голова идёт вниз к герою.
      const [hx, hy] = mixPt([54, 52], [82, 30], [30, 84], wind, strike);
      const hxx = hx + 6 * hurt, hyy = hy + up - 10 * hurt;
      const [nx, ny] = mixPt([82, 70], [100, 56], [70, 90], wind, strike);
      p.chain([[118, 106 + up, 22], [nx + 8, ny + 18 + up, 16], [nx, ny + up, 13], [hxx + 16, hyy + 6, 11]], M.scale, { part: 'neck' });
      p.chain([[112, 122 + up, 12], [nx + 2, ny + 26 + up, 9], [nx - 6, ny + 10 + up, 7], [hxx + 12, hyy + 12, 6]], M.belly, { part: 'neck', paint: true });
      for (let k = 0; k < 4; k++) {
        const f = (k + 0.5) / 4;
        const x = nx + 16 + (118 - nx - 16) * (1 - f) * 0.9 - 10 * f, y = ny - 12 + up + (106 - ny) * (1 - f) * 0.6;
        p.poly([x - 3, y + 4, x + 2, y - 7, x + 4, y + 4], M.spike, { part: 'neckSpikes', bevel: 1 });
      }
      // Голова: клиновидная, рога назад, гребень, раскрытая в выпаде пасть.
      p.pose({ dx: p.snap(hxx - 54), dy: p.snap(hyy - 52), rot: 0.14 * wind - 0.16 * strike + 0.3 * hurt, px: 58, py: 52 }, () => {
        p.chain([[64, 42, 4.5], [80, 34, 3.5], [94, 30, 2.5], [104, 32, 1.2]], M.horn, { part: 'hornFar', tone: -0.2 });
        const open = 9 * strike + 7 * hurt + 1.5 * ember * (1 - wind);
        p.poly([66, 58, 34, 60 + open * 0.6, 22, 62 + open, 24, 66 + open, 44, 66 + open * 0.5, 66, 64], M.scale, { part: 'jaw', bevel: 2, tone: -0.12 });
        p.ellipse(58, 50, 16, 12, M.scale, { part: 'head' });
        p.limb(50, 52, 10, 24, 56, 7, M.scale, { part: 'head' });
        p.ellipse(56, 42, 14, 4, M.dark, { part: 'head', lift: 5 });
        p.ellipse(44, 60, 16, 3, M.belly, { part: 'head', paint: true });
        // Гребень и рога: ближний рог длинный, загнут назад.
        for (let k = 0; k < 3; k++) p.poly([66 + k * 6, 56 + k * 2, 76 + k * 7, 60 + k * 4, 68 + k * 6, 64 + k * 2], M.spike, { part: 'frill', bevel: 1 });
        p.chain([[56, 42, 5.5], [72, 30, 4.5], [88, 22, 3], [102, 20, 1.4]], M.horn, { part: 'horn' });
        p.chain([[44, 44, 2.5], [48, 38, 1.6], [52, 36, 0.8]], M.horn, { part: 'hornSmall' });
        // Ноздри, дым.
        p.ellipse(22, 52, 2, 1.5, M.mouth, { part: 'nose', lift: 5 });
        if (open > 2.5) {
          p.poly([22, 58, 60, 58, 58, 60 + open * 0.5, 24, 60 + open * 0.9], M.mouth, { part: 'maw', bevel: 1 });
          for (const x of [26, 32, 38, 46]) p.poly([x, 58, x + 2, 58, x + 1, 61.5], M.fang, { part: 'fang' });
          for (const x of [28, 36, 44]) p.poly([x, 60 + open * 0.8, x + 2, 60 + open * 0.8, x + 1, 57 + open * 0.8], M.fang, { part: 'fang' });
        } else {
          p.line(22, 58, 58, 59.5, '#2a0606');
          for (const x of [27, 35, 44]) p.px(x, 59.5, '#f0e6d0');
        }
        // Жар в пасти и горле.
        if (open > 1.5 || wind > 0.2) p.glow(32, 60, 5 + 5 * wind + 4 * strike, '#ff8a14', 0.3 + 0.3 * Math.max(wind, strike));
        const shut = hurt > 0.4 ? 1 : p.blink(0.55);
        p.glow(44, 45, 5, '#ffd700', shut ? 0.1 : 0.3);
        p.eye(44, 45, 2.4, '#ffd700', { closed: shut, pupil: '#3a1a06', glint: '#fffbe0', lid: '#2a0606' });
        p.line(38, 41, 52, 42.5 + 2 * wind, '#2a0606');
        // Дым вьётся из ноздрей в покое.
        if (p.clip === 'idle') {
          for (let k = 0; k < 3; k++) {
            const f = (p.t * 2 + k / 3) % 1;
            p.disc(20 - f * 8 + 2 * Math.sin((f + k) * 5), 50 - f * 18, 1.2 + f * 2, `#9a9290${hexA(0.55 * (1 - f))}`);
          }
        }
        // Поток пламени из пасти.
        if (strike > 0.3) {
          const L = 42 * strike;
          p.glow(24 - L * 0.5, 64, 18 + 8 * strike, '#ff8a14', 0.3);
          p.poly([24, 60, -L * 0.5, 50 - 6 * strike, -L, 54 - 10 * strike, -L - 8, 66, -L, 78 + 10 * strike, -L * 0.5, 80 + 6 * strike, 24, 68], FLAME.outer, { part: 'breath', bevel: 4 });
          p.poly([22, 61, -L * 0.6, 56, -L * 0.85, 60, -L * 0.9, 66, -L * 0.85, 72, -L * 0.6, 76, 22, 67], FLAME.mid, { part: 'breathMid', bevel: 3 });
          p.poly([20, 62.5, -L * 0.45, 61, -L * 0.5, 66, -L * 0.45, 70, 20, 65.5], FLAME.core, { part: 'breathCore', bevel: 2 });
        }
      });

      // Ближнее крыло: поднято над спиной, перепонка не закрывает тело.
      wing(140, 94 + up, 1, 'wingNear', 0);
    });
  },
};

/** Голем лепился ростом 126; до таблицы (148) — тем же масштабом, что Тролль. */
export const golem = scaleModel(golemBase, 148 / 126);

export const CAVES_MODELS: Record<string, Model> = { imp, kamikaze_imp: kamikazeImp, fire_bat: fireBat, lava_slime: lavaSlime, salamander, hellhound, cultist, fire_priest: firePriest, tormentor, golem, fire_elemental: fireElemental, minotaur, dragon };
