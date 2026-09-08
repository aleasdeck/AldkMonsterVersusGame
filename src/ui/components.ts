import { button, h, type Child } from './dom';
import type { ArtTier, ArtifactInstance, Combatant, DerivedStats, GearInstance, GearTier, RunState, StatusId } from '../engine/types';
import { statusIcon } from './icons';
import { artifactCostText, artifactDef } from '../data/artifacts';
import { potionDef } from '../data/potions';
import {
  ARMOR_TYPE_GLYPHS,
  ARMOR_TYPE_NAMES,
  ART_TIER_COLORS,
  GEAR_TIERS,
  WEAPON_TYPE_GLYPHS,
  armorSkillTitle,
  armorType,
  armorTypeTitle,
  canWearArmor,
  gearPerkText,
  gearStatText,
  hasPerk,
  masteryTitle,
  weaponType,
  weaponTypeTitle,
} from '../data/gear';
import type { Collectible } from '../data/collection';
import { heroDef } from '../data/heroes';
import { heroStats } from '../engine/run';
import type { ArmorType, HeroDef, WeaponType } from '../engine/types';
import { findSameArtifact, gearOf, socketRefs } from '../engine/equipment';
import { STATUS_HINTS, STATUS_NAMES, defendBlock } from '../engine/combat';
import { spriteImg } from './sprites';
import { markKeywords } from './keywords';
import type { App } from './app';

export function bar(cls: string, cur: number, max: number, label = '', tip = ''): HTMLElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 0;
  return h(
    'div',
    tip ? { class: `bar bar-${cls}`, tip } : { class: `bar bar-${cls}` },
    h('div', { class: 'bar-fill', style: `width:${pct}%` }),
    h('span', { class: 'bar-text' }, `${label ? label + ' ' : ''}${cur}/${max}`),
  );
}

/**
 * Расходуемый ресурс: полоска во всю ширину, как HP, поделённая на секции —
 * по одному очку. Секций всегда max, поэтому ширина секции не скачет от бонуса
 * сверх максимума («Кольцо выносливости»: при 5/4 залиты все 4, счётчик — 5/4).
 */
export function segBar(kind: 'sta' | 'mp', cur: number, max: number): HTMLElement {
  const segs: HTMLElement[] = [];
  for (let i = 0; i < max; i++) segs.push(h('div', { class: `seg ${i < cur ? 'on' : ''}` }));
  const label = kind === 'sta' ? 'STA' : 'MP';
  return h(
    'div',
    { class: `bar bar-${kind}`, tip: `${kind === 'sta' ? 'Стамина' : 'Мана'} ${cur}/${max}` },
    h('div', { class: 'segs' }, ...segs),
    h('span', { class: 'bar-text' }, `${label} ${cur}/${max}`),
  );
}

/** Плитка предмета каталога: в сетке коллекции и в ленте сундука. */
export function collectibleTile(c: Collectible, locked = false): HTMLElement {
  if (locked) {
    return h('div', { class: 'coll-tile locked', tip: 'Ещё не найдено' }, h('span', { class: 'coll-glyph' }, '?'), h('span', { class: 'coll-name' }, '???'));
  }
  return h(
    'div',
    { class: `coll-tile kind-${c.kind}`, style: `border-color:${c.color}`, tip: `${c.name}\n${c.sub}\n${c.desc}` },
    h('span', { class: 'coll-glyph', style: `color:${c.color}` }, c.glyph),
    h('span', { class: 'coll-name' }, c.name),
  );
}

/** Крупная карточка находки — показывается после крутки сундука. */
export function collectibleCard(c: Collectible): HTMLElement {
  return h(
    'div',
    { class: 'card coll-card', style: `border-color:${c.color}` },
    h('div', { class: 'card-head' }, h('span', { class: 'glyph', style: `color:${c.color}` }, c.glyph), h('span', { class: 'card-name' }, c.name)),
    h('div', { class: 'card-sub', style: `color:${c.color}` }, c.sub),
    ...c.desc.split('\n').map((line) => h('div', { class: 'card-desc' }, line)),
  );
}

