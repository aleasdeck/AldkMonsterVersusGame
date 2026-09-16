// ─── Базовые ───────────────────────────────────────────────────────────────

export type GearTier = 1 | 2 | 3 | 4 | 5;
export type ArtTier = 1 | 2 | 3;
export type LocationId = 'forest' | 'crypt' | 'caves' | 'swamp' | 'hive' | 'ship';

/** Тип оружия: ближнее, дальнее, магическое. */
export type WeaponType = 'melee' | 'ranged' | 'magic';
/** Тип брони: тяжёлая, средняя, лёгкая. */
export type ArmorType = 'heavy' | 'medium' | 'light';

/**
 * Дальность удара героя (v0.26): ближний бой достаёт только первого в ряду врага — ближайшего к герою,
 * дальний — любого. Заклинания, брошенные склянки и приёмы по всем врагам дальности не знают.
 */
export type Reach = 'melee' | 'any';

/** Дальность базы оружия: как у действия, плюс 'row' — удар хлещет по всему ряду (плеть). */
export type WeaponReach = Reach | 'row';

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
  | 'invuln' // не получает урона, turns ходов
  | 'poison' // value урона в начале хода, turns ходов; яд ассасина
  | 'stealth' // враги не видят героя; любая атака — удар в спину (крит) и снимает статус (только герой)
  | 'vulnerable' // получает на 25 % больше урона от ударов и заклинаний (VULNERABLE_MULT), turns ходов
  | 'doom' // предсмертие: метка врага с onDeath — сам ничего не делает, но в подсказке видно, что случится после его гибели (только враги)
  | 'evade' // процентный уворот: удар или заклинание по владельцу с шансом value % мимо; раны (DoT) и шипы бьют всегда (только враги)
  | 'echo' // эхо удара: следующая атака героя в этом ходу повторяется (только герой, v0.38)
  | 'enchant'; // стихийная заточка: каждый удар героя вешает на цель рану `element` силой value на 2 хода (только герой, v0.38.7)

