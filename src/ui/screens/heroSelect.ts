import { button, h } from '../dom';
import { HERO_LIST } from '../../data/heroes';
import { makeStartingGear } from '../../data/gear';
import { computeStats } from '../../engine/stats';
import { hashString } from '../../engine/rng';
import { artifactChip, statsGrid } from '../components';
import { spriteImg } from '../sprites';
import type { App } from '../app';

export function heroSelectScreen(app: App): HTMLElement {
  const seedInput = h('input', { class: 'seed', placeholder: 'необязательно', type: 'text', spellcheck: 'false' }) as HTMLInputElement;

  function start(id: string): void {
    const raw = seedInput.value.trim();
    let seed: number | undefined;
    if (raw) seed = /^\d+$/.test(raw) ? Number(raw) >>> 0 : hashString(raw);
    app.newRun(id, seed);
  }

  const cards = HERO_LIST.map((def) => {
    const gear = makeStartingGear(def);
    const s = computeStats(def, gear.weapon, gear.armor);
    return h(
      'div',
      { class: 'card hero-card' },
      h('div', { class: 'hero-card-top' }, spriteImg(def.sprite, def.id, 64), h('div', { class: 'card-name' }, def.name)),
      h('div', { class: 'card-desc' }, def.role),
      h('div', { class: 'stat hp-line' }, h('span', { class: 'stat-k' }, 'HP'), h('span', { class: 'stat-v' }, `${s.maxHp}`)),
      statsGrid(s),
      h('div', { class: 'card-sub' }, `${def.weapon.name} · ${def.armor.name}`),
      h('div', { class: 'slots' }, ...def.artifacts.map((id) => artifactChip({ id, tier: 1 }))),
      button('Выбрать', () => start(def.id), { class: 'primary' }),
    );
  });

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
    h('div', { class: 'hero-cards' }, ...cards),
  );
}
