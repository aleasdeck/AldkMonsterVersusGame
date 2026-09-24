import { h, type Child } from './dom';
import type { ArtTier, ArtifactInstance, DerivedStats, GearInstance, HeroDef, RunState, StatusId } from '../engine/types';
import { artifactDef } from '../data/artifacts';
import { potionDef } from '../data/potions';
import { SIGNATURE_OWNER, heroDef } from '../data/heroes';
import {
  ARMOR_TYPE_NAMES,
  ART_TIER_COLORS,
  GEAR_TIERS,
  WEAPON_TYPE_NAMES,
  affixText,
  armorType,
  baseOf,
  canWearArmor,
  canWieldWeapon,
  hasPerk,
  weaponDice,
  weaponReach,
  weaponType,
  weaponTypeText,
} from '../data/gear';
import { ARCHETYPES, archetypeCounts, artifactTags } from '../data/archetypes';
import { findSameArtifact, slotKindAt } from '../engine/equipment';
import { innateOf, socketedArtifacts } from '../engine/stats';
import { markKeywords } from './keywords';
import { statusIcon, uiIcon, type UiIconId } from './icons';
import { archetypeTip, reachDots, slotKindTip, socketChip, tierTip } from './components';
import { artifactShort } from './gearTile';
import { dotted, effectText, kindParam, paramChip, slotParam, tierPips, useParams, type Param } from './cardParts';
import { gearCompare, type CompareRow } from './diff';
import { UI } from './variants';

// ─── Карточки-прототипы v0.50 (variants.ts) ─────────────────────────────────
// Общая структура всех карточек: 1) кто это — иконка, имя цветом тира, тир точками, род и тип; 2) главное число или параметры
// применения — цена, перезарядка, цель; 3) что делает — описание с иконками статусов и выделенными числами; 4) что это даст
// сборке — набор архетипа, дубликат, сравнение с надетым; 5) действие. Варианты A/B/C раскладывают те же части по-разному.

/** Цвет имени по тиру: у первого — обычный текст (серый цвет тира читается как «выключено»). */
function nameColor(tier: number, color: string): string {
  return tier <= 1 ? 'var(--text)' : color;
}

// ─── Артефакты ─────────────────────────────────────────────────────────────

/** Подсказка к тиру артефакта: тир и описание следующего. */
function artTierTip(inst: ArtifactInstance): string {
  const def = artifactDef(inst.id);
  const next = inst.tier < 3 ? `\nТир ${inst.tier + 1}: ${effectText(def, (inst.tier + 1) as ArtTier)}` : '\nМаксимальный тир';
  return `Тир ${inst.tier} из 3${next}`;
}

/** Метки архетипов словами и цветом: «▲ Огонь». У общей вещи — «общая». */
function archLabels(id: string): Child[] {
  const tags = artifactTags(id);
  if (tags.length === 0) return [h('span', { class: 'arch-label none', tip: 'Общая вещь: не входит в наборы архетипов' }, 'общая')];
  return tags.map((t) => h('span', { class: 'arch-label', style: `color:${ARCHETYPES[t].color}`, tip: archetypeTip(ARCHETYPES[t]) }, `${ARCHETYPES[t].glyph} ${ARCHETYPES[t].name}`));
}

/** Особые пометки: ключевая вещь (ломает правило за цену) и навык героя (персональный). */
function specialLabels(id: string): Child[] {
  const def = artifactDef(id);
  const out: Child[] = [];
  if (def.keystone) out.push(h('span', { class: 'special-label key', tip: 'Ключевая вещь архетипа: ломает правило за цену, выпадает только тиром 1' }, uiIcon('key', 14), 'ключевая'));
  const owner = SIGNATURE_OWNER[id];
  if (owner) out.push(h('span', { class: 'special-label sig', tip: `Врождённый навык героя «${heroDef(owner).name}»: не занимает сокет, уровень растёт с локацией` }, uiIcon('crown', 14), 'навык героя'));
  return out;
}

/**
 * Что артефакт даст сборке (v0.43 архетипы): дубликат поднимет тир стоящего, новая вещь продвинет набор — «▲ Огонь 2/3: …»,
 * если порог набора срабатывает. Без забега (коллекция, выбор героя) — ничего.
 */
