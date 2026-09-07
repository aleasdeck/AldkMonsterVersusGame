import type { ArtTier, ArtifactDef } from '../engine/types';

const t = (a: number, b: number, c: number) => (tier: ArtTier) => [a, b, c][tier - 1];

const list: ArtifactDef[] = [
  // ─── Пассивные ───────────────────────────────────────────────────────────
  {
    id: 'strength_stone',
    name: 'Камень силы',
    glyph: '✊',
    kind: 'passive',
    mods: (tier) => ({ str: t(2, 4, 6)(tier) }),
    describe: (tier) => `+${t(2, 4, 6)(tier)} к Силе`,
  },
  {
    id: 'troll_heart',
    name: 'Сердце тролля',
    glyph: '♥',
    kind: 'passive',
    mods: (tier) => ({ maxHp: t(6, 12, 18)(tier) }),
    describe: (tier) => `+${t(6, 12, 18)(tier)} к максимуму HP`,
  },
  {
    id: 'turtle_shell',
    name: 'Панцирь черепахи',
    glyph: '◐',
    kind: 'passive',
    mods: (tier) => ({ def: t(2, 3, 4)(tier) }),
    describe: (tier) => `+${t(2, 3, 4)(tier)} к Защите (блок за «Защититься»)`,
  },
  {
    id: 'mana_crystal',
    name: 'Кристалл маны',
    glyph: '◆',
    kind: 'passive',
    mods: (tier) => ({ maxMp: t(3, 6, 9)(tier) }),
    describe: (tier) => `+${t(3, 6, 9)(tier)} к максимуму маны`,
  },
  {
    id: 'mana_rune',
    name: 'Руна восполнения',
    glyph: 'ᚱ',
    kind: 'passive',
    mods: (tier) => ({ mpRegen: t(1, 2, 3)(tier) }),
    describe: (tier) => `+${t(1, 2, 3)(tier)} к регену маны за ход`,
  },
  {
    id: 'stamina_ring',
    name: 'Кольцо выносливости',
    glyph: '◎',
    kind: 'passive',
    mods: (tier) => ({ firstTurnSta: t(1, 2, 3)(tier) }),
    describe: (tier) => `+${t(1, 2, 3)(tier)} стамины в первый ход боя`,
  },
  {
    id: 'thorns',
    name: 'Шипы',
    glyph: '✱',
    kind: 'passive',
    mods: (tier) => ({ thorns: t(1, 2, 3)(tier) }),
    describe: (tier) => `Атакующий получает ${t(1, 2, 3)(tier)} урона`,
  },
  {
    id: 'vampire_fang',
    name: 'Вампирский клык',
    glyph: '⌇',
    kind: 'passive',
    mods: (tier) => ({ lifesteal: t(1, 2, 3)(tier) }),
    describe: (tier) => `Базовая атака лечит на ${t(1, 2, 3)(tier)}`,
  },
  {
    id: 'regen_amulet',
    name: 'Амулет регенерации',
    glyph: '✚',
    kind: 'passive',
    mods: (tier) => ({ regen: t(1, 2, 3)(tier) }),
    describe: (tier) => `+${t(1, 2, 3)(tier)} HP в начале каждого хода`,
  },
  {
    id: 'luck_talisman',
    name: 'Талисман удачи',
    glyph: '☘',
    kind: 'passive',
    mods: (tier) => ({ crit: t(0.15, 0.3, 0.45)(tier) }),
    describe: (tier) => `Шанс крита ${Math.round(t(15, 30, 45)(tier))} % (урон ×2)`,
  },
  {
    id: 'sage_eye',
    name: 'Око мудреца',
    glyph: '◉',
    kind: 'passive',
    mods: (tier) => ({ spellPower: t(1, 2, 3)(tier) }),
    describe: (tier) => `+${t(1, 2, 3)(tier)} к урону заклинаний`,
  },

  // ─── Активные физические (STA) ───────────────────────────────────────────
  {
    id: 'heavy_strike',
    name: 'Мощный удар',
    glyph: '⚒',
    kind: 'active',
    school: 'physical',
    cost: { sta: 2 },
    target: 'enemy',
    effects: (tier) => [{ type: 'attack', bonus: t(6, 9, 12)(tier), target: 'enemy' }],
    describe: (tier) => `Атака +${t(6, 9, 12)(tier)} урона по цели`,
  },
  {
    id: 'whirlwind',
    name: 'Вихрь',
    glyph: '๑',
    kind: 'active',
    school: 'physical',
    cost: { sta: 2 },
    target: 'allEnemies',
    effects: (tier) => [{ type: 'attack', bonus: t(0, 2, 4)(tier), target: 'allEnemies' }],
    describe: (tier) => `Атака +${t(0, 2, 4)(tier)} по всем врагам`,
  },
  {
    id: 'stun_strike',
    name: 'Оглушающий удар',
    glyph: '✴',
    kind: 'active',
    school: 'physical',
    cost: { sta: 2 },
    cooldown: () => 3,
    target: 'enemy',
    effects: (tier) => [
      { type: 'attack', bonus: t(0, 3, 6)(tier), target: 'enemy' },
      { type: 'status', target: 'enemy', status: 'stun', value: 1, turns: -1 },
    ],
    describe: (tier) => `Атака +${t(0, 3, 6)(tier)}, цель пропускает следующее действие. КД 3`,
  },
  {
    id: 'bleed_cut',
    name: 'Кровопускание',
    glyph: '⚕',
    kind: 'active',
    school: 'physical',
    cost: { sta: 1 },
    target: 'enemy',
    effects: (tier) => [{ type: 'status', target: 'enemy', status: 'bleed', value: t(3, 4, 5)(tier), turns: 3 }],
    describe: (tier) => `Кровотечение ${t(3, 4, 5)(tier)} на 3 хода (стакается)`,
  },
  {
    id: 'war_cry',
    name: 'Боевой клич',
    glyph: '♪',
    kind: 'active',
    school: 'physical',
    cost: { sta: 1 },
    cooldown: () => 3,
    target: 'self',
    effects: (tier) => [{ type: 'status', target: 'self', status: 'strength', value: t(2, 3, 4)(tier), turns: 2 }],
    describe: (tier) => `+${t(2, 3, 4)(tier)} к Силе на этот и следующий ход. КД 3`,
  },
  {
    id: 'second_wind',
    name: 'Второе дыхание',
    glyph: '↻',
    kind: 'active',
    school: 'physical',
    cost: { sta: 0 },
    cooldown: () => 4,
    target: 'self',
    effects: (tier) => [{ type: 'gainSta', amount: t(2, 3, 4)(tier) }],
    describe: (tier) => `+${t(2, 3, 4)(tier)} стамины. КД 4`,
  },

  // ─── Активные магические (MP) ────────────────────────────────────────────
  {
    id: 'fireball',
    name: 'Огненный шар',
    glyph: '✹',
    kind: 'active',
    school: 'magic',
    cost: { mp: 2 },
    cooldown: () => 1,
    target: 'enemy',
    effects: (tier) => [{ type: 'spell', amount: t(7, 10, 13)(tier), target: 'enemy' }],
    describe: (tier) => `${t(7, 10, 13)(tier)} урона заклинанием. Раз в ход`,
  },
  {
    id: 'ice_shard',
    name: 'Ледяной осколок',
    glyph: '❄',
    kind: 'active',
    school: 'magic',
    cost: { mp: 2 },
    cooldown: () => 1,
    target: 'enemy',
    effects: (tier) => [
      { type: 'spell', amount: t(3, 5, 7)(tier), target: 'enemy' },
      { type: 'status', target: 'enemy', status: 'weak', value: 1, turns: t(1, 2, 3)(tier) },
    ],
    describe: (tier) => `${t(3, 5, 7)(tier)} урона и Слабость на ${t(1, 2, 3)(tier)} ход(а). Раз в ход`,
  },
  {
    id: 'heal',
    name: 'Лечение',
    glyph: '✙',
    kind: 'active',
    school: 'magic',
    cost: { mp: 3, sta: 1 },
    cooldown: () => 3,
    target: 'self',
    effects: (tier) => [{ type: 'heal', amount: t(5, 7, 9)(tier) }],
    describe: (tier) => `Восстанавливает ${t(5, 7, 9)(tier)} HP. КД 3`,
  },
  {
    id: 'mana_shield',
    name: 'Магический щит',
    glyph: '⬡',
    kind: 'active',
    school: 'magic',
    cost: { mp: 2 },
    cooldown: () => 1,
    target: 'self',
    effects: (tier) => [{ type: 'block', amount: t(5, 8, 11)(tier) }],
    describe: (tier) => `+${t(5, 8, 11)(tier)} Блока. Раз в ход`,
  },
  {
    id: 'chain_lightning',
    name: 'Цепная молния',
    glyph: 'ϟ',
    kind: 'active',
    school: 'magic',
    cost: { mp: 4 },
    cooldown: () => 2,
    target: 'allEnemies',
    effects: (tier) => [{ type: 'spell', amount: t(4, 6, 8)(tier), target: 'allEnemies' }],
    describe: (tier) => `${t(4, 6, 8)(tier)} урона всем врагам. КД 2`,
  },
  {
    id: 'drain',
    name: 'Высасывание',
    glyph: '☽',
    kind: 'active',
    school: 'magic',
    cost: { mp: 3 },
    cooldown: () => 2,
    target: 'enemy',
    effects: (tier) => [{ type: 'spell', amount: t(4, 6, 8)(tier), target: 'enemy', drain: true }],
    describe: (tier) => `${t(4, 6, 8)(tier)} урона, лечит на столько же. КД 2`,
  },
  {
    id: 'dodge',
    name: 'Уклонение',
    glyph: '⤳',
    kind: 'active',
    school: 'magic',
    cost: { mp: 2 },
    cooldown: (tier) => t(3, 2, 1)(tier),
    target: 'self',
    effects: () => [{ type: 'status', target: 'self', status: 'dodge', value: 1, turns: -1 }],
    describe: (tier) => `Следующая атака по герою не наносит урона. КД ${t(3, 2, 1)(tier)}`,
  },
];

export const ARTIFACTS: Record<string, ArtifactDef> = Object.fromEntries(list.map((a) => [a.id, a]));
export const ARTIFACT_IDS: string[] = list.map((a) => a.id);

export function artifactDef(id: string): ArtifactDef {
  const def = ARTIFACTS[id];
  if (!def) throw new Error(`Unknown artifact: ${id}`);
  return def;
}

export function artifactCostText(def: ArtifactDef): string {
  if (def.kind !== 'active') return '';
  const parts: string[] = [];
  if (def.cost?.sta) parts.push(`${def.cost.sta} STA`);
  if (def.cost?.mp) parts.push(`${def.cost.mp} MP`);
  if (parts.length === 0) parts.push('0 STA');
  return parts.join(', ');
}
