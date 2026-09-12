import { button, h, type Child } from '../dom';
import { heroDef } from '../../data/heroes';
import { enemyDef } from '../../data/enemies';
import { artifactCostText, artifactDef } from '../../data/artifacts';
import { INTENT_ICON, canUseAction, computeAllyIntent, computeIntent, defendBlock, fatigueMult, isHidden, previewAttack, rangeText, type DamageRange, type IntentInfo } from '../../engine/combat';
import { goldReward } from '../../engine/loot';
import { currentLocation, currentRoomKind } from '../../engine/run';
import type { AllyState, ArtTier, ArtifactDef, BattleState, Combatant, Effect, EnemyState, PlayerAction } from '../../engine/types';
import { MAX_ALLIES } from '../../engine/types';
import { bar, coin, statusIcons } from '../components';
import { spriteImg, spriteSize } from '../sprites';
import { statusIcon } from '../icons';
import { backgroundStyle } from '../backgrounds';
import { runFrame } from '../frame';
import { bindPreview, defaultReadout, type PreviewSpec } from '../preview';
import type { App } from '../app';
import { runLogBody } from './runLog';

/** Блок и статусы — над головой бойца. У врагов блок живёт на полоске HP, здесь только статусы. */
function badges(c: Combatant, withBlock: boolean, ...extra: Child[]): HTMLElement {
  return h('div', { class: 'badges' }, withBlock && c.block > 0 ? h('span', { class: 'block-badge' }, `⛨ ${c.block}`) : null, ...extra, statusIcons(c));
}

/**
 * Усталость героя — рядом с блоком и статусами, пока в этом ходу были атаки: число атак в ходу, процент от полного
 * урона — в подсказке. Статусом движка она не является (это счётчик атак), поэтому бейдж свой.
 */
function fatigueBadge(b: BattleState): HTMLElement | null {
  const hero = b.hero;
  if (hero.attacks === 0 || hero.stats.fatigue >= 1) return null;
  const pct = Math.round(fatigueMult(b) * 100);
  const step = Math.round((1 - hero.stats.fatigue) * 100);
  return h(
    'span',
    {
      class: 'fatigue-badge',
      tip: `Атак в этом ходу: ${hero.attacks}. Каждая следующая на ${step} % слабее предыдущей: удары и физические приёмы сейчас бьют на ${pct} % от полного урона. Заклинания, раны и шипы усталость не трогает; на новом ходу счётчик обнуляется`,
      tipTitle: `Усталость: ${pct} % урона`,
    },
    statusIcon('exhaust', 16),
    `${hero.attacks}`,
  );
}

/**
 * Хвост пилюли: остальные виды эффектов приёма мелкими иконками — дебаф иконкой самого статуса, чтобы «⚔ 7» с Кровотечением
 * или Изнурением читался без подсказки; бафф, лечение, призыв — иконкой вида.
 */
function intentExtras(intent: IntentInfo): Child[] {
  const out: Child[] = [];
  for (const kind of intent.kinds.slice(1)) {
    if (kind === 'debuff') {
      for (const id of intent.statuses) out.push(h('span', { class: 'pill-extra intent-debuff' }, statusIcon(id, 16)));
      if (intent.statuses.length === 0) out.push(h('span', { class: 'pill-extra intent-debuff' }, INTENT_ICON.debuff));
    } else out.push(h('span', { class: `pill-extra intent-${kind}` }, INTENT_ICON[kind]));
  }
  return out;
}

/** Пилюля намерения: иконка и число, цвет по главному эффекту, остальные эффекты хвостом; название, расшифровка и цель — в подсказке. */
function intentPill(b: BattleState, e: EnemyState): HTMLElement {
  const intent = computeIntent(e);
  if (intent.stunned) return h('div', { class: 'pill intent-stunned', tip: 'Пропустит следующий ход', tipTitle: 'Оглушён' }, statusIcon('stun', 18), 'оглушён');
  // Враги бьют первого союзника раньше героя.
  const victim = intent.kind === 'attack' ? `\nЦель: ${b.allies[0]?.name ?? 'герой'}` : '';
  return h(
    'div',
    { class: `pill intent-${intent.kind}`, tip: `${intent.text}${victim}`, tipTitle: intent.name },
    h('span', { class: 'pill-icon' }, intent.icon),
    intent.label ? h('span', { class: 'pill-label' }, intent.label) : null,
    ...intentExtras(intent),
  );
}