function buildNotes(run: RunState | undefined, inst: ArtifactInstance): HTMLElement[] {
  if (!run) return [];
  const out: HTMLElement[] = [];
  const same = findSameArtifact(run.hero, inst.id);
  if (same?.art) {
    const next = Math.min(3, Math.max(same.art.tier + 1, inst.tier));
    out.push(
      h(
        'div',
        { class: `build-note ${same.art.tier >= 3 ? 'bad' : 'good'}` },
        uiIcon(same.art.tier >= 3 ? 'cross' : 'star', 14),
        same.art.tier >= 3 ? 'Уже на максимальном тире' : `Дубликат: тир стоящего ${same.art.tier} → ${next}`,
      ),
    );
    return out;
  }
  const innate = innateOf(run.hero);
  const counts = archetypeCounts([...socketedArtifacts(run.hero.weapon, run.hero.armor), ...(innate ? [innate] : [])]);
  // Только то, что меняет решение: сработает порог набора. «Огонь 1/3» у первой вещи архетипа — шум, его и так видно по метке.
  for (const tag of artifactTags(inst.id)) {
    const arch = ARCHETYPES[tag];
    const n = (counts[tag] ?? 0) + 1;
    const bonus = n >= 2 && n <= 3 ? arch.sets[n as 2 | 3] : undefined;
    if (!bonus) continue;
    out.push(
      h(
        'div',
        { class: 'build-note set', style: `color:${arch.color}`, tip: archetypeTip(arch, n) },
        h('span', { class: 'arch-glyph' }, '▲'),
        `${arch.name} ${n}/3: ${bonus.text}`,
      ),
    );
  }
  return out;
}

function descOf(inst: ArtifactInstance): Child[] {
  return markKeywords(effectText(artifactDef(inst.id), inst.tier), { icons: true, numbers: true });
}

/** A — «Полоса параметров»: шапка с портретом и тиром, строка рода и меток, полоса чипов цены/КД/цели, описание, сборка. */
function artCardA(inst: ArtifactInstance, footer?: Child, note?: Child, run?: RunState): HTMLElement {
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  const kind = kindParam(def);
  const slot = slotParam(def);
  const params = useParams(def, inst.tier);
  return h(
    'div',
    { class: `card art-card av av-a ${SIGNATURE_OWNER[inst.id] ? 'signature' : ''} ${def.keystone ? 'keystone' : ''}`, style: `border-color:${color}` },
    h(
      'div',
      { class: 'av-head' },
      h('span', { class: 'av-portrait', style: `border-color:${color}` }, def.glyph),
      h(
        'div',
        { class: 'av-title' },
        h('div', { class: 'av-name', style: `color:${nameColor(inst.tier, color)}` }, def.name),
        h('div', { class: 'av-tags' }, ...dotted([h('span', { class: `kind-label ${kind.cls}`, tip: kind.tip }, uiIcon(kind.icon, 14), kind.text), h('span', { class: `kind-label ${slot.cls}`, tip: slot.tip }, uiIcon(slot.icon, 14), slot.text), ...archLabels(inst.id), ...specialLabels(inst.id)])),
      ),
      tierPips(inst.tier, 3, color, artTierTip(inst)),
    ),
    params.length ? h('div', { class: 'av-params' }, ...params.map(paramChip)) : null,
    h('div', { class: 'av-desc' }, ...descOf(inst)),
    ...buildNotes(run, inst),
    note ?? null,
    footer ? h('div', { class: 'card-foot' }, footer) : null,
  );
}

/** Ярлык цены в углу карточки B: цифра на цвете ресурса; у пассивки — знак «всегда». */
function costGem(def: ReturnType<typeof artifactDef>, tier: ArtTier): HTMLElement {
  const params = useParams(def, tier).filter((p) => p.icon === 'sta' || p.icon === 'mp');
  if (def.kind !== 'active') return h('div', { class: 'avb-gem passive', tip: 'Пассивный артефакт: работает сам, пока стоит в сокете' }, uiIcon('passive', 16));
  return h('div', { class: 'avb-gems' }, ...params.map((p) => h('div', { class: `avb-gem ${p.cls}`, tip: p.tip }, uiIcon(p.icon, 14), h('span', null, p.text))));
}

