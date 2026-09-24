import { App } from './ui/app';
import { createRng, next } from './engine/rng';
import type { RunsFeed } from './engine/globalStats';
import { EVENT_WEIGHTS, LOCATION_BY_ID, ROOMS_PER_LOCATION } from './data/locations';
import { offerTrials, startEvent } from './engine/run';
import { TRIALS } from './data/trials';
import { createBattle } from './engine/combat';
import { HERO_LIST, heroDef } from './data/heroes';
import type { EventKind, LocationId } from './engine/types';
import { ART_TIERS, COLLECTIBLES, findKey } from './data/collection';
import { ENEMY_LIST, enemyDef } from './data/enemies';
import { loadProfile, saveProfile } from './ui/save';
import { GEAR_TIERS, baseArmorStats, baseDamage, baseOf, baseTitle, rollAffix, rollSlotKinds, upgradeGearTier } from './data/gear';
import type { ArtTier, DerivedStats, GearAffix, GearKind, GearTier, LootItem, SlotKind } from './engine/types';
import type { Rng } from './engine/rng';
import { setTint } from './ui/tint';

const HERO_LIST_IDS = HERO_LIST.map((d) => d.id);
const WIDTH = 960;
const HEIGHT = 540;

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

function fit(): void {
  const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
  root!.style.transform = `scale(${scale})`;
}

window.addEventListener('resize', fit);
fit();

const app = new App(root);
app.start();

// Отладочный быстрый старт: ?hero=warrior&seed=5&enter=1 — новый забег и сразу первая комната.
// ?hero=...&phase=won|reward|shop|event|camp|end — сразу нужный экран (бой выигрывается читом); won — плашка победы, &log=1 — с раскрытым логом.
// &phase=event&event=chest|altar|forge|elite|shop|camp|gnome|gnome_art — заданное событие в третьей клетке; &events=<вид> — на весь забег.
const params = new URLSearchParams(window.location.search);

// &tint=off — снять тонировку бойцов под свет локации (сравнить «до/после» на том же бою);
// &tint=0.5 и &tintc=ff6442 — своя сила и свой цвет света на всех локациях (подбор по скриншоту, см. docs/art.md)
const tintParam = params.get('tint');
const tintColor = params.get('tintc');
if (tintParam === 'off') setTint(false);
else if (tintParam || tintColor) {
  setTint(true, {
    ...(tintParam ? { k: Math.max(0, Math.min(1, Number(tintParam) || 0)) } : {}),
    ...(tintColor ? { light: `#${tintColor}` } : {}),
  });
}

// &mock=1 — демо-профиль: статистика, часть коллекции (у артефактов — часть тиров) и половина бестиария (для отладки экранов);
// экрану «Статистика» — демо-ответ таблицы вместо сети (mockRuns)
if (params.get('mock')) {
  app.statsMock = mockRuns();
  saveProfile({
    ...loadProfile(),
    runs: 12,
    victories: 3,
    furthest: 15,
    furthestHero: 'assassin',
    kills: 214,
    turns: 638,
    damageDealt: 4321,
    damageTaken: 3187,
    heroRuns: { warrior: 4, assassin: 5, mage: 3 },
    heroWins: { assassin: 2, warrior: 1 },
    // Каждая третья запись; у артефактов открыты не все тиры — видно метки в углу плитки.
    collection: COLLECTIBLES.filter((_, i) => i % 3 === 0).flatMap((c, i) => (c.tiers ? ART_TIERS.slice(0, (i % 3) + 1).map((t) => findKey(c.id, t)) : [c.id])),
    bestiary: ENEMY_LIST.filter((_, i) => i % 2 === 0).map((e) => e.id),
  });
  app.profile = loadProfile();
  app.render();
}

