import { h } from './dom';
import type { ArtifactInstance, DerivedStats, GearInstance, HeroDef } from '../engine/types';
import { artifactCostText, artifactDef } from '../data/artifacts';
import { ART_TIER_COLORS, GEAR_TIERS, gearPerkText } from '../data/gear';
import { artifactChip, gearStatInfo, gearTypeIcon, perkLine, tierTip } from './components';
import { markKeywords } from './keywords';

/**
 * Короткое число артефакта для сокета: «12–18», «5–8 всем», «+2 STA», у пассивных — описание.
 * Урон считается от статов героя вне боя: кубик оружия в его руках, Сила, бонус приёма.
 */
export function artifactShort(inst: ArtifactInstance, s: DerivedStats): string {
  const def = artifactDef(inst.id);
  if (def.kind !== 'active') return def.describe(inst.tier);
  for (const e of def.effects?.(inst.tier) ?? []) {
    switch (e.type) {
      case 'attack': {
        const mult = e.mult ?? 1;
        const min = Math.floor((s.dmgMin + s.str + e.bonus) * mult);
        const max = Math.floor((s.dmgMax + s.str + e.bonus) * mult);
        return `${min}–${max}${e.target === 'allEnemies' ? ' всем' : ''}`;
      }
      case 'spell':
        return `${e.amount + s.spellPower}${e.target === 'allEnemies' ? ' всем' : ''}`;
      case 'block':
        return `+${e.amount} блока`;
      case 'blockStrike':
        return `блок ×${e.mult}`;
      case 'heal':
        return `+${e.amount} HP`;
      case 'gainSta':
        return `+${e.amount} STA`;
      case 'gainMp':
        return `+${e.amount} MP`;
      case 'summon':
        return 'призыв';
      case 'cleanse':
        return 'снимает раны';
      case 'status':
        return e.target === 'self' ? 'бафф' : 'дебафф';
      case 'pull':
        return 'в первый ряд';
      default:
        continue;
    }
  }
  return artifactCostText(def, inst.tier);
}

/** Ячейка сокета: чип, имя и число артефакта; пустая — пунктирная. */
function socketCell(inst: ArtifactInstance | null, s: DerivedStats): HTMLElement {
  if (!inst) return h('div', { class: 'sock empty', tip: 'Свободный сокет: сюда встанет новый артефакт' }, artifactChip(null), h('span', { class: 'sock-name' }, 'свободный сокет'));
  const def = artifactDef(inst.id);
  return h('div', { class: 'sock' }, artifactChip(inst), h('span', { class: 'sock-name' }, def.name), h('span', { class: 'sock-val' }, artifactShort(inst, s)));
}

/**
 * Строка артефакта в оверлее: чип, имя с тиром и описание. Следующий тир не пишем — в панели мало места.
 * Число в шапке только у активных: у пассивных artifactShort() отдаёт то же описание, что и строкой ниже.
 */
function artifactRow(inst: ArtifactInstance, s: DerivedStats): HTMLElement {
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  return h(
    'div',
    { class: 'art-row' },
    artifactChip(inst),
    h(
      'div',
      { class: 'art-row-body' },
      h('div', { class: 'art-row-head' }, h('span', { class: 'art-row-name', style: `color:${color}` }, def.name), h('span', { class: 'dim' }, ` · тир ${inst.tier}`), def.kind === 'active' ? h('span', { class: 'card-cost' }, ` · ${artifactCostText(def, inst.tier)}`) : h('span', { class: 'dim' }, ' · пассивный'), def.kind === 'active' ? h('span', { class: 'sock-val' }, ` · ${artifactShort(inst, s)}`) : null),
      h('div', { class: 'art-row-desc' }, ...markKeywords(def.describe(inst.tier))),
    ),
  );
}

export interface GearTileOpts {
  /** Полный список артефактов с описаниями (оверлей «Персонаж»). */
  expanded?: boolean;
}

/**
 * Плитка экипировки: иконка, имя, бейдж тира и типа, кубик в руках героя или защита, строка перка,
 * сетка сокетов 2×2 с чипом, именем и числом артефакта. Ячейки под несуществующие сокеты не рисуются.
 */
export function gearTile(gear: GearInstance, def: HeroDef, s: DerivedStats, opts: GearTileOpts = {}): HTMLElement {
  const info = GEAR_TIERS[gear.tier];
  const isWeapon = gear.kind === 'weapon';
  // Статы той же строкой, что и в карточке награды: «Урон 4–6, ✦ +1 Сила» / «+2 DEF, +4 HP».
  const st = gearStatInfo(gear, def);
  const stats = h('span', st.tip ? { class: 'gt-dice', tip: st.tip } : { class: 'gt-dice' }, st.text);
  const perk = perkLine(gear, def) ?? (gearPerkText(gear) ? null : h('div', { class: 'card-perk dim' }, 'без перка'));
  return h(
    'div',
    { class: `gear-tile ${isWeapon ? 'weapon' : 'armor'}`, style: `border-color:${info.color}` },
    h('div', { class: 'gt-head' }, h('span', { class: 'glyph' }, isWeapon ? '⚔' : '⛨'), h('span', { class: 'gt-name', tip: tierTip(gear.tier) }, gear.name), gearTypeIcon(gear, def), stats),
    perk,
    opts.expanded
      ? h('div', { class: 'art-list' }, ...gear.slots.map((a) => (a ? artifactRow(a, s) : h('div', { class: 'art-row empty' }, artifactChip(null), h('span', { class: 'dim' }, 'свободный сокет')))))
      : h('div', { class: 'gt-sockets' }, ...gear.slots.map((a) => socketCell(a, s))),
  );
}

