import { keys, mixPt, scaleModel, type Keys, type Mat, type Model, type Painter, type Shape } from './pixel';

/**
 * Враги Склепа пиксельной лепкой. Все смотрят влево — на героя; единица — пиксель поля боя,
 * рост от макушки до земли — как в `ENEMY_BODY_HEIGHT` (characterSizes.ts).
 * Цвета продолжают палитры прежних спрайтов (`sprite` в enemies.ts) и рисованных листов скелетов и некроманта:
 * кость — тёплая слоновая, глаза нежити — холодные точки в чёрных глазницах, призраки голубые, Тень фиолетовая,
 * гуль серо-зелёный с красными глазами, слизни болотные, мумия в бинтах цвета пергамента, вампир бледный
 * в чёрном с багровой подкладкой, ведьма в фиолетовом с зелёным зельем, некромант в фиолетовом капюшоне
 * с зелёным огнём, лич в пурпуре с золотой короной. Склеп освещён свечами (тонировка `crypt` тёплая),
 * поэтому колдовской свет нежити — голубой, зелёный и фиолетовый: он остаётся самым заметным пятном.
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

/** Колдовское пламя в три светящихся слоя: край, середина, ядро. */
interface Fire { outer: Mat; mid: Mat; core: Mat }

/** Зелёный огонь некроманта. */
const GRAVE_FIRE: Fire = {
  outer: { base: '#1e9a52', glow: true, dither: 0, ramp: ['#126a38', '#18803f', '#1e9a4a', '#28b058', '#34c468'] } as Mat,
  mid: { base: '#52e08a', glow: true, dither: 0, ramp: ['#34c46a', '#44d27a', '#58e08a', '#74ec9e', '#90f4b2'] } as Mat,
  core: { base: '#c8ffd8', glow: true, dither: 0, noOutline: true, ramp: ['#a0f8c0', '#b4fcce', '#c8ffd8', '#dcffe6', '#f0fff4'] } as Mat,
};

/** Пурпурный огонь лича. */
const LICH_FIRE: Fire = {
  outer: { base: '#6a1ab0', glow: true, dither: 0, ramp: ['#4a1080', '#5a1498', '#6a1ab0', '#7c26c4', '#8e34d4'] } as Mat,
  mid: { base: '#a45af0', glow: true, dither: 0, ramp: ['#8a3ee0', '#984cea', '#a85cf2', '#b872f8', '#c888fc'] } as Mat,
  core: { base: '#ecd8ff', glow: true, dither: 0, noOutline: true, ramp: ['#d8b8ff', '#e0c8ff', '#ecd8ff', '#f4e8ff', '#fcf6ff'] } as Mat,
};

/**
 * Язык колдовского пламени от основания (x, y) вверх длиной `len`: три слоя, кончик клонится на `lean` и дрожит `sway`.
 * `r` — полуширина у основания. Части — `fire`, `fireMid`, `fireCore` с суффиксом `tag`.
 */
function flame(p: Painter, F: Fire, x: number, y: number, r: number, len: number, sway: number, lean = 0, tag = ''): void {
  const tip: [number, number] = [x + lean + sway, y - len];
  const mid: [number, number] = [x + lean * 0.45 - sway * 0.5, y - len * 0.5];
  p.chain([[x, y, r], [mid[0], mid[1], r * 0.62], [tip[0], tip[1], 0.6]], F.outer, { part: `fire${tag}` });
  p.chain([[x, y + r * 0.15, r * 0.66], [mid[0] + 0.3, mid[1] + len * 0.08, r * 0.38], [tip[0] - sway * 0.3, tip[1] + len * 0.28, 0.5]], F.mid, { part: `fireMid${tag}`, noLine: true });
  if (r > 2.2) p.chain([[x, y + r * 0.25, r * 0.36], [mid[0] + 0.3, mid[1] + len * 0.2, r * 0.18]], F.core, { part: `fireCore${tag}`, noLine: true });
}

/** Кость конечности: капсула с шишками суставов на обоих концах. */
function bone(p: Painter, x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, mat: Mat, o: Shape): void {
  p.limb(x1, y1, r1, x2, y2, r2, mat, o);
  p.ellipse(x1, y1, r1 * 1.35, r1 * 1.2, mat, o);
  p.ellipse(x2, y2, r2 * 1.35, r2 * 1.2, mat, o);
}

/** Провалы черепа — глазницы, нос, пасть: почти чёрные, из них светят глаза. */
const PIT: Mat = { base: '#1a1418', dither: 0 };

/**
 * Череп вполоборота к герою в своих координатах: центр свода в (0, 0), свод радиусом около 8.5.
 * Человеческий, а не звериный: свод высокий и круглый, лоб отвесный, лицо сидит под лбом и не выступает вперёд,
 * подбородок — под глазницами; череп выше, чем длиннее. Первый вариант с мордой вперёд и скошенным лбом читался
 * головой ящерицы.
 * Глазницы — крупные чёрные провалы, в них горят точки `eye` (пустая строка — погасли). `open` — насколько отвисла челюсть.
 * Части — `part` (свод и лицо одним куполом) и `${part}Jaw`.
 */
function skull(p: Painter, mat: Mat, part: string, open: number, eye: string, glow = 0.45): void {
  // Нижняя челюсть: короткая, подбородок под глазницами, угол челюсти под скулой; отвисает вокруг уха.
  p.pose({ rot: 0.06 * open, px: 4, py: 5 }, () => {
    p.poly([-8, 8.5 + open, -3, 9 + open, 2, 8, 4, 4.5, 5.5, 5.5, 4.5, 10 + open * 0.6, -1, 12 + open, -6, 12.5 + open, -8.5, 11 + open], mat, { part: `${part}Jaw`, bevel: 1.5, tone: -0.08 });
  });
  // Свод — высокий и круглый, лоб отвесный.
  p.ellipse(1, -2.5, 8.6, 8.2, mat, { part });
  // Лицо под лбом: передний край не дальше лба, иначе выходит морда.
  p.ellipse(-2.8, 3, 5.6, 5.4, mat, { part, lift: 1, tone: 0.1 });
  // Верхняя челюсть с зубами — узкая полоса под носом.
  p.ellipse(-3.5, 7.4, 4.4, 2.3, mat, { part, tone: 0.04 });
  // Скула — светлая грань под ближней глазницей, уходит назад к уху.
  p.ellipse(2, 3.5, 3.2, 2, mat, { part, lift: 1.2 });
  // Глазницы — главное в черепе: крупные, ближняя в середине лица, дальняя у самого края, сжата поворотом;
  // верхний край скошен к переносице — взгляд исподлобья.
  p.poly([-4, 1, 0, -1.2, 3.2, -0.2, 3.4, 3, 0.8, 5, -3.4, 4.4], PIT, { part, paint: true });
  p.poly([-9.5, 0.2, -6.4, 1.2, -6, 4.6, -9, 4.4], PIT, { part, paint: true });
  // Надбровье — светлая грань над глазницами.
  p.line(-4, 0, 0, -2.2, '#e0d2b0');
  // Нос — провал между глазницами и зубами.
  p.poly([-6.2, 5, -4, 5, -5, 7.8], PIT, { part, paint: true });
  // Пасть: щель между зубами; раскрытая — тёмный провал с редкими зубами сверху.
  if (open > 1.2) {
    p.poly([-8, 9, -1, 9, 2, 8.5, 1.5, 9 + open, -3, 10 + open, -7.5, 10 + open * 0.8], PIT, { part: 'maw', bevel: 0.6 });
    p.px(-6.5, 9.5, '#d8ccb0');
    p.px(-3.5, 9.5, '#d8ccb0');
  } else {
    p.line(-8, 9.5, 1, 9, '#2a2024');
  }
  if (eye) {
    p.glow(0, 2, 4, eye, glow);
    p.px(0, 2, eye);
    p.px(-7.8, 2.6, eye);
  }
}

// ─── Скелет-воин ────────────────────────────────────────────────────────────

/**
 * Рамп кости вручную: построенный из слоновой кости уходит в тенях в оливу (тёмный жёлтый),
 * а кость в тени — серо-бурая. Череп на ступень светлее: он главное пятно скелета.
 */
const BONE_RAMP = ['#3e322c', '#6c5c4a', '#988466', '#bfab88', '#ddd0b0'];
const SKULL_RAMP = ['#4a3c34', '#80705a', '#b09c7a', '#d6c4a0', '#f0e4c6'];

