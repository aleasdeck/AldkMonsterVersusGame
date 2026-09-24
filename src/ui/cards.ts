import { h, type Child, type Tip, type TipFn } from './dom';
import type { ArmorType, ArtTier, ArtifactInstance, DerivedStats, Effect, GearInstance, HeroDef, RunState, SlotKind, StatusId, WeaponType } from '../engine/types';
import { artifactCost, artifactCostText, artifactDef } from '../data/artifacts';
import { potionDef } from '../data/potions';
import { SIGNATURE_OWNER, heroDef } from '../data/heroes';
import { ARMOR_TYPE_NAMES, ART_TIER_COLORS, GEAR_TIERS, UNSKILLED_DICE_MULT, WEAPON_TYPE_NAMES, affixText, armorType, baseOf, canWearArmor, canWieldWeapon, hasPerk, weaponDice, weaponReach, weaponType, weaponTypeHint, weaponTypeText } from '../data/gear';
import { ARCHETYPES, archetypeCounts, artifactTags, type ArchetypeDef } from '../data/archetypes';
import { ARTIFACT_SLOT_NAME, SLOT_KIND_NAME, findSameArtifact, slotKindAt } from '../engine/equipment';
import { innateOf, socketedArtifacts } from '../engine/stats';
import { heroStats } from '../engine/run';
import { rangeText, restAttackRange, skillBlock, skillHeal } from '../engine/combat';
import { markKeywords } from './keywords';
import { statusIcon, uiIcon, uiIconColor, type UiIconId } from './icons';
import { POTION_COLOR, SLOT_ICON, archetypeTip, artifactTip, reachDots, slotKindTip, socketChip, tierTip } from './components';
import { dotted, kindParam, slotParam } from './cardParts';
import { gearCompare, type CompareRow } from './diff';
import { paramTip, tipHead, tipLines, tipNote, tipSection, tipText, type TipLine } from './tips';

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
function itemHead(icon: Child, color: string, name: string, nameStyle: string, nameTip: Tip | null, typeLine: Child[], iconTip: Tip | null = null): HTMLElement {
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
  if (def.keystone) out.push(h('span', { class: 'special-label key', tip: paramTip('key', 'Ключевая вещь', 'Ключевая вещь архетипа: ломает правило за цену. Выпадает только тиром 1') }, uiIcon('key', 14), 'ключевая'));
  const owner = SIGNATURE_OWNER[id];
  if (owner) out.push(h('span', { class: 'special-label sig', tip: paramTip('crown', 'Врождённый навык', `Навык героя «${heroDef(owner).name}»: не занимает сокет, уровень растёт с каждой локацией`) }, uiIcon('crown', 14)));
  return out;
}