/**
 * Карточка-выбор: подсветка на наведении и клик по всей площади.
 * Клик по кнопке внутри не дублируется — он обрабатывается своим обработчиком.
 */
export function pickable(el: HTMLElement, onclick?: () => void): HTMLElement {
  el.classList.add('pickable');
  if (onclick) {
    el.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('button')) return;
      onclick();
    });
  }
  return el;
}

/** Бейдж тира: «Редкий», у оружия с иконкой типа внутри — «Редкий · ⚔» (цвет иконки — владение героя). */
export function tierBadge(tier: GearTier, typeIcon?: HTMLElement | null): HTMLElement {
  const info = GEAR_TIERS[tier];
  return h('span', { class: 'tier', style: `color:${info.color};border-color:${info.color}`, tip: `${info.name} предмет, тир ${tier}` }, info.name, typeIcon ? ' · ' : null, typeIcon);
}

export function artifactTitle(inst: ArtifactInstance): string {
  const def = artifactDef(inst.id);
  const lines = [`${def.name} (тир ${inst.tier})`, def.describe(inst.tier)];
  if (def.kind === 'active') lines.push(`Цена: ${artifactCostText(def, inst.tier)}`);
  else lines.push('Пассивный');
  if (inst.tier < 3) lines.push(`Следующий тир: ${def.describe((inst.tier + 1) as ArtTier)}`);
  return lines.join('\n');
}

export function artifactChip(inst: ArtifactInstance | null, opts: { onclick?: () => void; selected?: boolean } = {}): HTMLElement {
  if (!inst) return h('div', { class: 'chip chip-empty', tip: 'Пустой слот' }, '·');
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  return h(
    'div',
    {
      class: `chip ${def.kind} ${opts.selected ? 'selected' : ''} ${opts.onclick ? 'clickable' : ''}`,
      style: `border-color:${color}`,
      tip: artifactTitle(inst),
      onclick: opts.onclick,
    },
    h('span', { class: 'chip-glyph' }, def.glyph),
    h('span', { class: 'chip-tier', style: `color:${color}` }, '●'.repeat(inst.tier)),
  );
}

export function artifactCard(inst: ArtifactInstance, footer?: Child): HTMLElement {
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  return h(
    'div',
    { class: 'card art-card', style: `border-color:${color}` },
    h('div', { class: 'card-head' }, h('span', { class: 'glyph' }, def.glyph), h('span', { class: 'card-name' }, def.name)),
    // Тир не пишем: его показывает цвет рамки и подписи.
    h('div', { class: 'card-sub', style: `color:${color}` }, `Артефакт · ${def.kind === 'active' ? (def.school === 'magic' ? 'магия' : 'приём') : 'пассивный'}`),
    h('div', { class: 'card-desc' }, ...markKeywords(def.describe(inst.tier))),
    def.kind === 'active' ? h('div', { class: 'card-cost' }, `Цена: ${artifactCostText(def, inst.tier)}`) : null,
    footer ? h('div', { class: 'card-foot' }, footer) : null,
  );
}

export function slotsRow(gear: GearInstance): HTMLElement {
  return h('div', { class: 'slots' }, ...gear.slots.map((s) => artifactChip(s)));
}

// ─── Зелья ─────────────────────────────────────────────────────────────────

export const POTION_COLOR = '#6fd97a';

export function potionTitle(id: string): string {
  const def = potionDef(id);
  return `${def.name}\n${def.describe}\nПьётся в бою бесплатно и пропадает. Слот один.`;
}

/** Чип зелья — как чип артефакта, но без тира. Пустой слот — прочерк. */
export function potionChip(id: string | null): HTMLElement {
  if (!id) return h('div', { class: 'chip chip-empty', tip: 'Слот зелья пуст. Зелья падают с монстров и продаются у торговца' }, '·');
  return h('div', { class: 'chip potion', style: `border-color:${POTION_COLOR}`, tip: potionTitle(id) }, h('span', { class: 'chip-glyph' }, potionDef(id).glyph));
}

