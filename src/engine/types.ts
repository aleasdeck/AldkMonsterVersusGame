// ─── Базовые ───────────────────────────────────────────────────────────────

export type GearTier = 1 | 2 | 3 | 4 | 5;
export type ArtTier = 1 | 2 | 3;
export type LocationId = 'forest' | 'crypt' | 'caves' | 'swamp' | 'hive' | 'ship';

/** Тип оружия: ближнее, дальнее, магическое. */
export type WeaponType = 'melee' | 'ranged' | 'magic';
/** Умение героя владеть типом оружия: мастер — полный урон, знаком — 75 %, чужое — 50 %. */
export type Mastery = 'master' | 'trained' | 'foreign';

export const MAX_ENEMIES = 3;
/** Союзников рядом с героем. */
export const MAX_ALLIES = 2;

// ─── Статусы ───────────────────────────────────────────────────────────────

export type StatusId =
  | 'strength' // +value к урону атак, до конца боя
  | 'weak' // урон атак −25 %, turns ходов
  | 'bleed' // value урона в начале хода, turns ходов
  | 'burn' // то же, магический флейвор
  | 'stun' // пропуск следующего действия (только враги)
  | 'exhaust' // −value STA на следующем ходу (только герой)
  | 'dodge' // следующие value атак не наносят урона
  | 'thorns' // атакующий получает value урона
  | 'regen' // +value HP в начале хода
  | 'invuln'; // не получает урона, turns ходов

export interface Status {
  id: StatusId;
  value: number;
  /** −1 — до конца боя. */
  turns: number;
}

// ─── Производные статы героя ───────────────────────────────────────────────

export interface DerivedStats {
  maxHp: number;
  def: number;
  maxMp: number;
  mpRegen: number;
  sta: number;
  str: number;
  /** Разброс урона оружия без учёта Силы. */
  dmgMin: number;
  dmgMax: number;
  thorns: number;
  lifesteal: number;
  regen: number;
  /** 0..1 */
  crit: number;
  spellPower: number;
  firstTurnSta: number;
  /** Во сколько раз слабее каждая следующая атака в ходу. */
  fatigue: number;
  // ── Перки оружия ──
  /** Бонус урона первого удара в ходу. */
  firstHit: number;
  /** Множитель крита (обычно 2). */
  critMult: number;
  /** >0 — удары игнорируют блок врага. */
  pierceBlock: number;
  /** >0 — герой не получает урон от шипов врага при ударе. */
  thornsImmune: number;
  /** Доля урона одиночного удара, которая достаётся следующему врагу. */
  splash: number;
  /** Кровотечение, которое вешает каждый удар (на 2 хода). */
  onHitBleed: number;
  /** >0 — крит оглушает цель. */
  stunOnCrit: number;
  /** Блок за каждый удар. */
  blockOnHit: number;
  /** Лечение за каждое заклинание. */
  spellLeech: number;
}

export type StatMods = Partial<DerivedStats>;

// ─── Артефакты ─────────────────────────────────────────────────────────────

export type TargetKind = 'enemy' | 'allEnemies' | 'self';

export type Effect =
  | { type: 'attack'; bonus: number; target: 'enemy' | 'allEnemies'; /** Доля урона оружия, 1 — полный. */ mult?: number; sureCrit?: boolean }
  | { type: 'spell'; amount: number; target: 'enemy' | 'allEnemies'; drain?: boolean }
  | { type: 'block'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'status'; target: TargetKind; status: StatusId; value: number; turns: number }
  | { type: 'gainSta'; amount: number }
  /** Призыв союзника по описанию врага; hpBonus — прибавка к его HP. */
  | { type: 'summon'; enemyId: string; hpBonus: number }
  /** Герой ранит себя: мимо блока и защиты. Нельзя применить, если HP не больше amount. */
  | { type: 'selfDamage'; amount: number };

export interface ArtifactDef {
  id: string;
  name: string;
  glyph: string;
  kind: 'passive' | 'active';
  school?: 'physical' | 'magic';
  cost?: { sta?: number; mp?: number };
  cooldown?: (tier: ArtTier) => number;
  target?: TargetKind;
  effects?: (tier: ArtTier) => Effect[];
  mods?: (tier: ArtTier) => StatMods;
  describe: (tier: ArtTier) => string;
}

export interface ArtifactInstance {
  id: string;
  tier: ArtTier;
}

// ─── Экипировка ────────────────────────────────────────────────────────────

export type GearKind = 'weapon' | 'armor';