/** B — «Карта с углами»: цена в левом верхнем углу, перезарядка в правом, архетип лентой снизу, тир и сокет в нижнем ряду. */
function artCardB(inst: ArtifactInstance, footer?: Child, note?: Child, run?: RunState): HTMLElement {
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  const kind = kindParam(def);
  const slot = slotParam(def);
  const cd = useParams(def, inst.tier).find((p) => p.icon === 'cd' || p.icon === 'uses');
  const target = useParams(def, inst.tier).find((p) => p.cls?.startsWith('t-'));
  const tags = artifactTags(inst.id);
  return h(
    'div',
    { class: `card art-card av av-b ${SIGNATURE_OWNER[inst.id] ? 'signature' : ''} ${def.keystone ? 'keystone' : ''}`, style: `border-color:${color}` },
    costGem(def, inst.tier),
    cd ? h('div', { class: 'avb-cd', tip: cd.tip }, uiIcon(cd.icon, 14), h('span', null, cd.text)) : null,
    h('div', { class: 'avb-head' }, h('span', { class: 'avb-glyph', style: `color:${color}` }, def.glyph), h('span', { class: 'avb-name', style: `color:${nameColor(inst.tier, color)}` }, def.name)),
    h('div', { class: 'avb-type' }, ...dotted([h('span', { class: kind.cls, tip: kind.tip }, kind.text), target ? h('span', { tip: target.tip }, uiIcon(target.icon, 14), target.text) : null, ...specialLabels(inst.id)])),
    h('div', { class: 'avb-desc' }, ...descOf(inst)),
    ...buildNotes(run, inst),
    note ?? null,
    footer ? h('div', { class: 'card-foot' }, footer) : null,
    h(
      'div',
      { class: 'avb-bottom' },
      ...(tags.length
        ? tags.map((t) => h('span', { class: 'avb-ribbon', style: `background:${ARCHETYPES[t].color}`, tip: archetypeTip(ARCHETYPES[t]) }, `${ARCHETYPES[t].glyph} ${ARCHETYPES[t].name}`))
        : [h('span', { class: 'avb-ribbon none', tip: 'Общая вещь: не входит в наборы архетипов' }, 'общая')]),
      h('span', { class: 'avb-spacer' }),
      tierPips(inst.tier, 3, color, artTierTip(inst)),
      h('span', { class: 'avb-slot', tip: slot.tip }, uiIcon(slot.icon, 14)),
    ),
  );
}

/** C — «Рейка слева»: столбец с портретом, тиром и параметрами применения; справа имя, метки, описание и сборка. */
function artCardC(inst: ArtifactInstance, footer?: Child, note?: Child, run?: RunState): HTMLElement {
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  const kind = kindParam(def);
  const slot = slotParam(def);
  const params = useParams(def, inst.tier);
  const railParam = (p: Param) => h('div', { class: `avc-param ${p.cls ?? ''}`, tip: p.tip }, uiIcon(p.icon, 14, p.color), p.text ? h('span', null, p.text) : null);
  return h(
    'div',
    { class: `card art-card av av-c ${SIGNATURE_OWNER[inst.id] ? 'signature' : ''} ${def.keystone ? 'keystone' : ''}`, style: `border-color:${color}` },
    h(
      'div',
      { class: 'avc-rail' },
      h('div', { class: 'avc-glyph', style: `color:${color}` }, def.glyph),
      tierPips(inst.tier, 3, color, artTierTip(inst)),
      def.kind === 'active' ? null : railParam({ icon: 'passive', text: '', tip: kind.tip }),
      ...params.map(railParam),
      h('div', { class: 'avc-slot' }, railParam({ ...slot, text: '' })),
    ),
    h(
      'div',
      { class: 'avc-body' },
      h('div', { class: 'avc-name', style: `color:${nameColor(inst.tier, color)}` }, def.name),
      h('div', { class: 'avc-tags' }, ...dotted([h('span', { class: kind.cls, tip: kind.tip }, kind.text), ...archLabels(inst.id), ...specialLabels(inst.id)])),
      h('div', { class: 'avc-desc' }, ...descOf(inst)),
      ...buildNotes(run, inst),
      note ?? null,
      footer ? h('div', { class: 'card-foot' }, footer) : null,
    ),
  );
}

/**
 * Зелье в варианте карточек артефактов: та же раскладка, что у артефакта, — чтобы ряд награды и прилавок читались одинаково.
 * Цена всегда нулевая (пьётся бесплатно), тира и сокета нет.
 */