export interface Status {
  id: StatusId;
  value: number;
  /** −1 — до конца боя. */
  turns: number;
  /** Стихия заточки (`enchant`): какая рана ложится с удара — Горение, Яд или Кровотечение. */
  element?: StatusId;
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
  /** Шанс критического удара, 0..1. */
  crit: number;
  /**
   * Крит. урон: сколько процентов обычного урона наносит крит. 150 — полтора урона.
   * До v0.21 был множителем ×2 у всех; теперь база у каждого героя своя, снаряжение прибавляет проценты.
   */
  critDmg: number;
  /** Прибавка к шансу крита за каждый некритический удар в бою; крит сбрасывает накопленное («Азарт»). */
  critRamp: number;
  /** Прибавка к шансу крита по врагу ниже EXECUTE_HP_PCT здоровья («Клеймо палача»). */
  executeCrit: number;
  /** Лечение героя за каждый критический удар («Жажда крови»). */
  critHeal: number;
  spellPower: number;
  firstTurnSta: number;
  /** Во сколько раз слабее каждая следующая атака в ходу. */
  fatigue: number;
  // ── Перки оружия ──
  /** Бонус урона первого удара в ходу. */
  firstHit: number;
  /** >0 — удары игнорируют блок врага. */
  pierceBlock: number;
  /** >0 — герой не получает урон от шипов врага при ударе. */
  thornsImmune: number;
  /** Доля урона одиночного удара, которая достаётся следующему врагу. */
  splash: number;
  /** Кровотечение, которое вешает каждый удар (на 2 хода): перк дротиков, аффикс «Кровавый». */
  onHitBleed: number;
  /** Горение с каждого удара на 2 хода (аффикс «Горящий», v0.38.11). */
  onHitBurn: number;
  /** Яд с каждого удара на 3 хода (аффикс «Ядовитый», v0.38.11). */
  onHitPoison: number;
  /** Шанс 0..1, что критический удар оглушит цель (праща); обычные удары не оглушают. */
  stunOnCrit: number;
  /** Блок за каждый удар. */
  blockOnHit: number;
  /** Лечение за каждое заклинание. */
  spellLeech: number;
  // ── Перки брони ──
  /** На сколько слабее каждый удар врага по герою (после уклонения, до блока). */
  hitReduce: number;
  /** Блок сверх DEF за «Защититься». */
  defendBonus: number;
  /** Столько блока переживает начало хода вместо полного сгорания. */
  blockKeep: number;
  /** Блок за каждое заклинание. */
  blockOnSpell: number;
  /** Уклонений в начале боя: первые N атак врага промахиваются. */
  dodgeStart: number;
  /** Скрытности в начале боя, ходов (покров). */
  stealthStart: number;
  /** Бонус урона удара из скрытности (стилет). */
  backstab: number;
  /** Лечение героя за каждого убитого врага («Кровавый жетон»). */
  onKillHeal: number;
  /** Блок в начале каждого хода («Плащ странника»). */
  blockTurn: number;
  /** Первый удар героя в ходу вешает Уязвимость на N ходов («Метка охотника»). */
  markOnHit: number;
  /** >0 — оружие достаёт любого врага в ряду (дальнее, магическое, копьё); 0 — только первого. */
  reachAny: number;
  /** >0 — базовый удар хлещет по всему ряду на SWEEP_MULT урона (перк плети «Хлёст», только у владеющего); приёмы бьют как ближнее оружие. */
  sweep: number;
  /** Прибавка к Силе, пока герой ранен — HP ниже доли TRANCE_HP_PCT (combat.ts) от максимума («Боевой транс» Берсерка). */
  lowHpStr: number;
  /** Стамина сверх максимума в начале каждого хода, пока герой ранен (тот же порог; «Боевой транс»). */
  lowHpSta: number;
  /** Гашение каждого удара врага (как `hitReduce`), пока герой ранен (тот же порог; «Боевой транс»). */
  lowHpReduce: number;
  /** >0 — когда блок героя гасит удар врага, ударивший получает столько процентов среднего урона оружия с Силой («Ответный удар» Воина). */
  riposte: number;
  // ── Связки (v0.38) ──
  /** Прибавка к удару по кровоточащей цели («Кровавый след»). */
  vsBleed: number;
  /** Лечение героя за каждый тик кровотечения или яда на враге («Пиявка»). */
  dotLeech: number;
  /** Доля (0..1), на которую удары и заклинания сильнее по отравленной цели («Гниль»). */
  poisonVuln: number;
  /** Доля (0..1), на которую заклинание сильнее по горящей цели; заклинание ещё и продлевает Горение на ход («Раздуть»). */
  spellVsBurn: number;
  /** Прибавка к удару за каждое проклятие на цели: Слабость, Кровотечение, Горение, Яд, Оглушение, Уязвимость («Резонанс»). */
  perDebuff: number;
  /** Стамина за первое заклинание в ходу («Перекрёстный ток»). */
  spellSta: number;
  /** Мана за первый физический приём в ходу («Перекрёстный ток»). */
  skillMp: number;
  /** >0 — удар по оглушённой цели всегда крит («Оглушающий удар», v0.38). */
  stunCrit: number;
}

export type StatMods = Partial<DerivedStats>;

// ─── Анимации боя ──────────────────────────────────────────────────────────

/**
 * Род типовой анимации приёма: взмах оружием в руке, стрела, магический снаряд, брошенная склянка.
 * Облако дебафа и свечение бафа выводятся из событий боя и в данных не задаются.
 */
export type FxKind = 'melee' | 'arrow' | 'orb' | 'flask';

/** Настройка типовой анимации: род (по умолчанию выводится из эффектов и оружия) и цвет. */
export interface FxSpec {
  kind?: FxKind;
  color?: string;
}

// ─── Артефакты ─────────────────────────────────────────────────────────────