/** Случайный бонус предмета: прибавка к одному стату. */
export interface GearAffix {
  stat: keyof DerivedStats;
  value: number;
}

export interface GearInstance {
  kind: GearKind;
  tier: GearTier;
  /** id базы («sword», «bow», «mail»): у оружия задаёт тип и перк. */
  base: string;
  name: string;
  /** Разброс урона (оружие). У брони 0. */
  dmgMin: number;
  dmgMax: number;
  /** Защита (броня). */
  def: number;
  /** HP (броня). */
  hp: number;
  affix: GearAffix | null;
  slots: (ArtifactInstance | null)[];
}

// ─── Спрайты ───────────────────────────────────────────────────────────────

export type HeadStyle = 'helmet' | 'hat' | 'hood' | 'plume' | 'horns' | 'bare' | 'skull' | 'crown' | 'cap';

export type SpriteSpec =
  | { type: 'humanoid'; head: HeadStyle; palette: Record<string, string> }
  | { type: 'blob'; palette: { outline: string; body: string; shade: string; eye: string }; seed?: string; size?: number };

// ─── Герои ─────────────────────────────────────────────────────────────────

export interface HeroDef {
  id: string;
  name: string;
  role: string;
  hp: number;
  def: number;
  mp: number;
  mpRegen: number;
  sta: number;
  /** Врождённый шанс крита, 0..1. */
  crit?: number;
  /** Своя усталость: во сколько раз слабее каждая следующая атака в ходу (по умолчанию 0.75). */
  fatigue?: number;
  /** Умение владения каждым типом оружия. */
  mastery: Record<WeaponType, Mastery>;
  weapon: { base: string; name: string; dmgMin: number; dmgMax: number };
  armor: { base: string; name: string; def: number; hp: number };
  artifacts: [string, string];
  sprite: SpriteSpec;
}

// ─── Враги ─────────────────────────────────────────────────────────────────

export type EnemyEffect =
  /** pierce — игнорирует блок героя, drain — лечит атакующего на нанесённый урон. */
  | { type: 'attack'; amount: number; hits?: number; pierce?: boolean; drain?: boolean }
  | { type: 'block'; amount: number; target?: 'self' | 'allies' }
  | { type: 'buffStr'; amount: number; target: 'self' | 'allies' | 'kind' }
  | { type: 'heal'; amount: number; target: 'self' | 'allies' }
  | { type: 'debuff'; status: StatusId; value: number; turns: number }
  | { type: 'drainMp'; amount: number }
  | { type: 'summon'; enemyId: string; count: number }
  | { type: 'invuln' }
  | { type: 'thorns'; amount: number }
  | { type: 'dodge'; value: number }
  /** Урон герою, после чего враг погибает. */
  | { type: 'selfDestruct'; amount: number; burn?: number }
  /** Замах: ход без эффекта, готовит следующий приём. */
  | { type: 'none' };

export interface AiCtx {
  self: EnemyState;
  enemies: EnemyState[];
  hero: HeroBattle;
  turn: number;
}

export interface EnemyAction {
  id: string;
  name: string;
  effects: EnemyEffect[];
  /** Для циклов: действие пропускается, если условие ложно. */
  condition?: (ctx: AiCtx) => boolean;
}

export interface BossRule {
  action: string;
  /** 0 — только через followUp. */
  weight: number;
  condition?: (ctx: AiCtx) => boolean;
  /** Не чаще, чем раз в N ходов. */
  cooldown?: number;
  /** Максимум раз за бой. */
  maxUses?: number;
  /** Обязательное следующее действие. */
  followUp?: string;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  location: LocationId;
  rank: 'normal' | 'elite' | 'boss';
  actions: EnemyAction[];
  ai: { type: 'cycle'; order: string[] } | { type: 'boss'; rules: BossRule[] };
  /** Срабатывает при смерти: деление, взрыв. */
  onDeath?: { name: string; effects: EnemyEffect[] };
  sprite: SpriteSpec;
}

// ─── Состояние боя ─────────────────────────────────────────────────────────

export interface Combatant {
  hp: number;
  maxHp: number;
  block: number;
  statuses: Status[];
}

export interface HeroBattle extends Combatant {
  sta: number;
  maxSta: number;
  mp: number;
  maxMp: number;
  cooldowns: Record<string, number>;
  stats: DerivedStats;
  /** Снимок вставленных артефактов на момент начала боя. */
  artifacts: ArtifactInstance[];
  /** «Защититься» уже использовано в этом ходу. */
  defended: boolean;
  /** Сколько атакующих действий сделано в этом ходу — каждое следующее слабее. */
  attacks: number;
}

