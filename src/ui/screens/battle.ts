import { button, h, type Child } from '../dom';
import { heroDef } from '../../data/heroes';
import { enemyDef } from '../../data/enemies';
import { artifactCostText, artifactDef } from '../../data/artifacts';
import { SWEEP_MULT } from '../../data/gear';
import { INTENT_ICON, actionReach, canUseAction, computeAllyIntent, computeIntent, defendBlock, fatigueMult, findEnemy, finisherPer, isHidden, previewAttack, rangeText, reachableEnemies, remainingDot, sureCritOn, turnsToFlee, type ActionMark, type DamageRange, type IntentInfo } from '../../engine/combat';
import { GNOME_BOUNTY, goldReward } from '../../engine/loot';
import { currentLocation, currentRoomKind } from '../../engine/run';
import type { AllyState, ArtTier, ArtifactDef, BattleState, Combatant, Effect, EnemyState, PlayerAction, WeaponReach } from '../../engine/types';
import { MAX_ALLIES } from '../../engine/types';
import { bar, coin, statusIcons } from '../components';
import { spriteImg, spriteSize } from '../sprites';
import { heroSprite } from '../heroSprite';
import { enemySprite, hasEnemySheet } from '../enemySprite';
import { markIcon, statusIcon } from '../icons';
import { backgroundStyle } from '../backgrounds';
import { tintVar } from '../tint';
import { runFrame } from '../frame';
import { bindPreview, defaultReadout, type PreviewSpec } from '../preview';
import type { App } from '../app';
import { runLogBody } from './runLog';

/**
 * Блок и статусы — над головой бойца. У врагов блок живёт на полоске HP, здесь только статусы.
 * `enemy` — сам враг: нужен «Предсмертию», чтобы подсказка расписала его эффект при смерти.
 */
