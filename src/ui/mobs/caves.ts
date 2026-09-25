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
  body: { base: '#e05e1a', tex: { kind: 'noise', scale: 3, amp: 0.16 } } as Mat,
  crust: { base: '#3a2420', tex: { kind: 'noise', scale: 1.6, amp: 0.25 } } as Mat,
  hot: { base: '#ff8a14', glow: true, dither: 0, ramp: ['#d84a0e', '#ea5c10', '#f87212', '#ff8a16', '#ffa01e'] } as Mat,
  bone: { base: '#8a7a6a', tex: { kind: 'noise', scale: 1.5, amp: 0.2 } } as Mat,
  socket: { base: '#1a0a06', dither: 0 } as Mat,
};

export const lavaSlime: Model = {
  id: 'lava_slime',
  w: 96,
  h: 68,
  ground: 66,
  // Ком лавы в кадре контакта — на 26 единиц левее рамки.
  pad: 36,
  draw(p: Painter) {
    const M = LSLUG;
    const G = 66;
    // Лавовый плевок: замах — масса вздымается и отклоняется назад; выпад — гребень бросается к герою
    // и швыряет ком расплава. Урон: массу расплющило, брызги лавы во все стороны, череп глубже тонет в теле.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const sq = 1 - 0.2 * hurt;
    // Поверхность ходит медленными волнами, череп то всплывает, то тонет на пиксель.
    const w1 = p.wave(1, 0.1), w2 = p.wave(2, 0.4);
    const sink = p.snap(1.2 * p.wave(1, 0.6)) + 4 * hurt;
    const cx = p.snap(-10 * strike + 4 * wind + 3 * hurt), cy = p.snap(-3 * wind + 4 * strike + 6 * hurt);
    const Y = (y: number): number => G - (G - y) * sq;

    p.pose({ dx: -2 * strike + 2 * hurt, px: 50, py: G }, () => {
      p.shadow(50, 42, 3, 0.45);
      p.glow(50, G - 1, 30, '#ff8a14', 0.18);
      // Масса расплава: разлита по полу, горбится и вздымается гребнем к герою — одна поверхность.
      p.ellipse(50, Y(57), 40, 9 * sq, M.body);
      p.ellipse(50 + cx * 0.2, Y(44 + cy * 0.2) + p.snap(0.8 * w1), 29, (20 + 0.8 * w2) * sq, M.body);
      p.ellipse(67, Y(40) + p.snap(0.8 * w2), 16, 14 * sq, M.body);
      p.ellipse(37 + cx * 0.6, Y(29 + cy * 0.6), 18, 16 * sq, M.body);
      p.ellipse(32 + cx, Y(15 + cy) + p.snap(0.6 * w2), 11.5, 12 * sq, M.body);
      // Подтёки у пола раскалены.
      p.poly([10, G - 3, 90, G - 3, 91, G, 9, G], M.hot, { paint: true, bevel: 1 });
      // Плиты остывшей корки по горбу и спине; между ними светятся трещины — тело под коркой.
      const plate = (x: number, y: number, r: number, k: number): void => {
        const pts: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * 2 * Math.PI + k;
          const rr = r * (0.8 + 0.2 * Math.sin(k * 3 + i * 2.1));
          pts.push(x + rr * Math.cos(a) * 1.35, Y(y + rr * Math.sin(a) * 0.95));
        }
        p.poly(pts, M.crust, { paint: true });
      };
      const plates: Array<[number, number, number, number, number]> = [
        // x, y, радиус, поворот, насколько плита едет с гребнем
        [40, 8, 5.5, 0.4, 1], [46, 20, 6.5, 1.3, 0.7], [56, 29, 7, 2.2, 0.35], [68, 30, 6.5, 0.9, 0.1], [78, 39, 6, 2.6, 0],
        [86, 48, 4.5, 0.2, 0], [46, 38, 5, 2.9, 0.4], [40, 50, 4.5, 1.1, 0.1], [24, 32, 4.5, 0.7, 0.7],
      ];
      plates.forEach(([x, y, r, k, f]) => plate(x + cx * f, y + cy * f + p.snap(0.8 * w1 * (1 - f)), r, k));

      // Череп проглоченного: вплавлен в гребень, глазницы горят, нижняя челюсть утонула в расплаве.
      const sx = 30 + cx * 0.95, sy = Y(19 + cy * 0.95) + sink;
      p.ellipse(sx + 1, sy - 1, 8.5, 7.5, M.bone, { part: 'skull' });
      p.ellipse(sx - 4, sy + 4, 5, 4, M.bone, { part: 'skull' });
      p.ellipse(sx - 4, sy - 0.5, 2.6, 2.6, M.socket, { part: 'skull', paint: true });
      p.ellipse(sx + 2.5, sy - 1, 2.3, 2.5, M.socket, { part: 'skull', paint: true });
      p.poly([sx - 8, sy + 3, sx - 6.5, sy + 1, sx - 5.5, sy + 4], M.socket, { part: 'skull', paint: true });
      const ember = hurt > 0.4 ? '#4a1206' : '#ffb428';
      p.glow(sx - 1, sy - 1, 6, '#ff8a14', hurt > 0.4 ? 0.05 : 0.3);
      p.block(sx - 4.5, sy - 1, 1, 1, ember);
      p.block(sx + 2, sy - 1.5, 1, 1, ember);
      for (const x of [-8, -6, -4, -2]) p.px(sx + x, sy + 7, '#d8ccb8');
      // Расплав затягивает челюсть и течёт по кости трещиной.
      p.ellipse(sx - 2, sy + 10, 10, 3, M.body, { part: 'skull', paint: true });
      p.line(sx + 5, sy - 7, sx + 6, sy + 1, '#ff8a14');
      p.line(sx + 6, sy + 1, sx + 4, sy + 5, '#ff8a14');
      // Рёбра дугой торчат из бока — остов, который масса не доплавила.
      for (let k = 0; k < 3; k++) {
        const bx = 58 + k * 7 + cx * 0.2, by = Y(38 + k * 2) + cy * 0.2;
        p.chain([[bx, by + 10, 1.3], [bx - 3, by + 4, 1.1], [bx - 1, by - 2, 0.9], [bx + 3, by - 4, 0.7]], M.bone, { part: 'ribs', tone: -0.12 * k });
      }

      // Пузырь вздувается на горбу и лопается.
      if (p.clip === 'idle') {
        const b = p.t > 0.3 && p.t < 0.5 ? (p.t - 0.3) / 0.2 : -1;
        if (b >= 0 && b < 0.8) p.disc(58, Y(24) - b * 2, 1 + 2 * b, '#ffa01e');
        else if (b >= 0.8) for (const [ox, oy] of [[-3, -1], [3, -1], [0, -3]]) p.px(58 + ox, Y(21) + oy, '#ffc850');
      }
      // Раскалённые нити стекают с гребня и капают на пол.
      if (p.clip === 'idle') {
        for (const [x, y0, ph] of [[20, 26, 0.15], [44, 52, 0.6], [76, 50, 0.35]] as const) {
          const f = (p.t + ph) % 1;
          if (f < 0.55) p.line(x, y0, x, y0 + f * 10, '#ff9a1e');
          else if (f < 0.8) p.px(x, y0 + 6 + (f - 0.55) * 30, '#e05a10');
        }
      }
      // Брызги от удара.
      if (hurt > 0.2) for (const [ox, oy] of [[-14, -12], [0, -18], [16, -12], [30, -16]]) p.disc(48 + ox * (1.5 - hurt), 34 + oy * hurt, 1.3, '#ffa01e');

      // Ком лавы летит к герою в кадрах 4–5.
      if (p.clip === 'attack' && p.u > 0.4 && p.u < 0.62) {
        const x = p.u < 0.5 ? 4 : -18;
        p.glow(x, 24, 9, '#ff9a2a', 0.35);
        p.chain([[x + 10, 23, 1.5], [x + 5, 24, 3], [x, 24, 4.5]], M.hot, { part: 'glob' });
        p.block(x - 1, 21, 2, 1, '#3a2420');
        p.ellipse(x - 1, 24, 2, 1.8, FLAME.core, { part: 'globCore', noLine: true });
      }
    });
  },
};

// ─── Саламандра ─────────────────────────────────────────────────────────────

const SALA = {
  skin: { base: '#c05a26', tex: { kind: 'spots', scale: 3.5, amp: 0.3, density: 0.35 } } as Mat,
  band: { base: '#6a2812', tex: { kind: 'noise', scale: 2, amp: 0.15 } } as Mat,
  belly: { base: '#e0924a', tex: { kind: 'noise', scale: 2, amp: 0.08 } } as Mat,
  spine: { base: '#2e140a', dither: 0 } as Mat,
  claw: { base: '#1e0e08', dither: 0 } as Mat,
  mouth: { base: '#3a0a04', dither: 0 } as Mat,
  tongue: { base: '#c8404a', dither: 0 } as Mat,
};

