/**
 * Профиль забегов бота — те же метрики, что уходят в статистику живых забегов (report.ts):
 * ходы на бой и полученный урон по актам, тиры экипировки и артефактов в конце, золото. Для сравнения бота с игроком.
 * Запуск: SIM=1 SIM_N=100 npx vitest run tests/sim-profile.test.ts
 */
import { it } from 'vitest';
import { HERO_LIST } from '../src/data/heroes';
import { artifactDef } from '../src/data/artifacts';
import { socketRefs } from '../src/engine/equipment';
import { newRun } from '../src/engine/run';
import { playRun } from './sim/bot';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const N = Number(env.SIM_N ?? 100);
const ONLY = env.SIM_HERO;

for (const hero of HERO_LIST) {
  it.skipIf(!env.SIM || (ONLY && hero.id !== ONLY))(`профиль бота: ${hero.name}`, () => {
    const acts = [0, 1, 2].map(() => ({ turns: 0, taken: 0, fights: 0, runs: 0 }));
    let wins = 0;
    const endW: number[] = [];
    const endA: number[] = [];
    const artTiers: number[] = [];
    const artFreq: Record<string, number> = {};
    let goldEnd = 0;
    let turnsWin = 0;
    let takenWin = 0;
    for (let seed = 1; seed <= N; seed++) {
      const run = newRun(hero.id, seed * 7919);
      let prev = { turns: 0, taken: 0, fights: 0 };
      const snap = (r: typeof run) => {
        const idx = r.locationIndex;
        const a = acts[idx];
        // Ходы и урон от прошлого среза до входа к боссу; сам босс — уже в следующем акте (или в конце).
        const fights = r.logs.length;
        a.turns += r.stats.turns - prev.turns;
        a.taken += r.stats.damageTaken - prev.taken;
        a.fights += fights - prev.fights;
        a.runs++;
        prev = { turns: r.stats.turns, taken: r.stats.damageTaken, fights };
      };
      const outcome = playRun(run, snap);
      if (outcome === 'victory') {
        wins++;
        turnsWin += run.stats.turns;
        takenWin += run.stats.damageTaken;
        endW.push(run.hero.weapon.tier);
        endA.push(run.hero.armor.tier);
        goldEnd += run.gold;
        for (const s of socketRefs(run.hero)) {
          if (!s.art) continue;
          artTiers.push(s.art.tier);
          artFreq[s.art.id] = (artFreq[s.art.id] ?? 0) + 1;
        }
      }
    }
    const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '—');
    const perAct = acts.map((a) => `${(a.turns / Math.max(1, a.fights)).toFixed(1)} х/бой, ${(a.taken / Math.max(1, a.fights)).toFixed(1)} урон/бой (${a.runs})`).join(' | ');
    const top = Object.entries(artFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `${k}${artifactDef(k).kind === 'passive' ? '' : '*'}:${Math.round((100 * v) / Math.max(1, wins))}%`)
      .join(' ');
    console.log(
      `${hero.name.padEnd(8)} побед ${wins}/${N}  по актам (до босса): ${perAct}\n` +
        `         победные забеги: ходов ${(turnsWin / Math.max(1, wins)).toFixed(0)}, урона получено ${(takenWin / Math.max(1, wins)).toFixed(0)}, оружие т${avg(endW)}, броня т${avg(endA)}, артефакты т${avg(artTiers)} (${(artTiers.length / Math.max(1, wins)).toFixed(1)} шт), золото ${(goldEnd / Math.max(1, wins)).toFixed(0)}\n` +
        `         артефакты в победах (* — активный): ${top}`,
    );
  }, 1_800_000);
}
