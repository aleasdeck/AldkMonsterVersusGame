import { button, h } from '../dom';
import { ROOM_NAMES } from '../../data/locations';
import { awaitsBoon, awaitsThreshold, currentLocation, currentRoomKind } from '../../engine/run';
import { trialDef } from '../../data/trials';
import { boonDef } from '../../data/boons';
import { markKeywords } from '../keywords';
import type { RoomKind } from '../../engine/types';
import { backgroundStyle } from '../backgrounds';
import { runFrame } from '../frame';
import { hubGear } from '../console';
import { ROOM_ICONS } from '../topbar';
import type { App } from '../app';

const ROOM_DESC: Record<RoomKind, string> = {
  fight: 'Обычный бой. После победы — одна награда на выбор из трёх.',
  event: 'Что-то случится: чаще всего торговец, сундук или алтарь, реже привал или кузнец, изредка — засада элиты.',
  elite: 'Сильный противник. Награда на тир выше обычной.',
  shop: 'Торговец: лекарь, случайная экипировка и артефакт за золото, переброс товаров один раз. Купить можно всё, на что хватит, или уйти ни с чем.',
  boss: 'Босс локации. За победу — экипировка и артефакт.',
};

/**
 * Порог локации: перед первой клеткой — два испытания (сложность «Сложный», v0.48) или два благословения («Лёгкий») на выбор,
 * одно обязательно. Карточка — значок, правило числами этого акта и подсказка, кого оно бьёт или кому помогает; выбор —
 * по сборке: «что меньше мешает мне» или «что больше мне поможет». Благословение отличается от испытания цветом рамки.
 */
function thresholdCenter(app: App): HTMLElement {
  const run = app.run!;
  const loc = currentLocation(run);
  const boon = awaitsBoon(run);
  const card = (id: string, i: number) => {
    const t = boon ? boonDef(id) : trialDef(id);
    return h(
      'div',
      { class: `trial-card ${boon ? 'boon' : ''}`.trim() },
      h('div', { class: 'trial-glyph' }, t.glyph),
      h('div', { class: 'trial-name' }, t.name),
      h('div', { class: 'trial-desc' }, ...markKeywords(t.desc(run.locationIndex))),
      h('div', { class: 'trial-hint dim' }, t.hint),
      button(`Выбрать (${i + 1})`, () => (boon ? app.chooseBoon(id) : app.chooseTrial(id)), { class: 'primary' }),
    );
  };
  return h(
    'div',
    { class: 'main map-main threshold', style: backgroundStyle(loc.id, 0.6) },
    h('h2', null, `${loc.name}: ${boon ? 'благословение' : 'испытание'}`),
    h('p', { class: 'dim' }, boon ? 'Одно из двух — до конца локации: что больше поможет сборке.' : 'Одно из двух — до конца локации: что меньше мешает сборке.'),
    h('div', { class: 'trial-cards' }, ...(boon ? run.boonOffer : run.trialOffer).map(card)),
  );
}

/** Предбанник комнаты: лента этажа живёт в топбаре, здесь — локация, описание комнаты и «Войти». */
export function mapScreen(app: App): HTMLElement {
  const run = app.run!;
  if (awaitsThreshold(run)) return runFrame(app, { cls: 'map', center: thresholdCenter(app), mid: hubGear(app) });
  const loc = currentLocation(run);
  const kind = currentRoomKind(run);
  const center = h(
    'div',
    { class: 'main map-main', style: backgroundStyle(loc.id, 0.6) },
    h('h2', null, loc.name),
    h('p', { class: 'dim' }, loc.desc),
    h('div', { class: 'room-preview' }, h('span', { class: `room-icon room-${kind}` }, ROOM_ICONS[kind]), h('span', { class: 'room-title' }, ROOM_NAMES[kind])),
    h('p', { class: 'room-desc' }, ROOM_DESC[kind]),
    button(`Войти: ${ROOM_NAMES[kind]}`, () => app.enterRoom(), { class: 'primary big' }),
  );
  return runFrame(app, { cls: 'map', center, mid: hubGear(app) });
}
