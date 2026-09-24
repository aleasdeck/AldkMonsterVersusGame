import { button, h, type Child } from '../dom';
import type { BattleLog, RunState } from '../../engine/types';
import { battleTitle } from '../../engine/run';
import type { App } from '../app';
import { battleLogView, logVariantSwitch } from '../logView';

function pastBattle(entry: BattleLog, index: number, open: boolean): HTMLElement {
  const badge =
    entry.result === 'won' ? h('span', { class: 'runlog-won' }, 'победа') : entry.result === 'fled' ? h('span', { class: 'dim' }, 'вор удрал') : h('span', { class: 'runlog-lost' }, 'поражение');
  const body = h('div', { class: 'runlog-lines' });
  const details = h('details', { class: 'runlog-battle' }, h('summary', null, h('span', { class: 'runlog-title' }, entry.title), h('span', { class: 'dim' }, ` · ${entry.turns} х. · `), badge), body) as HTMLDetailsElement;
  // Свёрнутый бой рисуется, только когда его раскрыли: к концу забега боёв три десятка, а лог перерисовывается с каждым действием.
  const fill = () => {
    if (details.open && !body.firstChild) body.appendChild(battleLogView(entry.lines, entry.marks, index));
  };
  details.addEventListener('toggle', fill);
  if (open) {
    details.setAttribute('open', '');
    fill();
  }
  return details;
}

/**
 * Тело лога боя за весь забег: прошлые бои свёрнуты (последний — раскрыт, если идущего боя нет),
 * идущий бой — ходами в конце. Одно и то же и в выдвижной панели боя, и в оверлее вне боя.
 */
export function runLogBody(run: RunState): HTMLElement[] {
  const live = run.phase === 'battle' && run.battle ? run.battle : null;
  const past = run.logs.map((entry, i) => pastBattle(entry, i, !live && i === run.logs.length - 1));
  if (!live) return past.length ? past : [h('div', { class: 'dim' }, 'Боёв ещё не было.')];
  // Идущий бой — раскрыт и подписан так же, как прошлые: под свёрнутыми строками видно, где начинается нынешний.
  const head = h('div', { class: 'runlog-battle live' }, h('span', { class: 'runlog-title' }, battleTitle(run)), h('span', { class: 'dim' }, ` · ход ${live.turn}`));
  return [...past, head, battleLogView(live.log, live.logMarks, run.logs.length)];
}

/** Шапка лога: заголовок, переключатель вида (v0.51, выбор за пользователем) и крестик. */
export function logHead(app: App, title: Child, cls: string): HTMLElement {
  return h('div', { class: cls }, title, logVariantSwitch(() => app.render()), button('✕', () => app.toggleLog(), { class: 'small' }));
}

/** Лог вне боя (итоги, хабы): та же панель, но оверлеем по центру, потому что поля боя нет. */
export function logOverlay(app: App): HTMLElement {
  const run = app.run!;
  return h(
    'div',
    { class: 'overlay', onclick: (ev: MouseEvent) => ev.target === ev.currentTarget && app.toggleLog() },
    h('div', { class: 'panel runlog' }, logHead(app, h('h2', null, `Лог боя · боёв: ${run.logs.length}`), 'runlog-head'), h('div', { class: 'runlog-body' }, ...runLogBody(run))),
  );
}
