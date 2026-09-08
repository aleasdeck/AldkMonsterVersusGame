import { button, h } from '../dom';
import { ROOM_NAMES } from '../../data/locations';
import { currentLocation, currentRoomKind } from '../../engine/run';
import type { RoomKind } from '../../engine/types';
import { backgroundStyle } from '../backgrounds';
import { runFrame } from '../frame';
import { hubGear } from '../console';
import { ROOM_ICONS } from '../topbar';
import type { App } from '../app';

const ROOM_DESC: Record<RoomKind, string> = {
  fight: 'Обычный бой. После победы — одна награда на выбор из трёх.',
  event: 'Три двери: родник, алтарь или сундук. Открыть можно одну.',
  elite: 'Сильный противник. Награда на тир выше обычной.',
  shop: 'Торговец: лекарь, случайная экипировка и артефакт за золото, переброс товаров один раз. Купить можно всё, на что хватит, или уйти ни с чем.',
  boss: 'Босс локации. За победу — экипировка и артефакт.',
};

/** Предбанник комнаты: лента этажа живёт в топбаре, здесь — локация, описание комнаты и «Войти». */
export function mapScreen(app: App): HTMLElement {
  const run = app.run!;
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
