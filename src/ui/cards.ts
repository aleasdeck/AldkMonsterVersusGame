import { h, type Child } from './dom';
import type { ArtifactInstance, DerivedStats, GearInstance, HeroDef, RunState, SlotKind, StatusId } from '../engine/types';
import { artifactCost, artifactDef } from '../data/artifacts';
import { potionDef } from '../data/potions';
import { SIGNATURE_OWNER, heroDef } from '../data/heroes';
import { ARMOR_TYPE_NAMES, ART_TIER_COLORS, GEAR_TIERS, WEAPON_TYPE_NAMES, affixText, armorType, baseOf, canWearArmor, canWieldWeapon, hasPerk, weaponDice, weaponReach, weaponType, weaponTypeText } from '../data/gear';
import { ARCHETYPES, archetypeCounts, artifactTags } from '../data/archetypes';
import { ARTIFACT_SLOT_NAME, SLOT_KIND_NAME, findSameArtifact, slotKindAt } from '../engine/equipment';
import { innateOf, socketedArtifacts } from '../engine/stats';
import { heroStats } from '../engine/run';
import { markKeywords } from './keywords';
import { statusIcon, uiIcon, type UiIconId } from './icons';
import { POTION_COLOR, archetypeTip, reachDots, slotKindTip, socketChip, tierTip } from './components';
import { artifactShort } from './gearTile';
import { dotted, effectText, kindParam, slotParam } from './cardParts';
import { gearCompare, type CompareRow } from './diff';

// ─── Карточки предметов, артефактов и зелий (v0.50) ─────────────────────────
// Одна грамматика на все карточки награды, торговца, сундука и окна выбора сокета: 1) шапка — значок в рамке и имя цветом тира
// (тир только цветом, без точек), под именем строка «что это»: тип и дальность у предмета, род, архетип и тип сокета у артефакта;
// 2) таблица — у предмета сравнение «надето → эта», у артефакта параметры применения; 3) текст — перк абзацем или описание
// эффекта с иконками статусов и числами цветом смысла; 4) подвал — сокеты предмета и кнопка. Плитка экипировки в консоли
// собрана из тех же частей.

/** Цвет имени по тиру: у первого — обычный текст (серый цвет тира читается как «выключено»). */
function nameColor(tier: number, color: string): string {
  return tier <= 1 ? 'var(--text)' : color;
}

/** Шапка карточки: значок в рамке цвета тира, имя и строка «что это» под ним. */
function itemHead(icon: Child, color: string, name: string, nameStyle: string, nameTip: string | null, typeLine: Child[], iconTip: string | null = null): HTMLElement {
  return h(
    'div',
    { class: 'item-head' },
    h('span', { class: 'item-icon', style: `border-color:${color}`, tip: iconTip }, icon),
    h('div', { class: 'item-title' }, h('span', { class: 'item-name', style: nameStyle, tip: nameTip }, name), typeLine.length ? h('div', { class: 'item-type' }, ...typeLine) : null),
  );
}

// ─── Артефакты ─────────────────────────────────────────────────────────────

/** Особые пометки: ключевая вещь (ломает правило за цену) словом и навык героя короной; что это — в подсказке. */
function specialLabels(id: string): Child[] {
  const def = artifactDef(id);
  const out: Child[] = [];
  if (def.keystone) out.push(h('span', { class: 'special-label key', tip: 'Ключевая вещь архетипа: ломает правило за цену, выпадает только тиром 1' }, uiIcon('key', 14), 'ключевая'));
  const owner = SIGNATURE_OWNER[id];
  if (owner) out.push(h('span', { class: 'special-label sig', tip: `Врождённый навык героя «${heroDef(owner).name}»: не занимает сокет, уровень растёт с локацией` }, uiIcon('crown', 14)));
  return out;
}

/** Строка таблицы артефакта: значок, имя, значение справа. */
interface ArtRow {
  icon: UiIconId;
  name: string;
  value: string;
  /** good — выгодно (бесплатно, тир растёт), bad — не сработает (не хватит запаса, тир уже максимальный). */
  cls?: 'good' | 'bad';
  tip?: string;
  /** Строка во всю ширину таблицы: двойная цена («1 STA + 1 MP») не помещается в полколонки. */
  wide?: boolean;
  /** Цвет значения и значка — у ячейки набора цвет архетипа. */
  color?: string;
  /** Вместо пиксельной иконки — глиф (у набора — ▲). */
  glyph?: string;
}

