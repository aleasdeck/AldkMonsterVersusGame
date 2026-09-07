import { button, h } from '../dom';
import { HERO_LIST, heroDef } from '../../data/heroes';
import { makeStartingGear } from '../../data/gear';
import { computeStats } from '../../engine/stats';
import { hashString } from '../../engine/rng';
import { artifactCard, masteryLine, statsGrid } from '../components';
import { spriteImg } from '../sprites';
import type { HeroDef } from '../../engine/types';
import type { App } from '../app';

/** Число — как есть, любая другая строка — хэш; пусто — случайный сид. */
function parseSeed(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  return /^\d+$/.test(s) ? Number(s) >>> 0 : hashString(s);
}

/** Плитка в сетке слева: спрайт и имя. Клик — превью, двойной клик — сразу в забег. */
function heroTile(app: App, def: HeroDef): HTMLElement {
  const selected = app.heroPick === def.id;
  return h(
    'div',
    {
      class: `hero-tile ${selected ? 'selected' : ''}`,
      title: def.role,
      onclick: () => app.selectHero(def.id),
      ondblclick: () => app.newRun(def.id, parseSeed(app.seedText)),
    },
    spriteImg(def.sprite, def.id, 64),
    h('div', { class: 'hero-tile-name' }, def.name),
  );
}

/**
 * Превью справа: роль, владение, статы и стартовые артефакты. Всё умещается в кадр без прокрутки,
 * поэтому стартовое снаряжение — одной строкой, а не карточками.
 */
function heroPreview(app: App, def: HeroDef): HTMLElement {
  const gear = makeStartingGear(def);
  const s = computeStats(def, gear.weapon, gear.armor);
  return h(
    'div',
    { class: 'hero-preview' },
    h(
      'div',
      { class: 'preview-head' },
      spriteImg(def.sprite, def.id, 112, 'bob'),
      h(
        'div',
        { class: 'preview-title' },
        h('div', { class: 'preview-name' }, def.name),
        h('div', { class: 'preview-role' }, def.role),
        masteryLine(def),
        h('div', { class: 'preview-gear' }, `Старт: ${def.weapon.name} (${gear.weapon.dmgMin}–${gear.weapon.dmgMax}) · ${def.armor.name}`),
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
        h('h3', null, 'Стартовые артефакты'),
        h('div', { class: 'preview-arts' }, ...def.artifacts.map((id) => artifactCard({ id, tier: 1 }))),
      ),
    ),
    h('div', { class: 'row preview-foot' }, button(`Выбрать: ${def.name}`, () => app.newRun(def.id, parseSeed(app.seedText)), { class: 'primary big' })),
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