const SKEL = {
  bone: { base: '#c8b590', ramp: BONE_RAMP, tex: { kind: 'noise', scale: 2, amp: 0.12 } } as Mat,
  skull: { base: '#d0bf9c', ramp: SKULL_RAMP, tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  boneDark: { base: '#9a8a6c', tex: { kind: 'noise', scale: 2, amp: 0.14 } } as Mat,
  hollow: { base: '#241c20', dither: 0 } as Mat,
  iron: { base: '#6a6460', shine: 0.5, tex: { kind: 'spots', scale: 2.2, amp: 0.3, density: 0.35 } } as Mat,
  rust: { base: '#7a4424', tex: { kind: 'noise', scale: 1.5, amp: 0.2 } } as Mat,
  steel: { base: '#a8acb0', shine: 0.9, dither: 0, tex: { kind: 'spots', scale: 3, amp: 0.2, density: 0.2 } } as Mat,
  wood: { base: '#5e4028', tex: { kind: 'stripes', scale: 2.4, amp: 0.16, angle: 0 } } as Mat,
  leather: { base: '#3e2a20' } as Mat,
  rag: { base: '#3e3432', shag: 0.22, tex: { kind: 'stripes', scale: 2, amp: 0.12, angle: 1.5 } } as Mat,
};
/** Холодный огонёк в глазницах нежити. */
const UNDEAD_EYE = '#9ff0ff';

/**
 * Рубка мечом ближней (правой) рукой: направления плеча, предплечья и клинка по ходу клипа, градусы.
 * В покое меч выставлен остриём к герою над коленом; замах — клинок за головой; удар — через плечо наискось к герою.
 */
const SW_UPPER: Keys = [[0, 108], [0.14, 238], [0.3, 250], [0.43, 212], [0.57, 172], [0.72, 150], [0.86, 118], [1, 100]];
const SW_FORE: Keys = [[0, 165], [0.14, 282], [0.3, 294], [0.43, 238], [0.57, 172], [0.72, 150], [0.86, 150], [1, 155]];
const SW_BLADE: Keys = [[0, 150], [0.14, 330], [0.3, 344], [0.43, 252], [0.57, 172], [0.72, 138], [0.86, 135], [1, 140]];

const skeletonWarriorBase: Model = {
  id: 'skeleton_warrior',
  w: 80,
  h: 104,
  ground: 102,
  // Меч в кадре контакта выброшен к герою, в замахе — за головой.
  pad: 34,
  draw(p: Painter) {
    const M = SKEL;
    const G = 102;
    // Меч: замах — клинок за головой, щит прикрывает грудь; удар — рубит наискось к герою, корпус подаётся следом.
    // Урон: отбросило, череп запрокинут, челюсть отвисла, огоньки в глазницах погасли, щит вскинут.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    // Не дышит — покачивается, как марионетка на нитях; раз за цикл клацает челюстью.
    const sway = p.bob(1.2, 1);
    const clack = p.clip === 'idle' ? p.blink(0.45, 0.08) : 0;
    const flick = (p.wave(3, 0.2) + 1) / 2;

    p.pose({ dx: -7 * strike + 2 * wind + 5 * hurt, rot: 0.04 * wind - 0.05 * strike + 0.06 * hurt, px: 44, py: G }, () => {
      p.shadow(42, 24, 3);
      // Боевая стойка: дальняя нога выставлена к герою, ближняя отставлена назад, колени согнуты.
      const leg = (hip: [number, number], knee: [number, number], ankle: [number, number], toe: number, part: string, tone: number): void => {
        bone(p, hip[0], hip[1], 2.6, knee[0], knee[1], 2.2, M.bone, { part, tone });
        bone(p, knee[0], knee[1], 2.2, ankle[0], ankle[1], 1.8, M.bone, { part, tone });
        p.poly([ankle[0] + 2, ankle[1] - 1, ankle[0] + 3, G, toe, G, toe + 1, G - 2.5, ankle[0] - 2, ankle[1] - 1], M.bone, { part: `${part}Foot`, tone: tone - 0.05, bevel: 1 });
      };
      leg([40, 66], [30, 81], [29, 97], 20, 'far', -0.16);
      leg([50, 66], [57, 82], [61, 97], 53, 'near', 0);

      // Верх наклонён к герою вокруг таза.
      p.pose({ dy: 2 + sway * 0.5, rot: -0.08, px: 45, py: 66 }, () => {
        // Таз и истлевшая набедренная повязка.
        p.poly([36, 60, 54, 60, 56, 66, 50, 70, 45, 67, 40, 70, 35, 66], M.bone, { part: 'pelvis', bevel: 2 });
        p.poly([38, 63, 52, 63, 54, 76, 49, 79, 45, 74, 41, 80, 36, 76], M.rag, { part: 'rag', bevel: 2, tone: -0.05 });

        // Дальняя рука держит щит перед грудью: плечо за рёбрами, кисть у умбона.
        const shieldUp = 4 * hurt + 3 * wind;
        bone(p, 34, 36, 2.2, 25, 46 - shieldUp, 1.9, M.bone, { part: 'farArm', tone: -0.16 });
        bone(p, 25, 46 - shieldUp, 1.9, 20, 50 - shieldUp, 1.7, M.bone, { part: 'farArm', tone: -0.16 });

        // Позвоночник и грудная клетка: тёмное нутро за рёбрами.
        for (let k = 0; k < 4; k++) p.ellipse(45, 56 + k * 2.4, 2.4, 1.6, M.bone, { part: 'spine', tone: -0.05 });
        p.ellipse(43, 45, 10.5, 11, M.hollow, { part: 'chest' });
        for (let k = 0; k < 5; k++) {
          const y = 38 + k * 3.8;
          const w = 1 - Math.abs(k - 1.5) * 0.12;
          p.chain([[51, y - 1, 1.3], [46, y - 2.5 * w, 1.4], [39, y - 0.5, 1.3], [34 + k * 0.6, y + 2, 1.1]], M.bone, { part: 'ribs', tone: -0.02 * k });
        }
        p.limb(37, 37, 1.6, 38, 51, 1.3, M.bone, { part: 'sternum' });
        // Ключицы.
        p.limb(35, 35.5, 1.5, 53, 35, 1.7, M.bone, { part: 'collar' });

        // Круглый щит: доски, железный обод и умбон; трещина от старого удара.
        p.pose({ dx: -2 * wind + 1 * strike, dy: -shieldUp, rot: 0.04 * wind - 0.1 * hurt, px: 20, py: 52 }, () => {
          p.ellipse(20, 52, 10.5, 13.5, M.wood, { part: 'shield', flat: 0.55 });
          p.ellipse(20, 52, 10.5, 13.5, M.iron, { part: 'shield', paint: true });
          p.ellipse(20.5, 52, 8.6, 11.6, M.wood, { part: 'shield', paint: true });
          p.ellipse(19.5, 51.5, 3.4, 3.8, M.iron, { part: 'boss', lift: 1 });
          p.line(14, 42, 17, 47, '#2a1c14');
          p.line(17, 47, 15, 50, '#2a1c14');
          for (const [x, y] of [[13, 45], [27, 46], [13, 59], [27, 59]]) p.px(x, y, '#8a8480');
        });

        // Голый череп на шейных позвонках — крупнее анатомии, чтобы в масштабе боя читался сразу; от удара запрокидывается.
        p.limb(42, 36, 2.2, 40, 29, 2, M.bone, { part: 'neck' });
        const open = 2.5 * clack + 2 * wind + 3 * strike + 4 * hurt;
        p.pose({ dx: p.snap(-1.5 * strike + 2 * hurt), dy: p.snap(sway - 1.5 * hurt), rot: -0.06 + 0.04 * wind - 0.05 * strike + 0.28 * hurt, px: 40, py: 30 }, () => {
          p.scope(1.38, 35, 13, () => {
            const eye = hurt > 0.4 ? '' : wind > 0.4 || strike > 0.4 ? '#e8ffff' : UNDEAD_EYE;
            skull(p, M.skull, 'head', open, eye, 0.3 + 0.2 * flick + 0.25 * wind);
            // Трещина по своду — след старого удара.
            p.line(3, -9, 5, -5, '#5a4a3e');
            p.line(5, -5, 4, -2, '#5a4a3e');
          });
        });

        // Ближняя рука с мечом — справа, поверх туловища.
        const a1 = ang(p, SW_UPPER, 100) - 20 * hurt;
        const a2 = ang(p, SW_FORE, 155) - 25 * hurt;
        const a3 = ang(p, SW_BLADE, 140) + 30 * hurt + 2 * p.wave(1, 0.6);
        const { ex, ey, hx, hy } = limb2(52, 37, a1, 13, a2, 12);
        // Прямой меч в зазубринах: клинок от гарды, рукоять с навершием за кулаком.
        const [tx, ty] = at(hx, hy, a3, 30);
        const n: [number, number] = [-Math.sin(a3 * DEG), Math.cos(a3 * DEG)];
        const [bx, by] = at(hx, hy, a3, 3.5);
        p.poly([bx + n[0] * 2.3, by + n[1] * 2.3, ...at(tx + n[0] * 1.6, ty + n[1] * 1.6, a3, -6), tx, ty, ...at(tx - n[0] * 1.6, ty - n[1] * 1.6, a3, -6), bx - n[0] * 2.3, by - n[1] * 2.3], M.steel, { part: 'blade', bevel: 1 });
        p.px(...at(hx + n[0], hy + n[1], a3, 14), '#3a302a');
        p.px(...at(hx + n[0], hy + n[1], a3, 22), '#3a302a');
        p.limb(bx - n[0] * 4, by - n[1] * 4, 1.1, bx + n[0] * 4, by + n[1] * 4, 1.1, M.iron, { part: 'guard' });
        p.limb(hx, hy, 1.2, ...at(hx, hy, a3, -5), 1.1, M.leather, { part: 'grip' });
        p.ellipse(...at(hx, hy, a3, -5.5), 1.6, 1.6, M.iron, { part: 'pommel' });
        // Блик по клинку в начале цикла, но не в первом кадре: им же кончаются клипы.
        const g = p.clip === 'idle' && p.t > 0.05 && p.t < 0.3 ? (p.t - 0.05) / 0.25 : -1;
        if (g >= 0) p.px(...at(hx, hy, a3, 6 + 20 * g), '#ffffff');
        bone(p, 52, 37, 2.3, ex, ey, 1.9, M.bone, { part: 'nearArm' });
        bone(p, ex, ey, 1.9, hx, hy, 1.6, M.bone, { part: 'nearArm' });
        p.ellipse(hx, hy, 2.4, 2.2, M.bone, { part: 'fist' });
        // Ржавый наплечник на ближнем плече — всё, что осталось от доспеха.
        p.poly([46, 36, 48, 31.5, 54, 30, 59, 32.5, 60, 37, 55, 39.5, 49, 39.5], M.iron, { part: 'pauldron', bevel: 2 });
        p.poly([50, 31, 56, 30.5, 59, 34, 54, 34.5], M.rust, { part: 'pauldron', paint: true });
        p.line(47, 38.5, 59, 36.5, '#2a2220');
      });
    });
  },
};

// ─── Скелет-лучник ──────────────────────────────────────────────────────────

const SARCH = {
  ...SKEL,
  wood: { base: '#7a5634', tex: { kind: 'stripes', scale: 1.4, amp: 0.15 } } as Mat,
  quiver: { base: '#4a3222', tex: { kind: 'stripes', scale: 2, amp: 0.12 } } as Mat,
  fletch: { base: '#6a6a70', dither: 0 } as Mat,
};

/** Натяг: в покое лук опущен остриём стрелы к полу, в замахе поднят в прицел и держится до спуска, потом опускается. */
const AIM: Keys = [[0, 0.35], [0.14, 1], [0.72, 1], [0.86, 0.45], [1, 0]];

const skeletonArcherBase: Model = {
  id: 'skeleton_archer',
  w: 84,
  h: 104,
  ground: 102,
  // Стрела в полёте в кадре контакта — на 30 единиц левее рамки.
  pad: 36,
  draw(p: Painter) {
    const M = SARCH;
    const G = 102;
    // Выстрел: замах — лук вскинут в прицел, тетива у челюсти; выпад — спуск, стрела уходит к герою, кисть отлетает.
    // Урон: отбросило, череп назад, капюшон слетает с темени, лук повис.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const sway = p.bob(1.2, 1, 0.3);
    const flick = (p.wave(3, 0.5) + 1) / 2;
    const aim = p.clip === 'attack' ? keys(AIM, p.u) : 0;
    const hem = p.wave(1, 0.2);

    p.pose({ dx: 3 * strike + 5 * hurt, rot: 0.02 * wind + 0.06 * hurt, px: 42, py: G }, () => {
      p.shadow(42, 22, 3);
      const leg = (hip: [number, number], knee: [number, number], ankle: [number, number], toe: number, part: string, tone: number): void => {
        bone(p, hip[0], hip[1], 2.5, knee[0], knee[1], 2.1, M.bone, { part, tone });
        bone(p, knee[0], knee[1], 2.1, ankle[0], ankle[1], 1.8, M.bone, { part, tone });
        p.poly([ankle[0] + 2, ankle[1] - 1, ankle[0] + 3, G, toe, G, toe + 1, G - 2.5, ankle[0] - 2, ankle[1] - 1], M.bone, { part: `${part}Foot`, tone: tone - 0.05, bevel: 1 });
      };
      leg([41, 66], [34, 82], [33, 97], 24, 'far', -0.16);
      leg([50, 66], [55, 82], [58, 97], 50, 'near', 0);

      p.pose({ dy: sway * 0.5, rot: -0.04 - 0.03 * aim, px: 46, py: 66 }, () => {
        // Колчан за спиной: оперение торчит над ближним плечом.
        p.pose({ rot: 0.06 * hurt, px: 56, py: 44 }, () => {
          p.poly([52, 26, 61, 28, 60, 62, 52, 60], M.quiver, { part: 'quiver', bevel: 2, tone: -0.08 });
          for (let k = 0; k < 3; k++) {
            const x = 54 + k * 2.4, y = 22 - k * 1.2;
            p.limb(x, y + 6, 0.7, x + 1.2, y - 3, 0.7, M.wood, { part: 'arrows' });
            p.poly([x - 0.5, y - 1, x + 3, y - 7, x + 2.6, y], M.fletch, { part: 'arrows', bevel: 0.8 });
          }
        });
        p.poly([37, 60, 55, 60, 57, 66, 51, 70, 46, 67, 41, 70, 36, 66], M.bone, { part: 'pelvis', bevel: 2 });
        p.poly([39, 63, 53, 63, 55 + hem * 0.5, 77, 50, 80, 46, 75, 42, 81, 37 + hem * 0.3, 77], M.rag, { part: 'rag', bevel: 2, tone: -0.05 });
        // Плечо тянущей руки — за рёбрами.
        p.ellipse(49, 37, 2.6, 2.4, M.bone, { part: 'farArm', tone: -0.14 });

        for (let k = 0; k < 4; k++) p.ellipse(46, 56 + k * 2.4, 2.3, 1.6, M.bone, { part: 'spine', tone: -0.05 });
        p.ellipse(44, 45, 10, 10.5, M.hollow, { part: 'chest' });
        for (let k = 0; k < 5; k++) {
          const y = 38 + k * 3.7;
          const w = 1 - Math.abs(k - 1.5) * 0.12;
          p.chain([[52, y - 1, 1.3], [47, y - 2.5 * w, 1.4], [40, y - 0.5, 1.3], [35 + k * 0.6, y + 2, 1.1]], M.bone, { part: 'ribs', tone: -0.02 * k });
        }
        p.limb(38, 37, 1.6, 39, 51, 1.3, M.bone, { part: 'sternum' });
        // Ремень колчана наискось через рёбра.
        p.limb(36, 50, 1.4, 54, 33, 1.4, M.leather, { part: 'strap' });

        // Голый череп, как у воина: крупный, глаза горят из глазниц; в прицеле череп клонится к стреле.
        p.limb(43, 35, 2.2, 41, 29, 2, M.bone, { part: 'neck' });
        const open = 1.5 * strike + 4 * hurt;
        p.pose({ dx: p.snap(-aim + 2 * hurt), dy: p.snap(sway - hurt), rot: -0.04 - 0.05 * aim + 0.26 * hurt, px: 41, py: 30 }, () => {
          p.scope(1.38, 36, 14, () => {
            const eye = hurt > 0.4 ? '' : wind > 0.4 ? '#e8ffff' : UNDEAD_EYE;
            skull(p, M.skull, 'head', open, eye, 0.3 + 0.2 * flick);
            // Скол на затылке.
            p.poly([6, -8, 9.5, -5, 8, -3], M.hollow, { part: 'head', paint: true });
          });
        });

        // Лук в опущенной руке; в прицеле — поднят и повёрнут стрелой к герою. Всё в системе лука: кисть на рукояти.
        const th = (-0.45 + 0.45 * aim) + 0.3 * hurt;
        const gx = 23 - 7 * aim, gy = 63 - 14 * aim + 2 * hurt;
        const c = Math.cos(th), sn = Math.sin(th);
        const B = (x: number, y: number): [number, number] => [gx + x * c - y * sn, gy + x * sn + y * c];
        const drawX = 9 + 17 * wind + 7 * strike;
        const loaded = strike < 0.3;
        p.chain([[...B(9, -24), 1], [...B(3, -15), 1.5], [...B(0, 0), 1.9], [...B(3, 15), 1.5], [...B(9, 24), 1]], M.wood, { part: 'bow' });
        p.limb(...B(0, -3), 2, ...B(0, 3), 2, M.leather, { part: 'bow', paint: true });
        const [hx, hy] = B(drawX, 0);
        if (loaded) {
          p.line(...B(9.5, -24), hx, hy, '#9a9288');
          p.line(hx, hy, ...B(9.5, 24), '#9a9288');
          p.line(hx, hy, ...B(drawX - 26, 0), '#6a4a2e');
          const [ax, ay] = B(drawX - 31, 0);
          p.poly([ax, ay, ...B(drawX - 25.5, -2.2), ...B(drawX - 25.5, 2.2)], M.steel, { part: 'arrow', bevel: 1 });
        } else p.line(...B(9.5, -24), ...B(9.5, 24), '#9a9288');
        // Стрела в полёте: в кадрах спуска уходит к герою.
        if (p.clip === 'attack' && p.u > 0.4 && p.u < 0.6) {
          const tip = p.u < 0.5 ? -10 : -32;
          const ay = gy;
          p.line(gx + tip + 5, ay, gx + tip + 20, ay, '#6a4a2e');
          p.poly([gx + tip, ay, gx + tip + 5.5, ay - 2.2, gx + tip + 5.5, ay + 2.2], M.steel, { part: 'flyArrow', bevel: 1 });
          p.line(gx + tip + 22, ay, gx + tip + 32, ay, '#e8e0c8a0');
        }
        // Тянущая рука: от плеча за рёбрами к тетиве.
        const { ex, ey } = limb2(49, 37, 110 + 40 * aim, 11, 0, 0);
        bone(p, 49, 37, 2, ex, ey, 1.8, M.bone, { part: 'drawArm', tone: -0.05 });
        bone(p, ex, ey, 1.8, hx + 1, hy, 1.5, M.bone, { part: 'drawArm', tone: -0.05 });
        p.ellipse(hx, hy, 2.2, 2, M.bone, { part: 'drawArm' });
        // Рука с луком — к герою, поверх туловища.
        const { ex: fx, ey: fy } = limb2(36, 37, 125 - 20 * aim, 12, 0, 0);
        bone(p, 36, 37, 2.2, fx, fy, 1.9, M.bone, { part: 'bowArm' });
        bone(p, fx, fy, 1.9, gx + 1, gy, 1.6, M.bone, { part: 'bowArm' });
        p.ellipse(gx, gy, 2.4, 2.4, M.bone, { part: 'bowArm' });
      });
    });
  },
};

// ─── Костяной голем ─────────────────────────────────────────────────────────

const BGOLEM = {
  bone: { base: '#a8977c', ramp: ['#342c2a', '#5e5246', '#85745e', '#a8967a', '#c8b89c'], tex: { kind: 'noise', scale: 2.5, amp: 0.1 } } as Mat,
  /** Длинные кости связок: волокна вдоль кости, а не рябь камня. */
  boneLong: { base: '#a8977c', ramp: ['#342c2a', '#5e5246', '#85745e', '#a8967a', '#c8b89c'], tex: { kind: 'stripes', scale: 1.6, amp: 0.1, angle: 0 } } as Mat,
  skull: { base: '#c8b898', ramp: SKULL_RAMP, tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  hollow: { base: '#1c1618', dither: 0 } as Mat,
  horn: { base: '#5a4c40', tex: { kind: 'stripes', scale: 1.6, amp: 0.2, angle: 0.5 } } as Mat,
  iron: { base: '#3e3c42', shine: 0.6, tex: { kind: 'noise', scale: 1.5, amp: 0.15 } } as Mat,
  soul: { base: '#5cf0ff', glow: true, dither: 0, ramp: ['#1a8aa8', '#28a8c8', '#3cc8e0', '#6ae4f4', '#b8fbff'] } as Mat,
};
/** Голубой огонь души, связавший кости. */
const SOUL = '#5cf0ff';

/**
 * Удар кулаком сверху ближней (правой) рукой: из покоя (кулак у земли) рука уходит назад-вверх, через голову
 * обрушивается вперёд-вниз к герою и опускается в покой (угол 0 — покой, −2π — снова он).
 */
const BPOUND: Keys = [[0, -0.4], [0.14, -2.0], [0.3, -2.35], [0.43, -3.9], [0.57, -5.3], [0.72, -5.3], [0.86, -5.8], [1, -2 * Math.PI]];

export const boneGolem: Model = {
  id: 'bone_golem',
  w: 150,
  h: 160,
  ground: 158,
  // Кулак в замахе поднимается над горбом на длину руки.
  pad: 66,
  draw(p: Painter) {
    const M = BGOLEM;
    const G = 158;
    // Кулак: замах — рука из-за спины через голову, выпад — кулак обрушивается на героя, летят обломки костей.
    // Урон: кости разошлись и звякнули, череп запрокинут, огонь души мигнул.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.5, 1);
    // Огонь души в рёбрах разгорается и гаснет, как дыхание; по швам между костями бегут голубые искры.
    const pulse = (p.wave(2, 0.3) + 1) / 2;
    const rattle = hurt > 0.2 ? p.snap(1.5 * hurt) : 0;
    /** Связка костей: несколько капсул рядом, тёмные щели между ними. */
    const bundle = (x1: number, y1: number, x2: number, y2: number, r: number, n: number, part: string, tone = 0): void => {
      const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      // Тёмные жилы под костями: щели между костями не прозрачные, а в тени.
      p.limb(x1, y1, r * 0.95, x2, y2, r * 0.85, M.hollow, { part: `${part}Core`, tone });
      for (let k = 0; k < n; k++) {
        const o = (k - (n - 1) / 2) * r * 1.02;
        // Каждая кость — своя часть: между ними движок проводит тёмную щель, связка читается костями, а не глыбой.
        const ax = x1 + nx * o, ay = y1 + ny * o, bx = x2 + nx * o * 0.8, by = y2 + ny * o * 0.8;
        p.limb(ax, ay, r * 0.5, bx, by, r * 0.44, M.boneLong, { part: `${part}${k}`, tone: tone - 0.04 * k });
        p.ellipse(ax, ay, r * 0.62, r * 0.55, M.boneLong, { part: `${part}${k}`, tone: tone - 0.04 * k });
      }
      // Железная скоба посередине.
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      p.limb(mx - nx * r * 1.3, my - ny * r * 1.3, 1.6, mx + nx * r * 1.3, my + ny * r * 1.3, 1.6, M.iron, { part: `${part}Band`, tone });
    };

    p.pose({ dx: -5 * strike + 2 * wind + 4 * hurt, rot: 0.03 * wind - 0.05 * strike + 0.04 * hurt, px: 80, py: G }, () => {
      p.shadow(80, 54, 4.5);
      // Ноги — связки берцовых костей, стопы — плиты из лопаток; дальняя выставлена к герою.
      bundle(66, 110, 52, 132, 9, 3, 'far', -0.14);
      bundle(52, 132, 50, 150, 8, 3, 'far', -0.16);
      p.poly([36, 150, 60, 148, 64, G, 32, G], M.bone, { part: 'farFoot', tone: -0.16, bevel: 2 });
      bundle(96, 110, 106, 132, 9.5, 3, 'near', 0);
      bundle(106, 132, 110, 150, 8.5, 3, 'near', -0.02);
      p.poly([98, 150, 122, 148, 126, G, 94, G], M.bone, { part: 'nearFoot', bevel: 2 });
      p.ellipse(106, 132, 6, 5.5, M.bone, { part: 'nearKnee', lift: 1 });
      p.glow(106, 132, 5, SOUL, 0.25 + 0.2 * pulse);

      p.pose({ dy: 3 + rattle, rot: -0.08, px: 82, py: 106 }, () => {
        // Дальняя рука — слева, за телом: свисает, пальцы-рёбра скребут пол.
        bundle(56, 56 + up, 40, 84 + up, 9, 2, 'farArm', -0.14);
        bundle(40, 84 + up, 32, 108 + up, 8, 2, 'farArm', -0.16);
        for (let k = 0; k < 4; k++) p.chain([[32 + k * 2, 108 + up, 1.8], [24 + k * 3, 118 + up + k, 1.4], [22 + k * 3.5, 126 + up + k * 0.5, 0.9]], M.bone, { part: 'farClaw', tone: -0.18 });

        // Таз — широкая плита.
        p.poly([60, 96, 104, 96, 110, 108, 96, 116, 82, 110, 68, 116, 56, 108], M.bone, { part: 'pelvis', bevel: 3 });
        // Хребет-столб от таза к горбу.
        for (let k = 0; k < 6; k++) p.ellipse(92 - k * 0.5, 94 - k * 6, 5, 3.4, M.bone, { part: 'spine', tone: -0.08 });
        // Горб — лопатки и спина; из позвонков торчат костяные шипы — самая высокая часть силуэта.
        p.ellipse(96, 44 + up, 28, 18, M.bone, { part: 'back', tone: -0.12 });
        p.ellipse(84, 40 + up, 16, 12, M.bone, { part: 'back', tone: -0.14 });
        const spike = (x: number, y: number, tx: number, ty: number, w: number): void => {
          p.poly([x - w, y + up, tx, ty + up, x + w, y + up], M.bone, { part: 'spikes', bevel: 1.5, tone: 0.04 });
          p.line(x - w * 0.3, y + up - 1, tx - 0.5, ty + up + 2, '#6a5c4e');
        };
        spike(80, 32, 74, 10, 4.5);
        spike(94, 28, 96, 4, 5);
        spike(108, 30, 116, 8, 4.5);
        spike(118, 38, 132, 24, 4);
        // Горб сложен из черепов: пустые глазницы смотрят во все стороны, в двух ещё тлеет огонь.
        for (const [x, y, sc, lit] of [[88, 36, 0.7, 0], [104, 34, 0.75, 1], [116, 46, 0.65, 0], [96, 50, 0.7, 0], [82, 50, 0.6, 1]] as const) {
          p.scope(sc, x, y + up, () => skull(p, M.skull, `hump${x}`, 0, lit && hurt < 0.4 ? SOUL : '', 0.15));
        }

        // Грудная клетка — огромные рёбра вокруг тёмного нутра, внутри горит огонь души.
        p.ellipse(76, 72 + up, 25, 23, M.hollow, { part: 'chest' });
        // Огонь души — язык голубого пламени в клетке рёбер.
        const fl = p.wave(4, 0.2);
        const big = 1 + 0.25 * pulse + 0.4 * wind - 0.5 * hurt;
        p.chain([[76, 84 + up, 7 * big], [75 + fl, 74 + up, 5.5 * big], [77 - fl, 64 + up - 4 * big, 2.2]], M.soul, { part: 'soul' });
        p.chain([[76, 84 + up, 3.6 * big], [76 + fl * 0.5, 76 + up, 2.6 * big]], M.soul, { part: 'soulCore', tone: 0.3, noLine: true });
        for (let k = 0; k < 6; k++) {
          const y = 54 + k * 7 + up * (1 - k / 8);
          const w = 1 - Math.abs(k - 2) * 0.1;
          p.chain([[98, y - 2, 2], [88, y - 6 * w, 2.2], [72, y - 4 * w, 2], [58, y + 1, 1.8], [54 + k, y + 6, 1.4]], M.bone, { part: `rib${k}`, tone: -0.03 * k });
        }
        p.limb(60, 52 + up, 3, 62, 92, 2.4, M.bone, { part: 'sternum', tone: 0.04 });
        // Цепи, что держат рёбра вместе.
        p.chain([[56, 60 + up, 1.1], [70, 66 + up, 1.1], [86, 64 + up, 1.1], [98, 58 + up, 1.1]], M.iron, { part: 'chain' });

        // Голова — огромный рогатый череп, посаженный низко между плеч и выдвинутый к герою.
        const open = 1 + 3 * wind + 4 * strike + 5 * hurt;
        p.pose({ dx: p.snap(-3 * strike + 2 * hurt), dy: up + p.snap(-2 * wind - 2 * hurt), rot: 0.05 * wind - 0.04 * strike + 0.18 * hurt, px: 60, py: 50 }, () => {
          // Рога — дальний темнее, оба закручены назад и вниз, как у барана.
          p.chain([[54, 30, 4.5], [58, 20, 4], [68, 16, 3.4], [74, 22, 2.6], [72, 30, 1.8], [66, 32, 1]], M.horn, { part: 'hornFar', tone: -0.14 });
          p.scope(1.55, 48, 40, () => {
            const eye = hurt > 0.4 ? '' : wind > 0.4 || strike > 0.4 ? '#e8ffff' : SOUL;
            skull(p, M.skull, 'head', open * 0.6, eye, 0.35 + 0.25 * pulse + 0.2 * wind);
            p.line(4, -9, 7, -4, '#5a4a3e');
          });
          p.chain([[44, 30, 5], [36, 20, 4.4], [24, 18, 3.6], [18, 26, 2.8], [22, 34, 2], [28, 34, 1.2]], M.horn, { part: 'horn' });
        });

        // Ближнее плечо — справа, поверх туловища: в нём застрял чей-то череп.
        p.ellipse(108, 52 + up, 15, 13, M.bone, { part: 'shoulder' });
        p.scope(0.85, 106, 50 + up, () => skull(p, M.skull, 'shoulderSkull', 0, hurt > 0.4 ? '' : SOUL, 0.2));
        // Ближняя рука одной связкой костей — справа: кулак у земли, в ударе дугой через голову на героя.
        const phi = BPOUND.length && p.clip === 'attack' ? keys(BPOUND, p.u) : 0;
        p.pose({ rot: phi - 0.15 * hurt, px: 110, py: 56 + up }, () => {
          bundle(110, 56 + up, 116, 88 + up, 12, 3, 'arm');
          bundle(116, 88 + up, 118, 110 + up, 11, 3, 'arm');
          p.ellipse(116, 88 + up, 7, 6.5, M.bone, { part: 'elbow', lift: 1 });
          p.glow(116, 88 + up, 6, SOUL, 0.25 + 0.2 * pulse);
          // Кулак — сросшиеся кости с шипами на костяшках.
          p.ellipse(118, 124 + up, 14, 12, M.bone, { part: 'fist' });
          p.ellipse(108, 128 + up, 8, 7, M.bone, { part: 'fist', lift: 1 });
          for (const [x, y] of [[104, 116], [106, 124], [106, 132], [112, 136]]) p.ellipse(x, y + up, 4, 3.4, M.bone, { part: 'knuckle' });
          for (const [x, y, tx, ty] of [[102, 114, 94, 110], [100, 124, 91, 124], [102, 134, 94, 140]]) p.poly([x, y - 2.5 + up, tx, ty + up, x, y + 2.5 + up], M.bone, { part: 'fistSpike', bevel: 1 });
          p.line(114, 116 + up, 126, 122 + up, '#4a3e36');
          p.line(116, 128 + up, 128, 130 + up, '#4a3e36');
        });
        // Обломки костей и голубые искры от удара кулака.
        if (strike > 0.6) {
          const c = Math.cos(phi), sn = Math.sin(phi);
          const cx = 110 + 8 * c - 68 * sn, cy = 56 + up + 8 * sn + 68 * c;
          for (const [ox, oy] of [[-18, -8], [-10, -18], [-22, 4], [-4, -22]]) p.block(cx + ox * strike, cy + oy * strike, 2, 1, '#c8b898');
          p.glow(cx - 6, cy - 4, 10 * strike, SOUL, 0.3);
        }
        // Кости звякнули от удара: мелкие осколки.
        if (hurt > 0.2) for (const [ox, oy] of [[-6, -22], [8, -28], [22, -18]]) p.block(76 + ox * (1.6 - hurt), 50 + oy * hurt, 2, 1, '#c8b898');
      });
    });
  },
};

// ─── Призрак ────────────────────────────────────────────────────────────────

const GHOST = {
  /** Плоть призрака — бледная, светится изнутри: тени не темнее сумерек. */
  flesh: { base: '#c0d0f2', ramp: ['#6272a8', '#8a9cd0', '#b0c2ea', '#d2e0fa', '#eef4ff'], tex: { kind: 'noise', scale: 2, amp: 0.06 } } as Mat,
  shroud: { base: '#5e6ea4', shag: 0.3, ramp: ['#242c56', '#364274', '#505e94', '#6e80b6', '#90a2d4'], tex: { kind: 'stripes', scale: 2.4, amp: 0.1, angle: 1.2 } } as Mat,
  hair: { base: '#8698c8', shag: 0.3, ramp: ['#323c6a', '#4e5c8e', '#6e7eb2', '#90a2d2', '#b6c6ec'], tex: { kind: 'stripes', scale: 1.6, amp: 0.16, angle: 0.35 } } as Mat,
  pit: { base: '#0e1026', dither: 0 } as Mat,
};
const GHOST_MIST = '#a8c0ff';

const ghostBase: Model = {
  id: 'ghost',
  w: 88,
  h: 104,
  ground: 102,
  // Касание: призрак бросается к герою на 16 единиц, когти — ещё на 12 дальше.
  pad: 44,
  flies: true,
  draw(p: Painter) {
    const M = GHOST;
    // Касание: замах — отпрянуть, руки вскинуты, пасть раскрыта в вопле, волосы вздыбились; выпад — метнуться к герою,
    // руки вытянуты во всю длину. Урон: отбросило назад и вверх, голову запрокинуло, образ дрогнул и поблёк.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    // Парит: качается на два пикселя; волосы и хвост савана текут назад волной, как в воде.
    const hover = -p.bob(2.5, 1, 0.25) - 8;
    const flow = p.wave(1, 0.1), flow2 = p.wave(1, 0.35);
    const reach = mixPt([0, 0], [8, -12], [-12, -2], wind, strike);
    const pulse = (p.wave(2, 0.3) + 1) / 2;

    p.pose({ dx: -14 * strike + 4 * wind + 6 * hurt, dy: hover - 3 * wind - 4 * hurt, rot: -0.1 * strike + 0.05 * wind + 0.15 * hurt, px: 42, py: 60 }, () => {
      p.shadow(40, 14, 2, 0.1);
      // Ореол: призрак светится, вокруг силуэта — холодная дымка.
      if (hurt < 0.5) for (const [x, y, r] of [[36, 22, 17], [44, 46, 19], [58, 72, 16], [70, 86, 11]]) p.glow(x, y, r, GHOST_MIST, 0.1 + 0.06 * pulse);
      // Туман за хвостом — прозрачный, тает клочьями.
      const t1 = flow * 3, t2 = flow2 * 3;
      p.film([46, 70, 66 + t1 * 0.5, 74, 80 + t1, 84, 90 + t1 * 1.4, 94, 76 + t2, 94, 66 + t2, 98, 56, 90, 44, 94, 38, 84], `${GHOST_MIST}38`, true);
      // Саван ниже пояса сужается в изогнутый хвост, край рваный.
      p.poly([30, 50, 56, 48, 62, 62, 70 + t1 * 0.4, 74, 80 + t1 * 0.8, 84, 88 + t1, 90, 76 + t2 * 0.6, 88, 70, 92, 64, 84, 56, 88, 50, 78, 44, 84, 40, 72, 34, 76, 31, 62], M.shroud, { part: 'shroud', bevel: 5, tone: -0.06 });

      // Дальняя рука тянется к герою из-за тела: иссохшее предплечье, длинные пальцы-когти.
      // Дальняя рука поднята выше ближней — тянется к лицу героя; пальцы растопырены.
      const [fx, fy] = [12 + reach[0], 28 + reach[1] * 0.6 + 2 * hurt];
      p.chain([[36, 32, 2.6], [26, 31, 2], [fx + 3, fy + 1, 1.6]], M.flesh, { part: 'farArm', tone: -0.2 });
      p.ellipse(fx + 1, fy, 2.2, 1.8, M.flesh, { part: 'farHand', tone: -0.2 });
      for (let k = 0; k < 4; k++) {
        const a = 190 + (k - 1.5) * 22 + 10 * wind;
        const [cx, cy] = at(fx, fy, a, 5), [tx, ty] = at(fx, fy, a + 18, 9);
        p.chain([[fx, fy, 0.7], [cx, cy, 0.6], [tx, ty, 0.5]], M.flesh, { part: 'farFingers', tone: -0.22 });
      }

      // Тело — узкое, сквозь истлевший саван проступают рёбра; саван на плечах рваный.
      p.ellipse(42, 42, 9, 13, M.flesh);
      for (let k = 0; k < 4; k++) p.line(36, 34 + k * 3.4, 45, 33 + k * 3.4, '#6070a4');
      p.poly([30, 30, 40, 26, 54, 28, 58, 40, 56, 52, 50, 46, 46, 54, 43, 44, 37, 50, 32, 40], M.shroud, { part: 'shoulders', bevel: 3 });

      // Голова вытянута к герою: волосы одной текучей массой уходят назад, лицо — череп, обтянутый кожей,
      // чёрные провалы глаз и вытянутая рваная пасть в вопле.
      const open = 3 + 4 * wind + 6 * strike + 5 * hurt;
      const hw = 3 * hurt + 3 * wind;
      p.pose({ dx: p.snap(-2 * strike + 2 * hurt), dy: p.snap(2 * wind - 2 * hurt), rot: -0.1 + 0.12 * wind - 0.06 * strike + 0.3 * hurt, px: 38, py: 30 }, () => {
        const w1 = flow * 2 + hw, w2 = flow2 * 2 + hw;
        p.poly([28, 9, 36, 4, 46, 4, 56, 7 + w1 * 0.3, 68, 11 + w1 * 0.7, 80, 16 + w1, 70, 19 + w1 * 0.8, 78, 26 + w2, 66, 25 + w2 * 0.7, 70, 34 + w2, 58, 29 + w2 * 0.5, 54, 36 + w2 * 0.6, 48, 28, 44, 22], M.hair, { part: 'hair', bevel: 3 });
        p.chain([[62, 24 + w2 * 0.5, 1.2], [72, 34 + w2, 0.9], [78, 42 + w2 * 1.4, 0.5]], M.hair, { part: 'hairEnd', tone: -0.1 });
        // Череп лица: высокий свод, впалые виски, острые скулы, длинная отвисшая челюсть.
        p.ellipse(34, 16, 9, 9.5, M.flesh, { part: 'face' });
        p.ellipse(29, 22, 6, 6, M.flesh, { part: 'face', lift: 1 });
        p.pose({ rot: 0.05 * open, px: 34, py: 24 }, () => {
          p.poly([23, 25 + open * 0.6, 30, 25, 36, 24, 35, 29 + open * 0.8, 29, 32 + open, 24, 30 + open], M.flesh, { part: 'jaw', tone: -0.1, bevel: 1.5 });
        });
        p.ellipse(33, 22, 2.6, 3, M.shroud, { part: 'face', paint: true });
        // Глаза — чёрные провалы; в глубине тлеет холодная точка.
        p.poly([24, 14.5, 29, 16, 28.5, 20, 24.5, 19.5], M.pit, { part: 'face', paint: true });
        p.poly([31, 16, 35.5, 14.5, 35.5, 19.5, 31.5, 20], M.pit, { part: 'face', paint: true });
        // Пасть — вытянутый рваный провал, раскрывается в вопле.
        p.poly([24.5, 24, 30, 23.5, 29.5, 25 + open * 0.8, 28, 26 + open, 26, 25.5 + open * 0.9, 25, 25 + open * 0.6], M.pit, { part: 'face', paint: true });
        p.line(26.5, 21.5, 26.5, 23, '#6070a4');
        if (hurt < 0.4) {
          p.px(26.5, 17.5, '#f4f8ff');
          p.px(33, 17.5, '#c8d8ff');
        }
        // Прядь спадает на лоб.
        p.chain([[30, 8, 1.6], [26, 12, 1.2], [24.5, 17, 0.6]], M.hair, { part: 'fringe' });
      });

      // Ближняя рука — справа, поверх тела: тянется к герою, в броске — во всю длину.
      const [hx, hy] = [22 + reach[0] * 1.2, 56 + reach[1] * 1.4 + 3 * hurt];
      p.chain([[50, 32, 3], [44, 46, 2.4], [hx + 3, hy - 1, 1.8]], M.flesh, { part: 'nearArm' });
      p.poly([46, 30, 55, 32, 52 + flow, 46, 46, 42], M.shroud, { part: 'sleeve', bevel: 2, tone: -0.05 });
      p.ellipse(hx + 1, hy, 2.4, 2, M.flesh, { part: 'hand' });
      for (let k = 0; k < 4; k++) {
        const a = 175 + (k - 1.5) * 20 + 12 * wind - 8 * strike;
        const [cx, cy] = at(hx, hy, a, 5.5), [tx, ty] = at(hx, hy, a + 20, 10);
        p.chain([[hx, hy, 0.8], [cx, cy, 0.7], [tx, ty, 0.5]], M.flesh, { part: 'fingers' });
      }
      // Холод касания — иней у пальцев в кадре контакта.
      if (strike > 0.6) p.glow(hx - 12, hy + 2, 9, GHOST_MIST, 0.4);
    });
  },
};

// ─── Тень ───────────────────────────────────────────────────────────────────

const WRAITH = {
  robe: { base: '#3a2650', shag: 0.28, tex: { kind: 'stripes', scale: 2.4, amp: 0.14, angle: 1.5 } } as Mat,
  dark: { base: '#1e1228', dither: 0 } as Mat,
  hand: { base: '#6a5a80', tex: { kind: 'noise', scale: 2, amp: 0.12 } } as Mat,
  blade: { base: '#9ae8ff', glow: true, dither: 0, ramp: ['#4a9ac0', '#62b4d8', '#86d0ec', '#b0e8fa', '#e0faff'] } as Mat,
  hilt: { base: '#2e2438', shine: 0.5 } as Mat,
};

/** Удар призрачным клинком: плечо, предплечье и клинок по ходу клипа, градусы — рубит сверху наискось к герою. */
const WR_UPPER: Keys = [[0, 115], [0.14, 238], [0.3, 250], [0.43, 212], [0.57, 172], [0.72, 150], [0.86, 118], [1, 105]];
const WR_FORE: Keys = [[0, 150], [0.14, 282], [0.3, 294], [0.43, 238], [0.57, 172], [0.72, 150], [0.86, 142], [1, 140]];
const WR_BLADE: Keys = [[0, 135], [0.14, 330], [0.3, 344], [0.43, 252], [0.57, 172], [0.72, 138], [0.86, 128], [1, 125]];

export const wraith: Model = {
  id: 'wraith',
  w: 84,
  h: 112,
  ground: 110,
  // Клинок в кадре контакта выброшен к герою, в замахе — над капюшоном.
  pad: 40,
  flies: true,
  draw(p: Painter) {
    const M = WRAITH;
    // Призрачный клинок: замах — клинок взмывает над капюшоном, балахон вздувается; удар — рубит наискось к герою.
    // Урон: отбросило, капюшон откинут, глаза мигнули, лохмотья взметнулись.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const hover = -p.bob(2, 1, 0.6) - 5;
    const flow = p.wave(1, 0.3), flow2 = p.wave(2, 0.1);
    const pulse = (p.wave(2, 0.2) + 1) / 2;

    p.pose({ dx: -8 * strike + 3 * wind + 6 * hurt, dy: hover - 2 * hurt, rot: 0.04 * wind - 0.06 * strike + 0.08 * hurt, px: 44, py: 70 }, () => {
      p.shadow(44, 18, 2, 0.18);
      // Низ балахона истлевает в дым: рваные полосы и клочья тумана назад.
      p.film([28, 88, 62, 86, 72 + flow * 2, 96, 80 + flow * 3, 104, 64, 100, 54 + flow2, 106, 44, 98, 34, 104, 24, 96], '#4a2a6a50', true);
      p.poly([28, 56, 60, 56, 66, 74, 70 + flow * 1.5, 92, 62, 88, 58 + flow2, 98, 52, 90, 46, 100, 40, 90, 34, 96, 30 + flow, 86, 24, 90, 26, 72], M.robe, { part: 'skirt', bevel: 5, tone: -0.08 });

      // Дальняя рука протянута к герою из рукава: костлявая кисть, пальцы-когти.
      const sw = 1.2 * p.wave(1, 0.7);
      p.limb(36, 40, 4.5, 22, 52 + sw, 5, M.robe, { part: 'farArm', tone: -0.16 });
      p.poly([16, 48 + sw, 26, 46 + sw, 28, 58 + sw, 18, 58 + sw], M.robe, { part: 'farArm', bevel: 2, tone: -0.22 });
      p.ellipse(14, 54 + sw, 2.6, 2.2, M.hand, { part: 'farHand', tone: -0.1 });
      for (let k = 0; k < 3; k++) p.chain([[13, 52.5 + sw + k * 1.6, 0.8], [8, 53 + sw + k * 1.8, 0.6], [6, 56 + sw + k * 1.6, 0.5]], M.hand, { part: 'farFingers', tone: -0.1 });

      // Широкие плечи и грудь под балахоном: Тень выше человека и шире его.
      p.ellipse(44, 50, 15, 18, M.robe);
      p.poly([26, 38, 62, 38, 64, 60, 26, 62], M.robe, { bevel: 5 });

      // Капюшон: остриём назад, лицо — провал тьмы, из него горят холодные глаза.
      p.pose({ dx: p.snap(2 * hurt), dy: p.snap(2 - 2 * hurt), rot: -0.1 + 0.3 * hurt - 0.04 * strike, px: 42, py: 36 }, () => {
        p.poly([24, 40, 32, 30, 52, 30, 62, 42, 54, 46, 42, 44, 30, 48], M.robe, { part: 'mantle', bevel: 4 });
        p.ellipse(40, 22, 13, 15, M.robe, { part: 'hood' });
        p.poly([42, 8, 58 + flow + 3 * hurt, 4 + 4 * hurt, 54, 22], M.robe, { part: 'hood', bevel: 3 });
        p.ellipse(33, 25, 8.5, 11, M.dark, { part: 'hood', paint: true });
        if (hurt < 0.4) {
          const eye = wind > 0.4 ? '#ffffff' : '#c9f0ff';
          p.glow(31, 23, 6, '#c9f0ff', 0.3 + 0.2 * pulse + 0.2 * wind);
          p.line(27, 22, 29.5, 23, eye);
          p.line(33, 23, 35, 22.5, eye);
        }
      });

      // Ближняя рука с призрачным клинком — справа, поверх тела.
      const a1 = ang(p, WR_UPPER, 105) - 20 * hurt;
      const a2 = ang(p, WR_FORE, 140) - 25 * hurt;
      const a3 = ang(p, WR_BLADE, 125) + 30 * hurt + 3 * p.wave(1, 0.4);
      const { ex, ey, hx, hy } = limb2(54, 40, a1, 14, a2, 13);
      const n: [number, number] = [-Math.sin(a3 * DEG), Math.cos(a3 * DEG)];
      const [tx, ty] = at(hx, hy, a3, 34);
      const [bx, by] = at(hx, hy, a3, 3.5);
      p.glow(...at(hx, hy, a3, 18), 11 + 2 * pulse, '#9ae8ff', 0.2 + 0.1 * pulse + 0.2 * strike);
      p.poly([bx + n[0] * 2.4, by + n[1] * 2.4, ...at(tx + n[0] * 1.8, ty + n[1] * 1.8, a3, -9), tx, ty, ...at(tx - n[0] * 1.2, ty - n[1] * 1.2, a3, -6), bx - n[0] * 2, by - n[1] * 2], M.blade, { part: 'blade', bevel: 1.2 });
      p.limb(bx - n[0] * 3.5, by - n[1] * 3.5, 1.1, bx + n[0] * 3.5, by + n[1] * 3.5, 1.1, M.hilt, { part: 'guard' });
      p.limb(hx, hy, 1.1, ...at(hx, hy, a3, -5), 1.1, M.hilt, { part: 'grip' });
      p.limb(54, 40, 5, ex, ey, 4.4, M.robe, { part: 'nearArm' });
      p.limb(ex, ey, 4.4, hx, hy, 3.4, M.robe, { part: 'nearArm' });
      p.poly([ex - 3, ey - 2, ex + 5, ey - 1, hx + 3, hy + 4, hx - 3, hy + 3], M.robe, { part: 'sleeve', bevel: 2, tone: -0.08 });
      p.ellipse(hx, hy, 2.8, 2.6, M.hand, { part: 'fist' });
      // Шлейф клинка в кадрах удара.
      if (strike > 0.3 && strike < 0.95) p.film([hx, hy, ...at(hx, hy, a3, 34), ...at(hx, hy, a3 + 45, 30)], '#9ae8ff40');
    });
  },
};

// ─── Гуль ───────────────────────────────────────────────────────────────────

const GHOUL = {
  /** Кожа мертвеца — серо-розовая, местами содрана до мяса. */
  skin: { base: '#a08680', tex: { kind: 'noise', scale: 3, amp: 0.07 } } as Mat,
  /** Ободранные мышцы: волокна вдоль конечности. */
  muscle: { base: '#8a2c2a', tex: { kind: 'stripes', scale: 1.4, amp: 0.1, angle: 0 } } as Mat,
  bone: { base: '#d0c4a8', ramp: ['#4a4038', '#7a6c5a', '#a8987c', '#cebea0', '#ece0c4'], tex: { kind: 'noise', scale: 1.6, amp: 0.1 } } as Mat,
  claw: { base: '#d8ceb8', ramp: ['#5a5048', '#8a7e70', '#b4a894', '#d8ceb8', '#f2eadc'], dither: 0 } as Mat,
  iron: { base: '#4e4a4a', shine: 0.6, tex: { kind: 'spots', scale: 2, amp: 0.25, density: 0.3 } } as Mat,
  rag: { base: '#3a2c26', shag: 0.3, tex: { kind: 'stripes', scale: 2, amp: 0.12, angle: 1.5 } } as Mat,
  hair: { base: '#2a2420', shag: 0.3, tex: { kind: 'stripes', scale: 1.2, amp: 0.2, angle: 1.3 } } as Mat,
  mouth: { base: '#2a0808', dither: 0 } as Mat,
  tooth: { base: '#e2d8be', dither: 0 } as Mat,
  shade: { base: '#4a3634' } as Mat,
};
const GHOUL_EYE = '#ffb030';

/**
 * Удар когтями ближней рукой: плечо и предплечье по ходу клипа, градусы — в покое когти выставлены вперёд под пастью,
 * замах — рука над горбом, когти назад; контакт — рука к герою ниже головы, когти рубят сверху вниз и не закрывают морду.
 */
const GH_UPPER: Keys = [[0, 112], [0.14, 245], [0.3, 258], [0.43, 205], [0.57, 150], [0.72, 132], [0.86, 112], [1, 100]];
const GH_FORE: Keys = [[0, 160], [0.14, 290], [0.3, 305], [0.43, 225], [0.57, 160], [0.72, 140], [0.86, 145], [1, 150]];

/** Коготь-клинок из кисти (x, y) в направлении `a` градусов: длинный, чуть загнут вниз, толстый у основания. */
function blade(p: Painter, x: number, y: number, a: number, len: number, wid: number, mat: Mat, part: string, tone = 0): void {
  const ux = Math.cos(a * DEG), uy = Math.sin(a * DEG);
  const nx = -uy, ny = ux;
  const pts: number[] = [];
  const n = 5;
  for (let k = 0; k <= n; k++) {
    const f = k / n, bend = f * f * len * 0.18;
    pts.push(x + ux * len * f + nx * (bend + wid * (1 - f)), y + uy * len * f + ny * (bend + wid * (1 - f)));
  }
  for (let k = n - 1; k >= 0; k--) {
    const f = k / n, bend = f * f * len * 0.18;
    pts.push(x + ux * len * f + nx * (bend - wid * 0.6 * (1 - f)), y + uy * len * f + ny * (bend - wid * 0.6 * (1 - f)));
  }
  p.poly(pts, mat, { part, tone, bevel: 0.8 });
}

/** Разорванные кандалы: железный браслет поперёк конечности и обрывок цепи — звенья висят вниз. */
function shackle(p: Painter, x: number, y: number, a: number, r: number, M: typeof GHOUL, sway: number, part: string, tone = 0): void {
  const nx = -Math.sin(a * DEG), ny = Math.cos(a * DEG);
  p.limb(x - nx * r, y - ny * r, 1.6, x + nx * r, y + ny * r, 1.6, M.iron, { part, tone });
  for (let k = 0; k < 3; k++) p.ellipse(x + nx * r + sway * k * 0.6, y + ny * r + 2.4 + k * 2.6, 1.3, 1.6, M.iron, { part: `${part}Chain`, tone: tone - 0.05 * k });
}

const ghoulBase: Model = {
  id: 'ghoul',
  w: 112,
  h: 96,
  ground: 94,
  // Когти в кадре контакта выброшены к герою, в замахе — над горбом.
  pad: 48,
  draw(p: Painter) {
    const M = GHOUL;
    const G = 94;
    // Прыжок с когтями: замах — присесть ниже, ближняя рука взлетает над горбом, пасть раскрыта; выпад — бросок
    // к герою, когти рубят сверху вниз. Урон: отбросило, голову запрокинуло, пасть в визге, когти поджаты.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    // Хрипло дышит: горб ходит вверх-вниз, когти подрагивают, голова дёргается — принюхивается; с челюсти тянется слюна.
    const up = -p.bob(1.5, 2);
    const flex = p.wave(3, 0.2);
    const sniff = p.clip === 'idle' ? p.snap(1.5 * p.blink(0.3, 0.1)) : 0;
    const drip = p.clip === 'idle' ? (p.t * 2) % 1 : -1;
    const sway = p.wave(1, 0.4) + 2 * hurt;

    p.pose({ dx: -16 * strike + 4 * wind + 5 * hurt, dy: 3 * wind, rot: 0.06 * wind - 0.08 * strike + 0.07 * hurt, px: 70, py: G }, () => {
      p.shadow(62, 40, 3);
      // Обрывок цепи от кандалов на ближней лодыжке волочится по полу.
      for (let k = 0; k < 4; k++) p.ellipse(90 + k * 3.4, G - 1.2, 1.6, 1.2, M.iron, { part: 'floorChain', tone: -0.1 });

      // Низкая стойка перед прыжком: колени выставлены к герою, стопы под тазом, пальцы с когтями в камне.
      const leg = (hip: [number, number], knee: [number, number], ankle: [number, number], toe: number, part: string, tone: number): void => {
        p.chain([[hip[0], hip[1], 6], [knee[0], knee[1], 3.8], [ankle[0], ankle[1], 2.6]], M.skin, { part, tone });
        p.limb(hip[0] - 1, hip[1] + 1, 4.2, knee[0] + 2, knee[1] - 1.5, 2.4, M.muscle, { part, paint: true, tone });
        p.ellipse(knee[0], knee[1], 3.8, 3.4, M.skin, { part, tone, lift: 1 });
        p.poly([ankle[0] + 2, ankle[1] - 2, ankle[0] + 4, G, toe, G, toe + 2, G - 3.5], M.skin, { part: `${part}Foot`, tone: tone - 0.04, bevel: 1.2 });
        for (const x of [toe, toe + 4]) p.line(x, G - 1, x - 2, G, '#2a2420');
      };
      leg([76, 54], [58, 70], [66, 88], 50, 'far', -0.16);

      // Дальняя рука — слева, за телом: опирается о пол, когти-клинки веером впереди.
      p.chain([[50, 38 + up, 4.4], [40, 56 + up * 0.5, 3.4], [30, 72, 2.8]], M.skin, { part: 'farArm', tone: -0.16 });
      p.limb(44, 48 + up * 0.5, 3, 33, 68, 2.2, M.muscle, { part: 'farArm', paint: true, tone: -0.16 });
      p.ellipse(40, 56 + up * 0.5, 3.4, 3.2, M.skin, { part: 'farArm', tone: -0.16, lift: 1 });
      p.ellipse(28, 75, 3.6, 3, M.skin, { part: 'farHand', tone: -0.16 });
      shackle(p, 32, 69, 125, 3.2, M, sway, 'farCuff', -0.16);
      for (let k = 0; k < 3; k++) blade(p, 27, 74 + k * 1.6, 172 + (k - 1) * 13 + 3 * flex, 22 - k * 2, 2.8, M.claw, `farClaw${k}`, -0.1);

      // Тело: таз сзади выше головы, спина горбом, грудь низко между рук, живот втянут; на груди кожа содрана.
      p.ellipse(82, 52, 9, 8, M.skin);
      p.ellipse(74, 38 + up * 0.6, 15, 9, M.skin, { rot: 0.83 });
      p.ellipse(56, 42 + up, 12, 10, M.skin, { rot: -0.3 });
      p.ellipse(70, 50 + up * 0.5, 9, 6, M.skin);
      p.ellipse(54, 46 + up, 6, 5, M.muscle, { paint: true });
      for (let k = 0; k < 4; k++) p.line(46 + k * 3.2, 40 + up + k * 1.2, 52 + k * 3.2, 46 + up + k * 1.6, '#5a3a36');
      p.ellipse(72, 48 + up * 0.5, 4, 3, M.muscle, { paint: true, tone: -0.05 });
      // Костяные шипы из хребта по выгнутой спине — наклонены назад, самые высокие на горбу.
      const spikes: Array<[number, number, number, number]> = [[56, 32, 9, 2.6], [63, 27, 13, 3.2], [70, 27, 14, 3.2], [77, 31, 11, 2.8], [83, 38, 8, 2.2]];
      for (const [x, y, h, w] of spikes) p.poly([x - w, y + up + 2, x + h * 0.35, y + up - h - 2 * wind, x + w, y + up + 2], M.bone, { part: 'spikes', bevel: 1 });
      // Набедренная повязка — рваньё.
      p.poly([74, 56, 90, 54, 92, 66, 86, 70, 80, 65, 74, 69, 70, 62], M.rag, { part: 'rag', bevel: 2 });

      // Ближняя нога — поверх тела; на лодыжке кандалы.
      leg([84, 54], [72, 74], [82, 90], 66, 'near', 0);
      shackle(p, 82, 86, 90, 3.4, M, 0, 'ankle');

      // Голова на жилистой шее вытянута к герою ниже горба: череп, обтянутый кожей, гребень костяных шипов,
      // носа нет — две щели, огромная пасть с частоколом клыков; глаза горят из-под надбровий.
      p.limb(52, 36 + up, 5, 36, 40 + up, 4.4, M.skin, { part: 'neck', tone: -0.05 });
      const open = 4 + 3 * wind + 5 * strike + 5 * hurt + (p.clip === 'idle' ? 0.8 * p.wave(1) : 0);
      p.pose({ dx: p.snap(-3 * strike + 2 * hurt - sniff), dy: up + p.snap(-2 * wind - 2 * hurt), rot: 0.14 * wind - 0.06 * strike + 0.32 * hurt, px: 36, py: 40 }, () => {
        p.scope(1.12, 30, 40, () => {
          // Космы на затылке и заострённое ухо.
          p.chain([[6, -8, 1.4], [14, -6, 1.1], [18, 0, 0.6]], M.hair, { part: 'hair' });
          p.poly([4, -6, 14 + 2 * hurt, -12 + hurt, 8, -1], M.skin, { part: 'ear', bevel: 1.4, tone: -0.1 });
          // Нижняя челюсть — длинная, отвисшая.
          p.pose({ rot: 0.04 * open, px: 4, py: 2 }, () => {
            p.poly([-15, 4 + open * 0.6, -4, 4.5 + open, 4, 3, 3, 8 + open * 0.5, -6, 11 + open, -13, 9 + open], M.skin, { part: 'jaw', tone: -0.1, bevel: 1.6 });
          });
          p.ellipse(1, -4, 8, 7.5, M.skin, { part: 'head' });
          p.ellipse(-7, 0, 6.5, 4.5, M.skin, { part: 'head' });
          // Гребень коротких костяных шипов от лба к затылку.
          for (const [x, y, tx, ty] of [[-3, -10.5, -4, -16], [1, -11.5, 2, -17.5], [5, -10, 8, -15]]) p.poly([x - 1.5, y + 1, tx, ty, x + 1.5, y + 1], M.bone, { part: 'crest', bevel: 0.8 });
          // Надбровье нависает, щёки впали; носа нет — две щели.
          p.ellipse(-4, -5.5, 6.5, 2, M.shade, { part: 'head', paint: true });
          p.ellipse(1, 1, 3, 2.2, M.shade, { part: 'head', paint: true });
          p.line(-12, -1.5, -11, 0.5, '#2a1a18');
          p.line(-9.5, -1.5, -8.5, 0.5, '#2a1a18');
          // Пасть: провал с частоколом верхних и нижних клыков.
          p.poly([-15, 3, 1, 2.5, 2, 4 + open * 0.8, -5, 5.5 + open, -13, 4.5 + open * 0.8], M.mouth, { part: 'maw', bevel: 0.6 });
          for (const x of [-13, -9.5, -6, -2.5]) p.poly([x - 1.2, 3, x + 1.2, 3, x, 6.5], M.tooth, { part: 'teeth' });
          for (const x of [-11.5, -7.5, -3.5]) p.poly([x - 1.2, 5 + open * 0.9, x + 1.2, 5 + open * 0.9, x, 1.5 + open * 0.9], M.tooth, { part: 'teeth' });
          if (drip > 0.05 && drip < 0.7) p.line(-11, 5 + open, -11, 6 + open + drip * 8, '#c8b0a0a0');
          const shut = hurt > 0.4 ? 1 : p.blink(0.7, 0.04);
          if (shut < 1) {
            p.glow(-6, -4.5, 4.5, GHOUL_EYE, 0.35 + 0.25 * wind);
            p.line(-7, -4.5, -4.5, -4, wind > 0.4 ? '#fff0b0' : GHOUL_EYE);
            p.px(-0.5, -4, '#d08020');
          } else p.line(-8, -4, -4, -4, '#2a1a18');
        });
      });

      // Ближняя рука — справа, поверх: предплечье содрано до мышц, на запястье кандалы; когти-клинки выставлены
      // к герою ниже пасти, в ударе рука взлетает над горбом и рубит сверху.
      const a1 = ang(p, GH_UPPER, 100) - 20 * hurt;
      const a2 = ang(p, GH_FORE, 150) - 30 * hurt;
      const { ex, ey, hx, hy } = limb2(58, 38 + up, a1, 16, a2, 16);
      p.limb(58, 38 + up, 5, ex, ey, 3.6, M.skin, { part: 'nearArm' });
      p.limb(ex, ey, 3.6, hx, hy, 2.8, M.skin, { part: 'nearArm' });
      p.limb(ex, ey, 2.8, hx, hy, 2.2, M.muscle, { part: 'nearArm', paint: true });
      p.ellipse(58, 38 + up, 5.4, 5, M.skin, { part: 'nearArm', lift: 1 });
      p.ellipse(ex, ey, 3.4, 3.2, M.skin, { part: 'nearArm', lift: 1 });
      const [cx, cy] = at(hx, hy, a2 + 180, 4);
      shackle(p, cx, cy, a2, 3.4, M, sway, 'nearCuff');
      p.ellipse(hx, hy, 3.4, 3, M.skin, { part: 'hand' });
      const curl = 12 * hurt - 6 * strike + 3 * flex;
      for (let k = 0; k < 3; k++) blade(p, hx, hy + (k - 1) * 1.6, a2 + 15 + (k - 1) * 15 + curl, 25 - k * 2, 3, M.claw, `claw${k}`);
      if (strike > 0.5) p.film([hx, hy, ...at(hx, hy, a2 - 50, 22), ...at(hx, hy, a2 + 40, 22)], '#ffb03030');
    });
  },
};

// ─── Мумия ──────────────────────────────────────────────────────────────────

const MUMMY = {
  wrap: { base: '#b0a080', tex: { kind: 'stripes', scale: 1.8, amp: 0.22, angle: 0.35 } } as Mat,
  wrap2: { base: '#9a8a6a', tex: { kind: 'stripes', scale: 1.6, amp: 0.22, angle: -0.4 } } as Mat,
  loose: { base: '#a89878', shag: 0.2, tex: { kind: 'stripes', scale: 1.2, amp: 0.15, angle: 1.5 } } as Mat,
  stain: { base: '#6a5a44' } as Mat,
  gap: { base: '#1e1614', dither: 0 } as Mat,
  gold: { base: '#a8883a', shine: 0.7, tex: { kind: 'noise', scale: 1.5, amp: 0.15 } } as Mat,
  lapis: { base: '#2a3e5a' } as Mat,
};

/**
 * Удар сверху ближней (правой) рукой: из покоя (рука висит, бинт волочится) рука уходит назад-вверх, через голову
 * обрушивается вперёд-вниз к герою и опускается в покой (угол 0 — покой, −2π — снова он).
 */
const MSLAM: Keys = [[0, -0.4], [0.14, -2.1], [0.3, -2.4], [0.43, -3.8], [0.57, -5.0], [0.72, -5.2], [0.86, -5.8], [1, -2 * Math.PI]];

export const mummy: Model = {
  id: 'mummy',
  w: 84,
  h: 114,
  ground: 112,
  // Кулак в замахе поднимается над головой на длину руки.
  pad: 44,
  draw(p: Painter) {
    const M = MUMMY;
    const G = 112;
    // Удар: замах — рука из-за спины через голову, бинты разлетаются; выпад — кулак обрушивается на героя.
    // Урон: отбросило, голову откинуло, глаз погас, с плеча слетает пыль.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    // Шаркает на месте: плечи и голова качаются, бинты свисают и шевелятся, глаз тлеет.
    const up = -p.bob(1.2, 1);
    const sway = p.wave(1, 0.2), sway2 = p.wave(1, 0.6);
    const ember = (p.wave(2, 0.4) + 1) / 2;

    p.pose({ dx: -6 * strike + 2 * wind + 5 * hurt, rot: 0.04 * wind - 0.05 * strike + 0.06 * hurt, px: 44, py: G }, () => {
      p.shadow(44, 24, 3);
      // Ноги в бинтах: дальняя вперёд, ближняя назад, колени согнуты; ступни волочатся.
      p.chain([[40, 70, 6], [32, 88, 5], [32, 104, 4]], M.wrap2, { part: 'far', tone: -0.16 });
      p.poly([24, 104, 36, 102, 38, G, 20, G], M.wrap2, { part: 'farFoot', tone: -0.18, bevel: 2 });
      p.chain([[52, 70, 6.5], [58, 88, 5.2], [60, 104, 4.2]], M.wrap2, { part: 'near' });
      p.poly([52, 104, 64, 102, 66, G, 48, G], M.wrap2, { part: 'nearFoot', bevel: 2 });
      // Размотавшийся бинт с ноги стелется по полу.
      p.chain([[60, 98, 1.4], [66, 104 + sway * 0.5, 1.3], [72, G - 1, 1.2], [80, G - 1, 1]], M.loose, { part: 'looseLeg', tone: -0.1 });

      p.pose({ dy: 2, rot: -0.07, px: 46, py: 70 }, () => {
        // Дальняя рука вытянута к герою — тянется схватить: кисть с растопыренными пальцами.
        const reach = 2 * wind - 4 * strike;
        p.chain([[36, 38 + up, 4.8], [24, 46 + up, 4], [12 + reach, 48 + up, 3.4]], M.wrap, { part: 'farArm', tone: -0.16 });
        p.ellipse(9 + reach, 48 + up, 3.4, 3, M.wrap, { part: 'farArm', tone: -0.16 });
        for (let k = 0; k < 3; k++) p.chain([[7 + reach, 46.5 + up + k * 1.6, 0.9], [3 + reach, 46 + up + k * 2.2, 0.7]], M.stain, { part: 'farFingers' });
        p.chain([[22, 47 + up, 1.3], [20 + sway, 55 + up, 1.2], [21 + sway * 1.5, 63 + up, 1]], M.loose, { part: 'looseArm', tone: -0.14 });

        // Туловище: бинты крест-накрест, тёмные щели между витками, пятна.
        p.ellipse(46, 62, 12, 10, M.wrap);
        p.ellipse(46, 46 + up, 14, 15, M.wrap);
        p.ellipse(42, 58, 8, 5, M.wrap2, { paint: true });
        for (let k = 0; k < 5; k++) p.line(34, 38 + k * 6 + up, 58, 34 + k * 6 + up, '#5a4a36');
        p.ellipse(52, 52 + up, 4, 3, M.stain, { paint: true });
        p.ellipse(40, 66, 3, 2.4, M.stain, { paint: true });
        // Ожерелье-ускх: потускневшее золото и лазурь — всё, что осталось от фараона.
        p.poly([32, 34 + up, 42, 30 + up, 56, 31 + up, 60, 36 + up, 56, 42 + up, 46, 44 + up, 36, 42 + up], M.gold, { part: 'collar', bevel: 2 });
        p.poly([35, 37 + up, 46, 40 + up, 57, 36 + up, 56, 38 + up, 46, 42 + up, 36, 39 + up], M.lapis, { part: 'collar', paint: true });
        p.ellipse(46, 45 + up, 2.4, 2, M.gold, { part: 'scarab', lift: 1 });

        // Голова в бинтах: сквозь щель горит один глаз, другой замотан; вместо рта — щель тьмы.
        p.limb(45, 34 + up, 5, 43, 28 + up, 5, M.wrap2, { part: 'neck' });
        const open = 1 + 2 * wind + 3 * strike + 4 * hurt;
        p.pose({ dx: p.snap(-strike + 2 * hurt), dy: up, rot: -0.08 + 0.05 * wind - 0.05 * strike + 0.26 * hurt, px: 42, py: 30 }, () => {
          p.ellipse(42, 18, 10, 11, M.wrap, { part: 'head' });
          p.ellipse(36, 23, 7, 6.5, M.wrap, { part: 'head' });
          p.poly([32, 12, 52, 10, 52, 14, 32, 16], M.wrap2, { part: 'head', paint: true });
          p.poly([30, 24, 46, 22, 46, 26, 30, 27], M.wrap2, { part: 'head', paint: true });
          // Глазная щель — тёмная полоса поперёк лица, в ней тлеет глаз.
          p.poly([29, 17, 43, 16, 43, 20, 29, 21], M.gap, { part: 'head', paint: true });
          p.poly([30, 27, 40, 26, 40, 27 + open, 31, 28 + open * 0.8], M.gap, { part: 'head', paint: true });
          // Хвост бинта с макушки болтается назад.
          p.chain([[50, 16, 1.6], [54, 22 + sway2 * 0.5, 1.4], [55 + sway2, 29, 1.2], [56 + sway2 * 1.5 + 2 * hurt, 36, 0.9]], M.loose, { part: 'looseHead', tone: -0.1 });
          if (hurt < 0.4) {
            const eye = wind > 0.4 ? '#fff0a0' : '#ffc040';
            p.glow(33, 18.5, 5, '#ffb030', 0.3 + 0.2 * ember + 0.2 * wind);
            p.line(32, 18.5, 34.5, 19, eye);
          }
        });

        // Ближняя рука — справа, поверх туловища: висит, с кисти свисает бинт; в ударе — дугой через голову на героя.
        const phi = p.clip === 'attack' ? keys(MSLAM, p.u) : 0;
        p.pose({ rot: phi - 0.12 * hurt, px: 56, py: 38 + up }, () => {
          p.chain([[56, 38 + up, 5.2], [60, 56 + up, 4.4], [58, 72 + up, 3.8]], M.wrap, { part: 'nearArm' });
          p.ellipse(58, 76 + up, 4.4, 4, M.wrap, { part: 'nearFist' });
          for (let k = 0; k < 3; k++) p.line(54, 44 + up + k * 8, 62, 42 + up + k * 8, '#5a4a36');
          p.chain([[58, 78 + up, 1.3], [60 + sway, 86 + up, 1.2], [58 + sway * 1.5, 94 + up, 1]], M.loose, { part: 'looseFist' });
        });
        // Пыль с бинтов в кадрах удара и урона.
        if (strike > 0.6 || hurt > 0.3) {
          const k = Math.max(strike, hurt);
          for (const [ox, oy] of [[-6, -6], [4, -12], [12, -4], [-2, 4]]) p.disc(46 + ox * (1 + k), 36 + oy * k, 1.4 + k, `#b8a888${hexA(0.5 * k)}`);
        }
      });
    });
  },
};

// ─── Вампир ─────────────────────────────────────────────────────────────────

const VAMP = {
  skin: { base: '#cfc6d8', tex: { kind: 'noise', scale: 3, amp: 0.05 } } as Mat,
  hair: { base: '#1a1622', shine: 0.5, tex: { kind: 'stripes', scale: 1.2, amp: 0.14, angle: 0.25 } } as Mat,
  cape: { base: '#1c1622', tex: { kind: 'noise', scale: 3, amp: 0.07 } } as Mat,
  lining: { base: '#8a1628', tex: { kind: 'stripes', scale: 2.5, amp: 0.1, angle: 1.4 } } as Mat,
  coat: { base: '#2c0c18', tex: { kind: 'noise', scale: 2.5, amp: 0.1 } } as Mat,
  vest: { base: '#5a0e1e', tex: { kind: 'stripes', scale: 1.4, amp: 0.1, angle: 1.57 } } as Mat,
  pants: { base: '#16111a', tex: { kind: 'stripes', scale: 3, amp: 0.06, angle: 1.57 } } as Mat,
  boot: { base: '#120e16', shine: 0.5 } as Mat,
  silver: { base: '#b8bcc4', shine: 0.9, dither: 0 } as Mat,
  cravat: { base: '#bcb4c2', tex: { kind: 'noise', scale: 1.2, amp: 0.16 } } as Mat,
  shade: { base: '#6a5a78' } as Mat,
  mouth: { base: '#3a0810', dither: 0 } as Mat,
  fang: { base: '#f0ecf4', dither: 0 } as Mat,
};
const VAMP_EYE = '#ff2a3a';

/**
 * Край плаща в ближней руке: точки относительно кисти. Покой — плащ поднят к подбородку и ниспадает до пола,
 * прикрывая бок; замах — рука вскинута, плащ раскрыт крылом нетопыря; бросок — крыло хлестнуло вперёд.
 */
const WING_REST: Array<[number, number]> = [[0, 0], [14, 6], [24, 26], [30, 52], [30, 78]];
const WING_WIND: Array<[number, number]> = [[0, 0], [22, -10], [38, 2], [42, 26], [36, 50]];
const WING_HIT: Array<[number, number]> = [[0, 0], [16, -2], [26, 14], [30, 36], [28, 60]];

export const vampire: Model = {
  id: 'vampire',
  w: 100,
  h: 122,
  ground: 120,
  // Бросок в кадре контакта: когти — на 34 единицы левее рамки; крыло плаща на замахе уходит вправо и вверх.
  pad: 48,
  draw(p: Painter) {
    const M = VAMP;
    const G = 120;
    // Укус: замах — ближняя рука вскидывает плащ крылом, голова откинута, клыки обнажены; выпад — бросок к горлу
    // героя, дальняя рука хватает когтями. Урон: отбросило, лицо в оскале, плащ взметнулся, глаза погасли.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1, 2);
    const hem = p.wave(1, 0.3), hem2 = p.wave(2, 0.7);
    // Глаза разгораются в такт — гипнотизирует.
    const pulse = (p.wave(2, 0.15) + 1) / 2;
    const scallop = (x0: number, x1: number, y: number, n: number, depth: number, sway: number): number[] => {
      // Зубчатый подол нетопыря справа налево: зубцы вниз, выемки вверх.
      const pts: number[] = [];
      for (let k = 0; k <= n * 2; k++) {
        const x = x1 + ((x0 - x1) * k) / (n * 2);
        pts.push(x + (k % 2 ? 0 : sway * (k / (n * 2))), y - (k % 2 ? depth : 0));
      }
      return pts;
    };

    p.pose({ dx: -13 * strike + 3 * wind + 6 * hurt, rot: 0.04 * wind - 0.07 * strike + 0.06 * hurt, px: 50, py: G }, () => {
      p.shadow(50, 30, 3.5);
      // Плащ за спиной — колокол до пола с зубчатым подолом; изнутри видна багровая подкладка.
      const flare = 4 * wind + 3 * hurt;
      p.poly([38, 38 + up, 64, 36 + up, 74 + flare * 0.5, 52, 84 + flare, 82, 90 + hem + flare, 110, ...scallop(24 - flare * 0.5, 90 + hem + flare, G - 1, 4, 6, hem2), 24 - flare * 0.5, 104, 28, 70, 32, 50], M.cape, { part: 'cape', bevel: 4, tone: -0.1 });
      p.poly([34, 52, 42, 44 + up, 44, 110, 30 - flare * 0.4, 112, 28, 90], M.lining, { part: 'cape', paint: true });

      // Ноги в стойке: дальняя выставлена к герою, ближняя отставлена; высокие сапоги.
      p.chain([[46, 78, 6], [37, 96, 5], [35, 108, 4]], M.pants, { part: 'far', tone: -0.14 });
      p.poly([24, 116, 28, 107, 40, 105, 41, G, 22, G], M.boot, { part: 'farBoot', tone: -0.12, bevel: 2 });
      p.chain([[56, 78, 6.5], [60, 96, 5.2], [62, 108, 4.2]], M.pants, { part: 'near' });
      p.poly([52, 116, 56, 107, 67, 105, 68, G, 50, G], M.boot, { part: 'nearBoot', bevel: 2 });

      // Верх подан к герою, как у хищника перед броском.
      p.pose({ dy: 3, rot: -0.08 - 0.05 * wind, px: 52, py: 78 }, () => {
        // Дальняя рука протянута к герою: длинные бледные пальцы с когтями; в броске хватает.
        const [fx, fy] = mixPt([19, 60], [28, 54], [2, 50], wind, strike);
        p.chain([[42, 44 + up, 5], [32, 54 + up, 4.2], [fx + 4, fy + up, 3.4]], M.coat, { part: 'farArm', tone: -0.16 });
        p.ellipse(fx + 4, fy + up, 3.6, 3.2, M.cravat, { part: 'farCuff', tone: -0.2 });
        p.ellipse(fx, fy + up, 3, 2.6, M.skin, { part: 'farHand', tone: -0.1 });
        for (let k = 0; k < 4; k++) {
          const y = fy + up - 2.4 + k * 1.6;
          const curl = 2 * wind - 1.5 * strike;
          p.chain([[fx - 1, y, 0.9], [fx - 6, y - 1 + k * 0.6 + curl, 0.7], [fx - 9, y + 1.5 + k * 0.4 + curl * 1.4, 0.5]], M.skin, { part: 'farFingers', tone: -0.12 });
          p.px(fx - 9.5, y + 2 + k * 0.4 + curl * 1.4, '#2a1a24');
        }

        // Камзол цвета запёкшейся крови, жилет, белое жабо, серебряная брошь.
        p.ellipse(52, 72, 12, 8, M.coat);
        p.ellipse(52, 55 + up, 14, 17, M.coat);
        p.poly([45, 40 + up, 57, 40 + up, 57, 76, 47, 76], M.vest, { paint: true });
        p.line(51, 46 + up, 51, 74, '#1a0810');
        for (const y of [52, 60, 68]) p.px(49, y + up * (y < 60 ? 1 : 0.5), '#b8bcc4');
        p.poly([44, 37 + up, 55, 36 + up, 54, 48 + up, 48, 50 + up], M.cravat, { part: 'jabot', bevel: 1.5 });
        p.ellipse(50, 41 + up, 2.2, 2, M.vest, { part: 'brooch' });
        p.px(49.5, 40.5 + up, '#ff6a7a');

        // Высокий стоячий воротник за головой — чёрный снаружи, багровый внутри: рама для лица.
        p.poly([36, 40 + up, 38, 20 + up, 46, 28 + up, 54, 26 + up, 62, 14 + up, 68, 38 + up, 60, 42 + up], M.cape, { part: 'collar', bevel: 2 });
        p.poly([40, 38 + up, 41, 25 + up, 47, 31 + up, 55, 29 + up, 61, 20 + up, 64, 37 + up], M.lining, { part: 'collar', paint: true });

        // Голова: узкое бледное лицо, волосы гладко назад с мысом, острое ухо; глаза горят красным из-под надбровий.
        p.limb(50, 40 + up, 4.6, 47, 32 + up, 4.6, M.skin, { part: 'neck', tone: -0.15 });
        const open = 2 * wind + 4 * strike + 4 * hurt;
        p.pose({ dx: p.snap(-3 * strike + 2 * hurt - 1), dy: up + p.snap(-1 * wind), rot: -0.06 + 0.18 * wind - 0.16 * strike + 0.28 * hurt, px: 48, py: 32 }, () => {
          // Затылок — волосы.
          p.ellipse(51, 17, 9.5, 10.5, M.hair, { part: 'hairBack' });
          // Лицо: высокий лоб, острые скулы, клин подбородка.
          p.ellipse(45, 19.5, 8, 10.5, M.skin, { part: 'head' });
          p.poly([37, 22, 44, 24.5, 49, 24, 47, 29, 41.5, 33.5, 38.5, 31.5], M.skin, { part: 'head' });
          // Тени: глубокие глазницы по отдельности и впалая щека — лицо узкое, а не маска.
          p.ellipse(39, 19.5, 2.8, 1.8, M.shade, { part: 'head', paint: true });
          p.ellipse(44.5, 19.8, 2.4, 1.8, M.shade, { part: 'head', paint: true });
          p.poly([44.5, 24, 48, 23.5, 46.5, 28, 44, 27.5], M.shade, { part: 'head', paint: true, tone: 0.15 });
          // Волосы: гладко назад, мыс на лбу.
          p.poly([36, 15, 38, 9, 45, 5.5, 54, 7, 59, 14, 58, 24, 54, 27, 52, 16, 47, 12, 43, 15, 40, 12.5], M.hair, { part: 'hair', bevel: 2 });
          // Острое ухо.
          p.poly([51, 21, 59 + hurt, 14 + hurt, 55, 26], M.skin, { part: 'ear', bevel: 1.2, tone: -0.1 });
          // Нос — тонкий и острый.
          p.limb(37.5, 20, 1.5, 34.5, 25, 1.3, M.skin, { part: 'nose', lift: 2 });
          if (open > 1) {
            p.poly([35, 27.5, 42, 27.5, 41, 28.5 + open, 36, 28.5 + open * 0.8], M.mouth, { part: 'mouth', bevel: 0.6 });
            p.poly([35.5, 27.5, 37.3, 27.5, 36.4, 31 + open * 0.3], M.fang, { part: 'fang' });
            p.poly([39.5, 27.5, 41.3, 27.5, 40.4, 31 + open * 0.3], M.fang, { part: 'fang' });
          } else {
            p.line(35, 28, 41, 28.5, '#2a0a12');
            p.px(36, 29, '#f0ecf4');
            p.px(40, 29.5, '#f0ecf4');
          }
          if (hurt < 0.4) {
            const eye = wind > 0.4 ? '#ffb0b0' : VAMP_EYE;
            p.glow(39.5, 19.5, 5 + 2 * pulse, VAMP_EYE, 0.25 + 0.25 * pulse + 0.2 * wind);
            p.line(37, 19.5, 40, 20, eye);
            p.line(43.5, 20, 45.5, 19.5, '#c01a2a');
          } else p.line(37, 20, 41, 20, '#2a0a12');
          // Брови вразлёт — злой излом к переносице.
          p.line(36, 17.5, 41, 18.5 + wind, '#1a1622');
          p.line(43, 18.5 + wind, 47, 17, '#1a1622');
        });

        // Ближняя рука — справа, поверх: держит край плаща у подбородка; на замахе вскидывает его крылом.
        const [hx, hy] = mixPt([60, 38], [70, 16], [58, 34], wind, strike);
        const [ex, ey] = mixPt([72, 50], [80, 34], [70, 46], wind, strike);
        const pts = WING_REST.map((r, k) => {
          const [mx, my] = mixPt(r, WING_WIND[k], WING_HIT[k], wind, strike);
          const f = k / (WING_REST.length - 1);
          return [hx + mx + hem * f * 1.5 + 6 * hurt * f, hy + up + my - 4 * hurt * f] as [number, number];
        });
        // Крыло плаща: от кисти вниз зубчатым краем нетопыря; подкладка видна по кромке.
        const tip = pts[pts.length - 1];
        const wing = [hx - 2, hy + up + 2, ...pts.flatMap(([x, y]) => [x, y]), ...scallop(56, tip[0], tip[1], 2, 5, hem2).slice(2), 58, (hy + up + tip[1]) / 2];
        p.poly(wing, M.cape, { part: 'capeFront', bevel: 3 });
        p.chain(pts.map(([x, y]) => [x - 1.5, y, 1.4] as [number, number, number]), M.lining, { part: 'capeFront', paint: true });
        // Раскрытое крыло повёрнуто к нам изнанкой: багровая подкладка и складки-«пальцы» нетопыря от кисти к зубцам.
        const open2 = Math.max(wind, 0.6 * strike);
        if (open2 > 0.25) {
          const inner = pts.slice(1).map(([x, y]) => [hx + (x - hx) * 0.82, hy + up + (y - hy - up) * 0.82] as [number, number]);
          p.poly([hx, hy + up + 2, ...inner.flatMap(([x, y]) => [x, y]), 60, (hy + up + tip[1]) / 2], M.lining, { part: 'capeFront', paint: true });
        }
        for (const [x, y] of pts.slice(2)) p.line(hx + 1, hy + up + 2, x - 2, y, open2 > 0.25 ? '#4a0a14' : '#0e0a12');
        p.limb(62, 44 + up, 5, ex, ey + up, 4.4, M.coat, { part: 'nearArm' });
        p.limb(ex, ey + up, 4.4, hx + 2, hy + up + 1, 3.6, M.coat, { part: 'nearArm' });
        p.ellipse(hx + 2, hy + up + 2, 3.2, 2.6, M.cravat, { part: 'nearCuff', tone: -0.1 });
        p.ellipse(hx, hy + up, 3, 2.8, M.skin, { part: 'nearHand' });
        // Серебряная застёжка плаща на плече.
        p.ellipse(62, 40 + up, 2.6, 2.4, M.silver, { part: 'clasp' });
        p.px(61.5, 40 + up, '#2a1c24');
      });
    });
  },
};

// ─── Ведьма ─────────────────────────────────────────────────────────────────

const WITCH = {
  robe: { base: '#34203e', shag: 0.22, tex: { kind: 'stripes', scale: 2.6, amp: 0.12, angle: 1.5 } } as Mat,
  shawl: { base: '#4a3a34', shag: 0.3, tex: { kind: 'noise', scale: 2, amp: 0.14 } } as Mat,
  hat: { base: '#1c1a24', tex: { kind: 'noise', scale: 2.5, amp: 0.1 } } as Mat,
  band: { base: '#4a2a3a' } as Mat,
  skin: { base: '#a2aa8a', tex: { kind: 'noise', scale: 2.5, amp: 0.1 } } as Mat,
  hair: { base: '#b8b4ac', shag: 0.35, tex: { kind: 'stripes', scale: 1.2, amp: 0.2, angle: 1.4 } } as Mat,
  wood: { base: '#4a3424', tex: { kind: 'bark', scale: 1.5, amp: 0.18, angle: 1.57 } } as Mat,
  bone: { base: '#c8b898', ramp: BONE_RAMP } as Mat,
  glass: { base: '#3a6a4a', shine: 0.9, dither: 0 } as Mat,
  brew: { base: '#7cf0a0', glow: true, dither: 0, ramp: ['#2a9a5a', '#3ab86e', '#52d486', '#7cf0a0', '#c0ffd8'] } as Mat,
  nail: { base: '#2a2420', dither: 0 } as Mat,
};
const BREW = '#7cf0a0';

export const witch: Model = {
  id: 'witch',
  w: 84,
  h: 112,
  ground: 110,
  // Искра в кадре контакта летит к герою на 26 единиц левее рамки.
  pad: 40,
  draw(p: Painter) {
    const M = WITCH;
    const G = 110;
    // Искра: замах — кисть отведена к груди, между пальцами разгорается зелёный огонь; выпад — толчок ладонью,
    // искра летит к герою. Урон: отбросило, шляпа съехала, посох качнуло, зелье плеснуло.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.2, 2);
    const hem = p.wave(1, 0.4);
    const fl = p.wave(4, 0.3);
    // Зелье в склянке на посохе булькает: пузырь поднимается раз в полтакта.
    const bub = (p.t * 2) % 1;

    p.pose({ dx: -4 * strike + 2 * wind + 5 * hurt, rot: 0.03 * wind - 0.04 * strike + 0.06 * hurt, px: 42, py: G }, () => {
      p.shadow(42, 24, 3);
      // Носок сапога из-под подола — шаг к герою.
      p.poly([14, G - 4, 24, G - 5, 26, G, 12, G], M.hat, { part: 'boot', bevel: 1 });
      // Балахон колоколом: подол рваный, спереди вынесен шагом, сзади волочится.
      p.poly([30, 46 + up, 50, 46 + up, 56, 70, 62 + hem, 96, 66 + hem, G, 58, 104, 52 + hem * 0.6, G, 44, 104, 38, G, 30, 105, 22, G, 16, 104, 20, 90, 26, 70], M.robe, { bevel: 7 });

      // Горб и ссутуленный верх подан к герою.
      p.pose({ dy: 3, rot: -0.14, px: 42, py: 76 }, () => {
        // Дальняя рука тянется к герою: когтистая кисть, между пальцами зелёная искра.
        const [fx, fy] = mixPt([16, 58], [26, 50], [6, 52], wind, strike);
        p.limb(34, 48 + up, 4.4, 24, 56 + up, 5, M.robe, { part: 'farArm', tone: -0.14 });
        p.poly([17, 52 + up, 26, 50 + up, 28, 60 + up, 19, 61 + up], M.robe, { part: 'farArm', bevel: 2, tone: -0.2 });
        p.ellipse(fx + 1, fy + up, 2.8, 2.4, M.skin, { part: 'farHand', tone: -0.1 });
        for (let k = 0; k < 3; k++) {
          const y = fy + up - 1.5 + k * 1.8;
          p.chain([[fx, y, 0.8], [fx - 4, y - 1.5 + k, 0.6], [fx - 6, y + k * 0.4, 0.5]], M.skin, { part: 'fingers', tone: -0.1 });
          p.px(fx - 6.5, y + k * 0.4 + 0.5, '#2a2420');
        }
        const spark = 1 + 0.6 * wind - 0.8 * strike - 0.8 * hurt;
        if (spark > 0.3) {
          p.glow(fx - 3, fy + up - 5, 5 * spark + 1.5 * fl, BREW, 0.35 + 0.2 * wind);
          p.disc(fx - 3, fy + up - 5, 1.4 * spark, '#c0ffd8');
          for (let k = 0; k < 3; k++) {
            const a = 2 * Math.PI * (k / 3 + p.t * 2);
            p.px(fx - 3 + 4 * spark * Math.cos(a), fy + up - 5 + 3 * spark * Math.sin(a), k % 2 ? BREW : '#e0ffe8');
          }
        }

        // Туловище под балахоном, горб; драная шаль на плечах.
        p.ellipse(42, 58 + up, 12, 14, M.robe);
        p.ellipse(48, 48 + up, 11, 9, M.robe);
        p.poly([36, 46 + up, 44, 41 + up, 54, 42 + up, 59, 50 + up, 55, 58 + up, 48, 55 + up, 41, 58 + up], M.shawl, { part: 'shawl', bevel: 3 });
        // Пояс с амулетами: косточки и мешочек.
        p.limb(30, 70, 1.4, 54, 70, 1.4, M.band, { part: 'belt' });
        p.chain([[36, 71, 1], [36 + hem * 0.3, 76, 1.2]], M.bone, { part: 'charm' });
        p.ellipse(46, 75, 3, 3.6, M.band, { part: 'pouch', tone: -0.1 });
        // Склянка с зельем на поясе: булькает, пузырь поднимается раз в полтакта.
        const sw2 = 0.6 * p.wave(1, 0.5) + 2 * hurt;
        p.ellipse(38 + sw2, 79, 3.4, 3.8, M.glass, { part: 'flask' });
        p.limb(38 + sw2, 75, 1.2, 38 + sw2, 73, 1.2, M.glass, { part: 'flask' });
        p.ellipse(38 + sw2, 80, 2.4, 2.4, M.brew, { part: 'flaskBrew' });
        p.px(38 + sw2 + (bub < 0.5 ? 0 : 1), 81 - 3 * bub, '#e0ffe8');

        // Голова склонена: крючковатый нос, острый подбородок, седые космы, зелёные глаза из-под полей шляпы.
        p.pose({ dx: p.snap(-5 + 2 * hurt), dy: up + p.snap(-1 - 2 * hurt), rot: -0.04 + 0.26 * hurt, px: 40, py: 42 }, () => {
          // Космы за спиной и по плечам.
          for (let k = 0; k < 4; k++) p.chain([[40 + k * 3, 26 + k, 2.4], [45 + k * 3, 36 + k * 2 + hem * 0.5, 2], [47 + k * 2.5, 48 + k * 2 + hem, 1.2]], M.hair, { part: `hair${k}`, tone: -0.04 * k });
          p.ellipse(36, 31, 8.5, 9, M.skin, { part: 'head' });
          p.ellipse(31, 35, 5, 5.5, M.skin, { part: 'head' });
          // Крючковатый нос с бородавкой, острый подбородок навстречу носу.
          p.chain([[31, 29, 2.2], [26, 32, 1.8], [23, 35, 1.2], [24, 37, 0.8]], M.skin, { part: 'nose', lift: 3 });
          p.ellipse(28.5, 40, 2.8, 2.4, M.skin, { part: 'chin', lift: 2, tone: -0.05 });
          p.px(27, 32, '#4a5a3a');
          // Под полями — тень, из неё светят жёлтые глаза.
          p.poly([27, 26, 44, 25, 44, 31, 38, 31.5, 33, 30.5, 28, 29.5], M.hat, { part: 'head', paint: true, tone: 0.15 });
          // Космы спереди, по щеке.
          p.chain([[40, 27, 1.6], [41, 36, 1.4], [42 + hem * 0.3, 44, 1]], M.hair, { part: 'hairFront' });
          if (strike > 0.4 || hurt > 0.4) p.block(28, 36, 2, 2, '#1a1418');
          else p.line(27, 36.5, 31, 36, '#2a2420');
          if (hurt < 0.4) {
            const eye = wind > 0.4 ? '#ffffc0' : '#e8f070';
            p.glow(31, 28.5, 4, '#e8f070', 0.3 + 0.2 * wind);
            p.line(30, 28.5, 32, 29, eye);
            p.px(36, 29, '#b8c050');
          } else p.line(29, 29, 32, 29, '#2a2420');
          // Шляпа: широкие обвисшие поля, высокая тулья с заломом, кончик загнут назад.
          p.pose({ rot: 0.25 * hurt - 0.04 * wind, px: 38, py: 22 }, () => {
            p.poly([20, 25, 28, 21, 40, 20, 52, 21, 60, 26, 52, 27, 40, 25, 28, 27], M.hat, { part: 'brim', bevel: 1.5 });
            p.poly([29, 22, 47, 22, 46, 16, 47, 10, 50, 5, 57 + hem * 0.5, 1 + hem * 0.3, 53, 5, 50, 10, 45, 14, 34, 17], M.hat, { part: 'hat', bevel: 2.5 });
            p.poly([29, 21, 47, 21, 46.5, 18, 30, 18.5], M.band, { part: 'hat', paint: true });
            p.px(38, 19.5, '#c8b898');
          });
        });

        // Ближняя рука — справа, поверх: кривой посох, на навершии привязана склянка с зельем и костяные обереги.
        p.pose({ rot: 0.06 * wind - 0.08 * strike + 0.12 * hurt, px: 58, py: 60 + up }, () => {
          p.chain([[60, G, 1.4], [58, 80, 1.6], [60, 60, 1.7], [57, 40, 1.6], [59, 26, 1.5], [55, 20, 1.3]], M.wood, { part: 'staff' });
          // Навершие — птичий череп и костяные обереги на верёвках.
          const sw = p.wave(1, 0.5) + 2 * hurt;
          p.ellipse(56, 18, 3, 2.6, M.bone, { part: 'staffSkull' });
          p.poly([53.5, 18, 48, 20, 54, 20.5], M.bone, { part: 'staffSkull' });
          p.px(55.5, 17.5, '#1a1418');
          p.chain([[58, 22, 0.9], [60 - sw * 0.5, 30, 0.9]], M.bone, { part: 'charm2' });
          p.ellipse(60 - sw * 0.5, 31, 1.6, 1.4, M.bone, { part: 'charm2' });
          p.chain([[54, 22, 0.8], [52 + sw * 0.4, 28, 0.8]], M.bone, { part: 'charm3' });
        });
        p.limb(50, 48 + up, 4.6, 56, 58 + up, 5.4, M.robe, { part: 'nearArm' });
        p.poly([52, 54 + up, 61, 53 + up, 63, 64 + up, 54, 64 + up], M.robe, { part: 'nearArm', bevel: 2, tone: -0.1 });
        p.ellipse(59, 61 + up, 2.8, 2.8, M.skin, { part: 'hand' });
      });

      // Искра летит к герою в кадрах 4–5.
      if (p.clip === 'attack' && p.u > 0.4 && p.u < 0.62) {
        const x = p.u < 0.5 ? 0 : -18;
        p.glow(x, 50, 7, BREW, 0.45);
        p.disc(x, 50, 2.6, '#c0ffd8');
        p.line(x + 3, 50, x + 12, 51, '#7cf0a080');
      }
    });
  },
};

// ─── Могильный слизень и слизнёнок ──────────────────────────────────────────

const SLIME = {
  body: { base: '#56674a', shine: 0.5, tex: { kind: 'noise', scale: 3, amp: 0.12 } } as Mat,
  deep: { base: '#2e3a2c', tex: { kind: 'noise', scale: 2.5, amp: 0.12 } } as Mat,
  soil: { base: '#3a2e26', tex: { kind: 'noise', scale: 1.5, amp: 0.25 } } as Mat,
  bone: { base: '#b8aa88', ramp: BONE_RAMP } as Mat,
  skull: { base: '#b8a888', ramp: ['#3a3a2e', '#6a6a52', '#9a9676', '#bfb894', '#ddd6b4'], tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  glob: { base: '#6e8a5c', shine: 0.8, dither: 0 } as Mat,
  eyeball: { base: '#d8d4c0', shine: 0.8, dither: 0 } as Mat,
};
/** Болотный огонёк в глазницах утопленного черепа — отсвет трупного газа. */
const MIASMA = '#b8f07a';

export const graveSlime: Model = {
  id: 'grave_slime',
  w: 92,
  h: 68,
  ground: 66,
  // Плевок в кадре контакта — на 24 единицы левее рамки.
  pad: 34,
  draw(p: Painter) {
    const M = SLIME;
    const G = 66;
    // Плевок: замах — масса вздымается и отклоняется назад, в утробе вспыхивает огонёк; выпад — горб бросается к герою
    // и выплёвывает ком слизи. Урон: массу расплющило, брызги, череп тонет глубже.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const sq = 1 - 0.22 * hurt + 0.1 * wind;
    const w1 = p.wave(1, 0.1), w2 = p.wave(2, 0.4);
    const sink = p.snap(1.2 * p.wave(1, 0.6)) + 4 * hurt;
    const cx = p.snap(-10 * strike + 4 * wind + 3 * hurt), cy = p.snap(-3 * wind + 4 * strike + 6 * hurt);
    const Y = (y: number): number => G - (G - y) * sq;

    p.pose({ dx: -2 * strike + 2 * hurt, px: 46, py: G }, () => {
      p.shadow(46, 40, 3, 0.45);
      // Масса слизи: разлита по полу, горбится к герою — одна поверхность; на верхушке комья могильной земли.
      p.ellipse(46, Y(58), 40, 8 * sq, M.body);
      p.ellipse(48 + cx * 0.2, Y(44 + cy * 0.2) + p.snap(0.8 * w1), 28, (19 + 0.8 * w2) * sq, M.body);
      p.ellipse(64, Y(46) + p.snap(0.8 * w2), 16, 12 * sq, M.body);
      p.ellipse(36 + cx * 0.6, Y(30 + cy * 0.6), 18, 16 * sq, M.body);
      p.ellipse(34 + cx, Y(18 + cy) + p.snap(0.6 * w2), 11, 11 * sq, M.body);
      // Утроба: тёмная глубина, в ней видны проглоченные кости.
      p.ellipse(44 + cx * 0.4, Y(42 + cy * 0.4), 20, 13 * sq, M.deep, { paint: true });
      p.ellipse(34 + cx * 0.8, Y(26 + cy * 0.8), 9, 8 * sq, M.deep, { paint: true });
      // Могильная земля налипла на спину пятнами.
      for (const [x, y, rx, ry] of [[40, 12, 5, 2.5], [50, 26, 6, 3], [62, 36, 5, 2.5], [74, 46, 4, 2]] as const) {
        const f = x < 50 ? 0.8 : 0.3;
        p.ellipse(x + cx * f, Y(y + cy * f), rx, ry, M.soil, { paint: true });
      }
      // Бедро и рёбра торчат из бока — не переварил.
      p.pose({ rot: -0.5, px: 58, py: Y(40) }, () => bone(p, 52 + cx * 0.3, Y(40) + cy * 0.3, 1.5, 68 + cx * 0.3, Y(40) + cy * 0.3, 1.3, M.bone, { part: 'femur', tone: -0.1 }));
      for (let k = 0; k < 3; k++) {
        const bx = 62 + k * 6 + cx * 0.15, by = Y(50 + k) + cy * 0.15;
        p.chain([[bx, by + 6, 1.1], [bx - 3, by, 1], [bx - 1, by - 5, 0.8]], M.bone, { part: 'ribs', tone: -0.12 * k });
      }
      // Череп утопленника в гребне: глазницы тлеют трупным огнём, челюсть затянуло слизью.
      const sx = 32 + cx * 0.95, sy = Y(24 + cy * 0.95) + sink;
      p.scope(0.75, sx, sy, () => skull(p, M.skull, 'skull', 1 + 2 * strike + 2 * hurt, hurt > 0.4 ? '' : wind > 0.4 ? '#f0ffc0' : MIASMA, 0.35 + 0.2 * wind));
      p.ellipse(sx - 1, sy + 9, 9, 3, M.body, { part: 'skull', paint: true });
      // Блики мокрой поверхности.
      p.line(22 + cx * 0.8, Y(22 + cy * 0.8), 26 + cx * 0.8, Y(16 + cy * 0.8), '#b4c8a0');
      p.line(58, Y(30), 64, Y(29), '#9ac088');

      // Пузырь поднимается сквозь массу и лопается.
      if (p.clip === 'idle') {
        const b = p.t > 0.3 && p.t < 0.55 ? (p.t - 0.3) / 0.25 : -1;
        if (b >= 0 && b < 0.8) p.disc(56, Y(26) - b * 3, 1 + 1.5 * b, '#8aa076');
        else if (b >= 0.8) for (const [ox, oy] of [[-3, -1], [3, -1], [0, -3]]) p.px(56 + ox, Y(22) + oy, '#b4c8a0');
        // Капли стекают с гребня.
        for (const [x, y0, ph] of [[22, 30, 0.15], [44, 54, 0.6]] as const) {
          const f = (p.t + ph) % 1;
          if (f < 0.55) p.line(x, y0, x, y0 + f * 8, '#6e8a5c');
          else if (f < 0.8) p.px(x, y0 + 5 + (f - 0.55) * 24, '#56674a');
        }
      }
      if (hurt > 0.2) for (const [ox, oy] of [[-14, -12], [0, -18], [16, -12], [30, -16]]) p.disc(44 + ox * (1.5 - hurt), 34 + oy * hurt, 1.3, '#6e8a5c');
      // Ком слизи летит к герою в кадрах 4–5.
      if (p.clip === 'attack' && p.u > 0.4 && p.u < 0.62) {
        const x = p.u < 0.5 ? 6 : -16;
        p.chain([[x + 10, 20, 1.4], [x + 5, 21, 2.8], [x, 21, 4.2]], M.glob, { part: 'glob' });
        p.px(x - 1.5, 19.5, '#e0f0d0');
      }
    });
  },
};

export const slimelet: Model = {
  id: 'slimelet',
  w: 48,
  h: 40,
  ground: 38,
  pad: 30,
  draw(p: Painter) {
    const M = SLIME;
    const G = 38;
    // Плевок: сжаться и выплюнуть каплю; урон — расплющило, глаз зажмурен.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const sq = 1 - 0.25 * hurt + 0.12 * wind - 0.08 * strike;
    const w1 = p.wave(2, 0.2);
    const cx = p.snap(-5 * strike + 2 * wind);
    const Y = (y: number): number => G - (G - y) * sq;

    p.pose({ dx: -2 * strike + 2 * hurt, px: 24, py: G }, () => {
      p.shadow(24, 16, 2, 0.4);
      p.ellipse(24, Y(32), 17, 6 * sq, M.body);
      p.ellipse(23 + cx * 0.5, Y(22) + p.snap(0.6 * w1), 13, 13 * sq, M.body);
      p.ellipse(20 + cx, Y(12), 8, 7 * sq, M.body);
      p.ellipse(24 + cx * 0.5, Y(25), 8, 6 * sq, M.deep, { paint: true });
      // Внутри плавают косточки пальцев и глаз — зрачок смотрит на героя.
      p.limb(26 + cx * 0.4, Y(28), 0.9, 32 + cx * 0.4, Y(25), 0.8, M.bone, { part: 'fingerBone', tone: -0.1 });
      p.limb(20 + cx * 0.4, Y(30), 0.8, 24 + cx * 0.4, Y(31), 0.8, M.bone, { part: 'fingerBone', tone: -0.15 });
      const ex = 19 + cx * 0.8, ey = Y(17) + p.snap(0.5 * w1);
      p.ellipse(ex, ey, 4, 3.6, M.eyeball, { part: 'eye' });
      if (hurt > 0.4) p.line(ex - 3, ey, ex + 3, ey, '#2a2a20');
      else {
        p.disc(ex - 1.5, ey + 0.3, 1.6, '#8a2020');
        p.px(ex - 1.5, ey, '#140c0c');
        p.px(ex + 1.5, ey - 1.5, '#ffffff');
        p.line(ex + 1, ey + 2, ex + 3, ey + 1, '#c85050');
      }
      p.line(12 + cx, Y(14), 14 + cx, Y(10), '#b4c8a0');
      if (hurt > 0.2) for (const [ox, oy] of [[-8, -8], [4, -12], [12, -6]]) p.px(24 + ox * (1.5 - hurt), 20 + oy * hurt, '#6e8a5c');
      if (p.clip === 'attack' && p.u > 0.4 && p.u < 0.62) {
        const x = p.u < 0.5 ? 4 : -14;
        p.chain([[x + 6, 18, 1], [x + 3, 18.5, 1.8], [x, 18.5, 2.6]], M.glob, { part: 'glob' });
      }
    });
  },
};

// ─── Некромант ──────────────────────────────────────────────────────────────

const NECRO = {
  robe: { base: '#2c1c44', shag: 0.2, tex: { kind: 'stripes', scale: 3, amp: 0.1, angle: 1.45 } } as Mat,
  hood: { base: '#3e2660', tex: { kind: 'noise', scale: 3, amp: 0.1 } } as Mat,
  shade: { base: '#140c1e' } as Mat,
  skin: { base: '#b4a8bc', tex: { kind: 'noise', scale: 3, amp: 0.08 } } as Mat,
  belt: { base: '#3a2418' } as Mat,
  wood: { base: '#4a3222', tex: { kind: 'bark', scale: 1.5, amp: 0.18, angle: 1.57 } } as Mat,
  bone: { base: '#c8b898', ramp: SKULL_RAMP, tex: { kind: 'noise', scale: 2, amp: 0.1 } } as Mat,
  boot: { base: '#241814' } as Mat,
};
const NECRO_EYE = '#7cf0a0';

export const necromancer: Model = {
  id: 'necromancer',
  w: 88,
  h: 124,
  ground: 122,
  // Посох в замахе поднимается над капюшоном, пламя на черепе — ещё выше.
  pad: 44,
  draw(p: Painter) {
    const M = NECRO;
    const G = 122;
    // Тёмная стрела: замах — посох вскинут, огонь на черепе взвивается, ладонь отведена к груди; выпад — толчок ладонью
    // к герою, из неё срывается сгусток (полёт рисует общий слой снарядов). Урон: отбросило, капюшон назад, огонь сбит.
    const { wind, strike } = p.attack();
    const hurt = p.hurt();
    const up = -p.bob(1.2, 2);
    const hem = 1.4 * p.wave(1, 0.2);
    const fl = p.wave(4, 0.1), fl2 = p.wave(5, 0.6);
    const pulse = (p.wave(2, 0.3) + 1) / 2;

    p.pose({ dx: -4 * strike + 2 * wind + 5 * hurt, rot: 0.03 * wind - 0.04 * strike + 0.05 * hurt, px: 46, py: G }, () => {
      p.shadow(46, 26, 3);
      p.poly([14, G - 4, 24, G - 5, 27, G, 12, G], M.boot, { part: 'boot', bevel: 1 });
      // Ряса колоколом, подол изодран в клочья.
      p.poly([32, 48 + up, 56, 48 + up, 62, 76, 68 + hem, 104, 70 + hem, 116, 64, 112, 60 + hem * 0.6, G, 52, 114, 44, G, 36, 113, 30, G, 22, 114, 16 + hem * 0.3, G, 18, 106, 26, 76], M.robe, { bevel: 8 });

      p.pose({ dy: 2, rot: -0.08, px: 46, py: 80 }, () => {
        // Дальняя рука протянута к герою ладонью вверх, на ладони пляшет зелёный огонь; в замахе прижата к груди.
        const [fx, fy] = mixPt([15, 64], [28, 58], [4, 58], wind, strike);
        p.limb(36, 52 + up, 5, 26, 60 + up, 6, M.robe, { part: 'farArm', tone: -0.14 });
        p.poly([fx + 3, 58 + up, fx + 12, 55 + up, fx + 14, 67 + up, fx + 5, 68 + up], M.robe, { part: 'farArm', bevel: 2, tone: -0.2 });
        p.ellipse(fx, fy + up, 3.4, 2.4, M.skin, { part: 'farHand', tone: -0.1 });
        for (let k = 0; k < 3; k++) p.chain([[fx - 1, fy + up - 1 + k, 0.7], [fx - 5, fy + up - 2.5 + k * 1.2, 0.5]], M.skin, { part: 'farFingers', tone: -0.1 });
        const palm = (1 + 0.4 * wind + 0.5 * strike - 0.6 * hurt) * (1 + 0.1 * fl2);
        p.glow(fx, fy + up - 6, 6 + 3 * wind + 4 * strike, NECRO_EYE, 0.3 + 0.2 * wind + 0.2 * strike);
        flame(p, GRAVE_FIRE, fx, fy + up - 1, 2.6, 9 * palm, 1.1 * fl, 2 * hurt - 3 * strike, 'Palm');

        // Туловище: пояс с черепом-пряжкой, амулет-череп на цепи.
        p.ellipse(46, 62 + up, 13, 15, M.robe);
        p.poly([32, 72, 60, 72, 60, 77, 32, 77], M.belt, { paint: true });
        p.ellipse(46, 74.5, 2.6, 2.4, M.bone, { part: 'buckle' });
        p.px(45.5, 74.5, '#1a1418');
        p.line(40, 50 + up, 45, 58 + up, '#8a8070');
        p.line(52, 50 + up, 47, 58 + up, '#8a8070');
        p.scope(0.34, 46, 61 + up, () => skull(p, M.bone, 'amulet', 0, hurt > 0.4 ? '' : NECRO_EYE, 0.2));

        // Капюшон: лицо в глубокой тени — впалые щёки, крючковатый нос, горящие зелёные глаза.
        p.pose({ dx: p.snap(1.5 * hurt), dy: p.snap(2 - 2 * hurt), rot: -0.1 + 0.24 * hurt - 0.04 * strike, px: 44, py: 46 + up }, () => {
          p.poly([26, 50 + up, 34, 40 + up, 54, 40 + up, 62, 52 + up, 54, 56 + up, 44, 54 + up, 32, 57 + up], M.hood, { part: 'mantle', bevel: 4 });
          p.ellipse(44, 30 + up, 13, 14, M.hood, { part: 'hood' });
          p.poly([46, 18 + up, 60 + hurt * 3, 14 + up + hurt * 4, 56, 30 + up], M.hood, { part: 'hood', bevel: 3 });
          p.ellipse(37, 33 + up, 8, 10, M.shade, { part: 'hood', paint: true });
          p.ellipse(35, 36 + up, 5, 7, M.skin, { part: 'face', tone: -0.25 });
          p.limb(33, 33 + up, 1.7, 29.5, 37.5 + up, 1.5, M.skin, { part: 'nose', lift: 3, tone: -0.15 });
          p.ellipse(33, 42 + up, 2.6, 2, M.skin, { part: 'face', tone: -0.2, lift: 1 });
          p.ellipse(37, 38 + up, 2, 2.6, M.shade, { part: 'face', paint: true, tone: 0.3 });
          if (strike > 0.4 || hurt > 0.4) p.block(31, 40 + up, 2, 1, '#1a0e14');
          else p.line(31, 40 + up, 34, 40 + up, '#2a1a22');
          if (hurt < 0.4) {
            const eye = wind > 0.4 ? '#e0ffe8' : NECRO_EYE;
            p.glow(34, 32 + up, 4, NECRO_EYE, 0.3 + 0.2 * pulse + 0.2 * wind);
            p.line(32, 32 + up, 34, 32.5 + up, eye);
            p.px(37.5, 32.5 + up, '#3aa866');
          }
          p.line(31, 30 + up, 36, 31 + up + wind, '#140c1e');
        });

        // Ближняя рука — справа, поверх туловища: корявый посох, на навершии череп в зелёном огне.
        p.pose({ dy: -5 * wind, rot: 0.18 * wind - 0.2 * strike + 0.12 * hurt, px: 62, py: 64 + up }, () => {
          p.chain([[64, G, 1.4], [62, 96, 1.7], [63, 72, 1.8], [61, 48, 1.8], [63, 30, 1.7]], M.wood, { part: 'staff' });
          // Корни-когти держат череп.
          p.chain([[63, 30, 1.2], [58, 26, 1], [57, 20, 0.8]], M.wood, { part: 'staffClaw' });
          p.chain([[63, 30, 1.2], [68, 26, 1], [69, 20, 0.8]], M.wood, { part: 'staffClaw' });
          const big = 1 + 0.5 * wind + 0.2 * strike - 0.5 * hurt;
          p.glow(62, 12, 10 + 2 * fl + 5 * wind, NECRO_EYE, 0.25 + 0.15 * pulse + 0.2 * wind);
          flame(p, GRAVE_FIRE, 60, 20, 4.2, (14 + 2 * fl) * big, 1.4 * fl2, 2 * hurt - 2 * strike, 'S1');
          flame(p, GRAVE_FIRE, 66, 21, 3.4, (10 + 2 * fl2) * big, 1.2 * fl, 1 + 2 * hurt, 'S2');
          p.scope(0.62, 63, 24, () => skull(p, M.bone, 'staffSkull', 0.5, hurt > 0.4 ? '' : '#e0ffe8', 0.1));
          // Искры колдовского огня.
          for (let k = 0; k < 3; k++) {
            const f = (p.t * 2 + k / 3) % 1;
            p.px(62 + 4 * Math.sin((f + k) * 7), 8 - f * 12, f < 0.5 ? '#c8ffd8' : '#1e9a52');
          }
        });
        p.limb(54, 52 + up, 5.2, 60, 62 + up, 6.2, M.robe, { part: 'nearArm' });
        p.poly([56, 58 + up, 66, 57 + up, 68, 70 + up, 58, 70 + up], M.robe, { part: 'nearArm', bevel: 2, tone: -0.1 });
        p.ellipse(63, 64 + up, 3, 3, M.skin, { part: 'hand', tone: -0.1 });
        if (strike > 0.5) {
          p.glow(fx - 6, fy + up - 3, 10, NECRO_EYE, 0.45);
          p.disc(fx - 5, fy + up - 3, 3, '#e0ffe8');
        }
      });
    });
  },
};

// ─── Лич и развоплощённый лич ───────────────────────────────────────────────

interface LichLook {
  robe: Mat; trim: Mat; bone: Mat; gold: Mat; wood: Mat; gem: Mat;
  /** Цвет глаз и колдовского света. */
  eye: string;
  /** Дух: без ног и посоха — низ мантии тает туманом, тело парит и светится. */
  ghost: boolean;
}

const LICH: LichLook = {
  robe: { base: '#2a1846', shag: 0.2, tex: { kind: 'stripes', scale: 3, amp: 0.1, angle: 1.45 } },
  trim: { base: '#1a0e2c' },
  bone: { base: '#c0bcb4', ramp: ['#4a4450', '#7c7680', '#aaa6a4', '#d0ccc2', '#ece8da'], tex: { kind: 'noise', scale: 2, amp: 0.12 } },
  gold: { base: '#b89030', shine: 0.9, dither: 0 },
  wood: { base: '#2e2438', tex: { kind: 'stripes', scale: 1.6, amp: 0.12 } },
  gem: { base: '#a45af0', glow: true, dither: 0, ramp: ['#6a1ab0', '#8a3ee0', '#a45af0', '#c088fa', '#e8d0ff'] },
  eye: '#5cf0ff',
  ghost: false,
};

const LICH_GHOST: LichLook = {
  robe: { base: '#3a2262', shag: 0.3, ramp: ['#1c1034', '#2c1a4c', '#3e2664', '#56367e', '#7250a0'], tex: { kind: 'stripes', scale: 3, amp: 0.12, angle: 1.45 } },
  trim: { base: '#1c1034' },
  bone: { base: '#9ca4c8', glow: true, dither: 0.6, ramp: ['#4a4a78', '#5e6290', '#767eaa', '#9098c4', '#aab2da'], tex: { kind: 'noise', scale: 2, amp: 0.1 } },
  gold: { base: '#7a62b0', shine: 0.6, dither: 0 },
  wood: { base: '#3a2a5a' },
  gem: { base: '#c088fa', glow: true, dither: 0, ramp: ['#8a3ee0', '#a45af0', '#c088fa', '#dcb8ff', '#f4e8ff'] },
  eye: '#d8a8ff',
  ghost: true,
};

function lichFigure(p: Painter, L: LichLook): void {
  const G = 136;
  // Тёмный луч: замах — костяная длань вскинута, в ней разгорается пурпурный огонь, посох поднят; выпад — длань
  // толкает огонь к герою (полёт рисует общий слой снарядов). Урон: отбросило, корону сбило набок, глаза мигнули.
  const { wind, strike } = p.attack();
  const hurt = p.hurt();
  const up = -p.bob(1.2, 2);
  // Дух парит: всё тело качается, низ мантии тает.
  const hover = L.ghost ? -p.bob(2.5, 1, 0.25) - 6 : 0;
  const hem = 1.5 * p.wave(1, 0.2);
  const fl = p.wave(4, 0.3), fl2 = p.wave(5, 0.1);
  const pulse = (p.wave(2, 0.2) + 1) / 2;

  p.pose({ dx: -5 * strike + 2 * wind + 6 * hurt, dy: hover, rot: 0.03 * wind - 0.05 * strike + 0.06 * hurt, px: 50, py: G }, () => {
    if (L.ghost) p.shadow(50, 22, 2.5, 0.18);
    else p.shadow(50, 30, 3.5);
    if (L.ghost) {
      // Вместо подола — пурпурный туман клочьями.
      const sw = p.wave(1, 0.1), sw2 = p.wave(1, 0.45);
      p.film([22, 104, 78, 104, 88 + sw * 2, 116, 96 + sw * 3, 126, 78, 120, 64 + sw2 * 2, 130, 52, 120, 40 + sw2, 128, 30, 118, 18, 124], '#8a2be240', true);
      p.film([30, 108, 70, 108, 76 + sw2 * 2, 118, 60, 116, 48, 122], '#e0c8ff30', true);
      p.poly([30, 56 + up, 70, 56 + up, 76, 80, 82 + hem, 104, 72, 112, 64 + hem, 106, 56, 114, 48, 106, 40, 114, 32 + hem, 106, 24, 110, 26, 80], L.robe, { bevel: 8 });
    } else {
      // Мантия до пола: подол рваный, золотая кайма потемнела; сзади шлейф.
      p.poly([32, 56 + up, 70, 56 + up, 76, 84, 84 + hem, 116, 90 + hem, 130, 80, 126, 74 + hem * 0.6, G, 64, 128, 54, G, 44, 128, 34, G, 26, 128, 18 + hem * 0.3, G, 20, 118, 26, 84], L.robe, { bevel: 9 });
    }

    p.pose({ dy: 2, rot: -0.06, px: 50, py: 90 }, () => {
      // Дальняя рука — костяная длань поднята к герою, над ней пурпурный огонь.
      const [fx, fy] = mixPt([16, 58], [26, 44], [6, 54], wind, strike);
      p.limb(38, 56 + up, 5.4, 26, 62 + up, 6.4, L.robe, { part: 'farArm', tone: -0.14 });
      p.poly([18, 58 + up, 28, 55 + up, 31, 68 + up, 20, 70 + up], L.robe, { part: 'farArm', bevel: 2, tone: -0.2 });
      bone(p, 22, 63 + up, 1.6, fx + 2, fy + up + 1, 1.4, L.bone, { part: 'farWrist', tone: -0.1 });
      p.ellipse(fx, fy + up, 2.8, 2.4, L.bone, { part: 'farHand', tone: -0.1 });
      for (let k = 0; k < 4; k++) p.chain([[fx - 1, fy + up - 1.5 + k * 1.2, 0.7], [fx - 5, fy + up - 4 + k * 1.6, 0.6], [fx - 6, fy + up - 7 + k * 2, 0.5]], L.bone, { part: 'farFingers', tone: -0.12 });
      const palm = (1 + 0.5 * wind + 0.4 * strike - 0.6 * hurt) * (1 + 0.1 * fl2);
      p.glow(fx - 2, fy + up - 8, 7 + 3 * wind, '#a45af0', 0.3 + 0.2 * wind + 0.2 * strike);
      flame(p, LICH_FIRE, fx - 2, fy + up - 4, 3, 10 * palm, 1.2 * fl, 2 * hurt - 3 * strike, 'Palm');

      // Грудь: мантия, наперсная цепь, филактерия — пурпурный камень в золотой оправе, в нём бьётся душа.
      p.ellipse(50, 70 + up, 15, 17, L.robe);
      p.poly([44, 56 + up, 56, 56 + up, 58, 100, 42, 100], L.trim, { paint: true });
      p.limb(44, 56 + up, 0.9, 42, 100, 0.9, L.gold, { paint: true });
      p.limb(56, 56 + up, 0.9, 58, 100, 0.9, L.gold, { paint: true });
      p.chain([[40, 58 + up, 0.9], [46, 66 + up, 0.9], [54, 66 + up, 0.9], [60, 58 + up, 0.9]], L.gold, { part: 'chain' });
      p.poly([50, 64 + up, 54.5, 69 + up, 50, 75 + up, 45.5, 69 + up], L.gold, { part: 'phylactery', bevel: 1 });
      p.poly([50, 66 + up, 53, 69 + up, 50, 73 + up, 47, 69 + up], L.gem, { part: 'phylacteryGem', bevel: 1 });
      p.glow(50, 69 + up, 5 + 2 * pulse, '#a45af0', 0.2 + 0.15 * pulse);

      // Высокий воротник-ожерелье из костяных шипов за черепом.
      const spikes = [[32, 52, 28, 40], [58, 48, 62, 34], [66, 52, 74, 42]];
      for (const [x, y, tx, ty] of spikes) p.poly([x - 3, y + up, tx, ty + up, x + 3, y + up], L.bone, { part: 'collarSpikes', bevel: 1, tone: -0.1 });
      p.poly([28, 58 + up, 38, 48 + up, 62, 48 + up, 72, 58 + up, 62, 62 + up, 50, 60 + up, 38, 62 + up], L.robe, { part: 'mantle', bevel: 4 });
      p.line(30, 58 + up, 50, 61 + up, '#b89030');
      p.line(50, 61 + up, 70, 58 + up, '#b89030');

      // Голова — череп в золотой короне с зубцами; глазницы горят голубым, как у поднятых им скелетов.
      const open = 1 + 1.5 * wind + 3 * strike + 4 * hurt;
      p.pose({ dx: p.snap(-1.5 * strike + 2 * hurt), dy: up + p.snap(-hurt), rot: -0.06 + 0.04 * wind - 0.04 * strike + 0.24 * hurt, px: 48, py: 48 }, () => {
        p.scope(1.35, 46, 34, () => {
          const eye = hurt > 0.4 ? '' : wind > 0.4 || strike > 0.4 ? '#ffffff' : L.eye;
          skull(p, L.bone, 'head', open, eye, 0.35 + 0.25 * pulse + 0.2 * wind);
          // Корона: обруч с зубцами, самоцвет спереди; от удара съезжает набок.
          // Корона сидит на темени, лоб открыт: свет падает на свод черепа.
          p.pose({ rot: 0.3 * hurt, px: 4, py: -10 }, () => {
            p.poly([-6, -9, -5, -15, -2, -11.5, 0.5, -18, 3.5, -12, 7, -18.5, 9.5, -12, 12, -15.5, 12, -8, 3, -7.5, -5, -8], L.gold, { part: 'crown', bevel: 1.2 });
            p.poly([-6.5, -10, 12.5, -9.5, 12.5, -7.5, -6.5, -8], L.gold, { part: 'crownBand', bevel: 0.8, tone: -0.1 });
            p.px(3, -9, L.ghost ? '#f4e8ff' : '#5cf0ff');
          });
        });
      });

      if (!L.ghost) {
        // Ближняя рука — справа, поверх: посох с рогатым навершием и пурпурной сферой.
        p.pose({ dy: -4 * wind, rot: 0.14 * wind - 0.16 * strike + 0.12 * hurt, px: 68, py: 72 + up }, () => {
          p.chain([[70, G, 1.5], [68, 104, 1.8], [69, 72, 1.9], [67, 44, 1.9], [69, 28, 1.8]], L.wood, { part: 'staff' });
          p.chain([[69, 30, 1.4], [62, 24, 1.2], [60, 16, 1], [63, 12, 0.7]], L.bone, { part: 'staffHorn' });
          p.chain([[69, 30, 1.4], [76, 24, 1.2], [78, 16, 1], [75, 12, 0.7]], L.bone, { part: 'staffHorn' });
          p.glow(69, 20, 9 + 2 * fl + 4 * wind, '#a45af0', 0.25 + 0.15 * pulse + 0.2 * wind);
          p.ellipse(69, 21, 4.2 + 0.5 * pulse, 4.2 + 0.5 * pulse, L.gem, { part: 'orb' });
          p.px(67.5, 19.5, '#fcf6ff');
        });
      }
      p.limb(62, 58 + up, 5.6, 68, 70 + up, 6.4, L.robe, { part: 'nearArm' });
      p.poly([63, 64 + up, 74, 63 + up, 76, 78 + up, 64, 78 + up], L.robe, { part: 'nearArm', bevel: 2, tone: -0.1 });
      p.line(64, 78 + up, 76, 78 + up, '#b89030');
      if (L.ghost) {
        // Без посоха: ближняя кисть сжата в кулак у бедра, пальцы-кости.
        p.ellipse(70, 80 + up, 2.8, 2.6, L.bone, { part: 'hand' });
      } else p.ellipse(69, 73 + up, 3, 3, L.bone, { part: 'hand' });
      if (strike > 0.5) {
        p.glow(fx - 8, fy + up - 6, 10, '#a45af0', 0.45);
        p.disc(fx - 7, fy + up - 6, 3, '#ecd8ff');
      }
    });
  });
}

export const lich: Model = {
  id: 'lich',
  w: 100,
  h: 140,
  ground: 138,
  // Пламя над дланью в замахе и сфера посоха — выше короны; в кадре контакта длань выброшена к герою.
  pad: 44,
  draw: (p) => p.pose({ dy: 2 }, () => lichFigure(p, LICH)),
};

export const lichGhost: Model = {
  id: 'lich_ghost',
  w: 100,
  h: 140,
  ground: 138,
  pad: 44,
  flies: true,
  draw: (p) => p.pose({ dy: 2 }, () => lichFigure(p, LICH_GHOST)),
};

/** Призрак парит: с зазором до пола и волосами над макушкой рамка выше тела — фигура уменьшена до таблицы. */
export const ghost = scaleModel(ghostBase, 0.9);
/** Гуль в низкой стойке перед прыжком: рост до шипов на горбу — по таблице, поэтому модель крупнее лепки. */
export const ghoul = scaleModel(ghoulBase, 1.1);
/** Скелеты одного роста: крупный череп поднял макушку, поэтому обе лепки чуть уменьшены до таблицы. */
export const skeletonWarrior = scaleModel(skeletonWarriorBase, 0.965);
export const skeletonArcher = scaleModel(skeletonArcherBase, 0.955);

export const CRYPT_MODELS: Record<string, Model> = { skeleton_warrior: skeletonWarrior, skeleton_archer: skeletonArcher, bone_golem: boneGolem, ghost, wraith, ghoul, mummy, vampire, witch, grave_slime: graveSlime, slimelet, necromancer, lich, lich_ghost: lichGhost };
