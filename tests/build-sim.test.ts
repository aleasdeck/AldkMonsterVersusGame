/**
 * Симуляции по сборкам: бот держится выбранной пары архетипов (каталог — tests/sim/builds.ts, тяга — `BUILD` в bot.ts).
 * Запуск: SIM=1 npx vitest run tests/build-sim.test.ts  (по умолчанию пропускается)
 *
 * Два режима (`SIM_BUILD_MODE`):
 * - `run` (по умолчанию) — полные забеги: бот берёт вещи сборки охотнее чужих. Сколько побед, где гибнет, как часто сборка
 *   вообще собирается (набор 3/3 по каждой метке) и чем бьёт в победах. SIM_N — забегов на героя (по умолчанию 60, решения — по 300).
 * - `stand` — стенд: снаряжение конца акта (предмет верхнего тира акта своего типа, все сокеты — вещами сборки тира акта,
 *   недостающее — лучшими чужими) против каждой элиты и каждого босса всех шести локаций этого акта, бой с полного HP.
 *   Сила самой сборки без удачи дропа. SIM_N — боёв на встречу (по умолчанию 10), SIM_ACTS=1,2,3 — какие акты.
 *
 * SIM_BUILDS=base (по умолчанию) | all | shadow+series,fire — какие сборки (`all:shadow+series` — базовую в общем виде: герои по сродству, первая черта); SIM_HERO=berserk — один герой; SIM_SIG=1|2 — навык
 * всем вместо навыка из каталога; SIM_DIFF — сложность забега (по умолчанию hard, как balance-sim); SIM_FREE=1 — рядом
 * тот же герой обычным ботом (без тяги), чтобы видеть, что даёт сборка сверх «брать лучшее».
 */
import { afterAll, it } from 'vitest';
import type { ArchetypeId, ArtifactInstance, Difficulty, GearInstance, GearKind, GearTier, RunState } from '../src/engine/types';
import { ARTIFACTS, artifactDef } from '../src/data/artifacts';
import { archetypeCounts, archetypeDef, artifactTags } from '../src/data/archetypes';
import { heroDef } from '../src/data/heroes';
import { traitDef } from '../src/data/traits';
import { ACTS, LOCATIONS } from '../src/data/locations';
import { canWearArmor, canWieldWeapon, makeGear } from '../src/data/gear';
import { enemyDef } from '../src/data/enemies';
import { createRng } from '../src/engine/rng';
import { createBattle } from '../src/engine/combat';
import { gearOf, socketRefs } from '../src/engine/equipment';
import { canDropFor } from '../src/engine/loot';
import { innateOf } from '../src/engine/stats';
import { heroStats, newRun } from '../src/engine/run';
import { BUILD, artifactValue, playBattle, playRun } from './sim/bot';
import { buildName, onBuild, pickBuilds, type BuildDef, type BuildHero } from './sim/builds';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const MODE = env.SIM_BUILD_MODE === 'stand' ? 'stand' : 'run';
const N = Number(env.SIM_N ?? (MODE === 'stand' ? 10 : 60));
const ONLY = env.SIM_HERO;
const SIG = env.SIM_SIG === '1' ? 1 : env.SIM_SIG === '2' ? 2 : null;
const DIFF: Difficulty = env.SIM_DIFF === 'easy' || env.SIM_DIFF === 'normal' ? env.SIM_DIFF : 'hard';
const FREE = env.SIM_FREE === '1';
const ACT_LIST = (env.SIM_ACTS ?? '1,2,3').split(',').map((a) => Number(a) - 1).filter((a) => a >= 0 && a < ACTS.length);
const BUILDS = pickBuilds(env.SIM_BUILDS);
/** SIM_BIAS=2,0,0.5 — тяга к сборке: ×своим, +своим, ×чужим (по умолчанию — `BUILD` в bot.ts). */
if (env.SIM_BIAS) [BUILD.on, BUILD.add, BUILD.off] = env.SIM_BIAS.split(',').map(Number);

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
const fmt = (x: number) => x.toFixed(1);