const LIVE_NAMES: Partial<Record<UiIconId, string>> = { dmg: 'урон', block: 'блок', heal: 'лечение', sta: 'стамина', mp: 'мана' };

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/**
 * Живое число приёма (как «!D!» в Slay the Spire): урон, блок или лечение с нынешним снаряжением героя — то же, что будет
 * на плитке в бою. Без забега и у пассивки — нет; у приёмов без числа (призыв, толчок) — тоже нет.
 */
function liveRow(inst: ArtifactInstance, run?: RunState): ArtRow | null {
  if (!run) return null;
  const def = artifactDef(inst.id);
  if (def.kind !== 'active') return null;
  const text = artifactShort(inst, heroStats(run));
  if (!/^[+\d]/.test(text)) return null;
  const icon: UiIconId = /блок/.test(text) ? 'block' : /HP/.test(text) ? 'heal' : /STA/.test(text) ? 'sta' : /MP/.test(text) ? 'mp' : 'dmg';
  return { icon, name: LIVE_NAMES[icon] ?? 'число', value: text.replace(/ (?:всем|блока|HP|STA|MP)$/, ''), tip: `С вашим снаряжением сейчас: ${text}. Это же число будет на плитке в бою` };
}

/**
 * Цель приёма (решение пользователя: точки дальности у артефакта не смотрятся): «в упор» — только первый в ряду, «любая» — любой
 * враг, «все враги», «на себя». Физический приём без своей дальности бьёт как оружие в руках героя: с луком — любую цель, с мечом
 * и плетью — первого (плеть хлещет ряд только базовым ударом).
 */
function targetRow(inst: ArtifactInstance, run?: RunState): ArtRow | null {
  const def = artifactDef(inst.id);
  if (def.kind !== 'active' || !def.target) return null;
  if (def.target === 'self') return { icon: 'self', name: 'цель', value: 'на себя', tip: 'На себя: применяется сразу, цель выбирать не нужно' };
  if (def.target === 'allEnemies') return { icon: 'all', name: 'цель', value: 'все враги', tip: 'Бьёт всех врагов разом' };
  const own = def.reach ?? (def.school === 'magic' ? 'any' : null);
  const byWeapon = run && weaponReach(run.hero.weapon, heroDef(run.hero.defId)) === 'any' ? 'any' : 'melee';
  const reach = own ?? byWeapon;
  const how = own ? '' : '\nКак оружие в руках героя: ближнее — первого в ряду, дальнее, магическое и копьё — любого';
  return reach === 'melee'
    ? { icon: 'one', name: 'цель', value: 'в упор', tip: `Одна цель, только первый в ряду${how}` }
    : { icon: 'one', name: 'цель', value: 'любая', tip: `Одна цель, любой враг в ряду${how}` };
}

/**
 * Порог набора архетипа, который вещь включит: «▲ набор — Щит 2/3», текст бонуса в подсказке. Отдельная строка под описанием
 * в две строки выталкивала кнопку за рамку (Таран у Воина со Щитовым ударом). Шаг без бонуса и дубликат (он в своей ячейке) не пишутся.
 */
function setRows(run: RunState | undefined, inst: ArtifactInstance): ArtRow[] {
  if (!run || findSameArtifact(run.hero, inst.id)?.art) return [];
  const innate = innateOf(run.hero);
  const counts = archetypeCounts([...socketedArtifacts(run.hero.weapon, run.hero.armor), ...(innate ? [innate] : [])]);
  const out: ArtRow[] = [];
  for (const tag of artifactTags(inst.id)) {
    const arch = ARCHETYPES[tag];
    const n = (counts[tag] ?? 0) + 1;
    const bonus = n >= 2 && n <= 3 ? arch.sets[n as 2 | 3] : undefined;
    if (bonus) out.push({ icon: 'star', glyph: '▲', color: arch.color, name: 'набор', value: `${arch.name} ${n}/3`, tip: `Включит бонус набора «${arch.name}» ${n}/3: ${bonus.text}` });
  }
  return out;
}

/**
 * Ячейки таблицы артефакта: цена, перезарядка или лимит за ход, живое число, цель, порог набора и — у дубликата — тир в сокете
 * «было → станет», как строки сравнения у предметов. Пассивка без набора и дубликата таблицы не имеет.
 */
