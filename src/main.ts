import { App } from './ui/app';
import { ROOMS_PER_LOCATION } from './data/locations';

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
// ?hero=...&phase=reward|event|camp|end — сразу нужный экран (бой выигрывается читом).
const params = new URLSearchParams(window.location.search);
const heroParam = params.get('hero');
if (heroParam) {
  const seedRaw = params.get('seed');
  app.newRun(heroParam, seedRaw ? Number(seedRaw) >>> 0 : undefined);
  const run = app.run!;
  // &art=id1,id2 — досыпать артефакты в оружие (для отладки интерфейса)
  for (const id of (params.get('art') ?? '').split(',').filter(Boolean)) run.hero.weapon.slots.push({ id, tier: 1 });
  // &loc=1 — начать с указанной локации (0..2)
  const locParam = params.get('loc');
  if (locParam) run.locationIndex = Math.max(0, Math.min(2, Number(locParam) || 0));
  const phase = params.get('phase');
  if (phase === 'reward') {
    run.hero.weapon.dmgMin = 999;
    run.hero.weapon.dmgMax = 999;
    app.enterRoom();
    for (const e of run.battle?.enemies.slice() ?? []) app.battleAction({ type: 'attack', target: e.uid });
    app.finishBattle();
    // &take=art — сразу взять первый артефакт из награды (открывает выбор слота)
    if (params.get('take') === 'art') {
      const i = run.rewards[0]?.options.findIndex((o) => o.kind === 'artifact') ?? -1;
      if (i >= 0) app.takeReward(i);
    }
  } else if (phase === 'event') {
    run.roomIndex = 2;
    app.enterRoom();
  } else if (phase === 'camp') {
    run.roomIndex = ROOMS_PER_LOCATION;
    run.phase = 'camp';
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
} else if (params.get('screen') === 'select') {
  app.showHeroSelect();
}

// Для отладки из консоли: mv.run, mv.render()
(window as unknown as { mv: App }).mv = app;