/** Вставленные артефакты и врождённый навык — то, что считает набор. */
function held(run: RunState): ArtifactInstance[] {
  const out = socketRefs(run.hero).flatMap((r) => (r.art ? [r.art] : []));
  const innate = innateOf(run.hero);
  if (innate) out.push(innate);
  return out;
}

/** «Берсерк ① Ярость» — герой, навык и черта сборки. */
function heroLabel(bh: BuildHero): string {
  const def = heroDef(bh.hero);
  return `${def.name} ${bh.sig === 2 ? '②' : '①'} ${traitDef(bh.trait ?? def.traits[0]).name}`;
}

function heroesOf(build: BuildDef): BuildHero[] {
  return build.heroes.filter((h) => !ONLY || h.hero === ONLY).map((h) => (SIG ? { ...h, sig: SIG } : h));
}

/** Имя источника урона из `BattleLog.dealt`. */
function sourceName(key: string): string {
  const names: Record<string, string> = { attack: 'удар', dot: 'раны', thorns: 'шипы', riposte: 'ответ', ally: 'союзник', potion: 'зелья', light: 'свет' };
  return names[key] ?? ARTIFACTS[key]?.name ?? key;
}

/** Строка сводки по каждому прогону — печатается в конце, отсортированная по победам. */
const SUMMARY: { line: string; score: number }[] = [];

// ─── Полные забеги ─────────────────────────────────────────────────────────

interface RunAcc {
  n: number;
  wins: number;
  stalls: number;
  deathAct: number[];
  /** Набор 3/3 сработал хоть раз за забег (`run.setsReached`) — по метке, и все метки сборки. */
  set3: Record<string, number>;
  set3All: number;
  /** То же в победах, плюс вещей сборки из всех в руках на финише. */
  winSet3: Record<string, number>;
  winOn: number;
  winHeld: number;
  dealt: Record<string, number>;
  /** Тир оружия и брони у дошедших до третьего акта — не отстаёт ли снаряжение, пока бот гонится за вещами сборки. */
  late: number;
  lateWeapon: number;
  lateArmor: number;
}

function playBuildRuns(tags: ArchetypeId[] | null, bh: BuildHero): RunAcc {
  const def = heroDef(bh.hero);
  const acc: RunAcc = { n: 0, wins: 0, stalls: 0, deathAct: [0, 0, 0], set3: {}, set3All: 0, winSet3: {}, winOn: 0, winHeld: 0, dealt: {}, late: 0, lateWeapon: 0, lateArmor: 0 };
  const watch = tags ?? [];
  BUILD.tags = tags;
  try {
    for (let seed = 1; seed <= N; seed++) {
      const run = newRun(bh.hero, seed * 7919, undefined, def.signatures[bh.sig - 1], bh.trait ?? def.traits[0], { difficulty: DIFF });
      const outcome = playRun(run);
      acc.n++;
      if (outcome === 'stall') acc.stalls++;
      if (run.phase === 'defeat') acc.deathAct[run.locationIndex]++;
      if (run.locationIndex === 2) {
        acc.late++;
        acc.lateWeapon += run.hero.weapon.tier;
        acc.lateArmor += run.hero.armor.tier;
      }
      for (const t of watch) if (run.setsReached.includes(t)) acc.set3[t] = (acc.set3[t] ?? 0) + 1;
      if (watch.length && watch.every((t) => run.setsReached.includes(t))) acc.set3All++;
      if (outcome !== 'victory') continue;
      acc.wins++;
      for (const t of watch) if (run.setsReached.includes(t)) acc.winSet3[t] = (acc.winSet3[t] ?? 0) + 1;
      const arts = held(run);
      acc.winHeld += arts.length;
      acc.winOn += arts.filter((a) => onBuild(a.id, watch)).length;
      for (const log of run.logs) for (const [k, v] of Object.entries(log.dealt)) acc.dealt[k] = (acc.dealt[k] ?? 0) + v;
    }
  } finally {
    BUILD.tags = null;
  }
  return acc;
}