export function potionCardVariant(id: string, footer?: Child, note?: string | null): HTMLElement | null {
  if (UI.ac === 'old') return null;
  const def = potionDef(id);
  const color = '#6fd97a';
  const desc = h('div', { class: UI.ac === 'b' ? 'avb-desc' : UI.ac === 'c' ? 'avc-desc' : 'av-desc' }, ...markKeywords(def.describe, { icons: true, numbers: true }));
  const noteEl = note ? h('div', { class: 'build-note' }, uiIcon('cross', 14), note) : null;
  const foot = footer ? h('div', { class: 'card-foot' }, footer) : null;
  const tags = [h('span', { class: 'kind-label potion-kind' }, uiIcon('heal', 14), 'Зелье'), h('span', { class: 'kind-label' }, 'пьётся бесплатно'), h('span', { class: 'kind-label' }, 'одно на герое')];
  if (UI.ac === 'b')
    return h(
      'div',
      { class: 'card av av-b potion-card', style: `border-color:${color}` },
      h('div', { class: 'avb-gem c-free', tip: 'Пьётся в бою бесплатно' }, uiIcon('sta', 14), h('span', null, '0')),
      h('div', { class: 'avb-head' }, h('span', { class: 'avb-glyph', style: `color:${color}` }, def.glyph), h('span', { class: 'avb-name', style: `color:${color}` }, def.name)),
      h('div', { class: 'avb-type' }, ...dotted(tags.slice(0, 2))),
      desc,
      noteEl,
      foot,
      h('div', { class: 'avb-bottom' }, h('span', { class: 'avb-ribbon', style: `background:${color}` }, 'зелье'), h('span', { class: 'avb-spacer' })),
    );
  if (UI.ac === 'c')
    return h(
      'div',
      { class: 'card av av-c potion-card', style: `border-color:${color}` },
      h('div', { class: 'avc-rail' }, h('div', { class: 'avc-glyph', style: `color:${color}` }, def.glyph), h('div', { class: 'avc-param c-free', tip: 'Пьётся в бою бесплатно' }, uiIcon('sta', 14), h('span', null, '0'))),
      h('div', { class: 'avc-body' }, h('div', { class: 'avc-name', style: `color:${color}` }, def.name), h('div', { class: 'avc-tags' }, ...dotted(tags.slice(0, 2))), desc, noteEl, foot),
    );
  return h(
    'div',
    { class: 'card av av-a potion-card', style: `border-color:${color}` },
    h('div', { class: 'av-head' }, h('span', { class: 'av-portrait', style: `border-color:${color};color:${color}` }, def.glyph), h('div', { class: 'av-title' }, h('div', { class: 'av-name', style: `color:${color}` }, def.name), h('div', { class: 'av-tags' }, ...dotted(tags)))),
    desc,
    noteEl,
    foot,
  );
}

/** Карточка артефакта в выбранном варианте; null — вариант «как сейчас», рисует components.ts. */
export function artifactCardVariant(inst: ArtifactInstance, footer?: Child, note?: Child, run?: RunState): HTMLElement | null {
  switch (UI.ac) {
    case 'a':
      return artCardA(inst, footer, note, run);
    case 'b':
      return artCardB(inst, footer, note, run);
    case 'c':
      return artCardC(inst, footer, note, run);
    default:
      return null;
  }
}

// ─── Экипировка ────────────────────────────────────────────────────────────

/** Пиксельная иконка типа предмета: меч / лук / жезл у оружия, ромб плотности у брони. */
export function gearIconId(gear: GearInstance): UiIconId {
  if (gear.kind === 'weapon') return weaponType(gear);
  return armorType(gear);
}

/** Тип словами: «Ближнее оружие», «Средняя броня». */
function gearTypeName(gear: GearInstance): string {
  return gear.kind === 'weapon' ? `${WEAPON_TYPE_NAMES[weaponType(gear)]} оружие` : `${ARMOR_TYPE_NAMES[armorType(gear)]} броня`;
}

/** Тип одним словом для строки под именем: «Ближнее», «Средняя» — вид предмета и так видно по иконке. */
function gearTypeShort(gear: GearInstance): string {
  return gear.kind === 'weapon' ? WEAPON_TYPE_NAMES[weaponType(gear)] : ARMOR_TYPE_NAMES[armorType(gear)];
}