function artRows(inst: ArtifactInstance, run?: RunState): ArtRow[] {
  const def = artifactDef(inst.id);
  const rows: ArtRow[] = [];
  if (def.kind === 'active') {
    const c = artifactCost(def, inst.tier);
    const parts: string[] = [];
    if (c.sta === 'all') parts.push('вся STA');
    else if (c.sta) parts.push(`${c.sta} STA`);
    if (c.mp) parts.push(`${c.mp} MP`);
    // Цена, которую герою не заплатить никогда (максимум меньше цены), — красным: как урон оружия чужого типа.
    const s = run ? heroStats(run) : null;
    const short = !!s && ((c.mp ?? 0) > s.maxMp || (typeof c.sta === 'number' && c.sta > s.sta));
    rows.push({
      icon: c.mp && !c.sta ? 'mp' : 'sta',
      name: 'цена',
      value: parts.length ? parts.join(' + ') : 'бесплатно',
      cls: short ? 'bad' : parts.length ? undefined : 'good',
      tip: short ? 'Герою не хватает запаса: максимум меньше цены приёма' : 'Сколько стоит применить приём',
      wide: parts.length > 1,
    });
    const uses = def.usesPerTurn?.(inst.tier) ?? 0;
    const cd = def.cooldown?.(inst.tier) ?? 0;
    // «КД» — то же слово, что на плитках боя и в подсказке ключевого слова «Перезарядка»; полностью — в подсказке ячейки.
    if (uses > 1) rows.push({ icon: 'uses', name: 'лимит', value: `${uses} за ход`, tip: `До ${uses} раз за ход, без перезарядки` });
    else if (uses === 1 || cd === 1) rows.push({ icon: 'uses', name: 'лимит', value: 'раз в ход', tip: 'Не чаще раза в ход' });
    else if (cd > 1) rows.push({ icon: 'cd', name: 'КД', value: `${cd} ${plural(cd, 'ход', 'хода', 'ходов')}`, tip: `Перезарядка: после применения приём недоступен ${cd} ${plural(cd, 'ход', 'хода', 'ходов')}` });
    const live = liveRow(inst, run);
    if (live) rows.push(live);
    const target = targetRow(inst, run);
    if (target) rows.push(target);
  }
  rows.push(...setRows(run, inst));
  const same = run ? findSameArtifact(run.hero, inst.id) : null;
  if (same?.art) {
    const next = Math.min(3, Math.max(same.art.tier + 1, inst.tier));
    rows.push(
      same.art.tier >= 3
        ? { icon: 'star', name: 'дубликат', value: 'максимум', cls: 'bad', tip: 'Такой артефакт уже стоит на максимальном тире — дубликат ничего не даст' }
        : { icon: 'star', name: 'дубликат', value: `${same.art.tier} → ${next}`, cls: 'good', tip: `Сольётся со стоящим в сокете: тир ${same.art.tier} → ${next}` },
    );
  }
  return rows;
}

/** Таблица параметров тем же видом, что сравнение у предметов: значок, имя, значение справа; в широкой карточке — в две колонки. */
function artTable(rows: ArtRow[]): HTMLElement | null {
  if (!rows.length) return null;
  return h(
    'div',
    { class: 'cmp art-tbl' },
    ...rows.map((r) =>
      h(
        'div',
        { class: `art-tbl-row ${r.cls ?? ''} ${r.wide ? 'wide' : ''}`.replace(/\s+/g, ' ').trim(), tip: r.tip ?? null },
        r.glyph ? h('span', { class: 'art-tbl-glyph', style: r.color ? `color:${r.color}` : null }, r.glyph) : uiIcon(r.icon, 14),
        h('span', { class: 'cmp-name' }, r.name),
        h('span', { class: 'art-tbl-val', style: r.color ? `color:${r.color}` : null }, r.value),
      ),
    ),
  );
}

/**
 * Карточка артефакта в награде, у торговца и в окне выбора сокета: шапка (род, архетип, тип сокета словом), таблица параметров,
 * описание эффекта, кнопка. note — строка перед подвалом, footer — кнопка. run — контекст забега: живое число, цель по оружию,
 * порог набора и дубликат считаются по герою; без забега (коллекция) — только то, что знает сам артефакт.
 */
