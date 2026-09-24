import { button, h, type Child } from '../dom';
import type { DerivedStats, HeroDef } from '../../engine/types';
import { artifactDef } from '../../data/artifacts';
import { ARMOR_TYPE_NAMES, WEAPON_TYPE_NAMES, armorSkillTitle, baseOf, gearPerkText, makeStartingGear, weaponSkillTitle } from '../../data/gear';
import { computeStats } from '../../engine/stats';
import { traitDef } from '../../data/traits';
import { defendBlock } from '../../engine/combat';
import { HERO_MASTERY, MASTERY_LEVELS, UNLOCK_LEVEL, nextLevelXp } from '../../data/mastery';
import { heroLevelOf, heroXpOf, pickedSignature, pickedStart, pickedTrait, signatureUnlocked, startUnlocked, traitUnlocked } from '../save';
import { heroSprite } from '../heroSprite';
import { uiIcon, type UiIconId } from '../icons';
import { markKeywords } from '../keywords';
import { dotted, effectText, paramChip, useParams } from '../cardParts';
import { UI } from '../variants';
import type { App } from '../app';

// ─── Экран выбора героя: прототипы v0.50 (variants.ts) ─────────────────────
// A — две вкладки: «Герой» (кто это, статы, умения, стартовое снаряжение) и «Старт» (навык, черта, оружие карточками);
// B — всё на одной странице: слева кто это, справа выбор на старт переключателями, описание только у выбранного;
// C — три вкладки: «Герой», «Старт» и отдельная «Мастерство» — лестница уровней с тем, что каждый открывает.
// Сетка героев слева и верхняя полоса — общие с нынешним экраном.

type Tab = App['heroTab'];

/** Статы героя со стартовым снаряжением, выбранным навыком и чертой — как на нынешнем экране. */
function heroStats(app: App, def: HeroDef): DerivedStats {
  const gear = makeStartingGear(def, pickedStart(app.profile, def));
  return computeStats(def, gear.weapon, gear.armor, { innate: { id: pickedSignature(app.profile, def), tier: 1 }, trait: pickedTrait(app.profile, def) });
}

/** Шапка: спрайт, имя, роль одной-двумя строками. */
function header(def: HeroDef, px = 88): HTMLElement {
  return h('div', { class: 'hsv-header' }, heroSprite(def.id, px), h('div', { class: 'hsv-title' }, h('div', { class: 'hsv-name' }, def.name), h('div', { class: 'hsv-role' }, def.role)));
}

/** Статы плитками: иконка, крупное число, подпись. Подробности — в подсказке. */
function statTiles(s: DerivedStats, compact = false): HTMLElement {
  const tile = (icon: UiIconId, value: string, label: string, tip: string) =>
    h('div', { class: 'hsv-stat', tip }, uiIcon(icon, compact ? 14 : 20), h('div', { class: 'hsv-stat-body' }, h('b', null, value), h('small', null, compact ? label.replace('. ', '.') : label)));
  return h(
    'div',
    { class: `hsv-stats ${compact ? 'compact' : ''}` },
    tile('hp', `${s.maxHp}`, 'здоровье', 'Максимум HP на старте забега'),
    tile('def', `${s.def}`, 'защита', `«Защититься» даёт 80 % Защиты блоком: +${defendBlock(s)} блока`),
    tile('sta', `${s.sta}`, 'стамина', 'Очки действий за ход: удар — 1, приёмы — по цене'),
    tile('mp', s.mpRegen ? `${s.maxMp}+${s.mpRegen}` : `${s.maxMp}`, 'мана', 'Мана и реген за ход: заклинания стоят маны'),
    tile('dmg', `${s.dmgMin + s.str}–${s.dmgMax + s.str}`, 'урон', 'Урон базовой атаки: кубик оружия + Сила'),
    tile('crit', `${Math.round(s.crit * 100)}%`, 'крит', 'Шанс критического удара'),
    tile('critDmg', `${s.critDmg}%`, 'крит. урон', 'Сколько процентов обычного урона наносит крит'),
    tile('fatigue', `−${Math.round((1 - s.fatigue) * 100)}%`, 'усталость', 'На столько слабее каждая следующая атака в этом ходу'),
  );
}

/**
 * Владение оружием и умение носить броню: все три типа словами, своё — ярко с зелёной рамкой, чужое — тускло, зачёркнуто и с крестом.
 * Что даёт владение и свойство типа — в подсказке к чипу.
 */