export type TargetKind = 'enemy' | 'allEnemies' | 'self';

export type Effect =
  | {
      type: 'attack';
      bonus: number;
      target: 'enemy' | 'allEnemies';
      /** Доля урона оружия, 1 — полный. */
      mult?: number;
      sureCrit?: boolean;
      /** Доля нанесённого урона, которая становится Блоком героя (Щитовой удар): блок растёт вместе с оружием. */
      blockPct?: number;
      /** Столько стамины вернётся, если удар убьёт цель («Добивание»). */
      refundOnKill?: number;
      /** Прибавка к удару по раненой цели: HP не выше доли pct от максимума («Добивание», v0.38.3). */
      lowHp?: { pct: number; bonus: number };
    }
  /**
   * Взорвать раны (v0.38): оставшийся урон перечисленных статусов на цели (сила × ходы) снимается и наносится сразу, ×mult,
   * как рана — мимо блока, без крита и уязвимости. `pooled` — по всем врагам: снятое со всех складывается и бьёт каждого («Взрыв пламени»).
   */
  | { type: 'detonate'; statuses: StatusId[]; target: 'enemy' | 'allEnemies'; mult: number; pooled?: boolean }
  /** Заражение: перечисленные статусы с цели копируются на всех остальных врагов (сила и срок те же, стакаются как обычно). */
  | { type: 'spread'; statuses: StatusId[]; target: 'enemy' }
  /** Пролом щита: весь блок цели снимается и наносится ей уроном × mult — мимо блока, без кубика, усталости и крита. Без блока приём недоступен. */
  | { type: 'breakBlock'; mult: number; target: 'enemy' }
  /** Финишер: урон = (pct % среднего урона оружия с Силой) × число атак героя в этом ходу, без кубика и усталости; счётчик атак не растёт. Без атак недоступен. */
  | { type: 'finisher'; pct: number; target: 'enemy' }
  /**
   * Цепная атака: фиксированный удар без кубика, усталости и крита; атакой не считается. Доступна только по заряду —
   * каждый другой приём или заклинание в этом ходу даёт один (`chainCharges`), без заряда «Сначала примените приём».
   */
  | { type: 'chain'; amount: number; target: 'enemy' }
  /** Стихийная заточка: на turns ходов каждый удар героя вешает случайную рану (Горение, Яд или Кровотечение) силой value на 2 хода; стихия бросается при наложении. */
  | { type: 'enchant'; value: number; turns: number }
  /** Удар щитом (Таран): урон равен текущему Блоку героя × mult. Кубик оружия, Сила и усталость не участвуют, блок не тратится. */
  | { type: 'blockStrike'; mult: number; target: 'enemy' }
  /** vsWeak — множитель по цели со Слабостью (Ледяной осколок, v0.38): проверяется до статусов самого приёма. */
  | { type: 'spell'; amount: number; target: 'enemy' | 'allEnemies'; drain?: boolean; vsWeak?: number }
  | { type: 'block'; amount: number }
  | { type: 'heal'; amount: number }
  | { type: 'status'; target: TargetKind; status: StatusId; value: number; turns: number }
  | { type: 'gainSta'; amount: number }
  /** Призыв союзника по описанию врага; hpBonus — прибавка к его HP. */
  | { type: 'summon'; enemyId: string; hpBonus: number }
  /** Герой ранит себя: мимо блока и защиты. Нельзя применить, если HP не больше amount. */
  | { type: 'selfDamage'; amount: number }
  | { type: 'gainMp'; amount: number }
  /** Снять с героя раны и проклятия: кровотечение, горение, яд, слабость, изнурение, уязвимость; statuses — только перечисленные (Глухая оборона). */
  | { type: 'cleanse'; statuses?: StatusId[] }
  /** Притянуть цель в первый ряд (Крюк-кошка): она встаёт под удар ближнего боя, остальные сдвигаются назад. */
  | { type: 'pull'; target: 'enemy' }
  /** Отбросить цель на клетку назад (Щитовой удар): следующий в ряду встаёт первым. Последнего в ряду толкать некуда. */
  | { type: 'push'; target: 'enemy' };