/** Строка зелья в панели героя: подпись, чип и название в одну строку, чтобы панель осталась без прокрутки. */
export function potionRow(id: string | null): HTMLElement {
  const def = id ? potionDef(id) : null;
  return h(
    'div',
    { class: 'potion-row', tip: id ? potionTitle(id) : 'Слот зелья пуст. Зелья падают с монстров и продаются у торговца' },
    h('span', { class: 'lbl' }, 'Зелье:'),
    potionChip(id),
    h('span', { class: def ? 'potion-name' : 'dim' }, def ? def.name : 'пусто'),
  );
}

/** Что вытеснит новое зелье; null — слот пуст. */
export function potionReplaceNote(run: RunState): string | null {
  return run.hero.potion ? `Заменит: ${potionDef(run.hero.potion).name}` : null;
}

export function potionCard(id: string, footer?: Child, note?: string | null): HTMLElement {
  const def = potionDef(id);
  return h(
    'div',
    { class: 'card potion-card', style: `border-color:${POTION_COLOR}` },
    h('div', { class: 'card-head' }, h('span', { class: 'glyph', style: `color:${POTION_COLOR}` }, def.glyph), h('span', { class: 'card-name' }, def.name)),
    h('div', { class: 'card-sub', style: `color:${POTION_COLOR}` }, 'Зелье · расходник'),
    h('div', { class: 'card-desc' }, ...markKeywords(def.describe)),
    h('div', { class: 'card-cost' }, 'Пьётся в бою бесплатно'),
    note ? h('div', { class: 'note' }, note) : null,
    footer ? h('div', { class: 'card-foot' }, footer) : null,
  );
}

/** Иконка типа оружия у бейджа тира. С героем окрашена по владению: зелёный мастер, жёлтый знаком, красный чужое. */
export function weaponTypeIcon(gear: GearInstance, def?: HeroDef): HTMLElement {
  const type = weaponType(gear);
  const cls = def ? `mastery-${def.mastery[type]}` : '';
  return h('span', { class: `wtype-icon ${cls}`.trim(), tip: weaponTypeTitle(gear, def) }, WEAPON_TYPE_GLYPHS[type]);
}

/** Иконка типа брони у бейджа тира. С героем окрашена по умению носить: зелёный умеет, красный не умеет. Без перка — серая. */
export function armorTypeIcon(gear: GearInstance, def?: HeroDef): HTMLElement {
  const cls = def && hasPerk(gear) ? (canWearArmor(def, gear) ? 'skill-yes' : 'skill-no') : '';
  return h('span', { class: `wtype-icon ${cls}`.trim(), tip: armorTypeTitle(gear, def) }, ARMOR_TYPE_GLYPHS[armorType(gear)]);
}

export function gearTypeIcon(gear: GearInstance, def?: HeroDef): HTMLElement {
  return gear.kind === 'weapon' ? weaponTypeIcon(gear, def) : armorTypeIcon(gear, def);
}

/** Строка перка базы. Броня, которую герой не умеет носить, — перк зачёркнут, причина в подсказке. */
export function perkLine(gear: GearInstance, def?: HeroDef): HTMLElement | null {
  const perk = gearPerkText(gear);
  if (!perk) return null;
  if (gear.kind === 'armor' && def && !canWearArmor(def, gear)) {
    return h(
      'div',
      { class: 'card-perk off', tip: `${def.name} не умеет носить ${ARMOR_TYPE_NAMES[armorType(gear)].toLowerCase()} броню: перк не работает` },
      h('s', null, perk),
    );
  }
  return h('div', { class: 'card-perk' }, ...markKeywords(perk));
}

