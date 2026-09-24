import type { AiCtx, EnemyAction, EnemyDef, EnemyEffect, EnemyRole, FxSpec, HeadStyle, PriorityRule, SpriteSpec } from '../engine/types';
import { MAX_ENEMIES } from '../engine/types';
import { GNOME_STEAL } from '../engine/loot';

function act(id: string, name: string, effects: EnemyEffect[], condition?: (ctx: AiCtx) => boolean): EnemyAction {
  return condition ? { id, name, effects, condition } : { id, name, effects };
}

/** Приём с отдельным эффектом: снаряд, взмах клинком, склянка. Без fx враг просто наскакивает. */
const withFx = (fx: FxSpec, a: EnemyAction): EnemyAction => ({ ...a, fx });

const hasRoom = (ctx: AiCtx) => ctx.enemies.length < MAX_ENEMIES;
const countKind = (ctx: AiCtx, defId: string) => ctx.enemies.filter((e) => e.defId === defId).length;
const minions = (ctx: AiCtx) => ctx.enemies.filter((e) => e.uid !== ctx.self.uid).length;
/** Фазы босса: правила первой фазы гаснут после перехода (`EnemyDef.phase2`), правила второй — загораются. */
const p1 = (ctx: AiCtx) => ctx.self.phase < 2;
const p2 = (ctx: AiCtx) => ctx.self.phase >= 2;
/** Шипы складываются и не спадают — второй раз щетиниться нельзя, иначе защита растёт без предела. */
const noThorns = (ctx: AiCtx) => !ctx.self.statuses.some((st) => st.id === 'thorns');
/** Уклонение тоже складывается и висит до конца боя: вешать второй заряд поверх непотраченного нельзя — враг станет неубиваемым. */
const noDodge = (ctx: AiCtx) => !ctx.self.statuses.some((st) => st.id === 'dodge');

// ─── Роли и реакции (v0.46) ─────────────────────────────────────────────────
// План §5.2–5.3: у рядовых и элит ИИ «по приоритету» — сначала реакции на состояние боя, иначе свой круг.
// Реакции — проверки сборок: очищение против ран, пробой против блока, «прислушаться» против тени, мана-пиявка
// против заклинаний. Не отменяют сборку, а заставляют выбирать момент: у каждой — условие, видимое в намерении.

/** Роль врага: значок, название и правило позиции — для плитки в бою и бестиария. */
export const ROLE_INFO: Record<EnemyRole, { name: string; icon: string; rule: string }> = {
  guard: { name: 'Страж', icon: '⛨', rule: 'Стоит впереди. Первый удар героя за ход по соседу за его спиной принимает на себя' },
  brute: { name: 'Громила', icon: '⚒', rule: 'Стоит впереди. Оказавшись первым в ряду, раз за бой получает Силу' },
  swarm: { name: 'Рой', icon: '⁂', rule: 'Стоит впереди, берёт числом: удары по всем против него ценнее' },
  shooter: { name: 'Стрелок', icon: '➶', rule: `Стоит сзади. Первым в ряду бьёт в упор вполсилы и после хода отходит назад` },
  caster: { name: 'Заклинатель', icon: '✧', rule: 'Стоит сзади: проклятия и чары. Крюк вытащит его вперёд, под ближний удар' },
  support: { name: 'Поддержка', icon: '✚', rule: 'Стоит сзади. Лечит и усиливает только соседей по ряду' },
};

/** Условие реакции с подписью: подпись идёт в подсказку намерения («Реакция: у героя Блок ≥ 6») и в бестиарий. */
type Cond = ((ctx: AiCtx) => boolean) & { label: string };
const cond = (label: string, fn: (ctx: AiCtx) => boolean): Cond => Object.assign(fn, { label });

const dotsOn = (c: AiCtx['self']) => c.statuses.filter((st) => st.id === 'bleed' || st.id === 'burn' || st.id === 'poison').reduce((a, st) => a + st.value, 0);
/** Герой держит блок: сквозной удар или проклятие вместо обычного удара. Смотрится после своего хода — остаток блока героя. */
const heroBlock = (n: number) => cond(`у героя Блок ≥ ${n}`, (ctx) => ctx.hero.block >= n);
/** Герой в тени: «прислушаться» снимет её до удара. */
const heroHidden = cond('герой в тени', (ctx) => ctx.hero.statuses.some((st) => st.id === 'stealth'));
/** На себе ран на N и больше за ход — очиститься (раз за бой). */
const selfDots = (n: number) => cond(`на нём раны ≥ ${n}`, (ctx) => dotsOn(ctx.self) >= n);
/** У героя маны не меньше N — вытянуть. */
const heroMana = (n: number) => cond(`у героя MP ≥ ${n}`, (ctx) => ctx.hero.mp >= n);
/** Герой ниже трети HP — добить. */
const heroLow = cond('герой ниже трети HP', (ctx) => ctx.hero.hp * 3 < ctx.hero.maxHp);
/** Остался один на поле из тех, кто начинал бой вместе. */
const alone = cond('остался один', (ctx) => ctx.enemies.length === 1 && ctx.lineup > 1);
/** Сосед по ряду ранен вполовину — поддержка лечит или прикрывает его. */
const neighborHurt = cond('сосед ниже половины HP', (ctx) => {
  const i = ctx.enemies.indexOf(ctx.self);
  return [ctx.enemies[i - 1], ctx.enemies[i + 1]].some((x) => x && x.hp * 2 < x.maxHp);
});
/** Сам ниже половины HP. */
const selfHalf = cond('сам ниже половины HP', (ctx) => ctx.self.hp * 2 < ctx.self.maxHp);

/** Правило реакции: приём, условие и ограничения. Подпись условия уходит в подсказку. */
const when = (action: string, c: Cond, opts: { cooldown?: number; maxUses?: number } = {}): PriorityRule => ({ action, when: c, hint: c.label, ...opts });

/** ИИ «по приоритету»: реакции по порядку, иначе круг. */
const priority = (rules: PriorityRule[], order: string[]): EnemyDef['ai'] => ({ type: 'priority', rules, order });

/** Замах: пустой ход с предупреждением, следом обязательный тяжёлый удар `strike`. */
function windup(id: string, name: string, strike: EnemyAction): EnemyAction[] {
  return [{ id, name, effects: [{ type: 'none' }], next: strike.id }, strike];
}

// Готовые реакции: числа у каждого врага свои, смысл один.
/** Очищение ран с блоком — против Крови, Огня и Яда. Раз за бой. */
const lick = (name: string, block: number): EnemyAction => act('lick', name, [{ type: 'cleanse' }, { type: 'block', amount: block }]);
/** Пробой — сквозной удар против игры через блок. */
const crack = (name: string, amount: number): EnemyAction => act('crack', name, [{ type: 'attack', amount, pierce: true }]);
/** «Прислушаться» — снять тень и ударить. */
const listen = (name: string, amount: number): EnemyAction => act('listen', name, [{ type: 'reveal' }, { type: 'attack', amount }]);
/** Добивание раненого героя. */
const finish = (name: string, amount: number): EnemyAction => act('finish', name, [{ type: 'attack', amount }]);
/** Ярость последнего: остался один — Сила себе. */
const lastStand = (name: string, amount: number): EnemyAction => act('last', name, [{ type: 'buffStr', amount, target: 'self' }]);

const blob = (outline: string, body: string, shade: string, eye: string, size?: number): SpriteSpec => ({
  type: 'blob',
  palette: { outline, body, shade, eye },
  ...(size ? { size } : {}),
});

const humanoid = (head: HeadStyle, palette: Record<string, string>): SpriteSpec => ({
  type: 'humanoid',
  head,
  palette: { o: '#1b1b2a', e: '#1a1a1a', ...palette },
});