function enemyView(app: App, e: EnemyState): HTMLElement {
  const def = enemyDef(e.defId);
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
    intentPill(app.run!.battle!, e),
    badges(e, false),
    h('div', { class: 'sprite-wrap' }, spriteImg(def.sprite, def.id, px)),
    h('div', { class: 'name' }, e.name),
    bar('hp', e.hp, e.maxHp, '', e.block > 0 ? `HP ${e.hp}/${e.maxHp}, блок ${e.block}: первые ${e.block} урона удара или заклинания уйдут в него` : `HP ${e.hp}/${e.maxHp}`, e.block),
  );
}

/**
 * Союзник: зелёная пилюля намерения в той же форме, что у врага («⚔ 5 → К»), метка «под ударом»
 * у того, кого враги бьют первым, спрайт меньше вражеского.
 */
function allyView(b: BattleState, a: AllyState, underFire: boolean): HTMLElement {
  const def = enemyDef(a.defId);
  const intent = computeAllyIntent(b, a);
  const tail = intent.target ? ` → ${intent.target[0]}` : '';
  return h(
    'div',
    { class: 'ally', 'data-uid': a.uid },
    h('div', { class: 'pill pill-ally', tip: `${intent.text}\nХодит сам после вашего хода`, tipTitle: `${a.name}: ${intent.name}` }, h('span', { class: 'pill-icon' }, intent.icon), `${intent.label}${tail}`.trim()),
    h('div', { class: 'badges' }, underFire ? h('span', { class: 'under-fire', tip: 'Враги атакуют этого союзника раньше героя' }, '◀ под ударом') : null, a.block > 0 ? h('span', { class: 'block-badge' }, `⛨ ${a.block}`) : null, statusIcons(a)),
    h('div', { class: 'sprite-wrap' }, spriteImg(def.sprite, def.id, spriteSize(def.sprite) * 4)),
    h('div', { class: 'name' }, a.name),
    bar('hp', a.hp, a.maxHp, '', '', a.block),
  );
}

/** Пунктирный силуэт свободного места рядом с героем — пока есть призывающий артефакт и союзников меньше двух. */
function summonGhost(): HTMLElement {
  return h('div', { class: 'ally ghost', tip: 'Свободное место для союзника: призыв поставит его сюда' }, h('div', { class: 'ghost-box' }, '☍'), h('div', { class: 'name dim' }, 'место'));
}

// ─── Плитки приёмов ─────────────────────────────────────────────────────────

interface TileSpec {
  glyph: string;
  name: string;
  /** Крупное число или короткий эффект. */
  value: Child[];
  cost: { kind: 'sta' | 'mp' | 'none'; text: string };
  err: string | null;
  cooldown?: { left: number; total: number };
  preview: () => PreviewSpec;
  onclick: () => void;
}

/**
 * Плитка 78 px: иконка, короткое имя, крупное число, цена ярлыком в углу. Недоступная — затемнена, но без атрибута
 * disabled: иначе браузер не шлёт ей наведение, а ридаут должен показать причину.
 */
function tile(app: App, spec: TileSpec, busy: boolean, index: number): HTMLElement {
  const off = !!spec.err || busy;
  const cd = spec.cooldown;
  const pct = cd ? Math.round((cd.left / Math.max(1, cd.total)) * 100) : 0;
  const el = h(
    'button',
    {
      class: `tile ${off ? 'off' : ''} ${cd ? 'cooling' : ''}`,
      'aria-disabled': off ? 'true' : null,
      onclick: () => {
        if (!off) spec.onclick();
      },
    },
    cd ? h('div', { class: 'cd-fill', style: `height:${pct}%` }) : null,
    cd ? h('div', { class: 'cd-num' }, `${cd.left}`) : null,
    spec.cost.kind !== 'none' ? h('span', { class: `tile-cost cost-${spec.cost.kind}` }, spec.cost.text) : null,
    index < 9 ? h('span', { class: 'tile-key' }, `${index + 1}`) : null,
    h('div', { class: 'tile-glyph' }, spec.glyph),
    h('div', { class: 'tile-value' }, ...spec.value),
    h('div', { class: 'tile-name' }, spec.name),
  );
  return bindPreview(app, el, () => ({ ...spec.preview(), err: busy ? 'Ход врагов' : spec.err }));
}

/** Короткая цена для ярлыка: «1», «2», «вся» и её ресурс. */
function costBadge(def: ArtifactDef, tier: ArtTier): TileSpec['cost'] {
  const c = typeof def.cost === 'function' ? def.cost(tier) : def.cost;
  if (!c) return { kind: 'none', text: '' };
  if (c.sta === 'all') return { kind: 'sta', text: 'вся' };
  if (c.sta) return { kind: 'sta', text: `${c.sta}` };
  if (c.mp) return { kind: 'mp', text: `${c.mp}` };
  return { kind: 'none', text: '' };
}