const heroParam = params.get('hero');
if (heroParam) {
  const seedRaw = params.get('seed');
  // Третий аргумент — пометка debug: такой забег уйдёт в статистику как отладочный.
  // &sig=riposte — начать с указанным персональным артефактом героя, открыт он или нет.
  app.newRun(heroParam, seedRaw ? Number(seedRaw) >>> 0 : undefined, true, params.get('sig') ?? undefined);
  const run = app.run!;
  // &art=id1,id2@3 — досыпать артефакты в оружие (для отладки интерфейса), тир через @ (по умолчанию 1); сокеты под них
  // универсальные, тип артефакта не важен
  for (const spec of (params.get('art') ?? '').split(',').filter(Boolean)) {
    const [id, tier] = spec.split('@');
    run.hero.weapon.slots.push({ id, tier: Math.max(1, Math.min(3, Number(tier) || 1)) as ArtTier });
    run.hero.weapon.slotKinds.push('any');
  }
  // &events=gnome_art — каждая клетка события в этом забеге разыгрывает заданный вид (живой забег, нужное событие)
  const forced = params.get('events');
  if (forced && forced in EVENT_WEIGHTS) app.forcedEvent = forced as EventKind;
  // &potion=heal_potion — положить зелье в слот
  const potionParam = params.get('potion');
  if (potionParam) run.hero.potion = potionParam;
  // &locs=swamp,hive,ship — задать локации забега по порядку
  const locs = (params.get('locs') ?? '').split(',').filter((id): id is LocationId => id in LOCATION_BY_ID);
  if (locs.length) run.locations = locs.concat(run.locations.filter((id) => !locs.includes(id))).slice(0, 3);
  // &gauntlet=1 — парад боссов: каждый акт начинается сразу с клетки босса, экипировка героя на 5 тире, артефакты на 3-м
  // (с &art=… и &potion=… — билд под просмотр фаз; &locs= задаёт трёх боссов, остальных трёх — второй забег)
  if (params.get('gauntlet')) {
    for (const g of [run.hero.weapon, run.hero.armor]) while (upgradeGearTier(run.rng, g)) {}
    for (const a of [...run.hero.weapon.slots, ...run.hero.armor.slots]) if (a) a.tier = 3;
    run.roomIndex = ROOMS_PER_LOCATION - 1;
    run.hero.hp = 999; // до нового максимума обрежет пересчёт статов при входе в бой
    const render = app.render.bind(app);
    app.render = () => {
      if (run.phase === 'map' && run.roomIndex === 0) run.roomIndex = ROOMS_PER_LOCATION - 1;
      render();
    };
  }
  // &loc=1 — начать с указанного акта (0..2)
  const locParam = params.get('loc');
  if (locParam) run.locationIndex = Math.max(0, Math.min(2, Number(locParam) || 0));
  // Испытания (v0.48): предложение — под локацию после &locs/&loc; &trial=pack — сразу выбрать заданное; отладочный вход
  // в клетку (&enter/&phase/&room/&gauntlet) без &trial= идёт без испытания, чтобы старые адреса скриншотов не менялись.
  if (locs.length || locParam) offerTrials(run);
  const trialParam = params.get('trial');
  if (trialParam && trialParam in TRIALS) {
    run.trial = trialParam;
    run.trialOffer = [];
    run.trialLog.push(trialParam);
  } else if (params.get('enter') || params.get('phase') || params.get('room') || params.get('gauntlet')) run.trialOffer = [];
  // &room=9 — начать с указанной клетки этажа (0..9): &room=9&phase=reward — трофей босса с подписью о лечении
  const roomParam = params.get('room');
  if (roomParam) run.roomIndex = Math.max(0, Math.min(ROOMS_PER_LOCATION - 1, Number(roomParam) || 0));
  const phase = params.get('phase');
  if (phase === 'reward' || phase === 'won') {
    const dice = [run.hero.weapon.dmgMin, run.hero.weapon.dmgMax];
    run.hero.weapon.dmgMin = 999;
    run.hero.weapon.dmgMax = 999;
    app.enterRoom();
    for (const e of run.battle?.enemies.slice() ?? []) app.battleAction({ type: 'attack', target: e.uid }, false);
    // &phase=won — остаться на плашке победы, не забирая награду; &log=1 — сразу раскрыть лог боя.
    if (phase === 'reward') {
      app.finishBattle();
      // Чит нужен только на бой: в награде кубик в консоли и сравнение с надетым должны быть настоящими.
      [run.hero.weapon.dmgMin, run.hero.weapon.dmgMax] = dice;
      app.render();
    }
    else if (params.get('log')) app.toggleLog();
    // &focus=attack|defense — сразу выбрать пул награды (без него экран ждёт выбора); &take=art выбирает «Нападение» сам.
    const focus = params.get('focus') ?? (params.get('take') === 'art' ? 'attack' : null);
    if (focus === 'attack' || focus === 'defense') app.chooseRewardFocus(focus);
    // &offer=w:whip:2:onHitBleed=1,art:fireball:1 — заменить варианты награды заданными (проверка карточек, см. debugOffer)
    const offer = debugOffer(params.get('offer'), run.rng);
    if (offer.length && run.rewards[0]) {
      run.rewards[0].focus ??= 'attack';
      run.rewards[0].options = offer;
      app.render();
    }
    // &take=art — сразу взять первый артефакт из награды (открывает выбор слота)
    if (params.get('take') === 'art') {
      const i = run.rewards[0]?.options.findIndex((o) => o.kind === 'artifact') ?? -1;
      if (i >= 0) app.takeReward(i);
    }
  } else if (phase === 'event') {
    // Случайное событие в третьей клетке; &event=shop|camp|chest|altar|forge|elite|gnome|gnome_art — заданное.
    run.roomIndex = 2;
    const ev = params.get('event');
    if (ev && ev in EVENT_WEIGHTS) {
      startEvent(run, ev as EventKind);
      app.render();
    } else app.enterRoom();
  } else if (phase === 'shop' || phase === 'camp') {
    run.roomIndex = 2;
    startEvent(run, phase);
    // &offer=… у торговца — первый предмет, первый артефакт и первое зелье из списка встают на прилавок
    const offer = debugOffer(params.get('offer'), run.rng);
    if (run.shop && offer.length) {
      for (const it of offer) {
        if (it.kind === 'gear') run.shop.gear = it.gear;
        else if (it.kind === 'artifact') run.shop.artifact = it.artifact;
        else run.shop.potion = it.potion;
      }
    }
    app.render();
  } else if (phase === 'end') {
    run.phase = 'defeat';
    app.render();
  } else if (params.get('enter')) {
    app.enterRoom();
    // &foes=goblin_shaman,goblin — заменить врагов боя заданными (ряд всё равно строится по ролям, v0.46)
    const foes = (params.get('foes') ?? '').split(',').filter((id) => ENEMY_LIST.some((e) => e.id === id));
    if (foes.length && run.battle) {
      run.battle = createBattle(heroDef(run.hero.defId), run.hero, foes, run.rng, run.locationIndex);
      app.render();
    }
    // &use=id1,id2 — сразу применить артефакты по первому врагу
    for (const id of (params.get('use') ?? '').split(',').filter(Boolean)) {
      app.battleAction({ type: 'artifact', artifactId: id, target: run.battle?.enemies[0]?.uid }, false);
    }
    // &boss2=1 (вместе с &room=9) — сразу вторая фаза босса: HP на порог (или 1 у встающих после смерти) и один удар героя
    if (params.get('boss2')) {
      const boss = run.battle?.enemies.find((e) => enemyDef(e.defId).rank === 'boss');
      const p2 = boss && enemyDef(boss.defId).phase2;
      if (boss) {
        boss.hp = p2 ? Math.ceil(boss.maxHp * p2.atHp) + 1 : 1;
        app.battleAction({ type: 'attack', target: boss.uid }, false);
      }
    }
  } else {
    app.render();
  }
} else {
  // ?screen=select|collection|bestiary|stats — сразу нужный экран вне забега; &loc=crypt — вкладка бестиария
  const screen = params.get('screen');
  const locParam = params.get('loc');
  // &tab=start|mastery — вкладка превью на выборе героя; &pick=mage — какой герой подсвечен
  const tab = params.get('tab');
  if (tab === 'start' || tab === 'mastery') app.heroTab = tab;
  const pick = params.get('pick');
  if (pick && HERO_LIST_IDS.includes(pick)) app.heroPick = pick;
  if (screen === 'select') app.showHeroSelect();
  else if (screen === 'collection') app.showCollection();
  else if (screen === 'bestiary') app.showBestiary(locParam && locParam in LOCATION_BY_ID ? (locParam as LocationId) : undefined);
  else if (screen === 'stats') app.showStats();
}