export interface ArtifactCost {
  sta?: number | 'all';
  mp?: number;
}

/**
 * Тип сокета (v0.31): оружейный принимает только оружейные артефакты, бронный — только бронные, универсальный — любые.
 * В оружии не бывает бронных сокетов, в броне — оружейных.
 */
export type SlotKind = 'weapon' | 'armor' | 'any';

/** Тип артефакта: в какой сокет он встаёт. Оружейные — всё, что бьёт и растит урон; бронные — HP, ресурсы, блок, выживание. */
export type ArtifactSlot = 'weapon' | 'armor';

export interface ArtifactDef {
  id: string;
  name: string;
  glyph: string;
  kind: 'passive' | 'active';
  /** В какой сокет встаёт: оружейный или бронный (универсальный сокет принимает оба). */
  slot: ArtifactSlot;
  school?: 'physical' | 'magic';
  /** Цена: число или вся стамина ('all' — нужна полная, уходит целиком); может зависеть от тира. */
  cost?: ArtifactCost | ((tier: ArtTier) => ArtifactCost);
  cooldown?: (tier: ArtTier) => number;
  /** Не больше N применений за ход (Волшебная стрела: без перезарядки, но не бесконечно). */
  usesPerTurn?: (tier: ArtTier) => number;
  target?: TargetKind;
  /**
   * Своя дальность приёма по цели. Без поля: заклинания достают любого врага, физические приёмы бьют как оружие в руках.
   * Щит и порез — всегда ближний бой, брошенный флакон — любая цель.
   */
  reach?: Reach;
  effects?: (tier: ArtTier) => Effect[];
  mods?: (tier: ArtTier) => StatMods;
  describe: (tier: ArtTier) => string;
  /** Анимация в бою: цвет снаряда или взмаха; род — если не тот, что следует из эффектов (Флакон яда — склянка). */
  fx?: FxSpec;
}

export interface ArtifactInstance {
  id: string;
  tier: ArtTier;
}

// ─── Зелья ─────────────────────────────────────────────────────────────────

/** Зелье: расходник без тира, один слот у героя, применяется в бою бесплатно и пропадает. */
export interface PotionDef {
  id: string;
  name: string;
  glyph: string;
  effects: Effect[];
  describe: string;
  /** Бесполезно герою без маны — не выпадает ему. */
  needsMp?: boolean;
  /** Цвет склянки в анимации: бросок во врагов или глоток. */
  fx?: FxSpec;
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
  /**
   * Тип каждого сокета, параллельно slots (v0.31). Короче slots быть не должен; на всякий случай
   * недостающие сокеты считаются универсальными (slotKindAt в equipment.ts).
   */
  slotKinds: SlotKind[];
}

// ─── Спрайты ───────────────────────────────────────────────────────────────