/** Работает ли перк в руках героя; без героя (коллекция) — да. */
function works(gear: GearInstance, def?: HeroDef): boolean {
  if (!def) return true;
  return gear.kind === 'weapon' ? canWieldWeapon(def, gear) : canWearArmor(def, gear);
}

/** Владение словом с галочкой или крестом; у брони без перка (шкура Берсерка) — ничего. */
function skillLabel(gear: GearInstance, def?: HeroDef): HTMLElement | null {
  if (!def || (gear.kind === 'armor' && !hasPerk(gear))) return null;
  const ok = works(gear, def);
  // Норму не пишем — только исключение: «не владеет» красным. Своё оружие у героя — обычный случай, его видно по отсутствию пометки.
  if (ok) return null;
  const text = gear.kind === 'weapon' ? (ok ? 'владеет' : 'не владеет') : ok ? 'умеет носить' : 'не умеет носить';
  const tip =
    gear.kind === 'weapon'
      ? ok
        ? `${def.name} владеет этим типом: полный кубик и перк базы`
        : `${def.name} не владеет этим типом: кубик вдвое меньше, перк не работает`
      : ok
        ? `${def.name} умеет носить этот тип: перк работает`
        : `${def.name} не умеет носить этот тип: перк не работает, DEF и HP остаются`;
  return h('span', { class: `skill-label ${ok ? 'yes' : 'no'}`, tip }, uiIcon(ok ? 'check' : 'cross', 12), text);
}

/** Подсказка к иконке типа: тип и свойство типа («любая цель, не боится шипов»). */
function gearTypeTip(gear: GearInstance): string {
  if (gear.kind === 'weapon') return `${gearTypeName(gear)}: ${weaponTypeText(weaponType(gear), gear.tier)}`;
  return gearTypeName(gear);
}

/** Главное число предмета: кубик в руках героя у оружия, DEF и HP у брони. */
function mainStats(gear: GearInstance, def?: HeroDef): HTMLElement[] {
  if (gear.kind === 'weapon') {
    const d = def ? weaponDice(def, gear) : { min: gear.dmgMin, max: gear.dmgMax };
    const halved = d.min !== gear.dmgMin || d.max !== gear.dmgMax;
    return [
      h(
        'span',
        { class: `big-stat ${halved ? 'bad' : ''}`, tip: halved ? `Кубик оружия ${gear.dmgMin}–${gear.dmgMax}, в руках героя ${d.min}–${d.max}` : 'Урон базовой атаки без Силы' },
        uiIcon('dmg', 18),
        h('b', null, `${d.min}–${d.max}`),
        h('small', null, 'урон'),
      ),
    ];
  }
  const out: HTMLElement[] = [];
  out.push(h('span', { class: 'big-stat', tip: 'Защита: «Защититься» даёт 80 % от неё блоком' }, uiIcon('def', 18), h('b', null, `+${gear.def}`), h('small', null, 'DEF')));
  if (gear.hp) out.push(h('span', { class: 'big-stat', tip: 'Прибавка к максимуму HP' }, uiIcon('hp', 18), h('b', null, `+${gear.hp}`), h('small', null, 'HP')));
  return out;
}

/** Строка перка: иконка, имя, описание; не работает у героя — зачёркнута с причиной. */
function perkRow(gear: GearInstance, def: HeroDef | undefined, short = false): HTMLElement | null {
  const perk = baseOf(gear.kind, gear.base).perk;
  if (!perk) return null;
  const ok = works(gear, def);
  const text = perk.text(gear.tier);
  const tip = `Перк базы «${perk.name}»: ${text}${ok ? '' : '\nНе работает: герой не владеет этим типом'}`;
  if (short) return h('span', { class: `prop-chip perk ${ok ? '' : 'off'}`, tip }, uiIcon('perk', 14), perk.name);
  return h('div', { class: `prop-row perk ${ok ? '' : 'off'}`, tip }, uiIcon('perk', 14), h('span', { class: 'prop-name' }, perk.name), h('span', { class: 'prop-text' }, ...markKeywords(text, { numbers: true })));
}

