import type { AiCtx, EnemyAction, EnemyDef, EnemyEffect, FxSpec, HeadStyle, SpriteSpec } from '../engine/types';
import { MAX_ENEMIES } from '../engine/types';

function act(id: string, name: string, effects: EnemyEffect[], condition?: (ctx: AiCtx) => boolean): EnemyAction {
  return condition ? { id, name, effects, condition } : { id, name, effects };
}

/** Приём элиты или босса с анимацией героя: снаряд, взмах клинком, склянка. Рядовые враги просто наскакивают. */
const withFx = (fx: FxSpec, a: EnemyAction): EnemyAction => ({ ...a, fx });

const hasRoom = (ctx: AiCtx) => ctx.enemies.length < MAX_ENEMIES;
const countKind = (ctx: AiCtx, defId: string) => ctx.enemies.filter((e) => e.defId === defId).length;
const minions = (ctx: AiCtx) => ctx.enemies.filter((e) => e.uid !== ctx.self.uid).length;
const hurt = (ctx: AiCtx) => ctx.self.hp < ctx.self.maxHp;
/** Шипы складываются и не спадают — второй раз щетиниться нельзя, иначе защита растёт без предела. */
const noThorns = (ctx: AiCtx) => !ctx.self.statuses.some((st) => st.id === 'thorns');

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
    actions: [act('bite', 'Укус', [{ type: 'attack', amount: 5 }]), act('howl', 'Вой', [{ type: 'buffStr', amount: 2, target: 'kind' }])],
    ai: { type: 'cycle', order: ['bite', 'bite', 'howl'] },
    sprite: blob('#1a1a22', '#8a8f98', '#5d626b', '#ffd166'),
  },
  {
    id: 'boar',
    name: 'Кабан',
    hp: 18,
    location: 'forest',
    rank: 'normal',
    actions: [act('ram', 'Таран', [{ type: 'attack', amount: 7 }]), act('bristle', 'Щетина', [{ type: 'block', amount: 5 }])],
    ai: { type: 'cycle', order: ['ram', 'bristle'] },
    sprite: blob('#1f1410', '#7a5230', '#4e3320', '#f4a261'),
  },
  {
    id: 'rat',
    name: 'Крыса',
    hp: 7,
    location: 'forest',
    rank: 'normal',
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
    actions: [act('bite', 'Укус', [{ type: 'attack', amount: 4, drain: true }]), act('flutter', 'Порхание', [{ type: 'dodge', value: 1 }])],
    ai: { type: 'cycle', order: ['bite', 'flutter'] },
    sprite: blob('#0e0e16', '#3a3a5a', '#2a2a3a', '#ffd166', 14),
  },
  {
    id: 'spider',
    name: 'Паук',
    hp: 14,
    location: 'forest',
    rank: 'normal',
    actions: [
      act('bite', 'Ядовитый укус', [
        { type: 'attack', amount: 4 },
        { type: 'debuff', status: 'poison', value: 1, turns: 3 },
      ]),
      act('web', 'Паутина', [{ type: 'debuff', status: 'exhaust', value: 1, turns: 1 }]),
    ],
    ai: { type: 'cycle', order: ['bite', 'web', 'bite'] },
    sprite: blob('#0a0a0a', '#2a2a2a', '#1a1a1a', '#ff3b3b'),
  },
  {
    id: 'bandit_archer',
    name: 'Бандит-лучник',
    hp: 10,
    location: 'forest',
    rank: 'normal',
    actions: [act('shoot', 'Выстрел', [{ type: 'attack', amount: 4 }]), act('aim', 'Прицел', [{ type: 'buffStr', amount: 4, target: 'self' }])],
    ai: { type: 'cycle', order: ['shoot', 'aim', 'shoot'] },
    sprite: humanoid('hood', { s: '#e8b88a', h: '#3a5a40', b: '#6b4f3a', l: '#2f2f2f', w: '#a67c52' }),
  },
  {
    id: 'cutthroat',
    name: 'Головорез',
    hp: 16,
    location: 'forest',
    rank: 'normal',
    actions: [
      act('strike', 'Удар', [{ type: 'attack', amount: 6 }]),
      act('double', 'Двойной удар', [{ type: 'attack', amount: 3, hits: 2 }]),
      act('guard', 'Блок', [{ type: 'block', amount: 4 }]),
    ],
    ai: { type: 'cycle', order: ['strike', 'double', 'guard'] },
    sprite: humanoid('bare', { s: '#d9a06b', h: '#2b1d14', b: '#8b1e2d', l: '#2f2f2f', w: '#c0c0c0' }),
  },
  {
    id: 'goblin',
    name: 'Гоблин',
    hp: 12,
    location: 'forest',
    rank: 'normal',
    actions: [
      act('sneak', 'Подлый удар', [{ type: 'attack', amount: 5, pierce: true }]),
      act('poke', 'Тычок', [{ type: 'attack', amount: 3 }]),
      act('guard', 'Щит', [{ type: 'block', amount: 3 }]),
    ],
    ai: { type: 'cycle', order: ['sneak', 'poke', 'guard'] },
    sprite: humanoid('bare', { s: '#6fa35a', h: '#3a5a2a', b: '#6b4f3a', l: '#3a2a1a', w: '#c0c0c0' }),
  },
  {
    id: 'goblin_shaman',
    name: 'Гоблин-шаман',
    hp: 14,
    location: 'forest',
    rank: 'normal',
    actions: [
      act('curse', 'Сглаз', [{ type: 'debuff', status: 'vulnerable', value: 1, turns: 2 }]),
      act('mend', 'Знахарство', [{ type: 'heal', amount: 4, target: 'allies' }]),
      act('spark', 'Искра', [{ type: 'attack', amount: 5 }]),
    ],
    ai: { type: 'cycle', order: ['curse', 'mend', 'spark'] },
    sprite: humanoid('hat', { s: '#6fa35a', h: '#7a3a7a', b: '#4a2a5a', l: '#2a1a3a', w: '#c9a227' }),
  },
  {
    id: 'bear',
    name: 'Медведь',
    hp: 35,
    location: 'forest',
    rank: 'elite',
    actions: [
      act('paw', 'Лапа', [{ type: 'attack', amount: 9 }]),
      act('roar', 'Рёв', [{ type: 'buffStr', amount: 3, target: 'self' }]),
      act('hug', 'Объятия', [
        { type: 'attack', amount: 7 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
    ],
    ai: { type: 'cycle', order: ['paw', 'roar', 'paw', 'hug'] },
    sprite: blob('#14100c', '#5b3a1e', '#3b2613', '#ffe8a3', 20),
  },
  {
    id: 'troll',
    name: 'Тролль',
    hp: 42,
    location: 'forest',
    rank: 'elite',
    actions: [
      act('club', 'Дубина', [{ type: 'attack', amount: 10 }]),
      act('regen', 'Регенерация', [{ type: 'heal', amount: 7, target: 'self' }], hurt),
      act('stomp', 'Топот', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
    ],
    ai: { type: 'cycle', order: ['club', 'regen', 'club', 'stomp'] },
    sprite: blob('#0f1a10', '#5a7a4a', '#3a5a2a', '#ffe8a3', 22),
  },
  {
    id: 'alpha_wolf',
    name: 'Вожак стаи',
    hp: 60,
    location: 'forest',
    rank: 'boss',
    actions: [
      act('bite', 'Укус', [{ type: 'attack', amount: 8 }]),
      act('rend', 'Разрывание', [{ type: 'attack', amount: 5, hits: 2 }]),
      act('howl', 'Вой', [{ type: 'summon', enemyId: 'wolf', count: 1 }]),
      act('rage', 'Ярость', [{ type: 'buffStr', amount: 2, target: 'self' }]),
    ],
    ai: {
      type: 'boss',
      rules: [
        { action: 'bite', weight: 3 },
        { action: 'rend', weight: 2 },
        { action: 'howl', weight: 3, condition: (ctx) => hasRoom(ctx) && countKind(ctx, 'wolf') < 2 },
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
    actions: [act('slash', 'Удар мечом', [{ type: 'attack', amount: 9 }]), act('guard', 'Блок', [{ type: 'block', amount: 8 }])],
    ai: { type: 'cycle', order: ['slash', 'guard'] },
    sprite: humanoid('skull', { o: '#22222a', e: '#111111', s: '#e8e4d8', h: '#e8e4d8', b: '#bdb7a6', l: '#d8d3c5', w: '#9aa0a6' }),
  },
  {
    id: 'skeleton_archer',
    name: 'Скелет-лучник',
    hp: 20,
    location: 'crypt',
    rank: 'normal',
    actions: [act('shoot', 'Выстрел', [{ type: 'attack', amount: 6 }]), act('volley', 'Залп', [{ type: 'attack', amount: 4, hits: 2 }])],
    ai: { type: 'cycle', order: ['shoot', 'volley'] },
    sprite: humanoid('skull', { o: '#22222a', e: '#111111', s: '#e8e4d8', h: '#e8e4d8', b: '#8f8a7c', l: '#d8d3c5', w: '#a67c52' }),
  },
  {
    id: 'ghost',
    name: 'Призрак',
    hp: 24,
    location: 'crypt',
    rank: 'normal',
    actions: [
      act('touch', 'Касание', [
        { type: 'attack', amount: 7 },
        { type: 'debuff', status: 'weak', value: 1, turns: 2 },
      ]),
      act('vanish', 'Бестелесность', [{ type: 'block', amount: 30 }]),
    ],
    ai: { type: 'cycle', order: ['touch', 'vanish'] },
    sprite: blob('#3a4a6b', '#c9d6ff', '#8fa3d6', '#1b1f3a'),
  },
  {
    id: 'ghoul',
    name: 'Гуль',
    hp: 36,
    location: 'crypt',
    rank: 'normal',
    actions: [
      act('bite', 'Укус', [
        { type: 'attack', amount: 8 },
        { type: 'heal', amount: 4, target: 'self' },
      ]),
      act('claws', 'Когти', [{ type: 'attack', amount: 5, hits: 2 }]),
    ],
    ai: { type: 'cycle', order: ['bite', 'claws'] },
    sprite: blob('#14200f', '#7a9a5a', '#4d6b36', '#ff5555'),
  },
  {
    id: 'wraith',
    name: 'Тень',
    hp: 26,
    location: 'crypt',
    rank: 'normal',
    actions: [
      act('blade', 'Клинок тени', [{ type: 'attack', amount: 8, pierce: true }]),
      act('moan', 'Стон', [
        { type: 'debuff', status: 'weak', value: 1, turns: 1 },
        { type: 'drainMp', amount: 1 },
      ]),
    ],
    ai: { type: 'cycle', order: ['blade', 'moan'] },
    sprite: blob('#2a1a3a', '#6a4a8a', '#4a2a6a', '#c9f0ff'),
  },
  {
    id: 'grave_slime',
    name: 'Могильный слизень',
    hp: 32,
    location: 'crypt',
    rank: 'normal',
    actions: [act('spit', 'Плевок', [{ type: 'attack', amount: 7 }]), act('absorb', 'Поглощение', [{ type: 'attack', amount: 6, drain: true }])],
    ai: { type: 'cycle', order: ['spit', 'absorb'] },
    onDeath: { name: 'Деление', effects: [{ type: 'summon', enemyId: 'slimelet', count: 2 }] },
    sprite: blob('#1a2a1a', '#5a8a5a', '#3a6a3a', '#1b1f3a'),
  },
  {
    id: 'slimelet',
    name: 'Слизнёнок',
    hp: 10,
    location: 'crypt',
    rank: 'normal',
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
    actions: [
      act('slam', 'Удар', [{ type: 'attack', amount: 8 }]),
      act('wrap', 'Бинты', [{ type: 'block', amount: 12 }]),
      act('curse', 'Проклятие мумии', [{ type: 'debuff', status: 'weak', value: 1, turns: 3 }]),
    ],
    ai: { type: 'cycle', order: ['slam', 'wrap', 'curse'] },
    sprite: humanoid('bare', { s: '#d8ccb0', h: '#c8bc9a', b: '#c8bc9a', l: '#b8ac8a', w: '#8a7a5a' }),
  },
  {
    id: 'vampire',
    name: 'Вампир',
    hp: 42,
    location: 'crypt',
    rank: 'normal',
    actions: [
      act('bite', 'Укус', [{ type: 'attack', amount: 9, drain: true }]),
      act('mist', 'Туман', [{ type: 'dodge', value: 1 }]),
      act('hypnosis', 'Гипноз', [{ type: 'debuff', status: 'weak', value: 1, turns: 2 }]),
    ],
    ai: { type: 'cycle', order: ['bite', 'mist', 'bite', 'hypnosis'] },
    sprite: humanoid('bare', { s: '#e6e0f0', h: '#1a1a2a', b: '#3a0a1a', l: '#1a0a10', w: '#c0c0c0' }),
  },
  {
    id: 'witch',
    name: 'Ведьма',
    hp: 30,
    location: 'crypt',
    rank: 'normal',
    actions: [
      act('hex', 'Сглаз', [
        { type: 'debuff', status: 'vulnerable', value: 1, turns: 2 },
        { type: 'drainMp', amount: 2 },
      ]),
      act('spark', 'Чёрная искра', [{ type: 'attack', amount: 8 }]),
      act('potion', 'Зелье', [{ type: 'heal', amount: 9, target: 'allies' }]),
    ],
    ai: { type: 'cycle', order: ['hex', 'spark', 'potion'] },
    sprite: humanoid('hat', { s: '#c9d6a0', h: '#1a1a2a', b: '#2a1a3a', l: '#1a0a20', w: '#7cf0a0' }),
  },
  {
    id: 'necromancer',
    name: 'Некромант',
    hp: 45,
    location: 'crypt',
    rank: 'elite',
    actions: [
      withFx({ kind: 'orb', color: '#7a3fb0' }, act('bolt', 'Тёмная стрела', [{ type: 'attack', amount: 10 }])),
      act('raise', 'Поднять скелета', [{ type: 'summon', enemyId: 'skeleton_warrior', count: 1 }], (ctx) => hasRoom(ctx) && countKind(ctx, 'skeleton_warrior') < 2),
      act('curse', 'Проклятие', [{ type: 'debuff', status: 'weak', value: 1, turns: 2 }]),
    ],
    ai: { type: 'cycle', order: ['bolt', 'raise', 'curse'] },
    sprite: humanoid('hood', { o: '#1b1b2a', e: '#111111', s: '#cdbde0', h: '#2d1b4e', b: '#1e1433', l: '#120b22', w: '#7cf0a0' }),
  },
  {
    id: 'bone_golem',
    name: 'Костяной голем',
    hp: 72,
    location: 'crypt',
    rank: 'elite',
    actions: [
      act('fist', 'Кулак', [{ type: 'attack', amount: 14 }]),
      act('armor', 'Костяная броня', [
        { type: 'block', amount: 16 },
        { type: 'thorns', amount: 2 },
      ]),
      act('crush', 'Сокрушение', [
        { type: 'attack', amount: 11 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
    ],
    ai: { type: 'cycle', order: ['fist', 'armor', 'crush'] },
    sprite: blob('#22222a', '#d8d3c5', '#a8a395', '#5cf0ff', 22),
  },
  {
    id: 'lich',
    name: 'Лич',
    hp: 110,
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
    sprite: humanoid('crown', { o: '#0e0e16', e: '#5cf0ff', s: '#b8c0c8', h: '#d4af37', b: '#24143f', l: '#160b28', w: '#d4af37' }),
  },

  // ═══ Пещеры огня ═════════════════════════════════════════════════════════
  {
    id: 'imp',
    name: 'Имп',
    hp: 28,
    location: 'caves',
    rank: 'normal',
    actions: [
      act('spit', 'Огненный плевок', [
        { type: 'attack', amount: 7 },
        { type: 'debuff', status: 'burn', value: 3, turns: 3 },
      ]),
      act('mischief', 'Пакость', [
        { type: 'debuff', status: 'weak', value: 1, turns: 2 },
        { type: 'drainMp', amount: 1 },
      ]),
    ],
    ai: { type: 'cycle', order: ['spit', 'mischief'] },
    sprite: blob('#2a0a0a', '#c0392b', '#7b1e1e', '#ffe066'),
  },
  {
    id: 'kamikaze_imp',
    name: 'Имп-бомбардир',
    hp: 20,
    location: 'caves',
    rank: 'normal',
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
    actions: [
      act('bite', 'Укус', [
        { type: 'attack', amount: 8 },
        { type: 'debuff', status: 'burn', value: 2, turns: 2 },
      ]),
      act('flutter', 'Порхание', [{ type: 'dodge', value: 1 }]),
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
    actions: [
      act('breath', 'Огненное дыхание', [
        { type: 'attack', amount: 12 },
        { type: 'debuff', status: 'burn', value: 3, turns: 3 },
      ]),
      act('curl', 'Свернуться', [{ type: 'block', amount: 12 }]),
    ],
    ai: { type: 'cycle', order: ['breath', 'curl'] },
    sprite: blob('#2a1200', '#e07b39', '#a34e14', '#fff2a8'),
  },
  {
    id: 'lava_slime',
    name: 'Лавовый слизень',
    hp: 52,
    location: 'caves',
    rank: 'normal',
    actions: [
      act('spit', 'Плевок лавы', [
        { type: 'attack', amount: 9 },
        { type: 'debuff', status: 'burn', value: 3, turns: 2 },
      ]),
      act('heat', 'Жар', [{ type: 'block', amount: 10 }]),
    ],
    ai: { type: 'cycle', order: ['spit', 'heat'] },
    onDeath: {
      name: 'Взрыв',
      effects: [
        { type: 'attack', amount: 12 },
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
    actions: [
      act('bite', 'Укус', [{ type: 'attack', amount: 12 }]),
      act('lunge', 'Рывок', [{ type: 'attack', amount: 8, pierce: true }]),
      act('howl', 'Вой', [{ type: 'buffStr', amount: 3, target: 'kind' }]),
    ],
    ai: { type: 'cycle', order: ['bite', 'lunge', 'howl'] },
    sprite: blob('#0a0a0a', '#3a1a1a', '#200a0a', '#ff3b00'),
  },
  {
    id: 'cultist',
    name: 'Культист',
    hp: 36,
    location: 'caves',
    rank: 'normal',
    actions: [
      act('dagger', 'Кинжал', [{ type: 'attack', amount: 8 }]),
      act('sacrifice', 'Жертва', [{ type: 'buffStr', amount: 2, target: 'allies' }]),
      act('prayer', 'Тёмная молитва', [{ type: 'heal', amount: 10, target: 'allies' }]),
    ],
    ai: { type: 'cycle', order: ['dagger', 'sacrifice', 'prayer'] },
    sprite: humanoid('hood', { o: '#1b1b2a', e: '#111111', s: '#e0b48a', h: '#5a0f1a', b: '#7a1a2a', l: '#2a0a10', w: '#c0c0c0' }),
  },
  {
    id: 'fire_priest',
    name: 'Огненный жрец',
    hp: 40,
    location: 'caves',
    rank: 'normal',
    actions: [
      act('bless', 'Благословение', [{ type: 'buffStr', amount: 3, target: 'allies' }]),
      act('prayer', 'Огненная молитва', [{ type: 'heal', amount: 14, target: 'allies' }]),
      act('flame', 'Пламя', [{ type: 'attack', amount: 11 }]),
    ],
    ai: { type: 'cycle', order: ['bless', 'flame', 'prayer'] },
    sprite: humanoid('hood', { s: '#e0b48a', h: '#b8860b', b: '#7a1a2a', l: '#3a0a10', w: '#ffd166' }),
  },
  {
    id: 'tormentor',
    name: 'Демон-мучитель',
    hp: 64,
    location: 'caves',
    rank: 'normal',
    actions: [
      act('whip', 'Кнут', [{ type: 'attack', amount: 9, hits: 2 }]),
      act('torture', 'Пытка', [{ type: 'debuff', status: 'bleed', value: 4, turns: 3 }]),
    ],
    ai: { type: 'cycle', order: ['whip', 'torture', 'whip'] },
    sprite: humanoid('horns', { s: '#8b1e2d', h: '#4a0a10', b: '#2a0a10', l: '#1a0508', w: '#e0e0e0' }),
  },
  {
    id: 'golem',
    name: 'Каменный голем',
    hp: 80,
    location: 'caves',
    rank: 'normal',
    actions: [
      act('fist', 'Кулак', [{ type: 'attack', amount: 15 }]),
      act('stone_skin', 'Каменная кожа', [{ type: 'block', amount: 16 }]),
      act('quake', 'Землетрясение', [
        { type: 'attack', amount: 11 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
    ],
    ai: { type: 'cycle', order: ['fist', 'stone_skin', 'quake'] },
    sprite: blob('#1a1a1a', '#7d7d7d', '#505050', '#ff9f1c', 20),
  },
  {
    id: 'fire_elemental',
    name: 'Огненный элементаль',
    hp: 90,
    location: 'caves',
    rank: 'elite',
    actions: [
      withFx({ kind: 'orb', color: '#ff7b00' }, act('flame', 'Пламя', [
        { type: 'attack', amount: 14 },
        { type: 'debuff', status: 'burn', value: 4, turns: 3 },
      ])),
      act('fire_shield', 'Огненный щит', [
        { type: 'block', amount: 12 },
        { type: 'thorns', amount: 2 },
      ]),
      withFx({ kind: 'orb', color: '#ffd166' }, act('burst', 'Взрыв', [{ type: 'attack', amount: 22 }])),
    ],
    ai: { type: 'cycle', order: ['flame', 'fire_shield', 'burst'] },
    sprite: blob('#3a0a00', '#ff7b00', '#d63a00', '#ffffff', 20),
  },
  {
    id: 'minotaur',
    name: 'Минотавр',
    hp: 100,
    location: 'caves',
    rank: 'elite',
    actions: [
      withFx({ kind: 'melee', color: '#c9ccd1' }, act('axe', 'Секира', [{ type: 'attack', amount: 18 }])),
      act('windup', 'Замах', [{ type: 'none' }]),
      withFx({ kind: 'melee', color: '#c9ccd1' }, act('smash', 'Сокрушительный удар', [{ type: 'attack', amount: 30 }])),
      act('roar', 'Рёв', [{ type: 'buffStr', amount: 3, target: 'self' }]),
    ],
    ai: { type: 'cycle', order: ['axe', 'windup', 'smash', 'roar'] },
    sprite: humanoid('horns', { s: '#7a5230', h: '#4e3320', b: '#5b3a1e', l: '#3a2613', w: '#ede0d4' }),
  },
  {
    id: 'dragon',
    name: 'Древний дракон',
    hp: 170,
    location: 'caves',
    rank: 'boss',
    actions: [
      withFx({ kind: 'orb', color: '#ff5a1f' }, act('breath', 'Дыхание', [
        { type: 'attack', amount: 18 },
        { type: 'debuff', status: 'burn', value: 4, turns: 3 },
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
    ai: {
      type: 'boss',
      rules: [
        { action: 'breath', weight: 3 },
        { action: 'claw', weight: 3 },
        { action: 'tail', weight: 2 },
        { action: 'takeoff', weight: 2, cooldown: 4, followUp: 'dive' },
        { action: 'dive', weight: 0 },
        { action: 'roar', weight: 2, maxUses: 2 },
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
    actions: [act('bites', 'Укусы', [{ type: 'attack', amount: 2, hits: 3 }]), act('scatter', 'Рассеяться', [{ type: 'dodge', value: 1 }])],
    ai: { type: 'cycle', order: ['bites', 'scatter'] },
    sprite: blob('#0e0e10', '#4a4a3a', '#2a2a22', '#e0e0c0', 14),
  },
  {
    id: 'toad',
    name: 'Жаба',
    hp: 16,
    location: 'swamp',
    rank: 'normal',
    actions: [
      act('tongue', 'Язык', [{ type: 'attack', amount: 6 }]),
      act('puff', 'Раздуться', [{ type: 'block', amount: 6 }]),
      act('spit', 'Ядовитый плевок', [
        { type: 'attack', amount: 4 },
        { type: 'debuff', status: 'poison', value: 2, turns: 2 },
      ]),
    ],
    ai: { type: 'cycle', order: ['tongue', 'puff', 'spit'] },
    sprite: blob('#14200f', '#5a7a2a', '#3a5a1a', '#ffd166'),
  },
  {
    id: 'will_o_wisp',
    name: 'Болотный огонёк',
    hp: 9,
    location: 'swamp',
    rank: 'normal',
    actions: [
      act('scorch', 'Ожог', [
        { type: 'attack', amount: 3 },
        { type: 'debuff', status: 'burn', value: 1, turns: 2 },
      ]),
      act('flicker', 'Мерцание', [{ type: 'dodge', value: 1 }]),
    ],
    ai: { type: 'cycle', order: ['scorch', 'flicker'] },
    sprite: blob('#1a2a1a', '#a0ffc0', '#40c080', '#ffffff', 12),
  },
  {
    id: 'kikimora',
    name: 'Кикимора',
    hp: 14,
    location: 'swamp',
    rank: 'normal',
    actions: [
      act('morok', 'Морок', [{ type: 'debuff', status: 'vulnerable', value: 1, turns: 2 }]),
      act('scratch', 'Царапины', [{ type: 'attack', amount: 4, hits: 2 }]),
      act('cackle', 'Хохот', [{ type: 'heal', amount: 3, target: 'allies' }]),
    ],
    ai: { type: 'cycle', order: ['morok', 'scratch', 'cackle'] },
    sprite: humanoid('hood', { s: '#7a9a6a', h: '#2a3a20', b: '#3a4a2a', l: '#1a2a14', w: '#a0c090' }),
  },
  {
    id: 'drowned',
    name: 'Утопленник',
    hp: 20,
    location: 'swamp',
    rank: 'normal',
    actions: [
      act('grip', 'Хватка', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      act('slam', 'Удар', [{ type: 'attack', amount: 5 }]),
      act('silt', 'Тина', [{ type: 'block', amount: 5 }]),
    ],
    ai: { type: 'cycle', order: ['grip', 'slam', 'silt'] },
    sprite: humanoid('bare', { s: '#8fa8a0', h: '#3a4a40', b: '#4a5a50', l: '#2a3a30', w: '#6a7a70' }),
  },
  {
    id: 'triton',
    name: 'Тритон',
    hp: 15,
    location: 'swamp',
    rank: 'normal',
    actions: [act('trident', 'Трезубец', [{ type: 'attack', amount: 6 }]), act('dive', 'Нырок', [{ type: 'dodge', value: 1 }])],
    ai: { type: 'cycle', order: ['trident', 'trident', 'dive'] },
    sprite: humanoid('plume', { s: '#4a9a8a', h: '#2a6a5a', b: '#2a5a5a', l: '#1a3a3a', w: '#c0c0c0' }),
  },
  {
    id: 'hydra',
    name: 'Гидра',
    hp: 40,
    location: 'swamp',
    rank: 'elite',
    actions: [
      act('maws', 'Три пасти', [{ type: 'attack', amount: 3, hits: 3 }]),
      act('regrow', 'Отрастить головы', [{ type: 'heal', amount: 6, target: 'self' }], hurt),
      act('miasma', 'Ядовитое облако', [{ type: 'debuff', status: 'poison', value: 2, turns: 3 }]),
    ],
    ai: { type: 'cycle', order: ['maws', 'regrow', 'maws', 'miasma'] },
    sprite: blob('#0f1a10', '#3a7a4a', '#245a30', '#ffd166', 22),
  },
  {
    id: 'toad_mother',
    name: 'Мать жаб',
    hp: 38,
    location: 'swamp',
    rank: 'elite',
    actions: [
      act('tongue', 'Язык', [{ type: 'attack', amount: 8 }]),
      act('puff', 'Раздуться', [{ type: 'block', amount: 8 }]),
      withFx({ kind: 'flask', color: '#7ddc5a' }, act('spit', 'Ядовитый плевок', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'poison', value: 3, turns: 2 },
      ])),
      act('spawn', 'Икра', [{ type: 'summon', enemyId: 'toad', count: 1 }], hasRoom),
    ],
    ai: { type: 'cycle', order: ['tongue', 'puff', 'spit', 'spawn'] },
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
      act('submerge', 'Погружение', [{ type: 'block', amount: 10 }]),
    ],
    ai: {
      type: 'boss',
      rules: [
        { action: 'tentacles', weight: 3 },
        { action: 'quagmire', weight: 2 },
        { action: 'call', weight: 3, condition: (ctx) => hasRoom(ctx) && minions(ctx) < 2 },
        { action: 'rot', weight: 2, cooldown: 3 },
        { action: 'submerge', weight: 1, cooldown: 3 },
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
    actions: [
      act('mandibles', 'Жвала', [{ type: 'attack', amount: 7 }]),
      act('acid', 'Кислота', [
        { type: 'attack', amount: 4 },
        { type: 'debuff', status: 'burn', value: 2, turns: 2 },
      ]),
    ],
    ai: { type: 'cycle', order: ['mandibles', 'mandibles', 'acid'] },
    sprite: blob('#1a1020', '#8a6a2a', '#5a4a1a', '#e0ff60'),
  },
  {
    id: 'wasp',
    name: 'Оса-страж',
    hp: 18,
    location: 'hive',
    rank: 'normal',
    actions: [
      act('sting', 'Жало', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'bleed', value: 1, turns: 2 },
      ]),
      act('dive', 'Пикирование', [{ type: 'attack', amount: 9, pierce: true }]),
      act('buzz', 'Жужжание', [{ type: 'dodge', value: 1 }]),
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
    actions: [
      act('ram', 'Таран', [{ type: 'attack', amount: 8 }]),
      act('shell', 'Панцирь', [
        { type: 'block', amount: 12 },
        { type: 'thorns', amount: 2 },
      ]),
    ],
    ai: { type: 'cycle', order: ['ram', 'shell', 'ram'] },
    sprite: blob('#100a18', '#4a2a6a', '#2a1a40', '#ff9f1c', 20),
  },
  {
    id: 'sporeling',
    name: 'Споровик',
    hp: 20,
    location: 'hive',
    rank: 'normal',
    actions: [
      act('spores', 'Споры', [
        { type: 'debuff', status: 'vulnerable', value: 1, turns: 2 },
        { type: 'drainMp', amount: 1 },
      ]),
      act('burst', 'Выброс', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'burn', value: 2, turns: 2 },
      ]),
    ],
    ai: { type: 'cycle', order: ['spores', 'burst'] },
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
    actions: [
      act('claws', 'Клешни', [{ type: 'attack', amount: 12 }]),
      act('carapace', 'Панцирь', [
        { type: 'block', amount: 14 },
        { type: 'thorns', amount: 3 },
      ]),
      act('crush', 'Раздавить', [
        { type: 'attack', amount: 9 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
    ],
    ai: { type: 'cycle', order: ['claws', 'carapace', 'crush'] },
    sprite: blob('#100a18', '#6a3a8a', '#3a1a50', '#ffd166', 24),
  },
  {
    id: 'wasp_queen',
    name: 'Осиная королева',
    hp: 55,
    location: 'hive',
    rank: 'elite',
    actions: [
      act('sting', 'Жало', [
        { type: 'attack', amount: 9 },
        { type: 'debuff', status: 'bleed', value: 2, turns: 2 },
      ]),
      act('command', 'Приказ', [{ type: 'summon', enemyId: 'wasp', count: 1 }], (ctx) => hasRoom(ctx) && countKind(ctx, 'wasp') < 2),
      act('pheromones', 'Феромоны', [{ type: 'buffStr', amount: 2, target: 'allies' }]),
    ],
    ai: { type: 'cycle', order: ['sting', 'command', 'pheromones'] },
    sprite: blob('#1a1020', '#e0b030', '#9a7010', '#ff3050', 22),
  },
  {
    id: 'hive_heart',
    name: 'Сердце улья',
    hp: 100,
    location: 'hive',
    rank: 'boss',
    actions: [
      act('slam', 'Удар щупальцем', [{ type: 'attack', amount: 11 }]),
      withFx({ kind: 'flask', color: '#b5e61d' }, act('acid_rain', 'Кислотный дождь', [
        { type: 'attack', amount: 6 },
        { type: 'debuff', status: 'burn', value: 3, turns: 3 },
      ])),
      act('brood', 'Выводок', [{ type: 'summon', enemyId: 'larva', count: 2 }]),
      act('chitin', 'Хитин', [{ type: 'block', amount: 14 }]),
      act('frenzy', 'Феромон ярости', [{ type: 'buffStr', amount: 3, target: 'allies' }]),
    ],
    ai: {
      type: 'boss',
      rules: [
        { action: 'slam', weight: 3 },
        { action: 'acid_rain', weight: 2 },
        { action: 'brood', weight: 3, condition: (ctx) => hasRoom(ctx) && minions(ctx) < 2 },
        { action: 'chitin', weight: 2, cooldown: 3 },
        { action: 'frenzy', weight: 1, cooldown: 4, maxUses: 2 },
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
    actions: [act('cutlass', 'Сабля', [{ type: 'attack', amount: 12 }]), act('rum', 'Глоток рома', [{ type: 'heal', amount: 8, target: 'self' }], hurt)],
    ai: { type: 'cycle', order: ['cutlass', 'cutlass', 'rum'] },
    sprite: humanoid('hood', { s: '#d9a06b', h: '#a02030', b: '#3a3a5a', l: '#2a2a3a', w: '#c0c0c0' }),
  },
  {
    id: 'gunner',
    name: 'Канонир',
    hp: 36,
    location: 'ship',
    rank: 'normal',
    actions: [
      act('load', 'Заряжает пушку', [{ type: 'none' }]),
      act('volley', 'Пушечный залп', [{ type: 'attack', amount: 16 }]),
      act('grapeshot', 'Картечь', [{ type: 'attack', amount: 5, hits: 2 }]),
    ],
    ai: { type: 'cycle', order: ['load', 'volley', 'grapeshot'] },
    sprite: humanoid('hat', { s: '#e8b88a', h: '#2a2a3a', b: '#5a3a2a', l: '#2a2a3a', w: '#4a4a4a' }),
  },
  {
    id: 'bosun',
    name: 'Боцман',
    hp: 50,
    location: 'ship',
    rank: 'normal',
    actions: [act('whip', 'Плеть', [{ type: 'attack', amount: 9, hits: 2 }]), act('order', 'Приказ', [{ type: 'buffStr', amount: 3, target: 'allies' }])],
    ai: { type: 'cycle', order: ['whip', 'order', 'whip'] },
    sprite: humanoid('plume', { s: '#c9946b', h: '#3a2a1a', b: '#6a2a2a', l: '#2a2a3a', w: '#8a5a2a' }),
  },
  {
    id: 'parrot',
    name: 'Попугай',
    hp: 20,
    location: 'ship',
    rank: 'normal',
    actions: [
      act('peck', 'Клюв', [{ type: 'attack', amount: 6 }]),
      act('screech', 'Крик', [
        { type: 'debuff', status: 'weak', value: 1, turns: 1 },
        { type: 'drainMp', amount: 2 },
      ]),
      act('flutter', 'Порхание', [{ type: 'dodge', value: 1 }]),
    ],
    ai: { type: 'cycle', order: ['peck', 'screech', 'flutter'] },
    sprite: blob('#101010', '#e03030', '#2060c0', '#ffd166', 12),
  },
  {
    id: 'powder_monkey',
    name: 'Пороховая мартышка',
    hp: 22,
    location: 'ship',
    rank: 'normal',
    actions: [
      act('throw', 'Бросок бочонка', [
        { type: 'attack', amount: 8 },
        { type: 'debuff', status: 'burn', value: 2, turns: 2 },
      ]),
      act('boom', 'Подрыв', [{ type: 'selfDestruct', amount: 20, burn: 3 }]),
    ],
    ai: { type: 'cycle', order: ['throw', 'boom'] },
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
    actions: [
      act('song', 'Песнь', [
        { type: 'debuff', status: 'vulnerable', value: 1, turns: 2 },
        { type: 'drainMp', amount: 3 },
      ]),
      act('claws', 'Когти', [{ type: 'attack', amount: 10 }]),
    ],
    ai: { type: 'cycle', order: ['song', 'claws'] },
    sprite: humanoid('bare', { s: '#7ad0c0', h: '#20706a', b: '#2a8a80', l: '#1a5a55', w: '#c0f0e0' }),
  },
  {
    id: 'tentacle',
    name: 'Щупальце кракена',
    hp: 60,
    location: 'ship',
    rank: 'normal',
    actions: [
      act('slam', 'Удар щупальцем', [{ type: 'attack', amount: 14 }]),
      act('grab', 'Захват', [
        { type: 'attack', amount: 8 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      act('submerge', 'Уход под воду', [{ type: 'block', amount: 20 }]),
    ],
    ai: { type: 'cycle', order: ['slam', 'grab', 'submerge'] },
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
    actions: [
      withFx({ kind: 'melee', color: '#dcdcdc' }, act('twin_blades', 'Два клинка', [{ type: 'attack', amount: 9, hits: 2 }])),
      act('parry', 'Парирование', [
        { type: 'block', amount: 14 },
        { type: 'thorns', amount: 3 },
      ]),
      withFx({ kind: 'melee', color: '#dcdcdc' }, act('lunge', 'Выпад', [{ type: 'attack', amount: 14, pierce: true }])),
    ],
    ai: { type: 'cycle', order: ['twin_blades', 'parry', 'lunge'] },
    sprite: humanoid('hood', { s: '#d9a06b', h: '#1a1a2a', b: '#2a2a4a', l: '#1a1a2a', w: '#e0e0e0' }),
  },
  {
    id: 'sea_devil',
    name: 'Морской дьявол',
    hp: 100,
    location: 'ship',
    rank: 'elite',
    actions: [
      withFx({ kind: 'melee', color: '#5ee0d0' }, act('trident', 'Трезубец', [{ type: 'attack', amount: 16 }])),
      act('wave', 'Волна', [
        { type: 'attack', amount: 10 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      act('storm', 'Шторм', [{ type: 'block', amount: 16 }]),
    ],
    ai: { type: 'cycle', order: ['trident', 'wave', 'storm', 'trident'] },
    sprite: humanoid('horns', { s: '#3a8a8a', h: '#1a4a4a', b: '#1a5a6a', l: '#0a3a3a', w: '#c0f0ff' }),
  },
  {
    id: 'cursed_captain',
    name: 'Проклятый капитан',
    hp: 150,
    location: 'ship',
    rank: 'boss',
    actions: [
      withFx({ kind: 'melee', color: '#c9ccd1' }, act('sabre', 'Абордажная сабля', [{ type: 'attack', amount: 18 }])),
      withFx({ kind: 'orb', color: '#ffb347' }, act('pistol', 'Пистоль', [{ type: 'attack', amount: 12, pierce: true }])),
      act('all_hands', 'Свистать всех наверх', [{ type: 'summon', enemyId: 'pirate', count: 1 }]),
      act('aim', 'Наводит пушки', [{ type: 'none' }]),
      withFx({ kind: 'orb', color: '#ff7b00' }, act('broadside', 'Бортовой залп', [{ type: 'attack', amount: 28 }])),
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
    sprite: humanoid('hat', { o: '#0e0e16', e: '#5cf0ff', s: '#8fa8a0', h: '#1a1a2a', b: '#3a1a2a', l: '#1a1a2a', w: '#d4af37' }),
  },
];

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(list.map((e) => [e.id, e]));
export const ENEMY_LIST: EnemyDef[] = list;

export function enemyDef(id: string): EnemyDef {
  const def = ENEMIES[id];
  if (!def) throw new Error(`Unknown enemy: ${id}`);
  return def;
}

export function enemyAction(def: EnemyDef, actionId: string): EnemyAction {
  const a = def.actions.find((x) => x.id === actionId);
  if (!a) throw new Error(`Enemy ${def.id} has no action ${actionId}`);
  return a;
}
