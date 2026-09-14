import { button, h } from '../dom';
import { HERO_LIST, heroDef } from '../../data/heroes';
import { LOCATION_BY_ID } from '../../data/locations';
import { ARTIFACTS } from '../../data/artifacts';
import { ARMOR_BASES, WEAPON_BASES } from '../../data/gear';
import { durationText, summarize, type GlobalSummary, type ItemSummary, type SpotSummary } from '../../engine/globalStats';
import type { LocationId } from '../../engine/types';
import type { App } from '../app';

/** Герой с меньшим числом забегов — процент не показываем: три забега с одной победой «33 %» ничего не значат. */
export const MIN_RUNS_FOR_RATE = 5;

/** Вкладки сводки по всем игрокам. Одна вкладка — один экран без прокрутки (решение пользователя). */
export type StatsTab = 'heroes' | 'deaths' | 'weapons' | 'armor' | 'artifacts';
const TABS: { id: StatsTab; name: string }[] = [
  { id: 'heroes', name: 'Герои' },
  { id: 'deaths', name: 'Гибели' },
  { id: 'weapons', name: 'Оружие' },
  { id: 'armor', name: 'Броня' },
  { id: 'artifacts', name: 'Артефакты' },
];
/** Сколько строк влезает в кадр под шапкой и вкладками. */
const ROWS = 16;

function pct(wins: number, runs: number): string {
  if (runs < MIN_RUNS_FOR_RATE) return '—';
  return `${Math.round((wins / runs) * 100)} %`;
}

/** Таблица «имя · забегов · побед · доля» — для героев и предметов одна и та же; total — строка «Итого» внизу. */
function rateTable(head: string, rows: { name: string; runs: number; wins: number }[], total?: { runs: number; wins: number }): HTMLElement {
  const line = (name: string, runs: number, wins: number, cls = '') =>
    h('div', { class: `gs-row ${cls}` }, h('span', { class: 'gs-name', tip: name }, name), h('span', { class: 'gs-num' }, `${runs}`), h('span', { class: 'gs-num' }, `${wins}`), h('span', { class: 'gs-num' }, pct(wins, runs)));
  return h(
    'div',
    { class: 'gs-table' },
    h('div', { class: 'gs-row head dim' }, h('span', { class: 'gs-name' }, head), h('span', { class: 'gs-num' }, 'забегов'), h('span', { class: 'gs-num' }, 'побед'), h('span', { class: 'gs-num' }, 'доля')),
    ...rows.map((r) => line(r.name, r.runs, r.wins, r.runs ? '' : 'dim')),
    total ? line('Итого', total.runs, total.wins, 'total') : null,
  );
}

function heroRows(list: { hero: string; runs: number; wins: number }[]): { name: string; runs: number; wins: number }[] {
  return list.map((r) => ({ name: heroDef(r.hero).name, runs: r.runs, wins: r.wins }));
}

/** Предметы по id → имена; неизвестные id (из старых версий) пропускаем. Первые ROWS строк. */
function itemRows(items: ItemSummary[], nameOf: (id: string) => string | undefined): { name: string; runs: number; wins: number }[] {
  const out: { name: string; runs: number; wins: number }[] = [];
  for (const it of items) {
    const name = nameOf(it.id);
    if (!name) continue;
    out.push({ name, runs: it.runs, wins: it.wins });
    if (out.length >= ROWS) break;
  }
  return out;
}

const weaponName = (id: string) => WEAPON_BASES.find((b) => b.id === id)?.name;
const armorName = (id: string) => ARMOR_BASES.find((b) => b.id === id)?.name;
const artifactName = (id: string) => ARTIFACTS[id]?.name;

function spotList(spots: SpotSummary[], empty: string): HTMLElement {
  if (!spots.length) return h('div', { class: 'dim' }, empty);
  return h(
    'div',
    { class: 'gs-spots' },
    ...spots.map((s) => h('div', { class: 'gs-spot' }, h('span', { class: 'gs-spot-label', tip: s.label }, s.label), h('span', { class: 'gs-num dim' }, `${s.count} · ${Math.round(s.share * 100)} %`))),
  );
}

