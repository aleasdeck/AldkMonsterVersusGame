import { button, h, type Child, type TipFn } from '../dom';
import { heroDef } from '../../data/heroes';
import { ROLE_INFO, enemyDef } from '../../data/enemies';
import { HERO_BODY_HEIGHT } from '../../data/characterSizes';
import { enemySize, enemySizeStyle } from '../characterSize';
import { artifactCostText, artifactDef } from '../../data/artifacts';
import { ART_TIER_COLORS, SWEEP_MULT } from '../../data/gear';
import { INTENT_ICON, actionReach, attackExtra, canUseAction, chargeBonus, computeAllyIntent, computeIntent, coveringGuard, defendBlock, fatigueMult, findEnemy, finisherPer, isHidden, previewAttack, rangeText, reachableEnemies, remainingDot, restAttackRange, skillBlock, skillHeal, sureCritOn, turnsToFlee, type ActionMark, type DamageRange, type IntentInfo, type IntentKind } from '../../engine/combat';
import { GNOME_BOUNTY, goldReward } from '../../engine/loot';
import { currentLocation, currentRoomKind } from '../../engine/run';
import type { AllyState, ArtTier, ArtifactDef, BattleState, Combatant, DerivedStats, Effect, EnemyState, PlayerAction, WeaponReach } from '../../engine/types';
import { MAX_ALLIES } from '../../engine/types';
import { actionPartLines, bar, coin, hpTip, statusIcons } from '../components';
import { heroSprite } from '../heroSprite';
import { enemySprite } from '../enemySprite';
import { MARK_COLORS, STATUS_COLORS, markIcon, statusIcon, uiIcon } from '../icons';
import { paramTip, tipHead, tipLines, tipNote, tipText, turnsWord } from '../tips';
import { backgroundStyle } from '../backgrounds';
import { tintVar } from '../tint';
import { runFrame } from '../frame';
import { bindPreview, defaultReadout, type PreviewSpec } from '../preview';
import type { App } from '../app';
import { logHead, runLogBody } from './runLog';

/**
 * Блок и статусы — над головой бойца. У врагов блок живёт на полоске HP, здесь только статусы.
 * `enemy` — сам враг: нужен «Предсмертию», чтобы подсказка расписала его эффект при смерти.
 */
function badges(c: Combatant, withBlock: boolean, enemy?: EnemyState, ...extra: Child[]): HTMLElement {
  const tip = paramTip('block', 'Блок', `Первые ${c.block} урона удара или заклинания уйдут в него; раны бьют мимо`, { aside: h('b', { class: 'tip-val' }, `${c.block}`), note: 'Сгорает в начале следующего хода, если броня не держит его' });
  return h('div', { class: 'badges' }, withBlock && c.block > 0 ? h('span', { class: 'block-badge', tip }, `⛨ ${c.block}`) : null, ...extra, statusIcons(c, enemy));
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
  const color = STATUS_COLORS.exhaust;
  const tip: TipFn = () => [
    tipHead({ icon: { status: 'exhaust' }, title: 'Усталость', color, sub: [`атак в этом ходу: ${hero.attacks}`], aside: h('b', { class: 'tip-val', style: `color:${color}` }, `${pct} %`) }),
    tipText(`Удары и физические приёмы сейчас бьют на ${pct} % от полного урона: каждая следующая атака на ${step} % слабее предыдущей`),
    tipNote('Заклинания, раны и шипы усталость не трогает; на новом ходу счётчик обнуляется'),
  ];
  return h('span', { class: 'fatigue-badge', tip }, statusIcon('exhaust', 16), `${hero.attacks}`);
}

/** Что значит пометка удара: подсказка у иконки на пилюле и строка в подсказке намерения. */
const MARK_TIPS: Record<ActionMark, { title: string; text: string }> = {
  pierce: { title: 'Сквозь блок', text: 'Удар не тратит блок героя и бьёт прямо по HP: щит от него не спасает' },
  drain: { title: 'Вампиризм', text: 'Враг вылечится на столько, сколько урона дошло до HP' },
};

function markTip(mark: ActionMark): TipFn {
  return () => [tipHead({ icon: markIcon(mark, 16), title: MARK_TIPS[mark].title, color: MARK_COLORS[mark] }), tipText(MARK_TIPS[mark].text)];
}

