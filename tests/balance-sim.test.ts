/**
 * Симуляция баланса: бот проходит забеги за каждого героя и печатает статистику.
 * Запуск: SIM=1 npx vitest run tests/_sim.test.ts  (по умолчанию пропускается)
 */
import { it } from 'vitest';
import { HERO_LIST } from '../src/data/heroes';
import { artifactDef } from '../src/data/artifacts';
import { enemyAction, enemyDef } from '../src/data/enemies';
import { canUseAction, getStatus, statusValue } from '../src/engine/combat';
import {
  battleAction,
  battleEndTurn,
  battleEnemyStep,
  campForge,
  campRest,
  chooseEvent,
  enterRoom,
  finishBattle,
  heroStats,
  isRunOver,
  newRun,
  pendingDiscard,
  pendingPlace,
  skipReward,
  takeReward,
} from '../src/engine/run';
import { findSameArtifact, gearOf, socketRefs, upgradableSockets } from '../src/engine/equipment';
import type { BattleState, RunState } from '../src/engine/types';

function incomingDamage(b: BattleState): number {
  let total = 0;
  for (const e of b.enemies) {
    if (getStatus(e, 'stun')) continue;
    const a = enemyAction(enemyDef(e.defId), e.intent);
    for (const eff of a.effects) {
      if (eff.type === 'attack') {
        let d = eff.amount + statusValue(e, 'strength');
        if (getStatus(e, 'weak')) d = Math.floor(d * 0.75);
        total += d * (eff.hits ?? 1);
      } else if (eff.type === 'selfDestruct') total += eff.amount + statusValue(e, 'strength');
    }
  }
  return total;
}

function pickTarget(b: BattleState): number | undefined {
  const alive = b.enemies.filter((e) => !getStatus(e, 'dodge'));
  const pool = alive.length ? alive : b.enemies;
  let best = pool[0];
  for (const e of pool) if (e.hp < best.hp) best = e;
  return best?.uid;
}

/** Бот: лечится при HP < 50 %, защищается от ощутимого урона, бьёт самого слабого, активки — раз за ход. */
function playBattle(run: RunState): void {
  let guard = 0;
  let lastTurn = -1;
  const used = new Set<string>();
  while (run.battle && run.battle.phase !== 'won' && run.battle.phase !== 'lost' && guard++ < 3000) {
    const b = run.battle;
    if (b.phase !== 'player') {
      battleEnemyStep(run);
      continue;
    }
    if (b.turn !== lastTurn) {
      used.clear();
      lastTurn = b.turn;
    }
    const target = pickTarget(b);
    const incoming = incomingDamage(b);
    const ok = (id: string) => canUseAction(b, { type: 'artifact', artifactId: id, target }) === null && !used.has(id);
    const has = (id: string) => b.hero.artifacts.some((a) => a.id === id);

    if (has('heal') && ok('heal') && b.hero.hp < b.hero.maxHp * 0.5) {
      used.add('heal');
      battleAction(run, { type: 'artifact', artifactId: 'heal' });
      continue;
    }
    if (has('second_wind') && ok('second_wind') && b.hero.hp < b.hero.maxHp * 0.6) {
      used.add('second_wind');
      battleAction(run, { type: 'artifact', artifactId: 'second_wind' });
      continue;
    }
    if (has('mana_shield') && ok('mana_shield') && incoming >= 5) {
      used.add('mana_shield');
      battleAction(run, { type: 'artifact', artifactId: 'mana_shield' });
      continue;
    }
    if (has('dodge') && ok('dodge') && incoming >= 6) {
      used.add('dodge');
      battleAction(run, { type: 'artifact', artifactId: 'dodge' });
      continue;
    }
    if (!b.hero.defended && b.hero.sta >= 1 && Math.min(incoming, b.hero.stats.def) >= 3 && canUseAction(b, { type: 'defend' }) === null) {
      battleAction(run, { type: 'defend' });
      continue;
    }
    const skip = new Set(['heal', 'second_wind', 'mana_shield', 'dodge']);
    const usable = b.hero.artifacts.find((a) => artifactDef(a.id).kind === 'active' && !skip.has(a.id) && ok(a.id));
    if (usable) {
      used.add(usable.id);
      // Кровотечение — по самому жирному врагу, остальное — по слабейшему
      const fat = b.enemies.reduce((m, e) => (e.hp > m.hp ? e : m), b.enemies[0]);
      const t = usable.id === 'bleed_cut' && fat ? fat.uid : target;
      battleAction(run, { type: 'artifact', artifactId: usable.id, target: t });
      continue;
    }
    if (target !== undefined && canUseAction(b, { type: 'attack', target }) === null) battleAction(run, { type: 'attack', target });
    else battleEndTurn(run);
  }
  finishBattle(run);
}

