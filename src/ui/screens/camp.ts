import { button, h } from '../dom';
import { artifactDef } from '../../data/artifacts';
import { upgradableSockets } from '../../engine/equipment';
import { currentLocation, heroStats, runLocation } from '../../engine/run';
import { artifactChip, pickable } from '../components';
import { backgroundStyle } from '../backgrounds';
import { runFrame } from '../frame';
import { hubGear } from '../console';
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

  // Список без описаний: строка на артефакт, что даст апгрейд — в подсказке при наведении.
  const forgeCard = h(
    'div',
    { class: 'card camp-card forge-card' },
    h('div', { class: 'card-head' }, h('span', { class: 'glyph' }, '⚒'), h('span', { class: 'card-name' }, 'Кузница')),
    h('div', { class: 'card-desc' }, 'Повысить тир одного артефакта на 1 (максимум 3). Наведи, чтобы увидеть, что изменится.'),
    upg.length === 0
      ? h('div', { class: 'note' }, 'Все артефакты уже на максимуме.')
      : h(
          'div',
          { class: 'forge-list' },
          ...upg.map((s) => {
            const art = s.art!;
            const def = artifactDef(art.id);
            const nextTier = (art.tier + 1) as ArtTier;
            const tip = `Сейчас: ${def.describe(art.tier)}\nСтанет: ${def.describe(nextTier)}`;
            const tipTitle = `${def.name}, тир ${art.tier} → ${nextTier}`;
            return h(
              'div',
              { class: 'forge-row', tip, tipTitle },
              artifactChip(s.art),
              h('span', { class: 'forge-name' }, def.name),
              h('span', { class: 'forge-tier' }, `${art.tier} → ${nextTier}`),
              button('Улучшить', () => app.campForge(s.kind, s.index), { class: 'small' }),
            );
          }),
        ),
  );

  const center = h(
    'div',
    { class: 'main hub-main', style: backgroundStyle(loc.id, 0.78) },
    h('div', { class: 'title-row' }, h('h2', null, 'Привал'), h('p', { class: 'dim' }, `${loc.name} позади. Впереди — ${next?.name ?? '???'}. Выберите одно.`)),
    h('div', { class: 'cards' }, restCard, forgeCard),
  );
  return runFrame(app, { cls: 'camp', center, mid: hubGear(app) });
}