export interface EnemyState extends Combatant {
  uid: number;
  defId: string;
  name: string;
  /** id действия, объявленного на следующий ход. */
  intent: string;
  cycleIdx: number;
  uses: Record<string, number>;
  lastUsedTurn: Record<string, number>;
  lastAction: string | null;
  forcedNext: string | null;
  /** Множители под акт забега: HP/блок/лечение и урон/DoT. Считаются при появлении. */
  hpMult: number;
  dmgMult: number;
}

/** Союзник героя: ходит по правилам своего врага-прототипа, бьёт сам, враги атакуют его первым. */
export interface AllyState extends Combatant {
  uid: number;
  defId: string;
  name: string;
  cycleIdx: number;
}

export type EventTarget = 'hero' | number;

export type BattleEvent =
  | { type: 'damage'; target: EventTarget; amount: number; kind: 'hit' | 'dot' | 'thorns' | 'spell' | 'blocked' | 'crit' }
  | { type: 'heal'; target: EventTarget; amount: number }
  | { type: 'block'; target: EventTarget; amount: number }
  | { type: 'status'; target: EventTarget; status: StatusId; value: number }
  | { type: 'death'; target: number }
  | { type: 'summon'; target: number }
  | { type: 'enemyAction'; target: number; name: string }
  | { type: 'stunned'; target: number }
  | { type: 'log'; text: string };

export interface BattleState {
  hero: HeroBattle;
  enemies: EnemyState[];
  /** Акт забега (0..2) для масштабирования врагов; null — без масштабирования. */
  act: number | null;
  allies: AllyState[];
  turn: number;
  phase: 'player' | 'enemy' | 'won' | 'lost';
  /** Союзники ходят первыми после хода игрока, затем враги. */
  allyQueue: number[];
  enemyQueue: number[];
  events: BattleEvent[];
  log: string[];
  nextUid: number;
  stats: { damageDealt: number; damageTaken: number; kills: number };
}

export type PlayerAction =
  | { type: 'attack'; target: number }
  | { type: 'defend' }
  | { type: 'artifact'; artifactId: string; target?: number };

// ─── Забег ─────────────────────────────────────────────────────────────────

export type RoomKind = 'fight' | 'event' | 'elite' | 'boss';

export interface LootArtifact {
  kind: 'artifact';
  artifact: ArtifactInstance;
}
export interface LootGear {
  kind: 'gear';
  gear: GearInstance;
}
export type LootItem = LootArtifact | LootGear;

export interface HeroPersistent {
  defId: string;
  hp: number;
  weapon: GearInstance;
  armor: GearInstance;
}

export type RunPhase = 'map' | 'battle' | 'reward' | 'event' | 'camp' | 'victory' | 'defeat';

/** Откуда награда — по нему же перебрасываются варианты. */
export type RewardSource = 'fight' | 'elite' | 'bossGear' | 'bossArt';

export interface RewardScreen {
  title: string;
  source: RewardSource;
  options: LootItem[];
  /** Переброс уже потрачен (один на экран). */
  rerolled: boolean;
}

export interface PendingPlacement {
  /** Артефакты, ждущие выбора слота; обрабатываются по одному. */
  artifacts: ArtifactInstance[];
  /** Можно отменить и вернуться к выбору (награда ещё не потрачена). */
  cancellable: boolean;
  /** После размещения или отказа снять текущий экран награды. */
  consumeReward: boolean;
}

export type EventOption =
  | { id: 'spring'; title: string; desc: string }
  | { id: 'altar'; title: string; desc: string; artifact: ArtifactInstance }
  | { id: 'chest'; title: string; desc: string; gear: GearInstance };

export interface RunStats {
  kills: number;
  turns: number;
  damageDealt: number;
  damageTaken: number;
  roomsCleared: number;
}

export const SAVE_VERSION = 6;

export interface RunState {
  version: typeof SAVE_VERSION;
  seed: number;
  rng: { state: number };
  hero: HeroPersistent;
  /** Золото: капает за бои, тратится на переброс наград. */
  gold: number;
  /** Три локации этого забега в порядке прохождения — без повторов. */
  locations: LocationId[];
  locationIndex: number;
  roomIndex: number;
  phase: RunPhase;
  battle: BattleState | null;
  /** Очередь экранов награды: первый — текущий. */
  rewards: RewardScreen[];
  event: { options: EventOption[] } | null;
  pending: PendingPlacement | null;
  stats: RunStats;
}
