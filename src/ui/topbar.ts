import { trialDef } from '../data/trials';
import { button, h } from './dom';
import { ACTS_PER_RUN, EVENT_NAMES, ROOM_KINDS, ROOM_NAMES } from '../data/locations';
import { artifactDef } from '../data/artifacts';
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
/** Чип испытания локации (v0.48): значок и подсказка с правилом — действует до конца локации. */
function trialChip(app: App): HTMLElement | null {
  const id = app.run?.trial;
  if (!id) return null;
  const t = trialDef(id);
  return h('span', { class: 'trial-chip', tip: `${t.desc(app.run!.locationIndex)}\n${t.hint}`, tipTitle: `Испытание: ${t.name}` }, t.glyph);
}

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
      // Пока вор режет кошель, украденное висит рядом с золотом: видно, сколько уйдёт, если его упустить.
      run.battle && run.battle.stolen > 0
        ? h('span', { class: 'gold-stolen', tip: 'Уже срезано вором: пропадёт, если он удерёт, и вернётся, если его убить' }, `−${run.battle.stolen}`)
        : null,
      run.battle?.stolenArtifact
        ? h(
            'span',
            {
              class: 'gold-stolen',
              tip: `«${artifactDef(run.battle.stolenArtifact.id).name}» в мешке вора: пропадёт вместе с ним, если он удерёт`,
              tipTitle: 'Стянутый артефакт',
            },
            `−${artifactDef(run.battle.stolenArtifact.id).glyph}`,
          )
        : null,
      trialChip(app),
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