function proficiency(def: HeroDef): HTMLElement {
  const chip = (icon: UiIconId, name: string, ok: boolean, tip: string) => h('span', { class: `prof-chip ${ok ? 'yes' : 'no'}`, tip }, uiIcon(ok ? icon : 'cross', 14), name);
  return h(
    'div',
    { class: 'hsv-prof' },
    h('div', { class: 'hsv-prof-row' }, h('span', { class: 'hsv-label' }, 'Оружие'), ...(['melee', 'ranged', 'magic'] as const).map((t) => chip(t, WEAPON_TYPE_NAMES[t], def.weaponSkill[t], weaponSkillTitle(t, def.weaponSkill[t])))),
    h('div', { class: 'hsv-prof-row' }, h('span', { class: 'hsv-label' }, 'Броня'), ...(['heavy', 'medium', 'light'] as const).map((t) => chip(t, ARMOR_TYPE_NAMES[t], def.armorSkill[t], armorSkillTitle(t, def.armorSkill[t])))),
  );
}

/** Стартовое снаряжение строками: оружие с кубиком и перком, броня с DEF и перком. */
function startGear(app: App, def: HeroDef): HTMLElement {
  const gear = makeStartingGear(def, pickedStart(app.profile, def));
  const row = (icon: UiIconId, name: string, stat: string, perk: string) =>
    h('div', { class: 'hsv-gear-row', tip: perk || 'Без перка' }, uiIcon(icon, 16), h('span', { class: 'hsv-gear-name' }, name), h('b', null, stat), perk ? h('span', { class: 'hsv-gear-perk' }, perk.split(':')[0]) : null);
  const w = baseOf('weapon', gear.weapon.base);
  return h(
    'div',
    { class: 'hsv-gear' },
    h('div', { class: 'hsv-label' }, 'Снаряжение на старт'),
    row(w.type ?? 'melee', gear.weapon.name, `${gear.weapon.dmgMin}–${gear.weapon.dmgMax}`, gearPerkText(gear.weapon)),
    row(baseOf('armor', gear.armor.base).armorType ?? 'medium', gear.armor.name, `${gear.armor.def ? `+${gear.armor.def}` : '0'} DEF`, gearPerkText(gear.armor)),
  );
}

// ─── Выбор на старт ─────────────────────────────────────────────────────────

interface Option {
  key: string;
  glyph: Child;
  title: string;
  params: HTMLElement[];
  text: string;
  open: boolean;
  /** Коротко в шапке карточки: «Мастерство 4». */
  lock: string;
  /** Полностью в подсказке, если условие длиннее. */
  lockFull?: string;
  selected: boolean;
  pick: () => void;
}

function skillOptions(app: App, def: HeroDef): Option[] {
  const chosen = pickedSignature(app.profile, def);
  return def.signatures.map((id) => {
    const a = artifactDef(id);
    return {
      key: id,
      glyph: h('span', { class: 'hsv-glyph' }, a.glyph),
      title: a.name,
      params: useParams(a, 1).map(paramChip),
      text: effectText(a, 1),
      open: signatureUnlocked(app.profile, def, id),
      lock: `Мастерство ${UNLOCK_LEVEL.signature}`,
      lockFull: `мастерство ${UNLOCK_LEVEL.signature} или победа героем`,
      selected: id === chosen,
      pick: () => app.selectSignature(def.id, id),
    };
  });
}

function traitOptions(app: App, def: HeroDef): Option[] {
  const chosen = pickedTrait(app.profile, def);
  return def.traits.map((id) => {
    const t = traitDef(id);
    return { key: id, glyph: uiIcon('star', 18), title: t.name, params: [], text: t.describe(1), open: traitUnlocked(app.profile, def, id), lock: `Мастерство ${UNLOCK_LEVEL.trait}`, selected: id === chosen, pick: () => app.selectTrait(def.id, id) };
  });
}

function weaponOptions(app: App, def: HeroDef): Option[] {
  const chosen = pickedStart(app.profile, def);
  return [def.weapon.base, HERO_MASTERY[def.id].start].map((base) => {
    const b = baseOf('weapon', base);
    const g = makeStartingGear(def, base).weapon;
    const name = b.name.charAt(0).toUpperCase() + b.name.slice(1);
    const perk = gearPerkText(g);
    return {
      key: base,
      glyph: uiIcon(b.type ?? 'melee', 18),
      title: `${name} ${g.dmgMin}–${g.dmgMax}`,
      params: [],
      text: perk,
      open: startUnlocked(app.profile, def, base),
      lock: `Мастерство ${UNLOCK_LEVEL.start}`,
      selected: base === chosen,
      pick: () => app.selectStart(def.id, base),
    };
  });
}

