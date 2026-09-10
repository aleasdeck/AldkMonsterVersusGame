/**
 * Шансы боя с ворами: бот дерётся с гномом на снаряжении каждого акта и печатает, как часто успевает его убить.
 * Запуск: SIM=1 npx vitest run tests/gnome-odds.test.ts  (по умолчанию пропускается)
 * SIM_N=200 — боёв на клетку. Ориентир: убийство в 55–70 % боёв, иначе событие либо формальность, либо грабёж.
 */
import { it } from 'vitest';
import { HERO_LIST, heroDef } from '../src/data/heroes';
import { ACTS } from '../src/data/locations';
import { GEAR_TIERS, makeGear } from '../src/data/gear';
import { createRng } from '../src/engine/rng';
import { addArtifact } from '../src/engine/equipment';
import { heroStats, newRun, startEvent } from '../src/engine/run';
import { playBattle } from './sim/bot';
import type { EventKind, RunState } from '../src/engine/types';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const N = Number(env.SIM_N ?? 200);

/** Герой к началу указанного акта: экипировка тира акта и пара артефактов в сокетах. */
function equipForAct(run: RunState, act: number, seed: number): void {
  const rng = createRng(seed);
  const tiers = ACTS[act].gearTiers;
  const tier = tiers[tiers.length - 1];
  const def = heroDef(run.hero.defId);
  const signature = run.hero.weapon.slots.find((s) => s?.id === def.signature) ?? null;
  run.hero.weapon = makeGear(rng, 'weapon', tier, def);
  run.hero.armor = makeGear(rng, 'armor', tier, def);
  // Персональный артефакт возвращаем на место, к нему — типовой набор находок к этому акту.
  if (signature) addArtifact(run.hero, signature);
  for (const id of ['luck_talisman', 'thorns', 'vampire_fang']) addArtifact(run.hero, { id, tier: 1 });
  run.hero.hp = heroStats(run).maxHp;
}

function odds(kind: EventKind, act: number, heroId: string): { kills: number; total: number; stalls: number } {
  let kills = 0;
  let stalls = 0;
  for (let i = 0; i < N; i++) {
    const run = newRun(heroId, i * 7919 + act, 0);
    equipForAct(run, act, i);
    run.locationIndex = act;
    run.roomIndex = 2;
    startEvent(run, kind);
    // playBattle сам зовёт finishBattle, поэтому исход читаем в состоянии события, а не в бою.
    if (!playBattle(run)) {
      stalls += 1;
      continue;
    }
    const ev = run.event;
    if ((ev?.kind === 'gnome' || ev?.kind === 'gnome_art') && ev.result === 'slain') kills += 1;
  }
  return { kills, total: N, stalls };
}

for (const kind of ['gnome', 'gnome_art'] as EventKind[]) {
  it.skipIf(!env.SIM)(`шансы против вора: ${kind}`, () => {
    const lines: string[] = [];
    for (const act of [0, 1, 2]) {
      const parts = HERO_LIST.map((h) => {
        const { kills, total, stalls } = odds(kind, act, h.id);
        return `${h.name} ${Math.round((kills / total) * 100)}%${stalls ? ` (пат ${stalls})` : ''}`;
      });
      lines.push(`  акт ${act + 1}: ${parts.join('  ')}`);
    }
    // eslint-disable-next-line no-console
    console.log(`${kind} (убит в N % боёв, ${N} боёв на клетку, тир ${GEAR_TIERS[1].name}+):\n${lines.join('\n')}`);
  }, 600_000);
}