/** Строка аффикса — случайной прибавки предмета. */
function affixRow(gear: GearInstance, short = false): HTMLElement | null {
  if (!gear.affix) return null;
  const text = affixText(gear.affix);
  const tip = `Случайный бонус предмета: ${text}`;
  if (short) return h('span', { class: 'prop-chip affix', tip }, uiIcon('affix', 14), text);
  return h('div', { class: 'prop-row affix', tip }, uiIcon('affix', 14), h('span', { class: 'prop-text' }, ...markKeywords(text, { numbers: true })));
}

/** Сокеты предмета значками типа с подсказкой; стоящие артефакты — глифом. */
function socketIcons(gear: GearInstance): HTMLElement {
  return h(
    'div',
    { class: 'sock-icons' },
    ...gear.slots.map((a, i) => {
      const kind = slotKindAt(gear, i);
      if (!a) return socketChip(kind);
      return h('div', { class: 'chip', tip: `${artifactDef(a.id).name}\n${slotKindTip(kind)}` }, h('span', { class: 'chip-glyph' }, artifactDef(a.id).glyph));
    }),
  );
}

/** Иконка стата для таблицы сравнения: своя пиксельная или иконка статуса. */
const COMPARE_ICONS: Record<string, UiIconId | { status: StatusId }> = {
  dmg: 'dmg',
  def: 'def',
  hp: 'hp',
  crit: 'crit',
  critDmg: 'critDmg',
  spellPower: 'spell',
  str: 'str',
  lifesteal: 'heal',
  onHitBleed: { status: 'bleed' },
  onHitBurn: { status: 'burn' },
  onHitPoison: { status: 'poison' },
  thorns: { status: 'thorns' },
  regen: { status: 'regen' },
  maxMp: 'mp',
  mpRegen: 'mp',
  sta: 'sta',
  firstHit: 'dmg',
  slots: 'slotAny',
};

function compareIcon(key: string): HTMLElement {
  const ic = COMPARE_ICONS[key] ?? 'star';
  if (typeof ic === 'object') {
    const img = statusIcon(ic.status, 14);
    img.classList.add('ui-icon');
    return img;
  }
  return uiIcon(ic, 14);
}

const arrow = (dir: number) => h('span', { class: `dir ${dir > 0 ? 'up' : dir < 0 ? 'dn' : 'eq'}` }, dir > 0 ? '▲' : dir < 0 ? '▼' : '=');

/** Шапка карточки экипировки: иконка типа цветом тира, имя цветом тира, тир точками; вторая строка — тип, владение, дальность. */
function gearHead(gear: GearInstance, def?: HeroDef, withType = true): HTMLElement[] {
  const color = GEAR_TIERS[gear.tier].color;
  const reach = reachDots(gear, def);
  const reachText = gear.kind === 'weapon' ? { melee: 'первый', any: 'любой', row: 'весь ряд' }[weaponReach(gear, def)] : null;
  return [
    h(
      'div',
      { class: 'gv-head' },
      h('span', { class: 'gv-icon', style: `border-color:${color}`, tip: gearTypeTip(gear) }, uiIcon(gearIconId(gear), 24, color)),
      h(
        'div',
        { class: 'gv-title' },
        h('span', { class: 'gv-name', style: `color:${nameColor(gear.tier, color)}`, tip: tierTip(gear.tier) }, gear.name),
        withType
          ? h('div', { class: 'gv-type' }, ...dotted([h('span', { tip: gearTypeTip(gear) }, gearTypeShort(gear)), reach ? h('span', { class: 'gv-reach', tip: 'Дальность удара: кого достаёт базовая атака' }, reach, reachText) : null, skillLabel(gear, def)]))
          : null,
      ),
      tierPips(gear.tier, 5, color, tierTip(gear.tier)),
    ),
  ];
}

/** Потерянные артефакты: не хватит сокета. */
function overflowNote(names: string[]): HTMLElement | null {
  if (!names.length) return null;
  return h('div', { class: 'build-note bad' }, uiIcon('cross', 14), `${names.join(', ')} — не поместится`);
}

export interface GearCardOpts {
  def?: HeroDef;
  footer?: Child;
  deltas?: HTMLElement[];
  run?: RunState;
}

