import type { PotionDef } from '../engine/types';

/**
 * Зелья: расходники без тира. Один слот у героя, пьются в бою бесплатно (не тратят стамину, не считаются атакой)
 * и пропадают. Числа плоские, а не по тиру: зелье — аварийная кнопка, а не часть билда.
 */
const list: PotionDef[] = [
  {
    id: 'heal_potion',
    name: 'Зелье лечения',
    glyph: '♥',
    effects: [{ type: 'heal', amount: 15 }],
    describe: 'Восстанавливает 15 HP.',
  },
  {
    id: 'strength_potion',
    name: 'Зелье силы',
    glyph: '↟',
    effects: [{ type: 'status', target: 'self', status: 'strength', value: 3, turns: -1 }],
    describe: '+3 к Силе до конца боя.',
  },
  {
    id: 'stamina_potion',
    name: 'Зелье бодрости',
    glyph: '⚡',
    effects: [{ type: 'gainSta', amount: 2 }],
    describe: '+2 стамины прямо сейчас.',
  },
  {
    id: 'mana_potion',
    name: 'Зелье маны',
    glyph: '❋',
    effects: [{ type: 'gainMp', amount: 6 }],
    describe: '+6 маны прямо сейчас.',
    needsMp: true,
  },
  {
    id: 'stone_skin',
    name: 'Каменная кожа',
    glyph: '⬢',
    effects: [{ type: 'block', amount: 10 }],
    describe: '+10 блока до начала следующего хода.',
  },
  {
    id: 'fire_flask',
    name: 'Огненная склянка',
    glyph: '✹',
    effects: [{ type: 'spell', amount: 8, target: 'allEnemies' }],
    describe: '8 урона заклинанием всем врагам. Выводит из скрытности.',
  },
  {
    id: 'antidote',
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
