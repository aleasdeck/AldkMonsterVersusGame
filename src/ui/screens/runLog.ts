import { button, h } from '../dom';
import type { BattleLog, RunState } from '../../engine/types';
import type { App } from '../app';

/** Строки лога: заголовки ходов «— Ход N —» цветом акцента. */
function logLines(lines: string[]): HTMLElement[] {
  return lines.map((l) => h('div', { class: l.startsWith('—') ? 'log-turn' : '' }, l));
}

function pastBattle(entry: BattleLog, open: boolean): HTMLElement {
  const badge = entry.result === 'won' ? h('span', { class: 'runlog-won' }, 'победа') : h('span', { class: 'runlog-lost' }, 'поражение');
  const details = h(
    'details',
    { class: 'runlog-battle' },
    h('summary', null, h('span', { class: 'runlog-title' }, entry.title), h('span', { class: 'dim' }, ` · ${entry.turns} х. · `), badge),
    h('div', { class: 'runlog-lines' }, ...logLines(entry.lines)),
  );
  if (open) details.setAttribute('open', '');
  return details;
}

/**
 * Тело лога боя за весь забег: прошлые бои свёрнуты (последний — раскрыт, если идущего боя нет),
 * идущий бой — просто строками в конце, как раньше. Одно и то же и в выдвижной панели боя, и в оверлее вне боя.
 */
export function runLogBody(run: RunState): HTMLElement[] {
  const live = run.phase === 'battle' && run.battle ? run.battle.log : null;
  const past = run.logs.map((entry, i) => pastBattle(entry, !live && i === run.logs.length - 1));
  if (!live) return past.length ? past : [h('div', { class: 'dim' }, 'Боёв ещё не было.')];
  return [...past, ...logLines(live)];
}

/** Лог вне боя (итоги, хабы): та же панель, но оверлеем по центру, потому что поля боя нет. */
export function logOverlay(app: App): HTMLElement {
  const run = app.run!;
  return h(
    'div',
    { class: 'overlay', onclick: (ev: MouseEvent) => ev.target === ev.currentTarget && app.toggleLog() },
    h(
      'div',
      { class: 'panel runlog' },
      h('div', { class: 'runlog-head' }, h('h2', null, `Лог боя · боёв: ${run.logs.length}`), button('✕', () => app.toggleLog(), { class: 'small' })),
      h('div', { class: 'runlog-body' }, ...runLogBody(run)),
    ),
  );
}