const salamanderBase: Model = {
  id: 'salamander',
  w: 136,
  h: 58,
  ground: 56,
  ownHeight: 'длинная и низкая ящерица: вдвое длиннее роста, по массе как прежний квадратный спрайт ростом 64',
  // Струя огня в кадре контакта — на 36 единиц левее рамки.
  pad: 46,
  draw(p: Painter) {
    const M = SALA;
    const G = 56;
    // Огненное дыхание: замах — голова поднята и отведена, горло разгорается; выпад — голова к герою, пасть
    // распахнута, из неё поток огня. Урон: отбросило, голову вскинуло, пасть в шипении, гребень прижат.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const breath = 0.4 * p.wave(3);
    const sway = p.wave(1, 0.2);
    const tongue = p.clip === 'idle' ? p.blink(0.45, 0.08) : 0;
    const heat = (p.wave(3, 0.35) + 1) / 2;

    p.pose({ dx: -6 * strike + 2 * wind + 5 * hurt, rot: 0.03 * wind - 0.02 * strike + 0.04 * hurt, px: 80, py: G }, () => {
      p.shadow(66, 58, 3);
      // Лапа ящерицы: сустав вывернут, кисть плашмя, три когтя вперёд.
      const leg = (sx: number, sy: number, ex: number, ey: number, wx: number, part: string, tone: number, r = 1): void => {
        p.chain([[sx, sy, 6 * r], [ex, ey, 3.8 * r], [wx, G - 3, 2.6 * r]], M.skin, { part, tone });
        p.ellipse(wx - 1.5, G - 1.5, 4 * r, 1.6, M.skin, { part, tone, flat: 0.4 });
        for (let k = 0; k < 3; k++) p.line(wx - 3 + k * 1.2, G - 1, wx - 6.5 + k * 1.4, G - 0.2, '#1e0e08');
      };
      leg(48, 36, 52, 44, 45, 'far', -0.2, 0.9);
      leg(82, 36, 78, 44, 85, 'far', -0.2, 0.95);

      // Хребет от шеи до кончика хвоста — одна поверхность; хвост лениво метёт по полу.
      const tw = 2.5 * sway + 5 * hurt;
      const body: Array<[number, number, number]> = [
        [36, 32, 11], [47, 31, 12.5 + breath], [60, 30, 12.5 + breath], [74, 31, 11],
        [87, 35, 8.5], [99, 41 + tw * 0.2, 6.5], [110, 46 + tw * 0.4, 4.8], [119, 49 + tw * 0.6, 3.4], [126, 49 + tw, 2.2], [131, 46 + tw * 1.3, 1.2],
      ];
      p.chain(body, M.skin, { part: 'body' });
      // Светлое брюхо и горло, тёмная спина.
      p.chain(body.slice(0, 7).map(([x, y, r]) => [x, y + r * 0.62, r * 0.42] as [number, number, number]), M.belly, { part: 'body', paint: true });
      p.chain(body.slice(0, 9).map(([x, y, r]) => [x + 1, y - r * 0.62, r * 0.38] as [number, number, number]), M.band, { part: 'body', paint: true });
      // Угли тлеют в тёмной коже по хребту.
      body.slice(0, 7).forEach(([x, y, r], k) => p.px(x + 3, y - r * 0.4, (heat > 0.5) === (k % 2 === 0) ? '#ffb428' : '#c8400c'));

      // Гребень: зубчатый костяной киль по хребту, зубцы клонятся назад, кончики раскалены.
      const rise = 1 + 0.35 * wind - 0.5 * hurt;
      const ridge: number[] = [];
      const tips: Array<[number, number]> = [];
      const top = (x: number): number => {
        for (let k = 0; k + 1 < body.length; k++) {
          const [x0, y0, r0] = body[k], [x1, y1, r1] = body[k + 1];
          if (x >= x0 && x <= x1) {
            const f = (x - x0) / (x1 - x0);
            return y0 + (y1 - y0) * f - (r0 + (r1 - r0) * f) + 1.2;
          }
        }
        return body[0][1] - body[0][2];
      };
      for (let x = 30; x <= 104; x += 6) {
        const h = (x < 62 ? 7 : 7 - (x - 62) * 0.11) * rise;
        ridge.push(x, top(x) + 1.5);
        ridge.push(x + 4.5, top(x + 3) - h);
        tips.push([x + 4, top(x + 3) - h + 1]);
      }
      ridge.push(108, top(106) + 1.5);
      for (let x = 108; x >= 30; x -= 6) ridge.push(x, top(x) + 3.5);
      p.poly(ridge, M.spine, { part: 'spines', bevel: 1 });
      tips.forEach(([x, y], k) => p.px(x, y, (heat > 0.5) === (k % 2 === 0) ? '#ffc850' : '#ff8a14'));

      // Ближние лапы.
      leg(40, 37, 45, 45, 37, 'near', 0);
      leg(76, 36, 70, 45, 78, 'near', 0);

      // Шея и голова: клин черепа с надбровьем, в выпаде бросок к герою.
      const hx = p.snap(-6 * strike + 3 * wind + 2 * hurt), hy = p.snap(-4 * wind + 2 * strike - 3 * hurt);
      p.limb(38, 33, 10, 22 + hx * 0.6, 29 + hy * 0.6, 7.5, M.skin, { part: 'body' });
      p.pose({ dx: hx, dy: hy, rot: 0.14 * wind - 0.08 * strike + 0.26 * hurt, px: 22, py: 28 }, () => {
        const open = 0.32 * strike + 0.28 * hurt + 0.05 * heat * (1 - wind);
        // Нижняя челюсть на шарнире у угла рта.
        p.pose({ rot: -open, px: 20, py: 29 }, () => {
          p.poly([21, 28, 3, 29.5, 2, 32, 14, 33.5, 22, 32], M.belly, { part: 'jaw', bevel: 1.2, tone: -0.12 });
          if (open > 0.12) for (const x of [5, 9, 13]) p.px(x, 29.5, '#e8dcc0');
        });
        p.ellipse(16, 24.5, 9.5, 6.2, M.skin, { part: 'body', rot: 0.12 });
        p.limb(12, 27, 5, 1.5, 28.5, 3.2, M.skin, { part: 'body' });
        p.ellipse(15, 20.5, 7, 2.4, M.band, { part: 'body', paint: true, rot: 0.1 });
        p.ellipse(10, 29, 8, 1.8, M.belly, { part: 'body', paint: true });
        if (open > 0.12) {
          p.poly([2, 28.5, 20, 28.5, 19, 30, 3, 30.5], M.mouth, { part: 'maw', bevel: 0.5 });
          for (const x of [4, 8, 12, 16]) p.px(x, 29, '#e8dcc0');
        } else p.line(2, 28.5, 19, 28.8, '#2a0a04');
        if (tongue > 0) p.chain([[2, 29, 0.6], [-2 - 2 * tongue, 30, 0.5], [-4 - 2 * tongue, 29, 0.4]], M.tongue, { part: 'tongue' });
        p.px(2.5, 26, '#2a0a04');
        // Горло разгорается перед выдохом.
        if (wind > 0.15) p.glow(18, 32, 3 + 5 * wind, '#ff9a2a', 0.5 * wind);
        // Глаз под тяжёлым надбровьем: узкий жёлтый зрачок-щель.
        const shut = hurt > 0.4 ? 1 : p.blink(0.7);
        p.eye(12, 23, 1.7, '#ffc830', { closed: shut, glint: '#fff4c0', lid: '#2a0a04' });
        if (shut < 1) p.line(12, 22, 12, 24, '#2a0a04');
        p.line(8, 20.5, 16, 21.5 + wind, '#2a0a04');
        // Поток огня из пасти.
        if (strike > 0.3) {
          const L = 26 * strike;
          p.glow(-L * 0.5, 31, 9 + 5 * strike, '#ff9a2a', 0.35);
          p.poly([3, 28, -L, 22 - 3 * strike, -L - 4, 30, -L, 38 + 3 * strike, 3, 32], FLAME.outer, { part: 'breath', bevel: 3 });
          p.poly([2, 29, -L * 0.8, 26, -L * 0.8 - 2, 30.5, -L * 0.8, 35, 2, 31], FLAME.mid, { part: 'breathMid', bevel: 2, noLine: true });
          p.poly([1, 29.6, -L * 0.45, 28.5, -L * 0.45, 32.5, 1, 30.8], FLAME.core, { part: 'breathCore', bevel: 1, noLine: true });
        }
      });
    });
  },
};

/** Саламандра лепилась в единицах поменьше; до веса брутa на поле — масштаб 1,3. */
export const salamander = scaleModel(salamanderBase, 1.3);

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
  shade: { base: '#1a080c' } as Mat,
  skin: { base: '#c8a088', tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  rope: { base: '#8a7050', tex: { kind: 'stripes', scale: 1, amp: 0.2, angle: 0.8 } } as Mat,
  steel: { base: '#c0c0c8', shine: 1, dither: 0 } as Mat,
  hilt: { base: '#3a2418' } as Mat,
  gem: { base: '#ff5a2a', glow: true, dither: 0 } as Mat,
  boot: { base: '#241418' } as Mat,
  nail: { base: '#3a2420', dither: 0 } as Mat,
};

/**
 * Удар ритуальным кинжалом сверху ближней (правой) рукой: из покоя (кинжал обратным хватом у бедра) рука уходит
 * назад-вверх, через капюшон обрушивается вперёд-вниз к герою и возвращается (угол 0 — покой, −2π — снова он).
 */