/** A — «Паспорт»: шапка, главное число с дельтами столбиком, строки перка и аффикса с иконками, сокеты и кнопка. */
function gearCardA(gear: GearInstance, o: GearCardOpts): HTMLElement {
  const cmp = o.run ? gearCompare(o.run, gear) : null;
  const deltas = (cmp?.rows ?? []).filter((r) => r.dir !== 0);
  return h(
    'div',
    { class: 'card gear-card gv gv-a', style: `border-color:${GEAR_TIERS[gear.tier].color}` },
    ...gearHead(gear, o.def),
    h(
      'div',
      { class: 'gv-main' },
      h('div', { class: 'gv-stats' }, ...mainStats(gear, o.def)),
      deltas.length ? h('div', { class: 'gv-deltas', tip: deltas.map((r) => `${r.name}: ${r.before} → ${r.after}`).join('\n') }, ...deltas.slice(0, 4).map((r) => h('span', { class: r.dir > 0 ? 'up' : 'dn' }, `${r.dir > 0 ? '▲' : '▼'} ${r.delta}`))) : null,
    ),
    h('div', { class: 'gv-props' }, perkRow(gear, o.def), affixRow(gear)),
    overflowNote(cmp?.overflow ?? []),
    h('div', { class: 'card-foot' }, socketIcons(gear), o.footer),
  );
}

/** B — «Сравнение»: таблица «надето → эта» по всем меняющимся статам, перк строкой, сокеты «было → станет». */
function gearCardB(gear: GearInstance, o: GearCardOpts): HTMLElement {
  const cmp = o.run ? gearCompare(o.run, gear) : null;
  const row = (r: CompareRow) =>
    h('div', { class: `cmp-row ${r.dir > 0 ? 'up' : r.dir < 0 ? 'dn' : ''}` }, compareIcon(r.key), h('span', { class: 'cmp-name' }, r.name), h('span', { class: 'cmp-before' }, r.before), h('span', { class: 'cmp-arrow' }, '→'), h('span', { class: 'cmp-after' }, r.after), arrow(r.dir));
  const rows = [...(cmp?.rows ?? [])];
  if (cmp && cmp.slotsAfter !== cmp.slotsBefore) {
    const d = cmp.slotsAfter - cmp.slotsBefore;
    rows.push({ key: 'slots', name: 'сокеты', before: `${cmp.slotsBefore}`, after: `${cmp.slotsAfter}`, dir: Math.sign(d), delta: '' });
  }
  return h(
    'div',
    { class: 'card gear-card gv gv-b', style: `border-color:${GEAR_TIERS[gear.tier].color}` },
    ...gearHead(gear, o.def),
    cmp
      ? h('div', { class: 'cmp' }, h('div', { class: 'cmp-row cmp-caption' }, h('span'), h('span', { class: 'cmp-name' }), h('span', { class: 'cmp-before' }, 'надето'), h('span', { class: 'cmp-arrow' }), h('span', { class: 'cmp-after' }, 'эта'), h('span', { class: 'dir' })), ...rows.slice(0, 5).map(row))
      : h('div', { class: 'gv-stats' }, ...mainStats(gear, o.def)),
    h('div', { class: 'gv-props' }, perkRow(gear, o.def)),
    overflowNote(cmp?.overflow ?? []),
    h('div', { class: 'card-foot' }, socketIcons(gear), o.footer),
  );
}

/** C — «Компакт»: шапка без строки типа, крупное число со стрелкой, перк и аффикс чипами (описание — в подсказке), сокеты. */
function gearCardC(gear: GearInstance, o: GearCardOpts): HTMLElement {
  const cmp = o.run ? gearCompare(o.run, gear) : null;
  const changed = (cmp?.rows ?? []).filter((r) => r.dir !== 0);
  const main = cmp?.rows.find((r) => r.key === (gear.kind === 'weapon' ? 'dmg' : 'def'));
  const others = changed.filter((r) => r !== main);
  const reach = reachDots(gear, o.def);
  return h(
    'div',
    { class: 'card gear-card gv gv-c', style: `border-color:${GEAR_TIERS[gear.tier].color}` },
    ...gearHead(gear, o.def, false),
    h(
      'div',
      { class: 'gv-main' },
      h('div', { class: 'gv-stats' }, ...mainStats(gear, o.def)),
      main && main.dir !== 0 ? h('span', { class: `gv-verdict ${main.dir > 0 ? 'up' : 'dn'}`, tip: `Надето: ${main.before}` }, `${main.dir > 0 ? '▲' : '▼'} ${main.before} → ${main.after}`) : null,
    ),
    h(
      'div',
      { class: 'gv-chips' },
      perkRow(gear, o.def, true),
      affixRow(gear, true),
      reach ? h('span', { class: 'prop-chip', tip: 'Дальность удара' }, reach) : null,
      skillLabel(gear, o.def),
    ),
    others.length ? h('div', { class: 'gv-more', tip: others.map((r) => `${r.name}: ${r.before} → ${r.after}`).join('\n') }, ...dotted(others.slice(0, 3).map((r) => h('span', { class: r.dir > 0 ? 'up' : 'dn' }, `${r.dir > 0 ? '▲' : '▼'} ${r.delta}`)))) : null,
    overflowNote(cmp?.overflow ?? []),
    h('div', { class: 'card-foot' }, socketIcons(gear), o.footer),
  );
}

