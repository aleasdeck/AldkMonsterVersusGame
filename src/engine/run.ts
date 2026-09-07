import type { DerivedStats, GearKind, LootItem, PlayerAction, RoomKind, RunState } from './types';
import { SAVE_VERSION } from './types';
import { createRng, pick } from './rng';
import { heroDef } from '../data/heroes';
import { makeStartingGear } from '../data/gear';
import { LOCATIONS, ROOMS_PER_LOCATION, roomKind, type LocationDef } from '../data/locations';
import { createBattle, endTurn, enemyStep, performAction } from './combat';
import { computeStats } from './stats';
import { addArtifact, equipGear, findSameArtifact, gearOf, replaceArtifact } from './equipment';
import { rollBossRewards, rollEvent, rollRewards } from './loot';

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function newRun(heroId: string, seed: number = randomSeed()): RunState {
  const def = heroDef(heroId);
  const gear = makeStartingGear(def);
  const stats = computeStats(def, gear.weapon, gear.armor);
  return {
    version: SAVE_VERSION,
    seed,
    rng: createRng(seed),
    hero: { defId: heroId, hp: stats.maxHp, weapon: gear.weapon, armor: gear.armor },
    locationIndex: 0,
    roomIndex: 0,
    phase: 'map',
    battle: null,
    rewards: [],
    event: null,
    pending: null,
    stats: { kills: 0, turns: 0, damageDealt: 0, damageTaken: 0, roomsCleared: 0 },
  };
}

export function currentLocation(run: RunState): LocationDef {
  return LOCATIONS[Math.min(run.locationIndex, LOCATIONS.length - 1)];
}

export function currentRoomKind(run: RunState): RoomKind {
  return roomKind(run.roomIndex);
}

export function heroStats(run: RunState): DerivedStats {
  return computeStats(heroDef(run.hero.defId), run.hero.weapon, run.hero.armor);
}

export function isRunOver(run: RunState): boolean {
  return run.phase === 'victory' || run.phase === 'defeat';
}

/** Пересчитать HP после изменения максимума: прирост добавляется, излишек срезается. */
function syncMaxHp(run: RunState, before: number): void {
  const after = heroStats(run).maxHp;
  if (after > before) run.hero.hp += after - before;
  run.hero.hp = Math.max(0, Math.min(run.hero.hp, after));
}

// ─── Комнаты ───────────────────────────────────────────────────────────────

export function enterRoom(run: RunState): void {
  if (run.phase !== 'map') return;
  const kind = currentRoomKind(run);
  const loc = currentLocation(run);
  if (kind === 'event') {
    run.event = { options: rollEvent(run.rng, run.hero, loc) };
    run.phase = 'event';
    return;
  }
  const table =
    kind === 'fight'
      ? run.roomIndex < 2
        ? loc.encounters.fight1
        : loc.encounters.fight2
      : kind === 'elite'
        ? loc.encounters.elite
        : loc.encounters.boss;
  const ids = pick(run.rng, table);
  run.battle = createBattle(heroDef(run.hero.defId), run.hero, ids, run.rng);
  run.phase = 'battle';
}

export function advanceRoom(run: RunState): void {
  run.battle = null;
  run.event = null;
  run.rewards = [];
  run.pending = null;
  run.roomIndex += 1;
  if (run.roomIndex >= ROOMS_PER_LOCATION) {
    if (run.locationIndex >= LOCATIONS.length - 1) {
      run.phase = 'victory';
      return;
    }
    run.phase = 'camp';
    return;
  }
  run.phase = 'map';
}

// ─── Бой ───────────────────────────────────────────────────────────────────

export function battleAction(run: RunState, action: PlayerAction): void {
  if (!run.battle) throw new Error('No battle');
  performAction(run.battle, action, run.rng);
}

export function battleEndTurn(run: RunState): void {
  if (!run.battle) throw new Error('No battle');
  endTurn(run.battle);
}

export function battleEnemyStep(run: RunState): void {
  if (!run.battle) throw new Error('No battle');
  enemyStep(run.battle, run.rng);
}

/** Закрыть бой после победы или поражения: перенести HP, статистику, выдать награды. */
export function finishBattle(run: RunState): void {
  const b = run.battle;
  if (!b || (b.phase !== 'won' && b.phase !== 'lost')) return;
  run.stats.kills += b.stats.kills;
  run.stats.turns += b.turn;
  run.stats.damageDealt += b.stats.damageDealt;
  run.stats.damageTaken += b.stats.damageTaken;
  if (b.phase === 'lost') {
    run.hero.hp = 0;
    run.battle = null;
    run.phase = 'defeat';
    return;
  }
  run.hero.hp = b.hero.hp;
  run.stats.roomsCleared += 1;
  const kind = currentRoomKind(run);
  const loc = currentLocation(run);
  run.battle = null;
  run.rewards =
    kind === 'boss'
      ? rollBossRewards(run.rng, run.hero, loc)
      : [{ title: kind === 'elite' ? 'Награда за элиту' : 'Награда', options: rollRewards(run.rng, run.hero, loc, kind === 'elite' ? 'elite' : 'fight') }];
  if (run.rewards.length === 0) {
    advanceRoom(run);
    return;
  }
  run.phase = 'reward';
}

