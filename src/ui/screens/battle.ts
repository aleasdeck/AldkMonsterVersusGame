import { button, h } from '../dom';
import { heroDef } from '../../data/heroes';
import { enemyDef } from '../../data/enemies';
import { artifactCostText, artifactDef } from '../../data/artifacts';
import { canUseAction, computeIntent, defendBlock, getStatus, previewAttack, rangeText } from '../../engine/combat';
import { goldReward } from '../../engine/loot';
import { currentLocation, currentRoomKind } from '../../engine/run';
import type { AllyState, Combatant, EnemyState, PlayerAction } from '../../engine/types';
import { bar, coin, statusIcons } from '../components';
import { spriteImg, spriteSize } from '../sprites';
import { statusIcon } from '../icons';
import { backgroundStyle } from '../backgrounds';
import { runFrame } from '../frame';
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
      { class: `intent intent-${intent.kind} ${intent.stunned ? 'stunned' : ''}`, tip: intent.text },
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
      tip: err ? `${title}\n— ${err}` : title,
      onclick,
    },
    cooldown ? h('div', { class: 'cd-fill', style: `height:${pct}%` }) : null,
    cooldown ? h('div', { class: 'cd-num' }, `${cooldown.left}`) : null,
    h('div', { class: 'action-label' }, label),
    h('div', { class: 'action-value' }, value),
    h('div', { class: 'action-cost' }, cost),
  );
}

function actionList(app: App): HTMLElement {
  const b = app.run!.battle!;
  const target = app.currentTarget();
  const busy = app.busy || b.phase !== 'player';
  const buttons: HTMLElement[] = [];

  // Из скрытности любая атака — удар в спину: гарантированный крит.
  const stealthed = !!getStatus(b.hero, 'stealth');
  const critX = (r: { min: number; max: number }) => ({ min: r.min * b.hero.stats.critMult, max: r.max * b.hero.stats.critMult });
  const atk: PlayerAction = { type: 'attack', target };
  buttons.push(
    actionButton(
      stealthed ? '⚔ Удар в спину' : '⚔ Ударить',
      `${rangeText(stealthed ? critX(previewAttack(b)) : previewAttack(b))} урона${stealthed ? ' (крит)' : ''}`,
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
    actionButton('⛨ Защититься', `+${defendBlock(b.hero.stats)} блока`, '1 STA', canUseAction(b, def), busy, 'Блок до начала следующего хода: 80 % от Защиты, округление вверх', () =>
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
      const crit = atkEff.sureCrit || stealthed;
      value = `${rangeText(crit ? critX(r) : r)} урона${atkEff.target === 'allEnemies' ? ' всем' : ''}${crit ? ' (крит)' : ''}${extra}`;
    }
    const total = ad.cooldown?.(inst.tier) ?? 0;
    buttons.push(
      actionButton(
        `${ad.glyph} ${ad.name}`,
        value,
        artifactCostText(ad, inst.tier),
        canUseAction(b, action),
        busy,
        `${ad.name}, тир ${inst.tier}\n${ad.describe(inst.tier)}${total ? `\nПерезарядка: ${total} хода(ов)` : ''}`,
        () => app.battleAction(action),
        cd > 0 ? { left: cd, total: Math.max(total, cd) } : undefined,
      ),
    );
  }
  return h('div', { class: 'action-list' }, ...buttons);
}

export function battleScreen(app: App): HTMLElement {
  const run = app.run!;
  const b = run.battle!;
  const def = heroDef(run.hero.defId);
  const loc = currentLocation(run);

  // Полоски героя живут в консоли; над героем в поле — только блок и статусы.
  const heroZone = h(
    'div',
    { class: 'hero-zone' },
    badges(b.hero),
    h('div', { class: 'sprite-wrap' }, spriteImg(def.sprite, def.id, 128, 'bob')),
    h('div', { class: 'name' }, def.name),
  );

  const allyZone = h('div', { class: 'ally-zone' }, ...b.allies.map(allyView));
  const enemyZone = h('div', { class: 'enemy-zone' }, ...b.enemies.map((e) => enemyView(app, e)));
  const field = h('div', { class: 'field', style: backgroundStyle(loc.id, 0.3, 'wide') }, heroZone, allyZone, enemyZone);

  const over = b.phase === 'won' || b.phase === 'lost';
  const won = b.phase === 'won';
  const finishLabel = won ? 'Забрать награду' : 'К итогам';
  const busy = app.busy || b.phase !== 'player';

  let mid: HTMLElement;
  if (app.logOpen) {
    const logEl = h('div', { class: 'log' }, ...b.log.map((l) => h('div', { class: l.startsWith('—') ? 'log-turn' : '' }, l)));
    // Прокрутка к последним записям — после вставки в документ, до этого scrollHeight равен нулю.
    requestAnimationFrame(() => {
      logEl.scrollTop = logEl.scrollHeight;
    });
    mid = logEl;
  } else mid = actionList(app);

  const right = over
    ? button(finishLabel, () => app.finishBattle(), { class: 'primary end-turn' })
    : button('Конец хода ▶', () => app.endTurn(), { class: 'primary end-turn', disabled: busy, tip: 'Передать ход врагам (Space)' });

  const result =
    over && !app.logOpen
      ? h(
          'div',
          { class: 'overlay' },
          h(
            'div',
            { class: `panel result ${won ? 'won' : 'lost'}` },
            h('h2', null, won ? 'Победа!' : 'Герой пал'),
            h('p', { class: 'dim' }, ...(won ? [`Бой занял ${b.turn} ход(ов). Добыча: +${goldReward(currentRoomKind(run))} `, coin(), ' золота.'] : ['Забег окончен.'])),
            h(
              'div',
              { class: 'row' },
              button(finishLabel, () => app.finishBattle(), { class: 'primary big' }),
              button('Лог боя', () => app.toggleLog(), { tip: 'Перечитать ход боя, плашка итога вернётся по «Закрыть»' }),
            ),
          ),
        )
      : null;

  return runFrame(app, { cls: 'battle', center: field, mid, right, log: true, overlays: [result] });
}