// &sheet=1 — открыть оверлей «Персонаж», &pause=1 — паузу (на любом экране забега)
if (app.run && app.screen === 'run') {
  if (params.get('sheet')) app.toggleSheet();
  else if (params.get('pause')) app.togglePause();
}

// Для отладки из консоли: mv.run, mv.render(), mv.unlockAll() — открыть вторые персональные артефакты (false — закрыть)
(window as unknown as { mv: App }).mv = app;

/** Демо-ответ ?data=runs для `&mock=1`: 90 забегов шести героев, победы у трети, гибели по разным клеткам — чтобы экран «Статистика» было на чём смотреть. */
function mockRuns(): RunsFeed {
  const heroes = ['warrior', 'mage', 'assassin', 'paladin', 'berserk', 'archer'];
  const locs = ['forest', 'crypt', 'caves', 'swamp', 'hive', 'ship'];
  const killers = ['Вожак стаи', 'Лич', 'Королева улья', 'Капитан', 'Кладка', 'Гоблин-шаман'];
  const weapons = ['sword', 'axe', 'bow', 'staff', 'spear', 'mace', 'stiletto', 'whip'];
  const armors = ['mail', 'plate', 'robe', 'cloak', 'harness', 'shroud'];
  const arts = ['fireball', 'bleed_burst', 'troll_heart', 'thorns', 'shield_bash', 'magic_missile', 'rage', 'aimed_shot', 'evasion_amulet', 'hex', 'whirlwind', 'regen_amulet'];
  const rng = createRng(42);
  const rows: unknown[][] = [];
  for (let i = 0; i < 90; i++) {
    const hero = heroes[i % heroes.length];
    const r = next(rng);
    const event = r < 0.3 ? 'victory' : r < 0.9 ? 'defeat' : 'abandoned';
    const act = event === 'victory' ? 3 : 1 + Math.floor(next(rng) * 3);
    const room = event === 'victory' ? 10 : next(rng) < 0.5 ? 10 : 1 + Math.floor(next(rng) * 9);
    const pickOne = (a: string[]) => a[Math.floor(next(rng) * a.length)];
    const artList = Array.from({ length: 2 + Math.floor(next(rng) * 4) }, () => `${pickOne(arts)}@${1 + Math.floor(next(rng) * 3)}`).join(' ');
    rows.push([
      new Date().toISOString(),
      event,
      hero,
      act,
      pickOne(locs),
      room,
      30 + Math.floor(next(rng) * 60),
      400 + Math.floor(next(rng) * 900),
      pickOne(killers),
      200 + Math.floor(next(rng) * 600),
      150 + Math.floor(next(rng) * 400),
      `${pickOne(weapons)}@${1 + act} +str`,
      `${pickOne(armors)}@${1 + act}`,
      artList,
    ]);
  }
  return { keys: ['ts', 'event', 'hero', 'act', 'location', 'room', 'turns', 'duration', 'lastBattle', 'damageDealt', 'damageTaken', 'weapon', 'armor', 'artifacts'], rows };
}