/** Блок урона: всего и в среднем за законченный забег — в обеих колонках одинаково. */
function damageBlock(dealt: number, taken: number, runs: number): HTMLElement {
  const line = (name: string, total: number) =>
    h('div', { class: 'gs-spot' }, h('span', { class: 'gs-spot-label' }, name), h('span', { class: 'gs-num' }, `${total}`, h('span', { class: 'dim' }, runs ? ` · ${Math.round(total / runs)} за забег` : '')));
  return h('div', { class: 'gs-block' }, h('div', { class: 'coll-head' }, h('span', null, 'Урон')), h('div', { class: 'gs-spots' }, line('Нанесено', dealt), line('Получено', taken)));
}

function tabBody(app: App, s: GlobalSummary): HTMLElement[] {
  switch (app.statsTab) {
    case 'heroes': {
      const avg = s.wins ? `Победный забег в среднем: ${durationText(s.winDuration)}, ${s.winTurns} ходов` : 'Побед пока нет.';
      return [rateTable('Герой', heroRows(s.heroes), s), h('div', { class: 'gs-note dim' }, `${avg}${s.abandoned ? ` · брошено ${s.abandoned}` : ''}`), damageBlock(s.damageDealt, s.damageTaken, s.runs)];
    }
    case 'deaths':
      return [h('div', { class: 'coll-head' }, h('span', null, 'Где гибнут'), h('span', { class: 'dim' }, `${s.runs - s.wins} гибелей`)), spotList(s.deathSpots, 'Гибелей ещё не было.')];
    case 'weapons':
      return [rateTable('Оружие в конце забега', itemRows(s.weapons, weaponName))];
    case 'armor':
      return [rateTable('Броня в конце забега', itemRows(s.armors, armorName))];
    case 'artifacts':
      return [rateTable('Артефакт в конце забега', itemRows(s.artifacts, artifactName))];
  }
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
  const s = summarize(app.statsFeed, {
    heroes: HERO_LIST.map((d) => d.id),
    locationName: (id) => LOCATION_BY_ID[id as LocationId]?.name ?? id,
    top: ROWS,
  });
  const tabs = h('div', { class: 'gs-tabs' }, ...TABS.map((t) => button(t.name, () => app.setStatsTab(t.id), { class: `small gs-tab ${t.id === app.statsTab ? 'selected' : ''}` })));
  return h('div', { class: 'gs-panel' }, head, tabs, ...tabBody(app, s));
}

function mine(app: App): HTMLElement {
  const p = app.profile;
  const rows = heroRows(HERO_LIST.map((d) => ({ hero: d.id, runs: p.heroRuns[d.id] ?? 0, wins: p.heroWins[d.id] ?? 0 })));
  return h(
    'div',
    { class: 'gs-panel' },
    h('div', { class: 'coll-head' }, h('span', null, 'Ты'), h('span', { class: 'dim' }, p.runs ? `${p.runs} забегов` : '')),
    p.runs ? rateTable('Герой', rows, { runs: p.runs, wins: p.victories }) : h('div', { class: 'dim' }, 'Ещё ни одного забега.'),
    p.runs ? damageBlock(p.damageDealt, p.damageTaken, p.runs) : null,
    h('div', { class: 'gs-note dim' }, `Доля считается от ${MIN_RUNS_FOR_RATE} забегов. Брошенные забеги не считаются ни у кого. Предметы — те, что были у героя в конце забега.`),
  );
}

/** Экран «Статистика»: слева сводка по всем игрокам из таблицы (кэш 10 минут) с вкладками, справа своя из профиля. */
export function statsScreen(app: App): HTMLElement {
  return h(
    'div',
    { class: 'screen stats' },
    h('div', { class: 'topbar' }, button('← Меню', () => app.showMenu(), { class: 'small' }), h('span', { class: 'title-sm' }, 'Статистика'), h('span', { class: 'dim' }, 'все игроки и ты')),
    h('div', { class: 'body gs-body' }, everyone(app), mine(app)),
  );
}
