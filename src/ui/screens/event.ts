import { button, h } from '../dom';
import { artifactDef } from '../../data/artifacts';
import { gearStatText } from '../../data/gear';
import { heroDef } from '../../data/heroes';
import { currentLocation } from '../../engine/run';
import { artifactChip, gearTypeIcon, pendingModal, perkLine, pickable, tierBadge } from '../components';
import { backgroundStyle } from '../backgrounds';
import { runFrame } from '../frame';
import { hubGear } from '../console';
import { markKeywords } from '../keywords';
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
      h('div', { class: 'note' }, ...markKeywords(def.describe(o.artifact.tier))),
    );
  }
  if (o.id === 'chest') {
    const def = heroDef(run.hero.defId);
    return h(
      'div',
      { class: 'event-loot' },
      h('div', { class: 'card-sub' }, tierBadge(o.gear.tier, gearTypeIcon(o.gear, def))),
      h('div', { class: 'card-desc' }, o.gear.name),
      h('div', { class: 'note' }, gearStatText(o.gear, def)),
      perkLine(o.gear, def),
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
  const center = h(
    'div',
    { class: 'main hub-main', style: backgroundStyle(loc.id, 0.78) },
    h('div', { class: 'title-row' }, h('h2', null, 'Три двери'), h('p', { class: 'dim' }, 'Открыть можно только одну.')),
    h('div', { class: 'cards' }, ...cards),
  );
  return runFrame(app, { cls: 'event', center, mid: hubGear(app), overlays: [pendingModal(app)] });
}