export type HeadStyle = 'helmet' | 'hat' | 'hood' | 'plume' | 'horns' | 'bare' | 'skull' | 'crown' | 'cap' | 'mask';

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
  /** Шанс крита, 0..1. */
  crit?: number;
  /** Крит. урон в процентах обычного (150 — полтора урона). */
  critDmg?: number;
  /** Своя усталость: во сколько раз слабее каждая следующая атака в ходу (по умолчанию 0.75). */
  fatigue?: number;
  /** Умение владеть типом оружия: владеет — полный кубик и перк базы, не владеет — кубик вдвое и перк не работает. */
  weaponSkill: Record<WeaponType, boolean>;
  /** Умение носить тип брони: умеет — перк базы работает, не умеет — броня даёт только DEF, HP и аффикс. */
  armorSkill: Record<ArmorType, boolean>;
  weapon: { base: string; name: string; dmgMin: number; dmgMax: number };
  armor: { base: string; name: string; def: number; hp: number };
  /**
   * Персональные артефакты (v0.33 — пара): один из них стоит на старте в предмете своего типа, второй сокет пуст.
   * Первый открыт всегда, второй — после победы этим героем (профиль, `heroWins`); выбор — на экране героя.
   * Выбранный выпадает в забеге только этому герою (дубликат апгрейдит стоящий, выброшенный находится снова),
   * невыбранный в этом забеге не выпадает никому. Другим героям персональные не попадаются вовсе.
   */
  signatures: [string, string];
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
  | { type: 'thorns'; amount: number; turns?: number } // turns — на срок (стража перехода), без него навсегда
  | { type: 'dodge'; value: number }
  /** Урон герою, после чего враг погибает. */
  | { type: 'selfDestruct'; amount: number; burn?: number }
  /** Срезать кошель: amount золота копится в добыче вора (`BattleState.stolen`), мешок тяжелеет — уворот падает на EVADE_DROP. */
  | { type: 'stealGold'; amount: number }
  /** Стянуть артефакт: случайный из вставленных у героя уходит в мешок вора (`BattleState.stolenArtifact`); красть нечего — приём вхолостую. */
  | { type: 'stealArtifact' }
  /** Накинуть себе процентный уворот (статус `evade`): value процентов ударов и заклинаний пройдут мимо. */
  | { type: 'evade'; value: number }
  /** Удрать с добычей: враг покидает бой, не считаясь убитым. Пустое поле боя — победа с пометкой `fled`. */
  | { type: 'flee' }
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
  /** Анимация приёма — только у элиты и боссов; рядовые враги просто наскакивают. */
  fx?: FxSpec;
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
  /** Процентный уворот при появлении (статус `evade`, 0..100): столько процентов ударов и заклинаний проходит мимо. */
  evade?: number;
  /** Множитель размера спрайта в бою (1 — как у всех своего ранга): гном мельче элиты, ему 0.7. */
  spriteScale?: number;
  /** Срабатывает при смерти: деление, взрыв. */
  onDeath?: { name: string; effects: EnemyEffect[] };
  /**
   * Вторая фаза босса: как только HP опускается до доли `atHp` от максимума, босс тут же (ещё в ход героя) меняет
   * облик — разыгрывает `effects`, получает ауру цвета `aura` и `phase = 2`; правила ИИ различают фазы через `ctx.self.phase`.
   */
  /** Вторая фаза: порог доли HP, эффекты в момент перехода, аура и `guard` — что босс делает на ходу перехода вместо атаки (v0.36: блок, уклонение, неуязвимость или шипы на срок). */
  phase2?: { atHp: number; name: string; effects: EnemyEffect[]; guard: EnemyEffect[]; aura: string };
  /** Аура с появления: тело, вставшее после смерти босса (Развоплощённый лич, Призрак капитана). */
  aura?: string;
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
  /** Сколько раз каждый приём применён в этом ходу — для лимита usesPerTurn. Сбрасывается в начале хода. */
  uses: Record<string, number>;
  stats: DerivedStats;
  /** Снимок вставленных артефактов на момент начала боя. */
  artifacts: ArtifactInstance[];
  /** Зелье в слоте на этот бой; выпито — null. Переносится обратно в забег после победы. */
  potion: string | null;
  /** «Защититься» уже использовано в этом ходу. */
  defended: boolean;
  /** Сколько атакующих действий сделано в этом ходу — каждое следующее слабее. */
  attacks: number;
  /** Накопленный «Азартом» шанс крита: растёт с каждого некрита, крит обнуляет. */
  critStack: number;
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
  /** Фаза босса: 1 — обычная, 2 — после перехода `EnemyDef.phase2`. У рядовых всегда 1. */
  phase: number;
  /** Цвет зловещей ауры (вторая фаза босса или тело, вставшее после смерти); нет — ауры нет. */
  aura?: string;
  /** Уже получил «Ответный удар» в этом своём ходу: не больше одного ответа каждому врагу за ход. */
  riposted: boolean;
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
  /** Босс перешёл во вторую фазу или встал после смерти: вспышка и аура цвета `color`, всплывает `name`. */
  | { type: 'phase'; target: number; name: string; color: string }
  | { type: 'log'; text: string };