/** Цвет вида намерения — тот же, что у пилюли (style.css, .intent-*): им подсказка красит значок, имя и рамку. */
const INTENT_COLORS: Record<IntentKind, string> = {
  attack: '#ff6b6b',
  defend: '#8ecae6',
  buff: '#f9a825',
  debuff: '#b388ff',
  heal: '#80ed99',
  summon: '#ffab91',
  special: '#ffd166',
};

/**
 * Подсказка намерения (v0.51.2): значок вида и имя приёма цветом пилюли, справа её число, под именем — чей ход и цель; эффекты
 * строками со своими значками (удар клинком, рана — иконкой статуса, замах — стрелкой), пометки удара с пояснением,
 * оговорки (реакция, в упор, ярость) — мелко с «!».
 */
function intentTip(intent: IntentInfo, target: string | null, ally = false): TipFn {
  return () => {
    const color = ally ? '#80ed99' : INTENT_COLORS[intent.kind];
    const sub: Child[] = [ally ? 'ход союзника' : 'намерение врага'];
    if (target) sub.push(h('span', null, 'цель: ', h('span', { class: 'tip-value' }, target)));
    return [
      tipHead({ icon: { glyph: intent.icon, color }, title: intent.name, color, sub, aside: intent.label ? h('b', { class: 'tip-val', style: `color:${color}` }, intent.label) : undefined }),
      actionPartLines(intent.parts),
      tipLines(intent.marks.map((m) => ({ icon: markIcon(m, 14), label: `${MARK_TIPS[m].title}:`, text: MARK_TIPS[m].text }))),
      ...intent.notes.map((n) => tipNote(n, 'alert', 'accent')),
      ally ? tipNote('Ходит сам после вашего хода') : null,
    ];
  };
}

/**
 * Хвост пилюли: сначала свойства самого удара (пробитие блока, вампиризм), потом остальные виды эффектов приёма мелкими иконками —
 * дебаф и бафф на себя иконкой самого статуса, чтобы «⚔ 7» с Кровотечением или «⛨ 12» с Шипами читались без подсказки;
 * лечение и призыв — иконкой вида.
 */