export function gearCard(gear: GearInstance, opts: { def?: HeroDef; footer?: Child; compact?: boolean } = {}): HTMLElement {
  const info = GEAR_TIERS[gear.tier];
  const { def, footer, compact } = opts;
  const isWeapon = gear.kind === 'weapon';
  const glyph = h('span', { class: 'glyph' }, isWeapon ? '⚔' : '⛨');
  const name = h('span', { class: 'card-name' }, gear.name);
  const typeIcon = gearTypeIcon(gear, def);
  const perk = perkLine(gear, def);
  if (compact) {
    // Панель героя: тир и тип в строке с названием, перк короткий, слоты внизу — панель обязана влезать в кадр без прокрутки.
    return h(
      'div',
      { class: 'card gear-card compact', style: `border-color:${info.color}` },
      h('div', { class: 'card-head' }, glyph, name, tierBadge(gear.tier, typeIcon)),
      h('div', { class: 'card-desc' }, gearStatText(gear, def)),
      perk,
      slotsRow(gear),
    );
  }
  // Число слотов не пишем: его видно по чипам ниже. Сравнение с надетым тоже: оно в панели героя слева.
  return h(
    'div',
    { class: 'card gear-card', style: `border-color:${info.color}` },
    h('div', { class: 'card-head' }, glyph, name),
    h('div', { class: 'card-sub' }, tierBadge(gear.tier, typeIcon)),
    h('div', { class: 'card-desc' }, gearStatText(gear, def)),
    perk,
    slotsRow(gear),
    footer ? h('div', { class: 'card-foot' }, footer) : null,
  );
}

/**
 * Умения героя одной строкой: «Оружие: ⚔ ➶ ✦  Броня: ◆ ◈ ◇».
 * Цвет иконки оружия — владение (зелёный мастер, жёлтый знаком, красный чужое), брони — умение носить (зелёный да, красный нет).
 * Названия, доля кубика и свойство типа — в подсказке при наведении на иконку; карточки предметов этого не повторяют.
 */
export function skillLine(def: HeroDef): HTMLElement {
  const weapons: WeaponType[] = ['melee', 'ranged', 'magic'];
  const armors: ArmorType[] = ['heavy', 'medium', 'light'];
  return h(
    'div',
    { class: 'mastery' },
    h('span', { class: 'lbl', tip: 'Владение оружием: зелёный мастер, жёлтый знаком, красный чужое. Наведи на иконку' }, 'Оружие:'),
    ...weapons.map((t) => h('span', { class: `mastery-${def.mastery[t]}`, tip: masteryTitle(t, def.mastery[t]) }, WEAPON_TYPE_GLYPHS[t])),
    h('span', { class: 'lbl', tip: 'Умение носить броню: зелёный перк работает, красный нет. Наведи на иконку' }, 'Броня:'),
    ...armors.map((t) => h('span', { class: def.armorSkill[t] ? 'skill-yes' : 'skill-no', tip: armorSkillTitle(t, def.armorSkill[t]) }, ARMOR_TYPE_GLYPHS[t])),
  );
}

/** Золотая монета в тексте: «Перебросить за 5 ◉». */
export function coin(): HTMLElement {
  return h('span', { class: 'coin' }, '◉');
}

export function goldBadge(gold: number): HTMLElement {
  return h('span', { class: 'gold', tip: 'Золото: капает за бои, тратится на переброс награды' }, `◉ ${gold}`);
}

/** Статусы, у которых число — сила эффекта, а не служебная единица. */
const VALUE_STATUSES: StatusId[] = ['strength', 'bleed', 'burn', 'poison', 'thorns', 'regen', 'dodge'];

export function statusIcons(c: Combatant): HTMLElement {
  return h(
    'div',
    { class: 'statuses' },
    ...c.statuses.map((s) => {
      const showValue = VALUE_STATUSES.includes(s.id) && (s.id !== 'dodge' || s.value > 1);
      const title = `${STATUS_NAMES[s.id]}${showValue ? ` ${s.value}` : ''}${s.turns > 0 ? `, ходов: ${s.turns}` : ''}\n${STATUS_HINTS[s.id]}`;
      return h(
        'span',
        { class: `status status-${s.id}`, tip: title },
        statusIcon(s.id, 18),
        showValue ? h('span', { class: 'status-val' }, `${s.value}`) : null,
        s.turns > 0 ? h('span', { class: 'status-turns' }, `${s.turns}`) : null,
      );
    }),
  );
}

