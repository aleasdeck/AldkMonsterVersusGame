import { button, h } from '../dom';
import { heroDef } from '../../data/heroes';
import { enemyDef } from '../../data/enemies';
import { artifactCostText, artifactDef } from '../../data/artifacts';
import { ROOM_NAMES, ROOMS_PER_LOCATION } from '../../data/locations';
import { canUseAction, computeIntent, previewAttack, rangeText } from '../../engine/combat';
import { goldReward } from '../../engine/loot';
import { currentLocation, currentRoomKind } from '../../engine/run';
import type { AllyState, Combatant, EnemyState, PlayerAction } from '../../engine/types';
import { bar, coin, segBar, statusIcons } from '../components';
import { spriteImg, spriteSize } from '../sprites';
import { statusIcon } from '../icons';
import { backgroundStyle } from '../backgrounds';
import type { App } from '../app';

/** Блок и статусы — над головой бойца. */
function badges(c: Combatant): HTMLElement {
  return h('div', { class: 'badges' }, c.block > 0 ? h('span', { class: 'block-badge' }, `⛨ ${c.block}`) : null, statusIcons(c));
}

function enemyView(app: App, e: EnemyState): HTMLElement {
  const def = enemyDef(e.defId);
  const intent = computeIntent(e);
  const size = spriteSize(def.sprite);
  const px = size * (size >= 20 ? 5 : def.rank === 'boss' ? 7 : def.rank === 'elite' ? 6 : 5);
  const selected = app.currentTarget() === e.uid;
  return h(
    'div',
    {
      class: `enemy rank-${def.rank} ${selected ? 'selected' : ''}`,
      'data-uid': e.uid,
      onclick: () => app.selectTarget(e.uid),
    },
    h(
      'div',
      { class: `intent intent-${intent.kind} ${intent.stunned ? 'stunned' : ''}`, title: intent.text },
      h('div', { class: 'intent-main' }, ...(intent.stunned ? [statusIcon('stun', 20), ' оглушён'] : [`${intent.icon} ${intent.label}`.trim()])),
      h('div', { class: 'intent-name' }, intent.name),
    ),
    badges(e),
    h('div', { class: 'sprite-wrap' }, spriteImg(def.sprite, def.id, px)),
    h('div', { class: 'name' }, e.name),
    bar('hp', e.hp, e.maxHp),
  );
}

function allyView(a: AllyState): HTMLElement {
  const def = enemyDef(a.defId);
  return h(
    'div',
    { class: 'ally', 'data-uid': a.uid },
    badges(a),
    h('div', { class: 'sprite-wrap' }, spriteImg(def.sprite, def.id, spriteSize(def.sprite) * 4)),
    h('div', { class: 'name' }, a.name),
    bar('hp', a.hp, a.maxHp),
  );
}

interface CooldownView {
  left: number;
  total: number;
}

function actionButton(
  label: string,
  value: string,
  cost: string,
  err: string | null,
  busy: boolean,
  title: string,
  onclick: () => void,
  cooldown?: CooldownView,
): HTMLElement {
  const pct = cooldown ? Math.round((cooldown.left / Math.max(1, cooldown.total)) * 100) : 0;
  return h(
    'button',
    {
      class: `btn action ${err || busy ? 'off' : ''} ${cooldown ? 'cooling' : ''}`,
      disabled: !!err || busy,
      title: err ? `${title}\n— ${err}` : title,
      onclick,
    },
    cooldown ? h('div', { class: 'cd-fill', style: `height:${pct}%` }) : null,
    cooldown ? h('div', { class: 'cd-num' }, `${cooldown.left}`) : null,
    h('div', { class: 'action-label' }, label),
    h('div', { class: 'action-value' }, value),
    h('div', { class: 'action-cost' }, cost),
  );
}