/** Карточка варианта: глиф, имя, параметры, описание; выбранная — с рамкой и галочкой, закрытая — с замком и условием. */
function optionCard(o: Option): HTMLElement {
  return h(
    'div',
    {
      class: `hsv-option ${o.selected ? 'selected' : ''} ${o.open ? '' : 'locked'}`,
      tip: o.open ? (o.selected ? 'Выбрано: с этим герой начнёт забег' : 'Нажмите, чтобы выбрать') : `Закрыто. Откроется: ${o.lockFull ?? o.lock.toLowerCase()}`,
      onclick: () => {
        if (o.open) o.pick();
      },
    },
    h(
      'div',
      { class: 'hsv-option-head' },
      o.open ? o.glyph : uiIcon('lock', 16),
      h('span', { class: 'hsv-option-title' }, o.title),
      o.selected ? h('span', { class: 'hsv-option-mark' }, uiIcon('check', 14), 'выбрано') : null,
      !o.open ? h('span', { class: 'hsv-option-lock' }, o.lock) : null,
    ),
    o.params.length && o.open ? h('div', { class: 'hsv-option-params' }, ...o.params) : null,
    o.text ? h('div', { class: 'hsv-option-text' }, ...markKeywords(o.text, { icons: true, numbers: true })) : null,
  );
}

const GROUPS: { key: 'skill' | 'trait' | 'weapon'; icon: UiIconId; name: string; hint: string }[] = [
  { key: 'skill', icon: 'crown', name: 'Навык', hint: 'врождённый, растёт с локацией' },
  { key: 'trait', icon: 'star', name: 'Черта', hint: 'своя механика героя' },
  { key: 'weapon', icon: 'dmg', name: 'Оружие', hint: 'с чем выйти в забег' },
];

function groupOptions(app: App, def: HeroDef, key: 'skill' | 'trait' | 'weapon'): Option[] {
  return key === 'skill' ? skillOptions(app, def) : key === 'trait' ? traitOptions(app, def) : weaponOptions(app, def);
}

/** Выбор на старт карточками: строка на группу — подпись слева, два варианта рядом. */
function choiceRows(app: App, def: HeroDef): HTMLElement {
  return h(
    'div',
    { class: 'hsv-choices' },
    ...GROUPS.map((g) =>
      h(
        'div',
        { class: `hsv-choice-row g-${g.key}` },
        h('div', { class: 'hsv-choice-label' }, h('div', null, uiIcon(g.icon, 16), ` ${g.name}`), h('small', null, g.hint)),
        ...groupOptions(app, def, g.key).map(optionCard),
      ),
    ),
  );
}

/** Выбор на старт переключателями (B): сегменты с именами, описание только у выбранного. */
function choiceToggles(app: App, def: HeroDef): HTMLElement {
  return h(
    'div',
    { class: 'hsv-toggles' },
    h('div', { class: 'hsv-label' }, 'На старт'),
    ...GROUPS.map((g) => {
      const opts = groupOptions(app, def, g.key);
      const sel = opts.find((o) => o.selected) ?? opts[0];
      return h(
        'div',
        { class: 'hsv-toggle-group' },
        h('div', { class: 'hsv-toggle-head' }, h('span', { class: 'hsv-toggle-name' }, uiIcon(g.icon, 14), ` ${g.name}`)),
        h(
          'div',
          { class: 'seg' },
          ...opts.map((o) =>
            h(
              'button',
              {
                class: `seg-opt ${o.selected ? 'selected' : ''} ${o.open ? '' : 'locked'}`,
                tip: o.open ? `${o.title}: ${o.text}` : `${o.title}: ${o.text}\nЗакрыто. Откроется: ${o.lockFull ?? o.lock.toLowerCase()}`,
                onclick: () => {
                  if (o.open) o.pick();
                },
              },
              o.open ? null : uiIcon('lock', 12),
              o.title,
            ),
          ),
        ),
        sel.params.length ? h('div', { class: 'hsv-option-params' }, ...sel.params) : null,
        h('div', { class: 'hsv-toggle-text' }, ...markKeywords(sel.text, { icons: true, numbers: true })),
      );
    }),
  );
}

// ─── Мастерство ─────────────────────────────────────────────────────────────

interface Rung {
  level: number;
  icon: UiIconId;
  title: string;
  what: string;
}

