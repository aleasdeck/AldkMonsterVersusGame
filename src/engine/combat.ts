import type {
  AiCtx,
  AllyState,
  ArtifactDef,
  ArtifactInstance,
  BattleState,
  Combatant,
  Effect,
  EnemyDef,
  EnemyEffect,
  EnemyRole,
  DerivedStats,
  EnemyState,
  HeroBattle,
  EventTarget,
  HeroDef,
  HeroPersistent,
  PlayerAction,
  Reach,
  Status,
  StatusId,
  WeaponReach,
} from './types';
import { MAX_ALLIES, MAX_ENEMIES } from './types';
import { chance, int, pick, weighted, type Rng } from './rng';
import { enemyAction, enemyDef, PHASE_SHIFT } from '../data/enemies';
import { enemyScale, locationDef } from '../data/locations';
import { artifactCost, artifactDef } from '../data/artifacts';
import { SWEEP_MULT } from '../data/gear';
import { potionDef } from '../data/potions';
import { computeStats, innateOf, socketedArtifacts, statCtxOf } from './stats';
import { ACID_BLOCK_MULT, CANNONADE_PCT, CRYPT_CURSE_MULT, HOT_ARMOR_MULT, trialValue } from '../data/trials';

export const STATUS_NAMES: Record<StatusId, string> = {
  strength: 'Сила',
  weak: 'Слабость',
  bleed: 'Кровотечение',
  burn: 'Горение',
  stun: 'Оглушение',
  exhaust: 'Изнурение',
  dodge: 'Уклонение',
  thorns: 'Шипы',
  regen: 'Регенерация',
  invuln: 'Неуязвимость',
  poison: 'Яд',
  stealth: 'Скрытность',
  vulnerable: 'Уязвимость',
  doom: 'Предсмертие',
  evade: 'Уворот',
  echo: 'Эхо удара',
  enchant: 'Стихийная заточка',
  charge: 'Заряд',
  rage: 'Ярость',
  fury: 'Неистовство',
  cold: 'Холод',
  frozen: 'Оцепенение',
  focus: 'Верный глаз',
  taunt: 'Насмешка',
};

export const STATUS_HINTS: Record<StatusId, string> = {
  strength: '+N к урону атак до конца боя',
  weak: 'Урон атак −25 %',
  bleed: 'N урона в начале хода, игнорирует блок. Складывается: новое наложение добавляет силу',
  burn: 'N урона в начале хода, игнорирует блок. Складывается: новое наложение добавляет силу',
  stun: 'Пропускает следующее действие',
  exhaust: '−1 стамины на следующем ходу',
  dodge: 'Следующая атака не наносит урона',
  thorns: 'Атакующий получает N урона',
  regen: '+N HP в начале хода',
  invuln: 'Не получает урона',
  poison: 'N урона в начале хода, игнорирует блок. Складывается: новое наложение добавляет силу',
  stealth: 'Враги не видят героя: атаки и проклятия мимо. Любая атака героя — удар в спину: крит, снимает скрытность',
  vulnerable: 'Получает на 25 % больше урона от ударов и заклинаний; раны не усиливает',
  doom: 'Погибнув, враг напоследок сделает ещё кое-что: наведи на метку, чтобы увидеть, что именно',
  evade: 'Удар или заклинание по цели с шансом N % проходит мимо. Раны (кровотечение, горение, яд) и шипы бьют всегда',
  echo: 'Следующий удар оружием в этом ходу повторяется: атака, удары приёма, Финишер, Таран, Пролом щита и Цепная атака бьют дважды, усталость считает их одной атакой. Заклинания эхо не повторяет',
  enchant: 'Каждый удар героя вешает на цель рану своей стихии силой N на 2 хода',
  charge: 'Заряды заклинаний: обычный удар тратит все и бьёт сильнее за каждый',
  rage: 'Накопленный урон: набрав треть максимума HP, Берсерк впадает в Неистовство',
  fury: '+1 STA в начале хода и удары без усталости до конца хода',
  cold: 'Копится; набрав 4, враг цепенеет — пропускает ход, а Холод обнуляется. Каждое следующее Оцепенение того же врага требует на 2 Холода больше; скованный Холод не копит',
  frozen: 'Скован льдом: пропускает свой ход. Считается оглушением — «Оглушающий удар» бьёт по нему критом',
  focus: 'Следующий удар оружием — крит наверняка',
  taunt: 'В ход врагов Шипы и Ответный удар в полтора раза сильнее, враги бьют героя, а не союзника',
};

/** Стихии заточки: какую рану может получить оружие. */
export const ENCHANT_ELEMENTS: StatusId[] = ['burn', 'poison', 'bleed'];

/** Проклятия на враге, которые считает «Резонанс»: всё, что герой навесил ему во вред. */
export const DEBUFFS: StatusId[] = ['weak', 'bleed', 'burn', 'poison', 'stun', 'vulnerable', 'cold', 'frozen'];

/** «Насмешка» (v0.47): во столько раз сильнее Шипы и Ответный удар героя в ход врагов (2 → 1.5 в v0.49). */
export const TAUNT_MULT = 1.5;

/** Сколько Холода нужно, чтобы враг оцепенел в первый раз (v0.47; 3 → 4 в v0.49: набор «Холод» 3/3 выигрывал почти всегда). */
export const COLD_FREEZE = 4;
/**
 * Лёд крепчает: каждое следующее Оцепенение того же врага требует на столько Холода больше. Без этого набор «Холод» 3/3
 * замораживал всех через ход и выигрывал у бота 40 забегов из 41 (SIM v0.47, профиль наборов).
 */
export const COLD_FREEZE_STEP = 2;

/** Сколько Холода нужно этому врагу для следующего Оцепенения. */
export function freezeAt(e: { freezes?: number }): number {
  return COLD_FREEZE + COLD_FREEZE_STEP * (e.freezes ?? 0);
}

/** Враг не ходит: оглушён или скован льдом. Для крита «Оглушающего удара» это одно и то же. */
export function isStunned(c: Combatant): boolean {
  return !!getStatus(c, 'stun') || !!getStatus(c, 'frozen');
}

export function debuffCount(c: Combatant): number {
  return c.statuses.filter((s) => DEBUFFS.includes(s.id)).length;
}

/** Урон, который ещё нанесут раны: сила × оставшиеся ходы (бессрочная — как три). Его и взрывает `detonate`. */
export function remainingDot(c: Combatant, statuses: StatusId[]): number {
  let total = 0;
  for (const st of c.statuses) if (statuses.includes(st.id)) total += st.value * (st.turns === -1 ? 3 : st.turns);
  return total;
}

/**
 * Уязвимость: удары и заклинания по цели сильнее на четверть. Округление к ближайшему, не вниз:
 * при уроне 3–7 за удар округление вниз съедало бонус целиком (3 × 1.25 = 3.75 → 3), и статус был декоративным.
 */
export const VULNERABLE_MULT = 1.25;

/** Ниже этой доли HP цель считается раненой: «Клеймо палача» добавляет шанс крита по ней. */
export const EXECUTE_HP_PCT = 0.2;

/**
 * Ниже этой доли HP герой ранен и входит в транс: «Боевой транс» Берсерка прибавляет Силу (`lowHpStr`), стамину
 * в начале хода (`lowHpSta`) и гасит каждый удар (`lowHpReduce`). Строго ниже половины (v0.33.2, решение пользователя):
 * без гашения порог в половину бот не переживал (14 % против 24 % на ⅔, v0.33) — Берсерк без Ярости к половине HP
 * уже проигрывал бой; гашение удара как раз и держит его там.
 */
export const TRANCE_HP_PCT = 1 / 2;

/** Герой ранен настолько, что «Боевой транс» работает. */
export function inTrance(h: HeroBattle): boolean {
  return h.hp < h.maxHp * TRANCE_HP_PCT;
}

/** Сила от «Боевого транса» прямо сейчас: своя доля только пока герой ранен. */
export function tranceStr(h: HeroBattle): number {
  return h.stats.lowHpStr > 0 && inTrance(h) ? h.stats.lowHpStr : 0;
}

/** Гашение удара от «Боевого транса» прямо сейчас: только пока герой ранен. */
export function tranceReduce(h: HeroBattle): number {
  return h.stats.lowHpReduce > 0 && inTrance(h) ? h.stats.lowHpReduce : 0;
}

/**
 * Урон «Ответного удара»: доля среднего урона оружия с Силой, без кубика, усталости и крита — как Таран, ответ не
 * атака героя, а свойство щита. Слабость его тоже не портит. 0 — пассивки нет.
 */
export function riposteDamage(h: HeroBattle): number {
  if (h.stats.riposte <= 0) return 0;
  return Math.max(0, Math.round(((h.stats.dmgMin + h.stats.dmgMax) / 2 + heroStr(h)) * (h.stats.riposte / 100)));
}

// ─── Дальность ─────────────────────────────────────────────────────────────

/**
 * Дальность (v0.26): ближний бой достаёт только первого в ряду — ближайшего к герою врага. Дальнее и магическое оружие,
 * копьё, заклинания, брошенные склянки и приёмы по всем врагам достают любого; плеть хлещет весь ряд одним ударом.
 * Модель двух рядов со строем врагов измерена и отвергнута (GDD §12.25): для бота почти бесплатна, для игрока незаметна.
 */
export const REACH_ERR = 'Только первый в ряду';

/**
 * Призванный или отделившийся враг встаёт вперёд и заслоняет призывателя. С призывом в хвост ряда Лич, Капитан и Вожак
 * прятали свиту за спиной, и бот терял на ближних героях 8–11 пунктов; с призывом вперёд — 2–5 (GDD §13, v0.26).
 */
export const SUMMON_FRONT = true;

// ─── Роли и ряд (v0.46) ─────────────────────────────────────────────────────
// План §5.3: место в ряду задаёт роль, а не порядок в списке встречи. Впереди страж, громила и рой; сзади стрелок,
// заклинатель и поддержка. Отсюда смысл у Крюка (вытащить заднего вперёд, где он слаб), толчка Щитового удара
// (отодвинуть стража и открыть того, кого он прикрывал), площади (рой) и черты Лучника (задние).

/** Порядок ролей в ряду: меньше — ближе к герою. Враг без роли (босс, вор) стоит среди роя. */
export const ROLE_RANK: Record<EnemyRole, number> = { guard: 0, brute: 1, swarm: 2, shooter: 3, caster: 4, support: 5 };

/** Громила, оказавшийся первым в ряду, раз за бой получает столько Силы (домножается под акт, как урон). */
export const BRUTE_FRONT_STR = 2;

/** Стрелок первым в ряду бьёт «в упор» — вполсилы — и после своего хода отходит на клетку назад. */
export const POINT_BLANK_MULT = 0.5;

/**
 * Ярость врагов (v0.46, план §5.1): бой, затянувшийся дальше своей длины, становится опаснее — урон врагов растёт на
 * ENRAGE_STEP за каждый ход, начиная с хода ENRAGE_TURN по самому сильному рангу боя. Страховка от патов у бота и у живого игрока,
 * а не часть обычного боя: рядовой бой должен укладываться в 3–5 ходов, элита в 5–7, босс в 8–12.
 */
export const ENRAGE_TURN: Record<EnemyDef['rank'], number> = { normal: 10, elite: 12, boss: 16 };
export const ENRAGE_STEP = 0.1;

/** Расставить стартовый состав по ролям: стабильная сортировка — внутри одной роли порядок встречи сохраняется. */
export function orderByRole(enemyIds: string[]): string[] {
  const rank = (id: string) => {
    const role = enemyDef(id).role;
    return role ? ROLE_RANK[role] : ROLE_RANK.swarm;
  };
  return enemyIds.map((id, i) => ({ id, i })).sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i).map((x) => x.id);
}

/** Стрелок стоит первым, а за ним есть кому встать: бьёт в упор вполсилы. Один на поле — отходить некуда, бьёт как обычно. */
export function pointBlank(state: BattleState, e: EnemyState): boolean {
  return enemyDef(e.defId).role === 'shooter' && state.enemies[0] === e && state.enemies.length > 1;
}

/** Множитель ярости врагов на нынешнем ходу боя: 1 — бой ещё в своей длине. */
export function enrageMult(state: BattleState): number {
  const over = state.turn - (state.enrageAt ?? ENRAGE_TURN.normal) + 1;
  return over > 0 ? 1 + ENRAGE_STEP * over : 1;
}

/** Урон удара врага с учётом места в ряду и ярости: одна формула для боя, пилюли намерения и бота. */
export function enemyHitMult(state: BattleState, e: EnemyState): number {
  // Набор «Яд» 3 (v0.47): отравленный бьёт слабее — яд защитная связка.
  const weakened = state.hero.stats.poisonWeaken > 0 && getStatus(e, 'poison') ? 1 - state.hero.stats.poisonWeaken : 1;
  return (pointBlank(state, e) ? POINT_BLANK_MULT : 1) * enrageMult(state) * weakened;
}

/** Соседи врага по ряду — кого лечит и усиливает поддержка. */
export function neighborsOf(state: BattleState, e: EnemyState): EnemyState[] {
  const i = state.enemies.indexOf(e);
  if (i < 0) return [];
  return [state.enemies[i - 1], state.enemies[i + 1]].filter((x): x is EnemyState => !!x);
}

/**
 * Страж прямо перед целью (v0.46): первый удар героя за ход по тому, кто стоит за ним, он принимает на себя.
 * Оглушённый не прикрывает; прикрыл в этом ходу — второй удар проходит.
 */
export function coveringGuard(state: BattleState, target: EnemyState): EnemyState | null {
  const i = state.enemies.indexOf(target);
  if (i < 1) return null;
  const g = state.enemies[i - 1];
  if (enemyDef(g.defId).role !== 'guard' || g.covered || g.hp <= 0 || getStatus(g, 'stun')) return null;
  return g;
}

/** Бьёт ли действие одну выбранную цель (а не тянет, толкает или проклинает её): только такой удар страж перехватывает. */
function strikesTarget(state: BattleState, action: PlayerAction): boolean {
  if (action.type === 'attack') return state.hero.stats.sweep <= 0;
  if (action.type !== 'artifact') return false;
  const inst = state.hero.artifacts.find((a) => a.id === action.artifactId);
  if (!inst) return false;
  const effects = artifactDef(inst.id).effects?.(inst.tier) ?? [];
  if (effects.some((e) => e.type === 'pull' || e.type === 'push')) return false;
  return effects.some((e) => 'target' in e && e.target === 'enemy' && ['attack', 'spell', 'detonate', 'scorch', 'breakBlock', 'finisher', 'chain', 'blockStrike'].includes(e.type));
}

/** Кого достаёт удар такой дальности: ближний — первого в ряду, любой и удар по ряду — всех. */
export function reachableEnemies(state: BattleState, reach: WeaponReach): EnemyState[] {
  return reach === 'melee' ? state.enemies.slice(0, 1) : state.enemies.slice();
}

/**
 * Дальность действия героя: своя у приёма, у заклинаний — любая цель, у ударов и физических приёмов — как у оружия в руках;
 * базовый удар плетью — по всему ряду ('row'), её приёмы бьют как ближнее оружие.
 */
export function actionReach(state: BattleState, action: PlayerAction): WeaponReach {
  const weapon: Reach = state.hero.stats.reachAny > 0 ? 'any' : 'melee';
  switch (action.type) {
    case 'attack':
      return state.hero.stats.sweep > 0 ? 'row' : weapon;
    case 'artifact': {
      const def = artifactDef(action.artifactId);
      return def.reach ?? (def.school === 'magic' ? 'any' : weapon);
    }
    case 'potion':
      // Зелье во врага — брошенная склянка.
      return 'any';
    case 'defend':
      return 'melee';
  }
}

/** Достаёт ли действие героя до этого врага. */
export function canReach(state: BattleState, action: PlayerAction, uid: number): boolean {
  return reachableEnemies(state, actionReach(state, action)).some((e) => e.uid === uid);
}

/**
 * На сколько процентных пунктов падает уворот вора за каждый срезанный кошель: набитый мешок тянет к земле.
 * Отсюда весь выбор в бою с гномом — бить сразу вслепую или дать ему обворовать себя, зато потом бить наверняка.
 */
export const EVADE_DROP = 12;

// ─── Статусы ───────────────────────────────────────────────────────────────

/** Число врага, домноженное под акт: HP, блок и лечение — на hpMult, урон и DoT — на dmgMult. */
function scaled(mult: number, amount: number): number {
  return Math.max(1, Math.round(amount * mult));
}

function isDot(id: StatusId): boolean {
  return id === 'bleed' || id === 'burn' || id === 'poison';
}

function scaleFor(state: BattleState, def: EnemyDef): { hp: number; dmg: number } {
  return state.act === null ? { hp: 1, dmg: 1 } : enemyScale(locationDef(def.location).tier, state.act, def.rank);
}

export function getStatus(c: Combatant, id: StatusId): Status | undefined {
  return c.statuses.find((s) => s.id === id);
}

export function statusValue(c: Combatant, id: StatusId): number {
  return getStatus(c, id)?.value ?? 0;
}

function removeStatus(c: Combatant, id: StatusId): void {
  c.statuses = c.statuses.filter((s) => s.id !== id);
}

const STACKING: StatusId[] = ['strength', 'thorns', 'regen', 'bleed', 'burn', 'poison', 'dodge', 'cold'];

