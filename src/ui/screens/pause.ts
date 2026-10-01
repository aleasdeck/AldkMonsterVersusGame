import { button, h } from '../dom';
import { DIFFICULTIES } from '../../data/boons';
import { paramTip } from '../tips';
import { musicVolumeOf } from '../save';
import type { App } from '../app';

/** Пауза: продолжить, персонаж, лог боя, сид с копированием, в меню, бросить забег, сундук и музыка. Сид живёт здесь, а не в шапке. */
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
      h('div', { class: 'pause-seed' }, h('span', { class: 'dim' }, 'Сложность: '), h('span', { style: `color:${DIFFICULTIES[run.difficulty]?.color ?? 'inherit'}` }, DIFFICULTIES[run.difficulty]?.name ?? '—'), h('span', { class: 'dim' }, ' · Сид: '), h('span', { class: 'seed-value' }, `${run.seed}`), seedBtn),
      h(
        'div',
        { class: 'pause-seed' },
        h('span', { class: 'dim' }, 'Сундук: '),
        h('span', null, app.profile.lockSkip ? 'открывать сразу' : 'взлом'),
        button(app.profile.lockSkip ? 'Взламывать' : 'Без взлома', () => app.toggleLockSkip(), {
          class: 'small',
          tip: paramTip(
            'chest',
            'Взлом сундука',
            'Взлом — мини-игра со скважиной: засечка на каждую вещь, отличная приносит золото, срыв — сундук не откроется и уколет иглой.\nБез взлома сундук открывается сразу, как «хорошо» на всех штифтах: без золота за засечки и без иглы.',
          ),
        }),
      ),
      musicRow(app),
      h('div', { class: 'pause-keys dim' }, '1–9 приём · Enter цель · Tab другая цель · Space конец хода, у сундука — взлом · C персонаж · L лог · M музыка · Esc снять выбор / пауза'),
    ),
  );
}

/** Музыка локации: громкость шагом в 10 % и выключатель; что играет здесь — в подсказке. */
function musicRow(app: App): HTMLElement {
  const vol = musicVolumeOf(app.profile);
  const muted = !!app.profile.musicMuted;
  const title = app.music.title();
  const tip = paramTip('note', 'Музыка', 'У каждой локации свой трек в духе 16-битных приставок. Громкость и выключатель помнятся между забегами.', {
    note: title ? `Здесь играет «${title}»` : undefined,
  });
  return h(
    'div',
    { class: 'pause-seed' },
    h('span', { class: 'dim', tip }, 'Музыка: '),
    h('span', { tip }, muted || vol <= 0 ? 'выключена' : `${Math.round(vol * 100)}\u00a0%`),
    button('−', () => app.stepMusic(-1), { class: 'small', tip: paramTip('note', 'Тише', 'Громкость музыки −10 %') }),
    button('+', () => app.stepMusic(1), { class: 'small', tip: paramTip('note', 'Громче', 'Громкость музыки +10 %; с нуля — снова включает') }),
    button(muted ? 'Включить' : 'Выключить', () => app.toggleMusic(), { class: 'small', tip: paramTip('note', 'Музыка', 'Выключить или включить музыку (M)') }),
  );
}
