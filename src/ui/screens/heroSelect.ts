import { button, h, type Child, type TipFn } from '../dom';
import { HERO_LIST, heroDef } from '../../data/heroes';
import { artifactDef } from '../../data/artifacts';
import { ARMOR_TYPE_NAMES, GEAR_TIERS, WEAPON_TYPE_NAMES, baseOf, gearPerkText, makeStartingGear } from '../../data/gear';
import { computeStats } from '../../engine/stats';
import { hashString } from '../../engine/rng';
import { defendBlock } from '../../engine/combat';
import { traitDef } from '../../data/traits';
import { HERO_MASTERY, MASTERY_LEVELS, UNLOCK_LEVEL, nextLevelXp } from '../../data/mastery';
import { heroAvatar, heroSprite } from '../heroSprite';
import { heroLevelOf, heroXpOf, pickedDifficulty, pickedSignature, pickedStart, pickedTrait, signatureUnlocked, startUnlocked, traitUnlocked } from '../save';
import { DIFFICULTY_LIST } from '../../data/boons';
import { uiIcon, type UiIconId } from '../icons';
import { markKeywords } from '../keywords';
import { paramChip, useParams } from '../cardParts';
import { armorSkillTip, weaponSkillTip } from '../cards';
import { paramTip, tipBar, tipHead, tipLines, tipText } from '../tips';
import type { DerivedStats, GearTier, HeroDef } from '../../engine/types';
import type { App } from '../app';

// ─── Выбор героя (v0.50) ───────────────────────────────────────────────────
// Слева сетка героев, справа превью с тремя вкладками (решение пользователя): «Герой» — статы и владение оружием и бронёй,
// «Старт» — врождённый навык, черта и стартовое оружие карточками по два, «Мастерство» — лестница уровней с тем, что каждый
// открывает. Что выбрано, видно по карточкам «Старта» — отдельной строки выбора нет; подвал — только кнопка старта.

type Tab = App['heroTab'];

/** Число — как есть, любая другая строка — хэш; пусто — случайный сид. */
function parseSeed(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  return /^\d+$/.test(s) ? Number(s) >>> 0 : hashString(s);
}

/**
 * Метки на плитке героя (v0.50), как наклейки ставок на джокерах в Balatro: слева сверху — уровень мастерства, со второго, цветом
 * той же шкалы, что тиры предметов (зелёный, синий, фиолетовый, оранжевый); справа сверху — корона, если герой хоть раз прошёл
 * забег, с числом побед от двух. Первый уровень и ноль побед меток не дают: у новичка сетка чистая, наклейку надо заработать.
 */
function tileMarks(app: App, def: HeroDef): HTMLElement[] {
  const level = heroLevelOf(app.profile, def.id);
  const wins = app.profile.heroWins[def.id] ?? 0;
  const out: HTMLElement[] = [];
  if (level >= 2) {
    const color = GEAR_TIERS[level as GearTier].color;
    out.push(h('span', { class: 'hero-mark mastery', style: `--mark:${color}` }, uiIcon('star', 12, color), `${level}`));
  }
  if (wins > 0) out.push(h('span', { class: 'hero-mark wins' }, uiIcon('crown', 12), wins > 1 ? `${wins}` : null));
  return out;
}

/**
 * Подсказка плитки: портрет и имя шапкой, роль абзацем, мастерство — полосой опыта до следующего уровня цветом метки уровня,
 * забеги и победы — строкой с короной.
 */