/** Строка таблицы артефакта: значок, имя, значение справа. */
interface ArtRow {
  icon: UiIconId;
  name: string;
  value: string;
  /** good — выгодно (бесплатно, тир растёт), bad — не сработает (не хватит запаса, тир уже максимальный). */
  cls?: 'good' | 'bad';
  tip?: Tip;
  /** Строка во всю ширину таблицы: двойная цена («1 STA + 1 MP») не помещается в полколонки. */
  wide?: boolean;
  /** Цвет значения и значка — у ячейки набора цвет архетипа. */
  color?: string;
  /** Вместо пиксельной иконки — глиф (у набора — ▲). */
  glyph?: string;
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

const pct = (v: number) => `${Math.round(v * 100)} %`;

// ─── Число приёма вне боя (v0.50) ──────────────────────────────────────────
// Как в Slay the Spire и Hades: текст описания держит правило («удар 50 % урона оружия»), посчитанное число с нынешним
// снаряжением стоит рядом с пометкой «сейчас», а из чего оно сложилось — в подсказке. Считает движок (restAttackRange,
// skillBlock, skillHeal), поэтому карточка, сокет в консоли и лист «Персонаж» пишут то же число, с которого плитка боя начинает ход.
// Формулы от состояния боя (Таран, Пролом, Испепеление, взрыв ран) числа вне боя не имеют: блока и Горения цели ещё нет.

/** Смысл числа: иконка и цвет. */
export type RestKind = 'dmg' | 'block' | 'heal' | 'sta' | 'mp';

export interface RestValue {
  kind: RestKind;
  /** «2–3», «2×3–4», «+6», «3 за удар». */
  text: string;
  /** По всем врагам. */
  all: boolean;
  /** Из чего сложилось число; null — это собственное число вещи, пересчитывать нечего. */
  calc: string | null;
}

/**
 * Число приёма вне боя с этими статами: урон удара (кубик в руках героя, Сила, прибавка и доля приёма, ключевая вещь),
 * заклинания с Силой заклинаний, блок и лечение с прибавками наборов, стамина и мана. weapon — имя оружия для расчёта в подсказке.
 */
export function restValue(inst: ArtifactInstance, s: DerivedStats, weapon = 'Оружие'): RestValue | null {
  const def = artifactDef(inst.id);
  if (def.kind !== 'active') return null;
  const effects = def.effects?.(inst.tier) ?? [];
  const attacks = effects.filter((e): e is Extract<Effect, { type: 'attack' }> => e.type === 'attack');
  if (attacks.length) {
    const a = attacks[0];
    const mult = a.mult ?? 1;
    const r = restAttackRange(s, a.bonus, mult);
    const hits = attacks.length;
    let calc = `${weapon} ${s.dmgMin}–${s.dmgMax}${s.str ? ` + Сила ${s.str}` : ''}${a.bonus ? ` + ${a.bonus} приёма` : ''}`;
    if (mult !== 1) calc += `, × ${pct(mult)}`;
    if (s.strikeMult) calc += `, × ${pct(1 + s.strikeMult)} удара оружием`;
    calc += ` = ${rangeText(r)}${hits > 1 ? ` за удар, ${hits} ${plural(hits, 'удар', 'удара', 'ударов')}` : ''}`;
    return { kind: 'dmg', text: `${hits > 1 ? `${hits}×` : ''}${rangeText(r)}`, all: a.target === 'allEnemies', calc };
  }
  for (const e of effects) {
    switch (e.type) {
      case 'spell': {
        const n = e.amount + s.spellPower;
        return { kind: 'dmg', text: `${n}`, all: e.target === 'allEnemies', calc: s.spellPower ? `${e.amount} + Сила заклинаний ${s.spellPower} = ${n}` : null };
      }
      case 'block': {
        const n = skillBlock(s, e.amount);
        return { kind: 'block', text: `+${n}`, all: false, calc: n !== e.amount ? `${e.amount} + ${n - e.amount} набора «Щит» = ${n}` : null };
      }
      case 'heal': {
        const n = skillHeal(s, e.amount);
        const how = s.noHeal > 0 ? 'лечение не действует: «Мученик»' : `${e.amount}${s.healAdd ? ` + ${s.healAdd}` : ''}${s.healMult ? `, × ${pct(1 + s.healMult)}` : ''} = ${n}`;
        return { kind: 'heal', text: `+${n}`, all: false, calc: n !== e.amount ? how : null };
      }
      case 'gainSta':
        return { kind: 'sta', text: `+${e.amount}`, all: false, calc: null };
      case 'gainMp':
        return { kind: 'mp', text: `+${e.amount}`, all: false, calc: null };
      case 'finisher': {
        // Тот же расчёт, что finisherPer в бою: доля среднего удара с Силой, не меньше 1.
        const avg = (s.dmgMin + s.dmgMax) / 2 + s.str;
        const per = Math.max(1, Math.round((avg * e.pct) / 100));
        return { kind: 'dmg', text: `${per} за удар`, all: false, calc: `${e.pct} % среднего удара ${avg} (${weapon} ${s.dmgMin}–${s.dmgMax}${s.str ? ` + Сила ${s.str}` : ''}) = ${per} за каждый удар этого хода` };
      }
      default:
        continue;
    }
  }
  return null;
}

/** Хвост числа в сокете консоли: «+6 блока», «+2 STA». */
const SHORT_TAIL: Record<RestKind, string> = { dmg: '', block: ' блока', heal: ' HP', sta: ' STA', mp: ' MP' };

/**
 * Короткое число артефакта для сокета: «2–3», «5–8 всем», «+2 STA»; у приёма-формулы — что он делает («блок ×1», «взрыв ран»),
 * у пассивных — описание.
 */
export function artifactShort(inst: ArtifactInstance, s: DerivedStats): string {
  const def = artifactDef(inst.id);
  if (def.kind !== 'active') return def.describe(inst.tier);
  const v = restValue(inst, s);
  if (v) return `${v.text}${SHORT_TAIL[v.kind]}${v.all ? ' всем' : ''}`;
  for (const e of def.effects?.(inst.tier) ?? []) {
    switch (e.type) {
      case 'blockStrike':
        return `блок ×${e.mult}`;
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

export const LIVE_ICON: Record<RestKind, UiIconId> = { dmg: 'dmg', block: 'block', heal: 'heal', sta: 'sta', mp: 'mp' };

/** Подпись числа «сейчас» по смыслу — в шапке его подсказки. */
const LIVE_NAME: Record<RestKind, string> = { dmg: 'Урон сейчас', block: 'Блок сейчас', heal: 'Лечение сейчас', sta: 'Стамина', mp: 'Мана' };

/**
 * Подсказка числа «сейчас»: число шапкой, расчёт отдельной строкой-формулой (из чего сложилось), оговорка мелко —
 * в бою его меняют усталость, статусы и цель.
 */
function liveTip(v: RestValue): TipFn {
  return () => [
    tipHead({ icon: LIVE_ICON[v.kind], title: LIVE_NAME[v.kind], color: uiIconColor(LIVE_ICON[v.kind]), aside: h('b', { class: 'tip-val' }, `${v.text}${v.all ? ' всем' : ''}`) }),
    v.calc ? h('div', { class: 'tip-formula' }, ...markKeywords(v.calc, { numbers: true })) : null,
    tipNote('С этого числа плитка начинает ход; в бою его меняют усталость, статусы и цель'),
  ];
}

/**
 * Ячейка «сейчас»: посчитанное число приёма с нынешним снаряжением, расчёт — в подсказке (как «(Наносит X урона)» в Slay the Spire 2).
 * Только когда число посчитано, а не переписано из описания: собственное «+2 STA» уже стоит в тексте.
 */
function liveRow(inst: ArtifactInstance, s: DerivedStats | null, weapon?: string): ArtRow | null {
  if (!s) return null;
  const v = restValue(inst, s, weapon);
  if (!v?.calc) return null;
  return { icon: LIVE_ICON[v.kind], name: 'сейчас', value: v.text, tip: liveTip(v) };
}

/**
 * Цель приёма (решение пользователя: точки дальности у артефакта не смотрятся): «в упор» — только первый в ряду, «любая» — любой
 * враг, «все враги», «на себя». Физический приём без своей дальности бьёт как оружие в руках героя: с луком — любую цель, с мечом
 * и плетью — первого (плеть хлещет ряд только базовым ударом).
 */
function targetRow(inst: ArtifactInstance, run?: RunState): ArtRow | null {
  const def = artifactDef(inst.id);
  if (def.kind !== 'active' || !def.target) return null;
  if (def.target === 'self') return { icon: 'self', name: 'цель', value: 'на себя', tip: paramTip('self', 'Цель: на себя', 'Применяется сразу, цель выбирать не нужно') };
  if (def.target === 'allEnemies') return { icon: 'all', name: 'цель', value: 'все враги', tip: paramTip('all', 'Цель: все враги', 'Бьёт всех врагов разом') };
  const own = def.reach ?? (def.school === 'magic' ? 'any' : null);
  const byWeapon = run && weaponReach(run.hero.weapon, heroDef(run.hero.defId)) === 'any' ? 'any' : 'melee';
  const reach = own ?? byWeapon;
  const how = own ? undefined : 'Достаёт как оружие в руках героя: ближнее — первого в ряду, дальнее, магическое и копьё — любого';
  return reach === 'melee'
    ? { icon: 'one', name: 'цель', value: 'в упор', tip: paramTip('one', 'Цель: в упор', 'Одна цель, только первый в ряду', { note: how }) }
    : { icon: 'one', name: 'цель', value: 'любая', tip: paramTip('one', 'Цель: любая', 'Одна цель, любой враг в ряду', { note: how }) };
}

/** Подсказка ячейки «набор»: какой порог включит эта вещь и что он даёт. */
function setStepTip(arch: ArchetypeDef, n: number, text: string): TipFn {
  return () => [
    tipHead({ icon: { glyph: arch.glyph, color: arch.color }, title: `Набор «${arch.name}»`, color: arch.color, aside: h('b', { class: 'tip-val', style: `color:${arch.color}` }, `${n}/3`) }),
    tipLines([{ icon: 'check', label: `${n} вещи:`, text, tone: 'good' }]),
    tipNote('Эта вещь включит бонус набора'),
  ];
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
    if (bonus) out.push({ icon: 'star', glyph: '▲', color: arch.color, name: 'набор', value: `${arch.name} ${n}/3`, tip: setStepTip(arch, n, bonus.text) });
  }
  return out;
}

/**
 * Ячейки применения: цена, перезарядка или лимит за ход, число «сейчас» и цель. s — статы героя: живое число и хватит ли запаса
 * на цену; run — оружие в руках (цель физического приёма, имя в расчёте). Без героя (коллекция) — только то, что знает вещь.
 */
function useRows(inst: ArtifactInstance, s: DerivedStats | null, run?: RunState): ArtRow[] {
  const def = artifactDef(inst.id);
  if (def.kind !== 'active') return [];
  const rows: ArtRow[] = [];
  const c = artifactCost(def, inst.tier);
  const parts: string[] = [];
  if (c.sta === 'all') parts.push('вся STA');
  else if (c.sta) parts.push(`${c.sta} STA`);
  if (c.mp) parts.push(`${c.mp} MP`);
  // Цена, которую герою не заплатить никогда (максимум меньше цены), — красным: как урон оружия чужого типа.
  const short = !!s && ((c.mp ?? 0) > s.maxMp || (typeof c.sta === 'number' && c.sta > s.sta));
  rows.push({
    icon: c.mp && !c.sta ? 'mp' : 'sta',
    name: 'цена',
    value: parts.length ? parts.join(' + ') : 'бесплатно',
    cls: short ? 'bad' : parts.length ? undefined : 'good',
    tip: paramTip(c.mp && !c.sta ? 'mp' : 'sta', `Цена: ${parts.length ? parts.join(' + ') : 'бесплатно'}`, 'Сколько стоит применить приём', {
      note: short ? 'Герою не хватает запаса: максимум меньше цены приёма' : undefined,
      noteTone: 'bad',
    }),
    wide: parts.length > 1,
  });
  const uses = def.usesPerTurn?.(inst.tier) ?? 0;
  const cd = def.cooldown?.(inst.tier) ?? 0;
  // «КД» — то же слово, что на плитках боя и в подсказке ключевого слова «Перезарядка»; полностью — в подсказке ячейки.
  if (uses > 1) rows.push({ icon: 'uses', name: 'лимит', value: `${uses} за ход`, tip: paramTip('uses', `Лимит: ${uses} за ход`, `До ${uses} раз за ход, без перезарядки`) });
  else if (uses === 1 || cd === 1) rows.push({ icon: 'uses', name: 'лимит', value: 'раз в ход', tip: paramTip('uses', 'Лимит: раз в ход', 'Не чаще раза в ход') });
  else if (cd > 1) rows.push({ icon: 'cd', name: 'КД', value: `${cd} ${plural(cd, 'ход', 'хода', 'ходов')}`, tip: paramTip('cd', `Перезарядка: ${cd} ${plural(cd, 'ход', 'хода', 'ходов')}`, `После применения приём недоступен ${cd} ${plural(cd, 'ход', 'хода', 'ходов')}`) });
  const live = liveRow(inst, s, run?.hero.weapon.name);
  if (live) rows.push(live);
  const target = targetRow(inst, run);
  if (target) rows.push(target);
  return rows;
}

/**
 * Ячейки карточки артефакта: применение, порог набора и — у дубликата — тир в сокете «было → станет», как строки сравнения
 * у предметов; число «сейчас» у дубликата тоже «было → станет» (как «Lv.1 → Lv.2» в Hades). Пассивка без набора и дубликата
 * таблицы не имеет.
 */
function artRows(inst: ArtifactInstance, run?: RunState): ArtRow[] {
  const s = run ? heroStats(run) : null;
  const rows = useRows(inst, s, run);
  rows.push(...setRows(run, inst));
  const same = run ? findSameArtifact(run.hero, inst.id) : null;
  if (same?.art) {
    const next = Math.min(3, Math.max(same.art.tier + 1, inst.tier)) as ArtTier;
    rows.push(
      same.art.tier >= 3
        ? { icon: 'star', name: 'дубликат', value: 'максимум', cls: 'bad', tip: paramTip('star', 'Дубликат', 'Такой артефакт уже стоит на максимальном тире — дубликат ничего не даст', { note: 'Лишний можно переплавить в другой артефакт', noteTone: 'dim' }) }
        : { icon: 'star', name: 'дубликат', value: `${same.art.tier} → ${next}`, cls: 'good', tip: artifactTip({ id: inst.id, tier: same.art.tier }, { upgrade: true, to: next, action: `Сольётся со стоящим в сокете: тир ${same.art.tier} → ${next}` }) },
    );
    const live = rows.find((r) => r.name === 'сейчас');
    if (live && s && same.art.tier < 3) {
      const before = restValue(same.art, s)?.text;
      const after = restValue({ id: inst.id, tier: next }, s)?.text;
      if (before && after && before !== after) Object.assign(live, { value: `${before} → ${after}`, wide: true, cls: 'good' });
    }
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

/** Части строки «что это» под именем артефакта: род, архетипы, особые пометки и тип сокета словом; её же пишет шапка подсказки. */
export function artTypeItems(inst: ArtifactInstance): Child[] {
  const def = artifactDef(inst.id);
  const kind = kindParam(def);
  const slot = slotParam(def);
  return [
    h('span', { class: kind.cls, tip: kind.tip }, kind.text),
    ...artifactTags(inst.id).map((t) => h('span', { class: 'arch-label', style: `color:${ARCHETYPES[t].color}`, tip: archetypeTip(ARCHETYPES[t]) }, `${ARCHETYPES[t].glyph} ${ARCHETYPES[t].name}`)),
    ...specialLabels(inst.id),
    // Тип сокета словом в той же строке (решение пользователя); цвет и значок — как у подписей сокетов в консоли.
    h('span', { class: `slot-label slot-${def.slot}`, tip: slot.tip }, uiIcon(slot.icon, 14), ARTIFACT_SLOT_NAME[def.slot]),
  ];
}

/** Строка «что это» под именем артефакта через точку. */
function artTypeLine(inst: ArtifactInstance): Child[] {
  return dotted(artTypeItems(inst));
}

/** Подсказка к имени и глифу артефакта: тир на шкале из трёх и чем его поднять. */
function artTierTip(tier: ArtTier): TipFn {
  return paramTip({ glyph: '●'.repeat(tier), color: ART_TIER_COLORS[tier] }, `Тир ${tier} из 3`, 'Тир растёт дубликатом, переплавкой лишнего артефакта того же архетипа и в кузнице привала', {
    color: ART_TIER_COLORS[tier],
  });
}

/**
 * Карточка артефакта в награде, у торговца и в окне выбора сокета: шапка (род, архетип, тип сокета словом), таблица параметров,
 * описание эффекта, кнопка. note — строка перед подвалом, footer — кнопка. run — контекст забега: живое число, цель по оружию,
 * порог набора и дубликат считаются по герою; без забега (коллекция) — только то, что знает сам артефакт.
 */
export function artifactCard(inst: ArtifactInstance, footer?: Child, note?: Child, run?: RunState): HTMLElement {
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  const tierTipFn = artTierTip(inst.tier);
  return h(
    'div',
    { class: `card art-card ${SIGNATURE_OWNER[inst.id] ? 'signature' : ''} ${def.keystone ? 'keystone' : ''}`.replace(/\s+/g, ' ').trim(), style: `border-color:${color}` },
    itemHead(h('span', { class: 'item-glyph', style: `color:${color}` }, def.glyph), color, def.name, `color:${nameColor(inst.tier, color)}`, tierTipFn, artTypeLine(inst), tierTipFn),
    artTable(artRows(inst, run)),
    h('div', { class: 'art-desc' }, ...markKeywords(def.describe(inst.tier), { icons: true, numbers: true })),
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
    artTable([{ icon: 'sta', name: 'цена', value: 'бесплатно', cls: 'good', tip: paramTip('sta', 'Цена: бесплатно', 'Зелье пьётся в бою без стамины и маны. Слот зелья один') }]),
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
function typeSkill(gear: GearInstance, def?: HeroDef): { cls: string; tip: string; ok: boolean | null } {
  if (!def || (gear.kind === 'armor' && !hasPerk(gear))) return { cls: '', tip: '', ok: null };
  const ok = works(gear, def);
  const tip =
    gear.kind === 'weapon'
      ? ok
        ? `${def.name} владеет этим типом: полный кубик и перк базы`
        : `${def.name} не владеет этим типом: кубик вдвое меньше, перк не работает`
      : ok
        ? `${def.name} умеет носить этот тип: перк работает`
        : `${def.name} не умеет носить этот тип: перк не работает, DEF и HP остаются`;
  return { cls: ok ? 'skill-yes' : 'skill-no', tip, ok };
}

/**
 * Подсказка к иконке и слову типа: тип шапкой с его пиктограммой, свойство типа абзацем («любая цель, не боится шипов»);
 * с героем — владение строкой: зелёная галочка или красный крест и что теряется.
 */
function gearTypeTip(gear: GearInstance, def?: HeroDef): TipFn {
  return () => {
    const skill = typeSkill(gear, def);
    return [
      tipHead({ icon: gearIconId(gear), title: gearTypeName(gear), nameColor: 'var(--text)' }),
      gear.kind === 'weapon' ? tipText(cap(weaponTypeText(weaponType(gear), gear.tier))) : null,
      skill.ok === null ? null : tipLines([{ icon: skill.ok ? 'check' : 'cross', text: skill.tip, tone: skill.ok ? 'good' : 'bad' }]),
    ];
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Подсказка владения типом оружия (выбор героя, лист «Персонаж»): пиктограмма и тип шапкой, владеет или нет — строкой
 * с галочкой или крестом, свойство типа — абзацем.
 */
export function weaponSkillTip(type: WeaponType, skilled: boolean): TipFn {
  return () => [
    tipHead({ icon: type, title: `${WEAPON_TYPE_NAMES[type]} оружие`, nameColor: 'var(--text)' }),
    tipLines([
      skilled
        ? { icon: 'check', text: 'Владеет: полный кубик и перк базы', tone: 'good' }
        : { icon: 'cross', text: `Не владеет: кубик ${Math.round(UNSKILLED_DICE_MULT * 100)} %, перк базы не работает; аффикс и артефакты остаются`, tone: 'bad' },
    ]),
    tipText(`Свойство типа: ${weaponTypeHint(type)}`),
  ];
}

/** Подсказка умения носить тип брони: то же, что у оружия; без умения теряется только перк. */
export function armorSkillTip(type: ArmorType, skilled: boolean): TipFn {
  return () => [
    tipHead({ icon: type, title: `${ARMOR_TYPE_NAMES[type]} броня`, nameColor: 'var(--text)' }),
    tipLines([
      skilled
        ? { icon: 'check', text: 'Умеет носить: перк базы работает', tone: 'good' }
        : { icon: 'cross', text: 'Не умеет носить: перк базы не работает; DEF, HP и аффикс остаются', tone: 'bad' },
    ]),
  ];
}

/** Главное число предмета без сравнения (карточка без забега): кубик в руках героя у оружия, DEF и HP у брони. */
function mainStats(gear: GearInstance, def?: HeroDef): HTMLElement[] {
  if (gear.kind === 'weapon') {
    const d = def ? weaponDice(def, gear) : { min: gear.dmgMin, max: gear.dmgMax };
    const halved = !!def && !canWieldWeapon(def, gear);
    return [
      h(
        'span',
        { class: `big-stat ${halved ? 'bad' : ''}`, tip: dmgTip(gear, d, halved) },
        uiIcon('dmg', 18),
        h('b', null, `${d.min}–${d.max}`),
        h('small', null, 'урон'),
      ),
    ];
  }
  const out: HTMLElement[] = [];
  out.push(h('span', { class: 'big-stat', tip: DEF_TIP }, uiIcon('def', 18), h('b', null, `+${gear.def}`), h('small', null, 'DEF')));
  if (gear.hp) out.push(h('span', { class: 'big-stat', tip: HP_TIP }, uiIcon('hp', 18), h('b', null, `+${gear.hp}`), h('small', null, 'HP')));
  return out;
}

/** Подсказка урона оружия: кубик в руках героя; у чужого типа — кубик предмета и почему он вдвое меньше. */
function dmgTip(gear: GearInstance, d: { min: number; max: number }, halved: boolean): TipFn {
  return paramTip('dmg', 'Урон', 'Урон базовой атаки в руках героя, без Силы', {
    aside: h('b', { class: 'tip-val' }, `${d.min}–${d.max}`),
    note: halved ? `Кубик оружия ${gear.dmgMin}–${gear.dmgMax}, но герой не владеет этим типом — вдвое меньше` : undefined,
    noteTone: 'bad',
  });
}

const DEF_TIP = paramTip('def', 'Защита', '«Защититься» даёт 80 % Защиты блоком, округление вверх');
const HP_TIP = paramTip('hp', 'Здоровье', 'Прибавка брони к максимуму HP');

/**
 * Строка перка: значок, имя и текст одним абзацем — текст идёт сразу за именем и переносится под него. Не работает у героя —
 * зачёркнута целиком, причина в подсказке.
 */
function perkRow(gear: GearInstance, def: HeroDef | undefined): HTMLElement | null {
  const perk = baseOf(gear.kind, gear.base).perk;
  if (!perk) return null;
  const ok = works(gear, def);
  const text = perk.text(gear.tier);
  const tip = paramTip('perk', perk.name, cap(text), {
    sub: ['перк базы', gearTypeName(gear).toLowerCase()],
    note: ok ? undefined : 'Не работает: герой не владеет этим типом',
    noteTone: 'bad',
  });
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
      return h('div', { class: 'chip', tip: artifactTip(a) }, h('span', { class: 'chip-glyph' }, artifactDef(a.id).glyph));
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
  const typeTip = gearTypeTip(gear, def);
  return itemHead(uiIcon(gearIconId(gear), 24, color), color, gear.name, `color:${nameColor(gear.tier, color)}`, tierTip(gear.tier), dotted([h('span', { class: skill.cls || null, tip: typeTip }, gearTypeShort(gear)), reachDots(gear, def)]), typeTip);
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

/**
 * Подсказка таблицы «надето → эта»: как её читать и строки сравнения, которые не влезли в карточку (таблица показывает четыре),
 * каждая своим значком и цветом разницы.
 */
function compareTip(rows: CompareRow[]): TipFn {
  return () => {
    // Первые четыре строки и так в карточке — в подсказке только те, что не влезли.
    const lines: TipLine[] = rows.slice(4).map((r) => ({
      icon: compareIcon(r.key),
      label: `${r.name}:`,
      value: h('span', null, h('span', { class: 'tip-dim' }, r.before), h('span', { class: 'tip-dim' }, ' → '), h('span', { class: r.dir > 0 ? 'tip-good' : r.dir < 0 ? 'tip-bad' : '' }, r.after, r.dir ? (r.dir > 0 ? ' ▲' : ' ▼') : '')),
    }));
    return [
      tipHead({ icon: 'arrow', title: 'Сравнение с надетым', nameColor: 'var(--text)' }),
      tipText('Слева — что надето сейчас, справа — с этим предметом'),
      lines.length ? tipSection('Не влезло в карточку:', [tipLines(lines)]) : null,
    ];
  };
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
          { class: 'cmp', tip: compareTip(rows) },
          ...rows.slice(0, 4).map(row),
        )
      : h('div', { class: 'item-stats' }, ...mainStats(gear, o.def)),
    h('div', { class: 'item-props' }, perkRow(gear, o.def)),
    overflowNote(cmp?.overflow ?? []),
    h('div', { class: 'card-foot' }, socketIcons(gear), o.footer),
  );
}

// ─── Плитка экипировки в консоли ───────────────────────────────────────────

/**
 * Ячейка сокета плитки: глиф, имя, число. Пустой сокет — такой же прямоугольник на полстроки, пунктиром цвета своего типа,
 * со значком и типом словами (просьба пользователя): четыре сокета — четыре одинаковые плашки 2×2, а не квадратики.
 */
function tileSocket(inst: ArtifactInstance | null, gear: GearInstance, i: number, s: DerivedStats): HTMLElement {
  const kind = slotKindAt(gear, i);
  if (!inst) return h('div', { class: `sock empty k-${kind}`, tip: slotKindTip(kind, { state: 'свободен' }) }, uiIcon(SLOT_ICON[kind], 16), h('span', { class: 'sock-name' }, SLOT_KIND_NAME[kind]));
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  return h(
    'div',
    { class: `sock k-${kind}`, tip: artifactTip(inst, { stats: s }) },
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
        { class: `tile-stat ${halved ? 'bad' : ''}`.trim(), tip: dmgTip(gear, d, halved) },
        uiIcon('dmg', 14),
        h('b', null, `${d.min}–${d.max}`),
        ' урон',
      ),
    );
  } else {
    parts.push(h('span', { class: 'tile-stat', tip: DEF_TIP }, uiIcon('def', 14), h('b', null, gear.def ? `+${gear.def}` : '0'), ' DEF'));
    if (gear.hp) parts.push(h('span', { class: 'tile-stat', tip: HP_TIP }, uiIcon('hp', 14), h('b', null, `+${gear.hp}`), ' HP'));
  }
  if (gear.affix) {
    const text = affixText(gear.affix);
    parts.push(h('span', { class: 'tile-stat affix', tip: paramTip('affix', 'Аффикс', cap(text), { sub: ['случайный бонус предмета'] }) }, uiIcon('affix', 14), ...markKeywords(text, { numbers: true })));
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

// ─── Лист «Персонаж» (v0.50) ───────────────────────────────────────────────
// Та же грамматика, что у карточек: экипировка — шапкой, строкой статов и перком, артефакты — строками с глифом в рамке цвета
// тира, именем и строкой «что это», параметрами применения значками и описанием. Места в листе меньше, чем в карточке,
// поэтому параметры идут строкой без названий (как в узкой колонке торговца): что это — пишет подсказка значка.

/** Параметры артефакта строкой: значок и значение, название и расчёт — в подсказке. */
function inlineParams(rows: ArtRow[]): HTMLElement | null {
  if (!rows.length) return null;
  return h(
    'div',
    { class: 'sheet-art-params' },
    ...rows.map((r) => h('span', { class: `sheet-art-param ${r.cls ?? ''}`.trim(), tip: r.tip ?? null }, r.glyph ? h('span', { style: r.color ? `color:${r.color}` : null }, r.glyph) : uiIcon(r.icon, 14), r.value)),
  );
}

/** Артефакт в листе: глиф в рамке цвета тира, имя цветом тира и род, параметры значками, описание целиком. */
function sheetArtifact(inst: ArtifactInstance, s: DerivedStats, run: RunState): HTMLElement {
  const def = artifactDef(inst.id);
  const color = ART_TIER_COLORS[inst.tier];
  const tierTipFn = artifactTip(inst, { stats: s });
  return h(
    'div',
    { class: `sheet-art ${def.keystone ? 'keystone' : ''}`.trim() },
    h('span', { class: 'item-icon', style: `border-color:${color}`, tip: tierTipFn }, h('span', { class: 'item-glyph', style: `color:${color}` }, def.glyph)),
    h(
      'div',
      { class: 'sheet-art-body' },
      h('div', { class: 'sheet-art-head' }, h('span', { class: 'sheet-art-name', style: `color:${nameColor(inst.tier, color)}`, tip: tierTipFn }, def.name), h('span', { class: 'item-type' }, ...artTypeLine(inst))),
      inlineParams(useRows(inst, s, run)),
      h('div', { class: 'art-desc' }, ...markKeywords(def.describe(inst.tier), { icons: true, numbers: true })),
    ),
  );
}

/** Свободный сокет в листе: пунктир цвета типа, значок и тип словами — как пустой сокет плитки в консоли. */
function sheetSocket(kind: SlotKind): HTMLElement {
  return h('div', { class: `sheet-art empty k-${kind}`, tip: slotKindTip(kind, { state: 'свободен' }) }, h('span', { class: 'item-icon' }, uiIcon(SLOT_ICON[kind], 16)), h('span', { class: 'sheet-art-name' }, `свободный ${SLOT_KIND_NAME[kind]} сокет`));
}

/**
 * Экипировка в листе «Персонаж»: шапка как у карточки (тип цветом владения, дальность точками), строка статов с аффиксом,
 * перк абзацем целиком и все артефакты строками. s — статы, которыми считаются числа «сейчас» (в бою — боевые).
 */
export function sheetGearTile(gear: GearInstance, def: HeroDef, s: DerivedStats, run: RunState): HTMLElement {
  return h(
    'div',
    { class: `gear-tile sheet-tile ${gear.kind}`, style: `border-color:${GEAR_TIERS[gear.tier].color}` },
    gearHead(gear, def),
    tileStatsRow(gear, def),
    perkRow(gear, def),
    h('div', { class: 'sheet-arts' }, ...gear.slots.map((a, i) => (a ? sheetArtifact(a, s, run) : sheetSocket(slotKindAt(gear, i))))),
  );
}