/** Карточка экипировки в выбранном варианте; null — вариант «как сейчас». */
export function gearCardVariant(gear: GearInstance, o: GearCardOpts): HTMLElement | null {
  switch (UI.gc) {
    case 'a':
      return gearCardA(gear, o);
    case 'b':
      return gearCardB(gear, o);
    case 'c':
      return gearCardC(gear, o);
    default:
      return null;
  }
}

// ─── Плитка экипировки в консоли ───────────────────────────────────────────

/** Ячейка сокета плитки: глиф, имя, число — как сейчас, но число выделено. */
function tileSocket(inst: ArtifactInstance | null, gear: GearInstance, i: number, s: DerivedStats): HTMLElement {
  const kind = slotKindAt(gear, i);
  if (!inst) return h('div', { class: `sock empty k-${kind}` }, socketChip(kind));
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  return h(
    'div',
    { class: `sock k-${kind}`, tip: `${def.name}, тир ${inst.tier}\n${def.describe(inst.tier)}` },
    h('span', { class: 'sock-glyph', style: `color:${color}` }, def.glyph),
    h('span', { class: 'sock-name' }, def.name),
    h('span', { class: 'sock-val' }, artifactShort(inst, s)),
  );
}

/**
 * Плитка экипировки консоли в вариантах: та же шапка, что у карточки (иконка типа, имя цветом тира, тир точками),
 * главное число справа, перк и аффикс строкой с иконками, сокеты 2×2. В C перк и аффикс — чипами.
 */
export function gearTileVariant(gear: GearInstance, def: HeroDef, s: DerivedStats): HTMLElement | null {
  if (UI.gc === 'old') return null;
  const color = GEAR_TIERS[gear.tier].color;
  const compact = UI.gc === 'c';
  const d = gear.kind === 'weapon' ? weaponDice(def, gear) : null;
  const stat = d ? `${d.min}–${d.max}` : `${gear.def ? `+${gear.def}` : '0'}${gear.hp ? ` · +${gear.hp} HP` : ''}`;
  return h(
    'div',
    { class: `gear-tile gtv ${gear.kind}`, style: `border-color:${color}` },
    h(
      'div',
      { class: 'gtv-head' },
      h('span', { class: 'gv-icon', style: `border-color:${color}`, tip: gearTypeTip(gear) }, uiIcon(gearIconId(gear), 18, color)),
      h('span', { class: 'gtv-name', style: `color:${nameColor(gear.tier, color)}`, tip: tierTip(gear.tier) }, gear.name),
      tierPips(gear.tier, 5, color, tierTip(gear.tier)),
      h('span', { class: 'gtv-stat', tip: gear.kind === 'weapon' ? 'Урон базовой атаки в руках героя, без Силы' : 'Защита и прибавка HP' }, uiIcon(gear.kind === 'weapon' ? 'dmg' : 'def', 16), stat),
    ),
    compact
      ? h('div', { class: 'gv-chips' }, perkRow(gear, def, true), affixRow(gear, true), reachDots(gear, def))
      : h('div', { class: 'gtv-props' }, perkRow(gear, def) ?? h('div', { class: 'prop-row dim' }, 'без перка'), affixRow(gear)),
    h('div', { class: 'gt-sockets' }, ...gear.slots.map((a, i) => tileSocket(a, gear, i, s))),
  );
}