/** Свободный бот на том же герое, навыке и черте — один раз на сочетание. */
const FREE_CACHE: Record<string, number> = {};
function freeWinPct(bh: BuildHero): number {
  const key = `${bh.hero}:${bh.sig}:${bh.trait ?? ''}`;
  if (FREE_CACHE[key] === undefined) {
    const acc = playBuildRuns(null, bh);
    FREE_CACHE[key] = pct(acc.wins, acc.n);
  }
  return FREE_CACHE[key];
}

function reportRuns(build: BuildDef, bh: BuildHero, acc: RunAcc): string {
  const name = buildName(build);
  const winPct = pct(acc.wins, acc.n);
  const free = FREE ? `  (обычный бот ${fmt(freeWinPct(bh))})` : '';
  const deaths = acc.deathAct.map((d) => Math.round(pct(d, acc.n))).join(' / ');
  const sets = build.tags.map((t) => `${archetypeDef(t).name} ${Math.round(pct(acc.set3[t] ?? 0, acc.n))} %`).join(', ');
  const both = build.tags.length > 1 ? `, оба ${Math.round(pct(acc.set3All, acc.n))} %` : '';
  const total = Object.values(acc.dealt).reduce((a, b) => a + b, 0);
  const top = Object.entries(acc.dealt)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => `${sourceName(k)} ${Math.round(pct(v, total))} %`)
    .join(', ');
  const winSets = build.tags.map((t) => `${archetypeDef(t).name} ${Math.round(pct(acc.winSet3[t] ?? 0, acc.wins))} %`).join(', ');
  const on = acc.wins ? `${(acc.winOn / acc.wins).toFixed(1)} из ${(acc.winHeld / acc.wins).toFixed(1)}` : '—';
  SUMMARY.push({ line: `${fmt(winPct).padStart(5)} %  ${name.padEnd(20)} ${heroLabel(bh)}${free}`, score: winPct });
  return [
    `${name.padEnd(20)} ${heroLabel(bh).padEnd(26)} побед ${fmt(winPct).padStart(5)} % (${acc.wins}/${acc.n}${acc.stalls ? `, пат ${acc.stalls}` : ''})${free}  гибель по актам ${deaths} %  наборы 3/3 за забег: ${sets}${both}`,
    `    в победах: наборы ${acc.wins ? winSets : '—'}; вещей сборки ${on}; урон: ${acc.wins ? top : '—'}; тир в третьем акте: оружие ${acc.late ? (acc.lateWeapon / acc.late).toFixed(1) : '—'}, броня ${acc.late ? (acc.lateArmor / acc.late).toFixed(1) : '—'}`,
  ].join('\n');
}

// ─── Стенд ─────────────────────────────────────────────────────────────────

/** Предмет своего типа: владение оружием и бронёй, иначе перк не работает и стенд мерил бы чужое оружие. Берсерк брони не носит — любая. */
function ownGear(rng: ReturnType<typeof createRng>, kind: GearKind, tier: GearTier, heroId: string): GearInstance {
  const def = heroDef(heroId);
  let gear = makeGear(rng, kind, tier, def);
  for (let i = 0; i < 30; i++) {
    const ok = kind === 'weapon' ? canWieldWeapon(def, gear) : canWearArmor(def, gear) || Object.values(def.armorSkill).every((v) => !v);
    if (ok) break;
    gear = makeGear(rng, kind, tier, def);
  }
  // Сокеты только своего типа: в стенде сборка стоит в оружии и броне так, как встала бы в игре без универсальных сокетов.
  gear.slotKinds = gear.slots.map(() => kind);
  return gear;
}

/**
 * Вещь в сокет стенда. Метки сборки — поровну: следующая вещь берётся из архетипа, у которого их пока меньше (навык героя
 * считается), иначе пара выходила почти чистой «Тенью» с одной вещью «Крови». Внутри архетипа — лучшая по ценности для героя;
 * бесполезная (заклинание без маны) — не берётся. Своих на этот тип сокета нет — лучшая общая вещь без метки: чужой архетип
 * (Бастион, Колючая броня) смазал бы замер.
 */