/**
 * Статусы, у которых складывается срок, а не сила: у скрытности силы нет, и шашка поверх Тени покрова
 * должна продлить тень на свои ходы, а не пропасть под уже висящей (v0.32.3).
 */
const STACKING_TURNS: StatusId[] = ['stealth'];

function addStatus(state: BattleState, c: Combatant, ref: EventTarget, id: StatusId, value: number, turns: number, element?: StatusId): void {
  // «Жаропрочность» (v0.43): огонь на герое не держится — ни от врага, ни от взрыва.
  if (ref === 'hero' && id === 'burn' && state.hero.stats.burnImmune > 0) {
    log(state, 'Жаропрочность: Горение не берёт');
    return;
  }
  // Скованный льдом Холод не копит: иначе он оттаивал бы сразу в новое Оцепенение.
  if (id === 'cold' && getStatus(c, 'frozen')) return;
  const ex = getStatus(c, id);
  if (ex) {
    // Новая заточка поверх старой меняет стихию: оружие держит одну.
    if (element) ex.element = element;
    if (STACKING.includes(id)) ex.value += value;
    else ex.value = Math.max(ex.value, value);
    if (ex.turns === -1 || turns === -1) ex.turns = -1;
    else if (STACKING_TURNS.includes(id)) ex.turns += turns;
    else ex.turns = Math.max(ex.turns, turns);
  } else {
    c.statuses.push(element ? { id, value, turns, element } : { id, value, turns });
  }
  state.events.push({ type: 'status', target: ref, status: id, value });
  const amount = STACKING.includes(id) || id === 'exhaust' || id === 'enchant' ? ` ${value}` : '';
  const flavor = element ? ` (${STATUS_NAMES[element]})` : '';
  log(state, `${nameOf(state, ref)}: ${STATUS_NAMES[id]}${amount}${flavor} ${turnsText(turns)}`);
  if (id === 'cold' && ref !== 'hero') checkFreeze(state, c, ref);
}

/**
 * Холод набрался — враг цепенеет (v0.47): Холод обнуляется, Оцепенение отнимает ход (два — «Вечная мерзлота»),
 * набор «Холод» 3 добавляет Уязвимость. Контроль, а не урон: копить Холод — значит выбирать, чей ход отнять.
 */
function checkFreeze(state: BattleState, c: Combatant, ref: EventTarget): void {
  const cold = getStatus(c, 'cold');
  const e = c as EnemyState;
  if (!cold || cold.value < freezeAt(e)) return;
  removeStatus(c, 'cold');
  e.freezes = (e.freezes ?? 0) + 1;
  const h = state.hero;
  const turns = h.stats.frozenLong > 0 ? 2 : 1;
  const ex = getStatus(c, 'frozen');
  if (ex) ex.value = Math.max(ex.value, turns);
  else c.statuses.push({ id: 'frozen', value: turns, turns: -1 });
  state.events.push({ type: 'status', target: ref, status: 'frozen', value: turns });
  log(state, `${nameOf(state, ref)} цепенеет от холода: пропустит ${turns === 1 ? 'ход' : `${turns} хода`}`);
  if (h.stats.freezeVuln > 0) addStatus(state, c, ref, 'vulnerable', 1, 2);
}

/**
 * Рана, которую вешает герой (v0.43): наборы и ключевые вещи усиливают именно её — «Кровь» 2/3 и «Клятва крови»
 * Кровотечение, «Огонь» 2/3 Горение. Всё, что герой навешивает врагу, идёт сюда; копия чужой раны (Заражение, пожар) — мимо.
 */
export function inflictValue(h: HeroBattle, id: StatusId, value: number): number {
  if (id === 'bleed') return Math.ceil((value + h.stats.bleedAdd) * (1 + h.stats.bleedMult));
  if (id === 'burn') return value + h.stats.burnAdd;
  if (id === 'poison') return value + h.stats.poisonAdd;
  if (id === 'cold') return value + h.stats.coldAdd;
  return value;
}

function heroInflict(state: BattleState, e: EnemyState, id: StatusId, value: number, turns: number, element?: StatusId): void {
  // «Токсиколог» (v0.47): яд героя не спадает по сроку — копится до конца боя.
  const t = id === 'poison' && state.hero.stats.poisonNoDecay > 0 ? -1 : turns;
  addStatus(state, e, e.uid, id, inflictValue(state.hero, id, value), t, element);
}

/**
 * Статусы, которые работают не в свой ход, а в ход противника: скрытность и неуязвимость гасят чужие удары.
 * Их срок считает ходы противника, поэтому тикает не в конце своего хода (тогда статус, наложенный в свой же ход,
 * терял бы ход впустую и «2 хода» прикрывали бы только один ход врага), а в начале следующего своего — статус
 * к этому времени уже отработал ход противника.
 */
const OPPONENT_PHASE: StatusId[] = ['stealth', 'invuln', 'taunt'];

/**
 * Временные статусы теряют ход: обычные — в конце хода владельца (`end`), прикрывающие от чужих ударов —
 * в начале его следующего хода (`start`), уже отработав ход противника.
 */
function tickDurations(c: Combatant, when: 'start' | 'end'): void {
  for (const s of c.statuses) {
    if ((OPPONENT_PHASE.includes(s.id) ? 'start' : 'end') !== when) continue;
    if (s.turns > 0) s.turns--;
  }
  c.statuses = c.statuses.filter((s) => s.turns !== 0);
}

/** Доживёт ли статус до хода врага: бессрочный, с запасом ходов или тикающий только в начале своего хода. */
export function holdsThroughEnemyTurn(s: Status | undefined): boolean {
  return !!s && (s.turns === -1 || s.turns > 1 || OPPONENT_PHASE.includes(s.id));
}

// ─── Утилиты ───────────────────────────────────────────────────────────────

function log(state: BattleState, text: string): void {
  state.log.push(text);
  // Лог боя хранится целиком (уходит в логи забега); страховка от бесконечного боя.
  if (state.log.length > 600) state.log.splice(0, state.log.length - 600);
  state.events.push({ type: 'log', text });
}

/** Имя бойца для лога: герой, враг или союзник по uid. */
function nameOf(state: BattleState, ref: EventTarget): string {
  if (ref === 'hero') return 'Герой';
  return state.enemies.find((e) => e.uid === ref)?.name ?? state.allies.find((a) => a.uid === ref)?.name ?? '???';
}

/** «на 2 хода», «до конца боя». */
function turnsText(turns: number): string {
  if (turns === -1) return 'до конца боя';
  return `на ${turns} ${turns === 1 ? 'ход' : turns < 5 ? 'хода' : 'ходов'}`;
}

/** Прибавка блока любому бойцу: событие для интерфейса и строка лога с источником. */
function gainBlock(state: BattleState, c: Combatant, ref: EventTarget, amount: number, why?: string): void {
  // «Кислота» (v0.48): любой блок героя слабее.
  if (ref === 'hero' && state.trial === 'acid') amount = Math.floor(amount * ACID_BLOCK_MULT);
  if (amount <= 0) return;
  c.block += amount;
  state.events.push({ type: 'block', target: ref, amount });
  log(state, `${nameOf(state, ref)}: +${amount} блока${why ? ` (${why})` : ''}`);
}

/** Что случилось с ударом по дороге к HP — для строки лога. Заполняется damageEnemy/damageHero. */
interface HitDetail {
  /** Съедено блоком. */
  blocked: number;
  /** Урон после уязвимости, если она была; 0 — не было. */
  vuln: number;
  /** Гашение удара кольчугой. */
  reduced: number;
  /** Гашение удара «Боевым трансом». */
  tranced: number;
  /** Урон после «Гнили» (отравленная цель), если она сработала; 0 — нет. */
  rot: number;
  /** Почему урон не дошёл вовсе: уклонение, неуязвимость, тень, дым. */
  miss: string;
}

function newDetail(): HitDetail {
  return { blocked: 0, vuln: 0, reduced: 0, tranced: 0, rot: 0, miss: '' };
}

/** Хвост строки лога по деталям удара: «→ 4 по HP (уязвимость ×1.25, кольчуга −1, блок −3)». */
function hitTail(dmg: number, dealt: number, d: HitDetail, pierce = false): string {
  if (d.miss) return ` → 0 по HP (${d.miss})`;
  const notes: string[] = [];
  if (d.vuln) notes.push(`уязвимость ×${VULNERABLE_MULT} = ${d.vuln}`);
  if (d.rot) notes.push(`гниль = ${d.rot}`);
  if (d.reduced) notes.push(`кольчуга −${d.reduced}`);
  if (d.tranced) notes.push(`транс −${d.tranced}`);
  if (d.blocked) notes.push(`блок −${d.blocked}`);
  if (pierce) notes.push('сквозь блок');
  if (dealt === dmg && notes.length === 0) return '';
  return ` → ${dealt} по HP${notes.length ? ` (${notes.join(', ')})` : ''}`;
}

export function findEnemy(state: BattleState, uid: number): EnemyState | undefined {
  return state.enemies.find((e) => e.uid === uid);
}

function aiCtx(state: BattleState, e: EnemyState): AiCtx {
  return { self: e, enemies: state.enemies, hero: state.hero, turn: state.turn, lineup: state.roster.length };
}

// ─── Урон и лечение ────────────────────────────────────────────────────────

type DamageKind = 'hit' | 'spell' | 'dot' | 'thorns';

interface HitOpts {
  crit?: boolean;
  /** Игнорировать блок цели (Дробящая булава). */
  pierce?: boolean;
  /** Не отвечать шипами: сквозной урон копья. */
  noThorns?: boolean;
  /** Бьёт союзник, а не герой: шипы отвечают ему. */
  attacker?: AllyState;
  /** Куда записать, что съел блок и уязвимость — для строки лога. */
  detail?: HitDetail;
  /** Нужен цели с процентным уворотом (`evade`): бросок делается на каждый удар и каждое заклинание отдельно. */
  rng?: Rng;
  /** Источник урона для `dealtBy`, если он не следует из хода и вида урона (Ответный удар). */
  src?: string;
}

/**
 * Куда записать урон по врагу (v0.42): в ход героя — его приём целиком, со взрывом ран и сквозным ударом; в ход врагов — по виду урона.
 * Перебор сверх остатка HP не считается: иначе добивание слабого врага ударом на 30 выглядело бы главным уроном боя.
 */
function noteDealt(state: BattleState, kind: DamageKind, opts: HitOpts, dealt: number): void {
  if (dealt <= 0) return;
  const key = opts.src ?? (opts.attacker ? 'ally' : state.source || (kind === 'dot' ? 'dot' : kind === 'thorns' ? 'thorns' : 'other'));
  state.dealtBy[key] = (state.dealtBy[key] ?? 0) + dealt;
}

function damageEnemy(state: BattleState, e: EnemyState, amount: number, kind: DamageKind, opts: HitOpts = {}): number {
  const crit = opts.crit ?? false;
  const detail = opts.detail ?? newDetail();
  if (getStatus(e, 'invuln')) {
    state.events.push({ type: 'damage', target: e.uid, amount: 0, kind: 'blocked' });
    detail.miss = 'неуязвим';
    if (!opts.detail) log(state, `${e.name} неуязвим`);
    return 0;
  }
  // Процентный уворот вора: раны (dot) и шипы ему не помеха — только прямые удары и заклинания.
  if (kind === 'hit' || kind === 'spell') {
    const ev = statusValue(e, 'evade');
    if (ev > 0 && opts.rng && chance(opts.rng, ev / 100)) {
      state.events.push({ type: 'damage', target: e.uid, amount: 0, kind: 'blocked' });
      detail.miss = `уворот ${ev} %`;
      if (!opts.detail) log(state, `${e.name} уворачивается (${ev} %)`);
      return 0;
    }
  }
  if (kind === 'hit') {
    const d = getStatus(e, 'dodge');
    if (d) {
      d.value -= 1;
      if (d.value <= 0) removeStatus(e, 'dodge');
      state.events.push({ type: 'damage', target: e.uid, amount: 0, kind: 'blocked' });
      detail.miss = 'уклонился';
      if (!opts.detail) log(state, `${e.name} уворачивается`);
      return 0;
    }
  }
  let rest = Math.max(0, amount);
  if ((kind === 'hit' || kind === 'spell') && getStatus(e, 'vulnerable')) {
    rest = Math.round(rest * VULNERABLE_MULT);
    detail.vuln = rest;
  }
  // «Гниль»: отравленная цель получает от ударов и заклинаний больше — поверх уязвимости, своим множителем.
  if ((kind === 'hit' || kind === 'spell') && state.hero.stats.poisonVuln > 0 && getStatus(e, 'poison')) {
    rest = Math.round(rest * (1 + state.hero.stats.poisonVuln));
    detail.rot = rest;
  }
  // Шипы — такой же физический ответ, как удар: блок их держит (v0.30.1). Раны (dot) блок не трогает.
  if ((kind === 'hit' && !opts.pierce) || kind === 'spell' || kind === 'thorns') {
    const b = Math.min(e.block, rest);
    e.block -= b;
    rest -= b;
    detail.blocked = b;
  }
  noteDealt(state, kind, opts, Math.min(rest, Math.max(0, e.hp)));
  e.hp -= rest;
  state.stats.damageDealt += rest;
  state.events.push({ type: 'damage', target: e.uid, amount: rest, kind: rest === 0 ? 'blocked' : crit ? 'crit' : kind });
  if (kind === 'hit' && !opts.noThorns) {
    const th = statusValue(e, 'thorns');
    if (th > 0 && opts.attacker) {
      log(state, `Шипы ${e.name}: ${th} урона ${opts.attacker.name}`);
      damageAlly(state, opts.attacker, th, true);
    } else if (th > 0 && state.hero.stats.thornsImmune <= 0) {
      log(state, `Шипы ${e.name}: ${th} урона герою`);
      damageHero(state, th, 'thorns');
    }
  }
  return rest;
}

/** `detail` — куда записать судьбу удара для строки лога; без него промахи пишутся в лог отдельной строкой. */
function damageHero(state: BattleState, amount: number, kind: DamageKind, source?: EnemyState, pierce = false, detail?: HitDetail): number {
  const h = state.hero;
  const d = detail ?? newDetail();
  const miss = (why: string): number => {
    state.events.push({ type: 'damage', target: 'hero', amount: 0, kind: 'blocked' });
    d.miss = why;
    if (!detail) log(state, `Герой: ${why}`);
    return 0;
  };
  let rest = Math.max(0, amount);
  if (kind === 'hit') {
    if (getStatus(h, 'stealth')) return miss('враг не видит героя');
    if (getStatus(h, 'invuln')) return miss('неуязвим');
    const dg = getStatus(h, 'dodge');
    if (dg) {
      dg.value -= 1;
      if (dg.value <= 0) removeStatus(h, 'dodge');
      return miss('уклонился');
    }
    if (getStatus(h, 'vulnerable')) {
      rest = Math.round(rest * VULNERABLE_MULT);
      d.vuln = rest;
    }
    // Кольца кольчуги гасят часть каждого удара ещё до блока.
    if (h.stats.hitReduce > 0) {
      d.reduced = Math.min(rest, h.stats.hitReduce);
      rest = Math.max(0, rest - h.stats.hitReduce);
    }
    // «Боевой транс» гасит удар так же, пока герой ранен.
    const tr = tranceReduce(h);
    if (tr > 0) {
      d.tranced = Math.min(rest, tr);
      rest = Math.max(0, rest - tr);
    }
    if (!pierce) {
      const b = Math.min(h.block, rest);
      h.block -= b;
      rest -= b;
      d.blocked = b;
      // «Ответный удар»: блок погасил удар — ударивший получает долю среднего урона оружия с Силой, раз за свой ход.
      if (b > 0 && source && !source.riposted && source.hp > 0 && riposteDamage(h) > 0) {
        source.riposted = true;
        // «Насмешка» (v0.47): ответ сильнее, пока герой дразнит.
        const r = Math.round(riposteDamage(h) * (getStatus(h, 'taunt') ? TAUNT_MULT : 1));
        log(state, `Ответный удар: ${r} урона ${source.name} (щит погасил ${b})`);
        damageEnemy(state, source, r, 'hit', { noThorns: true, src: 'riposte' });
      }
    }
  }
  // Шипы врага тоже упираются в блок героя, но мимо уклонения, уязвимости и колец кольчуги.
  if (kind === 'thorns') {
    const b = Math.min(h.block, rest);
    h.block -= b;
    rest -= b;
    d.blocked = b;
  }
  h.hp -= rest;
  state.stats.damageTaken += rest;
  h.takenNow += rest;
  // «Мученик» (v0.47): каждый удар, дошедший до HP, злит героя — Сила до конца боя.
  if (rest > 0 && kind === 'hit' && h.stats.hitStr > 0 && h.hp > 0) addStatus(state, h, 'hero', 'strength', h.stats.hitStr, -1);
  // «Ярость» Берсерка (v0.44): любая потеря HP копится, Неистовство наступает в начале хода героя.
  if (rest > 0 && h.stats.rageTrait > 0 && h.hp > 0) {
    const r = getStatus(h, 'rage');
    if (r) r.value += rest;
    else h.statuses.push({ id: 'rage', value: rest, turns: -1 });
  }
  state.events.push({ type: 'damage', target: 'hero', amount: rest, kind: rest === 0 ? 'blocked' : kind });
  if (kind === 'hit' && source) {
    const th = Math.round((h.stats.thorns + statusValue(h, 'thorns')) * (getStatus(h, 'taunt') ? TAUNT_MULT : 1));
    if (th > 0) {
      // Набор «Возмездие» 3 (v0.47): шипы колют всех врагов, а не только ударившего.
      const victims = h.stats.thornsAll > 0 ? state.enemies.filter((x) => x.hp > 0) : [source];
      log(state, `Шипы героя: ${th} урона ${h.stats.thornsAll > 0 ? 'всем врагам' : source.name}`);
      for (const v of victims) damageEnemy(state, v, th, 'thorns', { noThorns: true });
    }
  }
  if (h.hp <= 0) {
    h.hp = 0;
    state.phase = 'lost';
    log(state, 'Герой пал.');
  }
  return rest;
}

