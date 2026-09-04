import { button, h } from '../dom';
import { currentLocation } from '../../engine/run';
import { artifactChip, heroPanel, pendingModal, tierBadge } from '../components';
import { backgroundStyle } from '../backgrounds';
import type { App } from '../app';

const ICONS: Record<string, string> = { spring: '≈', altar: '✝', chest: '▣' };

export function eventScreen(app: App): HTMLElement {
  const run = app.run!;
  const loc = currentLocation(run);
  const opts = run.event?.options ?? [];
  const cards = opts.map((o) =>
    h(
      'div',
      { class: `card event-card event-${o.id}` },
      h('div', { class: 'glyph big' }, ICONS[o.id] ?? '?'),
      h('div', { class: 'card-name' }, o.title),
      h('div', { class: 'card-desc' }, o.desc),
      o.id === 'altar' ? h('div', { class: 'slots' }, artifactChip(o.artifact)) : null,
      o.id === 'chest' ? h('div', { class: 'card-sub' }, tierBadge(o.gear.tier)) : null,
      button('Открыть', () => app.chooseEvent(o.id), { class: 'primary', disabled: !!run.pending }),
    ),
  );
  return h(
    'div',
    { class: 'screen event' },
    h('div', { class: 'topbar' }, h('span', null, `${loc.name} · комната ${run.roomIndex + 1}/5 · Событие`), h('span', { class: 'dim' }, `сид ${run.seed}`)),
    h(
      'div',
      { class: 'body' },
      heroPanel(run),
      h('div', { class: 'main', style: backgroundStyle(loc.id, 0.78) }, h('h2', null, 'Три двери'), h('p', { class: 'dim' }, 'Открыть можно только одну.'), h('div', { class: 'cards' }, ...cards)),
    ),
    pendingModal(app),
  );
}
