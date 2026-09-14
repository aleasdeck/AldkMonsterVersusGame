import { button, h } from '../dom';
import { HEROES, heroDef } from '../../data/heroes';
import { FIGHTS_PER_RUN } from '../../data/locations';
import { COLLECTIBLES, foundState } from '../../data/collection';
import { ENEMY_LIST } from '../../data/enemies';
import { GAME_VERSION } from '../../engine/types';
import type { Profile } from '../save';
import type { App } from '../app';

function favouriteHero(p: Profile): string {
  let best = '';
  let count = 0;
  for (const [id, n] of Object.entries(p.heroRuns)) {
    if (n > count && HEROES[id]) {
      best = id;
      count = n;
    }
  }
  return best ? `${heroDef(best).name} (${count})` : '—';
}

/** Открытых записей каталога: артефакт считается открытым с любого найденного тира. */
function collectionFound(p: Profile): number {
  const have = new Set(p.collection);
  return COLLECTIBLES.filter((c) => foundState(have, c).open).length;
}

function statsPanel(p: Profile): HTMLElement {
  const row = (k: string, v: string) => h('div', { class: 'stat' }, h('span', { class: 'stat-k' }, k), h('span', { class: 'stat-v' }, v));
  const winRate = p.runs ? ` (${Math.round((p.victories / p.runs) * 100)} %)` : '';
  const furthest = p.furthest ? `${p.furthest}/${FIGHTS_PER_RUN} боёв${HEROES[p.furthestHero] ? ` · ${heroDef(p.furthestHero).name}` : ''}` : '—';
  return h(
    'div',
    { class: 'menu-stats' },
    h('div', { class: 'stats-grid' }, row('Забегов', `${p.runs}`), row('Побед', `${p.victories}${winRate}`)),
    h(
      'div',
      { class: 'stats-grid' },
      row('Лучший забег', furthest),
      row('Любимый герой', favouriteHero(p)),
      row('Врагов убито', `${p.kills}`),
      row('Ходов сделано', `${p.turns}`),
      row('Урона нанесено', `${p.damageDealt}`),
      row('Урона получено', `${p.damageTaken}`),
      row('Коллекция', `${collectionFound(p)}/${COLLECTIBLES.length}`),
      row('Бестиарий', `${p.bestiary.length}/${ENEMY_LIST.length}`),
    ),
  );
}

export function menuScreen(app: App): HTMLElement {
  const p = app.profile;
  const hasSave = app.hasSave();
  return h(
    'div',
    { class: 'screen menu' },
    h('h1', { class: 'title' }, 'MONSTER VERSUS'),
    h('p', { class: 'subtitle' }, 'пиксельный рогалик · три локации · один герой · один шанс'),
    h(
      'div',
      { class: 'menu-body' },
      h(
        'div',
        { class: 'menu-buttons' },
        hasSave ? button('Продолжить забег', () => app.continueRun(), { class: 'primary big' }) : null,
        button('Новый забег', () => app.showHeroSelect(), { class: hasSave ? 'big' : 'primary big' }),
        button('Коллекция', () => app.showCollection(), { class: 'big' }),
        button('Бестиарий', () => app.showBestiary(), { class: 'big' }),
      ),
      p.runs ? statsPanel(p) : h('div', { class: 'menu-stats empty dim' }, 'Ещё ни одного забега.\nВсё, что достанется герою в забеге, открывается в коллекции.'),
    ),
    h(
      'div',
      { class: 'hint' },
      'Ударить и Защититься стоят стамину, артефакты — стамину или ману. ',
      'Над каждым врагом видно, что он сделает на следующем ходу.',
    ),
    h('div', { class: 'version' }, `v${GAME_VERSION}`),
  );
}
