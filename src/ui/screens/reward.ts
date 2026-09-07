import { ROOMS_PER_LOCATION } from '../../data/locations';
import { button, h } from '../dom';
import { artifactDef } from '../../data/artifacts';
import { heroDef } from '../../data/heroes';
import { findSameArtifact, gearOf, socketRefs } from '../../engine/equipment';
import { REROLL_COST } from '../../engine/loot';
import { canReroll, currentLocation } from '../../engine/run';
import { artifactCard, gearCard, heroPanel, pendingModal, pickable } from '../components';
import { backgroundStyle } from '../backgrounds';
import type { ArtTier } from '../../engine/types';
import type { App } from '../app';

export function rewardScreen(app: App): HTMLElement {
  const run = app.run!;
  const def = heroDef(run.hero.defId);
  const screen = run.rewards[0];
  const loc = currentLocation(run);
  const cards = (screen?.options ?? []).map((item, i) => {
    if (item.kind === 'artifact') {
      const same = findSameArtifact(run.hero, item.artifact.id);
      const free = socketRefs(run.hero).some((s) => !s.art);
      let note: string;
      if (same?.art) {
        if (same.art.tier >= 3) note = 'Уже стоит на максимальном тире';
        else {
          const nextTier = Math.min(3, Math.max(same.art.tier + 1, item.artifact.tier)) as ArtTier;
          note = `Улучшит стоящий до тира ${nextTier}: ${artifactDef(item.artifact.id).describe(nextTier)}`;
        }
      } else note = free ? 'Встанет в свободный слот' : 'Свободных слотов нет — придётся заменить';
      return pickable(
        artifactCard(item.artifact, h('div', null, h('div', { class: 'note' }, note), button('Взять', () => app.takeReward(i), { class: 'primary' }))),
        () => app.takeReward(i),
      );
    }
    const cur = gearOf(run.hero, item.gear.kind);
    return pickable(
      gearCard(item.gear, { def, current: cur, footer: button('Надеть', () => app.takeReward(i), { class: 'primary' }) }),
      () => app.takeReward(i),
    );
  });

  const rerollErr = canReroll(run);
  return h(
    'div',
    { class: 'screen reward' },
    h('div', { class: 'topbar' }, h('span', null, `${loc.name} · комната ${run.roomIndex + 1}/${ROOMS_PER_LOCATION}`), h('span', { class: 'dim' }, `сид ${run.seed}`)),
    h(
      'div',
      { class: 'body' },
      heroPanel(run),
      h(
        'div',
        { class: 'main', style: backgroundStyle(loc.id, 0.78) },
        h('div', { class: 'title-row' }, h('h2', null, screen?.title ?? 'Награда'), h('p', { class: 'dim' }, 'Можно взять только одно.')),
        h('div', { class: 'cards' }, ...cards),
        h(
          'div',
          { class: 'row' },
          button('Пропустить', () => app.skipReward()),
          button(`Перебросить за ${REROLL_COST} ◉`, () => app.rerollReward(), {
            disabled: !!rerollErr,
            title: rerollErr ?? 'Заменить все варианты на новые. Один раз на награду.',
          }),
        ),
      ),
    ),
    pendingModal(app),
  );
}
