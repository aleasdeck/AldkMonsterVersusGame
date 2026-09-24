import { h } from './dom';
import type { ArtifactInstance, DerivedStats, GearInstance, HeroDef } from '../engine/types';
import { artifactCostText, artifactDef } from '../data/artifacts';
import { ART_TIER_COLORS, GEAR_TIERS, gearPerkText } from '../data/gear';
import { artifactChip, gearStatInfo, gearTypeIcon, perkLine, reachDots, socketChip, tierTip } from './components';
import { slotKindAt } from '../engine/equipment';
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
      case 'detonate':
        return e.target === 'allEnemies' ? 'взрыв ран всем' : 'взрыв ран';
      case 'spread':
        return e.statuses.includes('bleed') ? 'кровь на всех' : 'заражение';
      case 'scorch':
        return `огонь цели ×${e.mult}`;
      case 'breakBlock':
        return `блок цели ×${e.mult}`;
      case 'finisher':
        return `${Math.max(1, Math.round((((s.dmgMin + s.dmgMax) / 2 + s.str) * e.pct) / 100))} × атаки`;
      case 'chain':
        return `${e.amount} вдогонку`;
      case 'enchant':
        return `стихия ${e.value}`;
      case 'push':
        return 'толчок назад';
      case 'amplify':
        return `яд ×${e.mult}`;
      case 'blockBurst':
        return `блок ×${e.pct} всем`;
      default:
        continue;
    }
  }
  return artifactCostText(def, inst.tier);
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

/**
 * Плитка экипировки листа «Персонаж»: иконка, имя, бейдж типа, кубик в руках героя или защита, строка перка и артефакты
 * списком с описаниями. Плитка консоли — hubGearTile в cards.ts.
 */
export function gearTile(gear: GearInstance, def: HeroDef, s: DerivedStats): HTMLElement {
  const info = GEAR_TIERS[gear.tier];
  const isWeapon = gear.kind === 'weapon';
  // Статы той же строкой, что и в карточке награды: «Урон 4–6, ✦ +1 Сила» / «+2 DEF, +4 HP».
  const st = gearStatInfo(gear, def);
  const stats = h('span', st.tip ? { class: 'gt-dice', tip: st.tip } : { class: 'gt-dice' }, st.text);
  const perk = perkLine(gear, def) ?? (gearPerkText(gear) ? null : h('div', { class: 'card-perk dim' }, 'без перка'));
  return h(
    'div',
    { class: `gear-tile ${isWeapon ? 'weapon' : 'armor'}`, style: `border-color:${info.color}` },
    h('div', { class: 'gt-head' }, h('span', { class: 'glyph' }, isWeapon ? '⚔' : '⛨'), h('span', { class: 'gt-name', tip: tierTip(gear.tier) }, gear.name), gearTypeIcon(gear, def), reachDots(gear, def), stats),
    perk,
    h('div', { class: 'art-list' }, ...gear.slots.map((a, i) => (a ? artifactRow(a, s) : h('div', { class: 'art-row empty' }, socketChip(slotKindAt(gear, i)), h('span', { class: 'dim' }, 'свободный сокет'))))),
  );
}