function pickForSocket(run: RunState, tags: ArchetypeId[], kind: GearKind, artTier: ArtifactInstance['tier']): ArtifactInstance | null {
  const have = held(run);
  const ids = have.map((a) => a.id);
  const counts = archetypeCounts(have);
  const best = (accept: (id: string) => boolean): { inst: ArtifactInstance; value: number } | null => {
    let out: { inst: ArtifactInstance; value: number } | null = null;
    for (const id of Object.keys(ARTIFACTS)) {
      const a = artifactDef(id);
      if (a.slot !== kind || ids.includes(id) || !canDropFor(run.hero, id) || !accept(id)) continue;
      const inst: ArtifactInstance = { id, tier: a.keystone ? 1 : artTier };
      const value = artifactValue(run, inst);
      if (value >= 1 && (!out || value > out.value)) out = { inst, value };
    }
    return out;
  };
  const order = [...tags].sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0));
  for (const tag of order) {
    const found = best((id) => artifactTags(id).includes(tag));
    if (found) return found.inst;
  }
  return best((id) => artifactTags(id).length === 0)?.inst ?? null;
}

/** Снаряжение конца акта: верхний тир предмета своего типа, сокеты — вещами сборки тира акта (`pickForSocket`). */
function standRun(tags: ArchetypeId[], bh: BuildHero, act: number, seed: number): RunState {
  const def = heroDef(bh.hero);
  const run = newRun(bh.hero, seed, 0, def.signatures[bh.sig - 1], bh.trait ?? def.traits[0]);
  run.locationIndex = act;
  run.hero.innateTier = Math.min(3, act + 1) as ArtifactInstance['tier'];
  const rng = createRng(seed ^ 0x5eed);
  const tier = Math.max(...ACTS[act].gearTiers) as GearTier;
  const artTier = Math.max(...ACTS[act].artTiers) as ArtifactInstance['tier'];
  run.hero.weapon = ownGear(rng, 'weapon', tier, bh.hero);
  run.hero.armor = ownGear(rng, 'armor', tier, bh.hero);
  for (const kind of ['weapon', 'armor'] as GearKind[]) {
    const gear = gearOf(run.hero, kind);
    for (let i = 0; i < gear.slots.length; i++) gear.slots[i] = pickForSocket(run, tags, kind, artTier);
  }
  run.hero.hp = heroStats(run).maxHp;
  return run;
}

/** Все элиты и боссы шести локаций — встречи из таблиц, как их собирает забег. */
function standEncounters(): { title: string; ids: string[] }[] {
  return LOCATIONS.flatMap((loc) =>
    [...loc.encounters.elite, ...loc.encounters.boss].map((ids) => ({ title: ids.map((id) => enemyDef(id).name).join(', '), ids })),
  );
}

interface StandAct {
  wins: number;
  n: number;
  turns: number;
  hpLeft: number;
  /** Цена боя: доля HP, потерянная за бой, гибель — 100 %. Стенд выигрывает почти всё, различает сборки именно она. */
  cost: number;
  byEnc: Record<string, { wins: number; n: number }>;
  loadout: string;
}

function standAct(tags: ArchetypeId[], bh: BuildHero, act: number): StandAct {
  const out: StandAct = { wins: 0, n: 0, turns: 0, hpLeft: 0, cost: 0, byEnc: {}, loadout: '' };
  const encs = standEncounters();
  for (let s = 1; s <= N; s++) {
    // Подбор сокетов по ценности дорогой — снаряжение собирается раз на сид, на каждую встречу — копия героя.
    const base = standRun(tags, bh, act, s * 7919 + act);
    if (s === 1) {
      const onTag = (id: string) => (onBuild(id, tags) ? '' : '*');
      out.loadout = socketRefs(base.hero)
        .flatMap((r) => (r.art ? [`${artifactDef(r.art.id).name}${onTag(r.art.id)} ${r.art.tier}`] : []))
        .join(', ');
    }
    encs.forEach((enc, e) => {
      // Клетка рядового боя: после победы нет лечения босса, HP читаем как есть.
      const run: RunState = { ...base, hero: structuredClone(base.hero), stats: { ...base.stats }, logs: [], roomIndex: 0, rng: createRng(s * 104729 + act * 131 + e * 17) };
      run.battle = createBattle(heroDef(bh.hero), run.hero, enc.ids, run.rng, act);
      run.phase = 'battle';
      const max = heroStats(run).maxHp;
      const finished = playBattle(run);
      // playBattle сам закрывает бой: гибель переводит забег в defeat (TS этого не видит — фаза только что стала battle).
      const won = finished && (run.phase as RunState['phase']) !== 'defeat';
      const rec = (out.byEnc[enc.title] ??= { wins: 0, n: 0 });
      rec.n++;
      out.n++;
      if (!won) {
        out.cost += 1;
        return;
      }
      rec.wins++;
      out.wins++;
      out.turns += run.logs.at(-1)?.turns ?? 0;
      out.hpLeft += run.hero.hp / max;
      out.cost += 1 - run.hero.hp / max;
    });
  }
  return out;
}