function badges(c: Combatant, withBlock: boolean, enemy?: EnemyState, ...extra: Child[]): HTMLElement {
  return h('div', { class: 'badges' }, withBlock && c.block > 0 ? h('span', { class: 'block-badge' }, `⛨ ${c.block}`) : null, ...extra, statusIcons(c, enemy));
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

/** Что значит пометка удара: подсказка у иконки на пилюле. */
const MARK_TIPS: Record<ActionMark, { title: string; text: string }> = {
  pierce: { title: 'Сквозь блок', text: 'Удар не тратит блок героя и бьёт прямо по HP: щит от него не спасает' },
  drain: { title: 'Вампиризм', text: 'Враг вылечится на столько, сколько урона дошло до HP' },
};

/**
 * Хвост пилюли: сначала свойства самого удара (пробитие блока, вампиризм), потом остальные виды эффектов приёма мелкими иконками —
 * дебаф и бафф на себя иконкой самого статуса, чтобы «⚔ 7» с Кровотечением или «⛨ 12» с Шипами читались без подсказки;
 * лечение и призыв — иконкой вида.
 */
function intentExtras(intent: IntentInfo): Child[] {
  const out: Child[] = [];
  for (const mark of intent.marks) {
    const tip = MARK_TIPS[mark];
    out.push(h('span', { class: 'pill-extra intent-mark', tip: tip.text, tipTitle: tip.title }, markIcon(mark, 16)));
  }
  for (const kind of intent.kinds.slice(1)) {
    if (kind === 'debuff') {
      for (const id of intent.statuses) out.push(h('span', { class: 'pill-extra intent-debuff' }, statusIcon(id, 16)));
      if (intent.statuses.length === 0) out.push(h('span', { class: 'pill-extra intent-debuff' }, INTENT_ICON.debuff));
    } else if (kind === 'buff' && intent.selfStatuses.length) {
      // «Панцирь» = Блок 12 + Шипы 2: щит с числом уже в голове пилюли, шипы дорисовываем своей иконкой.
      for (const id of intent.selfStatuses) out.push(h('span', { class: 'pill-extra intent-buff' }, statusIcon(id, 16)));
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

/** Часики над вором: сколько ходов осталось до побега. Считает движок, у обычных врагов ничего не рисуется. */
function fleeTimer(e: EnemyState): HTMLElement | null {
  const left = turnsToFlee(e);
  if (left === null) return null;
  const word = left === 1 ? 'сбежит в этот ход' : `сбежит через ${left} ход(а)`;
  return h(
    'div',
    { class: `flee-timer ${left <= 1 ? 'urgent' : ''}`, tip: `${word} и унесёт всё срезанное. Убить нужно раньше`, tipTitle: 'Побег' },
    `⏳ ${left}`,
  );
}

/**
 * Враг в поле. Клик применяет выбранный приём (v0.26: сначала приём, потом цель); без выбранного приёма клик только
 * подсказывает. Рамка досягаемости ставится по выбранному приёму при отрисовке, наведение на плитку перекрашивает её временно.
 */
function enemyView(app: App, e: EnemyState): HTMLElement {
  const def = enemyDef(e.defId);
  const size = spriteSize(def.sprite);
  const px = hasEnemySheet(def.id) ? 144 : Math.round(size * (size >= 20 ? 5 : def.rank === 'boss' ? 7 : def.rank === 'elite' ? 6 : 5) * (def.spriteScale ?? 1));
  const targets = app.armedTargets();
  const cls = targets ? (targets.includes(e.uid) ? 'ok' : 'far') : '';
  const el = h(
    'div',
    {
      class: `enemy rank-${def.rank} ${cls} ${e.aura ? 'aura' : ''}`,
      style: e.aura ? `--aura:${e.aura}` : '',
      'data-uid': e.uid,
      onclick: () => app.applyArmed(e.uid),
    },
    intentPill(app.run!.battle!, e),
    fleeTimer(e),
    badges(e, false, e),
    h('div', { class: 'sprite-wrap' }, enemySprite(def.sprite, def.id, px, '', e)),
    h('div', { class: 'name' }, e.name),
    bar('hp', e.hp, e.maxHp, '', e.block > 0 ? `HP ${e.hp}/${e.maxHp}, блок ${e.block}: первые ${e.block} урона удара или заклинания уйдут в него` : `HP ${e.hp}/${e.maxHp}`, e.block),
  );
  return bindPreview(app, el, () => enemyPreview(app, e.uid));
}

/**
 * Ридаут при наведении на врага: с выбранным приёмом — сколько урона он получит (или почему не достать),
 * без приёма — его HP и блок с напоминанием выбрать приём.
 */
export function enemyPreview(app: App, uid: number): PreviewSpec {
  const b = app.run!.battle!;
  const spec = app.armedSpec();
  if (spec) return spec.preview(uid);
  const e = b.enemies.find((x) => x.uid === uid);
  if (!e) return { title: '', parts: [] };
  return { title: e.name, parts: [`${e.hp}/${e.maxHp} HP`, e.block > 0 ? `блок ${e.block}` : '', h('span', { class: 'dim' }, 'выберите приём, потом цель')] };
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

/**
 * Приём на плитке. Приёму с целью (`targeted`) клик по плитке только выбирает его — цель выбирается кликом по врагу;
 * приём на себя или по всем применяется сразу.
 */
export interface TileSpec {
  /** Ключ приёма: 'attack', 'defend' или id артефакта — по нему App помнит выбранный приём. */
  key: string;
  glyph: string;
  name: string;
  /** Крупное число или короткий эффект. */
  value: Child[];
  cost: { kind: 'sta' | 'mp' | 'none'; text: string };
  /** Причина недоступности приёма как такового: стамина, перезарядка, лимит; для приёма с целью — по лучшей из целей. */
  err: string | null;
  cooldown?: { left: number; total: number };
  targeted: boolean;
  /** Действие по цели; приёму без цели uid не важен. */
  action: (target: number) => PlayerAction;
  /** Кого приём достанет: рамка им при выборе и наведении. У приёма на себя пусто. */
  targets: number[];
  /** Ридаут: без цели — описание; с целью — ещё и «останется N HP» или причина, почему по ней нельзя. */
  preview: (target?: number) => PreviewSpec;
}

/**
 * Плитка 78 px: иконка, короткое имя, крупное число, цена ярлыком в углу. Недоступная — затемнена, но без атрибута
 * disabled: иначе браузер не шлёт ей наведение, а ридаут должен показать причину. Выбранная — с жёлтым ободом.
 */
function tile(app: App, spec: TileSpec, busy: boolean, index: number): HTMLElement {
  const off = !!spec.err || busy;
  const cd = spec.cooldown;
  const pct = cd ? Math.round((cd.left / Math.max(1, cd.total)) * 100) : 0;
  const armed = app.armed === spec.key;
  const first = app.run!.battle!.enemies[0]?.uid ?? -1;
  const el = h(
    'button',
    {
      class: `tile ${off ? 'off' : ''} ${cd ? 'cooling' : ''} ${armed ? 'armed' : ''}`,
      'aria-disabled': off ? 'true' : null,
      'aria-pressed': spec.targeted ? (armed ? 'true' : 'false') : null,
      onclick: () => {
        if (off) return;
        if (spec.targeted) app.arm(spec.key);
        else app.battleAction(spec.action(first));
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
      case 'pull':
        return ['⇤', h('small', null, 'в ряд')];
      case 'push':
        return ['⇥', h('small', null, 'назад')];
      case 'detonate':
        return [range ? rangeText(range) : '—', h('small', null, e.target === 'allEnemies' ? 'взрыв всем' : 'взрыв')];
      case 'spread':
        return ['☣', h('small', null, 'на всех')];
      case 'breakBlock':
        return [range ? rangeText(range) : '—', h('small', null, `⛨×${e.mult}`)];
      case 'finisher':
        return [range ? rangeText(range) : '—', h('small', null, `${e.pct} %×атаки`)];
      case 'chain':
        return [`${e.amount}`, h('small', null, 'вдогонку')];
      case 'enchant':
        return [statusIcon('enchant', 18), ` ${e.value}`];
      default:
        continue;
    }
  }
  return ['—'];
}

/** Слово о дальности для ридаута: «любая цель», «весь ряд», «первый в ряду». */
function reachWord(r: WeaponReach): string {
  return r === 'any' ? 'любая цель' : r === 'row' ? 'весь ряд' : 'первый в ряду';
}

/**
 * Все приёмы героя на этот момент боя: удар, защита и активные артефакты. Отсюда же App берёт выбранный приём,
 * его цели и предпросмотр по врагу.
 */
export function actionSpecs(app: App): TileSpec[] {
  const b = app.run!.battle!;
  const first = b.enemies[0]?.uid ?? -1;
  const specs: TileSpec[] = [];

  // Из скрытности любая атака — удар в спину: гарантированный крит.
  const stealthed = isHidden(b.hero);
  const critX = (r: DamageRange) => ({ min: Math.floor((r.min * b.hero.stats.critDmg) / 100), max: Math.floor((r.max * b.hero.stats.critDmg) / 100) });
  const fatigue = Math.round((1 - b.hero.stats.fatigue) * 100);
  const uids = (action: PlayerAction) => reachableEnemies(b, actionReach(b, action)).map((e) => e.uid);
  /** Причина недоступности плитки: приёму с целью — по лучшей из целей, чтобы «Только первый в ряду» не гасил плитку, когда достать можно хотя бы кого-то. */
  const tileErr = (action: (t: number) => PlayerAction, targeted: boolean): string | null => {
    if (!targeted) return canUseAction(b, action(first));
    let last: string | null = 'Нет цели';
    for (const e of b.enemies) {
      last = canUseAction(b, action(e.uid));
      if (last === null) return null;
    }
    return last;
  };
  /** Хвост предпросмотра по цели: по ней можно — штриховка и остаток HP, нельзя — причина. */
  const onTarget = (action: (t: number) => PlayerAction, target: number | undefined, range: DamageRange | undefined, kind: 'hit' | 'spell' | 'dot'): Partial<PreviewSpec> => {
    if (target === undefined) return {};
    const err = canUseAction(b, action(target));
    if (err) return { err };
    return range ? { target, range, kind } : {};
  };

  const atkAction = (t: number): PlayerAction => ({ type: 'attack', target: t });
  // Плеть хлещет весь ряд на долю урона — число на плитке уже с ней, с пометкой «всем».
  const sweep = b.hero.stats.sweep > 0;
  /** Разброс удара по конкретной цели: прибавки по крови и за проклятия («Кровавый след», «Резонанс») и крит по оглушённой видны только с целью. */
  const atkRangeOn = (bonus: number, mult: number, sure: boolean, t?: number, lowHp?: { pct: number; bonus: number }): DamageRange => {
    const e = t === undefined ? undefined : findEnemy(b, t);
    const r = previewAttack(b, bonus, mult, e, lowHp);
    return sure || sureCritOn(b.hero, e) ? critX(r) : r;
  };
  const atkRange = atkRangeOn(0, sweep ? SWEEP_MULT : 1, false);
  const atkTargets = uids(atkAction(first));
  const atkName = stealthed ? 'Удар в спину' : 'Ударить';
  specs.push({
    key: 'attack',
    glyph: '⚔',
    name: atkName,
    value: [rangeText(atkRange), sweep ? h('small', null, 'всем') : null],
    cost: { kind: 'sta', text: '1' },
    err: tileErr(atkAction, true),
    targeted: true,
    action: atkAction,
    targets: atkTargets,
    preview: (t) => ({
      title: atkName,
      parts: ['1 STA', `${rangeText(atkRange)} урона${stealthed ? ' (крит)' : ''}`, reachWord(actionReach(b, atkAction(first))), `каждая следующая атака в ходу на ${fatigue} % слабее (сделано: ${b.hero.attacks})`],
      targets: atkTargets,
      ...onTarget(atkAction, t, atkRangeOn(0, sweep ? SWEEP_MULT : 1, false, t), 'hit'),
    }),
  });

  const defAction = (): PlayerAction => ({ type: 'defend' });
  const blk = defendBlock(b.hero.stats);
  specs.push({
    key: 'defend',
    glyph: '⛨',
    name: 'Защита',
    value: [`+${blk}`],
    cost: { kind: 'sta', text: '1' },
    err: tileErr(defAction, false),
    targeted: false,
    action: defAction,
    targets: [],
    preview: () => ({ title: 'Защититься', parts: ['1 STA', `+${blk} блока до начала следующего хода`, '80 % от Защиты, округление вверх, раз за ход'] }),
  });

  for (const inst of b.hero.artifacts) {
    const ad = artifactDef(inst.id);
    if (ad.kind !== 'active') continue;
    const action = (t: number): PlayerAction => ({ type: 'artifact', artifactId: ad.id, target: t });
    const targeted = ad.target === 'enemy';
    const cd = b.hero.cooldowns[ad.id] ?? 0;
    const effects = ad.effects?.(inst.tier) ?? [];
    const atkEff = effects.find((e) => e.type === 'attack');
    const spellEff = effects.find((e) => e.type === 'spell');
    const ramEff = effects.find((e) => e.type === 'blockStrike');
    const detEff = effects.find((e) => e.type === 'detonate');
    const breakEff = effects.find((e) => e.type === 'breakBlock');
    const finEff = effects.find((e) => e.type === 'finisher');
    const chainEff = effects.find((e) => e.type === 'chain');
    let kind: 'hit' | 'spell' | 'dot' = 'hit';
    /** Разброс приёма: без цели — общий (плитка), с целью — по ней (ридаут): взрыв ран, пролом и прибавки по цели зависят от врага. */
    const rangeOn = (t?: number): DamageRange | null => {
      const e = t === undefined ? undefined : findEnemy(b, t);
      if (atkEff && atkEff.type === 'attack') {
        const r = atkRangeOn(atkEff.bonus, atkEff.mult ?? 1, !!atkEff.sureCrit, t, atkEff.lowHp);
        // Вскрытие: удар плюс взрыв крови на цели — на плитке только удар, по цели вместе.
        if (detEff && detEff.type === 'detonate' && e) {
          const burst = Math.floor(remainingDot(e, detEff.statuses) * detEff.mult);
          return { min: r.min + burst, max: r.max + burst };
        }
        return r;
      }
      if (ramEff && ramEff.type === 'blockStrike') {
        // Таран бьёт текущим блоком: без кубика, крита и усталости.
        const dmg = Math.floor(b.hero.block * ramEff.mult);
        return { min: dmg, max: dmg };
      }
      if (detEff && detEff.type === 'detonate') {
        // Взрыв пламени: сумма по всем врагам каждому; на плитке — по всем, по цели — то же число.
        const pool = detEff.pooled ? b.enemies.reduce((sum, x) => sum + remainingDot(x, detEff.statuses), 0) : e ? remainingDot(e, detEff.statuses) : 0;
        const dmg = Math.floor(pool * detEff.mult);
        return { min: dmg, max: dmg };
      }
      if (breakEff && breakEff.type === 'breakBlock') {
        const dmg = Math.floor((e?.block ?? b.enemies[0]?.block ?? 0) * breakEff.mult);
        return { min: dmg, max: dmg };
      }
      if (finEff && finEff.type === 'finisher') {
        const dmg = finisherPer(b.hero, finEff.pct) * b.hero.strikes;
        return { min: dmg, max: dmg };
      }
      if (chainEff && chainEff.type === 'chain') return { min: chainEff.amount, max: chainEff.amount };
      if (spellEff && spellEff.type === 'spell') {
        let dmg = spellEff.amount + b.hero.stats.spellPower;
        // «Раздуть» и удвоение по Слабому — только когда цель известна.
        if (e && b.hero.stats.spellVsBurn > 0 && e.statuses.some((st) => st.id === 'burn')) dmg = Math.round(dmg * (1 + b.hero.stats.spellVsBurn));
        if (e && spellEff.vsWeak && e.statuses.some((st) => st.id === 'weak')) dmg = Math.round(dmg * spellEff.vsWeak);
        kind = 'spell';
        return { min: dmg, max: dmg };
      }
      return null;
    };
    const range = rangeOn();
    // Взрыв ран бьёт мимо блока, как рана; пролом — по уже снятому блоку: штриховка без вычета блока.
    if ((detEff && !atkEff) || breakEff) kind = 'dot';
    const kindOn = (t?: number): 'hit' | 'spell' | 'dot' => {
      rangeOn(t);
      return kind;
    };
    const total = ad.cooldown?.(inst.tier) ?? 0;
    const limit = ad.usesPerTurn?.(inst.tier) ?? 0;
    const err = tileErr(action, targeted);
    // Приём по всем подсвечивает всех, по одному — досягаемых, на себя — никого.
    const targets = targeted ? uids(action(first)) : ad.target === 'allEnemies' ? b.enemies.map((e) => e.uid) : [];
    specs.push({
      key: ad.id,
      glyph: ad.glyph,
      name: ad.name,
      // При двух союзниках плитка призыва пишет причину прямо на себе, а не просто темнеет.
      value: err === 'Рядом нет места' ? [h('small', null, 'нет места')] : effectValue(effects, range),
      cost: costBadge(ad, inst.tier),
      err,
      cooldown: cd > 0 ? { left: cd, total: Math.max(total, cd) } : undefined,
      targeted,
      action,
      targets,
      preview: (t) => ({
        title: `${ad.name} · тир ${inst.tier}`,
        parts: [artifactCostText(ad, inst.tier), ad.describe(inst.tier), targeted ? reachWord(actionReach(b, action(first))) : '', total ? `перезарядка ${total} х.` : '', limit ? `за ход: ${b.hero.uses[ad.id] ?? 0}/${limit}` : ''],
        targets,
        ...(targeted ? onTarget(action, t, rangeOn(t) ?? undefined, kindOn(t)) : {}),
      }),
    });
  }
  return specs;
}

function tiles(app: App): HTMLElement {
  const b = app.run!.battle!;
  const busy = app.busy || b.phase !== 'player';
  const specs = actionSpecs(app);
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
    badges(b.hero, true, undefined, fatigueBadge(b)),
    h('div', { class: 'sprite-wrap' }, heroSprite(def.id, hasAllies ? 104 : 128, 'battle')),
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
  const field = h('div', { class: `field ${crowded ? 'crowded' : ''}`, style: backgroundStyle(loc.id, 0.3, 'wide') + tintVar(loc.id) }, heroZone, allyZone, enemyZone, h('div', { class: 'fx-layer' }));

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
  // Вор удрал — поле пусто, но это не победа: добыча уходит с ним, и подводить итог надо честно.
  const fled = won && b.fled;
  // Убитый вор платит не за клетку, а из своего мешка: возвращает украденное и добавляет свой.
  const gnomeSlain = won && !b.fled && run.event?.kind === 'gnome';
  // Вещекрад: ставка не в монете, а в стянутом артефакте.
  const snatcher = run.event?.kind === 'gnome_art';
  const stolenName = b.stolenArtifact ? artifactDef(b.stolenArtifact.id).name : null;
  const finishLabel = fled || (won && snatcher) ? 'Дальше' : won ? 'Забрать награду' : 'К итогам';
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
            { class: `panel result ${fled ? 'fled' : won ? 'won' : 'lost'}` },
            h('h2', null, fled ? 'Только его и видели' : won ? (snatcher && stolenName ? 'Вещь отбита' : 'Победа!') : 'Герой пал'),
            h(
              'p',
              { class: 'dim' },
              ...(fled && snatcher
                ? [stolenName ? `Бой занял ${b.turn} ход(ов). Вор унёс «${stolenName}».` : `Бой занял ${b.turn} ход(ов). Красть у героя было нечего.`]
                : fled
                  ? [`Бой занял ${b.turn} ход(ов). Вор ушёл с ${b.stolen} `, coin(), ' золота.']
                  : won && snatcher
                    ? [stolenName ? `Бой занял ${b.turn} ход(ов). «${stolenName}» остался при герое.` : `Бой занял ${b.turn} ход(ов). Вор ушёл ни с чем.`]
                    : won
                  ? [
                      `Бой занял ${b.turn} ход(ов). Добыча: +${gnomeSlain ? b.stolen + GNOME_BOUNTY : goldReward(currentRoomKind(run))} `,
                      coin(),
                      ' золота.',
                    ]
                  : ['Забег окончен.']),
            ),
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
