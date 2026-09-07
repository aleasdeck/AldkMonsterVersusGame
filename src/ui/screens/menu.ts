import { button, h } from '../dom';
import { heroDef } from '../../data/heroes';
import { FIGHTS_PER_RUN } from '../../data/locations';
import type { App } from '../app';

export function menuScreen(app: App): HTMLElement {
  const best = app.best;
  const hasSave = app.hasSave();
  const bestText = best.runs
    ? `Забегов: ${best.runs} · Побед: ${best.victories} · Лучший результат: ${best.furthest}/${FIGHTS_PER_RUN} боёв${
        best.furthestHero ? ` (${heroDef(best.furthestHero).name})` : ''
      }`
    : 'Ещё ни одного забега';
  return h(
    'div',
    { class: 'screen menu' },
    h('h1', { class: 'title' }, 'MONSTER VERSUS'),
    h('p', { class: 'subtitle' }, 'пиксельный рогалик · три локации · один герой · один шанс'),
    h(
      'div',
      { class: 'menu-buttons' },
      hasSave ? button('Продолжить забег', () => app.continueRun(), { class: 'primary big' }) : null,
      button('Новый забег', () => app.showHeroSelect(), { class: hasSave ? 'big' : 'primary big' }),
    ),
    h('div', { class: 'best' }, bestText),
    h(
      'div',
      { class: 'hint' },
      'Ударить и Защититься стоят стамину, артефакты — стамину или ману. ',
      'Над каждым врагом видно, что он сделает на следующем ходу.',
    ),
  );
}