function reportStand(build: BuildDef, bh: BuildHero, acts: StandAct[]): string {
  const name = buildName(build);
  const head = acts
    .map((a, i) => `акт ${ACT_LIST[i] + 1}: побед ${fmt(pct(a.wins, a.n)).padStart(5)} %, цена ${Math.round(pct(a.cost, a.n))} % HP, ходов ${a.wins ? (a.turns / a.wins).toFixed(1) : '—'}`)
    .join('   ');
  const lines = acts.map((a, i) => {
    const worst = Object.entries(a.byEnc)
      .map(([t, r]) => ({ t, p: pct(r.wins, r.n) }))
      .sort((x, y) => x.p - y.p)
      .slice(0, 3)
      .map((x) => `${x.t} ${Math.round(x.p)} %`)
      .join(', ');
    return `    акт ${ACT_LIST[i] + 1}: ${a.loadout}  | хуже всего: ${worst}`;
  });
  const cost = acts.reduce((s, a) => s + pct(a.cost, a.n), 0) / Math.max(1, acts.length);
  const wins = acts.reduce((s, a) => s + pct(a.wins, a.n), 0) / Math.max(1, acts.length);
  SUMMARY.push({
    line: `цена ${String(Math.round(cost)).padStart(3)} % HP  побед ${fmt(wins).padStart(5)} %  ${name.padEnd(20)} ${heroLabel(bh).padEnd(26)} по актам: цена ${acts.map((a) => Math.round(pct(a.cost, a.n))).join(' / ')}, побед ${acts.map((a) => Math.round(pct(a.wins, a.n))).join(' / ')}`,
    score: -cost,
  });
  return [`${name.padEnd(20)} ${heroLabel(bh).padEnd(26)} ${head}`, ...lines].join('\n');
}

// ─── Прогон ────────────────────────────────────────────────────────────────

for (const build of BUILDS) {
  for (const bh of heroesOf(build)) {
    // Отдельный it на сборку и героя: между ними vitest успевает отчитаться воркеру, иначе долгий прогон падает по таймауту RPC.
    it.skipIf(!env.SIM)(`сборка ${buildName(build)}: ${heroLabel(bh)} (${MODE})`, () => {
      const started = Date.now();
      const text = MODE === 'run' ? reportRuns(build, bh, playBuildRuns(build.tags, bh)) : reportStand(build, bh, ACT_LIST.map((act) => standAct(build.tags, bh, act)));
      console.log(`${text}  ${((Date.now() - started) / 1000).toFixed(0)} с`);
    }, 3_600_000);
  }
}

afterAll(() => {
  if (!SUMMARY.length) return;
  const what =
    MODE === 'run'
      ? `побед за забег, ${N} забегов, «${DIFF}»`
      : `стенд против элит и боссов, ${N} боёв на встречу; цена — доля HP, потерянная за бой (гибель — 100 %), среднее по актам ${ACT_LIST.map((a) => a + 1).join(', ')}; * — общая вещь в сокете, своих не хватило`;
  console.log(`Сводка по сборкам (${what}):\n${SUMMARY.sort((a, b) => b.score - a.score).map((s) => `  ${s.line}`).join('\n')}`);
});
