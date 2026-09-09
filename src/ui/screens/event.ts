import { button, h } from '../dom';
import { artifactDef } from '../../data/artifacts';
import { GEAR_TIERS, upgradePreview } from '../../data/gear';
import { heroDef } from '../../data/heroes';
import { forgePrice } from '../../engine/loot';
import { altarHealAmount, altarSacrificeCost, canAltarSacrifice, canForge, currentLocation, heroStats } from '../../engine/run';
import { artifactChip, coin, gearCard, pendingModal, pickable, tierTip } from '../components';
import { backgroundStyle } from '../backgrounds';
import { runFrame } from '../frame';
import { hubGear } from '../console';
import { gearDiffLines } from '../diff';
import { markKeywords } from '../keywords';
import type { EventState, GearKind, GearTier } from '../../engine/types';
import type { App } from '../app';

/** Заголовок и подпись экрана по виду события. */
const HEADS: Record<'chest' | 'altar' | 'forge', [string, string]> = {
  chest: ['Сундук', 'Наденется сразу, старый предмет пропадёт. Можно не открывать.'],
  altar: ['Алтарь', 'Помолиться о здоровье или отдать кровь за артефакт. Одно из двух.'],
  forge: ['Кузнец', 'Тир оружия или брони +1 за золото; аффикс, сокеты и артефакты остаются. Один предмет.'],
};

/** Сундук: одна карточка предмета с дельтами к надетому, «Надеть» или «Оставить». */
function chestCards(app: App, ev: EventState & { kind: 'chest' }): HTMLElement[] {
  const run = app.run!;
  const def = heroDef(run.hero.defId);
  return [
    pickable(
      gearCard(ev.gear, { def, deltas: gearDiffLines(run, ev.gear), footer: button('Надеть', () => app.takeChest(), { class: 'primary', disabled: !!run.pending }) }),
      run.pending ? undefined : () => app.takeChest(),
    ),
  ];
}

/** Алтарь: молитва лечит, жертва режет HP и даёт артефакт (виден до выбора). */
function altarCards(app: App, ev: EventState & { kind: 'altar' }): HTMLElement[] {
  const run = app.run!;
  const max = heroStats(run).maxHp;
  const heal = altarHealAmount(run);
  const prayErr = run.pending ? 'Сначала разместите артефакт' : heal <= 0 ? 'HP и так полное' : null;
  const prayCard = h(
    'div',
    { class: 'card event-card' },
    h('div', { class: 'glyph big' }, '✝'),
    h('div', { class: 'card-name' }, 'Молитва'),
    h('div', { class: 'card-desc' }, `Восстановить 30 % максимума HP: +${heal} (сейчас ${run.hero.hp}/${max}).`),
    h('div', { class: 'card-foot' }, button('Помолиться', () => app.altarPray(), { class: 'primary', disabled: !!prayErr, tip: prayErr ?? undefined })),
  );
  const pray = prayErr ? prayCard : pickable(prayCard, () => app.altarPray());
  const err = canAltarSacrifice(run);
  const cost = altarSacrificeCost(run);
  let loot: HTMLElement;
  if (ev.artifact) {
    const def = artifactDef(ev.artifact.id);
    loot = h(
      'div',
      { class: 'event-loot' },
      h('div', { class: 'slots' }, artifactChip(ev.artifact)),
      h('div', { class: 'card-sub' }, def.name),
      h('div', { class: 'note' }, ...markKeywords(def.describe(ev.artifact.tier))),
    );
  } else loot = h('div', { class: 'note' }, 'Алтарю нечего предложить: все артефакты уже на максимуме.');
  const sacrifice = h(
    'div',
    { class: 'card event-card' },
    h('div', { class: 'glyph big' }, '⚱'),
    h('div', { class: 'card-name' }, 'Жертва'),
    h('div', { class: 'card-desc' }, `Отдать ${cost} HP (сейчас ${run.hero.hp}/${max}) и забрать артефакт.`),
    loot,
    h('div', { class: 'card-foot' }, button('Принести жертву', () => app.altarSacrifice(), { class: 'primary', disabled: !!err, tip: err ?? undefined })),
  );
  return [pray, err ? sacrifice : pickable(sacrifice, () => app.altarSacrifice())];
}

/** Кузнец: карточка на оружие и на броню — что станет с предметом и цена. */
function forgeCards(app: App): HTMLElement[] {
  const run = app.run!;
  return (['weapon', 'armor'] as GearKind[]).map((kind) => {
    const gear = kind === 'weapon' ? run.hero.weapon : run.hero.armor;
    const err = canForge(run, kind);
    const maxed = gear.tier >= 5;
    const next = Math.min(5, gear.tier + 1) as GearTier;
    const tierEl = (t: GearTier) => h('span', { style: `color:${GEAR_TIERS[t].color}`, tip: tierTip(t) }, GEAR_TIERS[t].name);
    return h(
      'div',
      { class: 'card event-card', style: `border-color:${GEAR_TIERS[gear.tier].color}` },
      h('div', { class: 'glyph big' }, kind === 'weapon' ? '⚔' : '⛨'),
      h('div', { class: 'card-name' }, gear.name),
      h('div', { class: 'card-sub' }, tierEl(gear.tier), maxed ? null : ' → ', maxed ? null : tierEl(next)),
      h('div', { class: 'note' }, maxed ? 'Предел: выше легендарного не куют.' : upgradePreview(gear)),
      h(
        'div',
        { class: 'card-foot' },
        button(h('span', null, `Улучшить ${forgePrice(gear)} `, coin()), () => app.forgeUpgrade(kind), { class: 'primary', disabled: !!err, tip: err ?? undefined }),
      ),
    );
  });
}

export function eventScreen(app: App): HTMLElement {
  const run = app.run!;
  const loc = currentLocation(run);
  const ev = run.event;
  let cards: HTMLElement[] = [];
  let head: [string, string] = ['Событие', ''];
  if (ev?.kind === 'chest') {
    cards = chestCards(app, ev);
    head = HEADS.chest;
  } else if (ev?.kind === 'altar') {
    cards = altarCards(app, ev);
    head = HEADS.altar;
  } else if (ev?.kind === 'forge') {
    cards = forgeCards(app);
    head = HEADS.forge;
  }
  const center = h(
    'div',
    { class: 'main hub-main', style: backgroundStyle(loc.id, 0.78) },
    h('div', { class: 'title-row' }, h('h2', null, head[0]), h('p', { class: 'dim' }, head[1])),
    h('div', { class: `cards ${cards.length === 1 ? 'single' : ''}` }, ...cards),
    h('div', { class: 'row' }, button(ev?.kind === 'chest' ? 'Оставить' : 'Уйти', () => app.leaveEvent(), { disabled: !!run.pending })),
  );
  return runFrame(app, { cls: `event event-${ev?.kind ?? 'none'}`, center, mid: hubGear(app), overlays: [pendingModal(app)] });
}
