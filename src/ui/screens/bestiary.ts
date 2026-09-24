import { button, h } from '../dom';
import { ENEMY_LIST, ROLE_INFO } from '../../data/enemies';
import { LOCATIONS, enemyScale, locationDef } from '../../data/locations';
import { describeAction, type ActionScale } from '../../engine/combat';
import { enemySprite as spriteImg } from '../enemySprite';
import { enemySize } from '../characterSize';
import type { EnemyDef, LocationId } from '../../engine/types';
import { paramTip } from '../tips';
import type { TipFn } from '../dom';
import type { App } from '../app';

const RANK_NAMES: Record<EnemyDef['rank'], string> = { normal: 'Рядовой', elite: 'Элита', boss: 'Босс' };

/** Цвет ранга — тот же, что у рамки плитки и строки ранга в записи; рядовой — без своего цвета. */
const RANK_COLORS: Record<EnemyDef['rank'], string | undefined> = { normal: undefined, elite: '#b388ff', boss: '#ff6b6b' };

/** Подсказка плитки альбома: имя цветом ранга, ранг и роль под именем; не встреченный — замок и когда откроется. */
function tileTip(def: EnemyDef, open: boolean): TipFn {
  if (!open) return paramTip('lock', 'Ещё не встречен', 'Запись откроется, когда этот враг появится в бою — сам, по призыву или отделившись от другого');
  return paramTip(null, def.name, undefined, {
    color: RANK_COLORS[def.rank],
    sub: [RANK_NAMES[def.rank], def.role ? `${ROLE_INFO[def.role].icon} ${ROLE_INFO[def.role].name}` : null, locationDef(def.location).name],
    action: 'Клик — открыть запись',
  });
}

/** В альбоме вся шкала уменьшена пропорционально, стопы стоят на нижнем краю слота. */
function portrait(def: EnemyDef, box: number, cls = ''): HTMLElement {
  const size = enemySize(def, box / 200);
  const sprite = spriteImg(def.sprite, def.id, size.px, cls);
  sprite.style.marginTop = `${-size.top}px`;
  sprite.style.marginBottom = `${-size.foot}px`;
  return h('div', { style: `width:${box}px;height:${box}px;display:flex;align-items:flex-end;justify-content:center;flex:none` }, sprite);
}

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
      tip: tileTip(def, open),
      onclick: () => app.bestiarySelect(def.id),
    },
    portrait(def, 48, open ? '' : 'silhouette'),
    h('div', { class: 'beast-tile-name' }, open ? def.name : '???'),
  );
}

/**
 * Числа в альбоме — как в первом акте (v0.36, решение пользователя: локации ротируются, «родных» актов нет):
 * записи врага приводятся к акту 1 тем же `enemyScale`, что и в бою, без статусов.
 */
function firstActScale(def: EnemyDef): ActionScale {
  const sc = enemyScale(locationDef(def.location).tier, 0, def.rank);
  return { hpMult: sc.hp, dmgMult: sc.dmg, blockMult: sc.block, strength: 0, weak: false };
}

/** Строка приёма: иконка вида, название и текст эффектов — те же, что в подсказке намерения в бою, числами первого акта. */
function actionRow(def: EnemyDef, a: { name: string; effects: EnemyDef['actions'][number]['effects'] }, note?: string): HTMLElement {
  const info = describeAction(def, a, firstActScale(def));
  const text = info.text.startsWith(`${a.name}: `) ? info.text.slice(a.name.length + 2) : '';
  return h(
    'div',
    { class: 'beast-action' },
    h('span', { class: `beast-action-icon intent-${info.kind}` }, info.icon),
    h('span', { class: 'beast-action-name' }, a.name),
    h('span', { class: 'beast-action-text dim' }, [text, note].filter(Boolean).join(' · ') || 'без эффекта'),
  );
}

/**
 * Как враг выбирает приёмы: рядовые и элиты — сначала реакции на состояние боя (v0.46), иначе по кругу;
 * замах подписан тем, что прилетит следом; боссы — по правилам с условиями и перезарядками.
 */