function intentExtras(intent: IntentInfo): Child[] {
  const out: Child[] = [];
  for (const mark of intent.marks) {
    out.push(h('span', { class: 'pill-extra intent-mark', tip: markTip(mark) }, markIcon(mark, 16)));
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
function intentPill(b: BattleState, e: EnemyState, heroName: string): HTMLElement {
  const intent = computeIntent(e, b);
  if (intent.stunned) {
    const frozen = e.statuses.some((st) => st.id === 'frozen');
    const tip = paramTip({ status: frozen ? 'frozen' : 'stun' }, frozen ? 'Скован льдом' : 'Оглушён', 'Пропустит свой ход. Ваши удары по нему — всегда крит', { color: STATUS_COLORS[frozen ? 'frozen' : 'stun'] });
    return h('div', { class: 'pill intent-stunned', tip }, statusIcon('stun', 18), 'оглушён');
  }
  // «Чаща» (v0.48): в первый ход намерения не видно.
  if (intent.hidden) return h('div', { class: 'pill intent-special', tip: paramTip({ glyph: '?' }, 'Не разглядеть', 'Испытание «Чаща»: в первый ход боя намерения врагов скрыты', { color: 'var(--accent)' }) }, h('span', { class: 'pill-icon' }, '?'));
  // Враги бьют первого союзника раньше героя.
  const victim = intent.kinds.includes('attack') ? (b.allies[0]?.name ?? heroName) : null;
  return h(
    'div',
    { class: `pill intent-${intent.kind}`, tip: intentTip(intent, victim) },
    h('span', { class: 'pill-icon' }, intent.icon),
    intent.label ? h('span', { class: 'pill-label' }, intent.label) : null,
    ...intentExtras(intent),
  );
}

/** Часики над вором: сколько ходов осталось до побега. Считает движок, у обычных врагов ничего не рисуется. */
function fleeTimer(e: EnemyState): HTMLElement | null {
  const left = turnsToFlee(e);
  if (left === null) return null;
  const when = left === 1 ? 'в этот ход' : `через ${left} ${turnsWord(left)}`;
  const tip = paramTip({ glyph: '⏳' }, 'Побег', 'Удерёт и унесёт всё срезанное. Убить нужно раньше', {
    color: left <= 1 ? '#e63946' : 'var(--accent)',
    aside: h('b', { class: 'tip-val' }, when),
  });
  return h('div', { class: `flee-timer ${left <= 1 ? 'urgent' : ''}`, tip }, `⏳ ${left}`);
}

/**
 * Враг в поле. Клик применяет выбранный приём (v0.26: сначала приём, потом цель); без выбранного приёма клик только
 * подсказывает. Рамка досягаемости ставится по выбранному приёму при отрисовке, наведение на плитку перекрашивает её временно.
 */
function enemyView(app: App, e: EnemyState): HTMLElement {
  const def = enemyDef(e.defId);
  const size = enemySize(def);
  const px = size.px;
  const targets = app.armedTargets();
  const cls = targets ? (targets.includes(e.uid) ? 'ok' : 'far') : '';
  const el = h(
    'div',
    {
      class: `enemy rank-${def.rank} ${cls} ${e.aura ? 'aura' : ''}`,
      // Лист лепки сохраняет запас под движение, прозрачные поля исключены из высоты карточки.
      style: `${e.aura ? `--aura:${e.aura};` : ''}${enemySizeStyle(size)}`,
      'data-uid': e.uid,
      onclick: () => app.applyArmed(e.uid),
    },
    intentPill(app.run!.battle!, e, heroDef(app.run!.hero.defId).name),
    fleeTimer(e),
    e.statuses.length ? badges(e, false, e) : null,
    bar('hp', e.hp, e.maxHp, '', hpTip(e.hp, e.maxHp, e.block, false), e.block),
    h('div', { class: 'sprite-wrap' }, enemySprite(def.sprite, def.id, px, '', e)),
    h('div', { class: 'name' }, roleMark(app.run!.battle!, e), e.name),
  );
  return bindPreview(app, el, () => enemyPreview(app, e.uid));
}

/** Цвет роли — тот же, что у значка перед именем (style.css, .role-mark.role-*). */
const ROLE_COLORS: Record<keyof typeof ROLE_INFO, string> = {
  guard: '#8fb8ff',
  brute: '#ff9f6b',
  swarm: '#c9ccd1',
  shooter: '#c9a0ff',
  caster: '#c9a0ff',
  support: '#80ed99',
};

/**
 * Значок роли перед именем (v0.46): страж, громила, рой, стрелок, заклинатель, поддержка — с правилом позиции в подсказке.
 * Прикрытый стражем помечается щитом: первый удар за ход по нему достанется стражу.
 */
function roleMark(b: BattleState, e: EnemyState): Child {
  const role = enemyDef(e.defId).role;
  const guard = coveringGuard(b, e);
  const marks: Child[] = [];
  if (guard) {
    const tip = paramTip({ glyph: '⛉' }, 'Под прикрытием', `Первый удар за ход по нему примет ${guard.name}. Второй пройдёт; Крюк и толчок страж не перехватывает`, { color: ROLE_COLORS.guard });
    marks.push(h('span', { class: 'role-mark covered', tip }, '⛉'));
  }
  if (role) {
    const info = ROLE_INFO[role];
    marks.push(h('span', { class: `role-mark role-${role}`, tip: paramTip({ glyph: info.icon }, info.name, info.rule, { color: ROLE_COLORS[role], sub: ['роль врага'] }) }, info.icon));
  }
  return marks.length ? h('span', { class: 'role-marks' }, ...marks) : null;
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
  const size = enemySize(def);
  const intent = computeAllyIntent(b, a);
  const tail = intent.target ? ` → ${intent.target[0]}` : '';
  return h(
    'div',
    { class: 'ally', 'data-uid': a.uid, style: enemySizeStyle(size) },
    h('div', { class: 'pill pill-ally', tip: intentTip(intent, intent.target, true) }, h('span', { class: 'pill-icon' }, intent.icon), `${intent.label}${tail}`.trim()),
    h(
      'div',
      { class: 'badges' },
      underFire ? h('span', { class: 'under-fire', tip: paramTip({ glyph: '◀' }, 'Под ударом', `Враги атакуют ${a.name} раньше героя`, { color: '#ff6b6b' }) }, '◀ под ударом') : null,
      a.block > 0 ? h('span', { class: 'block-badge' }, `⛨ ${a.block}`) : null,
      statusIcons(a),
    ),
    h('div', { class: 'sprite-wrap' }, enemySprite(def.sprite, def.id, size.px, '', a)),
    h('div', { class: 'name' }, a.name),
    bar('hp', a.hp, a.maxHp, '', '', a.block),
  );
}

/** Пунктирный силуэт свободного места рядом с героем — пока есть призывающий артефакт и союзников меньше двух. */
function summonGhost(): HTMLElement {
  return h('div', { class: 'ally ghost', tip: paramTip({ glyph: '☍' }, 'Место для союзника', 'Призыв поставит его сюда', { color: '#80ed99' }) }, h('div', { class: 'ghost-box' }, '☍'), h('div', { class: 'name dim' }, 'место'));
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
  /**
   * Число против карточки (v0.50, как `!D!` в Slay the Spire): 1 — удар сейчас сильнее, чем на карточке и в листе (Сила от статуса,
   * удар из тени, «Разгон»), −1 — слабее (усталость, Слабость), 0 или нет — как на карточке. Красит число зелёным или красным.
   */
  dir?: number;
  /** Тир артефакта: рамка плитки цветом той же шкалы, что у карточки (со второго тира; удар и защита — без тира). */
  tier?: ArtTier;
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
      class: `tile ${off ? 'off' : ''} ${cd ? 'cooling' : ''} ${armed ? 'armed' : ''} ${spec.tier && spec.tier > 1 ? 'tiered' : ''}`,
      style: spec.tier && spec.tier > 1 ? `--tier:${ART_TIER_COLORS[spec.tier]}` : null,
      'aria-disabled': off ? 'true' : null,
      'aria-pressed': spec.targeted ? (armed ? 'true' : 'false') : null,
      onclick: () => {
        if (off) return;
        if (spec.targeted) app.arm(spec.key);
        else app.battleAction(spec.action(first));
      },
    },
    cd ? h('div', { class: 'cd-fill', style: `height:${pct}%` }) : null,
    cd ? h('div', { class: 'cd-num' }, uiIcon('cd', 14), `${cd.left}`) : null,
    // Цена — пиксельным значком ресурса и числом, как ячейка «цена» на карточке и полоски STA/MP в консоли.
    spec.cost.kind !== 'none' ? h('span', { class: `tile-cost cost-${spec.cost.kind}` }, uiIcon(spec.cost.kind, 12), spec.cost.text) : null,
    index < 9 ? h('span', { class: 'tile-key' }, `${index + 1}`) : null,
    h('div', { class: 'tile-glyph' }, spec.glyph),
    h('div', { class: `tile-value ${spec.dir ? (spec.dir > 0 ? 'up' : 'dn') : ''}`.trim() }, ...spec.value),
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

/**
 * Крупное число плитки по первому значимому эффекту приёма — тот же расчёт, что число «сейчас» на карточке (restValue в cards.ts),
 * плюс то, что знает только бой. Единица — пиксельным значком (блок, HP, STA, MP), как в таблицах карточек; многоударный приём —
 * «2×3–4», урон за удар.
 */
function effectValue(effects: Effect[], range: DamageRange | null, s: DerivedStats): Child[] {
  const attacks = effects.filter((e) => e.type === 'attack');
  const atk = attacks[0];
  if (atk && atk.type === 'attack' && range) return [`${attacks.length > 1 ? `${attacks.length}×` : ''}${rangeText(range)}`, atk.target === 'allEnemies' ? h('small', null, 'всем') : null];
  for (const e of effects) {
    switch (e.type) {
      case 'spell':
        return [range ? rangeText(range) : `${e.amount}`, e.target === 'allEnemies' ? h('small', null, 'всем') : null];
      case 'block':
        return [`+${skillBlock(s, e.amount)}`, uiIcon('block', 14)];
      case 'blockStrike':
        return [range ? rangeText(range) : '0', h('small', null, `⛨×${e.mult}`)];
      case 'heal':
        return [`+${skillHeal(s, e.amount)}`, uiIcon('heal', 14)];
      case 'gainSta':
        return [`+${e.amount}`, uiIcon('sta', 14)];
      case 'gainMp':
        return [`+${e.amount}`, uiIcon('mp', 14)];
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
      case 'scorch':
        return [range ? rangeText(range) : '—', h('small', null, `огонь×${e.mult}`)];
      case 'breakBlock':
        return [range ? rangeText(range) : '—', h('small', null, `⛨×${e.mult}`)];
      case 'finisher':
        return [range ? rangeText(range) : '—', h('small', null, `${e.pct} %×атаки`)];
      case 'chain':
        return [`${e.amount}`, h('small', null, 'вдогонку')];
      case 'enchant':
        return [statusIcon('enchant', 18), ` ${e.value}`];
      case 'amplify':
        return [statusIcon(e.status, 18), ` ×${e.mult}`];
      case 'blockBurst':
        return [range ? rangeText(range) : '0', h('small', null, 'всем')];
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
  const onTarget = (action: (t: number) => PlayerAction, target: number | undefined, range: DamageRange | undefined, kind: NonNullable<PreviewSpec['kind']>): Partial<PreviewSpec> => {
    if (target === undefined) return {};
    const err = canUseAction(b, action(target));
    if (err) return { err };
    return range ? { target, range, kind } : {};
  };

  /** Число против карточки (v0.50): сравнение по сумме границ разброса; нет базы — нет цвета. */
  const dirOf = (cur: DamageRange | null, base: DamageRange | null): number => (cur && base ? Math.sign(cur.min + cur.max - (base.min + base.max)) : 0);
  /** Хвост ридаута «(обычно 2–3)», когда удар сейчас не такой, как на карточке и в листе: видно, откуда зелёный или красный. */
  const usual = (cur: DamageRange | null, base: DamageRange | null): string => (base && dirOf(cur, base) ? ` (обычно ${rangeText(base)})` : '');

  const atkAction = (t: number): PlayerAction => ({ type: 'attack', target: t });
  // Плеть хлещет весь ряд на долю урона — число на плитке уже с ней, с пометкой «всем».
  const sweep = b.hero.stats.sweep > 0;
  /** Разброс удара по конкретной цели: прибавки по крови и за проклятия («Кровавый след», «Резонанс») и крит по оглушённой видны только с целью. */
  const atkRangeOn = (bonus: number, mult: number, sure: boolean, t?: number, lowHp?: { pct: number; bonus: number }): DamageRange => {
    const e = t === undefined ? undefined : findEnemy(b, t);
    const r = previewAttack(b, bonus, mult, e, lowHp);
    return sure || sureCritOn(b.hero, e) ? critX(r) : r;
  };
  // Заряды Мага (черта «Заряд»): удар тратит все — прибавка видна на плитке сразу, как Сила.
  const charge = chargeBonus(b.hero);
  const atkRange = atkRangeOn(charge, sweep ? SWEEP_MULT : 1, false);
  // Урон удара вне боя — «урон» в листе «Персонаж»: от него плитка краснеет с усталостью и зеленеет от Силы и удара в спину.
  const atkBase = restAttackRange(b.hero.stats, 0, sweep ? SWEEP_MULT : 1);
  const atkTargets = uids(atkAction(first));
  const atkName = stealthed ? 'Удар в спину' : 'Ударить';
  specs.push({
    key: 'attack',
    glyph: '⚔',
    name: atkName,
    value: [rangeText(atkRange), sweep ? h('small', null, 'всем') : null],
    dir: dirOf(atkRange, atkBase),
    cost: { kind: 'sta', text: '1' },
    err: tileErr(atkAction, true),
    targeted: true,
    action: atkAction,
    targets: atkTargets,
    preview: (t) => ({
      title: atkName,
      parts: [
        '1 STA',
        `${rangeText(atkRange)} урона${stealthed ? ' (крит мимо блока)' : ''}${usual(atkRange, atkBase)}`,
        charge > 0 ? `заряды: +${charge}, удар тратит все` : null,
        reachWord(actionReach(b, atkAction(first))),
        `каждая следующая атака в ходу на ${fatigue} % слабее (сделано: ${b.hero.attacks})`,
      ],
      targets: atkTargets,
      ...onTarget(atkAction, t, atkRangeOn(charge, sweep ? SWEEP_MULT : 1, false, t), 'strike'),
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
    const scorchEff = effects.find((e) => e.type === 'scorch');
    // Приём-удар бьёт оружием: из тени — мимо блока, как атака (v0.51.1); Таран, Финишер и прочие удары без кубика — нет.
    let kind: NonNullable<PreviewSpec['kind']> = atkEff ? 'strike' : 'hit';
    /** Разброс приёма: без цели — общий (плитка), с целью — по ней (ридаут): взрыв ран, пролом и прибавки по цели зависят от врага. */
    const rangeOn = (t?: number): DamageRange | null => {
      const e = t === undefined ? undefined : findEnemy(b, t);
      if (atkEff && atkEff.type === 'attack') {
        // Око за око и Кара (v0.47): прибавка от хода боя; Раскол — множитель по оцепеневшей цели.
        const extra = attackExtra(b.hero, atkEff);
        const shatter = atkEff.vsFrozen && e && e.statuses.some((st) => st.id === 'frozen') ? atkEff.vsFrozen : 1;
        const r = atkRangeOn(atkEff.bonus + extra.revenge + extra.smite, (atkEff.mult ?? 1) * shatter, !!atkEff.sureCrit, t, atkEff.lowHp);
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
      const burstEff = effects.find((x) => x.type === 'blockBurst');
      if (burstEff && burstEff.type === 'blockBurst') {
        // Обвал щита: доля всего блока каждому врагу.
        const dmg = Math.floor(b.hero.block * burstEff.pct);
        return { min: dmg, max: dmg };
      }
      if (scorchEff && scorchEff.type === 'scorch') {
        // Испепеление: Горение цели × mult, мимо блока; на плитке — по первому горящему.
        const tgt = e ?? b.enemies.find((x) => x.statuses.some((st) => st.id === 'burn'));
        const dmg = Math.floor((tgt?.statuses.find((st) => st.id === 'burn')?.value ?? 0) * scorchEff.mult);
        return { min: dmg, max: dmg };
      }
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
    const hits = effects.filter((e) => e.type === 'attack').length;
    // Число карточки (restValue в cards.ts): удар оружием и заклинание; у формул от состояния боя базы нет.
    const base = atkEff && atkEff.type === 'attack' ? restAttackRange(b.hero.stats, atkEff.bonus, atkEff.mult ?? 1) : spellEff && spellEff.type === 'spell' ? { min: spellEff.amount + b.hero.stats.spellPower, max: spellEff.amount + b.hero.stats.spellPower } : null;
    // Взрыв ран бьёт мимо блока, как рана; пролом — по уже снятому блоку: штриховка без вычета блока.
    if ((detEff && !atkEff) || breakEff || scorchEff) kind = 'dot';
    const kindOn = (t?: number): NonNullable<PreviewSpec['kind']> => {
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
      value: err === 'Рядом нет места' ? [h('small', null, 'нет места')] : effectValue(effects, range, b.hero.stats),
      dir: dirOf(range, base),
      tier: inst.tier,
      cost: costBadge(ad, inst.tier),
      err,
      cooldown: cd > 0 ? { left: cd, total: Math.max(total, cd) } : undefined,
      targeted,
      action,
      targets,
      preview: (t) => ({
        title: `${ad.name} · тир ${inst.tier}`,
        parts: [artifactCostText(ad, inst.tier), range && base ? `${hits > 1 ? `${hits}×` : ''}${rangeText(range)} урона${usual(range, base)}` : '', ad.describe(inst.tier), targeted ? reachWord(actionReach(b, action(first))) : '', total ? `перезарядка ${total} х.` : '', limit ? `за ход: ${b.hero.uses[ad.id] ?? 0}/${limit}` : ''],
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
    h('div', { class: 'sprite-wrap' }, heroSprite(def.id, HERO_BODY_HEIGHT[def.id] ?? 128, 'battle')),
    h('div', { class: 'name' }, def.name),
  );

  const canSummon = b.hero.artifacts.some((inst) => artifactDef(inst.id).effects?.(inst.tier).some((e) => e.type === 'summon'));
  const enemiesAttack = b.enemies.some((e) => computeIntent(e, b).kind === 'attack');
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
    field.appendChild(h('div', { class: 'log-drawer' }, logHead(app, 'Лог боя', 'log-head'), logEl));
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