function healHero(state: BattleState, amount: number, why?: string): void {
  const h = state.hero;
  // «Мученик» (v0.47): лечение не действует вовсе.
  if (h.stats.noHeal > 0 || amount <= 0) return;
  // Набор «Свет» 2 и «Обет» (v0.47): каждое лечение сильнее; «Проклятие склепа» (v0.48) — вдвое слабее.
  amount = Math.round((amount + h.stats.healAdd) * (1 + h.stats.healMult) * (state.trial === 'crypt_curse' ? CRYPT_CURSE_MULT : 1));
  if (amount <= 0) return;
  // «Искупление» Паладина (v0.45): в первый ход боя лечение сильнее.
  if (state.turn === 1 && h.stats.firstTurnHeal > 0) amount = Math.round(amount * (1 + h.stats.firstTurnHeal));
  h.healedTurn += amount;
  const healed = Math.max(0, Math.min(amount, h.maxHp - h.hp));
  if (healed > 0) {
    h.hp += healed;
    state.events.push({ type: 'heal', target: 'hero', amount: healed });
    log(state, `Герой: +${healed} HP${why ? ` (${why})` : ''}`);
  }
  // «Вера» Паладина (v0.44): лечение сверх максимума не пропадает — часть его встаёт блоком.
  const over = amount - healed;
  if (over > 0 && h.stats.overhealBlock > 0 && h.hp > 0) gainBlock(state, h, 'hero', Math.round(over * h.stats.overhealBlock), `вера: избыток лечения ${over}`);
  // Набор «Свет» 3 (v0.47): свет лечит героя и жжёт первого врага на столько же — мимо блока, как рана. Не добивает:
  // лечение случается и в начале хода (регенерация), где разбора мёртвых нет, — враг с нулём HP остался бы в ряду.
  const first = state.enemies.find((e) => e.hp > 1);
  if (h.stats.healSmite > 0 && first && h.hp > 0) {
    const burn = Math.min(amount, first.hp - 1);
    const dealt = damageEnemy(state, first, burn, 'dot', { src: 'light' });
    log(state, `Свет обжигает ${first.name}: ${burn} → ${dealt} по HP`);
  }
}

// ─── Союзники ──────────────────────────────────────────────────────────────

function spawnAlly(state: BattleState, defId: string, hpBonus: number): AllyState {
  const def = enemyDef(defId);
  const a: AllyState = { uid: state.nextUid++, defId, name: def.name, hp: def.hp + hpBonus, maxHp: def.hp + hpBonus, block: 0, statuses: [], cycleIdx: 0 };
  state.allies.push(a);
  state.events.push({ type: 'summon', target: a.uid });
  log(state, `Рядом с героем появляется ${a.name}`);
  return a;
}

function damageAlly(state: BattleState, a: AllyState, amount: number, pierce = false): number {
  let rest = Math.max(0, amount);
  if (!pierce) {
    const b = Math.min(a.block, rest);
    a.block -= b;
    rest -= b;
  }
  a.hp -= rest;
  state.events.push({ type: 'damage', target: a.uid, amount: rest, kind: rest === 0 ? 'blocked' : 'hit' });
  if (a.hp <= 0) {
    state.events.push({ type: 'death', target: a.uid });
    log(state, `${a.name} пал`);
    state.allies = state.allies.filter((x) => x !== a);
    state.allyQueue = state.allyQueue.filter((uid) => uid !== a.uid);
  }
  return rest;
}

/** Ход союзника: действия по циклу его прототипа. Атаки — по самому раненому врагу, баффы — по своим. */
function actAlly(state: BattleState, a: AllyState, rng: Rng): void {
  const def = enemyDef(a.defId);
  a.block = 0;
  const order = def.ai.type === 'boss' ? def.actions.map((x) => x.id) : def.ai.order;
  const action = enemyAction(def, order[a.cycleIdx % order.length]);
  a.cycleIdx = (a.cycleIdx + 1) % order.length;
  state.events.push({ type: 'enemyAction', target: a.uid, name: action.name });
  log(state, `${a.name}: ${action.name}`);
  for (const eff of action.effects) {
    switch (eff.type) {
      case 'attack': {
        let dmg = eff.amount + statusValue(a, 'strength');
        if (getStatus(a, 'weak')) dmg = Math.floor(dmg * 0.75);
        for (let i = 0; i < (eff.hits ?? 1); i++) {
          // Союзник дальности не знает: зверь прыгает на самого раненого. Ограничение «как ближний бой» стоило Магу и Лучнику по 2 пункта (v0.26).
          const target = state.enemies.filter((e) => e.hp > 0).reduce<EnemyState | null>((m, e) => (!m || e.hp < m.hp ? e : m), null);
          if (!target) break;
          log(state, `${a.name} атакует ${target.name}: ${dmg}`);
          damageEnemy(state, target, dmg, 'hit', { attacker: a, rng });
        }
        break;
      }
      case 'buffStr': {
        const targets = eff.target === 'self' ? [a] : eff.target === 'allies' ? state.allies : state.allies.filter((x) => x.defId === a.defId);
        for (const t of targets) addStatus(state, t, t.uid, 'strength', eff.amount, -1);
        break;
      }
      case 'block':
        gainBlock(state, a, a.uid, eff.amount);
        break;
      case 'heal': {
        const healed = Math.min(eff.amount, a.maxHp - a.hp);
        if (healed > 0) {
          a.hp += healed;
          state.events.push({ type: 'heal', target: a.uid, amount: healed });
          log(state, `${a.name}: +${healed} HP`);
        }
        break;
      }
      default:
        log(state, `${a.name} готовится`);
    }
  }
  tickDurations(a, 'end');
  cleanupDead(state, rng);
}

function healEnemy(state: BattleState, e: EnemyState, amount: number, why?: string): void {
  const healed = Math.min(amount, e.maxHp - e.hp);
  if (healed <= 0) return;
  e.hp += healed;
  state.events.push({ type: 'heal', target: e.uid, amount: healed });
  log(state, `${e.name}: +${healed} HP${why ? ` (${why})` : ''}`);
}

/**
 * Вторая фаза босса. Порог проверяется после каждого пакета урона (удар героя, союзник, раны), переход происходит сразу:
 * эффекты перехода ложатся ещё в ход героя, намерение выбирается заново по правилам новой фазы (обязательное продолжение
 * замаха при этом сохраняется). Один раз за бой — `phase` больше не вернётся к 1.
 */
function checkPhases(state: BattleState, rng: Rng): void {
  for (const e of state.enemies) {
    const p2 = enemyDef(e.defId).phase2;
    if (!p2 || e.phase >= 2 || e.hp <= 0 || e.hp > Math.ceil(e.maxHp * p2.atHp)) continue;
    e.phase = 2;
    e.aura = p2.aura;
    state.events.push({ type: 'phase', target: e.uid, name: p2.name, color: p2.aura });
    log(state, `${e.name}: ${p2.name}!`);
    for (const eff of p2.effects) applyEnemyEffect(state, e, eff, rng);
    // Переход стоит боссу ближайшего хода: намерение — синтетический приём без эффектов (PHASE_SHIFT), и только после
    // него ИИ второй фазы выбирает по правилам. Связка первой фазы (forcedNext) во вторую не переносится.
    e.intent = PHASE_SHIFT;
    e.forcedNext = null;
  }
}

function cleanupDead(state: BattleState, rng: Rng): void {
  checkPhases(state, rng);
  // «Неупокоенные» (v0.48): первый павший в бою (не босс) встаёт с половиной HP — один раз за бой.
  if (state.trial === 'restless' && !state.risen) {
    const riser = state.enemies.find((e) => e.hp <= 0 && enemyDef(e.defId).rank !== 'boss' && !getStatus(e, 'doom'));
    if (riser) {
      state.risen = true;
      riser.hp = Math.ceil(riser.maxHp / 2);
      riser.statuses = riser.statuses.filter((st) => st.id === 'strength');
      state.events.push({ type: 'heal', target: riser.uid, amount: riser.hp });
      log(state, `${riser.name} встаёт снова (Неупокоенные): ${riser.hp} HP`);
    }
  }
  const dead = state.enemies.filter((e) => e.hp <= 0);
  if (dead.length === 0) return;
  for (const e of dead) {
    state.events.push({ type: 'death', target: e.uid });
    log(state, `${e.name} повержен`);
    state.stats.kills += 1;
    // «Кровавый жетон»: глоток жизни за каждого убитого.
    if (state.hero.stats.onKillHeal > 0 && state.hero.hp > 0) healHero(state, state.hero.stats.onKillHeal, 'Кровавый жетон');
    // Вторые черты (v0.45): «Страж» Воина — блок за убитого, «Жажда» Берсерка — кровь и Сила.
    if (state.hero.stats.killBlock > 0 && state.hero.hp > 0) gainBlock(state, state.hero, 'hero', state.hero.stats.killBlock, 'страж');
    if (state.hero.stats.killThirst > 0 && state.hero.hp > 0) {
      healHero(state, state.hero.stats.killThirst, 'жажда');
      addStatus(state, state.hero, 'hero', 'strength', 1, -1);
    }
    // «Огненная кровь» (v0.48): павший поджигает героя.
    if (state.trial === 'fire_blood' && state.hero.hp > 0) addStatus(state, state.hero, 'hero', 'burn', trialValue(2, state.act ?? 0), 2);
  }
  // «Абордаж» (v0.48): каждая смерть злит живых.
  if (state.trial === 'boarding') {
    for (const x of state.enemies) if (x.hp > 0) for (let i = 0; i < dead.length; i++) addStatus(state, x, x.uid, 'strength', 1, -1);
  }
  state.enemies = state.enemies.filter((e) => e.hp > 0);
  state.enemyQueue = state.enemyQueue.filter((uid) => state.enemies.some((e) => e.uid === uid));
  // Набор «Огонь» 3/3 (v0.43): пожар — погибший горящий враг перекидывает своё Горение на живых.
  if (state.hero.stats.burnSpread > 0 && state.phase !== 'lost') {
    for (const e of dead) {
      const burn = getStatus(e, 'burn');
      if (!burn || state.enemies.length === 0) continue;
      log(state, `Пожар: ${e.name} поджигает остальных (Горение ${burn.value})`);
      for (const x of state.enemies) addStatus(state, x, x.uid, 'burn', burn.value, burn.turns === -1 ? 2 : Math.max(1, burn.turns));
    }
  }
  // предсмертные эффекты: деление, взрыв
  for (const e of dead) {
    const def = enemyDef(e.defId);
    // Метка «Предсмертие» здесь и флаг: её гасит тот, кто уже отыграл свой эффект (взрыв себя).
    if (!def.onDeath || !getStatus(e, 'doom') || state.phase === 'lost') continue;
    log(state, `${e.name}: ${def.onDeath.name}`);
    for (const eff of def.onDeath.effects) applyEnemyEffect(state, e, eff, rng);
  }
  if (state.enemies.length === 0 && state.phase !== 'lost') {
    state.phase = 'won';
    log(state, 'Победа!');
  }
}

// ─── Герой ─────────────────────────────────────────────────────────────────

/** Герой не виден врагам: скрытность даёт удар в спину и спадает после атаки. */
export function isHidden(h: HeroBattle): boolean {
  return !!getStatus(h, 'stealth');
}

/** Любой урон от героя выдаёт его: скрытность спадает после удара или заклинания. */
function breakStealth(state: BattleState): void {
  if (!isHidden(state.hero)) return;
  removeStatus(state.hero, 'stealth');
  log(state, 'Герой выходит из тени');
}

/**
 * «Защититься» даёт не всю Защиту, а 80 % (округление вверх): при полном DEF одно очко стамины гасило удар целиком,
 * и ни лечение, ни лут не влияли на исход — бот-симулятор приходил к боссам с 90 % HP.
 */
export const DEFEND_MULT = 0.8;

export function defendBlock(stats: { def: number; defendBonus: number }): number {
  return Math.ceil((stats.def + stats.defendBonus) * DEFEND_MULT);
}

/** Сколько блока даст «Защититься» в этом бою: с набором «Щит» и испытаниями локации. */
export function heroDefendGain(state: BattleState): number {
  let gain = defendBlock(state.hero.stats) + state.hero.stats.blockSkillAdd;
  if (state.trial === 'hot_armor') gain = Math.floor(gain * HOT_ARMOR_MULT);
  if (state.trial === 'acid') gain = Math.floor(gain * ACID_BLOCK_MULT);
  return gain;
}

/** Каждая следующая атака в ходу слабее: герой выдыхается. Сила штрафа — стат героя. */
export function fatigueMult(state: BattleState): number {
  // Неистовство Берсерка (v0.44): удары этого хода без усталости.
  if (getStatus(state.hero, 'fury')) return 1;
  return state.hero.stats.fatigue ** state.hero.attacks;
}

/**
 * Сила героя прямо сейчас: стат, временная Сила от статуса и «Боевой транс», который прибавляет свою долю только пока
 * герой ранен — единственный стат, зависящий от текущего состояния боя, поэтому считается здесь, а не в computeStats.
 */
export function heroStr(h: HeroBattle): number {
  return h.stats.str + statusValue(h, 'strength') + tranceStr(h);
}

/**
 * Прибавки удара, зависящие от цели (v0.38): «Резонанс» — за каждое проклятие на ней.
 * Считаются и в бою, и в предпросмотре, поэтому вынесены отдельно. «Кровавый след» с v0.43 — множитель (`strikeMultOn`).
 */
export function vsTargetBonus(h: HeroBattle, target: Combatant): { debuffs: number; total: number } {
  const debuffs = h.stats.perDebuff * debuffCount(target);
  return { debuffs, total: debuffs };
}

/**
 * Множитель удара оружием по этой цели (v0.43): «Кровавый след» — доля сверх по кровоточащей (растёт с оружием, а не плоские +2),
 * ключевые вещи с минусом к удару (`strikeMult`: «Клятва крови», «Пироман»).
 */
export function strikeMultOn(h: HeroBattle, target?: Combatant, row = 0): number {
  const bleed = target && getStatus(target, 'bleed') ? h.stats.vsBleed : 0;
  // «Дистанция» Лучника (v0.44): второй и дальше в ряду — сильнее; стрелок за спиной брута перестаёт быть неудобной целью.
  const far = row >= 1 ? h.stats.farShot : 0;
  // «Вечная мерзлота» (v0.47): лёд держит дольше, но и удар по нему вязнет.
  const ice = target && h.stats.frozenLong > 0 && getStatus(target, 'frozen') ? -0.3 : 0;
  return Math.max(0.1, 1 + h.stats.strikeMult + bleed + far + ice);
}

/** Удар по этой цели выйдет критом наверняка: из тени, «Верным глазом» или по оглушённой (оцепеневшей) с «Оглушающим ударом». */
export function sureCritOn(h: HeroBattle, target?: Combatant): boolean {
  return isHidden(h) || !!getStatus(h, 'focus') || (!!target && h.stats.stunCrit > 0 && isStunned(target));
}

/**
 * Прибавки удара, которые зависят от хода, а не от цели (v0.47): набор «Щит» 3 — доля текущего блока, «Разгон» — за каждый
 * уже сделанный удар хода. `done` — сколько ударов уже засчитано до этого (в бою счётчик растёт до расчёта, в предпросмотре — нет).
 */
function turnBonus(h: HeroBattle, done: number): { shield: number; momentum: number } {
  return { shield: Math.floor(h.block * h.stats.blockToDmg), momentum: h.stats.momentum * Math.max(0, done) };
}

/** Бонус первого удара в ходу (Прицел лука): пока атак в этом ходу не было. */
function firstHitBonus(state: BattleState): number {
  return state.hero.attacks === 0 ? state.hero.stats.firstHit : 0;
}

/**
 * Урон атаки героя и его раскладка для лога: «кубик 4 + Сила 2 + первый удар 1 = 7, усталость ×0.75 = 5, крит ×2 = 10».
 * Слагаемые с нулём и множители, равные единице, не пишутся.
 */
/** Средний удар героя без кубика: середина разброса оружия плюс Сила — основа Финишера и Ответного удара. */
export function heroAvgDamage(h: HeroBattle): number {
  return (h.stats.dmgMin + h.stats.dmgMax) / 2 + heroStr(h);
}

/** Урон Финишера за одну атаку хода: pct процентов среднего удара, не меньше 1. */
export function finisherPer(h: HeroBattle, pct: number): number {
  return Math.max(1, Math.round((heroAvgDamage(h) * pct) / 100));
}

/** Прибавки приёма-удара от хода боя (v0.47): «Око за око» — доля полученного за прошлый ход врагов, «Кара» — лечение этого хода. */
export function attackExtra(h: HeroBattle, eff: { revenge?: number; smite?: number }): { revenge: number; smite: number } {
  return { revenge: eff.revenge ? Math.floor(h.takenLast * eff.revenge) : 0, smite: eff.smite ? Math.floor(h.healedTurn * eff.smite) : 0 };
}

