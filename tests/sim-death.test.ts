/**
 * Разбор гибелей бота: найти забеги, кончившиеся смертью в заданной клетке, и показать хвост лога последнего боя со сборкой.
 * Запуск: SIM_DEATH=L2R10 SIM_HERO=warrior SIM_SHOW=2 npx vitest run tests/sim-death.test.ts
 */
import { it } from 'vitest';
import { artifactDef } from '../src/data/artifacts';
import { newRun } from '../src/engine/run';
import type { RunState } from '../src/engine/types';
import { playRun } from './sim/bot';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

function build(run: RunState): string {
  const arts = [...run.hero.weapon.slots, ...run.hero.armor.slots].filter(Boolean).map((a) => `${artifactDef(a!.id).name}${a!.tier}`);
  return `${run.hero.weapon.name} т${run.hero.weapon.tier}${run.hero.weapon.affix ? ' +' + run.hero.weapon.affix.stat : ''} / ${run.hero.armor.name} т${run.hero.armor.tier} · ${arts.join(', ')} · зелье ${run.hero.potion ?? '—'} · золото ${run.gold}`;
}

it.skipIf(!env.SIM_DEATH)('гибели бота', () => {
  const hero = env.SIM_HERO ?? 'warrior';
  const want = env.SIM_DEATH!;
  const show = Number(env.SIM_SHOW ?? 2);
  const tail = Number(env.SIM_TAIL ?? 45);
  const out: string[] = [];
  let shown = 0;
  for (let seed = 1; seed <= 300 && shown < show; seed++) {
    const run = newRun(hero, seed * 7919);
    playRun(run);
    if (run.phase !== 'defeat') continue;
    const key = `L${run.locationIndex + 1}R${run.roomIndex + 1}`;
    if (key !== want) continue;
    shown++;
    const log = run.logs[run.logs.length - 1];
    const prevHp = run.logs.length >= 2 ? run.logs[run.logs.length - 2] : null;
    out.push(`=== seed ${seed} · ${key} · ${run.locations[run.locationIndex]} · ${log.title} · ходов ${log.turns} · ${build(run)}`);
    if (prevHp) out.push(`  предыдущий бой: ${prevHp.title} (${prevHp.turns} х.)`);
    out.push(...log.lines.slice(-tail).map((l) => '  ' + l));
  }
  console.log('\n' + out.join('\n'));
}, 600_000);
