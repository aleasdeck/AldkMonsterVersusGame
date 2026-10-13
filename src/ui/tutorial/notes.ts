import { button, h } from '../dom';
import { heroAvatar } from '../heroSprite';
import { thoughtText } from './thoughts';
import type { App } from '../app';

/**
 * «Записки героя» (v0.58.0): всё, о чём Воин уже подумал в этом обучении, по порядку — облачко висит недолго, а прочитать
 * упущенное хочется. Открываются из паузы.
 */
export function notesOverlay(app: App): HTMLElement {
  const run = app.run!;
  const seen = (run.tutorial?.seen ?? []).filter((id) => thoughtText(id));
  return h(
    'div',
    { class: 'overlay', onclick: (ev: MouseEvent) => ev.target === ev.currentTarget && app.toggleNotes() },
    h(
      'div',
      { class: 'panel notes' },
      h('div', { class: 'notes-head' }, heroAvatar(run.hero.defId, 44), h('h2', null, 'Записки героя')),
      seen.length
        ? h('div', { class: 'notes-list' }, ...seen.map((id) => h('div', { class: 'note-line' }, thoughtText(id))))
        : h('p', { class: 'dim' }, 'Пока ни о чём не задумывался.'),
      button('Закрыть', () => app.toggleNotes(), { class: 'primary' }),
    ),
  );
}
