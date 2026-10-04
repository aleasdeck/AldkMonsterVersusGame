/**
 * Какой звук у какого действия игры (docs/zvuki.md, «В игре»). Без DOM и без звука: только выбор id звука из каталога
 * sounds.ts и момента, к которому его удар должен прийтись. Звук идёт за анимацией: удар героя — по плану анимации
 * (fx/index.ts, снаряды и эффекты на себя), приём врага — по его эффектам и `fx`, события боя — по виду события.
 */
import type { BattleEvent, EnemyAction, EventTarget, PlayerAction, RunState, StatusId } from '../../engine/types';
import { enemyDef } from '../../data/enemies';
import { weaponBase } from '../../data/gear';
import type { FxPlan, Shot } from '../fx';

/**
 * Звук к проигрыванию: `impact` — через сколько мс должен прозвучать его удар; `whole` — не начинать с середины замаха,
 * если до удара его не хватает (тогда удар придёт позже); `flip` — зеркально по панораме. Каталог звуков здесь не
 * нужен: он живёт в воркере, главный поток знает только id.
 */
export interface Cue {
  id: string;
  impact?: number;
  whole?: boolean;
  flip?: boolean;
  gain?: number;
}

// ─── Герой ───────────────────────────────────────────────────────────────

/** Удар оружием по базе: клинки и копьё режут, булава и молот дробят, плеть хлещет, лук и праща стреляют, посохи — сгусток. */
const WEAPON_CUE: Record<string, string> = {
  sword: 'hit_blade',
  axe: 'hit_blade',
  dagger: 'hit_blade',
  stiletto: 'hit_blade',
  spear: 'hit_blade',
  mace: 'hit_blunt',
  hammer: 'hit_blunt',
  whip: 'hit_whip',
  bow: 'shot_arrow',
  crossbow: 'shot_arrow',
  darts: 'shot_arrow',
  sling: 'shot_stone',
  staff: 'cast_orb',
  wand: 'cast_orb',
  scepter: 'cast_orb',
  orb: 'cast_orb',
};

/** Приёмы со своим звуком поверх того, что выводится из анимации: щит, свет, дым, свисток, сеть, крюк, заточка. */
const ARTIFACT_CUE: Record<string, string> = {
  smoke_bomb: 'smoke',
  elemental_edge: 'enchant',
  wolf_whistle: 'summon',
  raise_dead: 'summon',
  wasp_nest: 'summon',
  war_horn: 'war_cry',
  sic_em: 'howl',
  corpse_blast: 'explode',
  net: 'net',
  grapple_hook: 'hook',
  light_hammer: 'smite',
  smite: 'smite',
  shield_bash: 'hit_blunt',
  shield_ram: 'hit_blunt',
  shield_slam: 'hit_blunt',
  blood_bath: 'bleed',
  bleed_burst: 'bleed',
  rage: 'buff',
  // Проклятье: каждое наложение звучит общим «Проклятием» статуса (STATUS_CUE), казнь всех — взрывом.
  doomsday: 'explode',
};

/** Звуки, которые сами несут всю цепочку (три разряда молнии и гром): по одному на приём, а не на цель. */
const ONCE = new Set(['bolt', 'hook', 'net', 'smite']);

/** Звук снаряда или взмаха по его лепке: огонь, лёд, молния, камень, стрела, склянка; взмах — по оружию в руке. */
export function shotCue(shot: Pick<Shot, 'kind' | 'sculpt'>, weapon: string): string {
  if (shot.kind === 'melee') {
    const w = WEAPON_CUE[weapon];
    // Приём ближнего боя с дальним оружием в руке (Кровопускание с луком) — клинок, а не стрела.
    return w === 'hit_blunt' || w === 'hit_whip' ? w : 'hit_blade';
  }
  if (shot.kind === 'arrow') return 'shot_arrow';
  if (shot.kind === 'flask') return 'shot_flask';
  if (shot.sculpt === 'fire') return 'fire';
  if (shot.sculpt === 'ice') return 'ice';
  if (shot.sculpt === 'bolt') return 'bolt';
  if (shot.sculpt === 'stone') return 'shot_stone';
  return 'cast_orb';
}

/**
 * Звуки действия героя по плану его анимации: на каждый снаряд или взмах — звук с ударом в момент попадания
 * (`delay + flight`), иначе — по эффекту на себя (латы, лечение, свечение, рёв, глоток) в кадр контакта клипа.
 */
export function heroCues(run: RunState, action: PlayerAction, plan: FxPlan): Cue[] {
  // Приём без снаряда: удар звука — в кадр контакта клипа, но не раньше, чем звук успеет замахнуться с начала
  // (призыв волка, заточка и клич нарастают дольше, чем клип доходит до контакта).
  const self = (id: string): Cue[] => [{ id, impact: plan.impact, whole: true }];
  if (action.type === 'defend') return self('block_up');
  const weapon = weaponBase(run.hero.weapon).id;
  const own = action.type === 'artifact' ? ARTIFACT_CUE[action.artifactId] : undefined;
  const shots = plan.shots.filter((s) => s.from === 'hero');
  if (shots.length) {
    const cues: Cue[] = [];
    for (const s of shots) {
      const id = own ?? (action.type === 'attack' ? (WEAPON_CUE[weapon] ?? shotCue(s, weapon)) : shotCue(s, weapon));
      if (ONCE.has(id) && cues.length) break;
      cues.push({ id, impact: s.delay + s.flight });
    }
    return cues;
  }
  if (own) return self(own);
  const fx = plan.after.find((a) => a.target === 'hero');
  if (!fx) return [];
  return self(fx.kind === 'shield' ? 'block_up' : fx.kind === 'heal' ? 'heal' : fx.kind === 'drink' ? 'drink' : fx.kind === 'sculpt' && fx.sculpt === 'roar' ? 'war_cry' : fx.kind === 'cloud' ? 'curse' : 'buff');
}