/** Прибавка «Добивания»: цель ранена не выше доли pct от максимума HP. */
export function lowHpBonus(target: Combatant | undefined, lowHp?: { pct: number; bonus: number }): number {
  return target && lowHp && target.hp <= target.maxHp * lowHp.pct ? lowHp.bonus : 0;
}

function heroAttackDamage(state: BattleState, rng: Rng, bonus: number, mult = 1, sureCrit = false, target?: EnemyState, lowHp?: { pct: number; bonus: number }): { dmg: number; crit: boolean; why: string } {
  const h = state.hero;
  const roll = int(rng, h.stats.dmgMin, h.stats.dmgMax);
  const stealthed = isHidden(h);
  const parts: string[] = [`кубик ${roll}`];
  const add = (name: string, v: number) => {
    if (v > 0) parts.push(`${name} ${v}`);
  };
  add('Сила', heroStr(h));
  add('приём', bonus);
  add('первый удар', firstHitBonus(state));
  add('в спину', stealthed ? h.stats.backstab : 0);
  add('резонанс', target ? vsTargetBonus(h, target).debuffs : 0);
  add('добивание', lowHpBonus(target, lowHp));
  // Счётчик ударов уже вырос на этот удар (swing/applyEffect), поэтому разгон считает предыдущие.
  const tb = turnBonus(h, h.strikes - 1);
  add('щит', tb.shield);
  add('разгон', tb.momentum);
  const flat = heroStr(h) + bonus + firstHitBonus(state) + (stealthed ? h.stats.backstab : 0) + (target ? vsTargetBonus(h, target).total : 0) + lowHpBonus(target, lowHp) + tb.shield + tb.momentum;
  const base = roll + flat;
  const steps: string[] = [parts.length > 1 ? `${parts.join(' + ')} = ${base}` : parts[0]];
  const fatigue = fatigueMult(state);
  const row = target ? state.enemies.indexOf(target) : 0;
  const onTarget = strikeMultOn(h, target, row);
  let dmg = Math.floor(base * mult * fatigue * onTarget);
  if (mult !== 1 || fatigue !== 1 || onTarget !== 1) {
    const round = (x: number) => Math.round(x * 100) / 100;
    const bleedPart = target && getStatus(target, 'bleed') && h.stats.vsBleed > 0 ? `по крови +${Math.round(h.stats.vsBleed * 100)} %` : '';
    const keyPart = h.stats.strikeMult !== 0 ? `ключевая вещь ${Math.round(h.stats.strikeMult * 100)} %` : '';
    const farPart = row >= 1 && h.stats.farShot > 0 ? `дистанция +${Math.round(h.stats.farShot * 100)} %` : '';
    const m = [mult !== 1 ? `приём ×${mult}` : '', fatigue !== 1 ? `усталость ×${round(fatigue)}` : '', bleedPart, keyPart, farPart].filter(Boolean).join(', ');
    steps.push(`${m} = ${dmg}`);
  }
  // Шанс крита: свой стат + накопленное «Азартом» + добивание раненой цели («Клеймо палача»).
  const wounded = !!target && target.hp <= target.maxHp * EXECUTE_HP_PCT;
  const critChance = Math.min(1, h.stats.crit + h.critStack + (wounded ? h.stats.executeCrit : 0));
  // «Оглушающий удар»: по оглушённой (и оцепеневшей, v0.47) цели бьют наверняка.
  const stunned = !!target && h.stats.stunCrit > 0 && isStunned(target);
  // «Метка жертвы» Ассасина (v0.45): первый удар по каждому врагу в бою — крит.
  const prey = !!target && h.stats.firstHitCrit > 0 && !target.struck;
  // «Верный глаз» (v0.47) и «Хладнокровие»: крит наверняка есть, случайного — нет.
  const focus = !!getStatus(h, 'focus');
  const rolled = h.stats.critOnlySure <= 0 && critChance > 0 && chance(rng, critChance);
  const crit = sureCrit || stealthed || stunned || prey || focus || rolled;
  if (crit) {
    dmg = Math.floor((dmg * h.stats.critDmg) / 100);
    steps.push(`крит ${h.stats.critDmg} % = ${dmg}`);
  }
  if (getStatus(h, 'weak')) {
    dmg = Math.floor(dmg * 0.75);
    steps.push(`слабость ×0.75 = ${dmg}`);
  }
  return { dmg: Math.max(0, dmg), crit, why: steps.join(', ') };
}

interface StrikeOpts {
  bonus?: number;
  mult?: number;
  sureCrit?: boolean;
  /** Одиночный удар: сквозной урон копья уходит следующему врагу. */
  single?: boolean;
  /** Начало строки лога: «Герой бьёт» у базовой атаки, имя приёма у артефакта. */
  label?: string;
  /** Прибавка по раненой цели («Добивание»). */
  lowHp?: { pct: number; bonus: number };
}

/**
 * Удар героя по врагу со всеми перками оружия: пробой блока, оглушение критом, кровотечение, блок за удар, сквозной урон.
 * Строка лога пишется здесь, до побочных статусов: «Герой бьёт Мумия: 10 (кубик 4 + …) → 8 по HP (блок −2)».
 */
function heroStrike(state: BattleState, rng: Rng, e: EnemyState, opts: StrikeOpts = {}): { dmg: number; crit: boolean } {
  const h = state.hero;
  const fromShadow = isHidden(h);
  const { dmg, crit, why } = heroAttackDamage(state, rng, opts.bonus ?? 0, opts.mult ?? 1, opts.sureCrit, e, opts.lowHp);
  const detail = newDetail();
  const pierce = h.stats.pierceBlock > 0;
  const row = state.enemies.indexOf(e);
  const firstOfBattle = !h.struckAny;
  h.struckAny = true;
  e.struck = true;
  const dealt = damageEnemy(state, e, dmg, 'hit', { crit, pierce, detail, rng });
  log(state, `${opts.label ?? 'Герой бьёт'} ${e.name}: ${dmg} (${why})${hitTail(dmg, dealt, detail, pierce && e.block > 0)}`);
  // «Верный глаз» тратится ударом, даже если тот ушёл в блок или мимо.
  removeStatus(h, 'focus');
  // Набор «Тень» 3 (v0.47): крит возвращает стамину — раз в ход.
  if (crit && h.stats.critSta > 0 && !h.uses['_crit_sta']) {
    h.uses['_crit_sta'] = 1;
    h.sta += h.stats.critSta;
    log(state, `Тень: крит возвращает ${h.stats.critSta} STA`);
  }
  // «Засада» Лучника (v0.45): первый удар боя по второму и дальше в ряду оглушает.
  if (firstOfBattle && h.stats.ambushStun > 0 && row >= 1 && e.hp > 0 && !getStatus(e, 'stun')) {
    addStatus(state, e, e.uid, 'stun', 1, -1);
    log(state, `Засада: ${e.name} оглушён`);
  }
  if (dealt > 0 && e.hp > 0) {
    // Праща: оглушает только критом, и то не каждым — бросок делается лишь после крита, чтобы не тратить RNG на обычных ударах.
    if (h.stats.stunOnCrit > 0 && crit && !getStatus(e, 'stun') && chance(rng, h.stats.stunOnCrit)) addStatus(state, e, e.uid, 'stun', 1, -1);
    if (h.stats.onHitBleed > 0) heroInflict(state, e, 'bleed', h.stats.onHitBleed, 2);
    // Стихийные аффиксы оружия (v0.38.11): заводка ран приходит с клинком, а не только из пула артефактов.
    if (h.stats.onHitBurn > 0) heroInflict(state, e, 'burn', h.stats.onHitBurn, 2);
    if (h.stats.onHitPoison > 0) heroInflict(state, e, 'poison', h.stats.onHitPoison, 3);
    // «Стихийная заточка»: рана стихии с каждого удара, пока заточка держится.
    const ench = getStatus(h, 'enchant');
    if (ench?.element) heroInflict(state, e, ench.element, ench.value, 2);
    // «Метка охотника»: первый удар в ходу открывает цель для остальных.
    if (h.stats.markOnHit > 0 && h.attacks === 0) addStatus(state, e, e.uid, 'vulnerable', 1, h.stats.markOnHit);
    // «Отравитель» Ассасина (v0.44): удар из тени оставляет яд.
    if (fromShadow && h.stats.backstabPoison > 0) heroInflict(state, e, 'poison', h.stats.backstabPoison, 3);
    // «Ледяной клинок» (v0.47): первые N ударов хода вешают Холод — лимит, чтобы серия не морозила каждый ход.
    if (h.stats.onHitCold > 0 && (h.uses['_cold_hits'] ?? 0) < h.stats.onHitCold && !getStatus(e, 'frozen')) {
      h.uses['_cold_hits'] = (h.uses['_cold_hits'] ?? 0) + 1;
      heroInflict(state, e, 'cold', 1, -1);
    }
  }
  // «Азарт» копит шанс с каждого промаха мимо крита, крит обнуляет счётчик; «Жажда крови» лечит за крит.
  if (crit) {
    h.critStack = 0;
    if (h.stats.critHeal > 0) healHero(state, h.stats.critHeal, 'жажда крови');
  } else if (h.stats.critRamp > 0) {
    h.critStack = Math.min(1, h.critStack + h.stats.critRamp);
    log(state, `Азарт: шанс крита +${Math.round(h.stats.critRamp * 100)} % (всего +${Math.round(h.critStack * 100)} %)`);
  }
  if (h.stats.blockOnHit > 0) gainBlock(state, h, 'hero', h.stats.blockOnHit, 'перк оружия');
  const splash = h.stats.splash;
  if (opts.single && splash > 0 && dmg > 0) {
    const next = state.enemies.find((x) => x.uid !== e.uid && x.hp > 0);
    if (next) {
      const part = Math.floor(dmg * splash);
      if (part > 0) {
        log(state, `Сквозной удар по ${next.name}: ${part}`);
        damageEnemy(state, next, part, 'hit', { pierce: h.stats.pierceBlock > 0, noThorns: true, rng });
      }
    }
  }
  return { dmg, crit };
}

export interface DamageRange {
  min: number;
  max: number;
}

/** Предпросмотр разброса урона атаки без крита — для интерфейса. */
export function previewAttack(state: BattleState, bonus = 0, mult = 1, target?: Combatant, lowHp?: { pct: number; bonus: number }): DamageRange {
  const h = state.hero;
  const tb = turnBonus(h, h.strikes);
  const flat = heroStr(h) + bonus + firstHitBonus(state) + (isHidden(h) ? h.stats.backstab : 0) + (target ? vsTargetBonus(h, target).total : 0) + lowHpBonus(target, lowHp) + tb.shield + tb.momentum;
  const row = target ? state.enemies.indexOf(target as EnemyState) : 0;
  const r = strikeRange(h.stats, flat, mult * fatigueMult(state) * strikeMultOn(h, target, Math.max(0, row)));
  if (getStatus(h, 'weak')) return { min: Math.floor(r.min * 0.75), max: Math.floor(r.max * 0.75) };
  return r;
}

/** Ядро разброса удара: (кубик в руках героя + плоские прибавки) × множители, вниз. Общее для боя и карточек вне боя. */
function strikeRange(s: DerivedStats, flat: number, scale: number): DamageRange {
  return { min: Math.max(0, Math.floor((s.dmgMin + flat) * scale)), max: Math.max(0, Math.floor((s.dmgMax + flat) * scale)) };
}

/**
 * Разброс удара вне боя (v0.50): кубик в руках героя, Сила, прибавка приёма и множитель ключевой вещи — без усталости, статусов,
 * цели и бонуса первого удара. Это число карточки, листа «Персонаж» и сокета в консоли; плитка боя считает тем же ядром
 * (previewAttack) и добавляет то, что знает только бой, поэтому её цвет честно показывает, выше или ниже карточки удар сейчас.
 */
export function restAttackRange(s: DerivedStats, bonus = 0, mult = 1): DamageRange {
  return strikeRange(s, s.str + bonus, mult * Math.max(0.1, 1 + s.strikeMult));
}

/** Блок приёма с прибавкой набора «Щит» — тот же, что встанет в бою. */
export function skillBlock(s: DerivedStats, amount: number): number {
  return amount + s.blockSkillAdd;
}

/**
 * Лечение приёма с прибавками набора «Свет» и «Обета» вне боя; «Мученик» глушит его в ноль. Проклятие склепа и «Искупление»
 * первого хода — условия боя, их добавляет healHero.
 */
export function skillHeal(s: DerivedStats, amount: number): number {
  return s.noHeal > 0 ? 0 : Math.round((amount + s.healAdd) * (1 + s.healMult));
}

/**
 * Сколько HP останется у цели после урона из диапазона — для предпросмотра на полоске врага.
 * Удар гасится блоком, если оружие не пробивает его (pierceBlock); заклинание — всегда. Неуязвимость и уклонение
 * (для удара) съедают урон целиком. min — после максимального урона, max — после минимального.
 */
export function previewOnTarget(state: BattleState, e: EnemyState, range: DamageRange, kind: 'hit' | 'spell' | 'dot' = 'hit'): DamageRange {
  const untouched = { min: e.hp, max: e.hp };
  if (getStatus(e, 'invuln')) return untouched;
  // Рана (взрыв ран, пролом щита): мимо блока, уклонения и уязвимости.
  if (kind === 'dot') return { min: Math.max(0, e.hp - range.max), max: Math.max(0, e.hp - range.min) };
  if (kind === 'hit' && getStatus(e, 'dodge')) return untouched;
  const block = kind === 'spell' || state.hero.stats.pierceBlock <= 0 ? e.block : 0;
  const vuln = getStatus(e, 'vulnerable') ? VULNERABLE_MULT : 1;
  const rot = state.hero.stats.poisonVuln > 0 && getStatus(e, 'poison') ? 1 + state.hero.stats.poisonVuln : 1;
  const after = (dmg: number) => Math.max(0, e.hp - Math.max(0, Math.round(Math.round(dmg * vuln) * rot) - block));
  return { min: after(range.max), max: after(range.min) };
}