function tileTip(app: App, def: HeroDef): TipFn {
  return () => {
    const level = heroLevelOf(app.profile, def.id);
    const xp = heroXpOf(app.profile, def.id);
    const next = nextLevelXp(level);
    const from = MASTERY_LEVELS[level - 1];
    const runs = app.profile.heroRuns[def.id] ?? 0;
    const wins = app.profile.heroWins[def.id] ?? 0;
    const color = GEAR_TIERS[Math.min(5, Math.max(1, level)) as GearTier].color;
    return [
      tipHead({ icon: heroAvatar(def.id, 24), title: def.name }),
      tipText(def.role),
      tipLines([
        {
          icon: uiIcon('star', 14, level >= 2 ? color : undefined),
          label: `Мастерство ${level}`,
          value: next ? h('span', null, tipBar(xp - from, next - from, level >= 2 ? color : '#ffd166'), h('span', { class: 'tip-dim' }, ` ${xp}/${next}`)) : h('span', { class: 'tip-dim' }, 'максимум'),
        },
        { icon: 'crown', label: 'Забегов:', value: h('span', null, h('b', { class: 'tip-value' }, `${runs}`), h('span', { class: 'tip-label' }, ', побед: '), h('b', { class: 'tip-value' }, `${wins}`)) },
      ]),
    ];
  };
}

/** Плитка в сетке слева: аватарка во всю ширину, имя и метки. Клик — превью, двойной клик — сразу в забег. */
function heroTile(app: App, def: HeroDef): HTMLElement {
  const selected = app.heroPick === def.id;
  return h(
    'div',
    {
      class: `hero-tile ${selected ? 'selected' : ''}`,
      tip: tileTip(app, def),
      onclick: () => app.selectHero(def.id),
      ondblclick: () => app.newRun(def.id, parseSeed(app.seedText)),
    },
    heroAvatar(def.id, 112),
    h('div', { class: 'hero-tile-name' }, def.name),
    ...tileMarks(app, def),
  );
}

/** Статы героя со стартовым снаряжением, выбранным навыком и чертой — с ними он выйдет в забег. */
function startStats(app: App, def: HeroDef): DerivedStats {
  const gear = makeStartingGear(def, pickedStart(app.profile, def));
  return computeStats(def, gear.weapon, gear.armor, { innate: { id: pickedSignature(app.profile, def), tier: 1 }, trait: pickedTrait(app.profile, def) });
}

/** Шапка превью: спрайт, имя, роль одной-двумя строками. */
function header(def: HeroDef): HTMLElement {
  return h('div', { class: 'hs-header' }, heroSprite(def.id, 80), h('div', { class: 'hs-title' }, h('div', { class: 'hs-name' }, def.name), h('div', { class: 'hs-role' }, def.role)));
}

// ─── Вкладка «Герой» ───────────────────────────────────────────────────────