export function artifactCard(inst: ArtifactInstance, footer?: Child, note?: Child, run?: RunState): HTMLElement {
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  const kind = kindParam(def);
  const slot = slotParam(def);
  const typeLine = dotted([
    h('span', { class: kind.cls, tip: kind.tip }, kind.text),
    ...artifactTags(inst.id).map((t) => h('span', { class: 'arch-label', style: `color:${ARCHETYPES[t].color}`, tip: archetypeTip(ARCHETYPES[t]) }, `${ARCHETYPES[t].glyph} ${ARCHETYPES[t].name}`)),
    ...specialLabels(inst.id),
    // Тип сокета словом в той же строке (решение пользователя); цвет и значок — как у подписей сокетов в консоли.
    h('span', { class: `slot-label slot-${def.slot}`, tip: slot.tip }, uiIcon(slot.icon, 14), ARTIFACT_SLOT_NAME[def.slot]),
  ]);
  const tierTipText = `Тир ${inst.tier} из 3`;
  return h(
    'div',
    { class: `card art-card ${SIGNATURE_OWNER[inst.id] ? 'signature' : ''} ${def.keystone ? 'keystone' : ''}`.replace(/\s+/g, ' ').trim(), style: `border-color:${color}` },
    itemHead(h('span', { class: 'item-glyph', style: `color:${color}` }, def.glyph), color, def.name, `color:${nameColor(inst.tier, color)}`, tierTipText, typeLine, tierTipText),
    artTable(artRows(inst, run)),
    h('div', { class: 'art-desc' }, ...markKeywords(effectText(def, inst.tier), { icons: true, numbers: true })),
    note ?? null,
    footer ? h('div', { class: 'card-foot' }, footer) : null,
  );
}

/**
 * Зелье — той же раскладкой, что артефакт, чтобы ряд награды и прилавок читались одинаково: цена всегда «бесплатно», тира и сокета нет.
 * note — что вытеснит новое зелье (слот один).
 */
export function potionCard(id: string, footer?: Child, note?: string | null): HTMLElement {
  const def = potionDef(id);
  return h(
    'div',
    { class: 'card art-card potion-card', style: `border-color:${POTION_COLOR}` },
    itemHead(h('span', { class: 'item-glyph', style: `color:${POTION_COLOR}` }, def.glyph), POTION_COLOR, def.name, `color:${POTION_COLOR}`, null, [h('span', { class: 'potion-kind' }, 'Зелье')]),
    artTable([{ icon: 'sta', name: 'цена', value: 'бесплатно', cls: 'good', tip: 'Пьётся в бою бесплатно; слот зелья один' }]),
    h('div', { class: 'art-desc' }, ...markKeywords(def.describe, { icons: true, numbers: true })),
    note ? h('div', { class: 'build-note' }, uiIcon('cross', 14), note) : null,
    footer ? h('div', { class: 'card-foot' }, footer) : null,
  );
}

// ─── Экипировка ────────────────────────────────────────────────────────────

/** Пиксельная иконка типа предмета: меч / лук / жезл у оружия, шлем / кираса / перо у брони. */
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

/**
 * Владение цветом типа (решение пользователя): слово типа зелёное, если герой владеет оружием или умеет носить броню, красное — если нет.
 * Что теряется без владения — в подсказке; текста «не владеет» на карточке нет. Броня без перка (шкура Берсерка) — без цвета.
 */
function typeSkill(gear: GearInstance, def?: HeroDef): { cls: string; tip: string } {
  if (!def || (gear.kind === 'armor' && !hasPerk(gear))) return { cls: '', tip: '' };
  const ok = works(gear, def);
  const tip =
    gear.kind === 'weapon'
      ? ok
        ? `${def.name} владеет этим типом: полный кубик и перк базы`
        : `${def.name} не владеет этим типом: кубик вдвое меньше, перк не работает`
      : ok
        ? `${def.name} умеет носить этот тип: перк работает`
        : `${def.name} не умеет носить этот тип: перк не работает, DEF и HP остаются`;
  return { cls: ok ? 'skill-yes' : 'skill-no', tip };
}

/** Подсказка к иконке типа: тип и свойство типа («любая цель, не боится шипов»). */
function gearTypeTip(gear: GearInstance): string {
  if (gear.kind === 'weapon') return `${gearTypeName(gear)}: ${weaponTypeText(weaponType(gear), gear.tier)}`;
  return gearTypeName(gear);
}

