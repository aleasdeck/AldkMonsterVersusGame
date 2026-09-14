import { button, h } from '../dom';
import { HERO_LIST, heroDef } from '../../data/heroes';
import { LOCATION_BY_ID } from '../../data/locations';
import { durationText, summarize, type GlobalSummary, type SpotSummary } from '../../engine/globalStats';
import type { LocationId } from '../../engine/types';
import type { App } from '../app';

/** Герой с меньшим числом забегов — процент не показываем: три забега с одной победой «33 %» ничего не значат. */
export const MIN_RUNS_FOR_RATE = 5;

function pct(wins: number, runs: number): string {
  if (runs < MIN_RUNS_FOR_RATE) return '—';
  return `${Math.round((wins / runs) * 100)} %`;
}

/** Таблица по героям: забегов, побед, доля. Строки «Итого» внизу. */
function heroTable(rows: { hero: string; runs: number; wins: number }[], total: { runs: number; wins: number }): HTMLElement {
  const line = (name: string, runs: number, wins: number, cls = '') =>
    h('div', { class: `gs-row ${cls}` }, h('span', { class: 'gs-name' }, name), h('span', { class: 'gs-num' }, `${runs}`), h('span', { class: 'gs-num' }, `${wins}`), h('span', { class: 'gs-num' }, pct(wins, runs)));
  return h(
    'div',
    { class: 'gs-table' },
    h('div', { class: 'gs-row head dim' }, h('span', { class: 'gs-name' }, 'Герой'), h('span', { class: 'gs-num' }, 'забегов'), h('span', { class: 'gs-num' }, 'побед'), h('span', { class: 'gs-num' }, 'доля')),
    ...rows.map((r) => line(heroDef(r.hero).name, r.runs, r.wins, r.runs ? '' : 'dim')),
    line('Итого', total.runs, total.wins, 'total'),
  );
}

function spotList(title: string, spots: SpotSummary[], empty: string): HTMLElement {
  return h(
    'div',
    { class: 'gs-block' },
    h('div', { class: 'coll-head' }, h('span', null, title)),
    spots.length
      ? h('div', { class: 'gs-spots' }, ...spots.map((s) => h('div', { class: 'gs-spot' }, h('span', { class: 'gs-spot-label' }, s.label), h('span', { class: 'gs-num dim' }, `${s.count} · ${Math.round(s.share * 100)} %`))))
      : h('div', { class: 'dim' }, empty),
  );
}

/** Блок урона: всего и в среднем за законченный забег — в обеих колонках одинаково. */
function damageBlock(dealt: number, taken: number, runs: number): HTMLElement {
  const line = (name: string, total: number) =>
    h('div', { class: 'gs-spot' }, h('span', { class: 'gs-spot-label' }, name), h('span', { class: 'gs-num' }, `${total}`, h('span', { class: 'dim' }, runs ? ` · ${Math.round(total / runs)} за забег` : '')));
  return h('div', { class: 'gs-block' }, h('div', { class: 'coll-head' }, h('span', null, 'Урон')), h('div', { class: 'gs-spots' }, line('Нанесено', dealt), line('Получено', taken)));
}

function everyone(app: App): HTMLElement {
  const head = h('div', { class: 'coll-head' }, h('span', null, 'Все игроки'), h('span', { class: 'dim' }, app.statsFeed ? `${app.statsFeed.rows.length} записей` : ''));
  if (app.statsLoading) return h('div', { class: 'gs-panel' }, head, h('div', { class: 'dim' }, 'Загружаем…'));
  if (!app.statsFeed) {
    return h(
      'div',
      { class: 'gs-panel' },
      head,
      h('div', { class: 'dim' }, app.statsError ?? 'Общая статистика недоступна.'),
      app.statsError ? button('Повторить', () => app.showStats(true), { class: 'small' }) : null,
    );
  }
  const s: GlobalSummary = summarize(app.statsFeed, {
    heroes: HERO_LIST.map((d) => d.id),
    locationName: (id) => LOCATION_BY_ID[id as LocationId]?.name ?? id,
  });
  const avg = s.wins ? `Победный забег в среднем: ${durationText(s.winDuration)}, ${s.winTurns} ходов` : 'Побед пока нет.';
  return h(
    'div',
    { class: 'gs-panel' },
    head,
    heroTable(s.heroes, s),
    h('div', { class: 'gs-note dim' }, `${avg}${s.abandoned ? ` · брошено ${s.abandoned}` : ''}`),
    damageBlock(s.damageDealt, s.damageTaken, s.runs),
    spotList('Где гибнут', s.deathSpots, 'Гибелей ещё не было.'),
    spotList('Кто убивает', s.killers, 'Гибелей ещё не было.'),
  );
}

function mine(app: App): HTMLElement {
  const p = app.profile;
  const rows = HERO_LIST.map((d) => ({ hero: d.id, runs: p.heroRuns[d.id] ?? 0, wins: p.heroWins[d.id] ?? 0 }));
  return h(
    'div',
    { class: 'gs-panel' },
    h('div', { class: 'coll-head' }, h('span', null, 'Ты'), h('span', { class: 'dim' }, p.runs ? `${p.runs} забегов` : '')),
    p.runs ? heroTable(rows, { runs: p.runs, wins: p.victories }) : h('div', { class: 'dim' }, 'Ещё ни одного забега.'),
    p.runs ? damageBlock(p.damageDealt, p.damageTaken, p.runs) : null,
    h('div', { class: 'gs-note dim' }, `Доля считается от ${MIN_RUNS_FOR_RATE} забегов героем. Брошенные забеги не считаются ни у кого.`),
  );
}

/** Экран «Статистика»: слева сводка по всем игрокам из таблицы (кэш 10 минут), справа своя из профиля. */
export function statsScreen(app: App): HTMLElement {
  return h(
    'div',
    { class: 'screen stats' },
    h('div', { class: 'topbar' }, button('← Меню', () => app.showMenu(), { class: 'small' }), h('span', { class: 'title-sm' }, 'Статистика'), h('span', { class: 'dim' }, 'все игроки и ты')),
    h('div', { class: 'body gs-body' }, everyone(app), mine(app)),
  );
}
