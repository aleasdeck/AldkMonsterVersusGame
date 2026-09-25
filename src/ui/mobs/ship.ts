import { along, keys, mixPt, type Keys, type Mat, type Model, type Painter, type Pt } from './pixel';

/**
 * Враги Пиратского корабля пиксельной лепкой. Все смотрят влево — на героя; единица — пиксель поля боя,
 * рост от макушки до земли — как в `ENEMY_BODY_HEIGHT` (characterSizes.ts).
 * Цвета продолжают палитры прежних спрайтов (`sprite` в enemies.ts): у Пирата красная бандана и синяя куртка,
 * Канонир в треуголке и бурой куртке, Боцман в багровом, Попугай красный с синими крыльями, Мартышка бурая,
 * Сирена бирюзовая, Щупальце лиловое, Первый помощник в чёрном, Морской дьявол в морской зелени,
 * Проклятый капитан в бордовом с золотом и голубыми глазами мертвеца, его призрак — голубой.
 * На корабле ночь и лунный свет (тонировка `ship` в tint.ts синит всё): металл и золото блестят, кожа тёплая.
 */

// ─── Общее ──────────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/**
 * Рука из двух звеньев: плечо S, направления плеча `a1` и предплечья `a2` в градусах
 * (90 — вниз, 180 — к герою, 270 — вверх, 360 — назад), длины `l1` и `l2`. Отдаёт локоть и кисть.
 */
function limb2(sx: number, sy: number, a1: number, l1: number, a2: number, l2: number): { ex: number; ey: number; hx: number; hy: number } {
  const ex = sx + l1 * Math.cos(a1 * DEG), ey = sy + l1 * Math.sin(a1 * DEG);
  return { ex, ey, hx: ex + l2 * Math.cos(a2 * DEG), hy: ey + l2 * Math.sin(a2 * DEG) };
}

/** Угол по ключам клипа удара; вне удара — угол покоя `rest`. */
function ang(p: Painter, k: Keys, rest: number): number {
  return p.clip === 'attack' ? keys(k, p.u) : rest;
}

/** Точка на расстоянии `len` от (x, y) под углом `a` градусов. */
function at(x: number, y: number, a: number, len: number): [number, number] {
  return [x + len * Math.cos(a * DEG), y + len * Math.sin(a * DEG)];
}

/**
 * Сапог: подошва на земле G, носок к герою. `x` — пятка, `len` — длина стопы, `top` — высота голенища.
 */
function boot(p: Painter, x: number, G: number, len: number, top: number, mat: Mat, part: string, tone = 0): void {
  p.poly([x - len, G - 3, x - len + 3, G - 7, x - 1, G - top, x + 4, G - top, x + 4, G, x - len - 1, G], mat, { part, tone, bevel: 2 });
}

/**
 * Кривая сабля от кисти (x, y) в направлении `a` градусов: клинок длиной `len` с изгибом к острию,
 * латунная гарда-дужка вокруг кулака. `curve` — куда гнётся лезвие (+1 — по часовой от направления клинка).
 */
function sabre(p: Painter, x: number, y: number, a: number, len: number, steel: Mat, brass: Mat, part: string, curve = 1, wid = 2.4): void {
  const ux = Math.cos(a * DEG), uy = Math.sin(a * DEG);
  const nx = -uy * curve, ny = ux * curve;
  const pts: number[] = [];
  // Обух — плавная дуга, лезвие шире у середины и сходится к острию.
  const n = 6;
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    const bow = Math.sin(f * Math.PI * 0.9) * len * 0.1 * f;
    pts.push(x + ux * len * f + nx * (bow - wid * 0.4), y + uy * len * f + ny * (bow - wid * 0.4));
  }
  for (let k = n - 1; k >= 1; k--) {
    const f = k / n;
    const bow = Math.sin(f * Math.PI * 0.9) * len * 0.1 * f;
    const w = wid * (1 - f * f * 0.85);
    pts.push(x + ux * len * f + nx * (bow + w), y + uy * len * f + ny * (bow + w));
  }
  p.poly(pts, steel, { part, bevel: 0.8 });
  // Гарда: перекрестье поперёк клинка и дужка над кулаком.
  p.limb(x - nx * 3.2, y - ny * 3.2, 1, x + nx * 3.4, y + ny * 3.4, 1, brass, { part: `${part}Guard` });
  p.limb(x + nx * 3.4, y + ny * 3.4, 0.8, x + nx * 2 - ux * 6, y + ny * 2 - uy * 6, 0.8, brass, { part: `${part}Guard` });
}

// ─── Пират ──────────────────────────────────────────────────────────────────

