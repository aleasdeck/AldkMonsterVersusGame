import { ROOMS_PER_LOCATION } from '../../data/locations';
import { button, h } from '../dom';
import { artifactDef } from '../../data/artifacts';
import { gearStatText, weaponPerkText } from '../../data/gear';
import { heroDef } from '../../data/heroes';
import { currentLocation } from '../../engine/run';
import { artifactChip, heroPanel, pendingModal, pickable, tierBadge, weaponTypeIcon } from '../components';
import { backgroundStyle } from '../backgrounds';
import type { EventOption } from '../../engine/types';
import type { App } from '../app';

const ICONS: Record<string, string> = { spring: '≈', altar: '✝', chest: '▣' };

/** Что именно лежит за дверью: у алтаря — артефакт, у сундука — предмет со статами. */
function contents(app: App, o: EventOption): HTMLElement | null {
  const run = app.run!;
  if (o.id === 'altar') {
    const def = artifactDef(o.artifact.id);
    return h(
      'div',
      { class: 'event-loot' },
      h('div', { class: 'slots' }, artifactChip(o.artifact)),
      h('div', { class: 'card-sub' }, def.name),
      h('div', { class: 'note' }, def.describe(o.artifact.tier)),
    );
  }
  if (o.id === 'chest') {
    const def = heroDef(run.hero.defId);
    return h(
      'div',
      { class: 'event-loot' },
      h('div', { class: 'card-sub' }, tierBadge(o.gear.tier, o.gear.kind === 'weapon' ? weaponTypeIcon(o.gear, def) : null)),
      h('div', { class: 'card-desc' }, o.gear.name),
      h('div', { class: 'note' }, gearStatText(o.gear, def)),
      o.gear.kind === 'weapon' ? h('div', { class: 'card-perk' }, weaponPerkText(o.gear)) : null,
      h('div', { class: 'slots' }, ...o.gear.slots.map(() => artifactChip(null))),
    );
  }
  return null;
}

export function eventScreen(app: App): HTMLElement {
  const run = app.run!;
  const loc = currentLocation(run);
  const opts = run.event?.options ?? [];
  const cards = opts.map((o) =>
    pickable(
      h(
        'div',
        { class: `card event-card event-${o.id}` },
        h('div', { class: 'glyph big' }, ICONS[o.id] ?? '?'),
        h('div', { class: 'card-name' }, o.title),
        h('div', { class: 'card-desc' }, o.desc),
        contents(app, o),
        h('div', { class: 'card-foot' }, button('Открыть', () => app.chooseEvent(o.id), { class: 'primary', disabled: !!run.pending })),
      ),
      run.pending ? undefined : () => app.chooseEvent(o.id),
    ),
  );
  return h(
    'div',
    { class: 'screen event' },
    h('div', { class: 'topbar' }, h('span', null, `${loc.name} · комната ${run.roomIndex + 1}/${ROOMS_PER_LOCATION} · Событие`), h('span', { class: 'dim' }, `сид ${run.seed}`)),
    h(
      'div',
      { class: 'body' },
      heroPanel(run),
      h(
        'div',
        { class: 'main', style: backgroundStyle(loc.id, 0.78) },
        h('div', { class: 'title-row' }, h('h2', null, 'Три двери'), h('p', { class: 'dim' }, 'Открыть можно только одну.')),
        h('div', { class: 'cards' }, ...cards),
      ),
    ),
    pendingModal(app),
  );
}
