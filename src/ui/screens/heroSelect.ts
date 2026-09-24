import { button, h } from '../dom';
import { HERO_LIST, heroDef } from '../../data/heroes';
import { makeStartingGear } from '../../data/gear';
import { computeStats } from '../../engine/stats';
import { hashString } from '../../engine/rng';
import { artifactCard, skillLine, statsGrid } from '../components';
import { traitDef } from '../../data/traits';
import { heroAvatar, heroSprite } from '../heroSprite';
import { heroLevelOf, heroXpOf, pickedSignature, pickedStart, pickedTrait, signatureUnlocked, startUnlocked, traitUnlocked } from '../save';
import { HERO_MASTERY, MASTERY_LEVELS, UNLOCK_LEVEL, nextLevelXp, nextUnlockText } from '../../data/mastery';
import { baseOf } from '../../data/gear';
import type { HeroDef } from '../../engine/types';
import type { App } from '../app';
import { heroPreviewVariant } from './heroSelectVariants';

/** Число — как есть, любая другая строка — хэш; пусто — случайный сид. */
function parseSeed(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  return /^\d+$/.test(s) ? Number(s) >>> 0 : hashString(s);
}

/** Плитка в сетке слева: аватарка во всю ширину и имя. Клик — превью, двойной клик — сразу в забег. */
function heroTile(app: App, def: HeroDef): HTMLElement {
  const selected = app.heroPick === def.id;
  return h(
    'div',
    {
      class: `hero-tile ${selected ? 'selected' : ''}`,
      tip: def.role,
      onclick: () => app.selectHero(def.id),
      ondblclick: () => app.newRun(def.id, parseSeed(app.seedText)),
    },
    heroAvatar(def.id, 112),
    h('div', { class: 'hero-tile-name' }, def.name),
  );
}

/**
 * Карточка персонального артефакта из пары (v0.33): выбранный — с рамкой и меткой, закрытый — затемнён с подписью,
 * как открыть. Клик по открытому делает его стартовым (выбор живёт в профиле), по закрытому — ничего.
 */
function signatureCard(app: App, def: HeroDef, id: string, chosen: string): HTMLElement {
  const open = signatureUnlocked(app.profile, def, id);
  const selected = id === chosen;
  const note = h(
    'div',
    { class: 'sig-note' },
    !open ? `Откроется: мастерство ${UNLOCK_LEVEL.signature} или победа` : selected ? '✓ в забег с этим' : 'нажмите, чтобы выбрать',
  );
  // Врождённый навык (v0.44): уровень растёт с локацией, сокет не занимает.

  const card = artifactCard({ id, tier: 1 }, undefined, note);
  card.classList.add('sig-card');
  if (selected) card.classList.add('selected');
  if (!open) card.classList.add('locked');
  card.setAttribute(
    'tip',
    open
      ? selected
        ? 'С этим навыком герой начнёт забег: он не занимает сокет, уровень растёт с каждой локацией (1 → 2 → 3)'
        : 'Нажмите, чтобы начать забег с этим навыком'
      : `Второй врождённый навык: откроется на мастерстве ${UNLOCK_LEVEL.signature} или когда ${def.name} пройдёт все три акта`,
  );
  card.addEventListener('click', () => app.selectSignature(def.id, id));
  return card;
}

/** Выбор из двух-трёх вариантов чипами: выбранный подсвечен, закрытый затемнён с подписью, как открыть (черта, стартовое оружие). */
function pickChips(label: string, items: { id: string; text: string; tip: string; open: boolean; selected: boolean; onclick: () => void }[]): HTMLElement {
  return h(
    'div',
    { class: 'pick-row' },
    h('span', { class: 'dim' }, label),
    ...items.map((it) =>
      h(
        'button',
        {
          class: `pick-chip ${it.selected ? 'selected' : ''} ${it.open ? '' : 'off'}`,
          tip: it.tip,
          onclick: () => {
            if (it.open) it.onclick();
          },
        },
        it.open ? it.text : `🔒 ${it.text}`,
      ),
    ),
  );
}