export interface BattleState {
  hero: HeroBattle;
  enemies: EnemyState[];
  /** Имена врагов на старте боя — заголовок лога в журнале забега (к концу боя все они мертвы). */
  roster: string[];
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
  /** Золото, которое вор уже срезал в этом бою: вернётся герою, если вора убить, и пропадёт, если тот удерёт. */
  stolen: number;
  /** Артефакт, стянутый вором: вернётся в свой сокет, если вора убить, и пропадёт вместе с ним, если тот удерёт. */
  stolenArtifact: ArtifactInstance | null;
  /** Враг сбежал, а не погиб: бой закрыт победой, но добыча ушла с ним. */
  fled: boolean;
  stats: { damageDealt: number; damageTaken: number; kills: number };
}

export type PlayerAction =
  | { type: 'attack'; target: number }
  | { type: 'defend' }
  | { type: 'artifact'; artifactId: string; target?: number }
  /** Выпить зелье из слота: не стоит стамины, слот пустеет. */
  | { type: 'potion'; target?: number };

// ─── Забег ─────────────────────────────────────────────────────────────────

/** Клетки этажа: бои, событие, элита, торговец (остановка без боя) и босс. */
export type RoomKind = 'fight' | 'event' | 'elite' | 'shop' | 'boss';

export interface LootArtifact {
  kind: 'artifact';
  artifact: ArtifactInstance;
}
export interface LootGear {
  kind: 'gear';
  gear: GearInstance;
}
export interface LootPotion {
  kind: 'potion';
  potion: string;
}
export type LootItem = LootArtifact | LootGear | LootPotion;

export interface HeroPersistent {
  defId: string;
  /** Персональный артефакт, с которым начат забег (один из `HeroDef.signatures`): только он и выпадает герою в этом забеге. */
  signature: string;
  hp: number;
  weapon: GearInstance;
  armor: GearInstance;
  /** Единственный слот под зелье; null — пусто. */
  potion: string | null;
}

export type RunPhase = 'map' | 'battle' | 'reward' | 'shop' | 'event' | 'camp' | 'victory' | 'defeat';

/** Торговец, остановка между элитой и боссом: лекарь, одна случайная экипировка, один случайный артефакт, одно зелье, переброс всего прилавка один раз. */
export interface ShopState {
  /** Товар куплен или не завёзли — null. */
  gear: GearInstance | null;
  artifact: ArtifactInstance | null;
  potion: string | null;
  /** Лечение уже куплено — один раз до переброса (переброс завозит новый товар и снимает флаг). */
  healed: boolean;
  rerolled: boolean;
}

/** Откуда награда — по нему же перебрасываются варианты. Зелье выпало с монстра — его не перебросить. */
export type RewardSource = 'fight' | 'elite' | 'bossGear' | 'bossArt' | 'potion';

/**
 * Пул награды за обычный бой и элиту (v0.39): «Нападение» — оружие и оружейные артефакты, «Защита» — броня и бронные.
 * Игрок выбирает пул вслепую, до броска: категорию рулит он, предмет внутри — случай. Пул того же типа, что и сокеты артефактов.
 */
export type RewardFocus = 'attack' | 'defense';

export interface RewardScreen {
  title: string;
  /** Подзаголовок вместо стандартного: «Раны затянулись: +12 HP» после босса. */
  note?: string;
  source: RewardSource;
  /** Выбранный пул у награды за бой и элиту; пока не выбран — `options` пусты и экран ждёт выбора (`awaitsFocus`). У босса и зелья не бывает. */
  focus?: RewardFocus;
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
  /** id артефактов в очереди, вытесненных «Заменить» из сокета (v0.31): игрок решает и их судьбу, а не теряет молча. */
  displaced?: string[];
}

