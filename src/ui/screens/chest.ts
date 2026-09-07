import { button, h } from '../dom';
import { COLLECTIBLES, PRIZE_INDEX, buildChestStrip, collectible, lockedIds } from '../../data/collection';
import { int, type Rng } from '../../engine/rng';
import { collectibleCard, collectibleTile } from '../components';
import { chestIcon } from '../icons';
import type { App } from '../app';

/** Геометрия ленты: шаг плитки с зазором и ширина окна просмотра. */
const STEP = 106;
const WINDOW = 800;
/** Столько крутится лента; столько же длится transition в CSS. */
export const SPIN_MS = 4600;

export interface ChestState {
  strip: string[];
  prize: string;
  /** На сколько пикселей сдвинуть ленту в конце. */
  offset: number;
  phase: 'spin' | 'done';
}

export function buildStrip(rng: Rng, prize: string): ChestState {
  // небольшой сдвиг внутри плитки, чтобы стрелка не всегда попадала ровно в центр
  const jitter = int(rng, -34, 34);
  return { strip: buildChestStrip(rng, prize), prize, offset: PRIZE_INDEX * STEP + STEP / 2 - WINDOW / 2 + jitter, phase: 'spin' };
}

function stage(app: App, st: ChestState): HTMLElement {
  const strip = h(
    'div',
    { class: 'chest-strip', style: st.phase === 'spin' ? 'transform:translateX(0)' : `transform:translateX(${-st.offset}px)` },
    ...st.strip.map((id, i) => {
      const c = collectible(id)!;
      const el = collectibleTile(c);
      if (st.phase === 'done' && i === PRIZE_INDEX) el.classList.add('won');
      return el;
    }),
  );
  if (st.phase === 'spin') {
    strip.classList.add('spinning');
    // два кадра: первый вставляет ленту в документ, второй запускает переход
    requestAnimationFrame(() => requestAnimationFrame(() => (strip.style.transform = `translateX(${-st.offset}px)`)));
  }
  return h(
    'div',
    { class: 'chest-stage' },
    h('div', { class: 'chest-window' }, strip, h('div', { class: 'chest-marker' })),
    st.phase === 'spin'
      ? h('div', { class: 'row' }, button('Пропустить', () => app.skipSpin()))
      : h(
          'div',
          { class: 'chest-result' },
          h('h2', null, 'Найдено!'),
          collectibleCard(collectible(st.prize)!),
          h(
            'div',
            { class: 'row' },
            app.profile.chests > 0 ? button(`Открыть ещё (${app.profile.chests})`, () => app.openChest(), { class: 'primary' }) : null,
            button('Коллекция', () => app.showCollection()),
            button('В меню', () => app.showMenu()),
          ),
        ),
  );
}

export function chestScreen(app: App): HTMLElement {
  const p = app.profile;
  const left = lockedIds(p.collection).length;
  const found = COLLECTIBLES.length - left;

  const top = h(
    'div',
    { class: 'topbar' },
    button('← Меню', () => app.showMenu(), { class: 'small' }),
    h('span', { class: 'title-sm' }, 'Сундук'),
    h('span', { class: 'dim' }, `Коллекция ${found}/${COLLECTIBLES.length}`),
  );

  if (app.chest) return h('div', { class: 'screen chest' }, top, stage(app, app.chest));

  const canOpen = p.chests > 0 && left > 0;
  const note = left === 0 ? 'Коллекция собрана полностью — открывать больше нечего.' : p.chests > 0 ? 'Внутри одна вещь из тех, что встречаются в приключениях. Дважды одна и та же не выпадет.' : 'Сундук выдаётся за каждый завершённый забег — победа это или смерть.';
  return h(
    'div',
    { class: 'screen chest' },
    top,
    h(
      'div',
      { class: 'chest-idle' },
      h('div', { class: `chest-box ${canOpen ? 'ready' : ''}`, onclick: canOpen ? () => app.openChest() : undefined }, chestIcon(120)),
      h('div', { class: 'chest-count' }, `Сундуков: ${p.chests}`),
      h('p', { class: 'dim' }, note),
      h(
        'div',
        { class: 'row' },
        canOpen ? button('Открыть сундук', () => app.openChest(), { class: 'primary big' }) : null,
        button('Коллекция', () => app.showCollection(), { class: 'big' }),
      ),
    ),
  );
}