/** Мастерство героя (v0.45): уровень, полоса опыта и что откроет следующий уровень. */
function masteryLine(app: App, def: HeroDef): HTMLElement {
  const level = heroLevelOf(app.profile, def.id);
  const xp = heroXpOf(app.profile, def.id);
  const next = nextLevelXp(level);
  const from = MASTERY_LEVELS[level - 1];
  const pct = next ? Math.max(0, Math.min(1, (xp - from) / (next - from))) : 1;
  const unlock = nextUnlockText(def.id, level);
  return h(
    'div',
    { class: 'mastery-line', tip: 'Мастерство растёт с каждым забегом героя: клетки, боссы и победа. Открывает разнообразие, а не силу' },
    h('div', { class: 'mastery-head' }, `Мастерство ${level}`, h('span', { class: 'dim' }, next ? ` · ${xp}/${next}` : ' · максимум')),
    h('div', { class: 'mastery-bar' }, h('div', { class: 'mastery-fill', style: `width:${Math.round(pct * 100)}%` })),
    unlock ? h('div', { class: 'mastery-next dim' }, `Дальше: ${unlock}`) : null,
  );
}

/**
 * Превью справа: роль, владение оружием и бронёй, статы и пара персональных артефактов. Всё умещается в кадр без прокрутки,
 * поэтому стартовое снаряжение — одной строкой, а не карточками.
 */
function heroPreview(app: App, def: HeroDef): HTMLElement {
  const chosen = pickedSignature(app.profile, def);
  const start = pickedStart(app.profile, def);
  const gear = makeStartingGear(def, start);
  const trait = traitDef(pickedTrait(app.profile, def));
  const s = computeStats(def, gear.weapon, gear.armor, { innate: { id: chosen, tier: 1 }, trait: trait.id });
  return h(
    'div',
    { class: 'hero-preview' },
    h(
      'div',
      { class: 'preview-head' },
      heroSprite(def.id, 112),
      h(
        'div',
        { class: 'preview-title' },
        h('div', { class: 'preview-name' }, def.name),
        h('div', { class: 'preview-role' }, def.role),
        skillLine(def),
        h('div', { class: 'preview-trait', tip: 'Черта героя: своя механика, работает всегда' }, h('span', { class: 'trait-name' }, `${trait.name}: `), trait.describe(1)),
        pickChips(
          'Черта:',
          def.traits.map((id) => {
            const t = traitDef(id);
            const open = traitUnlocked(app.profile, def, id);
            return { id, text: t.name, tip: `${t.name}: ${t.describe(1)}${open ? '' : `\nОткроется на мастерстве ${UNLOCK_LEVEL.trait}`}`, open, selected: id === trait.id, onclick: () => app.selectTrait(def.id, id) };
          }),
        ),
        pickChips(
          'Старт:',
          [def.weapon.base, HERO_MASTERY[def.id].start].map((base) => {
            const b = baseOf('weapon', base);
            const g = makeStartingGear(def, base).weapon;
            const open = startUnlocked(app.profile, def, base);
            const name = b.name.charAt(0).toUpperCase() + b.name.slice(1);
            return { id: base, text: `${name} ${g.dmgMin}–${g.dmgMax}`, tip: `${name}: урон ${g.dmgMin}–${g.dmgMax}, тир 1${open ? '' : `\nОткроется на мастерстве ${UNLOCK_LEVEL.start}`}`, open, selected: base === start, onclick: () => app.selectStart(def.id, base) };
          }),
        ),
      ),
    ),
    h(
      'div',
      { class: 'preview-body' },
      h(
        'div',
        { class: 'preview-col' },
        h('h3', null, 'Характеристики'),
        h('div', { class: 'stat hp-line' }, h('span', { class: 'stat-k' }, 'HP'), h('span', { class: 'stat-v' }, `${s.maxHp}`)),
        statsGrid(s),
      ),
      h(
        'div',
        { class: 'preview-col' },
        h('h3', null, 'Врождённый навык: один из двух'),
        h('div', { class: 'preview-arts' }, ...def.signatures.map((id) => signatureCard(app, def, id, chosen))),
      ),
    ),
    h('div', { class: 'row preview-foot' }, button(`Выбрать: ${def.name}`, () => app.newRun(def.id, parseSeed(app.seedText)), { class: 'primary big' }), masteryLine(app, def)),
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
    h('div', { class: 'body' }, h('div', { class: 'hero-grid' }, ...HERO_LIST.map((d) => heroTile(app, d))), heroPreviewVariant(app, def, parseSeed) ?? heroPreview(app, def)),
  );
}