/** Крупное число плитки по первому значимому эффекту приёма. */
function effectValue(effects: Effect[], range: DamageRange | null): Child[] {
  const atk = effects.find((e) => e.type === 'attack');
  if (atk && atk.type === 'attack' && range) return [rangeText(range), atk.target === 'allEnemies' ? h('small', null, 'всем') : null];
  for (const e of effects) {
    switch (e.type) {
      case 'spell':
        return [`${e.amount}`, e.target === 'allEnemies' ? h('small', null, 'всем') : null];
      case 'block':
        return [`+${e.amount}`, h('small', null, '⛨')];
      case 'blockStrike':
        return [range ? rangeText(range) : '0', h('small', null, `⛨×${e.mult}`)];
      case 'heal':
        return [`+${e.amount}`, h('small', null, 'HP')];
      case 'gainSta':
        return [`+${e.amount}`, h('small', null, 'STA')];
      case 'gainMp':
        return [`+${e.amount}`, h('small', null, 'MP')];
      case 'status':
        return [statusIcon(e.status, 18), e.value > 1 || e.status === 'strength' ? ` ${e.value}` : e.turns > 0 ? ` ${e.turns}х` : ''];
      case 'summon':
        return ['☍'];
      case 'cleanse':
        return ['✚'];
      default:
        continue;
    }
  }
  return ['—'];
}

function tiles(app: App): HTMLElement {
  const b = app.run!.battle!;
  const target = app.currentTarget();
  const busy = app.busy || b.phase !== 'player';
  const specs: TileSpec[] = [];

  // Из скрытности любая атака — удар в спину: гарантированный крит.
  const stealthed = isHidden(b.hero);
  const critX = (r: DamageRange) => ({ min: Math.floor((r.min * b.hero.stats.critDmg) / 100), max: Math.floor((r.max * b.hero.stats.critDmg) / 100) });
  const fatigue = Math.round((1 - b.hero.stats.fatigue) * 100);

  const atk: PlayerAction = { type: 'attack', target };
  const atkRange = stealthed ? critX(previewAttack(b)) : previewAttack(b);
  specs.push({
    glyph: '⚔',
    name: stealthed ? 'Удар в спину' : 'Ударить',
    value: [rangeText(atkRange)],
    cost: { kind: 'sta', text: '1' },
    err: canUseAction(b, atk),
    onclick: () => app.battleAction(atk),
    preview: () => ({
      title: stealthed ? 'Удар в спину' : 'Ударить',
      parts: ['1 STA', `${rangeText(atkRange)} урона${stealthed ? ' (крит)' : ''}`, `каждая следующая атака в ходу на ${fatigue} % слабее (сделано: ${b.hero.attacks})`],
      target,
      range: atkRange,
    }),
  });

  const def: PlayerAction = { type: 'defend' };
  const blk = defendBlock(b.hero.stats);
  specs.push({
    glyph: '⛨',
    name: 'Защита',
    value: [`+${blk}`],
    cost: { kind: 'sta', text: '1' },
    err: canUseAction(b, def),
    onclick: () => app.battleAction(def),
    preview: () => ({ title: 'Защититься', parts: ['1 STA', `+${blk} блока до начала следующего хода`, '80 % от Защиты, округление вверх, раз за ход'] }),
  });

  for (const inst of b.hero.artifacts) {
    const ad = artifactDef(inst.id);
    if (ad.kind !== 'active') continue;
    const action: PlayerAction = { type: 'artifact', artifactId: ad.id, target };
    const cd = b.hero.cooldowns[ad.id] ?? 0;
    const effects = ad.effects?.(inst.tier) ?? [];
    const atkEff = effects.find((e) => e.type === 'attack');
    const spellEff = effects.find((e) => e.type === 'spell');
    const ramEff = effects.find((e) => e.type === 'blockStrike');
    let range: DamageRange | null = null;
    let kind: 'hit' | 'spell' = 'hit';
    if (atkEff && atkEff.type === 'attack') {
      const r = previewAttack(b, atkEff.bonus, atkEff.mult);
      range = atkEff.sureCrit || stealthed ? critX(r) : r;
    } else if (ramEff && ramEff.type === 'blockStrike') {
      // Таран бьёт текущим блоком: без кубика, крита и усталости.
      const dmg = Math.floor(b.hero.block * ramEff.mult);
      range = { min: dmg, max: dmg };
    } else if (spellEff && spellEff.type === 'spell') {
      const dmg = spellEff.amount + b.hero.stats.spellPower;
      range = { min: dmg, max: dmg };
      kind = 'spell';
    }
    const total = ad.cooldown?.(inst.tier) ?? 0;
    const limit = ad.usesPerTurn?.(inst.tier) ?? 0;
    const err = canUseAction(b, action);
    specs.push({
      glyph: ad.glyph,
      name: ad.name,
      // При двух союзниках плитка призыва пишет причину прямо на себе, а не просто темнеет.
      value: err === 'Рядом нет места' ? [h('small', null, 'нет места')] : effectValue(effects, range),
      cost: costBadge(ad, inst.tier),
      err,
      cooldown: cd > 0 ? { left: cd, total: Math.max(total, cd) } : undefined,
      onclick: () => app.battleAction(action),
      preview: () => ({
        title: `${ad.name} · тир ${inst.tier}`,
        parts: [artifactCostText(ad, inst.tier), ad.describe(inst.tier), total ? `перезарядка ${total} х.` : '', limit ? `за ход: ${b.hero.uses[ad.id] ?? 0}/${limit}` : ''],
        target: range ? target : undefined,
        range: range ?? undefined,
        kind,
      }),
    });
  }

  // Семь плиток и меньше — один ряд 134 px; восемь и больше — два ряда по 62 px. Класс ставит рендер: число плиток известно здесь.
  const rows = specs.length >= 8 ? 2 : 1;
  return h('div', { class: `tiles rows-${rows}` }, ...specs.map((s, i) => tile(app, s, busy, i)));
}

