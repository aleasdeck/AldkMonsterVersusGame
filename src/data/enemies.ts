import type { AiCtx, EnemyAction, EnemyDef, EnemyEffect } from '../engine/types';
import { MAX_ENEMIES } from '../engine/types';

function act(id: string, name: string, effects: EnemyEffect[], condition?: (ctx: AiCtx) => boolean): EnemyAction {
  return condition ? { id, name, effects, condition } : { id, name, effects };
}

const hasRoom = (ctx: AiCtx) => ctx.enemies.length < MAX_ENEMIES;
const countKind = (ctx: AiCtx, defId: string) => ctx.enemies.filter((e) => e.defId === defId).length;
const minions = (ctx: AiCtx) => ctx.enemies.filter((e) => e.uid !== ctx.self.uid).length;

const list: EnemyDef[] = [
  // ─── Лес ─────────────────────────────────────────────────────────────────
  {
    id: 'wolf',
    name: 'Волк',
    hp: 12,
    location: 'forest',
    rank: 'normal',
    actions: [
      act('bite', 'Укус', [{ type: 'attack', amount: 5 }]),
      act('howl', 'Вой', [{ type: 'buffStr', amount: 2, target: 'kind' }]),
    ],
    ai: { type: 'cycle', order: ['bite', 'bite', 'howl'] },
    sprite: { type: 'blob', palette: { outline: '#1a1a22', body: '#8a8f98', shade: '#5d626b', eye: '#ffd166' } },
  },
  {
    id: 'boar',
    name: 'Кабан',
    hp: 18,
    location: 'forest',
    rank: 'normal',
    actions: [
      act('ram', 'Таран', [{ type: 'attack', amount: 7 }]),
      act('bristle', 'Щетина', [{ type: 'block', amount: 5 }]),
    ],
    ai: { type: 'cycle', order: ['ram', 'bristle'] },
    sprite: { type: 'blob', palette: { outline: '#1f1410', body: '#7a5230', shade: '#4e3320', eye: '#f4a261' } },
  },
  {
    id: 'bandit_archer',
    name: 'Бандит-лучник',
    hp: 10,
    location: 'forest',
    rank: 'normal',
    actions: [
      act('shoot', 'Выстрел', [{ type: 'attack', amount: 4 }]),
      act('aim', 'Прицел', [{ type: 'buffStr', amount: 4, target: 'self' }]),
    ],
    ai: { type: 'cycle', order: ['shoot', 'aim', 'shoot'] },
    sprite: {
      type: 'humanoid',
      head: 'hood',
      palette: { o: '#1b1b2a', e: '#1a1a1a', s: '#e8b88a', h: '#3a5a40', b: '#6b4f3a', l: '#2f2f2f', w: '#a67c52' },
    },
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
    sprite: {
      type: 'humanoid',
      head: 'bare',
      palette: { o: '#1b1b2a', e: '#1a1a1a', s: '#d9a06b', h: '#2b1d14', b: '#8b1e2d', l: '#2f2f2f', w: '#c0c0c0' },
    },
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
    sprite: { type: 'blob', size: 20, palette: { outline: '#14100c', body: '#5b3a1e', shade: '#3b2613', eye: '#ffe8a3' } },
  },
  {
    id: 'alpha_wolf',
    name: 'Вожак стаи',
    hp: 65,
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
        { action: 'rage', weight: 2, cooldown: 3 },
      ],
    },
    sprite: { type: 'blob', size: 24, palette: { outline: '#111118', body: '#4a4e69', shade: '#2b2d42', eye: '#ff3b3b' } },
  },

  // ─── Склеп ───────────────────────────────────────────────────────────────
  {
    id: 'skeleton_warrior',
    name: 'Скелет-воин',
    hp: 20,
    location: 'crypt',
    rank: 'normal',
    actions: [
      act('slash', 'Удар мечом', [{ type: 'attack', amount: 7 }]),
      act('guard', 'Блок', [{ type: 'block', amount: 6 }]),
    ],
    ai: { type: 'cycle', order: ['slash', 'guard'] },
    sprite: {
      type: 'humanoid',
      head: 'skull',
      palette: { o: '#22222a', e: '#111111', s: '#e8e4d8', h: '#e8e4d8', b: '#bdb7a6', l: '#d8d3c5', w: '#9aa0a6' },
    },
  },
  {
    id: 'skeleton_archer',
    name: 'Скелет-лучник',
    hp: 14,
    location: 'crypt',
    rank: 'normal',
    actions: [
      act('shoot', 'Выстрел', [{ type: 'attack', amount: 5 }]),
      act('volley', 'Залп', [{ type: 'attack', amount: 3, hits: 2 }]),
    ],
    ai: { type: 'cycle', order: ['shoot', 'volley'] },
    sprite: {
      type: 'humanoid',
      head: 'skull',
      palette: { o: '#22222a', e: '#111111', s: '#e8e4d8', h: '#e8e4d8', b: '#8f8a7c', l: '#d8d3c5', w: '#a67c52' },
    },
  },
  {
    id: 'ghost',
    name: 'Призрак',
    hp: 16,
    location: 'crypt',
    rank: 'normal',
    actions: [
      act('touch', 'Касание', [
        { type: 'attack', amount: 5 },
        { type: 'debuff', status: 'weak', value: 1, turns: 2 },
      ]),
      act('vanish', 'Бестелесность', [{ type: 'block', amount: 20 }]),
    ],
    ai: { type: 'cycle', order: ['touch', 'vanish'] },
    sprite: { type: 'blob', palette: { outline: '#3a4a6b', body: '#c9d6ff', shade: '#8fa3d6', eye: '#1b1f3a' } },
  },
  {
    id: 'ghoul',
    name: 'Гуль',
    hp: 24,
    location: 'crypt',
    rank: 'normal',
    actions: [
      act('bite', 'Укус', [
        { type: 'attack', amount: 6 },
        { type: 'heal', amount: 3, target: 'self' },
      ]),
      act('claws', 'Когти', [{ type: 'attack', amount: 4, hits: 2 }]),
    ],
    ai: { type: 'cycle', order: ['bite', 'claws'] },
    sprite: { type: 'blob', palette: { outline: '#14200f', body: '#7a9a5a', shade: '#4d6b36', eye: '#ff5555' } },
  },
  {
    id: 'necromancer',
    name: 'Некромант',
    hp: 30,
    location: 'crypt',
    rank: 'elite',
    actions: [
      act('bolt', 'Тёмная стрела', [{ type: 'attack', amount: 7 }]),
      act(
        'raise',
        'Поднять скелета',
        [{ type: 'summon', enemyId: 'skeleton_warrior', count: 1 }],
        (ctx) => hasRoom(ctx) && countKind(ctx, 'skeleton_warrior') < 2,
      ),
      act('curse', 'Проклятие', [{ type: 'debuff', status: 'weak', value: 1, turns: 2 }]),
    ],
    ai: { type: 'cycle', order: ['bolt', 'raise', 'curse'] },
    sprite: {
      type: 'humanoid',
      head: 'hood',
      palette: { o: '#1b1b2a', e: '#111111', s: '#cdbde0', h: '#2d1b4e', b: '#1e1433', l: '#120b22', w: '#7cf0a0' },
    },
  },
  {
    id: 'lich',
    name: 'Лич',
    hp: 95,
    location: 'crypt',
    rank: 'boss',
    actions: [
      act('ray', 'Тёмный луч', [{ type: 'attack', amount: 10 }]),
      act('wither', 'Иссушение', [
        { type: 'attack', amount: 6 },
        { type: 'drainMp', amount: 3 },
      ]),
      act('raise_dead', 'Поднять мёртвых', [{ type: 'summon', enemyId: 'skeleton_archer', count: 2 }]),
      act('bone_shield', 'Костяной щит', [{ type: 'block', amount: 12 }]),
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
    sprite: {
      type: 'humanoid',
      head: 'crown',
      palette: { o: '#0e0e16', e: '#5cf0ff', s: '#b8c0c8', h: '#d4af37', b: '#24143f', l: '#160b28', w: '#d4af37' },
    },
  },

  // ─── Пещеры огня ─────────────────────────────────────────────────────────
  {
    id: 'imp',
    name: 'Имп',
    hp: 14,
    location: 'caves',
    rank: 'normal',
    actions: [
      act('spit', 'Огненный плевок', [{ type: 'attack', amount: 6 }]),
      act('mischief', 'Пакость', [{ type: 'debuff', status: 'burn', value: 2, turns: 3 }]),
    ],
    ai: { type: 'cycle', order: ['spit', 'mischief'] },
    sprite: { type: 'blob', palette: { outline: '#2a0a0a', body: '#c0392b', shade: '#7b1e1e', eye: '#ffe066' } },
  },
  {
    id: 'salamander',
    name: 'Саламандра',
    hp: 26,
    location: 'caves',
    rank: 'normal',
    actions: [
      act('breath', 'Огненное дыхание', [
        { type: 'attack', amount: 8 },
        { type: 'debuff', status: 'burn', value: 2, turns: 3 },
      ]),
      act('curl', 'Свернуться', [{ type: 'block', amount: 8 }]),
    ],
    ai: { type: 'cycle', order: ['breath', 'curl'] },
    sprite: { type: 'blob', palette: { outline: '#2a1200', body: '#e07b39', shade: '#a34e14', eye: '#fff2a8' } },
  },
  {
    id: 'cultist',
    name: 'Культист',
    hp: 18,
    location: 'caves',
    rank: 'normal',
    actions: [
      act('dagger', 'Кинжал', [{ type: 'attack', amount: 5 }]),
      act('sacrifice', 'Жертва', [{ type: 'buffStr', amount: 2, target: 'allies' }]),
      act('prayer', 'Тёмная молитва', [{ type: 'heal', amount: 6, target: 'allies' }]),
    ],
    ai: { type: 'cycle', order: ['dagger', 'sacrifice', 'prayer'] },
    sprite: {
      type: 'humanoid',
      head: 'hood',
      palette: { o: '#1b1b2a', e: '#111111', s: '#e0b48a', h: '#5a0f1a', b: '#7a1a2a', l: '#2a0a10', w: '#c0c0c0' },
    },
  },
  {
    id: 'golem',
    name: 'Каменный голем',
    hp: 40,
    location: 'caves',
    rank: 'normal',
    actions: [
      act('fist', 'Кулак', [{ type: 'attack', amount: 10 }]),
      act('stone_skin', 'Каменная кожа', [{ type: 'block', amount: 10 }]),
      act('quake', 'Землетрясение', [
        { type: 'attack', amount: 7 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
    ],
    ai: { type: 'cycle', order: ['fist', 'stone_skin', 'quake'] },
    sprite: { type: 'blob', size: 20, palette: { outline: '#1a1a1a', body: '#7d7d7d', shade: '#505050', eye: '#ff9f1c' } },
  },
  {
    id: 'fire_elemental',
    name: 'Огненный элементаль',
    hp: 45,
    location: 'caves',
    rank: 'elite',
    actions: [
      act('flame', 'Пламя', [
        { type: 'attack', amount: 9 },
        { type: 'debuff', status: 'burn', value: 3, turns: 3 },
      ]),
      act('fire_shield', 'Огненный щит', [
        { type: 'block', amount: 8 },
        { type: 'thorns', amount: 2 },
      ]),
      act('burst', 'Взрыв', [{ type: 'attack', amount: 14 }]),
    ],
    ai: { type: 'cycle', order: ['flame', 'fire_shield', 'burst'] },
    sprite: { type: 'blob', size: 20, palette: { outline: '#3a0a00', body: '#ff7b00', shade: '#d63a00', eye: '#ffffff' } },
  },
  {
    id: 'dragon',
    name: 'Древний дракон',
    hp: 150,
    location: 'caves',
    rank: 'boss',
    actions: [
      act('breath', 'Дыхание', [
        { type: 'attack', amount: 16 },
        { type: 'debuff', status: 'burn', value: 3, turns: 3 },
      ]),
      act('claw', 'Коготь', [{ type: 'attack', amount: 7, hits: 2 }]),
      act('tail', 'Хвост', [
        { type: 'attack', amount: 10 },
        { type: 'debuff', status: 'exhaust', value: 1, turns: 1 },
      ]),
      act('takeoff', 'Взлёт', [{ type: 'invuln' }]),
      act('dive', 'Пикирование', [{ type: 'attack', amount: 22 }]),
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
    sprite: { type: 'blob', size: 24, palette: { outline: '#0d0d10', body: '#8b0000', shade: '#4a0000', eye: '#ffd700' } },
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
