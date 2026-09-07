import { button, h } from '../dom';
import { artifactDef } from '../../data/artifacts';
import { upgradableSockets } from '../../engine/equipment';
import { currentLocation, heroStats, runLocation } from '../../engine/run';
import { artifactChip, heroPanel, pickable } from '../components';
import { backgroundStyle } from '../backgrounds';
import type { ArtTier } from '../../engine/types';
import type { App } from '../app';

export function campScreen(app: App): HTMLElement {
  const run = app.run!;
  const loc = currentLocation(run);
  const next = runLocation(run, run.locationIndex + 1);
  const max = heroStats(run).maxHp;
  const heal = Math.min(Math.floor(max * 0.5), max - run.hero.hp);
  const upg = upgradableSockets(run.hero);

  const restCard = pickable(
    h(
    'div',
    { class: 'card camp-card' },
    h('div', { class: 'glyph big' }, '♨'),
    h('div', { class: 'card-name' }, 'Отдых'),
    h('div', { class: 'card-desc' }, `Восстановить половину максимума HP: +${heal} (сейчас ${run.hero.hp}/${max}).`),
    button('Отдохнуть', () => app.campRest(), { class: 'primary' }),
    ),
    () => app.campRest(),
  );

  const forgeCard = h(
    'div',
    { class: 'card camp-card' },
    h('div', { class: 'glyph big' }, '⚒'),
    h('div', { class: 'card-name' }, 'Кузница'),
    h('div', { class: 'card-desc' }, 'Повысить тир одного артефакта на 1 (максимум 3).'),
    upg.length === 0
      ? h('div', { class: 'note' }, 'Все артефакты уже на максимуме.')
      : h(
          'div',
          { class: 'socket-list' },
          ...upg.map((s) => {
            const art = s.art!;
            const def = artifactDef(art.id);
            const nextTier = (art.tier + 1) as ArtTier;
            return h(
              'div',
              { class: 'socket-row' },
              artifactChip(s.art),
              h(
                'div',
                { class: 'socket-name' },
                h('div', null, `${def.name} · тир ${art.tier} → ${nextTier}`),
                h('div', { class: 'upgrade-line' }, h('span', { class: 'dim' }, def.describe(art.tier)), ' → ', h('span', { class: 'good' }, def.describe(nextTier))),
              ),
              button('Улучшить', () => app.campForge(s.kind, s.index)),
            );
          }),
        ),
  );

  return h(
    'div',
    { class: 'screen camp' },
    h('div', { class: 'topbar' }, h('span', null, `Привал · ${loc.name} позади`), h('span', { class: 'dim' }, `сид ${run.seed}`)),
    h(
      'div',
      { class: 'body' },
      heroPanel(run),
      h(
        'div',
        { class: 'main', style: backgroundStyle(loc.id, 0.78) },
        h('h2', null, 'Привал'),
        h('p', { class: 'dim' }, `Впереди — ${next?.name ?? '???'}. Выберите одно.`),
        h('div', { class: 'cards' }, restCard, forgeCard),
      ),
    ),
  );
}
