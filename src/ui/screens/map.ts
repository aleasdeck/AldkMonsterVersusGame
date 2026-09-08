import { button, h } from '../dom';
import { ROOM_KINDS, ROOM_NAMES } from '../../data/locations';
import { currentLocation, currentRoomKind } from '../../engine/run';
import type { RoomKind } from '../../engine/types';
import { heroPanel } from '../components';
import { backgroundStyle } from '../backgrounds';
import type { App } from '../app';

export const ROOM_ICONS: Record<RoomKind, string> = {
  fight: '⚔',
  event: '?',
  elite: '☠',
  shop: '◉',
  boss: '♛',
};

const ROOM_DESC: Record<RoomKind, string> = {
  fight: 'Обычный бой. После победы — одна награда на выбор из трёх.',
  event: 'Три двери: родник, алтарь или сундук. Открыть можно одну.',
  elite: 'Сильный противник. Награда на тир выше обычной.',
  shop: 'Торговец: лекарь, случайная экипировка и артефакт за золото, переброс товаров один раз. Купить можно всё, на что хватит, или уйти ни с чем.',
  boss: 'Босс локации. За победу — экипировка и артефакт.',
};

export function mapScreen(app: App): HTMLElement {
  const run = app.run!;
  const loc = currentLocation(run);
  const kind = currentRoomKind(run);
  const rooms: HTMLElement[] = [];
  ROOM_KINDS.forEach((k, i) => {
    const state = i < run.roomIndex ? 'done' : i === run.roomIndex ? 'current' : 'future';
    if (i > 0) rooms.push(h('div', { class: `room-link ${i <= run.roomIndex ? 'done' : ''}` }));
    rooms.push(
      h(
        'div',
        { class: `room ${state} room-${k}`, tip: ROOM_DESC[k] },
        h('div', { class: 'room-icon' }, ROOM_ICONS[k]),
        h('div', { class: 'room-name' }, ROOM_NAMES[k]),
      ),
    );
  });
  return h(
    'div',
    { class: 'screen map' },
    h(
      'div',
      { class: 'topbar' },
      h('span', null, `Локация ${run.locationIndex + 1}/3 · ${loc.name}`),
      h('span', { class: 'dim' }, `сид ${run.seed}`),
      button('Бросить забег', () => app.abandonRun(), { class: 'small danger' }),
    ),
    h(
      'div',
      { class: 'body' },
      heroPanel(run),
      h(
        'div',
        { class: 'main', style: backgroundStyle(loc.id, 0.6) },
        h('h2', null, loc.name),
        h('p', { class: 'dim' }, loc.desc),
        h('div', { class: 'rooms' }, ...rooms),
        h('p', { class: 'room-desc' }, ROOM_DESC[kind]),
        button(`Войти: ${ROOM_NAMES[kind]}`, () => app.enterRoom(), { class: 'primary big' }),
      ),
    ),
  );
}
