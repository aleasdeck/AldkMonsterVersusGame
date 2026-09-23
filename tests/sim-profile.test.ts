/**
 * Профиль забегов бота — те же метрики, что уходят в статистику живых забегов (report.ts):
 * ходы на бой по рангу (рядовой, элита, босс), полученный урон, доля урона от базового удара по актам (v0.42),
 * главные источники урона, тиры экипировки и артефактов в конце, золото, паты. Для сравнения бота с игроком.
 * Запуск: SIM=1 SIM_N=100 npx vitest run tests/sim-profile.test.ts   (SIM_HERO=mage — один герой, SIM_SIG=2 — вторая сигнатура)
 */
import { it } from 'vitest';
import { HERO_LIST } from '../src/data/heroes';
import { artifactDef } from '../src/data/artifacts';
import { archetypeCounts } from '../src/data/archetypes';
import { socketRefs } from '../src/engine/equipment';
import { newRun } from '../src/engine/run';
import type { RoomKind } from '../src/engine/types';
import { playRun } from './sim/bot';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const N = Number(env.SIM_N ?? 100);
const ONLY = env.SIM_HERO;
const SIG = env.SIM_SIG === '2' ? 1 : 0;

/** Сколько ходов и сколько боёв каждого ранга. */
type Turns = Record<'fight' | 'elite' | 'boss', { turns: number; n: number }>;

const pct = (part: number, total: number) => (total > 0 ? `${Math.round((100 * part) / total)}%` : '—');

for (const hero of HERO_LIST) {
  it.skipIf(!env.SIM || (ONLY && hero.id !== ONLY))(`профиль бота: ${hero.name}`, () => {
    const acts = [0, 1, 2].map(() => ({ taken: 0, fights: 0, attack: 0, dealt: 0 }));
    const turns: Turns = { fight: { turns: 0, n: 0 }, elite: { turns: 0, n: 0 }, boss: { turns: 0, n: 0 } };
    const sources: Record<string, number> = {};
    /** Забеги по собранному в конце набору (v0.43): архетип с 3 вещами — сколько таких, побед и доля удара в акте 3. */
    const bySet: Record<string, { runs: number; wins: number; attack: number; dealt: number }> = {};
    let wins = 0;
    let stalls = 0;
    const endW: number[] = [];
    const endA: number[] = [];
    const artTiers: number[] = [];
    const artFreq: Record<string, number> = {};
    let goldEnd = 0;
    let turnsWin = 0;
    let takenWin = 0;
    for (let seed = 1; seed <= N; seed++) {
      const run = newRun(hero.id, seed * 7919, undefined, hero.signatures[SIG]);
      let prevTaken = 0;
      let prevLogs = 0;
      // Срез перед боссом акта: урон, полученный в акте до него, и бои по логам.
      const snap = (r: typeof run) => {
        const a = acts[r.locationIndex];
        a.taken += r.stats.damageTaken - prevTaken;
        a.fights += r.logs.length - prevLogs;
        prevTaken = r.stats.damageTaken;
        prevLogs = r.logs.length;
      };
      const outcome = playRun(run, snap);
      if (outcome === 'stall') stalls++;
      // Разбор урона и длина боёв — по логам: у каждого свой акт по заголовку «Акт N · …».
      for (const log of run.logs) {
        const act = Number(/^Акт (\d)/.exec(log.title)?.[1] ?? 1) - 1;
        const a = acts[act];
        for (const [k, v] of Object.entries(log.dealt ?? {})) {
          a.dealt += v;
          if (k === 'attack') a.attack += v;
          sources[k] = (sources[k] ?? 0) + v;
        }
        const kind = log.kind as RoomKind;
        if (kind === 'fight' || kind === 'elite' || kind === 'boss') {
          turns[kind].turns += log.turns;
          turns[kind].n++;
        }
      }
      // Набор в конце забега: 3 вещи одного архетипа — «собрал», иначе «без набора».
      const counts = archetypeCounts(socketRefs(run.hero).flatMap((r) => (r.art ? [r.art] : [])));
      const full = Object.entries(counts).filter(([, n]) => (n ?? 0) >= 3).map(([k]) => k);
      const key = full.length ? full.join('+') : 'без набора';
      const bs = (bySet[key] ??= { runs: 0, wins: 0, attack: 0, dealt: 0 });
      bs.runs++;
      if (outcome === 'victory') bs.wins++;
      for (const log of run.logs) {
        if (!log.title.startsWith('Акт 3')) continue;
        for (const [k, v] of Object.entries(log.dealt ?? {})) {
          bs.dealt += v;
          if (k === 'attack') bs.attack += v;
        }
      }
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
    const perAct = acts.map((a, i) => `А${i + 1}: удар ${pct(a.attack, a.dealt)}, ${(a.taken / Math.max(1, a.fights)).toFixed(1)} урона/бой`).join(' | ');
    const byRank = (['fight', 'elite', 'boss'] as const).map((k) => `${k} ${(turns[k].turns / Math.max(1, turns[k].n)).toFixed(1)}`).join(', ');
    const total = Object.values(sources).reduce((a, v) => a + v, 0);
    const topSrc = Object.entries(sources)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([k, v]) => `${k} ${pct(v, total)}`)
      .join(', ');
    const top = Object.entries(artFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `${k}${artifactDef(k).kind === 'passive' ? '' : '*'}:${Math.round((100 * v) / Math.max(1, wins))}%`)
      .join(' ');
    console.log(
      `${hero.name.padEnd(8)} ${SIG ? '②' : '①'} побед ${wins}/${N}${stalls ? ` (пат ${stalls})` : ''}  ходов на бой: ${byRank}\n` +
        `         ${perAct}\n` +
        `         источники урона: ${topSrc}\n` +
        `         наборы 3/3 в конце: ${Object.entries(bySet)
          .sort((a, b) => b[1].runs - a[1].runs)
          .map(([k, v]) => `${k} ${v.runs} (побед ${v.wins}, удар в А3 ${pct(v.attack, v.dealt)})`)
          .join('; ')}\n` +
        `         победные забеги: ходов ${(turnsWin / Math.max(1, wins)).toFixed(0)}, урона получено ${(takenWin / Math.max(1, wins)).toFixed(0)}, оружие т${avg(endW)}, броня т${avg(endA)}, артефакты т${avg(artTiers)} (${(artTiers.length / Math.max(1, wins)).toFixed(1)} шт), золото ${(goldEnd / Math.max(1, wins)).toFixed(0)}\n` +
        `         артефакты в победах (* — активный): ${top}`,
    );
  }, 1_800_000);
}