/** Главное число предмета без сравнения (карточка без забега): кубик в руках героя у оружия, DEF и HP у брони. */
function mainStats(gear: GearInstance, def?: HeroDef): HTMLElement[] {
  if (gear.kind === 'weapon') {
    const d = def ? weaponDice(def, gear) : { min: gear.dmgMin, max: gear.dmgMax };
    const halved = !!def && !canWieldWeapon(def, gear);
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

/**
 * Строка перка: значок, имя и текст одним абзацем — текст идёт сразу за именем и переносится под него. Не работает у героя —
 * зачёркнута целиком, причина в подсказке.
 */
function perkRow(gear: GearInstance, def: HeroDef | undefined): HTMLElement | null {
  const perk = baseOf(gear.kind, gear.base).perk;
  if (!perk) return null;
  const ok = works(gear, def);
  const text = perk.text(gear.tier);
  const tip = `Перк базы «${perk.name}»: ${text}${ok ? '' : '\nНе работает: герой не владеет этим типом'}`;
  return h('div', { class: `prop-row perk ${ok ? '' : 'off'}`.trim(), tip }, uiIcon('perk', 14), h('span', { class: 'prop-body' }, h('span', { class: 'prop-name' }, perk.name), ' ', ...markKeywords(text, { numbers: true })));
}

/** Сокеты предмета в подвале карточки: пустой — пунктирный квадрат цвета типа, занятый — глиф артефакта. */
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

/**
 * Шапка предмета: иконка типа и имя цветом тира (тир только цветом — решение пользователя, так имя помещается целиком);
 * под именем тип цветом владения и точки дальности (без подписи — кого достаёт удар, пишет подсказка к точкам).
 */
function gearHead(gear: GearInstance, def?: HeroDef): HTMLElement {
  const color = GEAR_TIERS[gear.tier].color;
  const skill = typeSkill(gear, def);
  const typeTip = [gearTypeTip(gear), skill.tip].filter(Boolean).join('\n');
  return itemHead(uiIcon(gearIconId(gear), 24, color), color, gear.name, `color:${nameColor(gear.tier, color)}`, tierTip(gear.tier), dotted([h('span', { class: skill.cls || null, tip: typeTip }, gearTypeShort(gear)), reachDots(gear, def)]), gearTypeTip(gear));
}

/** Шапка предмета для окна выбора сокета: иконка типа и имя цветом тира. */
export function gearMiniHead(gear: GearInstance): HTMLElement {
  const color = GEAR_TIERS[gear.tier].color;
  return h(
    'div',
    { class: 'item-mini-head' },
    h('span', { class: 'item-icon', style: `border-color:${color}`, tip: gearTypeTip(gear) }, uiIcon(gearIconId(gear), 18, color)),
    h('span', { class: 'item-mini-name', style: `color:${nameColor(gear.tier, color)}`, tip: tierTip(gear.tier) }, gear.name),
  );
}

/** Потерянные артефакты: не хватит сокета. */
function overflowNote(names: string[]): HTMLElement | null {
  if (!names.length) return null;
  return h('div', { class: 'build-note bad' }, uiIcon('cross', 14), `${names.join(', ')} — не поместится`);
}

export interface GearCardOpts {
  def?: HeroDef;
  footer?: Child;
  run?: RunState;
}

/**
 * Карточка экипировки в награде, у торговца и в сундуке («сравнение с надетым», решение пользователя): шапка, таблица «надето → эта»
 * по статам, которые меняются (сокеты не пишутся — их видно в подвале), перк абзацем, сокеты и кнопка.
 */
export function gearCard(gear: GearInstance, o: GearCardOpts = {}): HTMLElement {
  const cmp = o.run ? gearCompare(o.run, gear) : null;
  const row = (r: CompareRow) =>
    h('div', { class: `cmp-row ${r.dir > 0 ? 'up' : r.dir < 0 ? 'dn' : ''}`.trim() }, compareIcon(r.key), h('span', { class: 'cmp-name' }, r.name), h('span', { class: 'cmp-before' }, r.before), h('span', { class: 'cmp-arrow' }, '→'), h('span', { class: 'cmp-after' }, r.after), arrow(r.dir));
  const rows = cmp?.rows ?? [];
  return h(
    'div',
    { class: 'card gear-card', style: `border-color:${GEAR_TIERS[gear.tier].color}` },
    gearHead(gear, o.def),
    cmp
      ? h(
          'div',
          { class: 'cmp', tip: `Слева — что надето сейчас, справа — с этим предметом${rows.length > 4 ? `\n${rows.slice(4).map((r) => `${r.name}: ${r.before} → ${r.after}`).join('\n')}` : ''}` },
          ...rows.slice(0, 4).map(row),
        )
      : h('div', { class: 'item-stats' }, ...mainStats(gear, o.def)),
    h('div', { class: 'item-props' }, perkRow(gear, o.def)),
    overflowNote(cmp?.overflow ?? []),
    h('div', { class: 'card-foot' }, socketIcons(gear), o.footer),
  );
}

// ─── Плитка экипировки в консоли ───────────────────────────────────────────

const SLOT_ICON: Record<SlotKind, UiIconId> = { weapon: 'slotWeapon', armor: 'slotArmor', any: 'slotAny' };

/**
 * Ячейка сокета плитки: глиф, имя, число. Пустой сокет — такой же прямоугольник на полстроки, пунктиром цвета своего типа,
 * со значком и типом словами (просьба пользователя): четыре сокета — четыре одинаковые плашки 2×2, а не квадратики.
 */
function tileSocket(inst: ArtifactInstance | null, gear: GearInstance, i: number, s: DerivedStats): HTMLElement {
  const kind = slotKindAt(gear, i);
  if (!inst) return h('div', { class: `sock empty k-${kind}`, tip: `${slotKindTip(kind)}\nСвободен` }, uiIcon(SLOT_ICON[kind], 16), h('span', { class: 'sock-name' }, SLOT_KIND_NAME[kind]));
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
 * Строка статов плитки (просьба пользователя: статы перед перком, справа сверху — ничего): урон в руках героя или DEF и HP брони,
 * и через точку аффикс со своей иконкой. Урон чужого оружия красный — кубик вдвое меньше; как считается — в подсказке.
 */
function tileStatsRow(gear: GearInstance, def: HeroDef): HTMLElement {
  const parts: Child[] = [];
  if (gear.kind === 'weapon') {
    const d = weaponDice(def, gear);
    // Красный — только чужой тип (кубик вдвое). Магическое оружие тоже меняет кубик (−1 к максимуму), но это свойство типа, а не штраф.
    const halved = !canWieldWeapon(def, gear);
    parts.push(
      h(
        'span',
        { class: `tile-stat ${halved ? 'bad' : ''}`.trim(), tip: halved ? `Кубик оружия ${gear.dmgMin}–${gear.dmgMax}, в руках героя ${d.min}–${d.max}: герой не владеет этим типом` : 'Урон базовой атаки в руках героя, без Силы' },
        uiIcon('dmg', 14),
        h('b', null, `${d.min}–${d.max}`),
        ' урон',
      ),
    );
  } else {
    parts.push(h('span', { class: 'tile-stat', tip: 'Защита брони: «Защититься» даёт 80 % Защиты блоком' }, uiIcon('def', 14), h('b', null, gear.def ? `+${gear.def}` : '0'), ' DEF'));
    if (gear.hp) parts.push(h('span', { class: 'tile-stat', tip: 'Прибавка брони к максимуму HP' }, uiIcon('hp', 14), h('b', null, `+${gear.hp}`), ' HP'));
  }
  if (gear.affix) {
    const text = affixText(gear.affix);
    parts.push(h('span', { class: 'tile-stat affix', tip: `Случайный бонус предмета: ${text}` }, uiIcon('affix', 14), ...markKeywords(text, { numbers: true })));
  }
  return h('div', { class: 'tile-stats' }, ...dotted(parts));
}

/**
 * Плитка экипировки в консоли хабов: шапка как у карточки (иконка и имя цветом тира, под именем тип цветом владения и дальность),
 * строка статов с аффиксом, перк, сокеты прижаты к низу сеткой 2×2.
 */
export function hubGearTile(gear: GearInstance, def: HeroDef, s: DerivedStats): HTMLElement {
  return h(
    'div',
    { class: `gear-tile hub-tile ${gear.kind}`, style: `border-color:${GEAR_TIERS[gear.tier].color}` },
    gearHead(gear, def),
    tileStatsRow(gear, def),
    perkRow(gear, def) ?? h('div', { class: 'prop-row dim' }, 'без перка'),
    h('div', { class: 'gt-sockets' }, ...gear.slots.map((a, i) => tileSocket(a, gear, i, s))),
  );
}
