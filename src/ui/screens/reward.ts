import { button, h } from '../dom';
import { artifactDef } from '../../data/artifacts';
import { heroDef } from '../../data/heroes';
import { findSameArtifact } from '../../engine/equipment';
import { REROLL_COST } from '../../engine/loot';
import { canReroll, currentLocation } from '../../engine/run';
import { artifactCard, coin, gearCard, pendingModal, pickable, potionCard, potionReplaceNote } from '../components';
import { backgroundStyle } from '../backgrounds';
import { runFrame } from '../frame';
import { hubGear } from '../console';
import type { ArtTier } from '../../engine/types';
import { artifactDiffLine, bindSwapPreview, gearDiffLines } from '../diff';
import type { App } from '../app';

export function rewardScreen(app: App): HTMLElement {
  const run = app.run!;
  const def = heroDef(run.hero.defId);
  const screen = run.rewards[0];
  const loc = currentLocation(run);
  const cards = (screen?.options ?? []).map((item, i) => {
    if (item.kind === 'artifact') {
      // Заметка только про слияние с уже стоящим артефактом; про свободные слоты не пишем — это видно по сокетам в консоли.
      const same = findSameArtifact(run.hero, item.artifact.id);
      let note: string | null = null;
      if (same?.art) {
        if (same.art.tier >= 3) note = 'Уже стоит на максимальном тире';
        else {
          const nextTier = Math.min(3, Math.max(same.art.tier + 1, item.artifact.tier)) as ArtTier;
          note = `Улучшит стоящий до тира ${nextTier}: ${artifactDef(item.artifact.id).describe(nextTier)}`;
        }
      }
      return pickable(
        artifactCard(item.artifact, h('div', null, note ? h('div', { class: 'note' }, note) : artifactDiffLine(run, item.artifact), button('Взять', () => app.takeReward(i), { class: 'primary' }))),
        () => app.takeReward(i),
      );
    }
    if (item.kind === 'potion') {
      return pickable(potionCard(item.potion, button('Взять', () => app.takeReward(i), { class: 'primary' }), potionReplaceNote(run)), () => app.takeReward(i));
    }
    return bindSwapPreview(app, pickable(gearCard(item.gear, { def, deltas: gearDiffLines(run, item.gear), footer: button('Надеть', () => app.takeReward(i), { class: 'primary' }) }), () => app.takeReward(i)), item.gear);
  });

  const rerollErr = canReroll(run);
  const center = h(
    'div',
    { class: 'main hub-main', style: backgroundStyle(loc.id, 0.78) },
    h('div', { class: 'title-row' }, h('h2', null, screen?.title ?? 'Награда'), h('p', { class: 'dim' }, screen?.source === 'potion' ? 'Слот зелья один: новое вытеснит старое.' : 'Можно взять только одно.')),
    h('div', { class: 'cards' }, ...cards),
    h(
      'div',
      { class: 'row' },
      button('Пропустить', () => app.skipReward()),
      button(h('span', null, `Перебросить за ${REROLL_COST} `, coin()), () => app.rerollReward(), {
        disabled: !!rerollErr,
        tip: rerollErr ?? 'Заменить все варианты на новые. Один раз на награду.',
      }),
    ),
  );
  return runFrame(app, { cls: 'reward', center, mid: hubGear(app), overlays: [pendingModal(app)] });
}
