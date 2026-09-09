/**
 * Отладка бота. SIM_DEBUG=1 SIM_HERO=warrior SIM_SEED=3 npx vitest run tests/sim-debug.test.ts — лог первых боёв.
 * SIM_DEBUG=stall SIM_HERO=paladin — найти первый забег с патом и показать хвост лога зависшего боя.
 */
import { it } from 'vitest';
import { campRest, currentRoomKind, enterRoom, heroStats, isRunOver, leaveShop, newRun } from '../src/engine/run';
import { artifactDef } from '../src/data/artifacts';
import { chooseEventRoom, chooseReward, evaluate, planTurn, playBattle, resolvePending } from './sim/bot';
import type { RunState } from '../src/engine/types';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

function build(run: RunState): string {
  const arts = [...run.hero.weapon.slots, ...run.hero.armor.slots].filter(Boolean).map((a) => `${artifactDef(a!.id).name}${a!.tier}`);
  return `${run.hero.weapon.name} / ${run.hero.armor.name} · ${arts.join(', ')}`;
}

function playUntil(run: RunState, onBattle: (kind: string, log: string[]) => boolean): void {
  let guard = 0;
  while (!isRunOver(run) && guard++ < 300) {
    if (run.pending) {
      resolvePending(run);
      continue;
    }
    switch (run.phase) {
      case 'map':
        enterRoom(run);
        break;
      case 'battle': {
        const kind = `${currentRoomKind(run)} L${run.locationIndex + 1}R${run.roomIndex + 1}`;
        const b = run.battle!;
        const log: string[] = [];
        const orig = b.log;
        b.log = new Proxy(orig, {
          get(t, p, r) {
            if (p === 'push')
              return (...items: string[]) => {
                log.push(...items);
                return t.push(...items);
              };
            return Reflect.get(t, p, r);
          },
        }) as string[];
        const before = `${b.enemies.map((e) => `${e.name}(${e.hp})`).join(', ')} · герой ${b.hero.hp}/${b.hero.maxHp} · ${build(run)}`;
        playBattle(run);
        const stalled = !!run.battle && run.battle.phase !== 'won' && run.battle.phase !== 'lost';
        if (onBattle(`${kind}: ${before}${stalled ? ' · ПАТ' : ` · после боя ${run.hero.hp}/${heroStats(run).maxHp}`}`, log)) return;
        if (stalled) return;
        break;
      }
      case 'reward':
        chooseReward(run);
        break;
      case 'event':
        chooseEventRoom(run);
        break;
      case 'shop':
        leaveShop(run);
        break;
      case 'camp':
        campRest(run);
        break;
    }
  }
}

it.skipIf(!env.SIM_DEBUG)('лог боёв бота', () => {
  const hero = env.SIM_HERO ?? 'warrior';
  const out: string[] = [];
  if (env.SIM_DEBUG === 'plan') {
    // Дойти до пата и разобрать оценки кандидатов в зависшем состоянии.
    for (let seed = 1; seed <= 100; seed++) {
      const run = newRun(hero, seed * 7919);
      let stalled = false;
      playUntil(run, (head) => {
        stalled = head.includes('ПАТ');
        return stalled;
      });
      if (!stalled || !run.battle) continue;
      const b = run.battle;
      out.push(`seed ${seed}: ход ${b.turn}, герой ${b.hero.hp}/${b.hero.maxHp} STA ${b.hero.sta} блок ${b.hero.block}; враги ${b.enemies.map((e) => `${e.name} ${e.hp}hp intent=${e.intent} dmgMult=${e.dmgMult}`).join('; ')}`);
      out.push(`  оценка сейчас: ${evaluate(b).toFixed(1)}; dmg ${b.hero.stats.dmgMin}-${b.hero.stats.dmgMax} str ${b.hero.stats.str} pierce ${b.hero.stats.pierceBlock}`);
      const plan = planTurn(b, run.rng);
      out.push(`  план: ${JSON.stringify(plan.actions)}`);
      break;
    }
  } else if (env.SIM_DEBUG === 'stall') {
    for (let seed = 1; seed <= 100; seed++) {
      const run = newRun(hero, seed * 7919);
      let found = false;
      playUntil(run, (head, log) => {
        if (!head.includes('ПАТ')) return false;
        out.push(`seed ${seed} === ${head}`, ...log.slice(-40).map((l) => '  ' + l));
        found = true;
        return true;
      });
      if (found) break;
    }
  } else {
    const run = newRun(hero, Number(env.SIM_SEED ?? 3) * 7919);
    const fights = Number(env.SIM_FIGHTS ?? 4);
    let shown = 0;
    playUntil(run, (head, log) => {
      out.push(`=== ${head}`, ...log.map((l) => '  ' + l));
      return ++shown >= fights;
    });
  }
  console.log('\n' + out.join('\n'));
}, 600_000);