function patternLine(def: EnemyDef): HTMLElement {
  const name = (id: string) => def.actions.find((a) => a.id === id)?.name ?? id;
  if (def.ai.type === 'boss') {
    return h('div', { class: 'beast-pattern' }, h('span', { class: 'dim' }, 'Босс: '), 'выбирает приём по правилам — с условиями, перезарядкой и связками, а не по кругу.');
  }
  const cycle = def.ai.order.map((id) => {
    const next = def.actions.find((a) => a.id === id)?.next;
    return next ? `${name(id)} ⇒ ${name(next)}` : name(id);
  });
  const rules = def.ai.type === 'priority' ? def.ai.rules : [];
  return h(
    'div',
    { class: 'beast-pattern' },
    ...rules.map((r) => h('div', null, h('span', { class: 'dim' }, 'Если '), `${r.hint ?? 'условие'}: `, name(r.action), r.maxUses === 1 ? h('span', { class: 'dim' }, ' (раз за бой)') : null)),
    h('div', null, h('span', { class: 'dim' }, rules.length ? 'Иначе по кругу: ' : 'По кругу: '), cycle.join(' → ')),
  );
}

/** Роль и правило позиции (v0.46). */
function roleLine(def: EnemyDef): HTMLElement | null {
  if (!def.role) return null;
  const info = ROLE_INFO[def.role];
  return h('div', { class: 'beast-role' }, h('span', { class: `role-mark role-${def.role}` }, info.icon), h('span', null, info.name), h('span', { class: 'dim' }, ` — ${info.rule}`));
}

function detail(def: EnemyDef, open: boolean): HTMLElement {
  const loc = locationDef(def.location);
  if (!open) {
    return h(
      'div',
      { class: 'beast-detail' },
      h('div', { class: 'beast-head' }, portrait(def, 96, 'silhouette'), h('div', { class: 'beast-title' }, h('div', { class: 'beast-name' }, '???'), h('div', { class: 'beast-rank dim' }, `${RANK_NAMES[def.rank]} · ${loc.name}`))),
      h('div', { class: 'beast-empty dim' }, 'Запись откроется, когда этот враг появится в бою — сам, по призыву или отделившись от другого.'),
    );
  }
  const reactions = new Set(def.ai.type === 'priority' ? def.ai.rules.map((r) => r.action) : []);
  const followUps = new Set(def.actions.map((a) => a.next).filter(Boolean));
  const conditional = (a: EnemyDef['actions'][number]) =>
    followUps.has(a.id) ? 'после замаха' : reactions.has(a.id) && !(def.ai.type !== 'boss' && def.ai.order.includes(a.id)) ? 'реакция' : a.condition ? 'по условию' : undefined;
  return h(
    'div',
    { class: 'beast-detail' },
    h(
      'div',
      { class: 'beast-head' },
      portrait(def, 96),
      h(
        'div',
        { class: 'beast-title' },
        h('div', { class: 'beast-name' }, def.name),
        h('div', { class: `beast-rank rank-${def.rank}` }, `${RANK_NAMES[def.rank]} · ${loc.name}`),
        h('div', { class: 'beast-hp' }, h('span', { class: 'dim' }, 'HP '), `${Math.round(def.hp * firstActScale(def).hpMult)}`),
      ),
    ),
    roleLine(def),
    h('h3', null, 'Приёмы'),
    h('div', { class: 'beast-actions' }, ...def.actions.map((a) => actionRow(def, a, conditional(a)))),
    patternLine(def),
    def.phase2 ? h('h3', null, `Вторая фаза — при HP ниже ${Math.round(def.phase2.atHp * 100)} %`) : null,
    def.phase2 ? h('div', { class: 'beast-actions' }, actionRow(def, def.phase2, 'сразу, меняет набор приёмов'), actionRow(def, { name: 'Ход перехода', effects: def.phase2.guard }, 'вместо атаки')) : null,
    def.onDeath ? h('h3', null, 'При смерти') : null,
    def.onDeath ? h('div', { class: 'beast-actions' }, actionRow(def, def.onDeath)) : null,
    h('div', { class: 'beast-note dim' }, 'Числа — для первого акта; во втором и третьем враг толще и бьёт сильнее.'),
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
      { class: `small beast-tab ${l.id === loc ? 'selected' : ''}`, tip: paramTip(null, l.name, l.desc, { aside: `${open}/${own.length}`, sub: ['локация'] }) },
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