/** Что выпало в клетке «Событие»: привал, элита, торговец, сундук, алтарь, кузнец или вор (веса — EVENT_WEIGHTS). */
export type EventKind = 'camp' | 'elite' | 'shop' | 'chest' | 'altar' | 'forge' | 'gnome' | 'gnome_art';

/**
 * Событие, пока герой в нём. Привал и торговец живут своими фазами (`camp`, `shop`), элита — боем с пометкой,
 * чтобы награда и золото были как за клетку элиты; сундук, алтарь и кузнец — фаза `event`.
 */
export type EventState =
  | { kind: 'camp' }
  | { kind: 'elite' }
  | { kind: 'shop' }
  | { kind: 'chest'; gear: GearInstance }
  /** null — все артефакты уже на максимуме, остаётся только молитва. */
  | { kind: 'altar'; artifact: ArtifactInstance | null }
  | { kind: 'forge' }
  /**
   * Гном-деньгокрад: `fight` — идёт бой, дальше экран итога. `fled` — удрал, `gold` золота потеряно;
   * `slain` — убит, `gold` золота получено, `artifact` (если есть) ждёт кнопки «Забрать».
   */
  | { kind: 'gnome'; result: 'fight' | 'fled' | 'slain'; gold: number; artifact: ArtifactInstance | null }
  /**
   * Гном-вещекрад: `fight` — идёт бой; `fled` — удрал, `artifact` вырван из сокета навсегда;
   * `slain` — убит, `artifact` вернулся на место (null — красть было нечего, тогда за труд платят золотом `gold`).
   */
  | { kind: 'gnome_art'; result: 'fight' | 'fled' | 'slain'; gold: number; artifact: ArtifactInstance | null; loot: ArtifactInstance | null };

export interface RunStats {
  kills: number;
  turns: number;
  damageDealt: number;
  damageTaken: number;
  roomsCleared: number;
  /** Время старта забега, мс эпохи. В старых сейвах отсутствует — экран итогов тогда время не пишет. */
  startedAt: number;
  /** Время конца забега, 0 — ещё идёт. Ставится в момент, когда исход решён: у гибели — когда герой пал, а не когда нажали «К итогам». */
  finishedAt: number;
}

/** Лог одного боя в журнале забега. */
export interface BattleLog {
  /** «Акт 1 · Лес · Бой 2: Волк, Волк». */
  title: string;
  /** `fled` — враг сбежал (вор): поле пусто, но добыча ушла с ним. */
  result: 'won' | 'lost' | 'fled';
  turns: number;
  lines: string[];
}

/** Версия игры: показывается в главном меню. Поднимать вместе с новым абзацем в §13 GDD. */
export const GAME_VERSION = '0.40.1';

export const SAVE_VERSION = 30;

export interface RunState {
  version: typeof SAVE_VERSION;
  seed: number;
  /** Забег начат отладочным параметром `?hero=`: в статистику (report.ts) уходит с пометкой debug и в общие цифры не идёт. */
  debug: boolean;
  /**
   * Исход забега уже ушёл в статистику (ui/telemetry.ts). Гибель отправляется в момент, когда герой пал, — не дожидаясь
   * кнопки «К итогам»; отметка лежит в самом забеге, чтобы перезагрузка страницы не послала вторую запись о том же забеге.
   */
  reported: boolean;
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
  /** Товары торговца, пока герой у него; null — закрыт. */
  shop: ShopState | null;
  /** Текущее событие клетки «Событие»; null — герой не в событии. */
  event: EventState | null;
  pending: PendingPlacement | null;
  stats: RunStats;
  /** Логи всех боёв забега по порядку — журнал на экране итогов и в паузе. */
  logs: BattleLog[];
}
