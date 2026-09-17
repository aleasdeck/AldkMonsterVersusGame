import type { PotionDef } from '../engine/types';

/**
 * Зелья: расходники без тира. Один слот у героя, пьются в бою бесплатно (не тратят стамину, не считаются атакой)
 * и пропадают. Числа плоские, а не по тиру: зелье — аварийная кнопка, а не часть билда.
 */
const list: PotionDef[] = [
  {
    id: 'heal_potion',
    fx: { color: '#e63946' },
    name: 'Зелье лечения',
    glyph: '♥',
    effects: [{ type: 'heal', amount: 15 }],
    describe: 'Восстанавливает 15 HP.',
  },
  {
    id: 'strength_potion',
    fx: { color: '#f9a825' },
    name: 'Зелье силы',
    glyph: '↟',
    effects: [{ type: 'status', target: 'self', status: 'strength', value: 3, turns: -1 }],
    describe: '+3 к Силе до конца боя.',
  },
  {
    id: 'stamina_potion',
    fx: { color: '#ffd166' },
    name: 'Зелье бодрости',
    glyph: '⚡',
    effects: [{ type: 'gainSta', amount: 2 }],
    describe: '+2 стамины прямо сейчас.',
  },
  {
    id: 'mana_potion',
    fx: { color: '#4cc9f0' },
    name: 'Зелье маны',
    glyph: '❋',
    effects: [{ type: 'gainMp', amount: 6 }],
    describe: '+6 маны прямо сейчас.',
    needsMp: true,
  },
  {
    id: 'stone_skin',
    fx: { color: '#9aa0a6' },
    name: 'Каменная кожа',
    glyph: '⬢',
    effects: [{ type: 'block', amount: 10 }],
    describe: '+10 блока до начала следующего хода.',
  },
  {
    id: 'fire_flask',
    fx: { color: '#ff7b00' },
    name: 'Огненная склянка',
    glyph: '✹',
    // v0.40.5 (просьба пользователя): меньше урона в лоб, зато поджигает — склянка стала заводкой огня (Взрыв пламени,
    // Раздуть) и бьёт мимо блока второй половиной. Суммарно 5 + 3 × 2 = 11 на каждого против прежних 8 разом.
    effects: [
      { type: 'spell', amount: 5, target: 'allEnemies' },
      { type: 'status', target: 'allEnemies', status: 'burn', value: 3, turns: 2 },
    ],
    describe: '5 урона заклинанием всем врагам и Горение 3 на 2 хода. Выводит из скрытности.',
  },
  {
    id: 'antidote',
    fx: { color: '#7ddc5a' },
    name: 'Противоядие',
    glyph: '☤',
    effects: [{ type: 'cleanse' }],
    describe: 'Снимает кровотечение, горение, яд, слабость и изнурение.',
  },
];

export const POTIONS: Record<string, PotionDef> = Object.fromEntries(list.map((p) => [p.id, p]));
export const POTION_IDS: string[] = list.map((p) => p.id);

export function potionDef(id: string): PotionDef {
  const def = POTIONS[id];
  if (!def) throw new Error(`Unknown potion: ${id}`);
  return def;
}