export function statsGrid(s: DerivedStats): HTMLElement {
  const row = (k: string, v: string, tip: string) => h('div', { class: 'stat', tip }, h('span', { class: 'stat-k' }, k), h('span', { class: 'stat-v' }, v));
  return h(
    'div',
    { class: 'stats-grid' },
    row('Урон', `${s.dmgMin + s.str}–${s.dmgMax + s.str}`, 'Урон базовой атаки: разброс оружия + Сила'),
    row('DEF', `${s.def}`, `Защита. «Защититься» даёт 80 % от неё${s.defendBonus ? ' и бонуса брони' : ''}, округление вверх: +${defendBlock(s)} блока`),
    row('STA', `${s.sta}${s.firstTurnSta ? ` (+${s.firstTurnSta})` : ''}`, 'Очки действий за ход'),
    row('MP', `${s.maxMp}${s.mpRegen ? ` (+${s.mpRegen})` : ''}`, 'Мана и реген за ход'),
    row('Устал.', `−${Math.round((1 - s.fatigue) * 100)}%`, 'На столько слабее каждая следующая атака в этом ходу'),
    s.crit ? row('Крит', `${Math.round(s.crit * 100)} %`, `Шанс крита (урон ×${s.critMult})`) : null,
    s.firstHit ? row('1-й удар', `+${s.firstHit}`, 'Бонус урона первого удара в ходу') : null,
    s.spellPower ? row('Закл.', `+${s.spellPower}`, 'Бонус к урону заклинаний') : null,
    s.thorns ? row('Шипы', `${s.thorns}`, 'Урон атакующему') : null,
    s.lifesteal ? row('Вамп.', `${s.lifesteal}`, 'Лечение при базовой атаке') : null,
    s.regen ? row('Реген', `${s.regen}`, 'HP в начале хода') : null,
  );
}

export function heroPanel(run: RunState): HTMLElement {
  const def = heroDef(run.hero.defId);
  const s = heroStats(run);
  return h(
    'div',
    { class: 'hero-panel' },
    h(
      'div',
      { class: 'hero-head' },
      spriteImg(def.sprite, def.id, 64),
      h('div', null, h('div', { class: 'name-row' }, h('div', { class: 'name' }, def.name), goldBadge(run.gold)), bar('hp', run.hero.hp, s.maxHp, 'HP')),
    ),
    statsGrid(s),
    skillLine(def),
    potionRow(run.hero.potion),
    gearCard(run.hero.weapon, { def, compact: true }),
    gearCard(run.hero.armor, { def, compact: true }),
  );
}

/** Модалка выбора слота для артефакта: пустой — вставить, занятый — заменить. */
export function pendingModal(app: App): HTMLElement | null {
  const run = app.run;
  const p = run?.pending;
  const art = p?.artifacts[0];
  if (!run || !p || !art) return null;
  const sockets = socketRefs(run.hero);
  const same = findSameArtifact(run.hero, art.id);
  const hasFree = sockets.some((s) => !s.art);
  return h(
    'div',
    { class: 'overlay' },
    h(
      'div',
      { class: 'panel modal' },
      h('h2', null, 'Куда вставить артефакт?'),
      h(
        'p',
        { class: 'dim' },
        hasFree ? 'Выберите слот. Занятый слот — замена, старый артефакт пропадёт.' : 'Свободных слотов нет: выберите, какой артефакт заменить.',
      ),
      artifactCard(art),
      h(
        'div',
        { class: 'socket-list' },
        ...sockets.map((s) => {
          const gear = gearOf(run.hero, s.kind);
          const isSame = !!same && same.kind === s.kind && same.index === s.index;
          return h(
            'div',
            { class: `socket-row ${s.art ? '' : 'free'}` },
            h('span', { class: 'socket-gear' }, h('span', { class: 'dim' }, s.kind === 'weapon' ? 'Оружие' : 'Броня'), h('span', null, ` · ${gear.name} · слот ${s.index + 1}`)),
            artifactChip(s.art),
            h('span', { class: 'socket-name' }, s.art ? `${artifactDef(s.art.id).name} (тир ${s.art.tier})` : 'пусто'),
            button(s.art ? 'Заменить' : 'Вставить', () => app.pendingPlace(s.kind, s.index), {
              class: s.art ? '' : 'primary',
              disabled: isSame,
            }),
          );
        }),
      ),
      h(
        'div',
        { class: 'row' },
        p.cancellable ? button('Отмена', () => app.pendingCancel()) : button('Выбросить', () => app.pendingDiscard(), { class: 'danger' }),
      ),
    ),
  );
}
