import { trialDef } from '../data/trials';
import { boonDef, type BoonDef } from '../data/boons';
import { button, h } from './dom';
import { ACTS_PER_RUN, EVENT_NAMES, ROOM_KINDS, ROOM_NAMES } from '../data/locations';
import { artifactDef } from '../data/artifacts';
import { currentLocation, currentRoomKind } from '../engine/run';
import type { RoomKind } from '../engine/types';
import { artifactTip, goldBadge } from './components';
import { paramTip, tipHead, tipNote, tipText } from './tips';
import type { TipFn } from './dom';
import type { TrialDef } from '../data/trials';
import type { App } from './app';

/** Иконки клеток этажа — в ленте топбара и на карте. */
export const ROOM_ICONS: Record<RoomKind, string> = {
  fight: '⚔',
  event: '?',
  elite: '☠',
  shop: '◉',
  boss: '♛',
};

/** Цвет клетки в подсказке ленты: бой — красным, элита — фиолетовым, босс — золотом. */
const ROOM_COLORS: Record<RoomKind, string> = {
  fight: '#ff8787',
  event: '#8ecae6',
  elite: '#c9a0ff',
  shop: '#ffd166',
  boss: '#ffab40',
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
      const tip = paramTip({ glyph: ROOM_ICONS[k] }, ROOM_NAMES[k], undefined, {
        color: ROOM_COLORS[k],
        aside: `клетка ${i + 1}/${ROOM_KINDS.length}`,
        note: i < cur ? 'Пройдено' : i === cur ? 'Вы здесь' : undefined,
        noteTone: i === cur ? 'accent' : 'dim',
      });
      return h('span', { class: `room-cell ${state} room-${k}`, tip }, ROOM_ICONS[k]);
    }),
  );
}

/**
 * Топбар забега, 40 px: слева кнопка-иконка «Персонаж» и золото; по центру акт, локация,
 * вид комнаты и лента клеток; справа ход (только в бою), таймер и меню. Полосок, портрета и имени здесь нет — решение пользователя.
 */
/** Подсказка испытания (v0.48): значок и имя шапкой, правило абзацем, кого бьёт и чем отвечать — советом под лампой. */
export function trialTip(t: TrialDef, act: number): TipFn {
  return () => [
    tipHead({ icon: { glyph: t.glyph }, title: t.name, color: '#ff9f6b', sub: ['испытание локации', 'до конца локации'] }),
    tipText(t.desc(act)),
    tipNote(t.hint, 'bulb'),
  ];
}

/** Подсказка благословения: как у испытания, только зелёная шапка и совет — кому помогает. */
export function boonTip(b: BoonDef, act: number): TipFn {
  return () => [
    tipHead({ icon: { glyph: b.glyph }, title: b.name, color: '#80ed99', sub: ['благословение локации', 'до конца локации'] }),
    tipText(b.desc(act)),
    tipNote(b.hint, 'bulb'),
  ];
}

/** Чип испытания или благословения локации: значок и подсказка с правилом — действует до конца локации. */
function trialChip(app: App): HTMLElement | null {
  const run = app.run;
  if (run?.boon) {
    const b = boonDef(run.boon);
    return h('span', { class: 'trial-chip boon', tip: boonTip(b, run.locationIndex) }, b.glyph);
  }
  const id = run?.trial;
  if (!id) return null;
  const t = trialDef(id);
  return h('span', { class: 'trial-chip', tip: trialTip(t, run.locationIndex) }, t.glyph);
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
        ? h(
            'span',
            {
              class: 'gold-stolen',
              tip: paramTip({ glyph: '◉' }, 'Срезано вором', 'Пропадёт, если он удерёт, и вернётся, если его убить', { color: '#ff6b6b', aside: h('b', { class: 'tip-val' }, `−${run.battle.stolen}`) }),
            },
            `−${run.battle.stolen}`,
          )
        : null,
      run.battle?.stolenArtifact
        ? h(
            'span',
            {
              class: 'gold-stolen',
              tip: artifactTip(run.battle.stolenArtifact, { note: 'В мешке вора: пропадёт вместе с ним, если он удерёт, и вернётся, если его убить', noteIcon: 'alert', noteTone: 'bad' }),
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
