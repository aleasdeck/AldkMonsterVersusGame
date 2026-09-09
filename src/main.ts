import { App } from './ui/app';
import { EVENT_WEIGHTS, LOCATION_BY_ID, ROOMS_PER_LOCATION } from './data/locations';
import { startEvent } from './engine/run';
import type { EventKind, LocationId } from './engine/types';
import { COLLECTIBLE_IDS } from './data/collection';
import { ENEMY_LIST } from './data/enemies';
import { loadProfile, saveProfile } from './ui/save';

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
// &phase=event&event=chest|altar|forge|elite|shop|camp — заданное событие в третьей клетке.
const params = new URLSearchParams(window.location.search);

// &mock=1 — демо-профиль: статистика, сундуки, часть коллекции и половина бестиария (для отладки экранов)
if (params.get('mock')) {
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
    chests: 3,
    collection: COLLECTIBLE_IDS.filter((_, i) => i % 3 === 0),
    bestiary: ENEMY_LIST.filter((_, i) => i % 2 === 0).map((e) => e.id),
  });
  app.profile = loadProfile();
  app.render();
}

const heroParam = params.get('hero');
if (heroParam) {
  const seedRaw = params.get('seed');
  app.newRun(heroParam, seedRaw ? Number(seedRaw) >>> 0 : undefined);
  const run = app.run!;
  // &art=id1,id2 — досыпать артефакты в оружие (для отладки интерфейса)
  for (const id of (params.get('art') ?? '').split(',').filter(Boolean)) run.hero.weapon.slots.push({ id, tier: 1 });
  // &potion=heal_potion — положить зелье в слот
  const potionParam = params.get('potion');
  if (potionParam) run.hero.potion = potionParam;
  // &locs=swamp,hive,ship — задать локации забега по порядку
  const locs = (params.get('locs') ?? '').split(',').filter((id): id is LocationId => id in LOCATION_BY_ID);
  if (locs.length) run.locations = locs.concat(run.locations.filter((id) => !locs.includes(id))).slice(0, 3);
  // &loc=1 — начать с указанного акта (0..2)
  const locParam = params.get('loc');
  if (locParam) run.locationIndex = Math.max(0, Math.min(2, Number(locParam) || 0));
  // &room=9 — начать с указанной клетки этажа (0..9): &room=9&phase=reward — трофей босса с подписью о лечении
  const roomParam = params.get('room');
  if (roomParam) run.roomIndex = Math.max(0, Math.min(ROOMS_PER_LOCATION - 1, Number(roomParam) || 0));
  const phase = params.get('phase');
  if (phase === 'reward' || phase === 'won') {
    run.hero.weapon.dmgMin = 999;
    run.hero.weapon.dmgMax = 999;
    app.enterRoom();
    for (const e of run.battle?.enemies.slice() ?? []) app.battleAction({ type: 'attack', target: e.uid });
    // &phase=won — остаться на плашке победы, не забирая награду; &log=1 — сразу раскрыть лог боя.
    if (phase === 'reward') app.finishBattle();
    else if (params.get('log')) app.toggleLog();
    // &take=art — сразу взять первый артефакт из награды (открывает выбор слота)
    if (params.get('take') === 'art') {
      const i = run.rewards[0]?.options.findIndex((o) => o.kind === 'artifact') ?? -1;
      if (i >= 0) app.takeReward(i);
    }
  } else if (phase === 'event') {
    // Случайное событие в третьей клетке; &event=shop|camp|chest|altar|forge|elite — заданное.
    run.roomIndex = 2;
    const ev = params.get('event');
    if (ev && ev in EVENT_WEIGHTS) {
      startEvent(run, ev as EventKind);
      app.render();
    } else app.enterRoom();
  } else if (phase === 'shop' || phase === 'camp') {
    run.roomIndex = 2;
    startEvent(run, phase);
    app.render();
  } else if (phase === 'end') {
    run.phase = 'defeat';
    app.render();
  } else if (params.get('enter')) {
    app.enterRoom();
    // &use=id1,id2 — сразу применить артефакты по первому врагу
    for (const id of (params.get('use') ?? '').split(',').filter(Boolean)) {
      app.battleAction({ type: 'artifact', artifactId: id, target: run.battle?.enemies[0]?.uid });
    }
  } else {
    app.render();
  }
} else {
  // ?screen=select|collection|bestiary|chest — сразу нужный экран вне забега; &loc=crypt — вкладка бестиария
  const screen = params.get('screen');
  const locParam = params.get('loc');
  if (screen === 'select') app.showHeroSelect();
  else if (screen === 'collection') app.showCollection();
  else if (screen === 'bestiary') app.showBestiary(locParam && locParam in LOCATION_BY_ID ? (locParam as LocationId) : undefined);
  else if (screen === 'chest') app.showChest();
  else if (screen === 'spin') app.openChest();
}

// &sheet=1 — открыть оверлей «Персонаж», &pause=1 — паузу (на любом экране забега)
if (app.run && app.screen === 'run') {
  if (params.get('sheet')) app.toggleSheet();
  else if (params.get('pause')) app.togglePause();
}

// Для отладки из консоли: mv.run, mv.render()
(window as unknown as { mv: App }).mv = app;