const list: EnemyDef[] = [
  // ═══ Лес ═════════════════════════════════════════════════════════════════
  {
    id: 'wolf',
    name: 'Волк',
    hp: 12,
    location: 'forest',
    rank: 'normal',
    role: 'swarm',
    actions: [
      act('bite', 'Укус', [{ type: 'attack', amount: 5 }]),
      act('howl', 'Вой', [{ type: 'buffStr', amount: 2, target: 'kind' }]),
      lastStand('Вой одиночки', 2),
    ],
    ai: priority([when('last', alone, { maxUses: 1 })], ['bite', 'bite', 'howl']),
    sprite: blob('#1a1a22', '#8a8f98', '#5d626b', '#ffd166'),
  },
  {
    id: 'boar',
    name: 'Кабан',
    hp: 18,
    location: 'forest',
    rank: 'normal',
    role: 'brute',
    actions: [
      act('ram', 'Таран', [{ type: 'attack', amount: 7 }]),
      act('bristle', 'Щетина', [{ type: 'block', amount: 5 }]),
      ...windup('dig', 'Рыть копытом', act('charge', 'Разгон', [{ type: 'attack', amount: 12 }])),
    ],
    ai: { type: 'cycle', order: ['ram', 'bristle', 'dig'] },
    sprite: blob('#1f1410', '#7a5230', '#4e3320', '#f4a261'),
  },
  {
    id: 'rat',
    name: 'Крыса',
    hp: 7,
    location: 'forest',
    rank: 'normal',
    role: 'swarm',
    actions: [
      act('bite', 'Укус', [{ type: 'attack', amount: 3 }]),
      act('gnaw', 'Грызть', [
        { type: 'attack', amount: 2 },
        { type: 'debuff', status: 'bleed', value: 1, turns: 2 },
      ]),
    ],
    ai: { type: 'cycle', order: ['bite', 'gnaw'] },
    sprite: blob('#1a1410', '#6b5a4a', '#4a3a2a', '#ff5555', 14),
  },
  {
    id: 'bat',
    name: 'Летучая мышь',
    hp: 9,
    location: 'forest',
    rank: 'normal',
    role: 'swarm',
    actions: [act('bite', 'Укус', [{ type: 'attack', amount: 4, drain: true }]), act('flutter', 'Порхание', [{ type: 'dodge', value: 1 }], noDodge)],
    ai: { type: 'cycle', order: ['bite', 'flutter'] },
    sprite: blob('#0e0e16', '#3a3a5a', '#2a2a3a', '#ffd166', 14),
  },
  {
    id: 'spider',
    name: 'Паук',
    hp: 14,
    location: 'forest',
    rank: 'normal',
    role: 'caster',
    actions: [
      act('bite', 'Ядовитый укус', [
        { type: 'attack', amount: 4 },
        { type: 'debuff', status: 'poison', value: 1, turns: 3 },
      ]),
      act('web', 'Паутина', [{ type: 'debuff', status: 'exhaust', value: 1, turns: 1 }]),
      // Нити дрожат под невидимым шагом: против игры из тени.
      listen('Чуткие нити', 4),
    ],
    ai: priority([when('listen', heroHidden)], ['bite', 'web', 'bite']),
    sprite: blob('#0a0a0a', '#2a2a2a', '#1a1a1a', '#ff3b3b'),
  },
  {
    id: 'bandit_archer',
    name: 'Бандит-лучник',
    hp: 10,
    location: 'forest',
    rank: 'normal',
    role: 'shooter',
    actions: [
      act('shoot', 'Выстрел', [{ type: 'attack', amount: 4 }]),
      act('aim', 'Прицел', [{ type: 'buffStr', amount: 4, target: 'self' }]),
      finish('Стрела в сердце', 7),
    ],
    ai: priority([when('finish', heroLow, { cooldown: 2 })], ['shoot', 'aim', 'shoot']),
    sprite: humanoid('hood', { s: '#e8b88a', h: '#3a5a40', b: '#6b4f3a', l: '#2f2f2f', w: '#a67c52' }),
  },
  {
    id: 'cutthroat',
    name: 'Головорез',
    hp: 16,
    location: 'forest',
    rank: 'normal',
    role: 'brute',
    actions: [
      act('strike', 'Удар', [{ type: 'attack', amount: 6 }]),
      act('double', 'Двойной удар', [{ type: 'attack', amount: 3, hits: 2 }]),
      act('guard', 'Блок', [{ type: 'block', amount: 4 }]),
      // Нож в щель между щитом и рукой: против игры через блок.
      crack('Удар в щель', 6),
    ],
    ai: priority([when('crack', heroBlock(5), { cooldown: 2 })], ['strike', 'double', 'guard']),
    sprite: humanoid('bare', { s: '#d9a06b', h: '#2b1d14', b: '#8b1e2d', l: '#2f2f2f', w: '#c0c0c0' }),
  },
  {
    id: 'goblin',
    name: 'Гоблин',
    hp: 12,
    location: 'forest',
    rank: 'normal',
    role: 'guard',
    actions: [
      act('sneak', 'Подлый удар', [{ type: 'attack', amount: 5, pierce: true }]),
      act('poke', 'Тычок', [{ type: 'attack', amount: 3 }]),
      act('guard', 'Щит', [{ type: 'block', amount: 3 }]),
      lick('Подорожник', 3),
    ],
    ai: priority([when('lick', selfDots(3), { maxUses: 1 })], ['sneak', 'poke', 'guard']),
    sprite: humanoid('bare', { s: '#6fa35a', h: '#3a5a2a', b: '#6b4f3a', l: '#3a2a1a', w: '#c0c0c0' }),
  },
  {
    id: 'goblin_shaman',
    name: 'Гоблин-шаман',
    hp: 14,
    location: 'forest',
    rank: 'normal',
    role: 'support',
    actions: [
      act('curse', 'Сглаз', [{ type: 'debuff', status: 'vulnerable', value: 1, turns: 2 }]),
      act('mend', 'Знахарство', [{ type: 'heal', amount: 5, target: 'neighbors' }]),
      act('spark', 'Искра', [{ type: 'attack', amount: 5 }]),
    ],
    ai: priority([when('mend', neighborHurt, { cooldown: 2 })], ['curse', 'spark']),
    sprite: humanoid('hat', { s: '#6fa35a', h: '#7a3a7a', b: '#4a2a5a', l: '#2a1a3a', w: '#c9a227' }),
  },
  {
    id: 'bear',
    name: 'Медведь',
    hp: 35,
    location: 'forest',
    rank: 'elite',
    role: 'brute',
    actions: [
      act('paw', 'Лапа', [{ type: 'attack', amount: 9 }]),
      act('roar', 'Рёв', [
        { type: 'buffStr', amount: 3, target: 'self' },
        { type: 'block', amount: 6 },
      ]),
      ...windup('rear', 'Встаёт на дыбы', act('maul', 'Сокрушить', [{ type: 'attack', amount: 16 }])),
      // Проверка сборки: сорвать щит — против игры через блок.
      crack('Сорвать щит', 9),
    ],
    ai: priority([when('crack', heroBlock(8), { cooldown: 2 })], ['paw', 'roar', 'paw', 'rear']),
    sprite: blob('#14100c', '#5b3a1e', '#3b2613', '#ffe8a3', 20),
  },
  {
    id: 'troll',
    name: 'Тролль',
    hp: 42,
    location: 'forest',
    rank: 'elite',
    role: 'brute',
    actions: [
      act('club', 'Дубина', [{ type: 'attack', amount: 10 }]),
      act('regen', 'Регенерация', [
        { type: 'heal', amount: 7, target: 'self' },
        { type: 'block', amount: 5 },
      ]),
      act('stomp', 'Топот', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      // Проверка сборки: шкура затягивается — раны снимаются разом, против Крови, Огня и Яда.
      lick('Шкура затягивается', 8),
    ],
    ai: priority([when('lick', selfDots(4), { maxUses: 1 }), when('regen', selfHalf, { cooldown: 3 })], ['club', 'club', 'stomp']),
    sprite: blob('#0f1a10', '#5a7a4a', '#3a5a2a', '#ffe8a3', 22),
  },
  {
    id: 'alpha_wolf',
    name: 'Вожак стаи',
    hp: 55,
    location: 'forest',
    rank: 'boss',
    actions: [
      act('bite', 'Укус', [{ type: 'attack', amount: 8 }]),
      act('rend', 'Разрывание', [{ type: 'attack', amount: 5, hits: 2 }]),
      act('rend2', 'Бешеное разрывание', [{ type: 'attack', amount: 4, hits: 3 }]),
      act('howl', 'Вой', [{ type: 'summon', enemyId: 'wolf', count: 1 }]),
      act('rage', 'Ярость', [{ type: 'buffStr', amount: 1, target: 'self' }]), // +2 → +1 в v0.36 (решение пользователя): во второй фазе каждая Ярость считается трижды
    ],
    // Первая половина боя — про стаю, вторая — вожак щетинится и рвёт сам: три удара вместо двух, каждая Ярость считается трижды. HP 60 → 55.
    phase2: {
      atHp: 0.5,
      name: 'Раненый зверь',
      aura: '#ff3b3b',
      effects: [{ type: 'block', amount: 6 }],
      // Ход перехода: щетинится — Шипы 6 на два своих хода прикрывают свободный ход героя.
      guard: [{ type: 'thorns', amount: 6, turns: 2 }],
    },
    ai: {
      type: 'boss',
      rules: [
        { action: 'bite', weight: 3 },
        { action: 'rend', weight: 2, condition: p1 },
        { action: 'rend2', weight: 2, condition: p2 },
        { action: 'howl', weight: 3, condition: (ctx) => p1(ctx) && hasRoom(ctx) && countKind(ctx, 'wolf') < 2 },
        { action: 'rage', weight: 2, cooldown: 3, maxUses: 3 },
      ],
    },
    sprite: blob('#111118', '#4a4e69', '#2b2d42', '#ff3b3b', 24),
  },

  // ═══ Склеп ═══════════════════════════════════════════════════════════════
  {
    id: 'skeleton_warrior',
    name: 'Скелет-воин',
    hp: 30,
    location: 'crypt',
    rank: 'normal',
    role: 'guard',
    actions: [
      act('slash', 'Удар мечом', [{ type: 'attack', amount: 9 }]),
      act('guard', 'Блок', [{ type: 'block', amount: 8 }]),
      ...windup('raise', 'Заносит меч', act('cleave', 'Раскол', [{ type: 'attack', amount: 15 }])),
    ],
    ai: { type: 'cycle', order: ['slash', 'guard', 'raise'] },
    sprite: humanoid('skull', { o: '#22222a', e: '#111111', s: '#e8e4d8', h: '#e8e4d8', b: '#bdb7a6', l: '#d8d3c5', w: '#9aa0a6' }),
  },
  {
    id: 'skeleton_archer',
    name: 'Скелет-лучник',
    hp: 20,
    location: 'crypt',
    rank: 'normal',
    role: 'shooter',
    actions: [
      withFx({ kind: 'arrow', color: '#b9b0a0' }, act('shoot', 'Выстрел', [{ type: 'attack', amount: 6 }])),
      withFx({ kind: 'arrow', color: '#b9b0a0' }, act('volley', 'Залп', [{ type: 'attack', amount: 4, hits: 2 }])),
      withFx({ kind: 'arrow', color: '#b9b0a0' }, finish('Стрела в спину', 9)),
    ],
    ai: priority([when('finish', heroLow, { cooldown: 2 })], ['shoot', 'volley']),
    sprite: humanoid('skull', { o: '#22222a', e: '#111111', s: '#e8e4d8', h: '#e8e4d8', b: '#8f8a7c', l: '#d8d3c5', w: '#a67c52' }),
  },
  {
    id: 'ghost',
    name: 'Призрак',
    hp: 24,
    location: 'crypt',
    rank: 'normal',
    role: 'caster',
    actions: [
      act('touch', 'Касание', [
        { type: 'attack', amount: 7 },
        { type: 'debuff', status: 'weak', value: 1, turns: 2 },
      ]),
      act('vanish', 'Исчезновение', [{ type: 'block', amount: 30 }]),
      // Мёртвые видят в темноте: против игры из тени.
      listen('Холод могилы', 7),
    ],
    ai: priority([when('listen', heroHidden)], ['touch', 'vanish']),
    sprite: blob('#3a4a6b', '#c9d6ff', '#8fa3d6', '#1b1f3a'),
  },
  {
    id: 'ghoul',
    name: 'Гуль',
    hp: 36,
    location: 'crypt',
    rank: 'normal',
    role: 'brute',
    actions: [
      act('bite', 'Укус', [
        { type: 'attack', amount: 8 },
        { type: 'heal', amount: 4, target: 'self' },
      ]),
      act('claws', 'Когти', [{ type: 'attack', amount: 5, hits: 2 }]),
      lick('Сожрать гниль', 6),
    ],
    ai: priority([when('lick', selfDots(4), { maxUses: 1 })], ['bite', 'claws']),
    sprite: blob('#14200f', '#7a9a5a', '#4d6b36', '#ff5555'),
  },
  {
    id: 'wraith',
    name: 'Тень',
    hp: 26,
    location: 'crypt',
    rank: 'normal',
    role: 'caster',
    actions: [
      act('blade', 'Призрачный клинок', [{ type: 'attack', amount: 8, pierce: true }]),
      act('moan', 'Стон', [
        { type: 'debuff', status: 'weak', value: 1, turns: 1 },
        { type: 'drainMp', amount: 1 },
      ]),
      // Проверка сборки: выпить чары — против заклинаний.
      act('sip', 'Выпить чары', [
        { type: 'drainMp', amount: 3 },
        { type: 'attack', amount: 4 },
      ]),
    ],
    ai: priority([when('sip', heroMana(5), { cooldown: 2 })], ['blade', 'moan']),
    sprite: blob('#2a1a3a', '#6a4a8a', '#4a2a6a', '#c9f0ff'),
  },
  {
    id: 'grave_slime',
    name: 'Могильный слизень',
    hp: 32,
    location: 'crypt',
    rank: 'normal',
    role: 'guard',
    actions: [
      act('spit', 'Плевок', [{ type: 'attack', amount: 7 }]),
      act('absorb', 'Поглощение', [{ type: 'attack', amount: 6, drain: true }]),
      lick('Переварить', 8),
    ],
    ai: priority([when('lick', selfDots(3), { maxUses: 1 })], ['spit', 'absorb']),
    onDeath: { name: 'Деление', effects: [{ type: 'summon', enemyId: 'slimelet', count: 2 }] },
    sprite: blob('#1a2a1a', '#5a8a5a', '#3a6a3a', '#1b1f3a'),
  },
  {
    id: 'slimelet',
    name: 'Слизнёнок',
    hp: 10,
    location: 'crypt',
    rank: 'normal',
    role: 'swarm',
    actions: [act('spit', 'Плевок', [{ type: 'attack', amount: 4 }])],
    ai: { type: 'cycle', order: ['spit'] },
    sprite: blob('#1a2a1a', '#7aaa7a', '#4a7a4a', '#1b1f3a', 12),
  },
  {
    id: 'mummy',
    name: 'Мумия',
    hp: 44,
    location: 'crypt',
    rank: 'normal',
    role: 'guard',
    actions: [
      act('slam', 'Удар', [{ type: 'attack', amount: 8 }]),
      act('wrap', 'Бинты', [{ type: 'block', amount: 12 }]),
      act('curse', 'Проклятие фараона', [{ type: 'debuff', status: 'weak', value: 1, turns: 3 }]),
      crack('Бинты-удавка', 8),
    ],
    ai: priority([when('crack', heroBlock(8), { cooldown: 2 })], ['slam', 'wrap', 'curse']),
    sprite: humanoid('bare', { s: '#d8ccb0', h: '#c8bc9a', b: '#c8bc9a', l: '#b8ac8a', w: '#8a7a5a' }),
  },
  {
    id: 'vampire',
    name: 'Вампир',
    hp: 42,
    location: 'crypt',
    rank: 'normal',
    role: 'brute',
    actions: [
      act('bite', 'Укус', [{ type: 'attack', amount: 9, drain: true }]),
      act('mist', 'Туман', [{ type: 'dodge', value: 1 }], noDodge),
      act('hypnosis', 'Гипноз', [
        { type: 'debuff', status: 'weak', value: 1, turns: 2 },
        { type: 'block', amount: 5 },
      ]),
      act('finish', 'Досуха', [{ type: 'attack', amount: 12, drain: true }]),
    ],
    ai: priority([when('finish', heroLow, { cooldown: 2 })], ['bite', 'mist', 'bite', 'hypnosis']),
    sprite: humanoid('bare', { s: '#e6e0f0', h: '#1a1a2a', b: '#3a0a1a', l: '#1a0a10', w: '#c0c0c0' }),
  },
  {
    id: 'witch',
    name: 'Ведьма',
    hp: 30,
    location: 'crypt',
    rank: 'normal',
    role: 'support',
    actions: [
      act('hex', 'Порча', [
        { type: 'debuff', status: 'vulnerable', value: 1, turns: 2 },
        { type: 'drainMp', amount: 2 },
      ]),
      act('spark', 'Искра', [{ type: 'attack', amount: 8 }]),
      act('potion', 'Зелье', [{ type: 'heal', amount: 10, target: 'neighbors' }]),
    ],
    ai: priority([when('potion', neighborHurt, { cooldown: 2 }), when('hex', heroMana(6), { cooldown: 3 })], ['spark', 'hex', 'spark']),
    sprite: humanoid('hat', { s: '#c9d6a0', h: '#1a1a2a', b: '#2a1a3a', l: '#1a0a20', w: '#7cf0a0' }),
  },
  {
    id: 'necromancer',
    name: 'Некромант',
    hp: 45,
    location: 'crypt',
    rank: 'elite',
    role: 'caster',
    actions: [
      withFx({ kind: 'orb', color: '#7a3fb0' }, act('bolt', 'Тёмная стрела', [{ type: 'attack', amount: 10 }])),
      act('raise', 'Поднять скелета', [{ type: 'summon', enemyId: 'skeleton_warrior', count: 1 }], (ctx) => hasRoom(ctx) && countKind(ctx, 'skeleton_warrior') < 2),
      act('curse', 'Проклятие', [
        { type: 'debuff', status: 'weak', value: 1, turns: 2 },
        { type: 'block', amount: 8 },
      ]),
      // Проверка сборки: похищение души — против заклинаний.
      withFx({ kind: 'orb', color: '#7a3fb0' }, act('sip', 'Похищение души', [
        { type: 'drainMp', amount: 4 },
        { type: 'attack', amount: 6 },
      ])),
    ],
    ai: priority([when('sip', heroMana(6), { cooldown: 3 })], ['bolt', 'raise', 'curse']),
    sprite: humanoid('hood', { o: '#1b1b2a', e: '#111111', s: '#cdbde0', h: '#2d1b4e', b: '#1e1433', l: '#120b22', w: '#7cf0a0' }),
  },
  {
    id: 'bone_golem',
    name: 'Костяной голем',
    hp: 72,
    location: 'crypt',
    rank: 'elite',
    role: 'guard',
    actions: [
      act('fist', 'Кулак', [{ type: 'attack', amount: 14 }]),
      // Проверка сборки: шипы на срок — против серии ударов. Срок, а не навсегда: иначе шипы копятся без предела (v0.23).
      act('armor', 'Костяная броня', [
        { type: 'block', amount: 16 },
        { type: 'thorns', amount: 2, turns: 3 },
      ]),
      act('crush', 'Сокрушение', [
        { type: 'attack', amount: 11 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      ...windup('lift', 'Заносит кулак', act('smash', 'Раздавить', [{ type: 'attack', amount: 24 }])),
    ],
    ai: { type: 'cycle', order: ['fist', 'armor', 'crush', 'lift'] },
    sprite: blob('#22222a', '#d8d3c5', '#a8a395', '#5cf0ff', 22),
  },
  {
    id: 'lich',
    name: 'Лич',
    hp: 75,
    location: 'crypt',
    rank: 'boss',
    actions: [
      withFx({ kind: 'orb', color: '#8a2be2' }, act('ray', 'Тёмный луч', [{ type: 'attack', amount: 12 }])),
      act('wither', 'Иссушение', [
        { type: 'attack', amount: 7 },
        { type: 'drainMp', amount: 3 },
      ]),
      act('raise_dead', 'Поднять мёртвых', [{ type: 'summon', enemyId: 'skeleton_archer', count: 2 }]),
      act('bone_shield', 'Костяной щит', [{ type: 'block', amount: 14 }]),
      act('rot', 'Гниение', [{ type: 'debuff', status: 'bleed', value: 3, turns: 3 }]),
    ],
    ai: {
      type: 'boss',
      rules: [
        { action: 'ray', weight: 3 },
        { action: 'wither', weight: 2 },
        { action: 'raise_dead', weight: 3, condition: (ctx) => hasRoom(ctx) && minions(ctx) < 2 },
        { action: 'bone_shield', weight: 2, cooldown: 3 },
        { action: 'rot', weight: 2, cooldown: 3 },
      ],
    },
    // Филактерия: тело падает, дух встаёт отдельным врагом (без свиты и щита, зато луч и слив маны злее). HP 110 → 75 + 40 у духа.
    onDeath: { name: 'Филактерия', effects: [{ type: 'summon', enemyId: 'lich_ghost', count: 1 }] },
    sprite: humanoid('crown', { o: '#0e0e16', e: '#5cf0ff', s: '#b8c0c8', h: '#d4af37', b: '#24143f', l: '#160b28', w: '#d4af37' }),
  },
  {
    id: 'lich_ghost',
    name: 'Развоплощённый лич',
    hp: 40,
    location: 'crypt',
    rank: 'boss',
    aura: '#8a2be2',
    actions: [
      withFx({ kind: 'orb', color: '#8a2be2' }, act('ray', 'Тёмный луч', [{ type: 'attack', amount: 14 }])),
      act('wither', 'Иссушение', [
        { type: 'attack', amount: 7 },
        { type: 'drainMp', amount: 5 },
      ]),
      act('rot', 'Гниение', [{ type: 'debuff', status: 'bleed', value: 3, turns: 3 }]),
    ],
    ai: {
      type: 'boss',
      rules: [
        { action: 'ray', weight: 3 },
        { action: 'wither', weight: 2 },
        { action: 'rot', weight: 2, cooldown: 3 },
      ],
    },
    sprite: humanoid('crown', { o: '#0e0e16', e: '#5cf0ff', s: '#7a8aa0', h: '#8a2be2', b: '#1a1030', l: '#120a22', w: '#8a2be2' }),
  },

  // ═══ Пещеры огня ═════════════════════════════════════════════════════════
  {
    id: 'imp',
    name: 'Имп',
    hp: 28,
    location: 'caves',
    rank: 'normal',
    role: 'caster',
    actions: [
      act('spit', 'Огненный плевок', [
        { type: 'attack', amount: 7 },
        // v0.49: Горение 3 → 2 — три Импа жгли по 9 за ход.
        { type: 'debuff', status: 'burn', value: 2, turns: 3 },
      ]),
      act('mischief', 'Проказа', [
        { type: 'debuff', status: 'weak', value: 1, turns: 2 },
        { type: 'drainMp', amount: 1 },
      ]),
      listen('Нюх беса', 7),
    ],
    ai: priority([when('listen', heroHidden)], ['spit', 'mischief']),
    sprite: blob('#2a0a0a', '#c0392b', '#7b1e1e', '#ffe066'),
  },
  {
    id: 'kamikaze_imp',
    name: 'Имп-бомбардир',
    hp: 20,
    location: 'caves',
    rank: 'normal',
    role: 'swarm',
    actions: [
      act('ignite', 'Поджог', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'burn', value: 3, turns: 2 },
      ]),
      act('boom', 'Самоподрыв', [{ type: 'selfDestruct', amount: 18, burn: 3 }]),
    ],
    ai: { type: 'cycle', order: ['ignite', 'boom'] },
    sprite: blob('#2a0a0a', '#ff5a36', '#c02a10', '#ffff88', 14),
  },
  {
    id: 'fire_bat',
    name: 'Огненная мышь',
    hp: 24,
    location: 'caves',
    rank: 'normal',
    role: 'swarm',
    actions: [
      act('bite', 'Укус', [
        { type: 'attack', amount: 8 },
        { type: 'debuff', status: 'burn', value: 2, turns: 2 },
      ]),
      act('flutter', 'Порхание', [{ type: 'dodge', value: 1 }], noDodge),
    ],
    ai: { type: 'cycle', order: ['bite', 'flutter'] },
    sprite: blob('#2a0a0a', '#7b1e1e', '#4a0a0a', '#ffe066', 14),
  },
  {
    id: 'salamander',
    name: 'Саламандра',
    hp: 52,
    location: 'caves',
    rank: 'normal',
    role: 'brute',
    actions: [
      act('breath', 'Огненное дыхание', [
        { type: 'attack', amount: 12 },
        { type: 'debuff', status: 'burn', value: 3, turns: 3 },
      ]),
      act('curl', 'Свернуться', [{ type: 'block', amount: 12 }]),
      lick('Сбросить кожу', 10),
    ],
    ai: priority([when('lick', selfDots(5), { maxUses: 1 })], ['breath', 'curl']),
    sprite: blob('#2a1200', '#e07b39', '#a34e14', '#fff2a8'),
  },
  {
    id: 'lava_slime',
    name: 'Лавовый слизень',
    hp: 52,
    location: 'caves',
    rank: 'normal',
    role: 'guard',
    actions: [
      act('spit', 'Лавовый плевок', [
        { type: 'attack', amount: 9 },
        { type: 'debuff', status: 'burn', value: 3, turns: 2 },
      ]),
      act('heat', 'Раскалиться', [{ type: 'block', amount: 10 }]),
      crack('Расплавить щит', 9),
    ],
    ai: priority([when('crack', heroBlock(10), { cooldown: 2 })], ['spit', 'heat']),
    onDeath: {
      name: 'Взрыв',
      effects: [
        { type: 'attack', amount: 8 },
        { type: 'debuff', status: 'burn', value: 2, turns: 2 },
      ],
    },
    sprite: blob('#3a0a00', '#ff7b00', '#c04000', '#fff2a8'),
  },
  {
    id: 'hellhound',
    name: 'Гончая ада',
    hp: 44,
    location: 'caves',
    rank: 'normal',
    role: 'brute',
    actions: [
      act('bite', 'Укус', [{ type: 'attack', amount: 12 }]),
      act('lunge', 'Бросок', [{ type: 'attack', amount: 8, pierce: true }]),
      act('howl', 'Вой', [{ type: 'buffStr', amount: 3, target: 'kind' }]),
      listen('Взять след', 10),
    ],
    ai: priority([when('listen', heroHidden)], ['bite', 'lunge', 'howl']),
    sprite: blob('#0a0a0a', '#3a1a1a', '#200a0a', '#ff3b00'),
  },
  {
    id: 'cultist',
    name: 'Культист',
    hp: 36,
    location: 'caves',
    rank: 'normal',
    role: 'support',
    actions: [
      act('dagger', 'Ритуальный кинжал', [{ type: 'attack', amount: 8 }]),
      act('sacrifice', 'Жертва', [
        { type: 'buffStr', amount: 2, target: 'neighbors' },
        { type: 'block', amount: 5 },
      ]),
      act('prayer', 'Молитва', [{ type: 'heal', amount: 10, target: 'neighbors' }]),
    ],
    ai: priority([when('prayer', neighborHurt, { cooldown: 2 })], ['dagger', 'sacrifice']),
    sprite: humanoid('hood', { o: '#1b1b2a', e: '#111111', s: '#e0b48a', h: '#5a0f1a', b: '#7a1a2a', l: '#2a0a10', w: '#c0c0c0' }),
  },
  {
    id: 'fire_priest',
    name: 'Огненный жрец',
    hp: 40,
    location: 'caves',
    rank: 'normal',
    role: 'support',
    actions: [
      act('bless', 'Благословение огня', [
        { type: 'buffStr', amount: 3, target: 'neighbors' },
        { type: 'block', amount: 6 },
      ]),
      act('prayer', 'Молитва', [{ type: 'heal', amount: 14, target: 'neighbors' }]),
      act('flame', 'Пламя', [{ type: 'attack', amount: 11 }]),
    ],
    ai: priority([when('prayer', neighborHurt, { cooldown: 2 })], ['bless', 'flame']),
    sprite: humanoid('hood', { s: '#e0b48a', h: '#b8860b', b: '#7a1a2a', l: '#3a0a10', w: '#ffd166' }),
  },
  {
    id: 'tormentor',
    name: 'Демон-мучитель',
    hp: 64,
    location: 'caves',
    rank: 'normal',
    role: 'brute',
    actions: [
      act('whip', 'Плеть', [{ type: 'attack', amount: 9, hits: 2 }]),
      act('torture', 'Пытка', [
        { type: 'debuff', status: 'bleed', value: 4, turns: 3 },
        { type: 'block', amount: 8 },
      ]),
      finish('Добить', 16),
    ],
    ai: priority([when('finish', heroLow, { cooldown: 2 })], ['whip', 'torture', 'whip']),
    sprite: humanoid('horns', { s: '#8b1e2d', h: '#4a0a10', b: '#2a0a10', l: '#1a0508', w: '#e0e0e0' }),
  },
  {
    id: 'golem',
    name: 'Каменный голем',
    hp: 80,
    location: 'caves',
    rank: 'normal',
    role: 'guard',
    actions: [
      act('fist', 'Кулак', [{ type: 'attack', amount: 15 }]),
      act('stone_skin', 'Каменная кожа', [{ type: 'block', amount: 16 }]),
      act('quake', 'Землетрясение', [
        { type: 'attack', amount: 11 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      ...windup('sway', 'Раскачивается', act('collapse', 'Обвал', [{ type: 'attack', amount: 26 }])),
    ],
    ai: { type: 'cycle', order: ['fist', 'stone_skin', 'quake', 'sway'] },
    sprite: blob('#1a1a1a', '#7d7d7d', '#505050', '#ff9f1c', 20),
  },
  {
    id: 'fire_elemental',
    name: 'Огненный элементаль',
    hp: 90,
    location: 'caves',
    rank: 'elite',
    role: 'caster',
    actions: [
      withFx({ kind: 'orb', color: '#ff7b00' }, act('flame', 'Пламя', [
        { type: 'attack', amount: 14 },
        { type: 'debuff', status: 'burn', value: 4, turns: 3 },
      ])),
      act('fire_shield', 'Огненный щит', [
        { type: 'block', amount: 12 },
        { type: 'thorns', amount: 2, turns: 3 },
      ]),
      ...windup('heat', 'Раскаляется', withFx({ kind: 'orb', color: '#ffd166' }, act('burst', 'Взрыв', [{ type: 'attack', amount: 22 }]))),
      // Проверка сборки: пламя пожирает раны — против Крови, Огня и Яда, раз за бой.
      lick('Пламя пожирает раны', 12),
    ],
    ai: priority([when('lick', selfDots(6), { maxUses: 1 })], ['flame', 'fire_shield', 'heat']),
    sprite: blob('#3a0a00', '#ff7b00', '#d63a00', '#ffffff', 20),
  },
  {
    id: 'minotaur',
    name: 'Минотавр',
    hp: 100,
    location: 'caves',
    rank: 'elite',
    role: 'brute',
    actions: [
      withFx({ kind: 'melee', color: '#c9ccd1' }, act('axe', 'Секира', [{ type: 'attack', amount: 18 }])),
      { ...act('windup', 'Замах', [{ type: 'block', amount: 12 }]), next: 'smash' },
      withFx({ kind: 'melee', color: '#c9ccd1' }, act('smash', 'Сокрушительный удар', [{ type: 'attack', amount: 30 }])),
      act('roar', 'Рёв', [{ type: 'buffStr', amount: 3, target: 'self' }]),
      // Проверка сборки: рога в щит — против игры через блок.
      withFx({ kind: 'melee', color: '#c9ccd1' }, crack('Рога в щит', 16)),
    ],
    ai: priority([when('crack', heroBlock(10), { cooldown: 2 })], ['axe', 'windup', 'roar']),
    sprite: humanoid('horns', { s: '#7a5230', h: '#4e3320', b: '#5b3a1e', l: '#3a2613', w: '#ede0d4' }),
  },
  {
    id: 'dragon',
    name: 'Древний дракон',
    hp: 120,
    location: 'caves',
    rank: 'boss',
    actions: [
      withFx({ kind: 'orb', color: '#ff5a1f' }, act('breath', 'Дыхание', [
        { type: 'attack', amount: 18 },
        { type: 'debuff', status: 'burn', value: 4, turns: 3 },
      ])),
      withFx({ kind: 'orb', color: '#ff5a1f' }, act('breath2', 'Пламенное дыхание', [
        { type: 'attack', amount: 18 },
        { type: 'debuff', status: 'burn', value: 5, turns: 3 },
      ])),
      act('claw', 'Коготь', [{ type: 'attack', amount: 10, hits: 2 }]),
      act('tail', 'Хвост', [
        { type: 'attack', amount: 14 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      act('takeoff', 'Взлёт', [{ type: 'invuln' }]),
      act('dive', 'Пикирование', [{ type: 'attack', amount: 30 }]),
      act('roar', 'Рёв', [{ type: 'buffStr', amount: 3, target: 'self' }]),
    ],
    // Пламенный покров: чешуя раскаляется — ближний бой стоит здоровья, дыхание жжёт сильнее, рёв больше не нужен. HP 170 → 120.
    phase2: {
      atHp: 0.5,
      name: 'Пламенный покров',
      aura: '#ff5a1f',
      // Ход перехода: покров из пламени — две атаки мимо.
      guard: [{ type: 'dodge', value: 2 }],
      effects: [
        { type: 'block', amount: 10 },
        { type: 'thorns', amount: 2 },
      ],
    },
    ai: {
      type: 'boss',
      rules: [
        { action: 'breath', weight: 3, condition: p1 },
        { action: 'breath2', weight: 3, condition: p2 },
        { action: 'claw', weight: 3 },
        { action: 'tail', weight: 2 },
        { action: 'takeoff', weight: 2, cooldown: 4, followUp: 'dive' },
        { action: 'dive', weight: 0 },
        { action: 'roar', weight: 2, maxUses: 2, condition: p1 },
      ],
    },
    sprite: blob('#0d0d10', '#8b0000', '#4a0000', '#ffd700', 24),
  },
  // ═══ Болота ══════════════════════════════════════════════════════════════
  {
    id: 'leech',
    name: 'Пиявка',
    hp: 8,
    location: 'swamp',
    rank: 'normal',
    role: 'swarm',
    actions: [act('suck', 'Присосаться', [{ type: 'attack', amount: 3, drain: true }])],
    ai: { type: 'cycle', order: ['suck'] },
    sprite: blob('#101a12', '#3f5a3a', '#26402a', '#d0d0a0', 12),
  },
  {
    id: 'mosquito_swarm',
    name: 'Комариный рой',
    hp: 10,
    location: 'swamp',
    rank: 'normal',
    role: 'swarm',
    actions: [act('bites', 'Укусы', [{ type: 'attack', amount: 2, hits: 3 }]), act('scatter', 'Рассеяться', [{ type: 'dodge', value: 1 }], noDodge)],
    ai: { type: 'cycle', order: ['bites', 'scatter'] },
    sprite: blob('#0e0e10', '#4a4a3a', '#2a2a22', '#e0e0c0', 14),
  },
  {
    id: 'toad',
    name: 'Жаба',
    hp: 16,
    location: 'swamp',
    rank: 'normal',
    role: 'guard',
    actions: [
      act('tongue', 'Язык', [{ type: 'attack', amount: 6 }]),
      act('puff', 'Раздуться', [{ type: 'block', amount: 6 }]),
      act('spit', 'Ядовитый плевок', [
        { type: 'attack', amount: 4 },
        { type: 'debuff', status: 'poison', value: 2, turns: 2 },
      ]),
      crack('Язык-хлыст', 6),
    ],
    ai: priority([when('crack', heroBlock(6), { cooldown: 2 })], ['tongue', 'puff', 'spit']),
    sprite: blob('#14200f', '#5a7a2a', '#3a5a1a', '#ffd166'),
  },
  {
    id: 'will_o_wisp',
    name: 'Болотный огонёк',
    hp: 9,
    location: 'swamp',
    rank: 'normal',
    role: 'caster',
    actions: [
      act('scorch', 'Опаление', [
        { type: 'attack', amount: 3 },
        { type: 'debuff', status: 'burn', value: 1, turns: 2 },
      ]),
      act('flicker', 'Мерцание', [{ type: 'dodge', value: 1 }], noDodge),
      act('sip', 'Выпить свет', [{ type: 'drainMp', amount: 2 }, { type: 'attack', amount: 2 }]),
    ],
    ai: priority([when('sip', heroMana(5), { cooldown: 2 })], ['scorch', 'flicker']),
    sprite: blob('#1a2a1a', '#a0ffc0', '#40c080', '#ffffff', 12),
  },
  {
    id: 'kikimora',
    name: 'Кикимора',
    hp: 14,
    location: 'swamp',
    rank: 'normal',
    role: 'support',
    actions: [
      act('morok', 'Морок', [{ type: 'debuff', status: 'vulnerable', value: 1, turns: 2 }]),
      act('scratch', 'Царапины', [{ type: 'attack', amount: 4, hits: 2 }]),
      act('cackle', 'Хохот', [
        { type: 'heal', amount: 4, target: 'neighbors' },
        { type: 'block', amount: 3 },
      ]),
      listen('Морок видит', 4),
    ],
    ai: priority([when('listen', heroHidden), when('cackle', neighborHurt, { cooldown: 2 })], ['morok', 'scratch']),
    sprite: humanoid('hood', { s: '#7a9a6a', h: '#2a3a20', b: '#3a4a2a', l: '#1a2a14', w: '#a0c090' }),
  },
  {
    id: 'drowned',
    name: 'Утопленник',
    hp: 20,
    location: 'swamp',
    rank: 'normal',
    role: 'guard',
    actions: [
      act('grip', 'Хватка', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      act('slam', 'Удар', [{ type: 'attack', amount: 5 }]),
      act('silt', 'Ил', [{ type: 'block', amount: 5 }]),
      ...windup('drag', 'Тянет на дно', act('drown', 'Утянуть', [{ type: 'attack', amount: 11 }])),
    ],
    ai: { type: 'cycle', order: ['slam', 'silt', 'grip', 'drag'] },
    sprite: humanoid('bare', { s: '#8fa8a0', h: '#3a4a40', b: '#4a5a50', l: '#2a3a30', w: '#6a7a70' }),
  },
  {
    id: 'triton',
    name: 'Тритон',
    hp: 15,
    location: 'swamp',
    rank: 'normal',
    role: 'shooter',
    actions: [
      act('trident', 'Трезубец', [{ type: 'attack', amount: 6 }]),
      act('dive', 'Нырок', [{ type: 'dodge', value: 1 }], noDodge),
      finish('Гарпун', 9),
    ],
    ai: priority([when('finish', heroLow, { cooldown: 2 })], ['trident', 'trident', 'dive']),
    sprite: humanoid('plume', { s: '#4a9a8a', h: '#2a6a5a', b: '#2a5a5a', l: '#1a3a3a', w: '#c0c0c0' }),
  },
  {
    id: 'hydra',
    name: 'Гидра',
    hp: 40,
    location: 'swamp',
    rank: 'elite',
    role: 'brute',
    actions: [
      act('maws', 'Три пасти', [{ type: 'attack', amount: 3, hits: 3 }]),
      act('regrow', 'Отрастить головы', [
        { type: 'heal', amount: 6, target: 'self' },
        { type: 'block', amount: 6 },
      ]),
      act('miasma', 'Ядовитое облако', [{ type: 'debuff', status: 'poison', value: 2, turns: 3 }]),
      // Проверка сборки: сбросить кожу — против ран.
      lick('Сбросить кожу', 6),
    ],
    ai: priority([when('lick', selfDots(4), { maxUses: 1 }), when('regrow', selfHalf, { cooldown: 3 })], ['maws', 'maws', 'miasma']),
    sprite: blob('#0f1a10', '#3a7a4a', '#245a30', '#ffd166', 22),
  },
  {
    id: 'toad_mother',
    name: 'Мать жаб',
    hp: 38,
    location: 'swamp',
    rank: 'elite',
    role: 'support',
    actions: [
      act('tongue', 'Язык', [{ type: 'attack', amount: 8 }]),
      act('puff', 'Раздуться', [{ type: 'block', amount: 8 }]),
      withFx({ kind: 'flask', color: '#7ddc5a' }, act('spit', 'Ядовитый плевок', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'poison', value: 3, turns: 2 },
      ])),
      act('spawn', 'Икра', [{ type: 'summon', enemyId: 'toad', count: 1 }], hasRoom),
      finish('Проглотить', 12),
    ],
    ai: priority([when('finish', heroLow, { cooldown: 2 })], ['tongue', 'puff', 'spit', 'spawn']),
    sprite: blob('#14200f', '#6a8a2a', '#3a5a1a', '#ff9f1c', 20),
  },
  {
    id: 'bog_horror',
    name: 'Топяной ужас',
    hp: 65,
    location: 'swamp',
    rank: 'boss',
    actions: [
      act('tentacles', 'Щупальца', [{ type: 'attack', amount: 5, hits: 2 }]),
      act('quagmire', 'Трясина', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      act('call', 'Зов пиявок', [{ type: 'summon', enemyId: 'leech', count: 2 }]),
      act('rot', 'Гниль', [{ type: 'debuff', status: 'bleed', value: 2, turns: 3 }]),
      act('rot2', 'Трупный яд', [{ type: 'debuff', status: 'poison', value: 3, turns: 3 }]),
      act('submerge', 'Погружение', [{ type: 'block', amount: 10 }]),
      act('devour', 'Пожирание', [{ type: 'attack', amount: 8, drain: true }]),
    ],
    // Всплытие: до половины прячется за блоком, потом показывает пасть — не убьёшь быстро, отлечится пожиранием. Уворот и Сила стае здесь не стоят: бот с ними падал вдвое.
    phase2: {
      atHp: 0.5,
      name: 'Всплытие',
      aura: '#7ddc5a',
      // Уходит под воду и всплывает: неуязвим до конца хода героя и на ходу перехода — ещё раз.
      effects: [{ type: 'heal', amount: 6, target: 'self' }, { type: 'invuln' }],
      guard: [{ type: 'invuln' }],
    },
    ai: {
      type: 'boss',
      rules: [
        { action: 'tentacles', weight: 3 },
        { action: 'quagmire', weight: 2 },
        { action: 'call', weight: 3, condition: (ctx) => hasRoom(ctx) && minions(ctx) < 2 },
        { action: 'rot', weight: 2, cooldown: 3, condition: p1 },
        { action: 'rot2', weight: 2, cooldown: 3, condition: p2 },
        { action: 'submerge', weight: 1, cooldown: 3, condition: p1 },
        { action: 'devour', weight: 3, condition: p2 },
      ],
    },
    sprite: blob('#0a140c', '#2f4a30', '#1a2e1c', '#c0ff60', 24),
  },

  // ═══ Осквернённый улей ═══════════════════════════════════════════════════
  {
    id: 'drone',
    name: 'Трутень',
    hp: 22,
    location: 'hive',
    rank: 'normal',
    role: 'swarm',
    actions: [
      act('mandibles', 'Жвалы', [{ type: 'attack', amount: 7 }]),
      act('acid', 'Кислота', [
        { type: 'attack', amount: 4 },
        { type: 'debuff', status: 'burn', value: 2, turns: 2 },
      ]),
      lick('Сбросить хитин', 4),
    ],
    ai: priority([when('lick', selfDots(3), { maxUses: 1 })], ['mandibles', 'mandibles', 'acid']),
    sprite: blob('#1a1020', '#8a6a2a', '#5a4a1a', '#e0ff60'),
  },
  {
    id: 'wasp',
    name: 'Оса-страж',
    hp: 18,
    location: 'hive',
    rank: 'normal',
    role: 'swarm',
    actions: [
      act('sting', 'Жало', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'bleed', value: 1, turns: 2 },
      ]),
      act('dive', 'Пикирование', [{ type: 'attack', amount: 9, pierce: true }]),
      act('buzz', 'Жужжание', [{ type: 'dodge', value: 1 }], noDodge),
    ],
    ai: { type: 'cycle', order: ['sting', 'dive', 'buzz'] },
    sprite: blob('#1a1020', '#d0a020', '#8a6a10', '#ff5050', 14),
  },
  {
    id: 'larva',
    name: 'Личинка',
    hp: 12,
    location: 'hive',
    rank: 'normal',
    role: 'swarm',
    actions: [act('gnaw', 'Грызть', [{ type: 'attack', amount: 4 }]), act('cocoon', 'Кокон', [{ type: 'block', amount: 8 }])],
    ai: { type: 'cycle', order: ['gnaw', 'cocoon'] },
    sprite: blob('#2a2020', '#e0d0b0', '#a09070', '#5a3a6a', 12),
  },
  {
    id: 'beetle',
    name: 'Хитиновый жук',
    hp: 30,
    location: 'hive',
    rank: 'normal',
    role: 'guard',
    actions: [
      act('ram', 'Таран', [{ type: 'attack', amount: 8 }]),
      act('shell', 'Панцирь', [
        { type: 'block', amount: 12 },
        { type: 'thorns', amount: 2, turns: 3 },
      ]),
      ...windup('rush', 'Разбег', act('gore', 'Рог', [{ type: 'attack', amount: 14 }])),
    ],
    ai: { type: 'cycle', order: ['ram', 'shell', 'ram', 'rush'] },
    sprite: blob('#100a18', '#4a2a6a', '#2a1a40', '#ff9f1c', 20),
  },
  {
    id: 'sporeling',
    name: 'Споровик',
    hp: 20,
    location: 'hive',
    rank: 'normal',
    role: 'caster',
    actions: [
      act('spores', 'Споры', [
        { type: 'debuff', status: 'vulnerable', value: 1, turns: 2 },
        { type: 'drainMp', amount: 1 },
      ]),
      act('burst', 'Лопнуть', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'burn', value: 2, turns: 2 },
      ]),
      // Споры оседают на невидимке: против игры из тени.
      listen('Облако спор', 4),
    ],
    ai: priority([when('listen', heroHidden)], ['spores', 'burst']),
    // Лопнувший споровик выдыхает всё, что копил: облако оседает на том, кто его вскрыл.
    onDeath: { name: 'Облако спор', effects: [{ type: 'debuff', status: 'vulnerable', value: 1, turns: 2 }] },
    sprite: blob('#1a1020', '#8a5aa0', '#5a3a70', '#e0ffa0'),
  },
  {
    id: 'egg_cluster',
    name: 'Кладка',
    hp: 14,
    location: 'hive',
    rank: 'normal',
    role: 'support',
    // Кладка не нападает: щетинится иглами и зреет. Успеешь разбить за два хода — личинок не будет вовсе.
    actions: [
      act('bristle', 'Щетина', [{ type: 'thorns', amount: 3 }], noThorns),
      act('pulse', 'Пульсация', [{ type: 'none' }]),
      act('hatch', 'Вылупление', [{ type: 'summon', enemyId: 'larva', count: 2 }], hasRoom),
    ],
    ai: { type: 'cycle', order: ['bristle', 'pulse', 'hatch'] },
    sprite: blob('#1a1020', '#c0b0d0', '#8070a0', '#402060', 14),
  },
  {
    id: 'chitin_colossus',
    name: 'Хитиновый колосс',
    hp: 70,
    location: 'hive',
    rank: 'elite',
    role: 'guard',
    actions: [
      act('claws', 'Клешни', [{ type: 'attack', amount: 12 }]),
      act('carapace', 'Панцирь', [
        { type: 'block', amount: 14 },
        { type: 'thorns', amount: 3, turns: 3 },
      ]),
      act('crush', 'Раздавить', [
        { type: 'attack', amount: 9 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      // Проверка сборки: проломить — против игры через блок; шипы панциря — против серии ударов.
      crack('Проломить', 12),
    ],
    ai: priority([when('crack', heroBlock(10), { cooldown: 2 })], ['claws', 'carapace', 'crush']),
    sprite: blob('#100a18', '#6a3a8a', '#3a1a50', '#ffd166', 24),
  },
  {
    id: 'wasp_queen',
    name: 'Осиная королева',
    hp: 55,
    location: 'hive',
    rank: 'elite',
    role: 'support',
    actions: [
      act('sting', 'Жало', [
        { type: 'attack', amount: 9 },
        { type: 'debuff', status: 'bleed', value: 2, turns: 2 },
      ]),
      act('command', 'Приказ', [{ type: 'summon', enemyId: 'wasp', count: 1 }], (ctx) => hasRoom(ctx) && countKind(ctx, 'wasp') < 2),
      act('pheromones', 'Феромоны', [
        { type: 'buffStr', amount: 2, target: 'allies' },
        { type: 'block', amount: 8 },
      ]),
      // Проверка сборки: маточное молочко снимает раны — против Крови, Огня и Яда.
      lick('Маточное молочко', 8),
    ],
    ai: priority([when('lick', selfDots(4), { maxUses: 1 })], ['sting', 'command', 'pheromones']),
    sprite: blob('#1a1020', '#e0b030', '#9a7010', '#ff3050', 22),
  },
  {
    id: 'hive_heart',
    name: 'Сердце улья',
    hp: 85,
    location: 'hive',
    rank: 'boss',
    actions: [
      act('slam', 'Удар щупальцем', [{ type: 'attack', amount: 11 }]),
      withFx({ kind: 'flask', color: '#b5e61d' }, act('acid_rain', 'Кислотный дождь', [
        { type: 'attack', amount: 6 },
        // Горение 3 → 2 в v0.34.1: девять урона мимо блока с одной атаки были самым скрытым уроном босса (см. GDD §13).
        { type: 'debuff', status: 'burn', value: 2, turns: 3 },
      ])),
      act('brood', 'Выводок', [{ type: 'summon', enemyId: 'larva', count: 2 }]),
      act('brood2', 'Рой ос', [{ type: 'summon', enemyId: 'wasp', count: 1 }]),
      act('chitin', 'Хитин', [{ type: 'block', amount: 14 }]),
      act('frenzy', 'Феромон ярости', [{ type: 'buffStr', amount: 3, target: 'allies' }]),
      act('frenzy2', 'Феромон роя', [{ type: 'buffStr', amount: 3, target: 'allies' }]),
    ],
    // Рой: хитин трескается в шипы, вместо личинок вылетают осы, феромон без лимита — поле надо разгребать, иначе осы с Силой разберут героя. HP 100 → 85.
    phase2: {
      atHp: 0.5,
      name: 'Рой',
      aura: '#b5e61d',
      effects: [{ type: 'thorns', amount: 2 }, { type: 'block', amount: 12 }],
      // Ход перехода: хитин смыкается — большой блок на свободный ход героя.
      guard: [{ type: 'block', amount: 24 }],
    },
    ai: {
      type: 'boss',
      rules: [
        { action: 'slam', weight: 3 },
        { action: 'acid_rain', weight: 2 },
        { action: 'brood', weight: 3, condition: (ctx) => p1(ctx) && hasRoom(ctx) && minions(ctx) < 2 },
        { action: 'brood2', weight: 3, condition: (ctx) => p2(ctx) && hasRoom(ctx) && minions(ctx) < 2 },
        { action: 'chitin', weight: 2, cooldown: 3, condition: p1 },
        { action: 'frenzy', weight: 1, cooldown: 4, maxUses: 2, condition: p1 },
        { action: 'frenzy2', weight: 1, cooldown: 4, condition: p2 },
      ],
    },
    sprite: blob('#1a0a20', '#a03060', '#601840', '#e0ff60', 24),
  },

  // ═══ Пиратский корабль ═══════════════════════════════════════════════════
  {
    id: 'pirate',
    name: 'Пират',
    hp: 44,
    location: 'ship',
    rank: 'normal',
    role: 'brute',
    actions: [
      act('cutlass', 'Абордажная сабля', [{ type: 'attack', amount: 12 }]),
      act('rum', 'Ром', [
        { type: 'heal', amount: 8, target: 'self' },
        { type: 'block', amount: 6 },
      ]),
      crack('Удар эфесом', 10),
    ],
    ai: priority([when('crack', heroBlock(8), { cooldown: 2 }), when('rum', selfHalf, { cooldown: 3 })], ['cutlass', 'cutlass']),
    sprite: humanoid('hood', { s: '#d9a06b', h: '#a02030', b: '#3a3a5a', l: '#2a2a3a', w: '#c0c0c0' }),
  },
  {
    id: 'gunner',
    name: 'Канонир',
    hp: 36,
    location: 'ship',
    rank: 'normal',
    role: 'shooter',
    actions: [
      ...windup('load', 'Зарядить пушку', act('volley', 'Выстрел', [{ type: 'attack', amount: 16 }])),
      act('grapeshot', 'Картечь', [{ type: 'attack', amount: 5, hits: 2 }]),
    ],
    ai: { type: 'cycle', order: ['load', 'grapeshot'] },
    sprite: humanoid('hat', { s: '#e8b88a', h: '#2a2a3a', b: '#5a3a2a', l: '#2a2a3a', w: '#4a4a4a' }),
  },
  {
    id: 'bosun',
    name: 'Боцман',
    hp: 50,
    location: 'ship',
    rank: 'normal',
    role: 'support',
    actions: [
      act('whip', 'Линёк', [{ type: 'attack', amount: 9, hits: 2 }]),
      act('order', 'Приказ', [
        { type: 'buffStr', amount: 3, target: 'neighbors' },
        { type: 'block', amount: 6 },
      ]),
      act('grog', 'Грог по кругу', [{ type: 'heal', amount: 8, target: 'neighbors' }]),
    ],
    ai: priority([when('grog', neighborHurt, { cooldown: 2 })], ['whip', 'order', 'whip']),
    sprite: humanoid('plume', { s: '#c9946b', h: '#3a2a1a', b: '#6a2a2a', l: '#2a2a3a', w: '#8a5a2a' }),
  },
  {
    id: 'parrot',
    name: 'Попугай',
    hp: 20,
    location: 'ship',
    rank: 'normal',
    role: 'caster',
    actions: [
      act('peck', 'Клевок', [{ type: 'attack', amount: 6 }]),
      act('screech', 'Крик', [
        { type: 'debuff', status: 'weak', value: 1, turns: 1 },
        { type: 'drainMp', amount: 2 },
      ]),
      act('flutter', 'Порхание', [{ type: 'dodge', value: 1 }], noDodge),
    ],
    ai: priority([when('screech', heroMana(5), { cooldown: 2 })], ['peck', 'flutter', 'peck']),
    sprite: blob('#101010', '#e03030', '#2060c0', '#ffd166', 12),
  },
  {
    id: 'powder_monkey',
    name: 'Пороховая мартышка',
    hp: 22,
    location: 'ship',
    rank: 'normal',
    role: 'shooter',
    actions: [
      act('throw', 'Бросок бочонка', [
        { type: 'attack', amount: 8 },
        { type: 'debuff', status: 'burn', value: 2, turns: 2 },
      ]),
      // v0.49: Подрыв 20 → 16 — «Крыса + Пират + Мартышка» убивала бота в первом и втором акте чаще любой рядовой встречи.
      act('boom', 'Подрыв', [{ type: 'selfDestruct', amount: 16, burn: 3 }]),
    ],
    // Фитиль на два хода (v0.34.2): два броска, потом Подрыв — на 22 HP есть два хода, а не один. С одним броском
    // в третьем акте пара мартышек рвалась на 64 за ход, и убить обеих ближним оружием было нельзя.
    ai: { type: 'cycle', order: ['throw', 'throw', 'boom'] },
    // Убитая раньше времени мартышка роняет бочонок: порох рвётся сам, слабее её собственного Подрыва.
    // Если она успела подорваться, второй раз рвать нечему — см. selfDestruct в combat.ts.
    onDeath: {
      name: 'Порох рвётся',
      effects: [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'burn', value: 2, turns: 2 },
      ],
    },
    sprite: blob('#1a1008', '#7a5a3a', '#4a3a20', '#ffe066', 14),
  },
  {
    id: 'siren',
    name: 'Сирена',
    hp: 40,
    location: 'ship',
    rank: 'normal',
    role: 'caster',
    actions: [
      act('song', 'Песнь', [
        { type: 'debuff', status: 'vulnerable', value: 1, turns: 2 },
        { type: 'drainMp', amount: 3 },
        { type: 'block', amount: 6 },
      ]),
      act('claws', 'Когти', [{ type: 'attack', amount: 10 }]),
      listen('Зов песни', 8),
    ],
    ai: priority([when('listen', heroHidden), when('song', heroMana(6), { cooldown: 2 })], ['claws', 'song', 'claws']),
    sprite: humanoid('bare', { s: '#7ad0c0', h: '#20706a', b: '#2a8a80', l: '#1a5a55', w: '#c0f0e0' }),
  },
  {
    id: 'tentacle',
    name: 'Щупальце кракена',
    hp: 60,
    location: 'ship',
    rank: 'normal',
    role: 'guard',
    actions: [
      act('slam', 'Удар', [{ type: 'attack', amount: 14 }]),
      act('grab', 'Хватка', [
        { type: 'attack', amount: 8 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      act('submerge', 'Погрузиться', [{ type: 'block', amount: 20 }]),
      ...windup('coil', 'Обвивает', act('crush', 'Сдавить', [{ type: 'attack', amount: 22 }])),
    ],
    ai: { type: 'cycle', order: ['slam', 'grab', 'submerge', 'coil'] },
    // Перерубленное щупальце сжимается в последней судороге — вырваться стоит сил.
    onDeath: {
      name: 'Предсмертный захват',
      effects: [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ],
    },
    sprite: blob('#0a1020', '#6a2a5a', '#401a3a', '#ffd166', 20),
  },
  {
    id: 'first_mate',
    name: 'Первый помощник',
    hp: 90,
    location: 'ship',
    rank: 'elite',
    role: 'brute',
    actions: [
      withFx({ kind: 'melee', color: '#dcdcdc' }, act('twin_blades', 'Два клинка', [{ type: 'attack', amount: 9, hits: 2 }])),
      act('parry', 'Парирование', [
        { type: 'block', amount: 14 },
        { type: 'thorns', amount: 3, turns: 3 },
      ]),
      withFx({ kind: 'melee', color: '#dcdcdc' }, act('lunge', 'Выпад', [{ type: 'attack', amount: 14, pierce: true }])),
      // Проверка сборки: нюх на крыс — против игры из тени.
      withFx({ kind: 'melee', color: '#dcdcdc' }, listen('Нюх на крыс', 12)),
      withFx({ kind: 'melee', color: '#dcdcdc' }, finish('Абордаж', 20)),
    ],
    ai: priority([when('listen', heroHidden), when('finish', heroLow, { cooldown: 2 })], ['twin_blades', 'parry', 'lunge']),
    sprite: humanoid('hood', { s: '#d9a06b', h: '#1a1a2a', b: '#2a2a4a', l: '#1a1a2a', w: '#e0e0e0' }),
  },
  {
    id: 'sea_devil',
    name: 'Морской дьявол',
    hp: 100,
    location: 'ship',
    rank: 'elite',
    role: 'caster',
    actions: [
      withFx({ kind: 'melee', color: '#5ee0d0' }, act('trident', 'Трезубец', [{ type: 'attack', amount: 16 }])),
      act('wave', 'Волна', [
        { type: 'attack', amount: 10 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      act('storm', 'Шторм', [{ type: 'block', amount: 16 }]),
      // Проверка сборки: солёная волна смывает раны — против Крови, Огня и Яда.
      lick('Солёная волна', 14),
    ],
    ai: priority([when('lick', selfDots(6), { maxUses: 1 })], ['trident', 'wave', 'storm', 'trident']),
    sprite: humanoid('horns', { s: '#3a8a8a', h: '#1a4a4a', b: '#1a5a6a', l: '#0a3a3a', w: '#c0f0ff' }),
  },
  {
    id: 'cursed_captain',
    name: 'Проклятый капитан',
    hp: 80,
    location: 'ship',
    rank: 'boss',
    actions: [
      withFx({ kind: 'melee', color: '#c9ccd1' }, act('sabre', 'Абордажная сабля', [{ type: 'attack', amount: 18 }])),
      withFx({ kind: 'orb', color: '#ffb347' }, act('pistol', 'Пистоль', [{ type: 'attack', amount: 12, pierce: true }])),
      act('all_hands', 'Свистать всех наверх', [{ type: 'summon', enemyId: 'pirate', count: 1 }]),
      act('aim', 'Наводит пушки', [{ type: 'block', amount: 12 }]),
      // v0.49: 28 → 22 — Капитан был главным убийцей бота в первом акте (28 гибелей из 678 на 1200 забегах).
      withFx({ kind: 'orb', color: '#ff7b00' }, act('broadside', 'Бортовой залп', [{ type: 'attack', amount: 22 }])),
      act('curse', 'Проклятие', [{ type: 'debuff', status: 'vulnerable', value: 1, turns: 3 }]),
    ],
    ai: {
      type: 'boss',
      rules: [
        { action: 'sabre', weight: 3 },
        { action: 'pistol', weight: 2 },
        { action: 'all_hands', weight: 3, condition: (ctx) => hasRoom(ctx) && minions(ctx) < 2 },
        { action: 'aim', weight: 2, cooldown: 4, followUp: 'broadside' },
        { action: 'broadside', weight: 0 },
        { action: 'curse', weight: 1, cooldown: 3 },
      ],
    },
    // Проклятие моря: капитан падает и встаёт призраком — без команды, зато сквозь блок и с уворотом. HP 150 → 80 + 40 у призрака.
    onDeath: { name: 'Проклятие моря', effects: [{ type: 'summon', enemyId: 'captain_ghost', count: 1 }] },
    sprite: humanoid('hat', { o: '#0e0e16', e: '#5cf0ff', s: '#8fa8a0', h: '#1a1a2a', b: '#3a1a2a', l: '#1a1a2a', w: '#d4af37' }),
  },
  {
    id: 'captain_ghost',
    name: 'Призрак капитана',
    hp: 40,
    location: 'ship',
    rank: 'boss',
    evade: 30,
    aura: '#5cf0ff',
    actions: [
      withFx({ kind: 'melee', color: '#5cf0ff' }, act('sabre', 'Призрачная сабля', [{ type: 'attack', amount: 10, pierce: true }])),
      withFx({ kind: 'orb', color: '#5cf0ff' }, act('broadside', 'Залп с того света', [{ type: 'attack', amount: 18 }])),
    ],
    ai: {
      type: 'boss',
      rules: [
        { action: 'sabre', weight: 3 },
        { action: 'broadside', weight: 2, cooldown: 3 },
      ],
    },
    sprite: humanoid('hat', { o: '#0e0e16', e: '#5cf0ff', s: '#7ab8c8', h: '#2a3a4a', b: '#2a4a5a', l: '#1a2a3a', w: '#5cf0ff' }),
  },
  // ═══ Вор (событие любого этажа) ═══════════════════════════════════════════
  // Родной tier — первый (лес): бой с вором длится всего четыре хода, и числа заданы под урон героя в первом акте;
  // дальше их поднимает обычный масштаб элиты (×1.5 во втором акте, ×2.4 в третьем).
  {
    id: 'gnome_thief',
    name: 'Гном-деньгокрад',
    hp: 18,
    location: 'forest',
    rank: 'elite',
    // Половина ударов мимо, но каждый срезанный кошель тянет мешок к земле: −12 % за кражу.
    evade: 50,
    // Гном ростом с полтора мешка: на поле он мельче любой элиты и даже рядового.
    actions: [
      withFx({ kind: 'melee', color: '#ffd166' }, act('pinch', 'Срезать кошель', [{ type: 'stealGold', amount: GNOME_STEAL }])),
      withFx({ kind: 'flask', color: '#c2b280' }, act('sand', 'Песок в глаза', [
        { type: 'attack', amount: 4 },
        { type: 'debuff', status: 'weak', value: 1, turns: 2 },
      ])),
      act('bolt', 'Дать дёру', [{ type: 'flee' }]),
    ],
    ai: { type: 'cycle', order: ['pinch', 'sand', 'pinch', 'bolt'] },
    sprite: humanoid('cap', { s: '#e0b088', h: '#2a6a3a', b: '#7a5230', l: '#3a2a1a', w: '#ffd166' }),
  },
  {
    id: 'gnome_snatcher',
    name: 'Гном-вещекрад',
    hp: 34,
    location: 'forest',
    rank: 'elite',
    // Уворота с порога у него нет: первый ход он занят карманами, и это окно героя. Уворот приходит вторым ходом («Мелькнуть»).
    actions: [
      // Вместе с вещью выуживает искру из кармана: иначе Маг с полной маной валит вора за два хода (98 % у бота).
      withFx({ kind: 'melee', color: '#8fd3ff' }, act('snatch', 'Стянуть вещь', [
        { type: 'stealArtifact' },
        { type: 'drainMp', amount: 5 },
      ])),
      withFx({ kind: 'flask', color: '#c2b280' }, act('sand', 'Песок в глаза', [
        { type: 'attack', amount: 4 },
        { type: 'debuff', status: 'weak', value: 1, turns: 2 },
      ])),
      act('slip', 'Мелькнуть', [{ type: 'evade', value: 50 }]),
      act('duck', 'Юркнуть', [{ type: 'block', amount: 6 }]),
      act('bolt', 'Дать дёру', [{ type: 'flee' }]),
    ],
    ai: { type: 'cycle', order: ['snatch', 'slip', 'sand', 'duck', 'bolt'] },
    sprite: humanoid('hood', { s: '#d9a273', h: '#6a2438', b: '#9c3b4e', l: '#3a1a22', w: '#d8d8e8' }),
  },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));
export const ENEMY_LIST: EnemyDef[] = list;

export function enemyDef(id: string): EnemyDef {
  const def = ENEMIES[id];
  if (!def) throw new Error(`Unknown enemy: ${id}`);
  return def;
}

/**
 * Id приёма-перехода во вторую фазу (v0.36): босс, перешедший в ход героя, следующим своим ходом не атакует —
 * «собирается с силами» и ставит стражу перехода (`phase2.guard`: блок, уклонение, неуязвимость или шипы на срок),
 * чтобы свободный ход героя не разваливал его. Приём синтетический: в `actions` его нет, `enemyAction` собирает его из `phase2`.
 */
export const PHASE_SHIFT = 'phase_shift';

export function enemyAction(def: EnemyDef, actionId: string): EnemyAction {
  if (actionId === PHASE_SHIFT && def.phase2) return { id: PHASE_SHIFT, name: def.phase2.name, effects: def.phase2.guard };
  const a = def.actions.find((x) => x.id === actionId);
  if (!a) throw new Error(`Enemy ${def.id} has no action ${actionId}`);
  return a;
}