/** Что даёт каждый уровень мастерства этому герою: первый — старт, дальше по UNLOCK_LEVEL. */
function rungs(def: HeroDef): Rung[] {
  const m = HERO_MASTERY[def.id];
  const start = baseOf('weapon', m.start);
  return [
    { level: 1, icon: 'check', title: 'Старт', what: 'первый навык, первая черта, родное оружие' },
    { level: UNLOCK_LEVEL.signature, icon: 'crown', title: 'Второй навык', what: artifactDef(def.signatures[1]).name },
    { level: UNLOCK_LEVEL.keystone, icon: 'key', title: 'Ключевая вещь в общий пул', what: artifactDef(m.keystone).name },
    { level: UNLOCK_LEVEL.trait, icon: 'star', title: 'Вторая черта', what: traitDef(m.trait).name },
    { level: UNLOCK_LEVEL.start, icon: 'dmg', title: 'Стартовое оружие', what: start.name.charAt(0).toUpperCase() + start.name.slice(1) },
  ];
}

/** Полоса мастерства с пятью ступенями-метками (подвал A и B): горят пройденные, подсказка — что открывает каждая. */
function masteryStrip(app: App, def: HeroDef): HTMLElement {
  const level = heroLevelOf(app.profile, def.id);
  const xp = heroXpOf(app.profile, def.id);
  const next = nextLevelXp(level);
  const nextRung = rungs(def).find((r) => r.level === level + 1);
  return h(
    'div',
    { class: 'hsv-mastery-strip', tip: 'Мастерство растёт с каждым забегом героя: клетки, боссы, победа. Открывает разнообразие, а не силу' },
    h('div', { class: 'hsv-mastery-head' }, uiIcon('star', 14), h('span', null, `Мастерство ${level}`), h('span', { class: 'dim' }, next ? `${xp}/${next}` : 'максимум')),
    h(
      'div',
      { class: 'hsv-rungs' },
      ...rungs(def).map((r, i) =>
        h(
          'span',
          { class: `hsv-rung ${r.level <= level ? 'on' : ''} ${r.level === level + 1 ? 'next' : ''}`, tip: `Мастерство ${r.level}: ${r.title}${r.level > 1 ? ` — ${r.what}` : ''}${r.level <= level ? '\nОткрыто' : `\nНужно ${MASTERY_LEVELS[r.level - 1]} опыта`}` },
          i > 0 ? h('i', { class: 'hsv-rung-line' }) : null,
          uiIcon(r.level <= level ? r.icon : 'lock', 14),
        ),
      ),
    ),
    nextRung ? h('div', { class: 'hsv-mastery-next' }, `Дальше: ${nextRung.title.toLowerCase()} — ${nextRung.what}`) : null,
  );
}

/** Вкладка «Мастерство» (C): уровни столбцом с тем, что открывают, полоса опыта и откуда он берётся. */
function masteryTab(app: App, def: HeroDef): HTMLElement {
  const level = heroLevelOf(app.profile, def.id);
  const xp = heroXpOf(app.profile, def.id);
  const next = nextLevelXp(level);
  const from = MASTERY_LEVELS[level - 1];
  const pct = next ? Math.max(0, Math.min(1, (xp - from) / (next - from))) : 1;
  return h(
    'div',
    { class: 'hsv-mastery' },
    h(
      'div',
      { class: 'hsv-mastery-top' },
      h('span', { class: 'hsv-mastery-level' }, uiIcon('star', 18), ` Мастерство ${level}`),
      h('div', { class: 'mastery-bar' }, h('div', { class: 'mastery-fill', style: `width:${Math.round(pct * 100)}%` })),
      h('span', { class: 'dim' }, next ? `${xp} / ${next} опыта` : 'максимум'),
    ),
    h('div', { class: 'hsv-mastery-how' }, 'Опыт за забег: клетка +1, босс +10, победа +20. Открывает разнообразие, а не силу.'),
    h(
      'div',
      { class: 'hsv-ladder' },
      ...rungs(def).map((r) =>
        h(
          'div',
          { class: `hsv-ladder-row ${r.level <= level ? 'on' : ''} ${r.level === level + 1 ? 'next' : ''}` },
          h('span', { class: 'hsv-ladder-lvl' }, `${r.level}`),
          uiIcon(r.level <= level ? r.icon : 'lock', 16),
          h('span', { class: 'hsv-ladder-title' }, r.title),
          r.level > 1 ? h('span', { class: 'hsv-ladder-what' }, r.what) : h('span', { class: 'hsv-ladder-what dim' }, r.what),
          h('span', { class: 'hsv-ladder-need' }, r.level <= level ? 'открыто' : `${MASTERY_LEVELS[r.level - 1]} опыта`),
        ),
      ),
    ),
  );
}