/**
 * Отладочный набор предметов из адреса (проверка карточек, v0.50): `w:<база>:<тир>[:<стат>=<число>][:s=<сокеты>]` — оружие,
 * `a:…` — броня, `art:<id>:<тир>` — артефакт, `p:<зелье>`; через запятую. Сокеты буквами: w — оружейный, a — бронный,
 * x — универсальный (`s=wx`). Без аффикса в адресе он бросается случайно; `none` — без аффикса.
 */
function debugOffer(spec: string | null, rng: Rng): LootItem[] {
  const out: LootItem[] = [];
  for (const part of (spec ?? '').split(',').filter(Boolean)) {
    const [kind, id, tierRaw, ...rest] = part.split(':');
    if (kind === 'p') {
      out.push({ kind: 'potion', potion: id });
      continue;
    }
    if (kind === 'art') {
      out.push({ kind: 'artifact', artifact: { id, tier: Math.max(1, Math.min(3, Number(tierRaw) || 1)) as ArtTier } });
      continue;
    }
    const gk: GearKind = kind === 'w' ? 'weapon' : 'armor';
    const tier = Math.max(1, Math.min(5, Number(tierRaw) || 1)) as GearTier;
    const base = baseOf(gk, id);
    const dmg = baseDamage(base, tier);
    const arm = baseArmorStats(base, tier);
    const n = GEAR_TIERS[tier].slots;
    let affix: GearAffix | null = rollAffix(rng, gk, tier);
    let kinds: SlotKind[] = rollSlotKinds(rng, gk, n);
    for (const r of rest) {
      const [k, v] = r.split('=');
      if (k === 's') kinds = Array.from({ length: n }, (_, i) => (v[i] === 'w' ? 'weapon' : v[i] === 'a' ? 'armor' : 'any'));
      else if (k === 'none') affix = null;
      else affix = { stat: k as keyof DerivedStats, value: Number(v) };
    }
    out.push({
      kind: 'gear',
      gear: {
        kind: gk,
        tier,
        base: id,
        name: baseTitle(base, tier),
        dmgMin: gk === 'weapon' ? dmg.min : 0,
        dmgMax: gk === 'weapon' ? dmg.max : 0,
        def: gk === 'armor' ? arm.def : 0,
        hp: gk === 'armor' ? arm.hp : 0,
        affix,
        slots: Array.from({ length: n }, () => null),
        slotKinds: kinds,
      },
    });
  }
  return out;
}
