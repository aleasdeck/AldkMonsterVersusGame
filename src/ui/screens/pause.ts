import { button, h } from '../dom';
import type { App } from '../app';

/** Пауза: продолжить, персонаж, лог боя, сид с копированием, в меню, бросить забег. Сид живёт здесь, а не в шапке. */
export function pauseMenu(app: App): HTMLElement {
  const run = app.run!;
  const seedBtn = button('Копировать', () => {
    navigator.clipboard?.writeText(String(run.seed)).then(() => {
      seedBtn.textContent = 'Скопировано';
    });
  }, { class: 'small', tip: 'Тот же сид с тем же героем даёт тот же забег' });
  return h(
    'div',
    { class: 'overlay', onclick: (ev: MouseEvent) => ev.target === ev.currentTarget && app.togglePause() },
    h(
      'div',
      { class: 'panel pause' },
      h('h2', null, 'Пауза'),
      h(
        'div',
        { class: 'pause-buttons' },
        button('Продолжить', () => app.togglePause(), { class: 'primary big' }),
        button('Персонаж', () => app.toggleSheet(), { class: 'big', tip: 'Статы, экипировка, умения (C)' }),
        button('Лог боя', () => app.toggleLogFromPause(), { class: 'big', tip: 'Все бои забега (L)' }),
        button('В главное меню', () => app.showMenu(), { class: 'big', tip: 'Забег сохранится, продолжить можно из меню' }),
        button('Бросить забег', () => app.abandonRun(), { class: 'big danger' }),
      ),
      h('div', { class: 'pause-seed' }, h('span', { class: 'dim' }, 'Сид: '), h('span', { class: 'seed-value' }, `${run.seed}`), seedBtn),
      h('div', { class: 'pause-keys dim' }, '1–9 приём · Enter цель · Tab другая цель · Space конец хода · C персонаж · L лог · Esc снять выбор / пауза'),
    ),
  );
}