// ─── Сборка превью ─────────────────────────────────────────────────────────

function tabBar(app: App, tabs: { key: Tab; label: string; icon: UiIconId }[]): HTMLElement {
  const current = tabs.some((t) => t.key === app.heroTab) ? app.heroTab : tabs[0].key;
  return h('div', { class: 'hsv-tabs' }, ...tabs.map((t) => h('button', { class: `hsv-tab ${t.key === current ? 'active' : ''}`, onclick: () => app.setHeroTab(t.key) }, uiIcon(t.icon, 14), t.label)));
}

/** Кнопка старта: одна на все варианты. */
function startButton(app: App, def: HeroDef, parseSeed: (raw: string) => number | undefined): HTMLElement {
  return button(h('span', null, `В забег: ${def.name} `, '▶'), () => app.newRun(def.id, parseSeed(app.seedText)), { class: 'primary big hsv-start' });
}

/** Сводка выбранного на старт одной строкой (вкладка «Герой» варианта A): навык, черта, оружие. */
function loadoutLine(app: App, def: HeroDef): HTMLElement {
  const skill = artifactDef(pickedSignature(app.profile, def));
  const trait = traitDef(pickedTrait(app.profile, def));
  const w = baseOf('weapon', pickedStart(app.profile, def));
  return h(
    'div',
    { class: 'hsv-loadout', tip: 'С этим герой выйдет в забег; поменять — вкладка «Старт»' },
    ...dotted([h('span', null, uiIcon('crown', 14), ` ${skill.name}`), h('span', null, uiIcon('star', 14), ` ${trait.name}`), h('span', null, uiIcon(w.type ?? 'melee', 14), ` ${w.name.charAt(0).toUpperCase() + w.name.slice(1)}`)]),
  );
}

/** Превью героя в выбранном варианте; null — нынешний экран (heroSelect.ts). */
export function heroPreviewVariant(app: App, def: HeroDef, parseSeed: (raw: string) => number | undefined): HTMLElement | null {
  if (UI.hs === 'old') return null;
  const s = heroStats(app, def);
  if (UI.hs === 'b') {
    return h(
      'div',
      { class: 'hero-preview hsv hsv-b' },
      header(def, 80),
      h(
        'div',
        { class: 'hsv-cols' },
        h('div', { class: 'hsv-col' }, statTiles(s, true), proficiency(def), startGear(app, def)),
        h('div', { class: 'hsv-col' }, choiceToggles(app, def)),
      ),
      h('div', { class: 'hsv-foot' }, masteryStrip(app, def), startButton(app, def, parseSeed)),
    );
  }
  const tabs: { key: Tab; label: string; icon: UiIconId }[] = [
    { key: 'hero', label: 'Герой', icon: 'self' },
    { key: 'start', label: 'Старт', icon: 'crown' },
  ];
  if (UI.hs === 'c') tabs.push({ key: 'mastery', label: 'Мастерство', icon: 'star' });
  const tab = tabs.some((t) => t.key === app.heroTab) ? app.heroTab : 'hero';
  const body =
    tab === 'start'
      ? choiceRows(app, def)
      : tab === 'mastery'
        ? masteryTab(app, def)
        : UI.hs === 'c'
          ? // C (решение пользователя): на первой вкладке только статы и владение — стартовое снаряжение и выбранное живут на «Старте».
            h('div', { class: 'hsv-hero-tab' }, statTiles(s), proficiency(def))
          : h(
              'div',
              { class: 'hsv-hero-tab' },
              statTiles(s),
              h('div', { class: 'hsv-cols' }, proficiency(def), h('div', { class: 'hsv-col' }, startGear(app, def), h('div', { class: 'hsv-gear' }, h('div', { class: 'hsv-label' }, 'Выбрано на старт'), loadoutLine(app, def)))),
            );
  return h(
    'div',
    { class: `hero-preview hsv hsv-${UI.hs}` },
    header(def, 80),
    tabBar(app, tabs),
    h('div', { class: 'hsv-body' }, body),
    // В C подвал — только кнопка старта: что выбрано, видно по карточкам «Старта», мастерство — своей вкладкой (решение пользователя).
    h('div', { class: 'hsv-foot' }, UI.hs === 'c' ? null : masteryStrip(app, def), startButton(app, def, parseSeed)),
  );
}