const STAB: Keys = [[0, -0.35], [0.14, -1.9], [0.3, -2.25], [0.43, -3.3], [0.57, -4.78], [0.72, -4.95], [0.86, -5.7], [1, -2 * Math.PI]];

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
    // Ритуальный кинжал: замах — кинжал над капюшоном, выпад — удар сверху вниз к герою, корпус подаётся за ним.
    // Урон: отбросило, капюшон откинуло назад, из тени виден раскрытый рот.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.2, 2);
    const hem = 1.5 * p.wave(1);
    // Шепчет молитву: губы шевелятся, амулет на груди тлеет в такт, пальцы вытянутой руки подрагивают.
    const murmur = p.clip === 'idle' && p.wave(6) > 0.3;
    const pulse = (p.wave(2, 0.3) + 1) / 2;
    const twitch = p.snap(0.8 * p.wave(3, 0.2));

    p.pose({ dx: -6 * strike + 2 * wind + 4 * hurt, rot: 0.04 * wind - 0.06 * strike + 0.05 * hurt, px: 40, py: G }, () => {
      p.shadow(38, 26, 3);
      // Шаг к герою: из-под подола спереди выглядывает носок сапога.
      p.poly([12, G - 4, 22, G - 5, 25, G, 10, G], M.boot, { part: 'boot', bevel: 1 });
      // Балахон колоколом: спереди подол вынесен шагом, сзади волочится по полу.
      p.poly([
        30, 44 + up, 50, 44 + up, 56, 70, 62 + hem, 98, 64 + hem, G, 56 + hem * 0.8, 106, 50 + hem * 0.6, G, 42 + hem * 0.4, 106,
        36, G, 28, 106, 20, G, 12, 106, 16, 94, 24, 70,
      ], M.robe, { bevel: 8 });

      // Верх ссутулен и подан к герою.
      p.pose({ dy: 2, rot: -0.1, px: 40, py: 76 }, () => {
        // Дальняя рука тянется к герою: из широкого рукава — бледная кисть с тёмными когтями, пальцы скрючены.
        p.limb(32, 48 + up, 5, 20, 58 + up, 6, M.robe, { part: 'farArm', tone: -0.14 });
        p.poly([13, 54 + up, 22, 51 + up, 25, 63 + up, 15, 64 + up], M.robe, { part: 'farArm', bevel: 2, tone: -0.2 });
        p.ellipse(11, 59 + up, 3, 2.6, M.skin, { part: 'farHand', tone: -0.1 });
        for (let k = 0; k < 3; k++) {
          const y = 56.5 + up + k * 2 + (k === 1 ? twitch * 0.5 : 0);
          p.chain([[10, y, 0.8], [6, y - 0.5 + k * 0.4, 0.6], [4, y + 1, 0.5]], M.skin, { part: 'fingers', tone: -0.1 });
          p.px(3.5, y + 1.5, '#3a2420');
        }

        p.ellipse(40, 56 + up, 13, 14, M.robe);
        // Верёвочный пояс с кистями.
        p.limb(26, 70, 1.6, 54, 70, 1.6, M.rope, { part: 'belt' });
        p.chain([[32, 71, 1.2], [31 + hem * 0.3, 80, 1], [32 + hem * 0.5, 88, 0.9]], M.rope, { part: 'belt' });

        // Капюшон с мантией: острый верх назад, лицо в глубокой тени, из неё горят красные глаза.
        p.pose({ dx: p.snap(1.5 * hurt), dy: p.snap(2 - 2 * hurt), rot: -0.1 + 0.26 * hurt - 0.04 * strike, px: 38, py: 42 + up }, () => {
          p.poly([22, 46 + up, 30, 36 + up, 48, 36 + up, 56, 48 + up, 48, 52 + up, 38, 50 + up, 28, 53 + up], M.hood, { part: 'mantle', bevel: 4 });
          p.ellipse(38, 26 + up, 13, 14, M.hood, { part: 'hood' });
          p.poly([40, 14 + up, 54 + hurt * 3, 8 + up + hurt * 4, 50, 24 + up], M.hood, { part: 'hood', bevel: 3 });
          p.ellipse(31, 29 + up, 8, 10, M.shade, { part: 'hood', paint: true });
          // Из тени видны только подбородок и губы.
          p.ellipse(28.5, 35.5 + up, 4, 3.5, M.skin, { part: 'face', tone: -0.2 });
          if (hurt > 0.4 || strike > 0.4) p.block(25, 35 + up, 2, 2, '#1a0808');
          else if (murmur) p.block(25, 35.5 + up, 2, 1, '#2a0e0e');
          else p.line(25, 35.5 + up, 27.5, 35.5 + up, '#3a1a14');
          if (hurt < 0.4) {
            p.glow(28, 28 + up, 3, '#ff3a2a', 0.3 + 0.2 * wind);
            p.px(26, 28 + up, '#ff6a4a');
            p.px(30, 28 + up, '#c83a2a');
          }
        });

        // Амулет-знак на груди тлеет в такт молитве.
        p.line(32, 44 + up, 36, 52 + up, '#8a7050');
        p.line(44, 44 + up, 38, 52 + up, '#8a7050');
        p.glow(37, 55 + up, 3 + 2 * pulse, '#ff5a2a', 0.25 + 0.2 * pulse);
        p.poly([37, 52 + up, 40, 55 + up, 37, 58 + up, 34, 55 + up], M.gem, { part: 'amulet', bevel: 1 });

        // Ближняя рука — справа, поверх туловища: кинжал обратным хватом у бедра, в ударе — дугой через капюшон к герою.
        p.pose({ rot: arc(p, STAB) - 0.3 * hurt, px: 48, py: 48 + up }, () => {
          p.limb(48, 48 + up, 5.2, 52, 62 + up, 5.6, M.robe, { part: 'nearArm' });
          p.poly([47, 58 + up, 57, 57 + up, 59, 69 + up, 49, 69 + up], M.robe, { part: 'nearArm', bevel: 2, tone: -0.1 });
          // Волнистый клинок-крис остриём вниз и вперёд, навершие над кулаком.
          const bx = 52, by = 72 + up;
          p.poly([bx - 1.3, by, bx + 1.3, by, bx + 0.6 + 0.8, by + 4, bx - 1.2, by + 7.5, bx + 0.2, by + 11, bx - 2, by + 15.5, bx - 2.3, by + 11, bx - 3, by + 7.5, bx - 1.2 - 0.8, by + 4], M.steel, { part: 'blade', bevel: 0.8 });
          p.limb(bx - 4, by - 0.5, 1, bx + 4, by - 0.5, 1, M.hilt, { part: 'guard' });
          p.limb(bx, by - 1, 1.2, bx, by - 6, 1.2, M.hilt, { part: 'grip' });
          p.ellipse(bx, by - 3.5, 3.2, 3, M.skin, { part: 'fist', tone: -0.05 });
          p.ellipse(bx, by - 8, 1.5, 1.5, M.gem, { part: 'pommel' });
          // Блик бежит по клинку в начале цикла, но не в первом кадре.
          const g = p.clip === 'idle' && p.t > 0.05 && p.t < 0.3 ? (p.t - 0.05) / 0.25 : -1;
          if (g >= 0) p.px(bx - 0.5 - 1.5 * g, by + 2 + 11 * g, '#ffffff');
        });
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
  skin: { base: '#c8a088', tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  beard: { base: '#a8a098', shag: 0.3, tex: { kind: 'fur', scale: 1.4, amp: 0.2, stretch: 2, angle: 1.4 } } as Mat,
  brass: { base: '#a07a2a', shine: 0.8, dither: 0 } as Mat,
  coal: { base: '#2a1a14' } as Mat,
  bone: { base: '#c8b8a0', dither: 0 } as Mat,
  boot: { base: '#241418' } as Mat,
};

export const firePriest: Model = {
  id: 'fire_priest',
  w: 84,
  h: 120,
  ground: 118,
  // Жаровня в кадре контакта выброшена к герою, пламя — на 30 единиц за рамкой.
  pad: 42,
  draw(p: Painter) {
    const M = PRIEST;
    const G = 118;
    // Пламя: замах — посох отведён назад, огонь в жаровне и на ладони взвивается; выпад — жаровня к герою,
    // из неё бьёт вспышка. Урон: отбросило, клобук набок, огонь сбит, глаза погасли.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.2, 2);
    const hem = 1.4 * p.wave(1, 0.2);
    const fl = p.wave(4, 0.1), fl2 = p.wave(5, 0.6);

    p.pose({ dx: -4 * strike + 4 * hurt, rot: 0.03 * wind - 0.04 * strike + 0.05 * hurt, px: 44, py: G }, () => {
      p.shadow(44, 26, 3);
      // Шаг к герою: носок сапога из-под подола.
      p.poly([14, G - 4, 24, G - 5, 27, G, 12, G], M.boot, { part: 'boot', bevel: 1 });
      // Ряса колоколом: спереди подол вынесен шагом, сзади волочится; золотая кайма по подолу.
      p.poly([32, 46 + up, 56, 46 + up, 62, 74, 68 + hem, 104, 68 + hem, G, 30, G, 16 + hem * 0.3, G, 18, 104, 26, 74], M.robe, { bevel: 8 });
      p.line(15 + hem * 0.3, G - 2, 67 + hem, G - 2, '#d8a830');

      // Верх ссутулен и подан к герою.
      p.pose({ dy: 2, rot: -0.07, px: 44, py: 78 }, () => {
        // Дальняя рука протянута к герою ладонью вверх, над ладонью пляшет огонь — в замахе он разгорается.
        p.limb(36, 50 + up, 5, 24, 60 + up, 6, M.robe, { part: 'farArm', tone: -0.14 });
        p.poly([17, 56 + up, 26, 53 + up, 29, 65 + up, 19, 66 + up], M.robe, { part: 'farArm', bevel: 2, tone: -0.2 });
        p.ellipse(14, 62 + up, 3.4, 2.2, M.skin, { part: 'farHand', tone: -0.1 });
        p.line(10, 61 + up, 13, 60 + up, '#8a6a58');
        const palm = (1 + 0.5 * wind + 0.4 * strike - 0.6 * hurt) * (1 + 0.1 * fl2);
        p.glow(13, 54 + up, 5 + 3 * wind, '#ff8a14', 0.3 + 0.2 * wind);
        flame(p, 13, 60 + up, 2.6, 9 * palm, 1.1 * fl, 2 * hurt - 3 * strike, 'Palm');

        // Туловище: золотая епитрахиль от ворота до подола с огненной вышивкой, пояс, солнце-огонь на груди.
        p.ellipse(44, 60 + up, 13, 15, M.robe);
        p.poly([40, 48 + up, 48, 48 + up, 49 + hem * 0.3, 104, 39 + hem * 0.2, 104], M.gold, { paint: true });
        for (let k = 0; k < 3; k++) p.poly([44, 80 + k * 9, 46, 84 + k * 9, 44, 88 + k * 9, 42, 84 + k * 9], M.under, { paint: true });
        p.poly([30, 68, 58, 68, 58, 73, 30, 73], M.gold, { paint: true });
        p.glow(44, 56 + up, 4, '#ff8a14', 0.3);
        p.disc(44, 56 + up, 2.2, '#d8a830');
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * 2 * Math.PI + p.t * Math.PI;
          p.px(44 + 4.2 * Math.cos(a), 56 + up + 4.2 * Math.sin(a), '#d8a830');
        }

        // Голова склонена: высокий золотой клобук, седая борода, глаза отражают огонь.
        p.pose({ dx: p.snap(hurt), dy: p.snap(2 - 2 * hurt), rot: -0.08 + 0.2 * hurt, px: 42, py: 46 + up }, () => {
          p.ellipse(40, 34 + up, 8, 9, M.skin, { part: 'head' });
          p.poly([32, 36 + up, 40, 37 + up, 46, 35 + up, 46, 46 + up, 40, 52 + up, 34, 46 + up], M.beard, { part: 'beard', bevel: 3 });
          p.limb(34, 32 + up, 1.8, 31, 36 + up, 1.7, M.skin, { part: 'nose', lift: 3 });
          p.ellipse(37, 30 + up, 6, 2.2, M.under, { part: 'head', paint: true });
          if (strike > 0.4 || hurt > 0.4) p.block(34, 39 + up, 2, 2, '#2a0e0e');
          p.pose({ rot: 0.2 * hurt, px: 42, py: 28 + up }, () => {
            p.poly([30, 30 + up, 50, 30 + up, 48, 14 + up, 42, 5 + up, 36, 8 + up, 32, 16 + up], M.gold, { part: 'mitre', bevel: 3 });
            p.poly([30, 28 + up, 50, 28 + up, 50, 31 + up, 30, 31 + up], M.trim, { part: 'mitre', paint: true });
            p.poly([38, 27 + up, 40.5, 18 + up, 42, 22 + up, 44, 16 + up, 45, 27 + up], M.under, { part: 'mitre', paint: true });
          });
          if (hurt < 0.4) {
            p.glow(35, 32 + up, 2.5, '#ffb428', 0.3 + 0.2 * wind);
            p.px(35, 32 + up, '#ffc850');
          } else p.line(33, 32 + up, 37, 32 + up, '#3a2018');
          p.line(32, 29.5 + up, 38, 30 + up + wind, '#6a5a50');
        });

        // Ближняя рука — справа, поверх туловища — держит посох с жаровней; на древке под чашей — череп.
        // В атаке посох ходит вокруг кисти: замах — назад, выпад — жаровня к герою.
        p.pose({ dy: -4 * wind, rot: 0.2 * wind - 1.0 * strike + 0.12 * hurt, px: 62, py: 62 + up }, () => {
          const Y = 30;
          p.chain([[63, G, 1.4], [62, 62, 1.6], [62, Y + 10, 1.7]], M.brass, { part: 'staff' });
          p.ellipse(62, Y + 11, 3.2, 3, M.bone, { part: 'skull' });
          p.block(60, Y + 10, 1, 1, '#2a1a14');
          p.block(62.5, Y + 10, 1, 1, '#2a1a14');
          // Чаша жаровни на ножке.
          p.poly([54, Y, 70, Y, 67, Y + 6, 57, Y + 6], M.brass, { part: 'bowl', bevel: 1.5 });
          p.ellipse(62, Y, 8, 1.8, M.coal, { part: 'bowl', lift: 1 });
          p.limb(62, Y + 6, 1.2, 62, Y + 8, 1.2, M.brass, { part: 'bowl' });
          const big = 1 + 0.5 * wind + 0.3 * strike - 0.5 * hurt;
          p.glow(62, Y - 8, 9 + 2 * fl + 5 * wind, '#ff8a14', 0.3 + 0.2 * wind);
          flame(p, 59, Y, 4, (14 + 2 * fl) * big, 1.4 * fl2, 2 * hurt + 3 * strike, 'B1');
          flame(p, 65.5, Y, 3.4, (10 + 2 * fl2) * big, 1.2 * fl, 1 + 2 * hurt + 3 * strike, 'B2');
          // Искры над огнём.
          for (let k = 0; k < 3; k++) {
            const f = (p.t * 2 + k / 3) % 1;
            p.px(62 + 4 * Math.sin((f + k) * 7), Y - 14 - f * 12, f < 0.5 ? '#ffd23a' : '#e03a0e');
          }
          if (strike > 0.5) {
            p.glow(50, Y - 4, 12, '#ffb428', 0.5);
            p.disc(56, Y - 4, 3.5, '#ffec90');
          }
        });
        p.limb(52, 50 + up, 5.2, 60, 60 + up, 6.2, M.robe, { part: 'nearArm' });
        p.poly([54, 56 + up, 64, 55 + up, 66, 68 + up, 56, 68 + up], M.robe, { part: 'nearArm', bevel: 2, tone: -0.1 });
        p.line(56, 68 + up, 66, 68 + up, '#d8a830');
        p.ellipse(62, 62 + up, 3, 3, M.skin, { part: 'hand' });
      });
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
  whip: { base: '#6a4834', tex: { kind: 'stripes', scale: 1.2, amp: 0.2, angle: 0.8 } } as Mat,
  barb: { base: '#e0e0e0', shine: 0.6, dither: 0 } as Mat,
  mouth: { base: '#2a0608', dither: 0 } as Mat,
};

/** Плеть: точки относительно кулака — лежит петлёй на полу (покой), закинута за плечо (замах), вытянута к герою (удар). */
const WHIP_REST: Array<[number, number]> = [[0, 0], [-1, 10], [-3, 20], [-6, 30], [-10, 40], [-16, 48], [-25, 52], [-34, 52]];
const WHIP_WIND: Array<[number, number]> = [[0, 0], [5, -3], [11, -4], [17, -2], [22, 3], [26, 10], [28, 18], [28, 26]];
const WHIP_HIT: Array<[number, number]> = [[0, 0], [-8, 1], [-16, 2], [-24, 4], [-32, 6], [-40, 8], [-47, 11], [-53, 15]];
/** Рука с плетью: плечо и предплечье по ходу клипа, градусы. */
const WHIP_UPPER: Keys = [[0, 110], [0.14, 240], [0.3, 252], [0.43, 215], [0.57, 175], [0.72, 150], [0.86, 115], [1, 100]];
const WHIP_FORE: Keys = [[0, 130], [0.14, 285], [0.3, 295], [0.43, 230], [0.57, 172], [0.72, 150], [0.86, 125], [1, 115]];

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
      // Козлиные ноги в боевой стойке: дальняя выставлена вперёд к герою, ближняя отставлена назад, колени согнуты.
      const leg = (pts: Array<[number, number, number]>, part: string, tone: number): void => {
        p.chain(pts, M.fur, { part, tone });
        const x = pts[pts.length - 1][0];
        p.poly([x - 6, G - 5, x + 4, G - 6, x + 5, G, x - 7, G], M.hoof, { part: `${part}Hoof`, tone, bevel: 1.5 });
      };
      // Развёрнут к герою вполоборота: дальние нога, плечо и рука — слева, у героя, и за телом; ближние — справа.
      leg([[54, 96, 8], [40, 108, 6], [46, 124, 4], [38, G - 4, 3.4]], 'far', -0.15);
      leg([[70, 96, 8.5], [74, 112, 6.2], [86, 124, 4.2], [82, G - 4, 3.5]], 'near', 0);

      // Хвост со стрелкой: хлещет за спиной.
      const tx = 3 * tail + 6 * hurt;
      p.chain([[76, 92, 3.5], [88, 100, 2.8], [98, 96 + tx * 0.3, 2.2], [104 + tx * 0.5, 84 + tx * 0.5, 1.6], [102 + tx, 74 + tx * 0.6, 1.2]], M.skin, { part: 'tail', tone: -0.1 });
      p.poly([102 + tx, 68 + tx * 0.6, 107 + tx, 75 + tx * 0.6, 97 + tx, 76 + tx * 0.6], M.dark, { part: 'tailTip', bevel: 1 });

      // Верх наклонён к герою вокруг бёдер, голова опущена.
      p.pose({ dy: 4, rot: -0.11, px: 62, py: 96 }, () => {
      // Дальняя рука согнута, когтистая лапа выставлена к герою; на запястье — кандалы с обрывком цепи, цепь раскачивается.
      const sw = p.wave(1, 0.3) * (1 - wind - strike) + 2 * hurt;
      p.chain([[46, 52 + up, 8], [36, 68 + up, 7], [26, 66 + up, 6]], M.skin, { part: 'farArm', tone: -0.16 });
      p.ellipse(22, 66 + up, 5.5, 5, M.skin, { part: 'farArm', tone: -0.16 });
      for (let k = 0; k < 3; k++) p.chain([[19, 63 + up + k * 3, 1], [15 - k, 64 + up + k * 4, 0.6]], M.hornTip, { part: 'farClaw', tone: -0.2 });
      p.limb(28, 61 + up, 3, 30, 71 + up, 3, M.iron, { part: 'cuff', tone: -0.12 });
      p.chain([[30, 72 + up, 1.1], [31 + sw, 80 + up, 1], [30 + sw * 2, 88 + up + creep, 1], [32 + sw * 2.5, 95 + up, 1]], M.iron, { part: 'chain', tone: -0.15 });

      // Торс: мощная грудь, узкая талия, бугры трапеций; ремни крест-накрест, кожаные полы с заклёпками.
      p.ellipse(60, 86, 12, 10, M.skin);
      p.ellipse(61, 64 + up, 20, 18 + breath * 0.8, M.skin);
      p.ellipse(62, 46 + up, 18, 9, M.skin);
      p.ellipse(47, 50 + up, 8, 7.5, M.skin, { tone: -0.12 });
      p.ellipse(51, 63 + up, 8, 6.5, M.skin, { lift: 2, tone: -0.06 });
      p.ellipse(68, 62 + up, 10, 7.5, M.skin, { lift: 3 });
      p.ellipse(78, 50 + up, 10, 9, M.skin, { lift: 2 });
      p.ellipse(56, 78 + up * 0.5, 8, 6, M.dark, { paint: true });
      p.line(52, 74 + up * 0.5, 60, 74 + up * 0.5, '#5a1420');
      p.line(52, 80 + up * 0.5, 60, 80 + up * 0.5, '#5a1420');
      p.poly([42, 52 + up, 48, 48 + up, 76, 86, 70, 88], M.leather, { paint: true });
      p.poly([74, 48 + up, 80, 52 + up, 52, 88, 46, 84], M.leather, { paint: true });
      p.poly([44, 86, 76, 86, 76, 93, 44, 93], M.leather, { part: 'belt', bevel: 1.5 });
      p.ellipse(60, 89.5, 3, 3, M.iron, { part: 'buckle' });
      // Кожаные полы: передняя и задняя, между ними видны ноги.
      p.poly([46, 92, 58, 92, 57 + creep * 0.5, 116, 52, 119, 46 + creep * 0.4, 115], M.leather, { part: 'flap', bevel: 2 });
      p.poly([64, 92, 76, 92, 78 + creep * 0.3, 112, 72, 114, 66, 110], M.leather, { part: 'flapFar', bevel: 2, tone: -0.15 });
      for (const [x, y] of [[50, 98], [54, 106], [50, 112], [70, 98]]) p.px(x, y, '#a8a8b0');
      // Крюки на поясе.
      p.chain([[76, 94, 1], [78, 100, 1], [76, 104, 0.9], [73, 102, 0.8]], M.iron, { part: 'hook' });

      // Голова на короткой бычьей шее над плечами, чуть вперёд: рога дугой, острое ухо, пасть с клыками, глаза горят.
      p.limb(62, 48 + up, 9, 55, 36 + up, 8, M.skin);
      p.pose({ dx: p.snap(-2 * strike + 2 * hurt - 1), dy: up + p.snap(3 - 3 * hurt), rot: -0.1 + 0.06 * wind - 0.05 * strike + 0.3 * hurt, px: 58, py: 40 }, () => {
        // Дальний рог — со стороны героя, за головой.
        p.chain([[50, 20, 4], [44, 12, 3.2], [42, 4, 2.2], [46, 0, 1]], M.horn, { part: 'hornFar', tone: -0.15 });
        p.poly([41, 6, 43, 1, 47, 0], M.hornTip, { part: 'hornFar', paint: true });
        p.poly([60, 28, 72 + 2 * hurt, 24 + 3 * hurt, 62, 33], M.skin, { part: 'ear', bevel: 1.5, tone: -0.1 });
        const open = 2 * wind + 3 * strike + 4 * hurt;
        p.ellipse(46, 38 + open * 0.6, 8, 4.5, M.skin, { part: 'jaw', tone: -0.1 });
        p.ellipse(55, 28, 11, 10.5, M.skin, { part: 'head' });
        p.ellipse(46, 33, 8, 6, M.skin, { part: 'head' });
        p.ellipse(49, 23, 8.5, 3, M.dark, { part: 'head', paint: true });
        // Ближний рог: толстый, загибается вверх и назад.
        p.chain([[60, 19, 4.6], [68, 11, 3.6], [70, 3, 2.4], [66, 0, 1.2]], M.horn, { part: 'horn' });
        p.poly([69, 6, 71, 1, 66, 0, 67, 5], M.hornTip, { part: 'horn', paint: true });
        if (open > 1.5) {
          p.poly([38, 35, 50, 35, 49, 36 + open, 39, 36 + open * 0.8], M.mouth, { part: 'maw', bevel: 0.6 });
          p.poly([40, 35, 42, 35, 41, 38], M.hornTip, { part: 'fang' });
          p.poly([46, 35, 48, 35, 47, 38], M.hornTip, { part: 'fang' });
        } else {
          p.line(38, 35.5, 50, 36, '#2a0608');
          p.px(40, 36.5, '#e8e0d0');
          p.px(46, 36.5, '#e8e0d0');
        }
        const shut = hurt > 0.4 ? 1 : p.blink(0.62);
        if (shut < 1) p.glow(45, 27, 3.5 + 2 * wind, '#ffc830', 0.4);
        p.eye(45, 27, 1.7, '#ffd23a', { closed: shut, glint: '#fffbe0', lid: '#2a0608' });
        p.line(40, 24, 50, 25.5 + 1.5 * wind, '#2a0608');
      });

      // Ближняя рука с плетью — справа, поверх туловища: в покое плеть свисает до пола, в ударе хлещет к герою.
      const a1 = ang(p, WHIP_UPPER, 100) - 20 * hurt;
      const a2 = ang(p, WHIP_FORE, 115) - 25 * hurt;
      const { ex, ey, hx, hy } = limb2(78, 52 + up, a1, 18, a2, 17);
      const pts = WHIP_REST.map((r, k) => {
        const [mx, my] = mixPt(r, WHIP_WIND[k], WHIP_HIT[k], wind, strike);
        const f = k / (WHIP_REST.length - 1);
        // В покое кончик лежит на полу: плеть под кулаком опирается на землю.
        const floor = G - 2 - (hy + my);
        const dy = wind + strike < 0.05 && floor < 0 ? floor : 0;
        return [hx + mx + 2 * creep * f * f + 10 * hurt * f, hy + my + dy - 6 * hurt * f, 2.3 - 1.2 * f] as [number, number, number];
      });
      p.chain(pts, M.whip, { part: 'whip' });
      // Стальные крючья по плети и на конце.
      for (const k of [3, 5, 7]) p.poly([pts[k][0] - 1.5, pts[k][1] + 1, pts[k][0], pts[k][1] - 2.5, pts[k][0] + 1.5, pts[k][1] + 1], M.barb, { part: 'barb' });
      p.limb(78, 52 + up, 8.5, ex, ey, 7.5, M.skin, { part: 'nearArm' });
      p.limb(ex, ey, 7, hx, hy, 5.5, M.skin, { part: 'nearArm' });
      p.limb(ex - 1, ey + 2, 6.5, (ex + hx) / 2, (ey + hy) / 2, 6, M.leather, { part: 'bracer' });
      p.ellipse(hx, hy, 5.8, 5.4, M.skin, { part: 'fist' });
      // Кожаный наплечник с железными шипами поверх ближнего плеча.
      p.poly([69, 52 + up, 72, 45 + up, 80, 43 + up, 87, 46 + up, 88, 52 + up, 78, 55 + up], M.leather, { part: 'pauldron', bevel: 2 });
      for (const [x, y] of [[73, 45], [79, 43], [85, 45]]) p.poly([x - 1.8, y + 2 + up, x - 0.5, y - 5 + up, x + 1.8, y + 2 + up], M.iron, { part: 'spike' });
      p.limb(hx, hy - 4, 2, hx, hy + 3, 2, M.leather, { part: 'grip' });
      });
    });
  },
};

// ─── Каменный голем ─────────────────────────────────────────────────────────

const GOLEM = {
  stone: { base: '#5a524e', tex: { kind: 'noise', scale: 3, amp: 0.24 } } as Mat,
  dark: { base: '#3c3634', tex: { kind: 'noise', scale: 2.5, amp: 0.22 } } as Mat,
  facet: { base: '#6e6660', tex: { kind: 'noise', scale: 2, amp: 0.2 } } as Mat,
  shard: { base: '#2c2632', shine: 0.8, dither: 0 } as Mat,
  magma: { base: '#ff8a14', glow: true, dither: 0, ramp: ['#c83c0c', '#e0520e', '#f06a10', '#ff8414', '#ffa21e'] } as Mat,
};
/** Провалы в камне — глазницы и пасть голема: почти чёрные, из них светят угли. */
const GOLEM_PIT: Mat = { base: '#1c1618', dither: 0 };

/**
 * Удар кулаком сверху ближней (правой) рукой: из покоя (кулак у земли) рука уходит назад-вверх, через голову
 * обрушивается вперёд-вниз к герою и опускается в покой (угол 0 — покой, −2π — снова он).
 */
const POUND: Keys = [[0, -0.4], [0.14, -2.0], [0.3, -2.35], [0.43, -3.9], [0.57, -5.3], [0.72, -5.3], [0.86, -5.8], [1, -2 * Math.PI]];

export const golem: Model = {
  id: 'golem',
  w: 150,
  h: 152,
  ground: 150,
  // Кулак над головой в замахе поднимается выше осколков на спине на длину руки.
  pad: 64,
  draw(p: Painter) {
    const M = GOLEM;
    const G = 150;
    // Кулак: замах — рука из-за спины через голову, выпад — кулак обрушивается на героя, летят осколки.
    // Урон: откололись камни, голову откинуло, глаза погасли, лава в трещинах вспыхнула.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.5, 1);
    // Лава в трещинах пульсирует, из разлома в груди поднимаются искры; раз за цикл с плеча срывается камень.
    const heat = (p.wave(2, 0.3) + 1) / 2;
    const pebble = p.clip === 'idle' && p.t > 0.6 && p.t < 0.85 ? (p.t - 0.6) / 0.25 : -1;
    const hot = hurt > 0.3 ? '#ffe060' : heat > 0.5 ? '#ffa21e' : '#f06a10';
    const crack = (pts: number[]): void => {
      for (let k = 0; k + 3 < pts.length; k += 2) p.line(pts[k], pts[k + 1], pts[k + 2], pts[k + 3], hot);
    };
    /** Угловатая глыба: многоугольник с фаской — свет ложится гранями, а не куполом. */
    const rock = (pts: number[], mat: Mat, part: string, tone = 0, bevel = 3): void => p.poly(pts, mat, { part, tone, bevel });

    p.pose({ dx: -5 * strike + 2 * wind + 4 * hurt, rot: 0.03 * wind - 0.05 * strike + 0.04 * hurt, px: 80, py: G }, () => {
      p.shadow(78, 56, 4.5);
      // Короткие ноги-столбы из угловатых глыб, стопы-плиты.
      rock([52, 104, 72, 102, 77, 128, 71, 144, 52, 144, 47, 126], M.dark, 'far', -0.14);
      rock([42, 142, 74, 141, 79, G, 38, G], M.dark, 'far', -0.16, 2);
      rock([88, 106, 110, 104, 115, 128, 108, 144, 90, 144, 85, 126], M.stone, 'near');
      rock([84, 141, 114, 140, 119, G, 80, G], M.stone, 'near', -0.05, 2);
      crack([94, 116, 100, 124, 97, 132]);

      // Дальняя рука — слева, за телом: свисает почти до пола, кулак-глыба у земли перед ногами.
      p.chain([[50, 50 + up, 11], [38, 80 + up, 10], [31, 106 + up, 9]], M.dark, { part: 'farArm', tone: -0.12 });
      rock([14, 116 + up, 34, 110 + up, 42, 124 + up, 36, 140 + up, 16, 141 + up, 9, 128 + up], M.dark, 'farArm', -0.12);
      crack([22, 122 + up, 30, 128 + up]);

      // Туловище — сгорбленная глыба: плечи выше головы, спина горбом; грани светлее и темнее.
      rock([38, 60 + up, 48, 36 + up, 72, 24 + up, 100, 26 + up, 118, 44 + up, 118, 78, 104, 102, 88, 112, 62, 112, 52, 100, 42, 80], M.stone, 'body', 0, 6);
      p.poly([50, 38 + up, 72, 26 + up, 98, 28 + up, 86, 44 + up, 60, 46 + up], M.facet, { part: 'body', paint: true });
      p.poly([50, 96, 62, 110, 88, 110, 80, 96, 60, 90], M.dark, { part: 'body', paint: true });
      p.poly([104, 70, 118, 77, 104, 100, 100, 90], M.dark, { part: 'body', paint: true });
      // Осколки обсидиана торчат из горба и плеч — самая высокая часть силуэта.
      const shard = (x: number, y: number, tx: number, ty: number, w: number): void => {
        rock([x - w, y + up, tx, ty + up, x + w, y + up], M.shard, 'shards', 0, 1.5);
        p.line(x - w * 0.3, y + up - 1, tx - 0.5, ty + up + 2, '#6a6078');
      };
      shard(58, 38, 50, 16, 5);
      shard(76, 28, 76, 4, 6);
      shard(94, 30, 104, 10, 5.5);
      shard(112, 44, 128, 30, 5);
      // Сеть трещин с лавой и разлом в груди — сердце-горнило.
      crack([86, 58 + up, 92, 66 + up, 90, 74 + up]);
      crack([84, 34 + up, 88, 44 + up, 98, 50 + up, 108, 48 + up]);
      crack([60, 88, 66, 96, 64, 104]);
      crack([96, 62 + up, 104, 70 + up, 102, 82]);
      crack([80, 92, 90, 98, 88, 106]);
      // Разлом в груди — сердце-горнило: рваная щель, а не камень-самоцвет.
      p.glow(72, 72 + up, 8 + 3 * heat, '#ff8a14', 0.3 + 0.2 * heat);
      p.poly([68, 56 + up, 75, 61 + up, 72, 68 + up, 79, 75 + up, 73, 88, 69, 77 + up, 63, 70 + up, 69, 64 + up], M.magma, { part: 'core', bevel: 1.5 });
      p.line(71, 61 + up, 70, 67 + up, heat > 0.5 ? '#fff0a0' : '#ffd23a');
      p.line(70, 67 + up, 74, 76 + up, heat > 0.5 ? '#fff0a0' : '#ffd23a');

      // Голова — одна глыба, вросшая между плеч ниже их линии и выдвинутая к герою: темя уходит назад в горб,
      // лоб нависает над глубокими глазницами, из тени светят угли глаз; тяжёлая челюсть — тёмный провал с зубами.
      p.pose({ dx: p.snap(-3 * strike + 2 * hurt), dy: up + p.snap(-2 * wind - 2 * hurt), rot: 0.05 * wind - 0.04 * strike + 0.16 * hurt, px: 52, py: 60 }, () => p.scope(0.88, 60 * 0.12, 66 * 0.12, () => {
        const open = 1 + 2.5 * strike + 3 * hurt + 1.5 * wind;
        rock([36, 52, 46, 46, 60, 47, 66, 56, 64, 68, 57, 75 + open * 0.6, 44, 78 + open * 0.6, 31, 74 + open * 0.5, 29, 66, 33, 58], M.stone, 'head', 0, 3);
        // Темя светлой гранью — от него лоб читается козырьком над глазницами.
        p.poly([38, 50, 47, 46, 59, 47, 62, 53, 46, 54], M.facet, { part: 'head', paint: true });
        // Лицо под козырьком лба в тени — из неё светят только глаза.
        p.poly([28, 57, 44, 56, 60, 54, 65, 60, 64, 70, 57, 78, 44, 81, 30, 77], M.dark, { part: 'head', paint: true, tone: -0.1 });
        // Глазницы скошены к переносице — злой прищур; ближняя крупнее, дальняя сжата поворотом.
        p.poly([32, 57, 42, 59, 41, 63, 34, 62], GOLEM_PIT, { part: 'head', paint: true });
        p.poly([46, 59, 53, 56, 53, 61, 47, 62], GOLEM_PIT, { part: 'head', paint: true });
        // Пасть — трещина под тяжёлой челюстью; в замахе и от боли раскрывается, в глубине тлеет лава.
        // Зубов нет: ряд светлых точек на таком росте читается улыбкой.
        p.poly([34, 68, 46, 67, 57, 65, 56, 66 + open, 46, 68 + open, 36, 69 + open * 0.8], GOLEM_PIT, { part: 'head', paint: true });
        if (open > 1.5) p.line(40, 67 + open * 0.7, 53, 66 + open * 0.7, open > 3 ? '#e0520e' : '#8a2a0c');
        const glow = hurt > 0.4 ? 0.04 : 0.45 + 0.2 * heat + 0.35 * wind;
        p.glow(37, 60, 5, '#ff9f1c', glow);
        p.glow(50, 59, 3.5, '#ff9f1c', glow * 0.7);
        if (hurt > 0.4) {
          p.px(37, 60, '#3a2a24');
          p.px(50, 59, '#3a2a24');
        } else {
          const eye = wind > 0.4 ? '#fff0a0' : '#ffb428';
          p.line(35, 60, 39, 61, eye);
          p.line(49, 60, 51, 59, eye);
        }
        crack([60, 50, 64, 58, 62, 64]);
      }));

      // Ближнее плечо — плита справа, поверх туловища.
      rock([88, 34 + up, 110, 30 + up, 124, 46 + up, 118, 62 + up, 98, 64 + up, 86, 52 + up], M.stone, 'shoulder', 0.02, 4);
      crack([96, 40 + up, 104, 48 + up, 112, 44 + up]);
      // Ближняя рука одной глыбой — справа: в покое кулак у земли, в ударе дугой через голову обрушивается на героя.
      const phi = arc(p, POUND);
      p.pose({ rot: phi - 0.15 * hurt, px: 106, py: 52 + up }, () => {
        p.chain([[106, 52 + up, 12.5], [112, 82 + up, 11.5], [114, 104 + up, 10.5]], M.stone, { part: 'arm' });
        rock([102, 112 + up, 124, 108 + up, 133, 122 + up, 128, 138 + up, 108, 140 + up, 99, 127 + up], M.stone, 'arm', 0, 4);
        crack([108, 78 + up, 116, 84 + up, 114, 92 + up]);
        crack([106, 124 + up, 116, 130 + up, 124, 126 + up]);
        // Шипы на костяшках.
        for (const [x, y] of [[104, 112], [112, 109], [120, 110]]) rock([x - 2.5, y + 2 + up, x - 1, y - 5 + up, x + 2.5, y + 2 + up], M.shard, 'knuckles', 0, 1);
      });
      // Осколки и пыль от удара кулака в кадрах контакта.
      if (strike > 0.6) {
        const c = Math.cos(phi), sn = Math.sin(phi);
        const cx = 106 + 12 * c - 72 * sn, cy = 52 + up + 12 * sn + 72 * c;
        for (const [ox, oy, r] of [[-14, -6, 4], [-8, 8, 5], [-18, 4, 3.5]]) p.disc(cx + ox * strike, cy + oy, r * strike, '#8a7a6ab0', true);
        for (const [ox, oy] of [[-20, -10], [-12, -16], [-22, 6]]) p.block(cx + ox * strike, cy + oy * strike, 2, 2, '#5a524e');
      }
      // Камни от удара.
      if (hurt > 0.2) for (const [ox, oy] of [[-4, -20], [10, -26], [24, -16]]) p.block(64 + ox * (1.6 - hurt), 44 + oy * hurt, 2, 2, '#6e6660');
      if (pebble >= 0) p.block(116, 44 + pebble * (G - 48), 2, 1, '#6e6660');
    });
  },
};

// ─── Огненный элементаль ────────────────────────────────────────────────────

const ELEM = {
  /** Тёмно-красная кромка пламени: даёт фигуре силуэт на светлом огне пещеры. */
  edge: { base: '#a8200a', glow: true, dither: 0, ramp: ['#701004', '#861406', '#9a1a08', '#ae200a', '#c0260a'] } as Mat,
  /** Обугленная кость черепа, рёбер и когтей: тёмная, освещена снизу собственным огнём. */
  bone: { base: '#6e5c52', tex: { kind: 'noise', scale: 1.6, amp: 0.25 } } as Mat,
  horn: { base: '#2e1c18', tex: { kind: 'stripes', scale: 1.5, amp: 0.2, angle: 0.4 } } as Mat,
  claw: { base: '#241412', shine: 0.5, dither: 0 } as Mat,
  socket: { base: '#140604', dither: 0 } as Mat,
};

export const fireElemental: Model = {
  id: 'fire_elemental',
  w: 120,
  h: 152,
  ground: 150,
  // Когти и огненный шар в кадре контакта — на 40 единиц левее рамки.
  pad: 50,
  draw(p: Painter) {
    const M = ELEM;
    const G = 150;
    // Пламя: замах — встаёт в рост, руки вскинуты, пасть черепа раскрыта, огонь взвивается; выпад — бросок
    // к герою, когти наотмашь, из ладони летит огненный шар. Урон: пламя прибило, череп откинуло, глаза гаснут.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const sq = 1 - 0.16 * hurt;
    const f1 = p.wave(4, 0.1), f2 = p.wave(3, 0.45), f3 = p.wave(5, 0.7), f4 = p.wave(4, 0.8);
    const sway = p.wave(1, 0.2);
    const bob = p.bob(1.5, 2);
    const Y = (y: number): number => G - (G - y) * sq + bob * (1 - (y - 40) / 110);
    // Сутулость: в покое голова ниже плеч, в замахе встаёт в рост, в выпаде кидается вперёд.
    const lean = p.snap(-3 * wind + 6 * strike + 3 * hurt);
    const heat = (p.wave(2, 0.2) + 1) / 2;

    p.pose({ dx: -6 * strike + 3 * wind + 5 * hurt, rot: 0.05 * wind - 0.06 * strike + 0.06 * hurt, px: 64, py: G }, () => {
      // Отсвет на полу и лужа огня у основания.
      p.glow(64, G - 2, 30, '#ff8a14', 0.2);
      p.ellipse(64, G - 2.5, 24, 2.5, M.edge, { part: 'pool' });
      p.ellipse(64, G - 2.5, 15, 1.6, FLAME.mid, { part: 'poolMid', noLine: true });
      for (let k = 0; k < 5; k++) flame(p, 46 + k * 9, G - 3, 2.6, 7 + 3 * p.wave(4, k * 0.23), 1.2 * p.wave(5, k * 0.31), 1, `P${k % 2}`);

      // Грива огня с хребта и плеч рвётся вверх и назад — самая высокая часть силуэта.
      flame(p, 78, Y(52), 7, (34 + 4 * f1 + 6 * wind) * sq, 2 * f2, 12 + 6 * hurt, 'B1');
      flame(p, 68, Y(46), 6, (30 + 3 * f3 + 6 * wind) * sq, 1.8 * f4, 10 + 6 * hurt, 'B2');
      flame(p, 86, Y(64), 5, (22 + 3 * f2) * sq, 1.6 * f1, 12 + 4 * hurt, 'B3');

      // Развёрнут к герою вполоборота: дальняя рука — слева, у героя, за телом; ближняя, с когтями, — справа, поверх.
      const [fx, fy] = mixPt([34, 100], [40, 30], [30, 78], wind, strike);
      const [fex, fey] = mixPt([36, 78], [34, 44], [34, 66], wind, strike);
      p.chain([[44, Y(54), 7], [fex, Y(fey), 5.5], [fx, Y(fy), 4.5]], M.edge, { part: 'farArm', tone: -0.1 });
      p.chain([[44, Y(56), 3.5], [fex, Y(fey), 2.6], [fx, Y(fy), 2]], FLAME.outer, { part: 'farArmMid', noLine: true });
      for (let k = 0; k < 3; k++) p.chain([[fx - 2 + k * 2, Y(fy) + 2, 1.2], [fx - 3 + k * 2.5, Y(fy) + 9, 0.5]], M.claw, { part: 'farClaw', tone: -0.2 });

      // Столб-вихрь вместо ног: сужается к полу и расходится у основания.
      const tw = 3 * sway;
      const column = (k: number, mat: Mat, part: string, inner: boolean): void => {
        p.chain([[64, Y(90), 10 * k], [61 + tw * 0.6, Y(108), 5.5 * k], [67 - tw * 0.6, Y(126), 4 * k], [64, Y(146), 10 * k]], mat, { part, noLine: inner });
      };
      // Торс сутулый: грудь вперёд-вниз, плечи высоко.
      const torso = (k: number, mat: Mat, part: string, inner: boolean): void => {
        p.ellipse(62 - lean * 0.5, Y(54), 25 * k, 11 * k, mat, { part, noLine: inner });
        p.ellipse(63 - lean * 0.3, Y(68), 18 * k, 15 * sq * k, mat, { part, noLine: inner });
        p.ellipse(64 - lean * 0.1, Y(84), 11 * k, 9 * sq * k, mat, { part, noLine: inner });
      };
      column(1, M.edge, 'body', false);
      torso(1, M.edge, 'body', false);
      // Рваный край: мелкие языки по силуэту столба и боков.
      const tongues: Array<[number, number, number]> = [
        [74, 84, 11], [68, 104, 12], [56, 98, 10], [58, 120, 11], [70, 126, 10], [62, 138, 9], [48, 72, 9], [80, 70, 11], [88, 54, 12], [52, 112, 9],
      ];
      tongues.forEach(([x, y, len], k) => flame(p, x, Y(y), 2.6, len * sq * (1 + 0.25 * p.wave(4, k * 0.37)), 1.2 * p.wave(5, k * 0.29), 4 + 3 * hurt, 'T'));
      column(0.6, FLAME.outer, 'bodyMid', true);
      torso(0.62, FLAME.outer, 'bodyMid', true);
      column(0.32, FLAME.mid, 'bodyIn', true);
      torso(0.4, FLAME.mid, 'bodyIn', true);
      // Сердце в клетке рёбер: жёлтый жар за обугленными костями.
      p.ellipse(60 - lean * 0.3, Y(70), 7 + heat, 8 * sq, FLAME.core, { part: 'heart', noLine: true });
      p.glow(60 - lean * 0.3, Y(70), 11 + 2 * heat, '#ffd23a', 0.25);
      // Рёбра: чёрные дуги поверх огня от хребта к грудине — клетка, в которой горит сердце.
      for (let k = 0; k < 3; k++) {
        const y = Y(60 + k * 8);
        const x = 74 - lean * 0.35;
        const w = 17 - k * 3;
        p.chain([[x, y - 2, 1.5], [x - w * 0.5, y - 3, 1.4], [x - w, y + 1 + k, 1.2], [x - w + 1, y + 4 + k, 0.8]], M.bone, { part: 'ribs', tone: -0.05 * k });
      }

      // Череп: выдвинут вперёд и ниже плеч, пасть в оскале, глазницы горят белым; пламя стекает с темени назад.
      p.pose({ dx: p.snap(-lean + 2 * hurt), dy: p.snap(bob + 3 * hurt + 3 * strike - 5 * wind), rot: 0.1 * wind - 0.08 * strike + 0.28 * hurt, px: 50, py: 52 }, () => {
        const hy = Y(40) - bob;
        flame(p, 54, hy - 8, 6, (24 + 3 * f1 + 4 * wind) * sq, 1.8 * f2, 14 + 6 * hurt, 'H1');
        flame(p, 46, hy - 10, 5, (18 + 2 * f3) * sq, 1.4 * f4, 12 + 5 * hurt, 'H2');
        // Рога: обугленные, загнуты назад над теменем.
        p.chain([[50, hy - 9, 2.6], [58, hy - 15, 2], [66, hy - 15, 1.3], [70, hy - 12, 0.6]], M.horn, { part: 'hornFar', tone: -0.2 });
        const open = 0.1 + 0.35 * wind + 0.3 * strike + 0.35 * hurt + 0.06 * heat;
        // Нижняя челюсть на шарнире.
        p.pose({ rot: -open, px: 50, py: hy + 6 }, () => {
          p.poly([51, hy + 5, 30, hy + 6, 29, hy + 11, 40, hy + 15, 51, hy + 11], M.bone, { part: 'jaw', bevel: 1.4, tone: -0.1 });
          for (const x of [31, 35, 39, 43]) p.px(x, hy + 5.5, '#b8a898');
        });
        // Жар из пасти.
        p.glow(34, hy + 7, 5 + 6 * open, '#ffb428', 0.25 + 0.5 * open);
        if (open > 0.22) p.poly([30, hy + 5.5, 48, hy + 5.5, 47, hy + 6 + open * 10, 31, hy + 6 + open * 8], FLAME.mid, { part: 'mawFire', bevel: 1, noLine: true });
        p.ellipse(45, hy - 3, 12, 11, M.bone, { part: 'skull' });
        p.ellipse(35, hy + 3, 8, 5.5, M.bone, { part: 'skull' });
        p.ellipse(42, hy - 10, 10, 3.5, M.bone, { part: 'skull', lift: 3, tone: -0.1 });
        // Глазницы глубокие, в них тлеют две искры жара — без век: череп не моргает, только разгорается на замахе.
        p.ellipse(38, hy - 2.5, 2.8, 2.4, M.socket, { part: 'skull', paint: true });
        p.ellipse(47, hy - 3, 2.4, 2.4, M.socket, { part: 'skull', paint: true });
        p.poly([31, hy + 2, 33.5, hy - 1, 35, hy + 3], M.socket, { part: 'skull', paint: true });
        for (const x of [31, 34, 37, 40, 43]) p.px(x, hy + 5, '#b8a898');
        if (hurt < 0.4) {
          p.glow(38, hy - 2.5, 2.5 + 1.5 * wind, '#ffd23a', 0.3 + 0.25 * wind);
          p.px(38, hy - 2.5, wind > 0.4 ? '#ffffff' : '#ffe27a');
          p.px(47, hy - 3, '#ffb428');
        } else {
          p.px(38, hy - 2.5, '#6a1a06');
          p.px(47, hy - 3, '#6a1a06');
        }
        // Ближний рог и трещины по кости, светятся изнутри.
        p.chain([[44, hy - 11, 3], [50, hy - 19, 2.3], [58, hy - 22, 1.5], [63, hy - 20, 0.7]], M.horn, { part: 'horn' });
        p.line(52, hy - 12, 54, hy - 5, '#ff8a14');
        p.line(54, hy - 5, 52, hy - 1, '#ff8a14');
        p.line(41, hy - 13, 42, hy - 8, '#e05a10');
      });

      // Ближняя рука — справа, поверх туловища: длинная, до колен, кость в пламени, три чёрных когтя;
      // в замахе вскинута над головой, в выпаде — наотмашь поперёк груди к герою.
      const [hx, hy] = mixPt([94, 100], [76, 12], [12, 66], wind, strike);
      const [ex, ey] = mixPt([92, 76], [88, 34], [50, 60], wind, strike);
      p.chain([[84, Y(54), 8], [ex, Y(ey), 6], [hx, Y(hy), 5]], M.edge, { part: 'nearArm' });
      flame(p, ex + 3, Y(ey), 2.6, 9 + 2 * f4, 1.2 * f1, 5, 'T');
      p.chain([[84, Y(54), 4.5], [ex, Y(ey), 3.4], [hx, Y(hy), 3]], FLAME.outer, { part: 'nearArmMid', noLine: true });
      p.chain([[84, Y(55), 1.6], [ex, Y(ey), 1.4], [hx, Y(hy), 1.3]], M.bone, { part: 'armBone' });
      // Когти: в покое свисают, в выпаде растопырены к герою.
      const ca = 100 + 70 * strike - 170 * wind;
      for (let k = 0; k < 3; k++) {
        const [cx1, cy1] = at(hx, Y(hy), ca - 22 + k * 20, 7);
        const [cx2, cy2] = at(hx, Y(hy), ca - 30 + k * 22, 13);
        p.chain([[hx, Y(hy), 1.8], [cx1, cy1, 1.2], [cx2, cy2, 0.5]], M.claw, { part: 'claw' });
      }

      // Огненный шар: копится в ладони на замахе, летит к герою в кадрах 4–5.
      if (p.clip === 'attack') {
        if (p.u < 0.43) fireball(p, hx, Y(hy) - 6, 2 + 5 * wind, 0, 'Hand');
        else if (p.u < 0.62) fireball(p, p.u < 0.5 ? 2 : -20, 62, 7, 12);
      }
      // Искры поднимаются, от удара разлетаются.
      const n = hurt > 0.3 ? 8 : 4;
      for (let k = 0; k < n; k++) {
        const f = (p.t * 2 + k / n) % 1;
        const a = k * 2.4 + hurt * 3;
        const r = hurt > 0.3 ? 30 * (1.2 - hurt) : 0;
        p.px(66 + 26 * Math.cos(a) * (0.5 + f * 0.5) + r * Math.cos(a), Y(120) - f * 100 + r * Math.sin(a), f < 0.5 ? '#ffd23a' : '#e03a0e');
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
  chest: { base: '#946a44', tex: { kind: 'noise', scale: 2.5, amp: 0.12 } } as Mat,
  horn: { base: '#ede0d4', tex: { kind: 'stripes', scale: 2, amp: 0.15, angle: 0.3 } } as Mat,
  hoof: { base: '#241a14', dither: 0 } as Mat,
  leather: { base: '#5b3a1e', tex: { kind: 'noise', scale: 2, amp: 0.14 } } as Mat,
  gold: { base: '#c89a3a', shine: 0.9, dither: 0 } as Mat,
  steel: { base: '#9aa0a8', shine: 1, dither: 0 } as Mat,
  haft: { base: '#5a3a22', tex: { kind: 'stripes', scale: 1.5, amp: 0.15 } } as Mat,
  nostril: { base: '#1e1410', dither: 0 } as Mat,
};

/**
 * Удар секирой ближней (правой) рукой: направления плеча, предплечья и древка по ходу клипа, градусы
 * (90 — вниз, 180 — к герою, 270 — вверх, 360 — назад). В покое секира лежит на плече лезвием за спиной;
 * замах — рука взлетает, лезвие уходит выше головы; удар — через голову наискось к герою; потом снова на плечо.
 */
const CLEAVE_UPPER: Keys = [[0, 110], [0.14, 235], [0.3, 250], [0.43, 215], [0.57, 165], [0.72, 155], [0.86, 125], [1, 100]];
const CLEAVE_FORE: Keys = [[0, 230], [0.14, 270], [0.3, 280], [0.43, 225], [0.57, 158], [0.72, 150], [0.86, 190], [1, 220]];
const CLEAVE_AXE: Keys = [[0, 305], [0.14, 325], [0.3, 332], [0.43, 240], [0.57, 135], [0.72, 128], [0.86, 220], [1, 300]];

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
      // Боевая стойка: ноги широко, дальняя — вперёд к герою, ближняя отставлена назад; колени согнуты.
      const leg = (pts: Array<[number, number, number]>, part: string, tone: number): void => {
        p.chain(pts, M.legs, { part, tone });
        const x = pts[pts.length - 1][0];
        p.poly([x - 7, G - 6, x + 5, G - 6, x + 6, G, x - 8, G], M.hoof, { part: `${part}Hoof`, tone, bevel: 1.5 });
        p.line(x - 1, G - 5, x - 1, G - 1, '#4a3a30');
      };
      // Развёрнут к герою вполоборота: дальние нога, плечо и рука — слева, у героя, и за телом; ближние — справа.
      leg([[60, 110, 11], [44, 124, 8], [50, 140, 5.5], [42, G - 5, 4.5]], 'far', -0.15);
      leg([[80, 110, 11.5], [88, 126, 8.5], [100, 140, 5.5], [96, G - 5, 4.5]], 'near', 0);
      // Хвост с кисточкой хлещет.
      const tx = 4 * tail + 5 * hurt;
      p.chain([[88, 102, 2.6], [100, 106, 2], [108 + tx * 0.5, 116, 1.6], [110 + tx, 128, 1.3]], M.fur, { part: 'tail', tone: -0.1 });
      p.ellipse(110 + tx, 132, 2.6, 4, M.dark, { part: 'tail' });

      // Верх наклонён к герою вокруг бёдер: плечи вперёд, голова опущена рогами к герою.
      p.pose({ dy: 4, rot: -0.1, px: 70, py: 110 }, () => {
      // Дальняя рука согнута, кулак выставлен вперёд на уровне пояса; золотой браслет.
      p.chain([[44, 58 + up, 9.5], [34, 78 + up, 8], [22, 82 + up, 7]], M.fur, { part: 'farArm', tone: -0.16 });
      p.ellipse(18, 82 + up, 7, 6.5, M.fur, { part: 'farArm', tone: -0.16 });
      p.limb(26, 76 + up, 4, 28, 87 + up, 4, M.gold, { part: 'bracelet', tone: -0.12 });

      // Торс грудью к зрителю, вполоборота к герою: грудные мышцы, пресс, плечи по бокам; тёмная шерсть по груди.
      p.ellipse(66, 96, 19, 11, M.fur);
      p.ellipse(64, 70 + up, 26, 21 + breath, M.fur);
      p.ellipse(64, 50 + up, 22, 9, M.fur);
      p.ellipse(44, 56 + up, 9.5, 9, M.fur, { tone: -0.14 });
      p.ellipse(53, 64 + up, 10, 8, M.fur, { lift: 2, tone: -0.06 });
      p.ellipse(74, 64 + up, 12, 9, M.fur, { lift: 3 });
      p.ellipse(63, 85 + up * 0.5, 11, 8, M.fur, { lift: 1.5 });
      p.ellipse(53, 65 + up, 8, 6, M.chest, { paint: true, tone: -0.06 });
      p.ellipse(74, 65 + up, 10, 7, M.chest, { paint: true });
      p.ellipse(63, 86 + up * 0.5, 9, 6, M.chest, { paint: true });
      p.ellipse(64, 60 + up, 4, 8, M.dark, { paint: true });
      p.line(54, 73 + up, 62, 74 + up, '#3e2818');
      p.line(66, 73 + up, 74, 72 + up, '#3e2818');
      p.line(63, 80 + up * 0.5, 63, 92, '#3e2818');
      p.line(56, 85 + up * 0.5, 70, 85 + up * 0.5, '#3e2818');
      p.poly([42, 94, 90, 94, 90, 101, 42, 101], M.leather, { part: 'belt', bevel: 1.5 });
      p.ellipse(64, 97.5, 4, 3.5, M.gold, { part: 'belt', lift: 2 });
      // Килт из кожаных полос расходится в стойке, спереди — длинная полоса с бляхами.
      p.poly([42, 100, 88, 100, 98, 118, 88, 121, 80, 115, 72, 120, 52, 118, 44, 122, 34, 117], M.leather, { part: 'kilt', bevel: 3 });
      p.poly([57, 100, 71, 100, 70, 130, 64, 127, 58, 130], M.leather, { part: 'kiltFront', bevel: 2, tone: 0.06 });
      for (const [x, y] of [[64, 108], [64, 118], [46, 108], [84, 108]]) p.px(x, y, '#c89a3a');

      // Голова быка над плечами, вполоборота к герою: оба рога в стороны и вверх, морда вниз-вперёд, кольцо в носу.
      p.limb(64, 50 + up, 11, 60, 38 + up, 10, M.fur);
      p.pose({ dx: p.snap(-3 * strike + 2 * hurt - 2), dy: up + p.snap(5 + 2 * wind - 5 * hurt), rot: -0.14 - 0.08 * wind + 0.12 * strike + 0.34 * hurt, px: 60, py: 44 }, () => {
        // Грива за головой.
        p.ellipse(68, 30, 11, 12, M.dark, { part: 'mane' });
        // Дальний рог и ухо — со стороны героя, за головой.
        p.chain([[52, 20, 4.4], [42, 15, 3.6], [34, 8, 2.6], [34, 1, 1.2]], M.horn, { part: 'hornFar', tone: -0.12 });
        p.poly([50, 26, 40 - 2 * hurt, 29 + hurt, 48, 32], M.fur, { part: 'earFar', bevel: 1.5, tone: -0.15 });
        const open = 2 * wind + 2 * strike + 5 * hurt;
        p.ellipse(48, 51 + open * 0.5, 7.5, 4, M.muzzle, { part: 'jaw', tone: -0.15 });
        p.ellipse(60, 30, 13.5, 13.5, M.fur, { part: 'head' });
        p.limb(57, 36, 11, 49, 46, 9, M.fur, { part: 'head' });
        p.ellipse(47, 48, 10, 7, M.muzzle, { part: 'head', lift: 3 });
        p.ellipse(60, 21, 10, 4, M.dark, { part: 'head', paint: true });
        // Ноздри и кольцо.
        p.ellipse(43, 47, 1.6, 1.4, M.nostril, { part: 'nose', lift: 6 });
        p.ellipse(49.5, 47.5, 1.5, 1.3, M.nostril, { part: 'nose', lift: 6 });
        p.limb(46, 50, 0.9, 45, 55, 0.9, M.gold, { part: 'ring' });
        p.limb(45, 55, 0.9, 49, 54.5, 0.9, M.gold, { part: 'ring' });
        p.limb(49, 54.5, 0.9, 48, 50, 0.9, M.gold, { part: 'ring' });
        if (open > 2) p.poly([42, 51, 54, 51, 53, 52 + open, 43, 52 + open * 0.8], M.nostril, { part: 'maw', bevel: 0.6 });
        // Ближнее ухо и рог: толстый у лба, дугой в сторону и вверх.
        p.poly([70, 26, 82 + 2 * hurt, 29 + hurt, 72, 32], M.fur, { part: 'ear', bevel: 1.5 });
        p.chain([[68, 20, 5], [78, 15, 4], [86, 8, 2.9], [87, 0, 1.3]], M.horn, { part: 'horn' });
        // Глаза посажены глубоко под тёмным лбом, горят красным.
        const shut = hurt > 0.4 ? 1 : p.blink(0.7);
        if (shut < 1) p.glow(63, 30.5, 3, '#ff5a2a', 0.35);
        p.eye(52, 31, 1.3, '#d8401a', { closed: shut, lid: '#1e1410' });
        p.eye(63, 30.5, 1.7, '#ff5a2a', { closed: shut, glint: '#ffd0a0', lid: '#1e1410' });
        p.line(48, 27.5, 56, 29 + 2 * wind, '#2a1a10');
        p.line(61, 28.5 + 2 * wind, 67, 27.5, '#2a1a10');
        // Пар из ноздрей.
        const steam = (f: number, a: number): void => {
          for (let k = 0; k < 3; k++) {
            const g = Math.min(1, f + k * 0.15);
            p.disc(42 - g * 12, 48 + g * 6 + k, 1.2 + g * 2, `#d8d0c8${hexA(a * (1 - g))}`);
          }
        };
        if (snort >= 0) steam(snort, 0.6);
        if (hurt > 0.3) steam(1 - hurt, 0.7);
      });

      // Цепь с кольцом-подвеской на груди: сразу видно, что стоит к нам лицом.
      p.chain([[48, 50 + up, 1.1], [56, 57 + up, 1.1], [64, 59 + up, 1.1], [72, 56 + up, 1.1], [80, 50 + up, 1.1]], M.gold, { part: 'chain' });
      p.ellipse(64, 63 + up, 3, 3, M.gold, { part: 'pendant' });
      p.px(64, 63 + up, '#3e2818');
      // Ближняя рука с секирой — справа, поверх туловища: в покое секира на плече, в ударе рубит через голову к герою.
      const a1 = ang(p, CLEAVE_UPPER, 100) - 15 * hurt;
      const a2 = ang(p, CLEAVE_FORE, 220) - 20 * hurt;
      const a3 = ang(p, CLEAVE_AXE, 300) + 15 * hurt;
      const { ex, ey, hx, hy } = limb2(86, 58 + up, a1, 16, a2, 16);
      // Секира: древко от навершия за кулаком к лезвию, два полумесяца стали по сторонам от древка.
      const ux = Math.cos(a3 * DEG), uy = Math.sin(a3 * DEG), nx = -uy, ny = ux;
      const P = (f: number, s: number): [number, number] => [hx + ux * f + nx * s, hy + uy * f + ny * s];
      p.limb(...P(-14, 0), 2.4, ...P(50, 0), 2.2, M.haft, { part: 'haft' });
      p.limb(...P(-16, 0), 2.6, ...P(-12, 0), 2.6, M.gold, { part: 'pommel' });
      p.poly([...P(34, 2), ...P(28, 14), ...P(42, 21), ...P(56, 14), ...P(50, 2)], M.steel, { part: 'blade', bevel: 1.8 });
      p.poly([...P(35, -2), ...P(30, -12), ...P(42, -17), ...P(54, -12), ...P(49, -2)], M.steel, { part: 'bladeBack', bevel: 1.8, tone: -0.12 });
      p.line(...P(29, 15), ...P(42, 21), '#e8eef4');
      p.line(...P(42, 21), ...P(55, 15), '#e8eef4');
      p.limb(...P(32, 0), 3.2, ...P(52, 0), 3.2, M.leather, { part: 'socket' });
      p.ellipse(86, 58 + up, 11, 10, M.fur, { part: 'nearArm' });
      p.limb(86, 58 + up, 10, ex, ey, 8.5, M.fur, { part: 'nearArm' });
      p.limb(ex, ey, 8, hx, hy, 7, M.fur, { part: 'nearArm' });
      p.limb(ex + (hx - ex) * 0.35, ey + (hy - ey) * 0.35, 4.8, ex + (hx - ex) * 0.6, ey + (hy - ey) * 0.6, 4.8, M.gold, { part: 'bracer' });
      p.ellipse(hx, hy, 7.5, 7, M.fur, { part: 'fist' });
      // Искры с лезвия в кадрах удара.
      if (strike > 0.6) {
        const [sx, sy] = P(42, 22);
        for (const [ox, oy] of [[-8, -6], [-4, 6], [-12, 2], [2, 10]]) p.px(sx + ox * strike, sy + oy * strike, '#ffe8a0');
        p.glow(sx, sy, 6 * strike, '#fff0c0', 0.35);
      }
      });
    });
  },
};

// ─── Древний дракон ─────────────────────────────────────────────────────────

const DRAGON = {
  scale: { base: '#7e1812', tex: { kind: 'spots', scale: 4, amp: 0.25, density: 0.35 } } as Mat,
  dark: { base: '#5a0e0e', tex: { kind: 'noise', scale: 3, amp: 0.15 } } as Mat,
  belly: { base: '#a2703e', tex: { kind: 'stripes', scale: 3.5, amp: 0.3, angle: 1.57 } } as Mat,
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
      // Лапа ящера: сустав вывернут назад, пясть на весу, три пальца врастопырку с когтями, пятый — шпора сзади.
      const leg = (pts: Array<[number, number, number]>, mat: Mat, part: string, tone: number, dx = 0): void => {
        const q = pts.map(([x, y, r], k) => [x + (k > 0 ? dx * k / (pts.length - 1) : 0), y, r] as [number, number, number]);
        p.chain(q, mat, { part, tone, noLine: true });
        const [fx] = q[q.length - 1];
        p.ellipse(fx - 2, G - 3, 8, 3, mat, { part, tone, flat: 0.3, noLine: true });
        for (let k = 0; k < 3; k++) {
          const x0 = fx - 6 + k * 3.5;
          p.chain([[x0, G - 4, 2], [x0 - 5 + k, G - 1.5, 1.4], [x0 - 8 + k * 1.5, G - 0.5, 0.6]], M.claw, { part: `${part}Claw`, tone });
        }
        p.chain([[fx + 5, G - 4, 1.5], [fx + 8, G - 1, 0.6]], M.claw, { part: `${part}Claw`, tone });
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

      // Дальние лапы: темнее, за туловищем.
      leg([[204, 134, 12], [196, 154, 9], [210, 168, 6.5], [202, 182, 5.5]], M.dark, 'farHind', -0.12);
      leg([[124, 134, 10], [128, 154, 7.5], [116, 172, 6], [114, 182, 5.5]], M.dark, 'farFront', -0.12);

      // Хвост: толстый у крупа, лежит волной по земле, кончик с шипом-лопатой покачивается.
      const tx = 4 * tail + 8 * hurt;
      p.chain([[210, 120, 18], [236, 140, 13], [256, 160, 9], [266 + tx * 0.4, 174, 6], [254 + tx, 182, 4], [240 + tx, 180, 2.5]], M.scale);
      p.chain([[214, 132, 10], [238, 150, 7], [256, 167, 5]], M.belly, { paint: true });
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

      // Ближние лапы: мощное бедро и плечо вливаются в тело; ниже — жилистая лапа с вывернутым суставом.
      p.ellipse(186, 132, 20, 24, M.scale);
      p.ellipse(112, 128 + up, 15, 18, M.scale);
      leg([[182, 146, 13], [170, 160, 10], [188, 172, 7], [178, 182, 6]], M.scale, 'nearHind', 0);
      const reach = 6 * strike;
      leg([[110, 140 + up, 11], [118, 158, 8], [104, 174, 6.5], [100, 182, 6]], M.scale, 'nearFront', 0, -reach);

      // Шея дугой: от груди вверх и вперёд к голове; в замахе оттянута назад, в выпаде голова идёт вниз к герою.
      const [hx, hy] = mixPt([54, 52], [82, 30], [30, 84], wind, strike);
      const hxx = hx + 6 * hurt, hyy = hy + up - 10 * hurt;
      const [nx, ny] = mixPt([82, 70], [100, 56], [70, 90], wind, strike);
      p.chain([[118, 106 + up, 22], [nx + 8, ny + 18 + up, 16], [nx, ny + up, 13], [hxx + 16, hyy + 6, 11]], M.scale);
      p.chain([[112, 122 + up, 12], [nx + 2, ny + 26 + up, 9], [nx - 6, ny + 10 + up, 7], [hxx + 12, hyy + 12, 6]], M.belly, { paint: true });
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
        p.ellipse(58, 50, 16, 12, M.scale);
        p.limb(50, 52, 10, 24, 56, 7, M.scale);
        p.ellipse(56, 42, 14, 4, M.dark, { lift: 5 });
        p.ellipse(44, 60, 16, 3, M.belly, { paint: true });
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

export const CAVES_MODELS: Record<string, Model> = { imp, kamikaze_imp: kamikazeImp, fire_bat: fireBat, lava_slime: lavaSlime, salamander, hellhound, cultist, fire_priest: firePriest, tormentor, golem, fire_elemental: fireElemental, minotaur, dragon };
