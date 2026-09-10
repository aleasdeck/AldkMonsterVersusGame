import { button, h } from './dom';
import { ACTS_PER_RUN, EVENT_NAMES, ROOM_KINDS, ROOM_NAMES } from '../data/locations';
import { currentLocation, currentRoomKind } from '../engine/run';
import type { RoomKind } from '../engine/types';
import { goldBadge } from './components';
import type { App } from './app';

/** Иконки клеток этажа — в ленте топбара и на карте. */
export const ROOM_ICONS: Record<RoomKind, string> = {
  fight: '⚔',
  event: '?',
  elite: '☠',
  shop: '◉',
  boss: '♛',
};

/** «12:34» или «1:02:03» — таймер забега в топбаре. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return `${hours > 0 ? `${hours}:` : ''}${mm}:${String(seconds).padStart(2, '0')}`;
}

/** Лента из девяти клеток этажа: пройденные погашены, текущая жёлтая. */
function roomStrip(app: App): HTMLElement {
  const run = app.run!;
  const cur = run.roomIndex;
  return h(
    'div',
    { class: 'room-strip' },
    ...ROOM_KINDS.map((k, i) => {
      const state = i < cur ? 'done' : i === cur ? 'current' : 'future';
      const note = i < cur ? ' — пройдено' : i === cur ? ' — сейчас' : '';
      return h('span', { class: `room-cell ${state} room-${k}`, tip: `${i + 1}. ${ROOM_NAMES[k]}${note}` }, ROOM_ICONS[k]);
    }),
  );
}

/**
 * Топбар забега, 40 px: слева кнопка-иконка «Персонаж» и золото; по центру акт, локация,
 * вид комнаты и лента клеток; справа ход (только в бою), таймер и меню. Полосок, портрета и имени здесь нет — решение пользователя.
 */
export function topbar(app: App): HTMLElement {
  const run = app.run!;
  const loc = currentLocation(run);
  // В клетке события пишем, что именно выпало: «Торговец», а не «Событие».
  const where = run.event ? EVENT_NAMES[run.event.kind] : ROOM_NAMES[currentRoomKind(run)];
  const b = run.battle;
  const turn = b && run.phase === 'battle' ? h('span', { class: 'turn' }, b.phase === 'enemy' ? 'Ход врагов…' : `Ход ${b.turn}`) : null;
  return h(
    'div',
    { class: 'run-top' },
    h(
      'div',
      { class: 'top-left' },
      button('☻', () => app.toggleSheet(), { class: 'small menu-btn', tip: 'Персонаж: статы, экипировка, умения (C)' }),
      goldBadge(run.gold),
    ),
    h('div', { class: 'top-center' }, h('span', { class: 'dim' }, `Акт ${run.locationIndex + 1}/${ACTS_PER_RUN} · ${loc.name} · ${where}`), roomStrip(app)),
    h(
      'div',
      { class: 'top-right' },
      turn,
      h('span', { class: 'run-clock', tip: 'Время забега' }, `⏱ ${formatClock(app.runElapsed())}`),
      button('☰', () => app.togglePause(), { class: 'small menu-btn', tip: 'Меню: пауза, персонаж, лог, сид (Esc)' }),
    ),
  );
}
