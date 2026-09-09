import { button, h } from '../dom';
import { ENEMY_LIST } from '../../data/enemies';
import { LOCATIONS, locationDef } from '../../data/locations';
import { describeAction } from '../../engine/combat';
import { spriteImg } from '../sprites';
import type { EnemyDef, LocationId } from '../../engine/types';
import type { App } from '../app';

const RANK_NAMES: Record<EnemyDef['rank'], string> = { normal: 'Рядовой', elite: 'Элита', boss: 'Босс' };
const ACT_NAMES = ['первого', 'второго', 'третьего'];

/** Враги локации в порядке таблицы: рядовые, элиты, боссы — как в enemies.ts. */
function enemiesOf(loc: LocationId): EnemyDef[] {
  return ENEMY_LIST.filter((e) => e.location === loc);
}

/** Плитка в сетке слева: спрайт и имя; не встреченный — чёрный силуэт и «???». */
function enemyTile(app: App, def: EnemyDef, open: boolean, selected: boolean): HTMLElement {
  return h(
    'div',
    {
      class: `beast-tile rank-${def.rank} ${open ? '' : 'locked'} ${selected ? 'selected' : ''}`,
      tip: open ? `${def.name} · ${RANK_NAMES[def.rank]}` : 'Ещё не встречен',
      onclick: () => app.bestiarySelect(def.id),
    },
    spriteImg(def.sprite, def.id, 48, open ? '' : 'silhouette'),
    h('div', { class: 'beast-tile-name' }, open ? def.name : '???'),
  );
}

/** Строка приёма: иконка вида, название и текст эффектов — те же, что в подсказке намерения в бою. */
function actionRow(def: EnemyDef, a: { name: string; effects: EnemyDef['actions'][number]['effects'] }, note?: string): HTMLElement {
  const info = describeAction(def, a);
  const text = info.text.startsWith(`${a.name}: `) ? info.text.slice(a.name.length + 2) : '';
  return h(
    'div',
    { class: 'beast-action' },
    h('span', { class: `beast-action-icon intent-${info.kind}` }, info.icon),
    h('span', { class: 'beast-action-name' }, a.name),
    h('span', { class: 'beast-action-text dim' }, [text, note].filter(Boolean).join(' · ') || 'без эффекта'),
  );
}

/** Как враг выбирает приёмы: рядовые — по кругу, боссы — по правилам с условиями и перезарядками. */
function patternLine(def: EnemyDef): HTMLElement {
  if (def.ai.type === 'cycle') {
    const names = def.ai.order.map((id) => def.actions.find((a) => a.id === id)?.name ?? id);
    return h('div', { class: 'beast-pattern' }, h('span', { class: 'dim' }, 'По кругу: '), names.join(' → '));
  }
  return h('div', { class: 'beast-pattern' }, h('span', { class: 'dim' }, 'Босс: '), 'выбирает приём по правилам — с условиями, перезарядкой и связками, а не по кругу.');
}

function detail(def: EnemyDef, open: boolean): HTMLElement {
  const loc = locationDef(def.location);
  if (!open) {
    return h(
      'div',
      { class: 'beast-detail' },
      h('div', { class: 'beast-head' }, spriteImg(def.sprite, def.id, 96, 'silhouette'), h('div', { class: 'beast-title' }, h('div', { class: 'beast-name' }, '???'), h('div', { class: 'beast-rank dim' }, `${RANK_NAMES[def.rank]} · ${loc.name}`))),
      h('div', { class: 'beast-empty dim' }, 'Запись откроется, когда этот враг появится в бою — сам, по призыву или отделившись от другого.'),
    );
  }
  const conditional = (a: EnemyDef['actions'][number]) => (a.condition ? 'по условию' : undefined);
  return h(
    'div',
    { class: 'beast-detail' },
    h(
      'div',
      { class: 'beast-head' },
      spriteImg(def.sprite, def.id, 96, 'bob'),
      h(
        'div',
        { class: 'beast-title' },
        h('div', { class: 'beast-name' }, def.name),
        h('div', { class: `beast-rank rank-${def.rank}` }, `${RANK_NAMES[def.rank]} · ${loc.name}`),
        h('div', { class: 'beast-hp' }, h('span', { class: 'dim' }, 'HP '), `${def.hp}`),
      ),
    ),
    h('h3', null, 'Приёмы'),
    h('div', { class: 'beast-actions' }, ...def.actions.map((a) => actionRow(def, a, conditional(a)))),
    patternLine(def),
    def.onDeath ? h('h3', null, 'При смерти') : null,
    def.onDeath ? h('div', { class: 'beast-actions' }, actionRow(def, def.onDeath)) : null,
    h('div', { class: 'beast-note dim' }, `Числа — для ${ACT_NAMES[loc.tier - 1]} акта, родного для локации; в поздних актах враг толще и бьёт сильнее.`),
  );
}

export function bestiaryScreen(app: App): HTMLElement {
  const have = new Set(app.profile.bestiary);
  const loc = app.bestiaryLoc;
  const list = enemiesOf(loc);
  // Выбранная запись из другой вкладки не подходит — берём первую открытую, а если таких нет, первую запись.
  const picked = list.find((e) => e.id === app.bestiaryPick) ?? list.find((e) => have.has(e.id)) ?? list[0];
  const total = ENEMY_LIST.length;

  const tabs = LOCATIONS.map((l) => {
    const own = enemiesOf(l.id);
    const open = own.filter((e) => have.has(e.id)).length;
    return button(
      h('span', null, l.name, h('span', { class: 'beast-tab-count' }, `${open}/${own.length}`)),
      () => app.showBestiary(l.id),
      { class: `small beast-tab ${l.id === loc ? 'selected' : ''}`, tip: l.desc },
    );
  });

  return h(
    'div',
    { class: 'screen bestiary' },
    h(
      'div',
      { class: 'topbar' },
      button('← Меню', () => app.showMenu(), { class: 'small' }),
      h('span', { class: 'title-sm' }, 'Бестиарий'),
      h('span', { class: 'dim' }, `${have.size}/${total} встречено`),
    ),
    h('div', { class: 'beast-tabs' }, ...tabs),
    h(
      'div',
      { class: 'body' },
      h('div', { class: 'beast-grid' }, ...list.map((e) => enemyTile(app, e, have.has(e.id), e.id === picked?.id))),
      picked ? detail(picked, have.has(picked.id)) : h('div', { class: 'beast-detail dim' }, 'В этой локации пока нет врагов.'),
    ),
  );
}
