/**
 * Симуляция баланса: бот проходит забеги за каждого героя и печатает статистику.
 * Запуск: SIM=1 npx vitest run tests/balance-sim.test.ts  (по умолчанию пропускается)
 * SIM_HERO=berserk — один герой, SIM_N=300 — число забегов.
 * Сам бот — в tests/sim/bot.ts: планирует ход перебором на копии состояния, вне боя считает ценность предметов.
 */
import { it } from 'vitest';
import { HERO_LIST } from '../src/data/heroes';
import { POTION_IDS } from '../src/data/potions';
import { heroStats, newRun } from '../src/engine/run';
import { USES, playRun } from './sim/bot';

// без @types/node: читаем переменные окружения через globalThis
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const N = Number(env.SIM_N ?? 60);
/** SIM_HERO=berserk — прогнать только одного героя. */
const ONLY = env.SIM_HERO;

for (const hero of HERO_LIST) {
  // Отдельный it на героя: между ними vitest успевает отчитаться воркеру, иначе долгий прогон падает по таймауту RPC.
  it.skipIf(!env.SIM || (ONLY && hero.id !== ONLY))(`симуляция баланса: ${hero.name}`, () => {
    const started = Date.now();
    for (const k of Object.keys(USES)) delete USES[k];
    let wins = 0;
    /** Забег не кончился ни победой, ни смертью: бой упёрся в лимит ходов — пат, бот не может ни убить, ни умереть. */
    let stuck = 0;
    let cleared = 0;
    const deaths: Record<string, number> = {};
    const byLoc: Record<string, number> = {};
    const bossHp: number[][] = [[], [], []];
    for (let seed = 1; seed <= N; seed++) {
      const run = newRun(hero.id, seed * 7919);
      const outcome = playRun(run, (r) => bossHp[r.locationIndex].push(r.hero.hp / heroStats(r).maxHp));
      if (outcome === 'victory') wins++;
      else if (outcome === 'stall') stuck++;
      cleared += run.stats.roomsCleared;
      if (run.phase === 'defeat') {
        const key = `L${run.locationIndex + 1}R${run.roomIndex + 1}`;
        deaths[key] = (deaths[key] ?? 0) + 1;
        const lk = `${run.locations[run.locationIndex]}@${run.locationIndex + 1}`;
        byLoc[lk] = (byLoc[lk] ?? 0) + 1;
      }
    }
    const top = Object.entries(deaths)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    const avg = (xs: number[]) => (xs.length ? `${Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100)}%(${xs.length})` : '—');
    const locTop = Object.entries(byLoc)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    const uses = Object.entries(USES)
      .filter(([k]) => !POTION_IDS.includes(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k}:${(v / N).toFixed(1)}`)
      .join(' ');
    // Зелья отдельно: их пьют по разу-два за забег, в топ приёмов они не попадут.
    const potions = Object.entries(USES)
      .filter(([k]) => POTION_IDS.includes(k))
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k.replace('_potion', '')}:${(v / N).toFixed(2)}`)
      .join(' ');
    console.log(
      `${hero.name.padEnd(8)} побед ${String(wins).padStart(2)}/${N}${stuck ? ` (пат: ${stuck})` : ''}  боёв ${(cleared / N).toFixed(1).padStart(4)}  HP у босса: ${avg(bossHp[0])} ${avg(bossHp[1])} ${avg(bossHp[2])}  смерти: ${top}  где: ${locTop}  приёмы/забег: ${uses}  зелья/забег: ${potions || '—'}  ${((Date.now() - started) / 1000).toFixed(0)} с`,
    );
    // Большой SIM_N не укладывается в стандартные 5 секунд vitest.
  }, 1_800_000);
}