/** Статы плитками: иконка, крупное число, подпись. Как считается — в подсказке. */
function statTiles(s: DerivedStats): HTMLElement {
  const tile = (icon: UiIconId, value: string, label: string, tip: string) =>
    h('div', { class: 'hs-stat', tip: paramTip(icon, label.charAt(0).toUpperCase() + label.slice(1), tip, { aside: h('b', { class: 'tip-val' }, value) }) }, uiIcon(icon, 20), h('div', { class: 'hs-stat-body' }, h('b', null, value), h('small', null, label)));
  return h(
    'div',
    { class: 'hs-stats' },
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
 * Чипы одной ширины сеткой (просьба пользователя: без «лесенки»); что даёт владение и свойство типа — в подсказке к чипу.
 */
function proficiency(def: HeroDef): HTMLElement {
  const chip = (icon: UiIconId, name: string, ok: boolean, tip: TipFn) => h('span', { class: `prof-chip ${ok ? 'yes' : 'no'}`, tip }, uiIcon(ok ? icon : 'cross', 14), name);
  return h(
    'div',
    { class: 'hs-prof' },
    h('span', { class: 'hs-label' }, 'Оружие'),
    ...(['melee', 'ranged', 'magic'] as const).map((t) => chip(t, WEAPON_TYPE_NAMES[t], def.weaponSkill[t], weaponSkillTip(t, def.weaponSkill[t]))),
    h('span', { class: 'hs-label' }, 'Броня'),
    ...(['heavy', 'medium', 'light'] as const).map((t) => chip(t, ARMOR_TYPE_NAMES[t], def.armorSkill[t], armorSkillTip(t, def.armorSkill[t]))),
  );
}

// ─── Вкладка «Старт» ───────────────────────────────────────────────────────

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

/** Врождённый навык: пара персональных артефактов, второй открывается мастерством или победой героем. */
function skillOptions(app: App, def: HeroDef): Option[] {
  const chosen = pickedSignature(app.profile, def);
  return def.signatures.map((id) => {
    const a = artifactDef(id);
    return {
      key: id,
      glyph: h('span', { class: 'hs-glyph' }, a.glyph),
      title: a.name,
      params: useParams(a, 1).map(paramChip),
      text: a.describe(1),
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
    return {
      key: base,
      glyph: uiIcon(b.type ?? 'melee', 18),
      title: `${name} ${g.dmgMin}–${g.dmgMax}`,
      params: [],
      text: gearPerkText(g),
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
      class: `hs-option ${o.selected ? 'selected' : ''} ${o.open ? '' : 'locked'}`,
      tip: o.open
        ? o.selected
          ? paramTip('check', 'Выбрано', 'С этим герой начнёт забег')
          : paramTip(null, o.title, undefined, { action: 'Клик — выбрать' })
        : paramTip('lock', 'Закрыто', `Откроется: ${o.lockFull ?? o.lock.toLowerCase()}`),
      onclick: () => {
        if (o.open) o.pick();
      },
    },
    h(
      'div',
      { class: 'hs-option-head' },
      o.open ? o.glyph : uiIcon('lock', 16),
      h('span', { class: 'hs-option-title' }, o.title),
      o.selected ? h('span', { class: 'hs-option-mark' }, uiIcon('check', 14), 'выбрано') : null,
      !o.open ? h('span', { class: 'hs-option-lock' }, o.lock) : null,
    ),
    o.params.length && o.open ? h('div', { class: 'hs-option-params' }, ...o.params) : null,
    o.text ? h('div', { class: 'hs-option-text' }, ...markKeywords(o.text, { icons: true, numbers: true })) : null,
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
    { class: 'hs-choices' },
    ...GROUPS.map((g) =>
      h(
        'div',
        { class: `hs-choice-row g-${g.key}` },
        h('div', { class: 'hs-choice-label' }, h('div', null, uiIcon(g.icon, 16), ` ${g.name}`), h('small', null, g.hint)),
        ...groupOptions(app, def, g.key).map(optionCard),
      ),
    ),
  );
}

// ─── Вкладка «Мастерство» ──────────────────────────────────────────────────

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

/** Уровни столбцом с тем, что открывают, полоса опыта и откуда он берётся. */
function masteryTab(app: App, def: HeroDef): HTMLElement {
  const level = heroLevelOf(app.profile, def.id);
  const xp = heroXpOf(app.profile, def.id);
  const next = nextLevelXp(level);
  const from = MASTERY_LEVELS[level - 1];
  const pct = next ? Math.max(0, Math.min(1, (xp - from) / (next - from))) : 1;
  return h(
    'div',
    { class: 'hs-mastery' },
    h(
      'div',
      { class: 'hs-mastery-top' },
      h('span', { class: 'hs-mastery-level' }, uiIcon('star', 18), ` Мастерство ${level}`),
      h('div', { class: 'mastery-bar' }, h('div', { class: 'mastery-fill', style: `width:${Math.round(pct * 100)}%` })),
      h('span', { class: 'dim' }, next ? `${xp} / ${next} опыта` : 'максимум'),
    ),
    h('div', { class: 'hs-mastery-how' }, 'Опыт за забег: клетка +1, босс +10, победа +20. Открывает разнообразие, а не силу.'),
    h(
      'div',
      { class: 'hs-ladder' },
      ...rungs(def).map((r) =>
        h(
          'div',
          { class: `hs-ladder-row ${r.level <= level ? 'on' : ''} ${r.level === level + 1 ? 'next' : ''}` },
          h('span', { class: 'hs-ladder-lvl' }, `${r.level}`),
          uiIcon(r.level <= level ? r.icon : 'lock', 16),
          h('span', { class: 'hs-ladder-title' }, r.title),
          h('span', { class: `hs-ladder-what ${r.level > 1 ? '' : 'dim'}`.trim() }, r.what),
          h('span', { class: 'hs-ladder-need' }, r.level <= level ? 'открыто' : `${MASTERY_LEVELS[r.level - 1]} опыта`),
        ),
      ),
    ),
  );
}

// ─── Превью ────────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string; icon: UiIconId }[] = [
  { key: 'hero', label: 'Герой', icon: 'self' },
  { key: 'start', label: 'Старт', icon: 'crown' },
  { key: 'mastery', label: 'Мастерство', icon: 'star' },
];

function tabBar(app: App): HTMLElement {
  return h('div', { class: 'hs-tabs' }, ...TABS.map((t) => h('button', { class: `hs-tab ${t.key === app.heroTab ? 'active' : ''}`, onclick: () => app.setHeroTab(t.key) }, uiIcon(t.icon, 14), t.label)));
}

/**
 * Сложность забега — три кнопки в подвале рядом со стартом: выбор виден перед каждым забегом и запоминается в профиле
 * (общий для всех героев). Что даёт каждая — в подсказке.
 */
function difficultyPicker(app: App): HTMLElement {
  const cur = pickedDifficulty(app.profile);
  return h(
    'div',
    { class: 'hs-diff' },
    h('span', { class: 'hs-diff-label dim' }, 'Сложность'),
    ...DIFFICULTY_LIST.map((d) =>
      h(
        'button',
        {
          class: `hs-diff-btn ${d.id === cur ? 'active' : ''}`.trim(),
          style: `--diff:${d.color}`,
          tip: paramTip({ glyph: d.glyph }, d.name, d.desc, { color: d.color, note: d.id === cur ? 'Выбрано для следующего забега' : undefined, action: d.id === cur ? undefined : 'выбрать' }),
          onclick: () => app.selectDifficulty(d.id),
        },
        h('span', { class: 'hs-diff-glyph' }, d.glyph),
        d.name,
      ),
    ),
  );
}

/** Превью справа: шапка, вкладки, тело вкладки и кнопка старта в подвале. */
function heroPreview(app: App, def: HeroDef): HTMLElement {
  const body =
    app.heroTab === 'start'
      ? choiceRows(app, def)
      : app.heroTab === 'mastery'
        ? masteryTab(app, def)
        : // На первой вкладке только статы и владение (решение пользователя): стартовое снаряжение и выбранное живут на «Старте».
          h('div', { class: 'hs-hero-tab' }, statTiles(startStats(app, def)), proficiency(def));
  return h(
    'div',
    { class: 'hero-preview' },
    header(def),
    tabBar(app),
    h('div', { class: 'hs-body' }, body),
    h('div', { class: 'hs-foot' }, difficultyPicker(app), button(h('span', null, `В забег: ${def.name} `, '▶'), () => app.newRun(def.id, parseSeed(app.seedText)), { class: 'primary big hs-start' })),
  );
}

export function heroSelectScreen(app: App): HTMLElement {
  // Поле сида живёт в App: экран перерисовывается при каждом клике по плитке.
  const seedInput = h('input', {
    class: 'seed',
    placeholder: 'необязательно',
    type: 'text',
    spellcheck: 'false',
    value: app.seedText,
    oninput: (ev: Event) => {
      app.seedText = (ev.target as HTMLInputElement).value;
    },
  });
  const def = heroDef(app.heroPick);
  return h(
    'div',
    { class: 'screen hero-select' },
    h(
      'div',
      { class: 'topbar' },
      button('← Меню', () => app.showMenu(), { class: 'small' }),
      h('span', { class: 'title-sm' }, 'Выбор героя'),
      h('label', { class: 'seed-label' }, 'Сид: ', seedInput),
    ),
    h('div', { class: 'body' }, h('div', { class: 'hero-grid' }, ...HERO_LIST.map((d) => heroTile(app, d))), heroPreview(app, def)),
  );
}