function chooseReward(run: RunState): void {
  const opts = run.rewards[0]?.options ?? [];
  let best = -1;
  let bestScore = 0;
  opts.forEach((o, i) => {
    let score: number;
    if (o.kind === 'gear') {
      const cur = gearOf(run.hero, o.gear.kind);
      score = (o.gear.tier - cur.tier) * 10;
      score += o.gear.kind === 'weapon' ? o.gear.dmgMin + o.gear.dmgMax - cur.dmgMin - cur.dmgMax : (o.gear.def - cur.def) * 2 + (o.gear.hp - cur.hp) * 0.5;
      score += (o.gear.affix ? 1 : 0) - (cur.affix ? 1 : 0);
      if (o.gear.slots.length < cur.slots.filter(Boolean).length) score -= 20;
    } else {
      const same = findSameArtifact(run.hero, o.artifact.id);
      const free = socketRefs(run.hero).some((s) => !s.art);
      score = same ? 8 : free ? 6 : -5;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  if (best >= 0) takeReward(run, best);
  else skipReward(run);
}

function playRun(run: RunState, onBoss?: (run: RunState) => void): void {
  let guard = 0;
  while (!isRunOver(run) && guard++ < 800) {
    if (run.pending) {
      const free = socketRefs(run.hero).find((s) => !s.art);
      if (free) pendingPlace(run, free.kind, free.index);
      else pendingDiscard(run);
      continue;
    }
    const max = heroStats(run).maxHp;
    switch (run.phase) {
      case 'map':
        if (run.roomIndex === 6) onBoss?.(run);
        enterRoom(run);
        break;
      case 'battle':
        playBattle(run);
        break;
      case 'reward':
        chooseReward(run);
        break;
      case 'event': {
        const free = socketRefs(run.hero).some((s) => !s.art);
        chooseEvent(run, run.hero.hp < max * 0.65 ? 'spring' : free ? 'altar' : 'chest');
        break;
      }
      case 'camp': {
        const up = upgradableSockets(run.hero)[0];
        if (run.hero.hp < max * 0.7 || !up) campRest(run);
        else campForge(run, up.kind, up.index);
        break;
      }
    }
  }
}

// без @types/node: читаем переменные окружения через globalThis
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const N = Number(env.SIM_N ?? 60);

it.skipIf(!env.SIM)('симуляция баланса', () => {
  const lines: string[] = [];
  for (const hero of HERO_LIST) {
    let wins = 0;
    let cleared = 0;
    const deaths: Record<string, number> = {};
    const bossHp: number[][] = [[], [], []];
    for (let seed = 1; seed <= N; seed++) {
      const run = newRun(hero.id, seed * 7919);
      playRun(run, (r) => bossHp[r.locationIndex].push(r.hero.hp / heroStats(r).maxHp));
      if (run.phase === 'victory') wins++;
      cleared += run.stats.roomsCleared;
      if (run.phase === 'defeat') {
        const key = `L${run.locationIndex + 1}R${run.roomIndex + 1}`;
        deaths[key] = (deaths[key] ?? 0) + 1;
      }
    }
    const top = Object.entries(deaths)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    const avg = (xs: number[]) => (xs.length ? `${Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100)}%(${xs.length})` : '—');
    lines.push(
      `${hero.name.padEnd(8)} побед ${String(wins).padStart(2)}/${N}  боёв ${(cleared / N).toFixed(1).padStart(4)}  HP у босса: ${avg(bossHp[0])} ${avg(bossHp[1])} ${avg(bossHp[2])}  смерти: ${top}`,
    );
  }
  console.log('\n' + lines.join('\n'));
});
