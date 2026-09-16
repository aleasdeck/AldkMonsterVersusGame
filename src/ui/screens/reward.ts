import { button, h } from '../dom';
import { artifactDef } from '../../data/artifacts';
import { heroDef } from '../../data/heroes';
import { findSameArtifact, slotAccepts, socketRefs } from '../../engine/equipment';
import { REROLL_COST, focusGearKind } from '../../engine/loot';
import { awaitsFocus, canReroll, currentLocation } from '../../engine/run';
import { artifactCard, coin, gearCard, pendingModal, pickable, potionCard, potionReplaceNote } from '../components';
import { backgroundStyle } from '../backgrounds';
import { runFrame } from '../frame';
import { hubGear } from '../console';
import type { ArtTier, RewardFocus } from '../../engine/types';
import { gearDiffLines } from '../diff';
import type { App } from '../app';

/** Подписи пулов награды: имя, значок, что внутри. Клавиши 1 и 2 — по порядку карточек. */
export const FOCUS_INFO: Record<RewardFocus, { name: string; glyph: string; desc: string }> = {
  attack: { name: 'Нападение', glyph: '⚔', desc: 'Оружие и оружейные артефакты: урон, приёмы, крит.' },
  defense: { name: 'Защита', glyph: '⛨', desc: 'Броня и бронные артефакты: здоровье, блок, лечение, ресурсы.' },
};

/** Карточка пула: имя, описание и сколько сокетов под артефакты этого типа у героя свободно — подсказка к слепому выбору. */
function focusCard(app: App, focus: RewardFocus, key: number): HTMLElement {
  const run = app.run!;
  const info = FOCUS_INFO[focus];
  const kind = focusGearKind(focus);
  const sockets = socketRefs(run.hero).filter((s) => slotAccepts(s.slot, kind));
  const free = sockets.filter((s) => !s.art).length;
  const socketsLine = sockets.length === 0 ? 'Подходящих сокетов нет' : `Сокетов под такие артефакты: ${sockets.length}, свободных ${free}`;
  return pickable(
    h(
      'div',
      { class: `card focus-card ${focus}` },
      h('div', { class: 'card-head' }, h('span', { class: 'glyph big' }, info.glyph), h('span', { class: 'card-name' }, info.name), h('span', { class: 'card-sub key' }, `${key}`)),
      h('div', { class: 'card-desc' }, info.desc),
      h('div', { class: 'note' }, socketsLine),
      h('div', { class: 'card-foot' }, button('Выбрать', () => app.chooseRewardFocus(focus), { class: 'primary' })),
    ),
    () => app.chooseRewardFocus(focus),
  );
}

export function rewardScreen(app: App): HTMLElement {
  const run = app.run!;
  const def = heroDef(run.hero.defId);
  const screen = run.rewards[0];
  const loc = currentLocation(run);
  // Награда за бой: сначала слепой выбор пула, три карточки катятся уже из него.
  if (awaitsFocus(screen)) {
    const center = h(
      'div',
      { class: 'main hub-main', style: backgroundStyle(loc.id, 0.78) },
      h('div', { class: 'title-row' }, h('h2', null, screen?.title ?? 'Награда'), h('p', { class: 'dim' }, 'Выберите пул: три варианта выпадут из него.')),
      h('div', { class: 'cards focus-cards' }, focusCard(app, 'attack', 1), focusCard(app, 'defense', 2)),
      h('div', { class: 'row' }, button('Пропустить', () => app.skipReward())),
    );
    return runFrame(app, { cls: 'reward', center, mid: hubGear(app), overlays: [pendingModal(app)] });
  }
  const cards = (screen?.options ?? []).map((item, i) => {
    if (item.kind === 'artifact') {
      // Заметка только про слияние с уже стоящим артефактом; дельт у артефакта нет — они повторяли бы описание.
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
        artifactCard(item.artifact, button('Взять', () => app.takeReward(i), { class: 'primary' }), note ? h('div', { class: 'note' }, note) : null),
        () => app.takeReward(i),
      );
    }
    if (item.kind === 'potion') {
      return pickable(potionCard(item.potion, button('Взять', () => app.takeReward(i), { class: 'primary' }), potionReplaceNote(run)), () => app.takeReward(i));
    }
    return pickable(gearCard(item.gear, { def, deltas: gearDiffLines(run, item.gear), footer: button('Надеть', () => app.takeReward(i), { class: 'primary' }) }), () => app.takeReward(i));
  });

  const rerollErr = canReroll(run);
  const center = h(
    'div',
    { class: 'main hub-main', style: backgroundStyle(loc.id, 0.78) },
    h(
      'div',
      { class: 'title-row' },
      h('h2', null, screen?.title ?? 'Награда'),
      screen?.focus ? h('span', { class: `focus-chip ${screen.focus}`, tip: FOCUS_INFO[screen.focus].desc }, `${FOCUS_INFO[screen.focus].glyph} ${FOCUS_INFO[screen.focus].name}`) : null,
      h('p', { class: 'dim' }, screen?.note ?? (screen?.source === 'potion' ? 'Слот зелья один: новое вытеснит старое.' : 'Можно взять только одно.')),
    ),
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