// ─── Награды и размещение ──────────────────────────────────────────────────

/**
 * Выдать артефакт. Дубликат апгрейдит стоящий сразу; новый артефакт ждёт выбора слота
 * (игрок сам решает, куда ставить и что заменять).
 */
function giveArtifact(run: RunState, art: LootItem & { kind: 'artifact' }, opts: { cancellable: boolean; consumeReward: boolean }): void {
  if (findSameArtifact(run.hero, art.artifact.id)) {
    const before = heroStats(run).maxHp;
    addArtifact(run.hero, art.artifact);
    syncMaxHp(run, before);
    return;
  }
  run.pending = { artifacts: [art.artifact], cancellable: opts.cancellable, consumeReward: opts.consumeReward };
}

function giveGear(run: RunState, gear: LootItem & { kind: 'gear' }): void {
  const before = heroStats(run).maxHp;
  const overflow = equipGear(run.hero, gear.gear);
  syncMaxHp(run, before);
  if (overflow.length > 0) run.pending = { artifacts: overflow, cancellable: false, consumeReward: false };
}

function afterReward(run: RunState): void {
  if (run.rewards.length === 0) advanceRoom(run);
}

export function takeReward(run: RunState, index: number): void {
  if (run.phase !== 'reward' || run.pending) return;
  const screen = run.rewards[0];
  const item = screen?.options[index];
  if (!item) return;
  if (item.kind === 'artifact') {
    giveArtifact(run, item, { cancellable: true, consumeReward: true });
    if (run.pending) return; // ждём выбора слота, награда ещё на экране
    run.rewards.shift();
    afterReward(run);
    return;
  }
  run.rewards.shift();
  giveGear(run, item);
  if (!run.pending) afterReward(run);
}

export function skipReward(run: RunState): void {
  if (run.phase !== 'reward' || run.pending) return;
  run.rewards.shift();
  afterReward(run);
}

function continueAfterPending(run: RunState): void {
  if (run.phase === 'reward') afterReward(run);
  else if (run.phase === 'event') advanceRoom(run);
}

function finishPendingStep(run: RunState): void {
  const p = run.pending;
  if (!p || p.artifacts.length > 0) return;
  run.pending = null;
  if (p.consumeReward) run.rewards.shift();
  continueAfterPending(run);
}

/** Поставить ожидающий артефакт в слот (пустой или вместо стоящего). */
export function pendingPlace(run: RunState, kind: GearKind, index: number): void {
  const p = run.pending;
  if (!p || p.artifacts.length === 0) return;
  const before = heroStats(run).maxHp;
  const art = p.artifacts.shift()!;
  replaceArtifact(run.hero, kind, index, art);
  syncMaxHp(run, before);
  finishPendingStep(run);
}

/** Выбросить ожидающий артефакт. */
export function pendingDiscard(run: RunState): void {
  const p = run.pending;
  if (!p || p.artifacts.length === 0) return;
  p.artifacts.shift();
  finishPendingStep(run);
}

/** Передумать: вернуться к выбору награды, если она ещё не потрачена. */
export function pendingCancel(run: RunState): void {
  const p = run.pending;
  if (!p || !p.cancellable) return;
  run.pending = null;
}

// ─── Событие ───────────────────────────────────────────────────────────────

export function chooseEvent(run: RunState, id: string): void {
  if (run.phase !== 'event' || !run.event) return;
  const opt = run.event.options.find((o) => o.id === id);
  if (!opt) return;
  const max = heroStats(run).maxHp;
  if (opt.id === 'spring') {
    run.hero.hp = Math.min(max, run.hero.hp + Math.floor(max * 0.3));
  } else if (opt.id === 'altar') {
    run.hero.hp = Math.max(1, run.hero.hp - Math.floor(max * 0.1));
    giveArtifact(run, { kind: 'artifact', artifact: opt.artifact }, { cancellable: false, consumeReward: false });
  } else {
    giveGear(run, { kind: 'gear', gear: opt.gear });
  }
  if (!run.pending) advanceRoom(run);
}

// ─── Привал ────────────────────────────────────────────────────────────────

function nextLocation(run: RunState): void {
  run.locationIndex += 1;
  run.roomIndex = 0;
  run.phase = 'map';
}

export function campRest(run: RunState): void {
  if (run.phase !== 'camp') return;
  const max = heroStats(run).maxHp;
  run.hero.hp = Math.min(max, run.hero.hp + Math.floor(max * 0.5));
  nextLocation(run);
}

export function campForge(run: RunState, kind: GearKind, index: number): boolean {
  if (run.phase !== 'camp') return false;
  const slot = gearOf(run.hero, kind).slots[index];
  if (!slot || slot.tier >= 3) return false;
  const before = heroStats(run).maxHp;
  slot.tier += 1;
  syncMaxHp(run, before);
  nextLocation(run);
  return true;
}