function actionBar(app: App): HTMLElement {
  const b = app.run!.battle!;
  const target = app.currentTarget();
  const busy = app.busy || b.phase !== 'player';
  const buttons: HTMLElement[] = [];

  const atk: PlayerAction = { type: 'attack', target };
  buttons.push(
    actionButton(
      '⚔ Ударить',
      `${rangeText(previewAttack(b))} урона`,
      '1 STA',
      canUseAction(b, atk),
      busy,
      `Базовая атака: случайный урон из разброса оружия + Сила.
Каждая следующая атака в этом ходу бьёт на ${Math.round((1 - b.hero.stats.fatigue) * 100)} % слабее (сделано: ${b.hero.attacks})`,
      () => app.battleAction(atk),
    ),
  );
  const def: PlayerAction = { type: 'defend' };
  buttons.push(
    actionButton('⛨ Защититься', `+${b.hero.stats.def + b.hero.stats.defendBonus} блока`, '1 STA', canUseAction(b, def), busy, 'Блок до начала следующего хода', () =>
      app.battleAction(def),
    ),
  );
  for (const inst of b.hero.artifacts) {
    const ad = artifactDef(inst.id);
    if (ad.kind !== 'active') continue;
    const action: PlayerAction = { type: 'artifact', artifactId: ad.id, target };
    const cd = b.hero.cooldowns[ad.id] ?? 0;
    const effects = ad.effects?.(inst.tier) ?? [];
    const atkEff = effects.find((e) => e.type === 'attack');
    let value = ad.describe(inst.tier);
    if (atkEff && atkEff.type === 'attack') {
      const extra = effects.some((e) => e.type === 'status') ? ' + эффект' : '';
      const r = previewAttack(b, atkEff.bonus, atkEff.mult);
      const range = atkEff.sureCrit ? { min: r.min * 2, max: r.max * 2 } : r;
      value = `${rangeText(range)} урона${atkEff.target === 'allEnemies' ? ' всем' : ''}${atkEff.sureCrit ? ' (крит)' : ''}${extra}`;
    }
    const total = ad.cooldown?.(inst.tier) ?? 0;
    buttons.push(
      actionButton(
        `${ad.glyph} ${ad.name}`,
        value,
        artifactCostText(ad),
        canUseAction(b, action),
        busy,
        `${ad.name}, тир ${inst.tier}\n${ad.describe(inst.tier)}${total ? `\nПерезарядка: ${total} хода(ов)` : ''}`,
        () => app.battleAction(action),
        cd > 0 ? { left: cd, total: Math.max(total, cd) } : undefined,
      ),
    );
  }
  return h(
    'div',
    { class: 'actions' },
    h('div', { class: 'action-list' }, ...buttons),
    button('Конец хода ▶', () => app.endTurn(), { class: 'primary end-turn', disabled: busy }),
  );
}

export function battleScreen(app: App): HTMLElement {
  const run = app.run!;
  const b = run.battle!;
  const def = heroDef(run.hero.defId);
  const loc = currentLocation(run);

  const top = h(
    'div',
    { class: 'topbar' },
    h('span', null, `${loc.name} · комната ${run.roomIndex + 1}/${ROOMS_PER_LOCATION} · ${ROOM_NAMES[currentRoomKind(run)]}`),
    h('span', { class: 'turn' }, b.phase === 'enemy' ? 'Ход врагов…' : `Ход ${b.turn}`),
    h('span', { class: 'dim' }, `сид ${run.seed}`),
  );

  const heroZone = h(
    'div',
    { class: 'hero-zone' },
    badges(b.hero),
    h('div', { class: 'sprite-wrap' }, spriteImg(def.sprite, def.id, 112, 'bob')),
    h('div', { class: 'name' }, def.name),
    bar('hp', b.hero.hp, b.hero.maxHp, 'HP'),
    segBar('sta', b.hero.sta, b.hero.maxSta),
    b.hero.maxMp > 0 ? segBar('mp', b.hero.mp, b.hero.maxMp) : null,
  );

  const allyZone = h('div', { class: 'ally-zone' }, ...b.allies.map(allyView));
  const enemyZone = h('div', { class: 'enemy-zone' }, ...b.enemies.map((e) => enemyView(app, e)));
  const field = h('div', { class: 'field', style: backgroundStyle(loc.id, 0.3, 'wide') }, heroZone, allyZone, enemyZone);

  // Лог спрятан за узкой кнопкой справа: раскрытый занимает всю нижнюю панель вместо действий и кнопки конца хода.
  const logToggle = button(app.logOpen ? '✕ Закрыть' : 'Лог боя', () => app.toggleLog(), {
    class: `log-toggle ${app.logOpen ? 'open' : ''}`,
    title: app.logOpen ? 'Вернуть действия' : 'Показать лог боя',
  });
  let bottom: HTMLElement;
  if (app.logOpen) {
    const logEl = h('div', { class: 'log' }, ...b.log.map((l) => h('div', { class: l.startsWith('—') ? 'log-turn' : '' }, l)));
    // Прокрутка к последним записям — после вставки в документ, до этого scrollHeight равен нулю.
    requestAnimationFrame(() => {
      logEl.scrollTop = logEl.scrollHeight;
    });
    bottom = h('div', { class: 'bottom' }, logEl, logToggle);
  } else bottom = h('div', { class: 'bottom' }, actionBar(app), logToggle);

  const screen = h('div', { class: 'screen battle' }, top, field, bottom);

  if (b.phase === 'won' || b.phase === 'lost') {
    const won = b.phase === 'won';
    screen.appendChild(
      h(
        'div',
        { class: 'overlay' },
        h(
          'div',
          { class: `panel result ${won ? 'won' : 'lost'}` },
          h('h2', null, won ? 'Победа!' : 'Герой пал'),
          h('p', { class: 'dim' }, ...(won ? [`Бой занял ${b.turn} ход(ов). Добыча: +${goldReward(currentRoomKind(run))} `, coin(), ' золота.'] : ['Забег окончен.'])),
          button(won ? 'Забрать награду' : 'К итогам', () => app.finishBattle(), { class: 'primary big' }),
        ),
      ),
    );
  }
  return screen;
}