// ─── Враги ───────────────────────────────────────────────────────────────

/** Усиление зверей — вой и рёв; остальные (Прицел, Жертва, Приказ) — общий звук усиления. */
const HOWL = /Вой|Рёв|Ярость/;

/**
 * Звук приёма врага: снаряд или клинок элиты по `fx`, удар, подрыв, кража, побег, призыв, лечение, блок, вой, вытягивание
 * маны, «прислушаться», замах. `strike` — удар по герою: его звук приурочен к контакту клипа или попаданию снаряда.
 * `flip` — звук записан со стороны героя (взмах и снаряд героя, баф на герое) и у врага зеркалится. Дебаф без удара
 * звучит событием своего статуса, а не приёмом.
 */
export function enemyActionCue(action: EnemyAction): { id: string; strike: boolean; flip: boolean } | null {
  const fx = action.fx;
  const has = (t: string) => action.effects.some((e) => e.type === t);
  if (fx?.kind === 'melee') return { id: 'hit_blade', strike: true, flip: true };
  if (fx?.kind === 'arrow') return { id: 'shot_arrow', strike: true, flip: true };
  if (fx?.kind === 'flask') return { id: 'shot_flask', strike: true, flip: true };
  if (fx?.kind === 'orb') {
    if (/Пистоль/.test(action.name)) return { id: 'gunshot', strike: true, flip: false };
    if (/[Зз]алп/.test(action.name)) return { id: 'cannon', strike: true, flip: false };
    return { id: fx.sculpt === 'fire' ? 'fire' : 'cast_orb', strike: true, flip: true };
  }
  if (has('selfDestruct')) return { id: 'explode', strike: true, flip: false };
  if (has('stealGold') || has('stealArtifact')) return { id: 'steal', strike: true, flip: false };
  if (has('attack')) return { id: 'enemy_strike', strike: true, flip: false };
  if (has('flee')) return { id: 'flee', strike: false, flip: false };
  if (has('summon')) return { id: 'summon', strike: false, flip: false };
  if (has('heal')) return { id: 'heal', strike: false, flip: true };
  if (has('block') || has('invuln')) return { id: 'block_up', strike: false, flip: true };
  if (has('buffStr')) return HOWL.test(action.name) ? { id: 'howl', strike: false, flip: false } : { id: 'buff', strike: false, flip: true };
  if (has('drainMp')) return { id: 'mana_drain', strike: false, flip: false };
  if (has('reveal')) return { id: 'reveal', strike: false, flip: false };
  if (has('none')) return { id: 'windup', strike: false, flip: false };
  if (has('cleanse') || has('dodge') || has('evade') || has('thorns')) return { id: 'buff', strike: false, flip: true };
  return null;
}

/** Приём врага по имени из события `enemyAction`; переход фазы и прочие синтетические приёмы — без своего звука. */
export function enemyCue(defId: string, name: string): ReturnType<typeof enemyActionCue> {
  const action = enemyDef(defId).actions.find((a) => a.name === name);
  return action ? enemyActionCue(action) : null;
}

// ─── События боя ─────────────────────────────────────────────────────────

/** Статус со своим звуком: раны, оглушение, холод и оцепенение; ослабляющие — общее проклятие. Бафы звучат приёмом. */
const STATUS_CUE: Partial<Record<StatusId, string>> = {
  bleed: 'bleed',
  burn: 'burn',
  poison: 'poison',
  stun: 'stun',
  cold: 'cold',
  frozen: 'freeze',
  weak: 'curse',
  vulnerable: 'curse',
  exhaust: 'curse',
  decay: 'curse',
  curse: 'curse',
};

/**
 * Звук события боя. Урон: в блок — удар в щит, крит — хруст поверх удара, рана — тик, шипы — укол, Ответный удар —
 * клинок, по герою — «Герой ранен»; по врагу в ход врагов — укус союзника. Удар героя по врагу звучит своим взмахом
 * (heroCues), поэтому здесь молчит. `enemyTurn` — розыгрыш хода врагов, а не приёма героя; `boss` — погиб босс.
 */
export function eventCue(ev: BattleEvent, enemyTurn: boolean, boss = false): string | null {
  switch (ev.type) {
    case 'damage':
      if (ev.kind === 'blocked') return 'block_hit';
      if (ev.by === 'riposte') return 'hit_blade';
      if (ev.kind === 'dot') return 'wound_tick';
      if (ev.kind === 'thorns') return 'thorns';
      if (ev.target === 'hero') return 'hurt_hero';
      if (ev.kind === 'crit') return 'crit';
      return enemyTurn ? 'enemy_strike' : null;
    case 'status':
      return STATUS_CUE[ev.status] ?? null;
    case 'death':
      return boss ? 'boss_death' : 'enemy_death';
    case 'summon':
      return 'summon';
    case 'phase':
      return 'phase';
    case 'stunned':
      return 'stun';
    default:
      return null;
  }
}

/** Звуки, записанные у героя (слева) и у врага (справа): у другой стороны они звучат зеркально. */
const AT_HERO = new Set(['block_hit', 'block_break', 'block_up', 'hurt_hero', 'enemy_strike']);
const AT_ENEMY = new Set(['crit', 'thorns', 'hit_blade']);

/** Зеркалить ли звук события по панораме: удар в щит врага — справа, шипы врага по герою — слева. */
export function cueFlip(id: string, target: EventTarget): boolean {
  return (AT_HERO.has(id) && target !== 'hero') || (AT_ENEMY.has(id) && target === 'hero');
}