export function battleScreen(app: App): HTMLElement {
  const run = app.run!;
  const b = run.battle!;
  const def = heroDef(run.hero.defId);
  const loc = currentLocation(run);

  // Полоски героя живут в консоли; над героем в поле — только блок и статусы. С союзниками герой ужимается до 104 px.
  const hasAllies = b.allies.length > 0;
  const heroZone = h(
    'div',
    { class: `hero-zone ${hasAllies ? 'narrow' : ''}` },
    badges(b.hero, true, fatigueBadge(b)),
    h('div', { class: 'sprite-wrap' }, spriteImg(def.sprite, def.id, hasAllies ? 104 : 128, 'bob')),
    h('div', { class: 'name' }, def.name),
  );

  const canSummon = b.hero.artifacts.some((inst) => artifactDef(inst.id).effects?.(inst.tier).some((e) => e.type === 'summon'));
  const enemiesAttack = b.enemies.some((e) => computeIntent(e).kind === 'attack');
  const ghosts = canSummon && b.phase !== 'won' && b.phase !== 'lost' ? Array.from({ length: MAX_ALLIES - b.allies.length }, summonGhost) : [];
  const allyZone = h('div', { class: 'ally-zone' }, ...b.allies.map((a, i) => allyView(b, a, i === 0 && enemiesAttack)), ...ghosts);
  const enemyZone = h('div', { class: 'enemy-zone' }, ...b.enemies.map((e) => enemyView(app, e)));
  // Худший случай — шесть бойцов: врагам оставляем по 140 px.
  const crowded = b.allies.length + b.enemies.length >= 5;
  // Слой анимаций поверх поля: снаряды, взмахи, облака и искры (fx.ts) живут в нём между перерисовками.
  const field = h('div', { class: `field ${crowded ? 'crowded' : ''}`, style: backgroundStyle(loc.id, 0.3, 'wide') }, heroZone, allyZone, enemyZone, h('div', { class: 'fx-layer' }));

  // Лог — выдвижная панель поверх поля, плитки при этом остаются на месте.
  if (app.logOpen) {
    const logEl = h('div', { class: 'log' }, ...runLogBody(run));
    // Прокрутка к последним записям — после вставки в документ, до этого scrollHeight равен нулю.
    requestAnimationFrame(() => {
      logEl.scrollTop = logEl.scrollHeight;
    });
    field.appendChild(h('div', { class: 'log-drawer' }, h('div', { class: 'log-head' }, 'Лог боя', button('✕', () => app.toggleLog(), { class: 'small' })), logEl));
  }

  const over = b.phase === 'won' || b.phase === 'lost';
  const won = b.phase === 'won';
  const finishLabel = won ? 'Забрать награду' : 'К итогам';
  const busy = app.busy || b.phase !== 'player';

  const top = h('div', { class: 'readout' }, ...defaultReadout(app));
  const mid = h('div', { class: 'c-battle' }, tiles(app));

  const right = over
    ? button(finishLabel, () => app.finishBattle(), { class: 'primary end-turn' })
    : button(h('span', null, 'Конец', h('br'), 'хода'), () => app.endTurn(), { class: 'primary end-turn', disabled: busy, tip: 'Передать ход врагам (Space)' });

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

  return runFrame(app, { cls: 'battle', center: field, top, mid, right, log: true, overlays: [result] });
}