export function rangeText(r: DamageRange): string {
  return r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`;
}

export function canUseAction(state: BattleState, action: PlayerAction): string | null {
  if (state.phase !== 'player') return 'Не ваш ход';
  const h = state.hero;
  switch (action.type) {
    case 'attack':
      if (h.sta < 1) return 'Нет стамины';
      if (!findEnemy(state, action.target)) return 'Нет цели';
      if (!canReach(state, action, action.target)) return REACH_ERR;
      return null;
    case 'defend':
      if (h.stats.noDefend > 0) return 'Безрассудство: защищаться нельзя';
      if (h.defended) return 'Защита — раз за ход';
      if (h.sta < 1) return 'Нет стамины';
      return null;
    case 'artifact': {
      const def = artifactDef(action.artifactId);
      if (def.kind !== 'active') return 'Пассивный артефакт';
      const inst = h.artifacts.find((a) => a.id === def.id);
      if (!inst) return 'Артефакт не вставлен';
      const cd = h.cooldowns[def.id] ?? 0;
      if (cd > 0) return `Перезарядка: ${cd}`;
      const limit = def.usesPerTurn?.(inst.tier);
      if (limit && (h.uses[def.id] ?? 0) >= limit) return `Не больше ${limit} раз за ход`;
      const cost = effectiveCost(h, def, inst.tier);
      if (cost.sta === 'all' ? h.sta < Math.max(1, h.maxSta) : (cost.sta ?? 0) > h.sta) return cost.sta === 'all' ? 'Нужна вся стамина' : 'Нет стамины';
      if ((cost.mp ?? 0) > h.mp) return 'Нет маны';
      if (def.target === 'enemy' && !findEnemy(state, action.target ?? -1)) return 'Нет цели';
      if (def.target === 'enemy' && !canReach(state, action, action.target ?? -1)) return REACH_ERR;
      if (state.allies.length >= MAX_ALLIES && def.effects?.(inst.tier).some((e) => e.type === 'summon')) return 'Рядом нет места';
      for (const eff of def.effects?.(inst.tier) ?? []) {
        if (eff.type === 'selfDamage' && h.hp <= eff.amount) return 'Слишком мало HP';
        if (eff.type === 'blockStrike' && h.block <= 0) return 'Нет блока';
        if (eff.type === 'breakBlock' && (findEnemy(state, action.target ?? -1)?.block ?? 0) <= 0) return 'У цели нет блока';
        if (eff.type === 'scorch') {
          const t = findEnemy(state, action.target ?? -1);
          if (!t || statusValue(t, 'burn') <= 0) return 'Цель не горит';
        }
        if (eff.type === 'finisher' && h.strikes <= 0) return 'Сначала атакуйте';
        if (eff.type === 'blockBurst' && h.block <= 0) return 'Нет блока';
        if (eff.type === 'amplify' && statusValue(findEnemy(state, action.target ?? -1) ?? h, eff.status) <= 0) return `На цели нет: ${STATUS_NAMES[eff.status]}`;
        if (eff.type === 'chain' && chainCharges(h) <= 0) return 'Сначала примените приём';
      }
      return null;
    }
    case 'potion': {
      if (!h.potion) return 'Нет зелья';
      const def = potionDef(h.potion);
      if (def.effects.some((e) => (e.type === 'attack' || e.type === 'spell') && e.target === 'enemy') && !findEnemy(state, action.target ?? -1)) return 'Нет цели';
      return null;
    }
  }
}

function targetsFor(state: BattleState, target: 'enemy' | 'allEnemies', uid?: number): EnemyState[] {
  if (target === 'allEnemies') return state.enemies.slice();
  const e = findEnemy(state, uid ?? -1) ?? state.enemies[0];
  return e ? [e] : [];
}

function applyEffect(state: BattleState, eff: Effect, targetUid: number | undefined, rng: Rng): void {
  const h = state.hero;
  switch (eff.type) {
    case 'attack': {
      let swung = 0;
      // Удар засчитан Финишеру здесь, а не в performAction: у приёма из двух эффектов их два, у одного удара по всем врагам — один.
      h.strikes += 1;
      // Око за око и Кара (v0.47): прибавка от того, что герой получил за прошлый ход врагов или вылечил в этом.
      const extra = attackExtra(h, eff);
      if (extra.revenge > 0) log(state, `Око за око: +${extra.revenge} (получено ${h.takenLast})`);
      if (extra.smite > 0) log(state, `Кара: +${extra.smite} (вылечено ${h.healedTurn})`);
      for (const e of targetsFor(state, eff.target, targetUid)) {
        // Раскол (v0.47): по оцепеневшей цели — множитель, и лёд раскалывается.
        const shatter = eff.vsFrozen && getStatus(e, 'frozen') ? eff.vsFrozen : 1;
        const { dmg } = heroStrike(state, rng, e, { bonus: eff.bonus + extra.revenge + extra.smite, mult: (eff.mult ?? 1) * shatter, sureCrit: eff.sureCrit, single: eff.target === 'enemy', label: shatter > 1 ? `Раскол ×${shatter} по` : 'Удар по', lowHp: eff.lowHp });
        if (shatter > 1 && e.hp > 0) {
          removeStatus(e, 'frozen');
          log(state, `${e.name}: лёд расколот`);
        }
        swung += dmg;
      }
      // Щитовой удар: блок — доля урона замаха, а не того, что дошло до HP: блок и уклонение врага щит не отменяют.
      if (eff.blockPct && swung > 0) gainBlock(state, h, 'hero', Math.round(swung * eff.blockPct) + h.stats.blockSkillAdd, `${Math.round(eff.blockPct * 100)} % замаха ${swung}`);
      // «Добивание»: убитая цель возвращает стамину — удар, который заканчивает врага, почти бесплатен.
      if (eff.refundOnKill && targetsFor(state, eff.target, targetUid).some((e) => e.hp <= 0)) {
        h.sta += eff.refundOnKill;
        log(state, `Добивание: +${eff.refundOnKill} STA`);
      }
      break;
    }
    case 'blockStrike': {
      // Таран: урон от текущего блока, как удар — гасится блоком врага (кроме булавы), отвечает шипами, но без усталости и крита.
      const dmg = Math.floor(h.block * eff.mult);
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const detail = newDetail();
        const dealt = damageEnemy(state, e, dmg, 'hit', { pierce: h.stats.pierceBlock > 0, detail, rng });
        log(state, `Таран по ${e.name}: ${dmg} (блок ${h.block} × ${eff.mult})${hitTail(dmg, dealt, detail)}`);
      }
      break;
    }
    case 'spell': {
      const base = eff.amount + h.stats.spellPower;
      const why = h.stats.spellPower > 0 ? `${eff.amount} + сила заклинаний ${h.stats.spellPower}` : '';
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const detail = newDetail();
        // «Раздуть»: по горящей цели заклинание сильнее и подкидывает огню ещё ход.
        const burn = h.stats.spellVsBurn > 0 ? getStatus(e, 'burn') : undefined;
        // Ледяной осколок: по уже Слабой цели вдвое — Слабость этого же приёма ляжет позже и не считается.
        const weak = eff.vsWeak && getStatus(e, 'weak') ? eff.vsWeak : 1;
        const amount = Math.round(base * (burn ? 1 + h.stats.spellVsBurn : 1) * weak);
        const dealt = damageEnemy(state, e, amount, 'spell', { detail, rng });
        const notes = [why, burn ? `раздуть ×${1 + h.stats.spellVsBurn}` : '', weak > 1 ? `по слабому ×${weak}` : ''].filter(Boolean).join(', ');
        log(state, `Заклинание по ${e.name}: ${amount}${notes ? ` (${notes})` : ''}${hitTail(amount, dealt, detail)}`);
        if (burn && burn.turns > 0 && e.hp > 0) {
          burn.turns += 1;
          log(state, `${e.name}: Горение продлено на ход`);
        }
      }
      const amount = base;
      if (eff.drain) healHero(state, amount, 'осушение');
      if (h.stats.spellLeech > 0) healHero(state, h.stats.spellLeech, 'перк оружия');
      if (h.stats.blockOnSpell > 0) gainBlock(state, h, 'hero', h.stats.blockOnSpell, 'перк брони');
      break;
    }
    case 'selfDamage':
      log(state, `Герой ранит себя: ${eff.amount}`);
      damageHero(state, eff.amount, 'dot', undefined, true);
      break;
    case 'block':
      gainBlock(state, h, 'hero', skillBlock(h.stats, eff.amount));
      break;
    case 'heal':
      healHero(state, eff.amount, 'лечение');
      break;
    case 'amplify': {
      // Катализатор (v0.47): статус на цели растёт в mult раз — яд не взрывают, а растят.
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const st = getStatus(e, eff.status);
        if (!st) continue;
        const before = st.value;
        st.value = Math.max(before + 1, Math.round(before * eff.mult));
        state.events.push({ type: 'status', target: e.uid, status: eff.status, value: st.value });
        log(state, `${e.name}: ${STATUS_NAMES[eff.status]} ${before} → ${st.value}`);
      }
      break;
    }
    case 'blockBurst': {
      // Обвал щита (v0.47): весь блок уходит разом, каждый враг получает долю — как удар: его блок держит, шипы отвечают.
      const spent = h.block;
      h.block = 0;
      const dmg = Math.floor(spent * eff.pct);
      log(state, `Обвал щита: блок ${spent} → ${dmg} каждому врагу`);
      for (const e of state.enemies.slice()) {
        const detail = newDetail();
        const dealt = damageEnemy(state, e, dmg, 'hit', { pierce: h.stats.pierceBlock > 0, detail, rng });
        log(state, `Обвал по ${e.name}: ${dmg}${hitTail(dmg, dealt, detail)}`);
      }
      break;
    }
    case 'status':
      if (eff.target === 'self') addStatus(state, h, 'hero', eff.status, eff.value, eff.turns);
      else for (const e of targetsFor(state, eff.target, targetUid)) heroInflict(state, e, eff.status, eff.value, eff.turns);
      break;
    case 'gainSta':
      h.sta += eff.amount;
      log(state, `Герой: +${eff.amount} STA`);
      break;
    case 'gainMp': {
      const gained = Math.min(h.maxMp, h.mp + eff.amount) - h.mp;
      h.mp += gained;
      log(state, `Герой: +${gained} MP`);
      break;
    }
    case 'cleanse': {
      const bad: StatusId[] = eff.statuses ?? ['bleed', 'burn', 'poison', 'weak', 'exhaust', 'vulnerable'];
      const had = h.statuses.filter((s) => bad.includes(s.id)).map((s) => STATUS_NAMES[s.id]);
      for (const id of bad) removeStatus(h, id);
      log(state, had.length ? `Снято: ${had.join(', ')}` : 'Снимать нечего');
      break;
    }
    case 'summon':
      if (state.allies.length < MAX_ALLIES) spawnAlly(state, eff.enemyId, eff.hpBonus);
      break;
    case 'pull':
      // Крюк-кошка: цель встаёт первой, остальные сдвигаются назад в прежнем порядке. По первому в ряду приём тоже
      // применим (v0.40.3, ради крови на боссе один на один) — тянуть там просто некуда, строй не двигается.
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const idx = state.enemies.indexOf(e);
        if (idx <= 0) continue;
        state.enemies.splice(idx, 1);
        state.enemies.unshift(e);
        log(state, `${e.name} вытянут в первый ряд`);
      }
      break;
    case 'detonate': {
      // Взрыв ран: что раны нанесли бы за оставшиеся ходы, наносится сейчас — как рана, мимо блока и уворота, без крита и уязвимости.
      const targets = targetsFor(state, eff.target, targetUid);
      const names = eff.statuses.map((id) => STATUS_NAMES[id]).join(', ');
      let pooled = 0;
      if (eff.pooled) {
        for (const e of targets) {
          pooled += remainingDot(e, eff.statuses);
          for (const id of eff.statuses) removeStatus(e, id);
        }
      }
      let any = false;
      for (const e of targets) {
        let raw = pooled;
        if (!eff.pooled) {
          raw = remainingDot(e, eff.statuses);
          for (const id of eff.statuses) removeStatus(e, id);
        }
        const dmg = Math.floor(raw * eff.mult);
        if (dmg <= 0) continue;
        any = true;
        const dealt = damageEnemy(state, e, dmg, 'dot');
        log(state, `Взрыв ран по ${e.name}: ${dmg} (${names} ${raw} × ${eff.mult}) → ${dealt} по HP`);
      }
      if (!any) log(state, `Взрывать нечего: ${names.toLowerCase()} на цели нет`);
      break;
    }
    case 'spread': {
      // Заражение: те же статусы с той же силой и сроком — на всех остальных; стакаются по обычным правилам.
      const src = targetsFor(state, eff.target, targetUid)[0];
      if (!src) break;
      const found = src.statuses.filter((st) => eff.statuses.includes(st.id)).map((st) => ({ ...st }));
      if (found.length === 0) {
        log(state, `Заражать нечем: на ${src.name} нет ${eff.statuses.map((id) => STATUS_NAMES[id].toLowerCase()).join(', ')}`);
        break;
      }
      const pct = eff.pct ?? 1;
      for (const e of state.enemies) {
        if (e === src || e.hp <= 0) continue;
        for (const st of found) addStatus(state, e, e.uid, st.id, Math.max(1, Math.round(st.value * pct)), st.turns);
      }
      break;
    }
    case 'scorch': {
      // Испепеление: Горение цели разом, как рана — мимо блока и уворота; огонь при этом не гаснет.
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const burn = statusValue(e, 'burn');
        if (burn <= 0) {
          log(state, `${e.name} не горит — испепелять нечего`);
          continue;
        }
        const dmg = Math.floor(burn * eff.mult);
        const dealt = damageEnemy(state, e, dmg, 'dot');
        log(state, `Испепеление по ${e.name}: ${dmg} (Горение ${burn} × ${eff.mult}) → ${dealt} по HP`);
      }
      break;
    }
    case 'breakBlock': {
      // Пролом щита: блок цели снимается целиком и бьёт по ней уроном — без кубика, усталости и крита; шипы не отвечают.
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const b = e.block;
        if (b <= 0) {
          log(state, `У ${e.name} нет блока — ломать нечего`);
          continue;
        }
        e.block = 0;
        const dmg = Math.floor(b * eff.mult);
        const detail = newDetail();
        const dealt = damageEnemy(state, e, dmg, 'hit', { pierce: true, noThorns: true, detail, rng });
        log(state, `Пролом щита по ${e.name}: блок ${b} снят, ${dmg} урона (${b} × ${eff.mult})${hitTail(dmg, dealt, detail)}`);
      }
      break;
    }
    case 'finisher': {
      // Финишер: доля среднего урона оружия с Силой за каждую атаку в этом ходу (v0.38.8: растёт с оружием); сам атакой не считается, усталость и кубик не участвуют.
      const per = finisherPer(h, eff.pct);
      const dmg = per * h.strikes;
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const detail = newDetail();
        const dealt = damageEnemy(state, e, dmg, 'hit', { pierce: h.stats.pierceBlock > 0, detail, rng });
        log(state, `Финишер по ${e.name}: ${dmg} (${per} × ${h.strikes} удар(ов); ${eff.pct} % от среднего удара ${heroAvgDamage(h)})${hitTail(dmg, dealt, detail)}`);
      }
      break;
    }
    case 'enchant': {
      // Стихия бросается здесь, при наложении: игрок видит её на бейдже и в логе и строит ход под неё.
      const element = pick(rng, ENCHANT_ELEMENTS);
      addStatus(state, h, 'hero', 'enchant', eff.value, eff.turns, element);
      break;
    }
    case 'chain': {
      // Цепная атака: фиксированный удар вдогонку приёму — без кубика, усталости и крита; шипы не отвечают.
      for (const e of targetsFor(state, eff.target, targetUid)) {
        const detail = newDetail();
        const dealt = damageEnemy(state, e, eff.amount, 'hit', { pierce: h.stats.pierceBlock > 0, noThorns: true, detail, rng });
        log(state, `Цепная атака по ${e.name}: ${eff.amount}${hitTail(eff.amount, dealt, detail)}`);
      }
      break;
    }
    case 'push':
      // Щитовой удар: цель меняется местами со следующим в ряду. Последнего толкать некуда, убитого — незачем:
      // приём этим не запрещён (блок он даёт всё равно), просто строй не двигается.
      for (const e of targetsFor(state, eff.target, targetUid)) {
        if (e.hp <= 0) continue;
        const idx = state.enemies.indexOf(e);
        if (idx < 0 || idx >= state.enemies.length - 1) continue;
        state.enemies.splice(idx, 1);
        state.enemies.splice(idx + 1, 0, e);
        log(state, `${e.name} отброшен назад`);
      }
      break;
  }
}

export function performAction(state: BattleState, action: PlayerAction, rng: Rng): void {
  const err = canUseAction(state, action);
  if (err) throw new Error(err);
  // Страж (v0.46): первый удар за ход по тому, кто стоит за ним, достаётся ему самому.
  if ((action.type === 'attack' || action.type === 'artifact') && action.target !== undefined && strikesTarget(state, action)) {
    const target = findEnemy(state, action.target);
    const guard = target && coveringGuard(state, target);
    if (target && guard) {
      guard.covered = true;
      log(state, `${guard.name} заслоняет ${target.name}`);
      action = { ...action, target: guard.uid };
    }
  }
  // Весь урон этого действия — его: удар, приём со взрывом ран, зелье (dealtBy, v0.42).
  state.source = action.type === 'artifact' ? action.artifactId : action.type;
  try {
    heroAct(state, action, rng);
  } finally {
    state.source = '';
  }
}

function heroAct(state: BattleState, action: PlayerAction, rng: Rng): void {
  const h = state.hero;
  if (action.type === 'attack') {
    h.sta -= 1;
    // «Заряд» Мага (v0.44): обычный удар тратит все заряды — первый замах сильнее за каждый.
    const charges = h.stats.spellCharge > 0 ? statusValue(h, 'charge') : 0;
    let bonus = charges * h.stats.spellCharge;
    if (charges > 0) {
      removeStatus(h, 'charge');
      log(state, `Заряд: ${charges} × ${h.stats.spellCharge} к удару`);
    }
    const swing = (target: EnemyState) => {
      // Замах — один удар для Финишера: плеть по всему ряду и эхо считаются как обычная атака, каждое своё.
      h.strikes += 1;
      if (h.stats.sweep > 0) {
        // Плеть: один замах хлещет по всему ряду на долю урона; сквозного удара копья у неё нет.
        for (const e of state.enemies.slice()) heroStrike(state, rng, e, { mult: SWEEP_MULT, label: 'Герой хлещет', bonus });
      } else {
        heroStrike(state, rng, target, { single: true, bonus });
      }
      bonus = 0;
    };
    swing(findEnemy(state, action.target)!);
    // «Эхо удара»: та же атака ещё раз, с той же усталостью — счётчик атак растёт один раз.
    if (getStatus(h, 'echo')) {
      removeStatus(h, 'echo');
      const again = findEnemy(state, action.target);
      const alive = again && again.hp > 0 ? again : state.enemies.find((e) => e.hp > 0);
      if (alive) {
        log(state, 'Эхо удара');
        swing(alive);
      }
    }
    h.attacks += 1;
    // Набор «Серия» 3 (v0.47): каждый третий удар в ходу — без стамины.
    if (h.stats.thirdFree > 0 && h.attacks % 3 === 0) {
      h.sta += 1;
      log(state, 'Серия: третий удар без стамины');
    }
    if (h.stats.lifesteal > 0) healHero(state, h.stats.lifesteal, 'вампиризм');
    breakStealth(state);
  } else if (action.type === 'defend') {
    h.sta -= 1;
    h.defended = true;
    // Набор «Щит» 2 (v0.47): каждый приём с блоком даёт больше; «Раскалённый доспех» и «Кислота» (v0.48) — меньше.
    const gain = heroDefendGain(state);
    h.block += gain;
    state.events.push({ type: 'block', target: 'hero', amount: gain });
    log(state, `Герой защищается: +${gain} блока`);
  } else if (action.type === 'potion') {
    // Зелье бесплатно: не тратит стамину и не считается атакой, слот пустеет сразу.
    const def = potionDef(h.potion!);
    h.potion = null;
    log(state, `Герой пьёт: ${def.name}`);
    for (const eff of def.effects) {
      applyEffect(state, eff, action.target, rng);
      if (eff.type === 'attack' || eff.type === 'spell') breakStealth(state);
    }
    if (def.effects.some((e) => e.type === 'attack')) h.attacks += 1;
  } else {
    const def = artifactDef(action.artifactId);
    const inst = h.artifacts.find((a) => a.id === def.id)!;
    const cost = effectiveCost(h, def, inst.tier);
    h.sta = cost.sta === 'all' ? 0 : h.sta - (cost.sta ?? 0);
    h.mp -= cost.mp ?? 0;
    const cd = def.cooldown?.(inst.tier) ?? 0;
    if (cd > 0) h.cooldowns[def.id] = cd;
    h.uses[def.id] = (h.uses[def.id] ?? 0) + 1;
    // Цепная атака тратит свой единственный заряд, любой другой приём его взводит (но не копит).
    h.uses[CHAIN_READY] = isChainArtifact(def) ? 0 : 1;
    log(state, `Герой: ${def.name}`);
    const effects = def.effects?.(inst.tier) ?? [];
    // Скрытность спадает после каждого бьющего эффекта, а не после всего приёма: у Двойного выпада в спину бьёт только первый
    // удар. Один эффект по всем (Вихрь) по-прежнему целиком из тени. Счётчик атак растёт один раз — приём и есть одна атака.
    const hits = (eff: Effect) =>
      eff.type === 'attack' || eff.type === 'spell' || eff.type === 'blockStrike' || eff.type === 'detonate' || eff.type === 'breakBlock' || eff.type === 'finisher' || eff.type === 'chain' || eff.type === 'scorch';
    for (const eff of effects) {
      applyEffect(state, eff, action.target, rng);
      if (hits(eff)) breakStealth(state);
    }
    // «Пироман» (v0.43): каждое заклинание поджигает всех врагов.
    if (def.school === 'magic' && h.stats.spellIgniteAll > 0) {
      for (const e of state.enemies) if (e.hp > 0) heroInflict(state, e, 'burn', h.stats.spellIgniteAll, 2);
    }
    // «Перегрев» Мага (v0.45): каждое второе заклинание хода обжигает самого Мага.
    if (def.school === 'magic') {
      h.uses[SPELLS] = (h.uses[SPELLS] ?? 0) + 1;
      if (h.stats.spellDiscount > 0 && h.uses[SPELLS] % 2 === 0 && h.hp > 0) {
        log(state, 'Перегрев: 1 урона себе');
        damageHero(state, 1, 'dot', undefined, true);
      }
    }
    // «Заряд» Мага (v0.44): заклинание копит заряд для обычного удара, до трёх.
    if (def.school === 'magic' && h.stats.spellCharge > 0) {
      const c = getStatus(h, 'charge');
      const n = Math.min(MAX_CHARGES, (c?.value ?? 0) + 1);
      if (c) c.value = n;
      else h.statuses.push({ id: 'charge', value: n, turns: -1 });
      state.events.push({ type: 'status', target: 'hero', status: 'charge', value: n });
      log(state, `Заряд: ${n}`);
    }
    // «Эхо удара»: удары приёма повторяются — только бьющие оружием эффекты (ECHO_EFFECTS), статусы и блок второй раз не идут.
    // Цель повтора ищется заново: первую могло не стать, тогда эхо достаётся следующему живому.
    if (effects.some((e) => echoesEffect(e.type)) && getStatus(h, 'echo')) {
      removeStatus(h, 'echo');
      log(state, 'Эхо удара');
      const again = findEnemy(state, action.target ?? -1);
      const uid = again && again.hp > 0 ? again.uid : state.enemies.find((e) => e.hp > 0)?.uid;
      if (uid !== undefined) for (const eff of effects) if (echoesEffect(eff.type)) applyEffect(state, eff, uid, rng);
    }
    if (effects.some((e) => e.type === 'attack')) h.attacks += 1;
    // «Перекрёстный ток»: первое заклинание в ходу возвращает стамину, первый физический приём — ману.
    if (def.school === 'magic' && h.stats.spellSta > 0 && !h.uses[CROSS_STA]) {
      h.uses[CROSS_STA] = 1;
      h.sta += h.stats.spellSta;
      log(state, `Перекрёстный ток: +${h.stats.spellSta} STA`);
    } else if (def.school === 'physical' && h.stats.skillMp > 0 && !h.uses[CROSS_MP]) {
      h.uses[CROSS_MP] = 1;
      const gained = Math.min(h.maxMp, h.mp + h.stats.skillMp) - h.mp;
      h.mp += gained;
      log(state, `Перекрёстный ток: +${gained} MP`);
    }
  }
  cleanupDead(state, rng);
}

/**
 * Что повторяет «Эхо удара» (v0.40.4): всё, что бьёт оружием, — сама атака, Финишер, Таран, Пролом щита и Цепная атака.
 * Заклинания намеренно за бортом: это «Эхо удара», а не эхо любого приёма. Статусы, блок и взрыв ран второй раз не идут —
 * взрывать после первого раза всё равно нечего, а порез и клич эхо не за что повторять.
 * До v0.40.4 список был короче на один тип (`attack`), и Финишер с Тараном эхо не замечали вовсе: оно даже не тратилось на них.
 */
const ECHO_EFFECTS: Effect['type'][] = ['attack', 'finisher', 'blockStrike', 'breakBlock', 'chain'];

/** Повторится ли этот эффект приёма под «Эхом удара». */
export function echoesEffect(type: Effect['type']): boolean {
  return ECHO_EFFECTS.includes(type);
}

/**
 * Заряд «Цепной атаки»: один, не копится (v0.38.1, решение пользователя). Любой другой приём или заклинание взводит его,
 * цепная атака тратит; два приёма подряд дают всё тот же один заряд. Живёт в `hero.uses` под служебным ключом,
 * сбрасывается вместе с ним в начале хода.
 */
export function chainCharges(h: HeroBattle): number {
  return h.uses[CHAIN_READY] ?? 0;
}

function isChainArtifact(def: ArtifactDef): boolean {
  return !!def.effects?.(1).some((e) => e.type === 'chain');
}

/** Ключ счётчика заклинаний хода в `hero.uses` — для «Перегрева» (v0.45). */
const SPELLS = '_spells';

/**
 * Цена приёма для героя прямо сейчас: «Перегрев» Мага (v0.45) удешевляет заклинания после первого в ходу.
 * Интерфейс берёт отсюда же, чтобы плитка показывала то, что спишется.
 */
export function effectiveCost(h: HeroBattle, def: ArtifactDef, tier: ArtifactInstance['tier']): ReturnType<typeof artifactCost> {
  const cost = artifactCost(def, tier);
  if (def.school === 'magic' && h.stats.spellDiscount > 0 && (h.uses[SPELLS] ?? 0) > 0 && cost.mp) return { ...cost, mp: Math.max(0, cost.mp - h.stats.spellDiscount) };
  return cost;
}

/** Больше трёх зарядов Маг не держит (черта «Заряд», v0.44). */
export const MAX_CHARGES = 3;

/** Сколько накопленного урона нужно Берсерку для Неистовства: треть максимума HP (черта «Ярость», v0.44). */
export function rageThreshold(h: HeroBattle): number {
  return Math.ceil(h.maxHp / 3);
}

/** Ключи в `hero.uses` для «Перекрёстного тока»: раз в ход на каждый ресурс; с id артефактов не пересекаются. */
const CROSS_STA = '_cross_sta';
const CROSS_MP = '_cross_mp';
/** Ключ заряда «Цепной атаки» в `hero.uses`: 1 — приём взвёл её, 0 или нет — нечем бить вдогонку. */
const CHAIN_READY = '_chain_ready';

function startPlayerTurn(state: BattleState): void {
  const h = state.hero;
  state.turn += 1;
  state.phase = 'player';
  // Скрытность отработала ход врага — тикает здесь, а не в конце хода героя.
  tickDurations(h, 'start');
  // Панцирь оставляет часть блока на следующий ход.
  h.block = Math.min(h.block, h.stats.blockKeep);
  h.defended = false;
  h.attacks = 0;
  h.strikes = 0;
  h.uses = {};
  // «Око за око» читает урон прошлого хода врагов, «Кара» — лечение этого хода (v0.47).
  h.takenLast = h.takenNow;
  h.takenNow = 0;
  h.healedTurn = 0;
  const ex = getStatus(h, 'exhaust');
  h.sta = Math.max(0, h.maxSta - (ex?.value ?? 0));
  if (ex) removeStatus(h, 'exhaust');
  // «Боевой транс»: раненому — лишнее очко в начале хода (проверка до ран этого хода, как и Сила — по HP на момент начала).
  if (h.stats.lowHpSta > 0 && inTrance(h)) {
    h.sta += h.stats.lowHpSta;
    log(state, `Боевой транс: +${h.stats.lowHpSta} STA`);
  }
  if (state.turn === 1) h.sta += h.stats.firstTurnSta;
  else h.mp = Math.min(h.maxMp, h.mp + h.stats.mpRegen);
  // «Ярость» Берсерка (v0.44): набралось на треть HP — Неистовство на этот ход.
  const rage = getStatus(h, 'rage');
  if (rage && h.stats.rageTrait > 0 && rage.value >= rageThreshold(h)) {
    rage.value -= rageThreshold(h);
    if (rage.value <= 0) removeStatus(h, 'rage');
    h.sta += 1;
    addStatus(state, h, 'hero', 'fury', 1, 1);
    log(state, 'Неистовство: +1 STA, удары без усталости');
  }
  for (const k of Object.keys(h.cooldowns)) if (h.cooldowns[k] > 0) h.cooldowns[k] -= 1;
  log(state, `— Ход ${state.turn} —`);
  if (state.turn === state.enrageAt) log(state, `Бой затянулся: враги в ярости, урон +${Math.round(ENRAGE_STEP * 100)} % за ход`);
  // «Канонада» (v0.48): каждый третий ход ядра бьют по всем — не добивая: разбора мёртвых в начале хода нет.
  if (state.trial === 'cannonade' && state.turn % 3 === 0) {
    log(state, 'Канонада!');
    for (const e of state.enemies) {
      const dmg = Math.min(e.hp - 1, Math.ceil(e.maxHp * CANNONADE_PCT));
      if (dmg > 0) damageEnemy(state, e, dmg, 'dot', { src: 'trial' });
    }
    const self = Math.min(h.hp - 1, Math.ceil(h.maxHp * CANNONADE_PCT));
    if (self > 0) damageHero(state, self, 'dot', undefined, true);
  }
  // Страж снова готов заслонить; громила, вставший первым, раз за бой наливается Силой (v0.46).
  for (const e of state.enemies) e.covered = false;
  const front = state.enemies[0];
  if (front && !front.fronted && enemyDef(front.defId).role === 'brute') {
    front.fronted = true;
    log(state, `${front.name} впереди ряда — наливается силой`);
    addStatus(state, front, front.uid, 'strength', scaled(front.dmgMult, BRUTE_FRONT_STR), -1);
  }
  // «Плащ странника»: свежий блок каждый ход — после того, как старый сгорел.
  if (h.stats.blockTurn > 0) gainBlock(state, h, 'hero', h.stats.blockTurn, 'плащ');
  // «Жаропрочность»: чем больше вокруг огня, тем толще жаропрочная корка.
  const burning = state.enemies.filter((e) => getStatus(e, 'burn')).length;
  if (h.stats.blockPerBurning > 0 && burning > 0) gainBlock(state, h, 'hero', h.stats.blockPerBurning * burning, `жаропрочность, горят ${burning}`);
  const regen = h.stats.regen + statusValue(h, 'regen');
  if (regen > 0) healHero(state, regen, 'регенерация');
  // «Зной» (v0.48): Горение на герое тикает сильнее.
  const heat = state.trial === 'heat' && getStatus(h, 'burn') ? 1 : 0;
  const dot = statusValue(h, 'bleed') + statusValue(h, 'burn') + statusValue(h, 'poison') + heat;
  if (dot > 0) {
    // «Мазь знахаря» гасит общий тик ран, как кольчуга — удар: бьёт то, что осталось, но раны с героя не снимает.
    const soothed = Math.min(dot, h.stats.dotReduce);
    const left = dot - soothed;
    log(state, soothed > 0 ? `Герой теряет ${left} HP от ран (${dot} − мазь ${soothed})` : `Герой теряет ${dot} HP от ран`);
    if (left > 0) damageHero(state, left, 'dot');
  }
}

export function endTurn(state: BattleState): void {
  if (state.phase !== 'player') return;
  tickDurations(state.hero, 'end');
  state.phase = 'enemy';
  state.allyQueue = state.allies.map((a) => a.uid);
  state.enemyQueue = state.enemies.map((e) => e.uid);
}

// ─── Враги ─────────────────────────────────────────────────────────────────

function chooseIntent(state: BattleState, e: EnemyState, rng: Rng): void {
  const def = enemyDef(e.defId);
  const ctx = aiCtx(state, e);
  e.reason = undefined;
  // Замах (`EnemyAction.next`) и связка босса (`followUp`) — следующий приём уже объявлен, правила его не перебивают.
  if (e.forcedNext && def.ai.type !== 'boss') {
    e.intent = e.forcedNext;
    e.forcedNext = null;
    return;
  }
  if (def.ai.type === 'priority') {
    // Реакции по порядку: первая выполнимая берёт ход. Без броска — игрок читает узор, а не кубик.
    const nextTurn = state.turn + 1;
    for (const r of def.ai.rules) {
      if (r.when && !r.when(ctx)) continue;
      const a = enemyAction(def, r.action);
      if (a.condition && !a.condition(ctx)) continue;
      if (r.cooldown) {
        const last = e.lastUsedTurn[r.action];
        if (last !== undefined && nextTurn - last < r.cooldown) continue;
      }
      if (r.maxUses && (e.uses[r.action] ?? 0) >= r.maxUses) continue;
      e.intent = r.action;
      e.reason = r.hint;
      return;
    }
  }
  if (def.ai.type === 'cycle' || def.ai.type === 'priority') {
    const order = def.ai.order;
    for (let i = 0; i < order.length; i++) {
      const idx = (e.cycleIdx + i) % order.length;
      const a = enemyAction(def, order[idx]);
      if (!a.condition || a.condition(ctx)) {
        e.cycleIdx = idx;
        e.intent = a.id;
        return;
      }
    }
    e.intent = order[e.cycleIdx];
    return;
  }
  if (e.forcedNext) {
    e.intent = e.forcedNext;
    e.forcedNext = null;
    return;
  }
  const nextTurn = state.turn + 1;
  const rules = def.ai.rules;
  let cands = rules.filter((r) => {
    if (r.weight <= 0) return false;
    if (r.condition && !r.condition(ctx)) return false;
    if (r.cooldown) {
      const last = e.lastUsedTurn[r.action];
      if (last !== undefined && nextTurn - last < r.cooldown) return false;
    }
    if (r.maxUses && (e.uses[r.action] ?? 0) >= r.maxUses) return false;
    return true;
  });
  if (cands.length > 1) {
    const noRepeat = cands.filter((r) => r.action !== e.lastAction);
    if (noRepeat.length > 0) cands = noRepeat;
  }
  if (cands.length === 0) cands = rules.filter((r) => r.weight > 0);
  e.intent = weighted(
    rng,
    cands.map((r) => ({ item: r.action, weight: r.weight })),
  );
}

/** Место нового врага в ряду: стартовый состав — по порядку встречи, призванный — вперёд (SUMMON_FRONT), заслоняя призывателя. */
function placeEnemy(state: BattleState, e: EnemyState, summoned: boolean): void {
  if (summoned && SUMMON_FRONT) state.enemies.unshift(e);
  else state.enemies.push(e);
}

function spawnEnemy(state: BattleState, defId: string, rng: Rng, announce: boolean): EnemyState {
  const def = enemyDef(defId);
  const sc = scaleFor(state, def);
  const hp = scaled(sc.hp, def.hp);
  const e: EnemyState = {
    uid: state.nextUid++,
    defId,
    name: def.name,
    hp,
    maxHp: hp,
    block: 0,
    // «Предсмертие» — метка без механики: показывает игроку, что у врага есть эффект при смерти (см. onDeathInfo).
    statuses: def.onDeath ? [{ id: 'doom', value: 0, turns: -1 }] : [],
    intent: def.actions[0].id,
    cycleIdx: 0,
    uses: {},
    lastUsedTurn: {},
    lastAction: null,
    forcedNext: null,
    hpMult: sc.hp,
    dmgMult: sc.dmg,
    phase: 1,
    riposted: false,
  };
  placeEnemy(state, e, announce);
  // Процентный уворот вора: висит статусом, чтобы игрок видел текущий шанс промаха прямо на плитке врага.
  if (def.evade) addStatus(state, e, e.uid, 'evade', def.evade, -1);
  // Стартовый состав выбирает намерения, когда встал весь ряд (createBattle): правила смотрят на соседей и «остался один».
  if (announce) chooseIntent(state, e, rng);
  if (announce) {
    state.events.push({ type: 'summon', target: e.uid });
    log(state, `Появляется ${e.name}`);
  }
  // Тело, вставшее после смерти босса: аура с первого кадра и та же вспышка, что у перехода во вторую фазу.
  if (def.aura) {
    e.aura = def.aura;
    state.events.push({ type: 'phase', target: e.uid, name: e.name, color: def.aura });
  }
  return e;
}

/**
 * Что уже случилось в этом приёме врага: был ли удар и дошёл ли он хоть раз. Рана-довесок (Ядовитый укус, Поджог)
 * — часть удара, а не отдельное проклятие, поэтому уклонение, скрытность и неуязвимость уносят её вместе с уроном (v0.40.2).
 */
interface EnemyActionCtx {
  attacked: boolean;
  landed: boolean;
}

function applyEnemyEffect(state: BattleState, e: EnemyState, eff: EnemyEffect, rng: Rng, ctx?: EnemyActionCtx): void {
  const h = state.hero;
  switch (eff.type) {
    case 'attack': {
      let dmg = scaled(e.dmgMult, eff.amount) + statusValue(e, 'strength');
      if (getStatus(e, 'weak')) dmg = Math.floor(dmg * 0.75);
      // Стрелок в упор и ярость затянувшегося боя (v0.46).
      const mult = enemyHitMult(state, e);
      if (mult !== 1) dmg = Math.max(1, Math.round(dmg * mult));
      const hits = eff.hits ?? 1;
      if (ctx) ctx.attacked = true;
      for (let i = 0; i < hits; i++) {
        if (state.phase === 'lost') break;
        // «Насмешка» (v0.47): враги лезут на героя, союзника не трогают.
        const ally = getStatus(h, 'taunt') ? undefined : state.allies[0];
        if (ally) {
          const dealt = damageAlly(state, ally, dmg, eff.pierce);
          log(state, `${e.name} атакует ${ally.name}: ${dmg} (${dealt} по HP)`);
          if (eff.drain && dealt > 0) healEnemy(state, e, dealt);
          // Удар принял союзник: герой цел, но замах состоялся — довесок ложится как прежде.
          if (ctx) ctx.landed = true;
          continue;
        }
        const detail = newDetail();
        const dealt = damageHero(state, dmg, 'hit', e, eff.pierce, detail);
        log(state, `${e.name} атакует: ${dmg}${hitTail(dmg, dealt, detail, !!eff.pierce && h.block > 0)}`);
        if (eff.drain && dealt > 0) healEnemy(state, e, dealt, 'вампиризм');
        // Блок — не промах: удар дошёл, просто его съел щит.
        if (ctx && !detail.miss) ctx.landed = true;
      }
      break;
    }
    case 'block': {
      const targets = eff.target === 'allies' ? state.enemies : eff.target === 'neighbors' ? neighborsOf(state, e) : [e];
      const amt = scaled(e.hpMult, eff.amount);
      for (const t of targets) gainBlock(state, t, t.uid, amt);
      break;
    }
    case 'buffStr': {
      const targets =
        eff.target === 'self'
          ? [e]
          : eff.target === 'allies'
            ? state.enemies
            : eff.target === 'neighbors'
              ? neighborsOf(state, e)
              : state.enemies.filter((x) => x.defId === e.defId);
      for (const t of targets) addStatus(state, t, t.uid, 'strength', scaled(e.dmgMult, eff.amount), -1);
      break;
    }
    case 'heal': {
      const targets = eff.target === 'self' ? [e] : eff.target === 'neighbors' ? neighborsOf(state, e) : state.enemies;
      for (const t of targets) healEnemy(state, t, scaled(e.hpMult, eff.amount));
      break;
    }
    case 'cleanse': {
      const had = e.statuses.filter((st) => isDot(st.id));
      if (had.length === 0) break;
      e.statuses = e.statuses.filter((st) => !isDot(st.id));
      log(state, `${e.name} очищается: ${had.map((st) => STATUS_NAMES[st.id]).join(', ')} сняты`);
      break;
    }
    case 'reveal':
      if (getStatus(h, 'stealth')) {
        removeStatus(h, 'stealth');
        log(state, `${e.name} слышит героя: Скрытность снята`);
      }
      break;
    case 'debuff':
      if (getStatus(h, 'stealth')) {
        log(state, `${e.name} не видит героя`);
        break;
      }
      // Рана приходит с ударом: удар прошёл мимо — крови, огня и яда тоже нет. Проклятия без удара (Сглаз, Слабость) ложатся сами.
      if (ctx?.attacked && !ctx.landed && isDot(eff.status)) {
        log(state, `Удар прошёл мимо: ${STATUS_NAMES[eff.status].toLowerCase()} не ложится`);
        break;
      }
      addStatus(state, h, 'hero', eff.status, isDot(eff.status) ? scaled(e.dmgMult, eff.value) : eff.value, eff.turns);
      break;
    case 'drainMp': {
      if (getStatus(h, 'stealth')) {
        log(state, `${e.name} не видит героя`);
        break;
      }
      const drained = Math.min(h.mp, eff.amount);
      h.mp -= drained;
      log(state, `Герой теряет ${drained} маны`);
      break;
    }
    case 'summon':
      for (let i = 0; i < eff.count; i++) {
        if (state.enemies.length >= MAX_ENEMIES) break;
        spawnEnemy(state, eff.enemyId, rng, true);
      }
      break;
    case 'invuln':
      addStatus(state, e, e.uid, 'invuln', 1, 1);
      break;
    case 'thorns':
      addStatus(state, e, e.uid, 'thorns', scaled(e.dmgMult, eff.amount), eff.turns ?? -1);
      break;
    case 'dodge':
      addStatus(state, e, e.uid, 'dodge', eff.value, -1);
      break;
    case 'selfDestruct': {
      // Подрыв в упор не слабее: вполсилы бьёт только выстрел, ярость боя — всё.
      const blast = Math.max(1, Math.round((scaled(e.dmgMult, eff.amount) + statusValue(e, 'strength')) * enrageMult(state)));
      const detail = newDetail();
      const dealt = damageHero(state, blast, 'hit', e, false, detail);
      log(state, `${e.name} взрывается: ${blast}${hitTail(blast, dealt, detail)}`);
      // Уклонился от взрыва — не горит: огонь приходит с ударной волной.
      if (eff.burn && !detail.miss && state.phase !== 'lost') addStatus(state, h, 'hero', 'burn', scaled(e.dmgMult, eff.burn), 3);
      // Взрыв уже случился: гасим «Предсмертие», иначе тот же порох рванёт второй раз в разборе мёртвых.
      removeStatus(e, 'doom');
      e.hp = 0;
      break;
    }
    case 'stealGold': {
      state.stolen += eff.amount;
      log(state, `${e.name} срезает кошель: ${eff.amount} золота (всего ${state.stolen})`);
      // Каждый кошель тянет мешок вниз: уворот падает, попасть становится проще.
      const ev = getStatus(e, 'evade');
      if (ev) {
        ev.value = Math.max(0, ev.value - EVADE_DROP);
        state.events.push({ type: 'status', target: e.uid, status: 'evade', value: ev.value });
        if (ev.value <= 0) removeStatus(e, 'evade');
      }
      break;
    }
    case 'stealArtifact': {
      // Крадём из снимка вставленных: что именно уйдёт из сокета, разберёт забег после боя.
      // Вор не разбирает, чьё и последнее ли: тянет что подвернулось, включая персональный артефакт героя.
      // Врождённый навык (v0.44) — не вещь в сокете, красть нечего.
      const pool = h.artifacts.filter((a) => a.id !== h.innate);
      if (state.stolenArtifact || pool.length === 0) {
        log(state, `${e.name} шарит по карманам, но брать нечего`);
        break;
      }
      const art = pick(rng, pool);
      state.stolenArtifact = art;
      log(state, `${e.name} стягивает артефакт: ${artifactDef(art.id).name}`);
      // Вещь ушла из рук прямо сейчас: плитка приёма пропадает, пассивная прибавка снимается с героя.
      h.artifacts = h.artifacts.filter((a) => a !== art);
      stripArtifactMods(state, art);
      // Мешок с добычей тянет вниз — уворот падает так же, как от кошелька (у вещекрада на этот момент его ещё нет: он прикроется следующим ходом).
      const ev = getStatus(e, 'evade');
      if (ev) {
        ev.value = Math.max(0, ev.value - EVADE_DROP);
        state.events.push({ type: 'status', target: e.uid, status: 'evade', value: ev.value });
        if (ev.value <= 0) removeStatus(e, 'evade');
      }
      break;
    }
    case 'evade':
      addStatus(state, e, e.uid, 'evade', eff.value, -1);
      break;
    case 'flee':
      fleeEnemy(state, e);
      break;
    case 'none':
      log(state, `${e.name} готовится`);
      break;
  }
}

/**
 * Снять с героя прибавку украденного артефакта: пассивные моды вычитаются, а текущие HP/MP срезаются
 * до новых максимумов (украли Сердце тролля — герой сразу худеет, но не умирает: остаётся хотя бы 1 HP).
 */
function stripArtifactMods(state: BattleState, art: ArtifactInstance): void {
  const def = artifactDef(art.id);
  const h = state.hero;
  // Активный приём: его плитка пропала, следы в кулдаунах и лимите за ход больше не нужны.
  delete h.cooldowns[art.id];
  delete h.uses[art.id];
  // Моды бывают и у приёма («Оглушающий удар» несёт крит по оглушённым): снимаем у любого, у кого они есть.
  if (!def.mods) return;
  const mods = def.mods(art.tier);
  for (const key of Object.keys(mods) as (keyof DerivedStats)[]) h.stats[key] -= mods[key] ?? 0;
  // Те же границы, что в computeStats: шанс крита 0..1, крит-урон не ниже 100 %, усталость не выше 1.
  h.stats.crit = Math.min(1, Math.max(0, h.stats.crit));
  h.stats.critDmg = Math.max(100, h.stats.critDmg);
  h.stats.fatigue = Math.min(1, h.stats.fatigue);
  h.maxHp = h.stats.maxHp;
  h.maxMp = h.stats.maxMp;
  h.maxSta = h.stats.sta;
  h.hp = Math.max(1, Math.min(h.hp, h.maxHp));
  h.mp = Math.min(h.mp, h.maxMp);
  h.sta = Math.min(h.sta, h.maxSta);
}

/** Враг покидает бой живым: с поля исчезает, в убитые не идёт. Опустело поле — бой закрыт победой с пометкой `fled`. */
function fleeEnemy(state: BattleState, e: EnemyState): void {
  state.enemies = state.enemies.filter((x) => x.uid !== e.uid);
  state.enemyQueue = state.enemyQueue.filter((uid) => uid !== e.uid);
  state.events.push({ type: 'death', target: e.uid });
  log(state, `${e.name} удирает с добычей`);
  state.fled = true;
  if (state.enemies.length === 0 && state.phase !== 'lost') {
    state.phase = 'won';
    log(state, 'Бой окончен');
  }
}

function actEnemy(state: BattleState, e: EnemyState, rng: Rng): void {
  const def = enemyDef(e.defId);
  e.block = 0;
  e.riposted = false;
  // Раны тикают до того, как сгорит неуязвимость (v0.38.9): Топяной ужас и Дракон на взлёте не получают и ран —
  // до этого тик шёл уже после снятия статуса, и яд с кровью били сквозь неуязвимость, которая должна была накрыть ход целиком.
  const dot = statusValue(e, 'bleed') + statusValue(e, 'burn') + statusValue(e, 'poison');
  if (dot > 0) {
    if (getStatus(e, 'invuln')) log(state, `${e.name} неуязвим: раны не берут`);
    else {
      log(state, `${e.name} теряет ${dot} HP от ран`);
      damageEnemy(state, e, dot, 'dot');
      // «Пиявка»: кровь и яд врага питают героя с каждого тика — за каждую рану отдельно (v0.40.2: на отравленном и кровоточащем пьётся вдвое).
      const leeched = state.hero.stats.dotLeech > 0 ? [statusValue(e, 'bleed') > 0, statusValue(e, 'poison') > 0].filter(Boolean).length : 0;
      if (leeched > 0) healHero(state, state.hero.stats.dotLeech * leeched, leeched > 1 ? 'пиявка: кровь и яд' : 'пиявка');
      if (e.hp <= 0) return;
    }
  }
  // Неуязвимость отработала ход героя — снимаем её до действия, а не после.
  tickDurations(e, 'start');
  if (getStatus(e, 'stun')) {
    removeStatus(e, 'stun');
    state.events.push({ type: 'stunned', target: e.uid });
    log(state, `${e.name} оглушён и пропускает ход`);
    tickDurations(e, 'end');
    return;
  }
  // Оцепенение (v0.47): как оглушение, но может держать и два хода («Вечная мерзлота»).
  const frozen = getStatus(e, 'frozen');
  if (frozen) {
    frozen.value -= 1;
    if (frozen.value <= 0) removeStatus(e, 'frozen');
    state.events.push({ type: 'stunned', target: e.uid });
    log(state, `${e.name} скован льдом и пропускает ход`);
    tickDurations(e, 'end');
    return;
  }
  const action = enemyAction(def, e.intent);
  state.events.push({ type: 'enemyAction', target: e.uid, name: action.name });
  log(state, action.id === PHASE_SHIFT ? `${e.name} собирается с силами: ${action.name} — без атаки` : `${e.name}: ${action.name}`);
  const ctx: EnemyActionCtx = { attacked: false, landed: false };
  for (const eff of action.effects) applyEnemyEffect(state, e, eff, rng, ctx);
  e.uses[action.id] = (e.uses[action.id] ?? 0) + 1;
  e.lastUsedTurn[action.id] = state.turn;
  e.lastAction = action.id;
  if (def.ai.type === 'boss') {
    const rule = def.ai.rules.find((r) => r.action === action.id);
    e.forcedNext = rule?.followUp ?? action.next ?? null;
  } else {
    // Круг двигается только своим приёмом: реакция и удар после замаха вставляются между, не съедая шаг цикла.
    if (def.ai.order[e.cycleIdx % def.ai.order.length] === action.id) e.cycleIdx = (e.cycleIdx + 1) % def.ai.order.length;
    e.forcedNext = action.next ?? null;
  }
  // Стрелок в упор (v0.46): выстрелил вполсилы — отходит на клетку назад, вперёд встаёт следующий.
  if (pointBlank(state, e) && e.hp > 0) {
    const i = state.enemies.indexOf(e);
    [state.enemies[i], state.enemies[i + 1]] = [state.enemies[i + 1], state.enemies[i]];
    log(state, `${e.name} отходит назад`);
  }
  tickDurations(e, 'end');
  if (state.phase === 'lost' || e.hp <= 0) return;
  chooseIntent(state, e, rng);
}

/** Выполнить действие одного врага из очереди. Пустая очередь — начало хода игрока. */
export function enemyStep(state: BattleState, rng: Rng): void {
  if (state.phase !== 'enemy') return;
  while (state.allyQueue.length > 0) {
    const uid = state.allyQueue.shift()!;
    const a = state.allies.find((x) => x.uid === uid);
    if (!a) continue;
    actAlly(state, a, rng);
    return;
  }
  while (state.enemyQueue.length > 0) {
    const uid = state.enemyQueue.shift()!;
    const e = findEnemy(state, uid);
    if (!e) continue;
    actEnemy(state, e, rng);
    cleanupDead(state, rng);
    return;
  }
  if (state.phase !== 'enemy') return;
  // Набор «Кровь» 3/3 (v0.43): Кровотечение тикает ещё раз перед ходом героя — заводка окупается в тот же ход.
  if (state.hero.stats.bleedTwice > 0 && state.turn > 0) {
    let ticked = false;
    for (const e of state.enemies.slice()) {
      const bleed = statusValue(e, 'bleed');
      if (bleed <= 0 || getStatus(e, 'invuln')) continue;
      ticked = true;
      log(state, `${e.name} истекает кровью: ${bleed} (набор «Кровь»)`);
      damageEnemy(state, e, bleed, 'dot');
      if (state.hero.stats.dotLeech > 0) healHero(state, state.hero.stats.dotLeech, 'пиявка');
    }
    if (ticked) {
      cleanupDead(state, rng);
      if (state.phase !== 'enemy') return;
    }
  }
  startPlayerTurn(state);
}

export function resolveEnemyTurn(state: BattleState, rng: Rng): void {
  let guard = 0;
  while (state.phase === 'enemy' && guard++ < 100) enemyStep(state, rng);
}

// ─── Создание боя ──────────────────────────────────────────────────────────

export function createBattle(heroDef: HeroDef, hero: HeroPersistent, enemyIds: string[], rng: Rng, act: number | null = null, trial: string | null = null): BattleState {
  const stats = computeStats(heroDef, hero.weapon, hero.armor, statCtxOf(hero));
  // Врождённый навык (v0.44) — в руках героя, как вставленный артефакт: своя плитка, перезарядка и пассивка.
  const innate = innateOf(hero);
  // Ряд по ролям (v0.46): страж и громила впереди, стрелок и поддержка сзади — какой бы ни была запись встречи.
  const lineup = orderByRole(enemyIds);
  const rankOrder: EnemyDef['rank'][] = ['normal', 'elite', 'boss'];
  const top = lineup.reduce((m, id) => Math.max(m, rankOrder.indexOf(enemyDef(id).rank)), 0);
  const state: BattleState = {
    roster: lineup.map((id) => enemyDef(id).name),
    hero: {
      hp: Math.min(hero.hp, stats.maxHp),
      maxHp: stats.maxHp,
      block: 0,
      statuses: [],
      sta: stats.sta,
      maxSta: stats.sta,
      mp: stats.maxMp,
      maxMp: stats.maxMp,
      cooldowns: {},
      uses: {},
      stats,
      artifacts: innate ? [...socketedArtifacts(hero.weapon, hero.armor), innate] : socketedArtifacts(hero.weapon, hero.armor),
      potion: hero.potion,
      defended: false,
      attacks: 0,
      strikes: 0,
      critStack: 0,
      innate: innate?.id ?? null,
      struckAny: false,
      takenLast: 0,
      takenNow: 0,
      healedTurn: 0,
    },
    enemies: [],
    act,
    enrageAt: ENRAGE_TURN[rankOrder[top]],
    trial,
    allies: [],
    turn: 0,
    phase: 'enemy',
    allyQueue: [],
    enemyQueue: [],
    events: [],
    log: [],
    nextUid: 1,
    stolen: 0,
    stolenArtifact: null,
    fled: false,
    stats: { damageDealt: 0, damageTaken: 0, kills: 0 },
    source: '',
    dealtBy: {},
  };
  for (const id of lineup) spawnEnemy(state, id, rng, false);
  // Испытания на врагах (v0.48): «Болотные огни» — уклонение каждому, «Рой» — шипы каждому.
  const tAct = act ?? 0;
  for (const e of state.enemies) {
    if (trial === 'wisps') addStatus(state, e, e.uid, 'dodge', 1, -1);
    if (trial === 'hive_thorns') addStatus(state, e, e.uid, 'thorns', trialValue(1, tAct), -1);
  }
  for (const e of state.enemies) chooseIntent(state, e, rng);
  // Скрытность плаща: первые атаки врага в этом бою промахиваются.
  if (stats.dodgeStart > 0) addStatus(state, state.hero, 'hero', 'dodge', stats.dodgeStart, -1);
  // «Засада»: враги успевают сходить до первого хода героя — их ход нулевой, намерения выбираются заново.
  if (trial === 'ambush') {
    log(state, 'Засада! Враги нападают первыми');
    for (const e of state.enemies.slice()) {
      if (state.phase === 'lost') break;
      if (e.hp > 0) actEnemy(state, e, rng);
    }
    cleanupDead(state, rng);
    if (state.phase === 'lost' || state.phase === 'won') return state;
  }
  startPlayerTurn(state);
  // Испытания на герое — после старта хода: иначе тик начала хода съел бы их первый ход.
  const h = state.hero;
  if (trial === 'mire') addStatus(state, h, 'hero', 'poison', trialValue(1, tAct), 3);
  if (trial === 'heat') addStatus(state, h, 'hero', 'burn', 1, 3);
  if (trial === 'grave_chill') addStatus(state, h, 'hero', 'weak', 1, 2);
  if (trial === 'bog' || trial === 'rolling') {
    h.sta = Math.max(0, h.sta - 1);
    if (trial === 'rolling') h.mp = Math.max(0, h.mp - 1);
    log(state, trial === 'bog' ? 'Топь: −1 STA в первый ход' : 'Качка: −1 STA и −1 MP в первый ход');
  }
  // Тень покрова — после старта первого хода: иначе тик начала хода съел бы ход скрытности. Блок «Плаща странника»
  // первый ход получает уже в startPlayerTurn, вместе со всеми остальными.
  if (stats.stealthStart > 0) addStatus(state, state.hero, 'hero', 'stealth', 1, stats.stealthStart);
  return state;
}

// ─── Намерения ─────────────────────────────────────────────────────────────

export type IntentKind = 'attack' | 'defend' | 'buff' | 'debuff' | 'heal' | 'summon' | 'special';

/**
 * Свойство самого удара, которое надо видеть до его прилёта: `pierce` — блок не спасёт, `drain` — врагу вернётся HP.
 * Пилюля намерения рисует их своей иконкой рядом с числом урона (v0.40.2): в подсказке это было, но подсказку читают уже после.
 */
export type ActionMark = 'pierce' | 'drain';

/**
 * Описание приёма врага: вид для иконки, короткая подпись (урон/блок) и текст подсказки.
 * `kinds` — все виды эффектов приёма по убыванию важности (первый — `kind`), `statuses` — что он вешает на героя:
 * пилюля показывает их рядом с главной иконкой, чтобы дебаф при ударе не прятался в подсказке.
 */
export interface ActionInfo {
  kind: IntentKind;
  icon: string;
  label: string;
  name: string;
  text: string;
  /** Только перечень эффектов, без названия приёма: «Атака 12, Горение 2 на 2 хода». */
  detail: string;
  kinds: IntentKind[];
  statuses: StatusId[];
  /** Статусы, которые враг вешает на себя (шипы, уклонение): хвост пилюли рисует их иконкой, а не общей стрелкой. */
  selfStatuses: StatusId[];
  /** Свойства удара — пробитие блока и вампиризм: своя иконка в голове пилюли. */
  marks: ActionMark[];
}

export interface IntentInfo extends ActionInfo {
  stunned: boolean;
  /** Намерение скрыто испытанием «Чаща» (v0.48): первый ход боя игрок играет вслепую. */
  hidden?: boolean;
}

/**
 * Чем домножать числа приёма при описании: множители акта и текущие статусы врага.
 * В бою берутся из состояния врага, в бестиарии — родные числа без статусов (BASE_SCALE).
 */
export interface ActionScale {
  hpMult: number;
  dmgMult: number;
  strength: number;
  weak: boolean;
  /** Множитель удара от места в ряду и ярости боя (v0.46, `enemyHitMult`); нет — 1. */
  hitMult?: number;
  /** Ярость боя для самоподрыва: в упор он не слабеет. */
  enrage?: number;
}

export const BASE_SCALE: ActionScale = { hpMult: 1, dmgMult: 1, strength: 0, weak: false };

export const INTENT_ICON: Record<IntentKind, string> = {
  attack: '⚔',
  defend: '⛨',
  buff: '↑',
  debuff: '☠',
  heal: '✚',
  summon: '☍',
  special: '✦',
};

const INTENT_PRIORITY: IntentKind[] = ['attack', 'summon', 'debuff', 'heal', 'defend', 'buff', 'special'];

/** Текст приёма (или эффекта при смерти) по его эффектам — общий для намерения в бою и записи бестиария. */
export function describeAction(def: EnemyDef, a: { name: string; effects: EnemyEffect[] }, s: ActionScale = BASE_SCALE): ActionInfo {
  const parts: string[] = [];
  const kinds: IntentKind[] = [];
  const statuses: StatusId[] = [];
  const selfStatuses: StatusId[] = [];
  const marks: ActionMark[] = [];
  let label = '';
  for (const eff of a.effects) {
    switch (eff.type) {
      case 'attack': {
        let dmg = scaled(s.dmgMult, eff.amount) + s.strength;
        if (s.weak) dmg = Math.floor(dmg * 0.75);
        if (s.hitMult && s.hitMult !== 1) dmg = Math.max(1, Math.round(dmg * s.hitMult));
        const hits = eff.hits ?? 1;
        label = hits > 1 ? `${dmg}×${hits}` : `${dmg}`;
        if (eff.pierce) marks.push('pierce');
        if (eff.drain) marks.push('drain');
        const notes = [eff.pierce ? 'сквозь блок' : '', eff.drain ? 'вампиризм' : ''].filter(Boolean);
        parts.push(`Атака ${label}${notes.length ? ` (${notes.join(', ')})` : ''}`);
        kinds.push('attack');
        break;
      }
      case 'block': {
        const blk = scaled(s.hpMult, eff.amount);
        if (!label) label = `${blk}`;
        parts.push(`Блок ${blk}${eff.target === 'allies' ? ' всем' : eff.target === 'neighbors' ? ' соседям' : ''}`);
        kinds.push('defend');
        break;
      }
      case 'dodge':
        parts.push(`Уклонение от ${eff.value} атак(и)`);
        kinds.push('buff');
        selfStatuses.push('dodge');
        break;
      case 'selfDestruct': {
        const dmg = Math.max(1, Math.round((scaled(s.dmgMult, eff.amount) + s.strength) * (s.enrage ?? 1)));
        label = `${dmg}`;
        parts.push(`Самоподрыв ${dmg}${eff.burn ? ` + Горение ${scaled(s.dmgMult, eff.burn)}` : ''}`);
        kinds.push('attack');
        if (eff.burn) {
          kinds.push('debuff');
          statuses.push('burn');
        }
        break;
      }
      case 'stealGold':
        parts.push(`Крадёт ${eff.amount} золота, свой уворот −${EVADE_DROP} %`);
        kinds.push('debuff');
        break;
      case 'stealArtifact':
        parts.push(`Крадёт случайный артефакт, свой уворот −${EVADE_DROP} %`);
        kinds.push('debuff');
        break;
      case 'evade':
        parts.push(`Уворот ${eff.value} %: удары и заклинания мимо`);
        kinds.push('buff');
        break;
      case 'flee':
        parts.push('Удирает с украденным');
        kinds.push('special');
        break;
      case 'none':
        kinds.push('special');
        break;
      case 'buffStr':
        parts.push(
          `+${scaled(s.dmgMult, eff.amount)} к урону (${eff.target === 'self' ? 'себе' : eff.target === 'allies' ? 'всем союзникам' : eff.target === 'neighbors' ? 'соседям' : 'всем: ' + def.name})`,
        );
        kinds.push('buff');
        break;
      case 'heal':
        parts.push(`Лечит ${scaled(s.hpMult, eff.amount)} (${eff.target === 'self' ? 'себя' : eff.target === 'neighbors' ? 'соседей' : 'всех союзников'})`);
        kinds.push('heal');
        break;
      case 'cleanse':
        parts.push('Снимает с себя раны');
        kinds.push('heal');
        break;
      case 'reveal':
        parts.push('Снимает с героя Скрытность');
        kinds.push('debuff');
        break;
      case 'debuff': {
        const dur = eff.turns > 0 ? ` на ${eff.turns} ход(а)` : '';
        const val = isDot(eff.status) ? ` ${scaled(s.dmgMult, eff.value)}` : '';
        parts.push(`${STATUS_NAMES[eff.status]}${val}${dur}`);
        kinds.push('debuff');
        statuses.push(eff.status);
        break;
      }
      case 'drainMp':
        parts.push(`−${eff.amount} маны герою`);
        kinds.push('debuff');
        break;
      case 'summon':
        parts.push(`Призыв: ${enemyDef(eff.enemyId).name}${eff.count > 1 ? ` ×${eff.count}` : ''}`);
        kinds.push('summon');
        break;
      case 'invuln':
        parts.push('Неуязвимость на ход');
        kinds.push('special');
        break;
      case 'thorns':
        parts.push(`Шипы ${scaled(s.dmgMult, eff.amount)}${eff.turns ? ` на ${eff.turns} хода` : ''}`);
        kinds.push('buff');
        selfStatuses.push('thorns');
        break;
    }
  }
  // Замах: сам ход пустой, но игроку важно, что прилетит следом — это и есть предупреждение.
  const next = 'next' in a && typeof a.next === 'string' ? def.actions.find((x) => x.id === a.next) : undefined;
  if (next) parts.push(`следующим ходом — ${describeAction(def, next, s).text}`);
  const kind = INTENT_PRIORITY.find((k) => kinds.includes(k)) ?? 'special';
  return {
    kind,
    icon: INTENT_ICON[kind],
    label: kind === 'attack' || kind === 'defend' ? label : '',
    name: a.name,
    text: parts.length ? `${a.name}: ${parts.join(', ')}` : a.name,
    detail: parts.join(', '),
    kinds: INTENT_PRIORITY.filter((k) => kinds.includes(k)),
    statuses: statuses.filter((id, i) => statuses.indexOf(id) === i),
    selfStatuses: selfStatuses.filter((id, i) => selfStatuses.indexOf(id) === i),
    marks: marks.filter((id, i) => marks.indexOf(id) === i),
  };
}

/**
 * Что случится, когда враг погибнет: описание его onDeath с числами под акт и статусы врага.
 * null — предсмертного эффекта нет. Питает подсказку статуса «Предсмертие».
 */
export function onDeathInfo(e: EnemyState): ActionInfo | null {
  const def = enemyDef(e.defId);
  if (!def.onDeath) return null;
  return describeAction(def, def.onDeath, { hpMult: e.hpMult, dmgMult: e.dmgMult, strength: statusValue(e, 'strength'), weak: !!getStatus(e, 'weak') });
}

/**
 * Через сколько ходов враг сбежит с добычей: 1 — удерёт прямо в этот ход врагов, null — бегством не грозит.
 * Считается по циклу приёмов от объявленного намерения; у боссов с весами (и у циклов с условиями) не предсказуемо — там null.
 */
export function turnsToFlee(e: EnemyState): number | null {
  const def = enemyDef(e.defId);
  // Правила-реакции могут вклиниться в круг, поэтому считаем только чистый цикл (у воров он такой).
  if (def.ai.type !== 'cycle') return null;
  const order = def.ai.order;
  const fleeIds = new Set(def.actions.filter((a) => a.effects.some((eff) => eff.type === 'flee')).map((a) => a.id));
  if (fleeIds.size === 0) return null;
  // Намерение уже объявлено: оно исполнится ближайшим ходом, дальше цикл идёт по порядку.
  // Позицию берём из cycleIdx, а не из поиска по имени: один и тот же приём может стоять в цикле дважды.
  const start = ((e.cycleIdx % order.length) + order.length) % order.length;
  for (let i = 0; i < order.length; i++) {
    if (fleeIds.has(order[(start + i) % order.length])) return i + 1;
  }
  return null;
}

export function computeIntent(e: EnemyState, state?: BattleState): IntentInfo {
  const def = enemyDef(e.defId);
  const a = enemyAction(def, e.intent);
  // Место в ряду и ярость боя меняют число удара (v0.46): без состояния боя — как есть.
  const hitMult = state ? enemyHitMult(state, e) : 1;
  const enrage = state ? enrageMult(state) : 1;
  if (e.intent === PHASE_SHIFT && def.phase2) {
    // Ход перехода: босс не атакует, только ставит стражу — игроку окно на удар, лечение или блок, но не бесплатное.
    const info = describeAction(def, a, { hpMult: e.hpMult, dmgMult: e.dmgMult, strength: 0, weak: false });
    const guard = info.detail ? ` — ${info.detail}` : '';
    return { ...info, text: `${a.name}: босс собирается с силами и в этот ход не атакует${guard}`, detail: `переход во вторую фазу, без атаки${guard}`, stunned: !!getStatus(e, 'stun') };
  }
  const info = describeAction(def, a, { hpMult: e.hpMult, dmgMult: e.dmgMult, strength: statusValue(e, 'strength'), weak: !!getStatus(e, 'weak'), hitMult, enrage });
  const notes = [
    e.reason ? `Реакция: ${e.reason}` : '',
    state && pointBlank(state, e) && info.kinds.includes('attack') ? `В упор: удар ×${POINT_BLANK_MULT}, потом отойдёт назад` : '',
    enrage > 1 ? `Ярость боя: урон ×${enrage.toFixed(1)}` : '',
  ].filter(Boolean);
  const hidden = state?.trial === 'thicket' && state.turn <= 1;
  return { ...info, text: notes.length ? `${info.text}\n${notes.join('\n')}` : info.text, stunned: isStunned(e), hidden };
}

export interface AllyIntentInfo extends IntentInfo {
  /** Кого ударит: самый раненый враг на момент расчёта; null — приём без цели. */
  target: string | null;
}

/**
 * Что союзник сделает после хода героя. Цикл детерминирован: cycleIdx и порядок действий прототипа
 * уже в состоянии. Числа без масштаба акта — союзник бьёт «родными» числами прототипа плюс Сила.
 */
export function computeAllyIntent(state: BattleState, a: AllyState): AllyIntentInfo {
  const def = enemyDef(a.defId);
  const order = def.ai.type === 'boss' ? def.actions.map((x) => x.id) : def.ai.order;
  const action = enemyAction(def, order[a.cycleIdx % order.length]);
  const parts: string[] = [];
  const kinds: IntentKind[] = [];
  let label = '';
  let target: string | null = null;
  for (const eff of action.effects) {
    switch (eff.type) {
      case 'attack': {
        let dmg = eff.amount + statusValue(a, 'strength');
        if (getStatus(a, 'weak')) dmg = Math.floor(dmg * 0.75);
        const hits = eff.hits ?? 1;
        label = hits > 1 ? `${dmg}×${hits}` : `${dmg}`;
        const victim = state.enemies.reduce<EnemyState | null>((m, e) => (!m || e.hp < m.hp ? e : m), null);
        target = victim?.name ?? null;
        parts.push(`Атака ${label}${victim ? ` по ${victim.name}` : ''}`);
        kinds.push('attack');
        break;
      }
      case 'block':
        if (!label) label = `${eff.amount}`;
        parts.push(`Блок ${eff.amount}`);
        kinds.push('defend');
        break;
      case 'buffStr':
        parts.push(`+${eff.amount} к урону (${eff.target === 'self' ? 'себе' : 'союзникам'})`);
        kinds.push('buff');
        break;
      case 'heal':
        parts.push(`Лечит ${eff.amount}`);
        kinds.push('heal');
        break;
      default:
        kinds.push('special');
    }
  }
  const kind = INTENT_PRIORITY.find((k) => kinds.includes(k)) ?? 'special';
  return {
    kind,
    icon: INTENT_ICON[kind],
    label: kind === 'attack' || kind === 'defend' ? label : '',
    name: action.name,
    text: parts.length ? `${action.name}: ${parts.join(', ')}` : action.name,
    detail: parts.join(', '),
    kinds: INTENT_PRIORITY.filter((k) => kinds.includes(k)),
    statuses: [],
    selfStatuses: [],
    marks: [],
    stunned: false,
    target,
  };
}