const PIRATE = {
  skin: { base: '#c98f5e', tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  beard: { base: '#2c2018', shag: 0.3, tex: { kind: 'noise', scale: 1.5, amp: 0.2 } } as Mat,
  band: { base: '#a02030', tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  shirt: { base: '#bdb4a0', tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  stripe: { base: '#3a3a5a' } as Mat,
  vest: { base: '#3a3a5a', tex: { kind: 'noise', scale: 2.5, amp: 0.1 } } as Mat,
  pants: { base: '#2e2e42', tex: { kind: 'stripes', scale: 3, amp: 0.06, angle: 1.57 } } as Mat,
  boot: { base: '#35261c' } as Mat,
  belt: { base: '#3a2618' } as Mat,
  steel: { base: '#c0c0c0', shine: 1, dither: 0 } as Mat,
  brass: { base: '#b08a3a', shine: 0.8, dither: 0 } as Mat,
  bottle: { base: '#3c6a3a', shine: 0.9, dither: 0 } as Mat,
  cork: { base: '#8a6a44' } as Mat,
};

/**
 * Рубка саблей: направления плеча, предплечья и клинка по ходу клипа, градусы.
 * В покое кулак у пояса, клинок смотрит вверх на героя; замах — рука взлетает, клинок уходит за голову;
 * контакт — рука вытянута к герою, клинок почти горизонтально; потом добивает вниз и возвращается.
 */
const PIRATE_UPPER: Keys = [[0, 150], [0.14, 235], [0.3, 245], [0.43, 215], [0.57, 180], [0.72, 140], [0.86, 110], [1, 105]];
const PIRATE_FORE: Keys = [[0, 240], [0.14, 300], [0.3, 312], [0.43, 250], [0.57, 175], [0.72, 128], [0.86, 150], [1, 170]];
const PIRATE_BLADE: Keys = [[0, 290], [0.14, 380], [0.3, 392], [0.43, 290], [0.57, 172], [0.72, 118], [0.86, 190], [1, 235]];

export const pirate: Model = {
  id: 'pirate',
  w: 84,
  h: 112,
  ground: 110,
  // Сабля в кадре контакта вытянута к герою — острие на 40 единиц левее рамки, в замахе — над макушкой.
  pad: 46,
  draw(p: Painter) {
    const M = PIRATE;
    const G = 110;
    // Сабля: замах — рука взлетает, клинок за головой; удар — рубит с плеча к герою, корпус подаётся следом.
    // Урон: отбросило, голова назад, рот раскрыт, концы банданы взлетели.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    // Дышит грудью, концы банданы треплет ветер, бутылка рома покачивается на поясе.
    const up = -p.bob(1.2, 2);
    const flap = 1.4 * p.wave(2, 0.3) + 3 * hurt - 2 * wind;
    const swing = p.wave(1, 0.15) * (1 - strike);

    p.pose({ dx: -7 * strike + 2 * wind + 5 * hurt, rot: 0.04 * wind - 0.06 * strike + 0.06 * hurt, px: 40, py: G }, () => {
      p.shadow(40, 26, 3);

      // Дальняя нога и сапог.
      p.chain([[47, 68, 6.5], [52, 86, 5.2], [53, 100, 4]], M.pants, { part: 'far', tone: -0.12 });
      boot(p, 55, G, 13, 14, M.boot, 'far', -0.1);
      // Дальняя рука висит, кулак у бедра.
      p.limb(52, 38 + up, 5.2, 57, 52 + up, 4.4, M.shirt, { part: 'farArm', tone: -0.14 });
      p.limb(57, 52 + up, 3.8, 57, 64 + up, 3.4, M.skin, { part: 'farArm', tone: -0.14 });
      p.ellipse(57, 67 + up, 3.8, 3.6, M.skin, { part: 'farArm', tone: -0.14 });

      // Ближняя нога.
      p.chain([[36, 68, 7], [31, 86, 5.6], [30, 100, 4.2]], M.pants, { part: 'near' });
      boot(p, 33, G, 14, 15, M.boot, 'near');

      // Туловище: рубаха в синюю полоску, распахнутая куртка, широкий ремень.
      p.ellipse(42, 62, 13, 8, M.shirt);
      p.ellipse(42, 48 + up, 15, 14, M.shirt);
      for (let k = 0; k < 5; k++) p.limb(26, 38 + k * 6 + up * (k < 3 ? 1 : 0.5), 1.3, 58, 36 + k * 6 + up * (k < 3 ? 1 : 0.5), 1.3, M.stripe, { paint: true });
      p.poly([26, 36 + up, 34, 33 + up, 33, 52 + up, 30, 70, 24, 68], M.vest, { paint: true });
      p.poly([48, 33 + up, 58, 36 + up, 58, 68, 50, 70, 49, 52 + up], M.vest, { paint: true });
      p.poly([28, 62, 57, 62, 58, 68, 28, 68], M.belt, { paint: true });
      p.block(40, 63, 3, 2, '#c8a050');
      // Бутылка рома за ремнём на дальнем боку: зелёное стекло, пробка.
      p.pose({ rot: 0.08 * swing + 0.2 * hurt, px: 56, py: 64 }, () => {
        p.ellipse(57, 72, 3.6, 5.2, M.bottle, { part: 'bottle' });
        p.limb(57, 67, 1.6, 57, 63, 1.4, M.bottle, { part: 'bottle' });
        p.limb(57, 63, 1.3, 57, 61, 1.3, M.cork, { part: 'cork' });
      });

      // Голова: красная бандана с концами за ухом, чёрная борода, золотая серьга, нос с горбинкой.
      p.limb(41, 33 + up, 5, 40, 26 + up, 5.5, M.skin, { part: 'neck' });
      p.pose({ dx: p.snap(2 * hurt - strike), dy: up, rot: 0.2 * hurt - 0.05 * strike + 0.03 * wind, px: 40, py: 30 }, () => {
        p.chain([[48, 13, 2.2], [55, 16 + flap * 0.5, 1.8], [60, 21 + flap, 1.1]], M.band, { part: 'knot' });
        p.chain([[48, 14, 2], [53, 21 + flap * 0.3, 1.5], [54, 26 + flap * 0.6, 1]], M.band, { part: 'knot', tone: -0.12 });
        p.ellipse(38, 19, 9.5, 10, M.skin, { part: 'head' });
        p.ellipse(33.5, 25, 7.5, 5.5, M.skin, { part: 'head' });
        p.ellipse(45, 20, 2.2, 3, M.skin, { part: 'ear' });
        p.poly([28, 23, 36, 23, 42, 20, 43, 28, 36, 32, 29, 30], M.beard, { part: 'head', paint: true });
        p.poly([28, 8, 43, 5, 49, 11, 49, 16, 29, 14], M.band, { part: 'head', paint: true });
        p.ellipse(38, 7.5, 8, 3.5, M.band, { part: 'head', lift: 1 });
        p.limb(29.5, 15.5, 2, 26.5, 21, 1.9, M.skin, { part: 'nose', lift: 3 });
        // Рот: в замахе и ударе оскал, от удара раскрыт.
        if (hurt > 0.4) {
          p.poly([28, 25.5, 33, 25.5, 32.5, 29, 29, 28.5], M.beard, { part: 'mouth', tone: -0.6, bevel: 0.6 });
        } else if (wind > 0.4 || strike > 0.4) {
          p.line(28, 25.5, 33.5, 26, '#140e0c');
          p.line(28.5, 26.5, 33, 27, '#e8e0d0');
        } else p.line(28, 25.5, 33.5, 26, '#140e0c');
        p.line(29, 13.5, 35, 14.5 + 1.5 * wind, '#241a14');
        p.eye(32, 17, 1.1, '#e8e0d0', { closed: hurt > 0.4 ? 1 : p.blink(0.62), pupil: '#1a1210' });
        p.px(45, 24, '#e8c060');
      });

      // Ближняя рука с саблей: в покое кулак у пояса, клинок вверх к герою; в ударе рубит с плеча.
      const a1 = ang(p, PIRATE_UPPER, 105) - 20 * hurt;
      const a2 = ang(p, PIRATE_FORE, 170) - 30 * hurt + 2 * swing;
      const a3 = ang(p, PIRATE_BLADE, 235) + 30 * hurt + 3 * swing;
      const { ex, ey, hx, hy } = limb2(29, 38 + up, a1, 13, a2, 12);
      sabre(p, hx, hy, a3, 27, M.steel, M.brass, 'blade', 1);
      // Блик бежит по клинку в начале цикла, но не в первом кадре: им же кончаются клипы.
      const g = p.clip === 'idle' && p.t > 0.05 && p.t < 0.3 ? (p.t - 0.05) / 0.25 : -1;
      if (g >= 0) {
        const [gx, gy] = at(hx, hy, a3, 6 + 18 * g);
        p.px(gx, gy, '#ffffff');
      }
      p.limb(29, 38 + up, 5.4, ex, ey, 4.6, M.shirt, { part: 'nearArm' });
      p.limb(ex, ey, 4, hx, hy, 3.4, M.skin, { part: 'nearArm' });
      p.ellipse(hx, hy, 3.8, 3.6, M.skin, { part: 'fist' });
      const [kx, ky] = at(hx, hy, a3 + 180, 3);
      p.limb(hx, hy, 1.2, kx, ky, 1.2, M.cork, { part: 'grip' });
    });
  },
};

// ─── Канонир ────────────────────────────────────────────────────────────────

const GUNNER = {
  skin: { base: '#d0a077', tex: { kind: 'noise', scale: 3, amp: 0.1 } } as Mat,
  hair: { base: '#6e6254', shag: 0.25, tex: { kind: 'noise', scale: 1.5, amp: 0.2 } } as Mat,
  hat: { base: '#2a2a3a', tex: { kind: 'noise', scale: 2.5, amp: 0.1 } } as Mat,
  trim: { base: '#8a7a50', dither: 0 } as Mat,
  coat: { base: '#5a3a2a', tex: { kind: 'noise', scale: 2.5, amp: 0.12 } } as Mat,
  shirt: { base: '#9c9282', tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  pants: { base: '#2e2e3e', tex: { kind: 'stripes', scale: 3, amp: 0.06, angle: 1.57 } } as Mat,
  boot: { base: '#2e241e' } as Mat,
  belt: { base: '#2a201a' } as Mat,
  iron: { base: '#4a4a4a', shine: 0.7, tex: { kind: 'noise', scale: 1.5, amp: 0.15 } } as Mat,
  brass: { base: '#a8843a', shine: 0.8, dither: 0 } as Mat,
  wood: { base: '#6a4a2e', tex: { kind: 'stripes', scale: 2, amp: 0.12 } } as Mat,
  horn: { base: '#c8b890', tex: { kind: 'stripes', scale: 1.5, amp: 0.15, angle: 0.4 } } as Mat,
  smoke: { base: '#8a8c96', noOutline: true, dither: 0.6 } as Mat,
};

export const gunner: Model = {
  id: 'gunner',
  w: 90,
  h: 112,
  ground: 110,
  // Ядро в кадре контакта — на 30 единиц левее рамки; клуб дыма над стволом.
  pad: 40,
  draw(p: Painter) {
    const M = GUNNER;
    const G = 110;
    // Выстрел: замах — присесть, навести ствол, фитиль у запала вспыхивает; выпад — отдача: ствол подбрасывает,
    // из дула пламя и дым, ядро летит к герою, канонира качает назад. Урон: треуголку сбило набок, ствол опущен.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.2, 2);
    const crouch = p.snap(2 * wind);
    // Фитиль тлеет: уголёк мерцает, струйка дыма поднимается и тает.
    const ember = (p.wave(3, 0.2) + 1) / 2;

    p.pose({ dx: 4 * strike - 1 * wind + 5 * hurt, dy: crouch, rot: 0.04 * strike + 0.06 * hurt, px: 44, py: G }, () => {
      p.shadow(44, 28, 3);

      // Широкая стойка: дальняя нога назад, ближняя вперёд.
      p.chain([[52, 70, 7], [58, 88 - crouch, 5.6], [60, 100 - crouch, 4.2]], M.pants, { part: 'far', tone: -0.12 });
      boot(p, 62, G - crouch, 13, 13, M.boot, 'far', -0.1);
      p.chain([[38, 70, 7.5], [30, 88 - crouch, 6], [28, 100 - crouch, 4.4]], M.pants, { part: 'near' });
      boot(p, 31, G - crouch, 14, 13, M.boot, 'near');

      // Долгополая бурая куртка: полы до колен, из-под них пороховой рог на шнуре.
      p.poly([32, 36 + up, 58, 36 + up, 64, 60, 66, 84, 56, 86, 52, 74, 44, 76, 36, 74, 30, 84, 26, 82, 28, 58], M.coat, { bevel: 5 });
      p.ellipse(45, 50 + up, 16, 15, M.coat);
      p.poly([36, 36 + up, 44, 36 + up, 42, 60, 36, 58], M.shirt, { paint: true });
      p.poly([30, 60, 62, 60, 62, 66, 30, 66], M.belt, { paint: true });
      p.block(38, 61, 2, 2, '#b8944a');
      p.limb(58, 58, 2.6, 62, 74, 1.4, M.horn, { part: 'horn' });
      p.limb(62, 74, 1.4, 60, 77, 1, M.brass, { part: 'horn' });

      // Голова: седые бакенбарды, сажа на щеке, прищур; чёрная треуголка с потёртым галуном.
      p.limb(44, 34 + up, 5.5, 42, 27 + up, 6, M.skin, { part: 'neck' });
      p.pose({ dx: p.snap(1.5 * hurt), dy: up + p.snap(wind), rot: 0.12 * hurt - 0.04 * wind, px: 43, py: 30 }, () => {
        p.ellipse(41, 20, 9.5, 10, M.skin, { part: 'head' });
        p.ellipse(36.5, 26, 7.5, 5.5, M.skin, { part: 'head' });
        p.poly([43, 20, 47, 19, 47.5, 27, 44, 29, 42.5, 25], M.hair, { part: 'head', paint: true });
        p.poly([31, 26.5, 37, 25.5, 38.5, 27.5, 34, 29], M.hair, { part: 'moustache' });
        p.px(38, 23, '#5a4a40');
        p.limb(32.5, 17, 2, 29.5, 22, 1.9, M.skin, { part: 'nose', lift: 3 });
        if (hurt > 0.4) p.poly([31.5, 29, 35, 29, 34.5, 31.5, 32, 31], M.boot, { part: 'mouth', bevel: 0.6 });
        p.line(31, 16, 36.5, 16.5 + wind, '#3a3028');
        p.eye(34.5, 19, 1.1, '#e8e0d0', { closed: hurt > 0.4 ? 1 : wind > 0.5 ? 0.5 : p.blink(0.35), pupil: '#1a1210' });
        // Треуголка: широкие поля с загнутыми краями, тулья; от удара её сдвигает на затылок.
        p.pose({ rot: 0.2 * hurt, px: 46, py: 12 }, () => {
          p.ellipse(42, 8, 9, 5.5, M.hat, { part: 'hat' });
          p.poly([25, 13, 30, 9, 42, 11, 54, 7, 60, 11, 56, 14, 42, 15, 30, 15.5], M.hat, { part: 'hat', bevel: 1.5 });
          p.line(26, 13, 41, 14, '#8a7a50');
          p.line(41, 14, 58, 11, '#8a7a50');
        });
      });

      // Ручная пушка: железный ствол с латунными кольцами и раструбом, деревянное ложе под мышкой.
      // Ствол вращается вокруг кулака дальней руки: наведение на замахе, подброс отдачей на выстреле.
      const kick = 0.28 * strike - 0.04 * wind - 0.18 * hurt;
      const [bx, by] = [52, 60 + up * 0.5];
      p.pose({ rot: kick, px: bx, py: by }, () => {
        p.limb(bx + 2, by + 2, 3.2, bx + 12, by + 10, 2.6, M.wood, { part: 'stock' });
        p.limb(bx, by, 5.4, 16, by - 1, 4.4, M.iron, { part: 'barrel' });
        p.ellipse(bx + 1, by, 5.8, 5.6, M.iron, { part: 'barrel' });
        p.limb(16, by - 1, 4.6, 8, by - 1.5, 6.6, M.iron, { part: 'barrel' });
        p.ellipse(8, by - 1.5, 1.8, 5.4, M.boot, { part: 'mouth', flat: 0.6 });
        for (const x of [42, 30, 18]) p.limb(x, by - 5.2, 1, x, by + 4.4, 1, M.brass, { part: 'ring' });
        // Запал и фитиль у казны: уголёк мерцает, на замахе вспыхивает искрами.
        p.limb(bx - 4, by - 5, 1, bx - 3, by - 9, 0.8, M.wood, { part: 'fuse' });
        const hot = Math.max(wind, 1 - strike * 2);
        p.glow(bx - 3, by - 10, 3.5 + 3 * wind, '#ff9a3a', 0.3 + 0.2 * ember + 0.3 * wind);
        p.px(bx - 3, by - 10, hot > 0.3 ? '#ffd166' : '#b0502a');
        if (wind > 0.5) for (const [ox, oy] of [[-3, -3], [2, -4], [-1, -6]]) p.px(bx - 3 + ox, by - 10 + oy, '#ffe8a0');
        // Вспышка из дула и ядро: только в кадрах выстрела.
        if (p.clip === 'attack' && strike > 0.3) {
          const fl = strike;
          p.poly([8, by - 1.5, 0 - 8 * fl, by - 9 * fl, 2, by - 3, -12 * fl, by - 1.5, 2, by, 0 - 8 * fl, by + 6 * fl], { base: '#ffb040', glow: true, dither: 0 } as Mat, { part: 'flash' });
          p.glow(2, by - 1.5, 12 * fl, '#ffd166', 0.45);
        }
      });
      // Дым: тонкая струйка от фитиля (в клипах она стоит, как в первом кадре покоя), после выстрела — клуб у дула.
      if (strike < 0.3) {
        for (let k = 0; k < 4; k++) {
          const f = (p.t * 2 + k / 4) % 1;
          p.disc(bx - 3 + 2 * Math.sin((f + k) * 5), by - 12 - f * 22, 0.9 + f * 0.8, `#9a9ca6${Math.round((1 - f) * 150).toString(16).padStart(2, '0')}`);
        }
      }
      if (p.clip === 'attack' && p.u > 0.45 && p.u < 0.99) {
        const f = (p.u - 0.45) / 0.55;
        const a = Math.round((1 - f) * 190).toString(16).padStart(2, '0');
        for (const [ox, oy, r] of [[0, 0, 5], [-6, -4, 4], [-4, 4, 3.5], [4, -6, 3], [-10, 1, 3]]) p.disc(6 + ox - 6 * f, 56 + oy - 8 * f, r * (0.7 + f * 0.6), `#a0a2aa${a}`);
      }
      if (p.clip === 'attack' && p.u > 0.4 && p.u < 0.62) {
        const x = p.u < 0.5 ? -8 : -30;
        p.ellipse(x, 58, 3.4, 3.4, M.iron, { part: 'ball' });
        p.line(x + 5, 58, x + 16, 58, '#c0c4cca0');
      }

      // Руки: дальняя держит ложе, ближняя обхватила ствол снизу.
      const armK = (x: number, y: number): [number, number] => {
        const c = Math.cos(kick), s = Math.sin(kick);
        return [bx + (x - bx) * c - (y - by) * s, by + (x - bx) * s + (y - by) * c];
      };
      const [fx, fy] = armK(56, 62 + up * 0.5);
      p.chain([[54, 40 + up, 5.4], [58, 52 + up, 4.6], [fx, fy, 4]], M.coat, { part: 'farArm', tone: -0.12 });
      p.ellipse(fx, fy, 3.8, 3.4, M.skin, { part: 'farArm', tone: -0.12 });
      const [nx, ny] = armK(28, 63 + up * 0.5);
      p.chain([[34, 40 + up, 6], [34, 54 + up, 5], [nx + 3, ny, 4.2]], M.coat, { part: 'nearArm' });
      p.ellipse(nx, ny, 4.2, 3.8, M.skin, { part: 'fist' });
    });
  },
};

// ─── Боцман ─────────────────────────────────────────────────────────────────

const BOSUN = {
  skin: { base: '#c28c62', tex: { kind: 'noise', scale: 3, amp: 0.1 } } as Mat,
  nose: { base: '#c07060' } as Mat,
  chops: { base: '#7a6a58', shag: 0.3, tex: { kind: 'fur', scale: 1.5, amp: 0.22, stretch: 2, angle: 1.4 } } as Mat,
  cap: { base: '#3a2a1a', tex: { kind: 'noise', scale: 2, amp: 0.12 } } as Mat,
  coat: { base: '#6a2a2a', tex: { kind: 'noise', scale: 2.5, amp: 0.12 } } as Mat,
  shirt: { base: '#a09a8a', tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  pants: { base: '#2e2e3c', tex: { kind: 'stripes', scale: 3, amp: 0.06, angle: 1.57 } } as Mat,
  boot: { base: '#2e241e' } as Mat,
  belt: { base: '#2a1e16' } as Mat,
  rope: { base: '#8a5a2a', tex: { kind: 'stripes', scale: 1.2, amp: 0.25, angle: 0.8 } } as Mat,
  brass: { base: '#b89040', shine: 0.9, dither: 0 } as Mat,
  pewter: { base: '#7c7c86', shine: 0.7, dither: 0 } as Mat,
  grog: { base: '#8a4a1a', shine: 0.6, dither: 0 } as Mat,
};

/** Линёк: точки верёвки относительно кулака — висит (покой), тянется назад над плечом (замах), хлещет к герою (удар). */
const ROPE_REST: Array<[number, number]> = [[0, 0], [0.5, 5], [0.5, 10], [-0.5, 15], [-1, 20], [-0.5, 25], [0.5, 29]];
const ROPE_WIND: Array<[number, number]> = [[0, 0], [5, 2], [10, 5], [14, 10], [17, 15], [19, 20], [20, 25]];
const ROPE_HIT: Array<[number, number]> = [[0, 0], [-6, 1], [-12, 2], [-18, 3], [-24, 3], [-30, 2], [-35, 0]];
/** Рука с линьком: плечо и предплечье по ходу клипа, градусы. */
const LASH_UPPER: Keys = [[0, 150], [0.14, 245], [0.3, 255], [0.43, 215], [0.57, 170], [0.72, 130], [0.86, 110], [1, 100]];
const LASH_FORE: Keys = [[0, 200], [0.14, 285], [0.3, 295], [0.43, 230], [0.57, 175], [0.72, 140], [0.86, 128], [1, 125]];

export const bosun: Model = {
  id: 'bosun',
  w: 100,
  h: 124,
  ground: 122,
  // Линёк в кадре контакта хлещет на 40 единиц левее рамки.
  pad: 50,
  draw(p: Painter) {
    const M = BOSUN;
    const G = 122;
    // Линёк: замах — рука над головой, верёвка тянется за плечом; удар — хлёст к герою, корпус подаётся вперёд.
    // Урон: отбросило, голова назад, грог плещет из кружки, глаза зажмурены.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.5, 2);
    const sway = p.wave(1, 0.1) * (1 - strike - wind);
    // Раз за цикл покоя топорщит усы — хмыкает.
    const huff = p.clip === 'idle' ? p.blink(0.5, 0.12) : 0;

    p.pose({ dx: -6 * strike + 2 * wind + 5 * hurt, rot: 0.04 * wind - 0.05 * strike + 0.06 * hurt, px: 48, py: G }, () => {
      p.shadow(48, 32, 3.5);

      // Короткие толстые ноги в широких штанах.
      p.chain([[56, 82, 9], [60, 100, 7], [61, 112, 5]], M.pants, { part: 'far', tone: -0.12 });
      boot(p, 63, G, 14, 12, M.boot, 'far', -0.1);
      p.chain([[40, 82, 9.5], [36, 100, 7.5], [35, 112, 5.2]], M.pants, { part: 'near' });
      boot(p, 38, G, 15, 12, M.boot, 'near');

      // Дальняя рука держит оловянную кружку грога у плеча — за спиной, но над силуэтом.
      const mx = 76, my = 50 + up;
      p.limb(62, 44 + up, 7, 72, 60 + up, 6, M.coat, { part: 'farArm', tone: -0.14 });
      p.limb(72, 60 + up, 5.5, mx, my + 4, 4.8, M.skin, { part: 'farArm', tone: -0.14 });
      p.pose({ rot: 0.3 * hurt - 0.05 * strike, px: mx, py: my + 6 }, () => {
        p.poly([mx - 5, my - 7, mx + 5, my - 7, mx + 4.5, my + 7, mx - 4.5, my + 7], M.pewter, { part: 'mug', bevel: 1.5, tone: -0.05 });
        p.limb(mx + 5, my - 4, 1.3, mx + 8, my + 1, 1.3, M.pewter, { part: 'mugHandle', tone: -0.1 });
        p.limb(mx + 8, my + 1, 1.3, mx + 5, my + 5, 1.3, M.pewter, { part: 'mugHandle', tone: -0.1 });
        p.ellipse(mx, my - 6.5, 4.6, 1.2, M.grog, { part: 'grog' });
        if (hurt > 0.3) for (const [ox, oy] of [[-3, -6], [2, -9], [6, -5]]) p.px(mx + ox, my - 8 + oy * hurt, '#c07a3a');
      });
      p.ellipse(mx - 3, my + 3, 4.2, 3.6, M.skin, { part: 'farFist', tone: -0.14 });

      // Бочка-грудь: рубаха нараспашку, короткая багровая куртка, широкий ремень.
      p.ellipse(49, 76, 18, 11, M.shirt);
      p.ellipse(49, 58 + up, 21, 20, M.shirt);
      p.poly([28, 42 + up, 42, 38 + up, 40, 62 + up, 36, 86, 27, 84], M.coat, { paint: true });
      p.poly([56, 38 + up, 72, 44 + up, 70, 84, 58, 86, 56, 62 + up], M.coat, { paint: true });
      p.poly([30, 76, 68, 76, 68, 83, 30, 83], M.belt, { paint: true });
      p.block(46, 78, 3, 2, '#b8944a');
      // Дудка боцмана на цепочке — латунь на груди.
      p.line(44, 40 + up, 42, 52 + up, '#b89040');
      p.limb(41, 52 + up, 1.2, 36, 54 + up, 1, M.brass, { part: 'pipe' });
      p.ellipse(41.5, 53 + up, 1.8, 1.8, M.brass, { part: 'pipe' });

      // Голова: квадратная, бакенбарды и усы щёткой, красный нос, плоская кепка.
      p.limb(48, 40 + up, 8, 46, 32 + up, 8, M.skin, { part: 'neck' });
      p.pose({ dx: p.snap(2 * hurt), dy: up, rot: 0.2 * hurt - 0.04 * strike, px: 46, py: 36 }, () => {
        p.ellipse(45, 22, 11, 11.5, M.skin, { part: 'head' });
        p.ellipse(40, 29, 9, 7, M.skin, { part: 'head' });
        p.poly([45, 24, 51, 23, 53, 32, 47, 37, 43, 33], M.chops, { part: 'head', paint: true });
        p.ellipse(51, 22, 2.4, 3.2, M.skin, { part: 'ear' });
        p.limb(34.5, 20, 2, 32, 25, 2.3, M.nose, { part: 'nose', lift: 2 });
        const bristle = 1.5 * huff;
        p.poly([28, 30 - bristle, 36, 27, 43, 29, 40, 33, 33, 33 + bristle * 0.5], M.chops, { part: 'moustache' });
        if (hurt > 0.4 || strike > 0.5) p.poly([32, 33, 38, 33, 37, 36, 33, 36], M.belt, { part: 'mouth', bevel: 0.6 });
        p.line(33, 16.5, 40, 17 + 1.5 * (wind + strike), '#2a1e14');
        p.eye(36.5, 20, 1.1, '#e8e0d0', { closed: hurt > 0.4 ? 1 : p.blink(0.8), pupil: '#1a1210' });
        // Кепка: околыш, плоский верх, короткий козырёк к герою.
        p.poly([34, 13, 56, 11, 57, 16, 35, 16], M.cap, { part: 'cap', bevel: 1.5 });
        p.ellipse(46, 9.5, 11, 4.5, M.cap, { part: 'cap' });
        p.poly([27, 15, 36, 13.5, 37, 16.5, 29, 17], M.cap, { part: 'visor', bevel: 1, tone: -0.2 });
      });

      // Ближняя рука с линьком: в покое верёвка висит из кулака и качается, в ударе хлещет.
      const a1 = ang(p, LASH_UPPER, 100) - 25 * hurt;
      const a2 = ang(p, LASH_FORE, 125) - 30 * hurt;
      const { ex, ey, hx, hy } = limb2(34, 46 + up, a1, 15, a2, 14);
      const rope = ROPE_REST.map((r, k) => {
        const [mx, my] = mixPt(r, ROPE_WIND[k], ROPE_HIT[k], wind, strike);
        const f = k / (ROPE_REST.length - 1);
        return [hx + mx + 3 * sway * f + 8 * hurt * f, hy + my - 5 * hurt * f, 1.6 - 0.4 * f] as Pt;
      });
      p.chain(rope, M.rope, { part: 'rope' });
      for (const k of [2, 4, 6]) p.ellipse(rope[k][0], rope[k][1], 1.9, 1.9, M.rope, { part: 'knots' });
      p.limb(34, 46 + up, 7.5, ex, ey, 6.2, M.coat, { part: 'nearArm' });
      p.limb(ex, ey, 5.8, hx, hy, 4.8, M.skin, { part: 'nearArm' });
      // Якорь наколкой на предплечье.
      const [tx, ty] = [(ex + hx) / 2, (ey + hy) / 2];
      p.px(tx, ty - 1, '#3a4a6a');
      p.px(tx, ty + 1, '#3a4a6a');
      p.ellipse(hx, hy, 5, 4.6, M.skin, { part: 'fist' });
    });
  },
};

// ─── Первый помощник ────────────────────────────────────────────────────────

const MATE = {
  skin: { base: '#c89468', tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  hair: { base: '#1c1a24', shine: 0.3, tex: { kind: 'stripes', scale: 1.2, amp: 0.15, angle: 1.3 } } as Mat,
  band: { base: '#1a1a2a', tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  coat: { base: '#2a2a4a', tex: { kind: 'noise', scale: 2.5, amp: 0.1 } } as Mat,
  lining: { base: '#4a2030' } as Mat,
  vest: { base: '#3a3446', tex: { kind: 'stripes', scale: 1.5, amp: 0.1, angle: 1.57 } } as Mat,
  shirt: { base: '#a8a498' } as Mat,
  pants: { base: '#1c1c2a', tex: { kind: 'stripes', scale: 3, amp: 0.06, angle: 1.57 } } as Mat,
  boot: { base: '#241c1e', shine: 0.3 } as Mat,
  belt: { base: '#2a1e16' } as Mat,
  steel: { base: '#e0e0e0', shine: 1, dither: 0 } as Mat,
  brass: { base: '#9a9aa6', shine: 0.9, dither: 0 } as Mat,
};

/** Смешать угол покоя с углами замаха и удара, как `mixPt` точки. */
const mixA = (rest: number, wind: number, hit: number, w: number, s: number): number => rest + (wind - rest) * w + (hit - rest) * s;

/**
 * Выпад ближней саблей: плечо, предплечье и клинок по ходу клипа. Замах — кулак отведён к бедру, клинок смотрит
 * на героя; контакт — рука вытянута во всю длину, клинок горизонтально.
 */
const MATE_UPPER: Keys = [[0, 100], [0.14, 72], [0.3, 66], [0.43, 140], [0.57, 182], [0.72, 172], [0.86, 140], [1, 118]];
const MATE_FORE: Keys = [[0, 182], [0.14, 196], [0.3, 196], [0.43, 186], [0.57, 180], [0.72, 178], [0.86, 176], [1, 176]];
const MATE_BLADE: Keys = [[0, 190], [0.14, 186], [0.3, 186], [0.43, 182], [0.57, 180], [0.72, 184], [0.86, 190], [1, 194]];

export const firstMate: Model = {
  id: 'first_mate',
  w: 92,
  h: 120,
  ground: 118,
  // Выпад в кадре контакта: острие ближней сабли на 50 единиц левее рамки.
  pad: 56,
  draw(p: Painter) {
    const M = MATE;
    const G = 118;
    // Два клинка: замах — отпрянуть, ближний клинок отведён к бедру, дальний занесён выше; выпад — глубокий укол
    // ближним и следом рубка дальним. Урон: отбросило, голова назад, клинки опущены, полы плаща взлетели.
    const { wind, strike } = p.attack();
    const late = p.attack(0.12);
    const hurt = p.hurt();
    const up = -p.bob(1.2, 2);
    const tail = p.wave(1, 0.2) * (1 - strike) + 4 * hurt + 3 * strike;
    // Раз за цикл покоя крутит дальнюю саблю кистью — показная восьмёрка.
    const twirl = p.clip === 'idle' && p.t > 0.4 && p.t < 0.7 ? Math.sin(((p.t - 0.4) / 0.3) * Math.PI * 2) : 0;

    p.pose({ dx: -12 * strike + 3 * wind + 5 * hurt, rot: 0.03 * wind - 0.05 * strike + 0.06 * hurt, px: 46, py: G }, () => {
      p.shadow(46, 30, 3);

      // Фехтовальная стойка: дальняя нога отставлена назад, ближняя согнута впереди.
      p.chain([[52, 68, 6], [60, 86, 5], [64, 103, 3.8]], M.pants, { part: 'far', tone: -0.12 });
      boot(p, 66, G, 13, 17, M.boot, 'far', -0.1);

      // Дальняя рука с саблей отведена назад и вверх, клинок нависает над головой остриём к герою.
      const fa1 = mixA(318, 300, 230, late.wind, late.strike) + 20 * hurt;
      const fa2 = mixA(300, 290, 200, late.wind, late.strike) + 30 * hurt;
      const fa3 = mixA(212, 232, 165, late.wind, late.strike) + 16 * twirl + 40 * hurt;
      const far = limb2(56, 36 + up, fa1, 13, fa2, 12);
      sabre(p, far.hx, far.hy, fa3, 26, M.steel, M.brass, 'farBlade', 1, 2);
      p.limb(56, 36 + up, 4.6, far.ex, far.ey, 4, M.coat, { part: 'farArm', tone: -0.14 });
      p.limb(far.ex, far.ey, 3.8, far.hx, far.hy, 3.2, M.coat, { part: 'farArm', tone: -0.14 });
      p.ellipse(far.hx, far.hy, 3.2, 3, M.skin, { part: 'farFist', tone: -0.14 });

      // Полы плаща сзади: развеваются, изнанка бордовая.
      p.poly([50, 58, 62, 56, 72 + tail, 80, 76 + tail * 1.5, 100, 66 + tail, 98, 56, 88, 48, 70], M.coat, { part: 'tails', bevel: 3, tone: -0.08 });
      p.poly([62, 70, 72 + tail, 84, 74 + tail * 1.5, 98, 66 + tail, 96], M.lining, { part: 'tails', paint: true });

      p.chain([[40, 68, 6.5], [31, 84, 5.4], [27, 102, 4]], M.pants, { part: 'near' });
      boot(p, 30, G, 14, 18, M.boot, 'near');

      // Тело: длинный синий плащ нараспашку, жилет, белый ворот, перевязь наискось.
      p.ellipse(46, 50 + up, 13, 15, M.coat);
      p.poly([33, 60, 58, 60, 60, 84, 52, 90, 40, 80, 32, 92, 28, 88], M.coat, { bevel: 3 });
      p.poly([38, 38 + up, 50, 38 + up, 50, 64, 38, 64], M.vest, { paint: true });
      p.poly([38, 38 + up, 44, 36 + up, 43, 44 + up, 38, 42 + up], M.shirt, { paint: true });
      p.poly([36, 64, 56, 64, 56, 68, 36, 68], M.belt, { paint: true });
      p.limb(52, 38 + up, 1.2, 38, 64, 1.2, M.belt, { paint: true });
      p.px(46, 65, '#a8a8b0');

      // Голова: чёрная повязка с хвостами, волосы в хвосте до лопаток, бородка, шрам через щёку, серьга.
      p.limb(45, 33 + up, 4.5, 43, 25 + up, 5, M.skin, { part: 'neck' });
      p.pose({ dx: p.snap(1.5 * hurt - strike), dy: up, rot: 0.2 * hurt - 0.05 * strike, px: 44, py: 28 }, () => {
        p.chain([[50, 14, 3], [56, 22 + tail * 0.4, 2.4], [58, 32 + tail * 0.8, 1.6]], M.hair, { part: 'pony' });
        p.chain([[50, 9, 1.8], [56, 11 + tail * 0.5, 1.4], [60, 15 + tail, 1]], M.band, { part: 'knot' });
        p.ellipse(42, 16, 9, 9.5, M.skin, { part: 'head' });
        p.ellipse(37.5, 22.5, 6.5, 5, M.skin, { part: 'head' });
        p.poly([31.5, 24.5, 36, 24.5, 36.5, 29, 32.5, 28.5], M.hair, { part: 'head', paint: true });
        p.line(33, 22, 37, 22.5, '#1c1a24');
        p.poly([32, 5, 46, 3, 52, 9, 51, 13, 33, 11], M.band, { part: 'head', paint: true });
        p.ellipse(42, 4.5, 8, 3.2, M.band, { part: 'head', lift: 1 });
        p.limb(33.5, 12.5, 1.8, 31, 18, 1.7, M.skin, { part: 'nose', lift: 3 });
        if (hurt > 0.4) p.poly([32.5, 23, 36.5, 23, 36, 26, 33, 25.5], M.pants, { part: 'mouth', bevel: 0.6 });
        else p.line(32.5, 23.5, 36, 24 - strike, '#140e10');
        p.line(33.5, 10.5, 38.5, 11.5 + 1.5 * wind, '#16101a');
        p.eye(36, 14, 1.1, '#e8e0d0', { closed: hurt > 0.4 ? 1 : p.blink(0.2), pupil: '#101018' });
        p.line(38.5, 13, 36, 21, '#8a5448');
        p.px(47, 20, '#e8c060');
      });

      // Ближняя рука с саблей: стойка «к бою», в ударе — выпад.
      const a1 = ang(p, MATE_UPPER, 118) - 20 * hurt;
      const a2 = ang(p, MATE_FORE, 176) - 45 * hurt + p.wave(1, 0.5);
      const a3 = ang(p, MATE_BLADE, 194) - 60 * hurt + 1.5 * p.wave(1, 0.5);
      const near = limb2(38, 38 + up, a1, 13, a2, 12);
      sabre(p, near.hx, near.hy, a3, 28, M.steel, M.brass, 'blade', 1, 2);
      p.limb(38, 38 + up, 5, near.ex, near.ey, 4.4, M.coat, { part: 'nearArm' });
      p.limb(near.ex, near.ey, 4.2, near.hx, near.hy, 3.6, M.coat, { part: 'nearArm' });
      p.ellipse(near.hx - 1, near.hy, 3, 2.6, M.shirt, { part: 'cuff' });
      p.ellipse(near.hx, near.hy, 3.4, 3.2, M.skin, { part: 'fist' });
    });
  },
};

// ─── Попугай ────────────────────────────────────────────────────────────────

const PARROT = {
  red: { base: '#c8282c', tex: { kind: 'fur', scale: 1.4, amp: 0.16, stretch: 2, angle: 0.9 } } as Mat,
  blue: { base: '#2060c0', tex: { kind: 'stripes', scale: 1.6, amp: 0.2, angle: 0.2 } } as Mat,
  yellow: { base: '#e0b030', dither: 0.5 } as Mat,
  face: { base: '#e0d8cc', dither: 0 } as Mat,
  beak: { base: '#e0d4b4', shine: 0.5, dither: 0 } as Mat,
  jaw: { base: '#2a2426', dither: 0 } as Mat,
  foot: { base: '#6a6470', dither: 0 } as Mat,
};

/** Крыло попугая в своих координатах: от плеча назад, передний край сверху. */
const PARROT_WING: number[] = [0, -2.5, 7, -5.5, 16, -7, 24, -6, 31, -2, 34, 2, 28, 4, 22, 6.5, 14, 7, 6, 5.5, 0, 3];

function parrotWing(p: Painter, sx: number, sy: number, a: number, M: typeof PARROT, part: string, tone: number): void {
  const c = Math.cos(a), s = Math.sin(a);
  const pt = (x: number, y: number): [number, number] => [sx + x * c - y * s, sy + x * s + y * c];
  const pts: number[] = [];
  for (let k = 0; k < PARROT_WING.length; k += 2) pts.push(...pt(PARROT_WING[k], PARROT_WING[k + 1]));
  p.poly(pts, M.blue, { part, tone, flat: 0.6, bevel: 2 });
  // Красные кроющие у плеча, жёлтая полоса, маховые перья розной длины — линиями.
  p.ellipse(...pt(4, 0), 5, 4, M.red, { part, tone, paint: true, rot: a });
  p.ellipse(...pt(11, -1), 3, 5, M.yellow, { part, tone, paint: true, rot: a });
  for (const [x, y] of [[20, 6], [26, 4.5], [31, 2]]) {
    const [x1, y1] = pt(x - 6, y - 5), [x2, y2] = pt(x, y);
    p.line(x1, y1, x2, y2, '#16386e');
  }
}

export const parrot: Model = {
  id: 'parrot',
  w: 64,
  h: 100,
  ground: 98,
  flies: true,
  ownHeight: 'парит: в рамку от макушки до пола входит просвет под хвостом',
  // Клевок в кадре контакта — клюв на 18 единиц левее рамки.
  pad: 26,
  draw(p: Painter) {
    const M = PARROT;
    // Клевок: замах — взмыть, крылья вверх; выпад — нырок к герою, клюв раскрыт, крылья бьют вниз.
    // Урон: отбросило вверх-назад, крылья вскинуты, перья летят, глаз зажмурен.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    // Шесть взмахов за цикл покоя, как у мыши: частота крыльев не зависит от числа кадров.
    const k = Math.max(1, Math.round(p.frames / 4));
    const a = p.clip === 'idle' ? p.wave(k, 0.25) : p.clip === 'attack' ? 1 - 2 * strike : 1;
    const by = 6 + p.snap(-1.4 * a);
    // Раз за цикл склоняет голову набок — прислушивается.
    const tilt = p.clip === 'idle' ? p.blink(0.55, 0.2) : 0;

    p.pose({ dx: -16 * strike + 3 * wind + 6 * hurt, dy: -6 * wind + 8 * strike - 4 * hurt, rot: -0.25 * strike + 0.28 * hurt, px: 32, py: 36 }, () => {
      p.shadow(32, 10, 1.8, 0.2);
      // Дальнее крыло за телом.
      parrotWing(p, 34, 30 + by, -0.7 + 0.95 * a, M, 'wingFar', -0.18);
      // Хвост: длинный, красный с синим концом.
      const tw = p.wave(1, 0.3);
      p.chain([[38, 44 + by, 3.6], [45 + tw * 0.5, 56 + by, 2.8], [50 + tw, 68 + by, 1.8], [52 + tw * 1.5, 74 + by, 1]], M.red, { part: 'tail' });
      p.ellipse(51 + tw * 1.2, 70 + by, 2.6, 5, M.blue, { part: 'tail', paint: true, rot: -0.3 });
      // Тело.
      p.ellipse(33, 38 + by, 8, 11, M.red, { rot: -0.45 });
      p.ellipse(31, 42 + by, 5, 6, M.red, { tone: -0.12, paint: true });
      p.limb(30, 47 + by, 1, 28, 51 + by, 0.8, M.foot, { part: 'feet' });
      p.limb(34, 48 + by, 1, 33, 52 + by, 0.8, M.foot, { part: 'feet' });
      // Голова: белая маска вокруг глаза, огромный крючковатый клюв.
      p.pose({ rot: -0.25 * tilt + 0.2 * hurt - 0.1 * strike, px: 28, py: 30 + by }, () => {
        p.ellipse(25, 24 + by, 7.5, 7, M.red, { part: 'head' });
        p.ellipse(21.5, 25.5 + by, 3.6, 3, M.face, { part: 'head', paint: true });
        for (const y of [24.5, 26.5]) p.line(20, y + by, 23, y + by, '#8a8078');
        const open = strike > 0.3 || hurt > 0.4 ? 2.5 : 0;
        p.poly([19, 21.5 + by, 14, 22 + by, 11, 25 + by, 11, 29 + by, 13, 31 + by, 14.5, 28 + by, 17, 27 + by, 19.5, 27 + by], M.beak, { part: 'beak', bevel: 1.2 });
        p.poly([19, 27.5 + by, 15, 28 + by + open * 0.5, 14, 30 + by + open, 17, 31 + by + open, 19.5, 29.5 + by], M.jaw, { part: 'jaw', bevel: 0.8 });
        const shut = hurt > 0.4 ? 1 : p.blink(0.3, 0.04);
        p.eye(22, 23.5 + by, 1.3, '#ffd166', { closed: shut, pupil: '#1a1410', lid: '#6a1418' });
      });
      // Ближнее крыло поверх тела.
      parrotWing(p, 33, 31 + by, -0.8 + 1.0 * a, M, 'wing', 0);
      if (hurt > 0.2) {
        for (const [ox, oy, c] of [[-10, -12, '#c8282c'], [8, -16, '#2060c0'], [14, -4, '#e0b030'], [-6, 6, '#c8282c']] as Array<[number, number, string]>) p.block(32 + ox * (1 + hurt), 34 + oy * (1 + hurt), 1, 2, c);
      }
    });
  },
};

// ─── Пороховая мартышка ─────────────────────────────────────────────────────

const MONKEY = {
  fur: { base: '#7a5a3a', shag: 0.2, tex: { kind: 'fur', scale: 1.6, amp: 0.2, stretch: 2, angle: 1.3 } } as Mat,
  face: { base: '#d0a474', tex: { kind: 'noise', scale: 2, amp: 0.08 } } as Mat,
  ear: { base: '#8a5a44' } as Mat,
  wood: { base: '#a8804a', tex: { kind: 'stripes', scale: 1.6, amp: 0.2, angle: 1.57 } } as Mat,
  end: { base: '#c49c66', tex: { kind: 'noise', scale: 1.5, amp: 0.15 } } as Mat,
  hoop: { base: '#34343c', shine: 0.5, dither: 0 } as Mat,
  fuse: { base: '#c8b890', dither: 0 } as Mat,
  mouth: { base: '#3a1a18', dither: 0 } as Mat,
};

/**
 * Бочонок с порохом лёжа: дно к герою, железные обручи, фитиль из пробки сверху горит искрами.
 * (x, y) — середина, `rot` — наклон; `spark` 0..1 — насколько ярко искрит фитиль.
 */
function keg(p: Painter, x: number, y: number, rot: number, M: typeof MONKEY, spark: number, part: string): void {
  p.pose({ rot, px: x, py: y }, () => {
    p.ellipse(x, y, 10, 7, M.wood, { part });
    for (const dx of [-5, 5]) p.limb(x + dx, y - 7, 1, x + dx, y + 7, 1, M.hoop, { part, paint: true });
    p.ellipse(x - 9, y, 2.4, 6.2, M.end, { part: `${part}End`, flat: 0.5 });
    p.px(x - 9, y, '#3a2418');
    p.chain([[x - 1, y - 6.5, 0.8], [x - 3, y - 9.5, 0.7], [x - 5, y - 11, 0.6]], M.fuse, { part: `${part}Fuse` });
    p.glow(x - 5.5, y - 11.5, 3.5 + 2 * spark, '#ffb040', 0.3 + 0.25 * spark);
    p.px(x - 5.5, y - 11.5, '#fff0b0');
    if (spark > 0.4) p.px(x - 8, y - 12.5, '#ffe066');
    if (spark > 0.7) p.px(x - 3, y - 13, '#ffd166');
  });
}

export const powderMonkey: Model = {
  id: 'powder_monkey',
  w: 72,
  h: 60,
  ground: 58,
  // Бочонок в кадре контакта летит на 34 единицы левее рамки (с фитилём и искрами).
  pad: 50,
  draw(p: Painter) {
    const M = MONKEY;
    const G = 58;
    // Бросок бочонка: замах — вскинуть бочонок выше и назад, присев; выпад — швырнуть, бочонок летит к герою.
    // Урон: подбросило, бочонок качнуло, зажмурилась и визжит, искры от фитиля во все стороны.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const by = -p.bob(1.2, 3);
    // Фитиль искрит: мерцание по фазе, чаще, чем дыхание.
    const spark = (p.wave(6, 0.1) + 1) / 2;
    const tw = p.wave(1, 0.3);
    // Бочонок на голове до броска; после броска лапы пусты до последнего кадра — там он снова на голове, как в покое.
    const thrown = p.clip === 'attack' && p.u > 0.5 && p.u < 0.99;
    const [kx, ky] = mixPt([30, 15 + by], [40, 7], [18, 11], wind, strike);
    const krot = 0.05 * p.wave(1, 0.6) - 0.35 * wind + 0.25 * hurt;

    p.pose({ dx: -5 * strike + 2 * wind + 4 * hurt, dy: p.snap(2 * wind), rot: 0.06 * wind - 0.08 * strike + 0.1 * hurt, px: 40, py: G }, () => {
      p.shadow(40, 18, 2.5);
      // Хвост завитком за спиной.
      p.chain([[46, 46, 2.6], [55, 48, 2.2], [61 + tw, 42, 1.9], [61 + tw * 1.5, 34, 1.6], [56 + tw, 31, 1.3], [54 + tw * 0.5, 36, 1]], M.fur, { part: 'tail', tone: -0.05 });
      // Дальние лапы.
      p.chain([[44, 45 + by * 0.5, 4], [48, 51, 3.3], [45, 56, 2.5]], M.fur, { part: 'far', tone: -0.15 });
      p.limb(45, 56.5, 2.1, 39, 57.5, 1.4, M.face, { part: 'far', tone: -0.2 });
      // Дальняя рука держит бочонок сверху; после броска — вытянута вперёд, пустая.
      const [fhx, fhy] = thrown ? mixPt([34, 22], [34, 22], [14, 18], 0, Math.min(1, strike * 1.4)) : [kx + 6, ky - 3];
      p.chain([[41, 34 + by, 3], [44 - 4 * strike, 24 + by, 2.4], [fhx, fhy, 2.1]], M.fur, { part: 'farArm', tone: -0.15 });
      // Тело: сгорбленная спина, светлое брюхо.
      p.ellipse(39, 40 + by, 8.5, 9.5, M.fur, { rot: 0.25 });
      p.ellipse(35, 42 + by, 4.5, 6.5, M.face, { paint: true });
      // Ближняя нога.
      p.chain([[38, 47 + by * 0.5, 4.4], [32, 52, 3.6], [35, 56, 2.7]], M.fur, { part: 'near' });
      p.limb(35, 56.5, 2.3, 27, 57.5, 1.5, M.face, { part: 'near' });
      // Голова под бочонком: круглые уши, светлая морда, жёлтые глаза.
      p.pose({ dx: p.snap(2 * hurt), dy: by + p.snap(2 * wind), rot: 0.2 * hurt - 0.05 * strike, px: 34, py: 32 }, () => {
        p.ellipse(39.5, 24, 3.2, 3.6, M.fur, { part: 'earFar', tone: -0.1 });
        p.ellipse(32, 25, 7, 7, M.fur, { part: 'head' });
        p.ellipse(28.5, 26.5, 4.6, 4.4, M.face, { part: 'head', paint: true });
        p.ellipse(26, 29, 4, 3.2, M.face, { part: 'snout', lift: 2 });
        p.ellipse(37, 26, 2.8, 3.2, M.face, { part: 'ear' });
        p.ellipse(37, 26, 1.5, 1.9, M.ear, { part: 'ear', paint: true });
        p.line(25, 23.5, 31, 23 + wind, '#3a2618');
        const scream = hurt > 0.4 || strike > 0.4;
        if (scream) {
          p.ellipse(24.5, 30.5, 2.2, 1.8, M.mouth, { part: 'mouth' });
          p.px(24, 29.5, '#f0e8d8');
        } else p.line(23, 30.5, 26.5, 31, '#3a2618');
        p.px(22.5, 28, '#3a2618');
        const shut = hurt > 0.4 ? 1 : p.blink(0.45, 0.04);
        p.eye(28, 25.5, 1.2, '#ffe066', { closed: shut, pupil: '#1a1008', lid: '#4a3020' });
      });
      // Бочонок: на голове (на замахе — выше и назад), в кадре броска — летит к герою, кувыркаясь.
      const fuse = Math.max(spark, wind, hurt);
      if (!thrown) keg(p, kx, ky, krot, M, fuse, 'keg');
      else if (p.u < 0.65) keg(p, -22, 14, -1.3, M, 1, 'flying');
      // Ближняя рука держит бочонок за дно; после броска — вытянута к герою.
      const [hx, hy] = thrown ? mixPt([28, 34], [28, 34], [10, 22], 0, Math.min(1, strike * 1.4)) : [kx - 8, ky + 4];
      p.chain([[34, 35 + by, 3.2], [28 - 2 * strike, 28 + by, 2.6], [hx, hy, 2.2]], M.fur, { part: 'nearArm' });
      p.ellipse(hx, hy, 2.3, 2.1, M.face, { part: 'hand' });
      if (hurt > 0.3) for (const [ox, oy] of [[-6, -4], [4, -8], [8, 2], [-2, -12]]) p.px(kx - 5 + ox * (1 + hurt), ky - 12 + oy * (1 + hurt), '#ffd166');
    });
  },
};

// ─── Щупальце кракена ───────────────────────────────────────────────────────

const KRAKEN = {
  skin: { base: '#6a2a5a', shine: 0.5, tex: { kind: 'spots', scale: 3, amp: 0.2, density: 0.4 } } as Mat,
  under: { base: '#b0708e', shine: 0.3, tex: { kind: 'stripes', scale: 2.2, amp: 0.12 } } as Mat,
  sucker: { base: '#d8a8bc', dither: 0 } as Mat,
  plank: { base: '#5a3c26', tex: { kind: 'bark', scale: 1.4, amp: 0.25, angle: 0.1 } } as Mat,
  water: { base: '#0e1624', shine: 0.9, dither: 0 } as Mat,
};

/** Хребет щупальца от палубы к кончику: покой (изгиб вопросом, кончик крючком к герою), замах, удар, отдача. */
const TENT_REST: Pt[] = [[50, 152, 13], [54, 132, 12.5], [55, 112, 11.5], [50, 92, 10.5], [42, 74, 9], [32, 58, 7.5], [24, 42, 6], [20, 26, 4.6], [23, 13, 3.4], [31, 7, 2.4], [36, 13, 1.6]];
const TENT_WIND: Array<[number, number]> = [[50, 152], [56, 132], [62, 112], [68, 92], [72, 72], [72, 52], [68, 34], [62, 18], [54, 8], [46, 4], [42, 10]];
const TENT_HIT: Array<[number, number]> = [[50, 152], [46, 136], [38, 122], [26, 112], [12, 106], [-2, 104], [-16, 106], [-30, 112], [-42, 120], [-52, 128], [-58, 134]];
const TENT_HURT: Array<[number, number]> = [[50, 152], [56, 134], [62, 118], [66, 102], [66, 86], [62, 72], [56, 64], [52, 68], [54, 76], [60, 78], [64, 72]];

export const tentacle: Model = {
  id: 'tentacle',
  w: 96,
  h: 156,
  ground: 152,
  // Кончик в кадре контакта хлещет на 60 единиц левее рамки.
  pad: 70,
  draw(p: Painter) {
    const M = KRAKEN;
    const G = 152;
    // Удар: замах — щупальце откидывается назад и вверх; выпад — обрушивается на героя всей длиной.
    // Урон: свилось назад тугим кольцом, присоски сжаты.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const calm = 1 - Math.max(wind, strike, hurt);
    // Покачивается волной снизу вверх, кончик то сворачивается, то распрямляется.
    const spine = TENT_REST.map(([x, y, r], k) => {
      const f = k / (TENT_REST.length - 1);
      const [mx, my] = mixPt([x, y], TENT_WIND[k], TENT_HIT[k], wind, strike);
      const sw = 3 * p.wave(1, 0.1 - f * 0.6) * f * calm;
      const curl = f > 0.7 ? 2.5 * p.wave(1, 0.3) * (f - 0.7) * 3 * calm : 0;
      return [mx + (TENT_HURT[k][0] - x) * hurt + sw + curl, my + (TENT_HURT[k][1] - y) * hurt + curl * 0.6, r * (1 + 0.12 * hurt)] as Pt;
    });

    p.shadow(48, 30, 3.5, 0.3, G);
    // Пролом в палубе: чёрная вода, расщеплённые доски торчат по краям, в глубине — жёлтый глаз кракена.
    p.ellipse(48, G - 1, 26, 3.4, M.water, { part: 'hole', flat: 0.8 });
    const eye = p.clip === 'idle' && p.blink(0.62, 0.08) ? 0.3 : hurt > 0.4 ? 0 : 1;
    if (eye > 0) {
      p.glow(68, G - 1, 5, '#ffd166', 0.25 * eye);
      p.line(65, G - 1, 70, G - 1, eye > 0.5 ? '#ffd166' : '#8a6a30');
    }
    for (const [x0, lean, len, ph] of [[20, -0.5, 12, 0], [30, -0.3, 8, 1], [70, 0.4, 11, 2], [78, 0.7, 7, 3]] as Array<[number, number, number, number]>) {
      const tx = x0 + Math.sin(lean) * len, ty = G - 2 - Math.cos(lean) * len;
      p.poly([x0 - 3, G, x0 + 3, G, tx + 1, ty + 2, tx - 0.5, ty, tx - 1.5, ty + 3], M.plank, { part: `plank${ph}`, bevel: 1 });
    }

    // Само щупальце: верх лиловый и влажный, низ розовый, присоски рядом по внутренней стороне.
    p.chain(spine, M.skin, { part: 'tentacle' });
    for (let k = 0; k < spine.length - 1; k++) {
      const [x, y, r] = spine[k];
      const [x2, y2] = spine[k + 1];
      const l = Math.hypot(x2 - x, y2 - y) || 1;
      const nx = (y2 - y) / l, ny = -(x2 - x) / l;
      p.limb(x + nx * r * 0.45, y + ny * r * 0.45, r * 0.6, x2 + nx * spine[k + 1][2] * 0.45, y2 + ny * spine[k + 1][2] * 0.45, spine[k + 1][2] * 0.6, M.under, { part: 'tentacle', paint: true });
    }
    const n = 16;
    for (let k = 1; k < n; k++) {
      const { x, y, r, tx, ty } = along(spine, k / n);
      const nx = ty, ny = -tx;
      const sr = Math.max(0.9, r * 0.28) * (1 - 0.4 * hurt);
      p.ellipse(x + nx * r * 0.62, y + ny * r * 0.62, sr, sr, M.sucker, { part: 'suckers', lift: 1 });
      if (sr > 1.4) p.px(x + nx * r * 0.62, y + ny * r * 0.62, '#6a2a4a');
    }
    // Брызги с палубы от удара.
    if (strike > 0.5) for (const [ox, oy] of [[-10, -8], [0, -14], [10, -6], [-20, -4]]) p.disc(spine[spine.length - 3][0] + ox * strike, 104 + oy * strike, 1.2, '#a0c0d8');
  },
};

// ─── Сирена ─────────────────────────────────────────────────────────────────

const SIREN = {
  skin: { base: '#78b4a6', shine: 0.35, tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  hair: { base: '#15504c', shine: 0.45, tex: { kind: 'stripes', scale: 1.4, amp: 0.2, angle: 1.3 } } as Mat,
  scales: { base: '#206860', shine: 0.5, tex: { kind: 'spots', scale: 2.2, amp: 0.22, density: 0.6 } } as Mat,
  tail: { base: '#1a5a55', shine: 0.5, tex: { kind: 'spots', scale: 2.6, amp: 0.22, density: 0.6 } } as Mat,
  belly: { base: '#8cbcaa', shine: 0.3, tex: { kind: 'stripes', scale: 2.4, amp: 0.12 } } as Mat,
  fin: { base: '#358c80', tex: { kind: 'stripes', scale: 1.4, amp: 0.25, angle: 0.3 } } as Mat,
  pearl: { base: '#c0f0e0', shine: 0.9, dither: 0 } as Mat,
  claw: { base: '#c0f0e0', shine: 0.5, dither: 0 } as Mat,
  mouth: { base: '#1e3a40', dither: 0 } as Mat,
};

/** Хвост от пояса до плавника: покой (свёрнут кольцом у палубы, плавник поднят сзади) и отдача (хлестнул вверх). */
const SIREN_TAIL: Pt[] = [[44, 64, 8.5], [50, 80, 9], [52, 94, 8.5], [58, 102, 7.5], [70, 104, 6], [82, 102, 4.6], [90, 94, 3.4], [92, 86, 2.4]];
const SIREN_TAIL_HURT: Array<[number, number]> = [[44, 64], [52, 80], [56, 94], [64, 101], [76, 100], [86, 94], [92, 84], [94, 74]];
/** Когти наотмашь: плечо и предплечье по ходу клипа, градусы (как у Кикиморы, но размашистее). */
const SIREN_UPPER: Keys = [[0, 180], [0.14, 250], [0.3, 262], [0.43, 222], [0.57, 180], [0.72, 140], [0.86, 142], [1, 150]];
const SIREN_FORE: Keys = [[0, 230], [0.14, 290], [0.3, 300], [0.43, 240], [0.57, 180], [0.72, 140], [0.86, 170], [1, 196]];

export const siren: Model = {
  id: 'siren',
  w: 100,
  h: 112,
  ground: 110,
  // Когти в кадре контакта вытянуты к герою — на 22 единицы левее рамки.
  pad: 30,
  draw(p: Painter) {
    const M = SIREN;
    const G = 110;
    // Когти: замах — рука взлетает над головой, тело отклоняется на хвосте; удар — наотмашь к герою, тело следом.
    // Урон: отбросило назад, волосы взлетели, хвост хлестнул вверх, глаза зажмурены, рот раскрыт.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.2, 2);
    // Волосы колышутся, как под водой; плавник покачивается; она поёт: рот приоткрывается, всплывает нота.
    const sway = p.wave(1, 0.2);
    const song = p.clip === 'idle' ? (p.wave(2, 0.25) + 1) / 2 : 0;
    const note = p.clip === 'idle' && p.t > 0.15 && p.t < 0.65 ? (p.t - 0.15) / 0.5 : -1;

    p.pose({ dx: -6 * strike + 2 * wind + 5 * hurt, rot: 0.06 * wind - 0.08 * strike + 0.08 * hurt, px: 52, py: G }, () => {
      p.shadow(56, 30, 3);

      // Волосы за спиной — длинные пряди до хвоста, плывут волной.
      for (let k = 0; k < 4; k++) {
        const ph = k * 0.18;
        const flow = (f: number): number => 2.5 * p.wave(1, ph - f * 0.5) * f + 10 * hurt * f;
        p.chain([[44 + k * 2, 14 + up, 3.2], [52 + k * 2 + flow(0.3), 30 + up - 6 * hurt, 3], [56 + k * 2.5 + flow(0.6), 46 - 10 * hurt, 2.4], [58 + k * 3 + flow(1), 62 - 16 * hurt, 1.4]], M.hair, { part: 'hairBack', tone: -0.08 - k * 0.03 });
      }

      // Хвост: чешуйчатое кольцо у палубы, светлое брюхо снизу, плавник веером сзади.
      const tail = SIREN_TAIL.map(([x, y, r], k) => {
        const f = k / (SIREN_TAIL.length - 1);
        const hx = SIREN_TAIL_HURT[k][0], hy = SIREN_TAIL_HURT[k][1];
        return [x + (hx - x) * hurt + 1.5 * sway * f * f, y + (hy - y) * hurt - 2 * p.wave(1, 0.4 - f * 0.4) * f * f, r] as Pt;
      });
      p.chain(tail, M.tail, { part: 'tail' });
      for (let k = 1; k < tail.length - 2; k++) {
        const [x, y, r] = tail[k];
        p.ellipse(x - 1, y + r * 0.45, r * 0.8, r * 0.5, M.belly, { part: 'tail', paint: true });
      }
      const [fx, fy] = [tail[tail.length - 1][0], tail[tail.length - 1][1]];
      const fan = p.wave(1, 0.1) * 3 + 6 * hurt;
      p.poly([fx - 2, fy + 2, fx - 6 + fan * 0.3, fy - 14 - fan, fx + 2, fy - 8, fx + 12 + fan, fy - 12 - fan * 0.5, fx + 4, fy + 2], M.fin, { part: 'fin', bevel: 1.5 });
      p.line(fx, fy, fx - 5 + fan * 0.3, fy - 12 - fan, '#8ae0d0');
      p.line(fx, fy, fx + 10 + fan, fy - 10 - fan * 0.5, '#8ae0d0');

      // Дальняя рука опирается на хвост.
      p.chain([[50, 38 + up, 3.4], [56, 50 + up, 2.8], [55, 62, 2.4]], M.skin, { part: 'farArm', tone: -0.14 });
      p.ellipse(55, 64, 2.8, 2.2, M.skin, { part: 'farArm', tone: -0.14 });

      // Тело: тонкий стан, чешуйчатый лиф, плавники на локтях, жемчуг на шее.
      p.ellipse(44, 58, 9, 8, M.skin, { part: 'body' });
      p.ellipse(44, 44 + up, 9.5, 10, M.skin, { part: 'body' });
      p.ellipse(44, 44 + up, 9.5, 5, M.scales, { part: 'body', paint: true });
      p.ellipse(44, 64, 9.5, 5, M.scales, { part: 'body', paint: true });
      for (let k = 0; k < 5; k++) p.disc(38 + k * 2.5, 36 + up + Math.abs(k - 2) * 0.8, 0.9, '#d8fff4');

      // Голова: высокий лоб, плавники-уши, светлые глаза без зрачков.
      p.limb(44, 34 + up, 3.5, 42, 27 + up, 4, M.skin, { part: 'neck' });
      p.pose({ dx: p.snap(2 * hurt - 1.5 * strike), dy: up, rot: 0.25 * hurt - 0.06 * strike + 0.05 * wind, px: 43, py: 30 }, () => {
        p.ellipse(41, 18, 8, 9, M.skin, { part: 'head' });
        p.ellipse(37, 23, 5.5, 4.5, M.skin, { part: 'head' });
        p.limb(34, 18, 1.6, 32, 22, 1.4, M.skin, { part: 'nose', lift: 2 });
        // Ухо-плавник веером назад.
        p.poly([45, 17, 53 + 2 * hurt, 11, 54, 17, 52 + 2 * hurt, 23, 46, 21], M.fin, { part: 'earFin', bevel: 1 });
        p.line(46, 18, 53, 12, '#8ae0d0');
        p.line(46, 20, 52, 22, '#8ae0d0');
        // Чёлка и пряди у лица.
        p.poly([33, 12, 40, 7, 50, 8, 52, 14, 46, 13, 40, 12, 36, 15], M.hair, { part: 'hair', bevel: 2 });
        p.chain([[48, 12, 2.6], [50 + sway, 22, 2], [50 + sway * 1.5 + 4 * hurt, 32 - 4 * hurt, 1.2]], M.hair, { part: 'hair' });
        // Рот: поёт — приоткрыт; в ударе шипит, от удара раскрыт.
        const mo = hurt > 0.4 ? 2.5 : strike > 0.4 ? 2 : song * 1.4;
        if (mo > 0.7) p.ellipse(33.5, 25.5, 1.8, mo * 0.8, M.mouth, { part: 'mouth' });
        else p.line(32, 25.5, 35, 25.5, '#1e3a40');
        const shut = hurt > 0.4 ? 1 : p.blink(0.85);
        if (!shut) p.glow(36, 18.5, 4, '#d8fff4', 0.4);
        p.eye(36, 18.5, 1.4, '#f0fffc', { closed: shut, lid: '#123a38' });
        if (note >= 0) {
          const nx = 30 - note * 6 + 2 * Math.sin(note * 9), ny = 22 - note * 16;
          p.line(nx, ny, nx, ny - 3, `#c0f0e0${Math.round((1 - note) * 220).toString(16).padStart(2, '0')}`);
          p.px(nx - 1, ny, `#c0f0e0${Math.round((1 - note) * 220).toString(16).padStart(2, '0')}`);
        }
      });

      // Ближняя рука: в покое поднята к герою, как в песне, когти раскрыты; в ударе — мах наотмашь.
      const a1 = ang(p, SIREN_UPPER, 150) - 30 * hurt;
      const a2 = ang(p, SIREN_FORE, 196) - 40 * hurt + 4 * sway;
      const { ex, ey, hx, hy } = limb2(38, 38 + up, a1, 11, a2, 10);
      p.chain([[38, 38 + up, 3.4], [ex, ey, 2.8], [hx, hy, 2.3]], M.skin, { part: 'nearArm' });
      p.poly([ex - 1, ey, ex + 5, ey + 4, ex + 2, ey + 6], M.fin, { part: 'elbowFin', bevel: 0.8 });
      for (const f of [-0.7, -0.2, 0.3, 0.8]) {
        const a = a2 * DEG + f * 0.7;
        p.chain([[hx, hy, 1], [hx + 4 * Math.cos(a), hy + 4 * Math.sin(a), 0.8], [hx + 9 * Math.cos(a + 0.35), hy + 9 * Math.sin(a + 0.35), 0.5]], M.claw, { part: 'claws' });
      }
    });
  },
};

// ─── Морской дьявол ─────────────────────────────────────────────────────────

const DEVIL = {
  skin: { base: '#347878', shine: 0.45, tex: { kind: 'spots', scale: 2.8, amp: 0.2, density: 0.45 } } as Mat,
  beard: { base: '#2a6a68', shine: 0.5, tex: { kind: 'stripes', scale: 1.6, amp: 0.15 } } as Mat,
  horn: { base: '#566e66', tex: { kind: 'stripes', scale: 1.6, amp: 0.3, angle: 0.5 } } as Mat,
  coat: { base: '#163a48', shag: 0.22, tex: { kind: 'noise', scale: 2.5, amp: 0.14 } } as Mat,
  leg: { base: '#0a3a3a', shine: 0.35, tex: { kind: 'spots', scale: 2.5, amp: 0.2, density: 0.5 } } as Mat,
  fin: { base: '#1e6a6a', tex: { kind: 'stripes', scale: 1.4, amp: 0.25, angle: 0.3 } } as Mat,
  barnacle: { base: '#6e7e78', tex: { kind: 'spots', scale: 1.5, amp: 0.4, density: 0.6 } } as Mat,
  coral: { base: '#8ac8cc', shine: 0.7, tex: { kind: 'noise', scale: 1.5, amp: 0.2 } } as Mat,
  mouth: { base: '#0e2022', dither: 0 } as Mat,
  tooth: { base: '#d8e8e0', dither: 0 } as Mat,
};

/** Трезубец: [конец древка, острие] в покое (наискось через тело к герою), в замахе (занесён вверх) и в ударе (вниз к герою). */
const SPEAR_REST: [number, number, number, number] = [74, 118, 10, 44];
const SPEAR_WIND: [number, number, number, number] = [86, 80, 38, 2];
const SPEAR_HIT: [number, number, number, number] = [56, 60, -42, 100];

export const seaDevil: Model = {
  id: 'sea_devil',
  w: 110,
  h: 146,
  ground: 142,
  // Трезубец в кадре контакта вонзается в палубу у героя — на 56 единиц левее рамки, сияние — ещё дальше.
  pad: 74,
  draw(p: Painter) {
    const M = DEVIL;
    const G = 142;
    // Трезубец: замах — занести обеими руками над рогами; удар — вонзить вниз к герою, брызги волны.
    // Урон: голову запрокинуло, щупальца бороды взметнулись, глаза погасли.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.5, 2);
    const calm = 1 - Math.max(wind, strike, hurt);
    const pulse = (p.wave(2, 0.3) + 1) / 2;
    // С бороды срывается капля.
    const drip = p.clip === 'idle' && p.t > 0.5 && p.t < 0.8 ? (p.t - 0.5) / 0.3 : -1;

    p.pose({ dx: -8 * strike + 3 * wind + 5 * hurt, rot: 0.05 * wind - 0.07 * strike + 0.06 * hurt, px: 56, py: G }, () => {
      p.shadow(56, 34, 3.5);
      const [bx0, by0, tx0, ty0] = SPEAR_REST;
      const [bx, by] = mixPt([bx0, by0], [SPEAR_WIND[0], SPEAR_WIND[1]], [SPEAR_HIT[0], SPEAR_HIT[1]], wind, strike);
      const [tx1, ty1] = mixPt([tx0, ty0], [SPEAR_WIND[2], SPEAR_WIND[3]], [SPEAR_HIT[2], SPEAR_HIT[3]], wind, strike);
      const tx = tx1 + 6 * hurt + calm * p.wave(1, 0.2), ty = ty1 + up + 10 * hurt;
      const L = Math.hypot(tx - bx, ty - by), ux = (tx - bx) / L, uy = (ty - by) / L;
      const onShaft = (f: number): [number, number] => [bx + (tx - bx) * f, by + (ty - by) * f];

      // Дальняя нога: перепончатая ступня, плавник на икре.
      p.chain([[64, 92, 10], [70, 114, 8], [70, 132, 5.5]], M.leg, { part: 'far', tone: -0.14 });
      p.poly([60, G - 6, 74, G - 6, 76, G, 56, G, 57, G - 3], M.leg, { part: 'far', tone: -0.14, bevel: 1.5 });
      p.poly([74, 114, 82, 104, 78, 122], M.fin, { part: 'farFin', tone: -0.14, bevel: 1 });

      // Спинной плавник-гребень по хребту — над сутулой спиной.
      const crest: number[] = [];
      for (let k = 0; k <= 5; k++) {
        const f = k / 5;
        crest.push(58 + f * 22, 30 + f * 34 - (8 + 4 * Math.sin(f * Math.PI)) * (1 - 0.5 * hurt) - 1.5 * p.wave(1, -f));
      }
      p.poly([...crest, 80, 66, 60, 40], M.fin, { part: 'crest', bevel: 2 });

      // Дальняя рука держит древко у конца.
      const [fhx, fhy] = onShaft(0.22);
      p.chain([[66, 48 + up, 7], [74 + 4 * wind, 64 + up - 8 * wind, 5.6], [fhx, fhy, 4.6]], M.skin, { part: 'farArm', tone: -0.14 });

      // Древко из кости и коралла, три зубца-рога, светятся голубым.
      p.limb(bx, by, 2, tx - ux * 8, ty - uy * 8, 1.8, M.coral, { part: 'shaft' });
      const nx = -uy, ny = ux;
      const [cx, cy] = [tx - ux * 10, ty - uy * 10];
      p.limb(cx + nx * 8, cy + ny * 8, 1.5, cx - nx * 8, cy - ny * 8, 1.5, M.coral, { part: 'tines' });
      for (const o of [-8, 0, 8]) {
        const len = o === 0 ? 17 : 13;
        p.chain([[cx + nx * o, cy + ny * o, 1.5], [cx + nx * o * 1.15 + ux * len * 0.6, cy + ny * o * 1.15 + uy * len * 0.6, 1.1], [cx + nx * o * 1.05 + ux * len, cy + ny * o * 1.05 + uy * len, 0.5]], M.coral, { part: 'tines' });
      }
      p.glow(cx + ux * 8, cy + uy * 8, 12 + 3 * pulse, '#c0f0ff', 0.18 + 0.12 * pulse);

      // Туловище: сутулое, в рваном камзоле, плечи в ракушках.
      p.ellipse(56, 70, 20, 18, M.coat);
      p.ellipse(56, 52 + up, 22, 18, M.coat);
      p.poly([36, 76, 76, 76, 80, 104, 72, 100, 66, 108, 58, 100, 50, 108, 42, 100, 34, 106], M.coat, { bevel: 4 });
      p.poly([40, 38 + up, 54, 40 + up, 47, 58 + up], M.skin, { paint: true });
      for (const [x, y] of [[60, 38], [66, 42], [70, 48], [62, 44], [48, 40]]) p.ellipse(x, y + up, 2.2, 1.8, M.barnacle, { part: 'barnacles', lift: 1.5 });

      // Ближняя нога.
      p.chain([[48, 92, 10.5], [42, 114, 8.5], [42, 132, 6]], M.leg, { part: 'near' });
      p.poly([30, G - 6, 46, G - 6, 48, G, 26, G, 27, G - 3], M.leg, { part: 'near', bevel: 1.5 });
      for (const x of [29, 34, 39]) p.px(x, G - 1, '#123a3a');
      p.poly([46, 114, 54, 104, 50, 122], M.fin, { part: 'nearFin', bevel: 1 });

      // Голова вперёд и вниз: рога бараном, пасть с иглами, борода из щупалец, глаза-огни.
      p.pose({ dx: p.snap(3 * hurt - 2 * strike), dy: up + p.snap(-2 * wind + 2 * strike), rot: 0.22 * hurt - 0.08 * strike + 0.06 * wind, px: 48, py: 42 }, () => {
        // Дальний рог.
        p.chain([[48, 18, 4.4], [58, 12, 4], [66, 16, 3.2], [68, 26, 2.4], [62, 30, 1.6]], M.horn, { part: 'hornFar', tone: -0.15 });
        p.ellipse(42, 28, 12, 12, M.skin, { part: 'head' });
        p.ellipse(34, 34, 10, 7, M.skin, { part: 'head' });
        // Щупальца бороды свисают с челюсти и шевелятся.
        const tentacles: Array<[number, number, number]> = [[28, 38, 0], [33, 40, 0.25], [38, 40, 0.5], [43, 38, 0.75], [47, 35, 0.9]];
        for (const [x, y, ph] of tentacles) {
          const w1 = 2.5 * p.wave(1, ph) * calm, w2 = 2.5 * p.wave(1, ph + 0.3) * calm;
          const fl = 10 * hurt;
          p.chain([[x, y, 2.6], [x + w1 * 0.5 + fl * 0.3, y + 8 - fl * 0.5, 2], [x + w1 + fl * 0.6, y + 15 - fl, 1.5], [x + w2 - 2 + fl, y + 20 - fl * 1.5, 1]], M.beard, { part: `beard${ph}` });
        }
        if (drip >= 0) p.disc(38, 60 + drip * (G - 62), 0.9, '#8ad0d0');
        // Пасть: в покое щель с иглами, в ударе и от боли — раскрыта.
        const open = 1 + 3 * strike + 1.5 * wind + 3 * hurt;
        p.poly([26, 33, 40, 32, 39, 33 + open, 28, 34 + open * 0.7], M.mouth, { part: 'mouth', bevel: 0.6 });
        for (const x of [28, 31, 34, 37]) p.px(x, 33.2, '#d8e8e0');
        // Ближний рог: толстый у лба, завит назад и вниз.
        p.chain([[46, 16, 5], [54, 6, 4.4], [64, 4, 3.6], [70, 10, 2.8], [68, 18, 2], [63, 19, 1.3]], M.horn, { part: 'horn' });
        // Надбровье и светящиеся глаза.
        p.limb(30, 22, 3, 42, 20, 3, M.skin, { part: 'brow', lift: 2 });
        const shut = hurt > 0.4 ? 1 : p.blink(0.3, 0.04);
        if (!shut) p.glow(34, 25, 5 + 2 * pulse, '#c0f0ff', 0.3);
        p.eye(34, 25, 1.5, '#d8faff', { closed: shut, glint: '#ffffff', lid: '#0e2022' });
        p.eye(40, 24.5, 1.2, '#d8faff', { closed: shut, lid: '#0e2022' });
      });

      // Ближняя рука держит древко посередине.
      const [nhx, nhy] = onShaft(0.55);
      p.chain([[44, 50 + up, 7.5], [40, 66 + up, 6], [nhx, nhy, 5]], M.skin, { part: 'nearArm' });
      p.ellipse(nhx, nhy, 5, 4.6, M.skin, { part: 'fist' });
      for (const [x, y] of [[44, 50], [40, 56]]) p.ellipse(x, y + up, 2.2, 1.8, M.barnacle, { part: 'armBarnacles', lift: 1.5 });
      // Брызги волны от удара трезубцем.
      if (strike > 0.5) {
        for (const [ox, oy] of [[-6, -10], [4, -16], [12, -8], [-2, -22], [10, -24]]) p.disc(tx + ox * strike, ty + oy * strike, 1.2, '#b0e8f0');
      }
    });
  },
};

// ─── Проклятый капитан и его призрак ────────────────────────────────────────

interface CaptainLook {
  skin: Mat; beard: Mat; hat: Mat; gold: Mat; coat: Mat; vest: Mat; lace: Mat; pants: Mat; boot: Mat; steel: Mat; iron: Mat; wood: Mat;
  /** Цвет глаз и их свечения. */
  eye: string;
  /** Призрак: без ног — низ плаща тает клочьями тумана, всё тело парит. */
  ghost: boolean;
}

const CAPTAIN: CaptainLook = {
  skin: { base: '#8fa8a0', tex: { kind: 'spots', scale: 3, amp: 0.18, density: 0.3 } },
  beard: { base: '#1e1c22', shag: 0.25, tex: { kind: 'stripes', scale: 1.2, amp: 0.18, angle: 1.5 } },
  hat: { base: '#1a1a2a', tex: { kind: 'noise', scale: 2.5, amp: 0.1 } },
  gold: { base: '#d4af37', shine: 0.9, dither: 0 },
  coat: { base: '#3a1a2a', tex: { kind: 'noise', scale: 2.5, amp: 0.12 } },
  vest: { base: '#26202c', tex: { kind: 'stripes', scale: 1.5, amp: 0.1, angle: 1.57 } },
  lace: { base: '#b8b4a6', tex: { kind: 'noise', scale: 1.2, amp: 0.2 } },
  pants: { base: '#1a1a2a', tex: { kind: 'stripes', scale: 3, amp: 0.06, angle: 1.57 } },
  boot: { base: '#221c22', shine: 0.35 },
  steel: { base: '#c9ccd1', shine: 1, dither: 0 },
  iron: { base: '#3e3e46', shine: 0.7, dither: 0 },
  wood: { base: '#4a3226', tex: { kind: 'stripes', scale: 1.5, amp: 0.12 } },
  eye: '#5cf0ff',
  ghost: false,
};

const GHOST: CaptainLook = {
  skin: { base: '#7ab8c8', glow: true, dither: 0.5 },
  beard: { base: '#3a6a7a', shag: 0.3, tex: { kind: 'stripes', scale: 1.2, amp: 0.18, angle: 1.5 } },
  hat: { base: '#2a3a4a', tex: { kind: 'noise', scale: 2.5, amp: 0.12 } },
  gold: { base: '#7ad8e8', shine: 0.8, dither: 0 },
  coat: { base: '#2a4a5a', shag: 0.2, tex: { kind: 'noise', scale: 2.5, amp: 0.14 } },
  vest: { base: '#223a48', tex: { kind: 'stripes', scale: 1.5, amp: 0.1, angle: 1.57 } },
  lace: { base: '#9ad0dc', tex: { kind: 'noise', scale: 1.2, amp: 0.2 } },
  pants: { base: '#1a2a3a' },
  boot: { base: '#1a2a3a' },
  steel: { base: '#5cf0ff', glow: true, dither: 0 },
  iron: { base: '#3a6a7a', shine: 0.6, dither: 0 },
  wood: { base: '#2a4a5a' },
  eye: '#b8fbff',
  ghost: true,
};

/**
 * Удар саблей наискось: плечо, предплечье и клинок по ходу клипа. Замах — клинок высоко над треуголкой и за спиной;
 * контакт — рука вытянута к герою, клинок уходит вниз наискось; потом опускается остриём к палубе, как в покое.
 */
const CAPT_UPPER: Keys = [[0, 135], [0.14, 250], [0.3, 262], [0.43, 222], [0.57, 180], [0.72, 140], [0.86, 110], [1, 100]];
const CAPT_FORE: Keys = [[0, 170], [0.14, 300], [0.3, 312], [0.43, 238], [0.57, 172], [0.72, 128], [0.86, 118], [1, 120]];
const CAPT_BLADE: Keys = [[0, 200], [0.14, 350], [0.3, 366], [0.43, 262], [0.57, 170], [0.72, 122], [0.86, 114], [1, 115]];

function captainFigure(p: Painter, L: CaptainLook): void {
  const G = 126;
  // Сабля: замах — клинок взлетает над треуголкой, плащ раздувается; удар — наискось к герою, шаг вперёд.
  // Урон: отбросило, треуголку сбило набок, голова назад, глаза погасли.
  const { wind, strike } = p.attack();
  const hurt = p.hurt();
  const up = -p.bob(1.2, 2);
  // Призрак парит: всё тело качается вверх-вниз на два пикселя.
  const hover = L.ghost ? -p.bob(2.5, 1, 0.25) - 4 : 0;
  const hem = p.wave(1, 0.3) * (1 - strike) + 3 * strike + 4 * hurt;
  // Глаза мертвеца разгораются и гаснут дважды за цикл.
  const pulse = (p.wave(2, 0.1) + 1) / 2;

  p.pose({ dx: -8 * strike + 3 * wind + 6 * hurt, dy: hover, rot: 0.04 * wind - 0.06 * strike + 0.06 * hurt, px: 48, py: G }, () => {
    if (L.ghost) p.shadow(48, 22, 2.5, 0.18);
    else p.shadow(48, 30, 3.5);

    // Дальняя рука с пистолем: кулак у плеча, ствол вверх.
    const pistol = (): void => {
      p.limb(60, 44 + up, 5.6, 64, 58 + up, 4.8, L.coat, { part: 'farArm', tone: -0.14 });
      p.limb(64, 58 + up, 4.6, 66, 47 + up, 4, L.coat, { part: 'farArm', tone: -0.14 });
      p.pose({ rot: -0.1 * wind + 0.25 * hurt, px: 66, py: 46 + up }, () => {
        p.limb(67, 46 + up, 2, 67, 30 + up, 1.6, L.iron, { part: 'pistol' });
        p.limb(66, 50 + up, 2.6, 71, 55 + up, 2.2, L.wood, { part: 'pistolGrip' });
        p.ellipse(71, 55.5 + up, 2.4, 2, L.gold, { part: 'pistolGrip' });
        p.limb(68.5, 44 + up, 0.8, 70, 41 + up, 0.8, L.iron, { part: 'hammer' });
      });
      p.ellipse(66, 48 + up, 4, 3.6, L.skin, { part: 'farFist', tone: -0.1 });
      p.ellipse(64, 51 + up, 4.6, 2.6, L.lace, { part: 'farCuff', tone: -0.1 });
    };
    pistol();

    if (L.ghost) {
      // Вместо ног — туман: полупрозрачные клочья тянутся назад, подол рваный.
      const sw = p.wave(1, 0.1), sw2 = p.wave(1, 0.45);
      p.film([28, 100, 72, 100, 80 + sw * 2, 110, 92 + sw * 3, 118, 74, 114, 62 + sw2 * 2, 122, 52, 114, 42 + sw2, 120, 34, 110], '#5cf0ff40', true);
      p.film([40, 104, 64, 104, 70 + sw2 * 2, 114, 56, 112, 48, 116], '#b8fbff30', true);
    } else {
      // Ноги: чёрные бриджи, высокие ботфорты с раструбом.
      p.chain([[54, 88, 7], [60, 104, 5.6], [61, 114, 4.4]], L.pants, { part: 'far', tone: -0.12 });
      boot(p, 64, G, 14, 22, L.boot, 'far', -0.1);
      p.poly([55, 102, 69, 102, 68, 107, 56, 107], L.boot, { part: 'far', tone: -0.05, bevel: 1.5 });
      p.chain([[40, 88, 7.5], [34, 104, 6], [33, 114, 4.6]], L.pants, { part: 'near' });
      boot(p, 37, G, 15, 22, L.boot, 'near');
      p.poly([27, 102, 42, 102, 41, 107, 28, 107], L.boot, { part: 'near', tone: 0.05, bevel: 1.5 });
    }

    // Бордовый камзол до колен: золотой кант, пуговицы, обшлага; на подоле ракушки и водоросли — он давно на дне.
    p.ellipse(47, 58 + up, 16, 18, L.coat);
    p.poly([30, 70, 64, 70, 68 + hem * 0.5, 96, 72 + hem, 106, 60 + hem * 0.6, 104, 50, 98, 40, 104, 28 + hem * 0.3, 106, 26, 96], L.coat, { bevel: 4 });
    p.poly([38, 42 + up, 50, 42 + up, 50, 80, 40, 80], L.vest, { paint: true });
    p.limb(38, 42 + up, 0.9, 38, 100, 0.9, L.gold, { paint: true });
    for (const y of [50, 58, 66]) p.px(36, y + up, L.ghost ? '#b8fbff' : '#f0d060');
    p.poly([32, 76, 64, 76, 64, 81, 32, 81], L.hat, { paint: true });
    p.block(46, 77, 3, 2, L.ghost ? '#b8fbff' : '#f0d060');
    p.poly([27, 103, 72 + hem, 104, 72 + hem, 106, 26, 106], L.gold, { paint: true });
    if (!L.ghost) for (const [x, y] of [[30, 100], [58, 101], [66, 97], [33, 96]]) p.px(x, y, '#c8c0a8');
    // Кружевное жабо под бородой.
    p.poly([38, 40 + up, 46, 38 + up, 46, 48 + up, 40, 50 + up], L.lace, { part: 'jabot', bevel: 1.5 });

    // Голова: мертвенная кожа, запавшие щёки, борода с косицами и бусинами, глаза горят голубым.
    p.limb(47, 38 + up, 6, 46, 31 + up, 6.5, L.skin, { part: 'neck' });
    p.pose({ dx: p.snap(2 * hurt - strike), dy: up, rot: 0.18 * hurt - 0.05 * strike + 0.04 * wind, px: 46, py: 34 }, () => {
      p.ellipse(45, 23, 9.5, 10, L.skin, { part: 'head' });
      p.ellipse(40.5, 29, 7.5, 5.5, L.skin, { part: 'head' });
      p.poly([33, 29, 41, 28, 47, 25, 49, 33, 43, 40, 36, 38], L.beard, { part: 'head', paint: true });
      const sw = p.wave(1, 0.35) * (1 - strike) + 2 * hurt;
      p.chain([[36, 36, 1.8], [35 + sw * 0.5, 42, 1.4], [35 + sw, 47, 1]], L.beard, { part: 'braid' });
      p.chain([[42, 38, 1.8], [42 + sw * 0.5, 44, 1.4], [43 + sw, 49, 1]], L.beard, { part: 'braid' });
      p.px(35 + sw, 47, L.ghost ? '#b8fbff' : '#d4af37');
      p.px(43 + sw, 49, L.ghost ? '#b8fbff' : '#d4af37');
      p.ellipse(52, 24, 2.2, 3, L.skin, { part: 'ear' });
      p.ellipse(41.5, 25.5, 2, 1.4, L.hat, { part: 'head', paint: true, tone: -0.3 });
      p.limb(36, 20, 2, 33, 26, 1.9, L.skin, { part: 'nose', lift: 3 });
      if (hurt > 0.4 || strike > 0.5) p.poly([34, 30, 39, 30, 38.5, 33, 35, 32.5], L.hat, { part: 'mouth', bevel: 0.6 });
      else p.line(34, 30.5, 39, 30.5, '#101018');
      const shut = hurt > 0.4 ? 1 : p.blink(0.7, 0.04);
      if (!shut) p.glow(38, 21.5, 5 + 2 * pulse, L.eye, 0.25 + 0.2 * pulse);
      p.eye(38, 21.5, 1.3, L.eye, { closed: shut, glint: '#ffffff', lid: '#101018' });
      p.line(35, 17.5, 41, 19 + 1.5 * wind, '#101018');
      // Треуголка: высокая тулья, поля с золотым галуном, белый череп спереди.
      p.pose({ rot: 0.22 * hurt, px: 50, py: 16 }, () => {
        p.ellipse(46, 10, 11, 7, L.hat, { part: 'hat' });
        p.poly([26, 15, 31, 8, 46, 12, 60, 5, 68, 10, 62, 17, 46, 18, 30, 18.5], L.hat, { part: 'hat', bevel: 1.8 });
        p.line(27, 15.5, 46, 17, L.ghost ? '#7ad8e8' : '#d4af37');
        p.line(46, 17, 66, 11, L.ghost ? '#7ad8e8' : '#d4af37');
        p.disc(44, 10, 1.6, L.ghost ? '#c8f8ff' : '#dcd8c8');
        p.line(42, 13, 46, 13, L.ghost ? '#c8f8ff' : '#dcd8c8');
      });
    });

    // Ближняя рука с саблей: в покое остриё у палубы, в ударе — наискось к герою.
    const a1 = ang(p, CAPT_UPPER, 100) - 20 * hurt;
    const a2 = ang(p, CAPT_FORE, 120) - 30 * hurt;
    const a3 = ang(p, CAPT_BLADE, 115) + 25 * hurt + 1.5 * p.wave(1, 0.6);
    const { ex, ey, hx, hy } = limb2(36, 44 + up, a1, 14, a2, 13);
    sabre(p, hx, hy, a3, 32, L.steel, L.gold, 'blade', 1, 2.6);
    if (L.ghost) p.glow(...at(hx, hy, a3, 16), 12, '#5cf0ff', 0.2);
    p.limb(36, 44 + up, 6, ex, ey, 5.2, L.coat, { part: 'nearArm' });
    p.limb(ex, ey, 5, hx, hy, 4.2, L.coat, { part: 'nearArm' });
    // Обшлаг с золотом и кружевная манжета.
    const [cx, cy] = at(hx, hy, a2 + 180, 4);
    p.ellipse(cx, cy, 5, 4.4, L.coat, { part: 'cuff', lift: 1 });
    p.ellipse(cx, cy, 5, 4.4, L.gold, { part: 'cuff', paint: true, tone: -0.2 });
    p.ellipse(hx, hy, 4, 3.8, L.skin, { part: 'fist' });
    // Эполет с бахромой на ближнем плече.
    p.ellipse(37, 41 + up, 5, 2, L.gold, { part: 'epaulet' });
    for (const x of [34, 37, 40]) p.line(x, 43 + up, x, 45 + up, L.ghost ? '#4aa8b8' : '#8a6a20');
  });
}

export const cursedCaptain: Model = {
  id: 'cursed_captain',
  w: 100,
  h: 130,
  ground: 126,
  // Сабля в замахе над треуголкой, в кадре контакта — на 44 единицы левее рамки.
  pad: 52,
  draw: (p) => captainFigure(p, CAPTAIN),
};

export const captainGhost: Model = {
  id: 'captain_ghost',
  w: 100,
  h: 130,
  ground: 126,
  pad: 52,
  flies: true,
  draw: (p) => captainFigure(p, GHOST),
};

export const SHIP_MODELS: Record<string, Model> = {
  pirate, gunner, bosun, parrot, powder_monkey: powderMonkey, siren, tentacle, first_mate: firstMate, sea_devil: seaDevil, cursed_captain: cursedCaptain, captain_ghost: captainGhost,
};
