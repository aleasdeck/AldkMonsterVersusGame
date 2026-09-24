import { h } from './dom';
import type { EventKind, BattleEvent, EventTarget, GearKind, LocationId, PlayerAction, RewardFocus, RunState } from '../engine/types';
import * as R from '../engine/run';
import { STATUS_NAMES, actionReach, canUseAction, findEnemy } from '../engine/combat';
import { enemyDef } from '../data/enemies';
import { HIT_GAP, heroClip, eventFx, lungeAgain, planEnemyFx, planHeroFx, playAfter, playShots, delayEnemyShots, type AfterFx, type FxPlan } from './fx';
import { heroArtUrls, playHeroClip } from './heroSprite';
import { enemyArtUrls, playEnemyAction, playEnemyClip, playEnemyDeaths } from './enemySprite';
import {
  clearRun,
  loadProfile,
  loadRun,
  lockedForRun,
  pickedSignature,
  pickedStart,
  pickedTrait,
  recordAchievements,
  recordEnemies,
  recordFinds,
  recordResult,
  saveRun,
  savePick,
  saveSignaturePick,
  setAllUnlocked,
  signatureUnlocked,
  startUnlocked,
  traitUnlocked,
  type Profile,
  type RunUnlocks,
} from './save';
import { achievementKey } from '../data/mastery';
import { artifactDef } from '../data/artifacts';
import { dropRunsCache, fetchRuns, reportRun } from './telemetry';
import type { RunReportEvent } from '../engine/report';
import { loadoutFinds } from '../data/collection';
import { HERO_LIST, heroDef } from '../data/heroes';
import { menuScreen } from './screens/menu';
import { heroSelectScreen } from './screens/heroSelect';
import { mapScreen } from './screens/map';
import { actionSpecs, battleScreen, type TileSpec } from './screens/battle';
import { rewardScreen } from './screens/reward';
import { eventScreen } from './screens/event';
import { shopScreen } from './screens/shop';
import { campScreen } from './screens/camp';
import { endScreen } from './screens/end';
import { collectionScreen } from './screens/collection';
import { bestiaryScreen } from './screens/bestiary';
import { statsScreen, type StatsScope, type StatsTab } from './screens/stats';
import type { RunsFeed } from '../engine/globalStats';
import { hideTooltip, installTooltips } from './tooltip';
import { formatClock } from './topbar';
import { heroSheet } from './screens/heroSheet';
import { pauseMenu } from './screens/pause';
import { logOverlay } from './screens/runLog';
import { installHotkeys } from './hotkeys';
import { locationBackground } from './backgrounds';
import { warmImages } from './preload';
import { showPreview } from './preview';

const ENEMY_STEP_MS = 600;
const FLOAT_MS = 900;
/**
 * Сколько новый экран не принимает кликов. Второй клик двойного клика по «Надеть» в награде прилетал уже во «Войти»
 * на карте (кнопки стоят друг под другом) и открывал следующую клетку — событие разыгрывалось без игрока.
 */
const SETTLE_MS = 400;
/** С какой клетки акта заказывать фон следующей локации: после босса карта открывается сразу, ждать там нечего. */
const WARM_NEXT_ROOM = 8;

export class App {
  root: HTMLElement;
  run: RunState | null = null;
  screen: 'menu' | 'heroSelect' | 'run' | 'collection' | 'bestiary' | 'stats' = 'menu';
  /**
   * Выбранный приём в бою (v0.26): 'attack' или id артефакта; null — не выбран. Сначала приём, потом цель: клик по врагу
   * применяет его. Гибрид: приём остаётся выбранным, пока его можно применить, в начале хода не выбрано ничего.
   */
  armed: string | null = null;
  /** Цель, выбранная клавишей Tab (uid врага); живёт до следующей перерисовки. */
  aim: number | null = null;
  /** Идёт ход врагов — кнопки заблокированы. */
  busy = false;
  /** Лог боя раскрыт вместо плиток приёмов. Сбрасывается по концу боя. */
  logOpen = false;
  /** Открыт оверлей «Персонаж». Живёт только в App, не сохраняется. */
  sheetOpen = false;
  /** Открыта пауза. */
  pauseOpen = false;
  profile: Profile;
  /** Герой, подсвеченный в сетке выбора: справа показано его превью. */
  heroPick: string = HERO_LIST[0].id;
  /** Текст поля «Сид» на экране выбора — переживает перерисовку при клике по плитке. */
  seedText = '';
  /** Вкладка превью на выборе героя (v0.50): статы и владение, выбор на старт или мастерство. */
  heroTab: 'hero' | 'start' | 'mastery' = 'hero';
  /** Вкладка-локация и выбранная запись в бестиарии. */
  bestiaryLoc: LocationId = 'forest';
  bestiaryPick: string | null = null;
  /** Экран «Статистика»: ответ таблицы (null — не загружен), идёт ли загрузка, текст ошибки. `&mock=1` подсовывает демо-ответ. */
  statsFeed: RunsFeed | null = null;
  statsLoading = false;
  statsError: string | null = null;
  statsMock: RunsFeed | null = null;
  /** Экран «Статистика»: главная вкладка — все игроки или своя; внутри общей — герои, гибели, убийцы, оружие, броня, артефакты. */
  statsScope: StatsScope = 'all';
  statsTab: StatsTab = 'heroes';
  private stepTimer: number | null = null;
  /** Снаряд героя в полёте: перерисовка и числа ждут попадания, новые действия не принимаются. */
  private fxTimer: number | null = null;
  /** Тикает раз в секунду и пишет время забега в топбар напрямую, без перерисовки. */
  private clockTimer: number | null = null;
  private resultRecorded = false;
  /** Что открыл последний законченный забег (v0.45): опыт, уровень, артефакты — для экрана итогов. */
  lastUnlocks: RunUnlocks | null = null;
  /** Всплывающая строка поверх экрана («Открыто: Кровавая баня»), гаснет сама. */
  toast: string | null = null;
  private toastTimer: number | null = null;
  /** Отпечаток экрана и момент его смены: клики в первые SETTLE_MS после смены глотаются (см. SETTLE_MS). */
  private screenKey = '';
  private screenChangedAt = -Infinity;

  constructor(root: HTMLElement) {
    this.root = root;
    this.profile = loadProfile();
    installTooltips(root);
    installHotkeys(this);
    root.addEventListener(
      'click',
      (ev) => {
        if (performance.now() - this.screenChangedAt < SETTLE_MS) {
          ev.stopPropagation();
          ev.preventDefault();
        }
      },
      true,
    );
  }

  start(): void {
    this.run = loadRun();
    if (this.run && R.isRunOver(this.run)) {
      clearRun();
      this.run = null;
    }
    // Сохранение посреди хода врагов — доигрываем его при загрузке.
    if (this.run?.battle?.phase === 'enemy') {
      let guard = 0;
      while (this.run.battle.phase === 'enemy' && guard++ < 50) R.battleEnemyStep(this.run);
      this.run.battle.events = [];
    }
    this.screen = 'menu';
    this.render();
  }

  hasSave(): boolean {
    return !!this.run && !R.isRunOver(this.run);
  }

  render(): void {
    this.noteOutcome();
    this.noteEnemies();
    this.noteFinds();
    this.noteAchievements();
    this.warmArt();
    // Перерисовки внутри экрана (действия боя, покупки, выбор цели) отпечаток не меняют — только переход на другой экран.
    const r = this.run;
    this.settleArmed();
    this.aim = null;
    // Выбор пула награды (v0.39) — тоже смена экрана: «Выбрать» стоит там же, где потом «Надеть», второй клик двойного не должен брать предмет.
    const key = [this.screen, r?.phase, r?.locationIndex, r?.roomIndex, r?.rewards.length, !!r?.pending, R.awaitsFocus(r?.rewards[0]), r ? R.awaitsTrial(r) : false].join('|');
    if (key !== this.screenKey) {
      this.screenKey = key;
      this.screenChangedAt = performance.now();
    }
    let el: HTMLElement;
    if (this.screen === 'heroSelect') el = heroSelectScreen(this);
    else if (this.screen === 'collection') el = collectionScreen(this);
    else if (this.screen === 'bestiary') el = bestiaryScreen(this);
    else if (this.screen === 'stats') el = statsScreen(this);
    else if (this.screen === 'menu' || !this.run) el = menuScreen(this);
    else {
      switch (this.run.phase) {
        case 'map':
          el = mapScreen(this);
          break;
        case 'battle':
          el = battleScreen(this);
          break;
        case 'reward':
          el = rewardScreen(this);
          break;
        case 'event':
          el = eventScreen(this);
          break;
        case 'shop':
          el = shopScreen(this);
          break;
        case 'camp':
          el = campScreen(this);
          break;
        default:
          el = endScreen(this);
      }
    }
    // Оверлеи рисуются той же перерисовкой из состояния App: ход врагов по таймеру их не снесёт,
    // а клики по полю и плиткам под ними не проходят.
    // «Персонаж» и лог доступны и на итогах забега: посмотреть билд и бои, которыми он кончился.
    // В бою лог — выдвижная панель на поле (battle.ts), вне боя — оверлей.
    if (this.screen === 'run' && this.run) {
      if (this.sheetOpen) el.appendChild(heroSheet(this));
      else if (this.logOpen && this.run.phase !== 'battle') el.appendChild(logOverlay(this));
      else if (this.pauseOpen && !R.isRunOver(this.run)) el.appendChild(pauseMenu(this));
    }
    hideTooltip();
    // Слой анимаций боя переезжает в новое дерево: снаряд, выпущенный до перерисовки, долетает и лопается уже в нём.
    const live = this.root.querySelector<HTMLElement>('.fx-layer');
    const fresh = el.querySelector<HTMLElement>('.fx-layer');
    if (live && fresh) fresh.replaceWith(live);
    if (this.toast) el.appendChild(h('div', { class: 'toast' }, this.toast));
    this.root.replaceChildren(el);
    this.syncClock();
  }

  /**
   * Достижения наборов (v0.45) пишутся в профиль в тот момент, когда набор сработал, — даже если забег потом проигран;
   * открытые ими артефакты всплывают строкой поверх экрана. Чтение профиля — только когда есть что записать.
   */
  private noteAchievements(): void {
    const run = this.run;
    if (!run || run.debug) return;
    const keys = [...(run.setsReached ?? []).map((a) => achievementKey('set', a)), ...(run.bossSets ?? []).map((a) => achievementKey('boss', a))];
    if (keys.every((k) => this.profile.achievements.includes(k))) return;
    const res = recordAchievements(run);
    this.profile = res.profile;
    if (res.opened.length) this.showToast(`Открыто: ${res.opened.map((id) => artifactDef(id).name).join(', ')}`);
  }

  showToast(text: string): void {
    this.toast = text;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast = null;
      this.toastTimer = null;
      this.root.querySelector('.toast')?.remove();
    }, 3500);
  }

  /**
   * Картинки забега — фон текущей локации в обоих кадрах и файлы героя — заказываются браузеру заранее (preload.ts):
   * адреса известны задолго до показа, а весят файлы сотни килобайт. К последним клеткам акта туда же идёт фон
   * следующей локации. Проверка при каждой перерисовке: повторный заказ preload.ts отсекает сам.
   */
  private warmArt(): void {
    const run = this.run;
    if (!run) return;
    const here = R.currentLocation(run).id;
    warmImages(locationBackground(here, 'tall'), locationBackground(here, 'wide'), ...heroArtUrls(run.hero.defId), ...enemyArtUrls);
    const next = run.locations[run.locationIndex + 1];
    if (next && run.roomIndex >= WARM_NEXT_ROOM) warmImages(locationBackground(next, 'tall'), locationBackground(next, 'wide'));
  }

  /**
   * Каждый враг, показавшийся в бою, открывается в бестиарии — призванные и отделившиеся тоже.
   * Проверка при каждой перерисовке: любое появление врага на поле проходит через render().
   */
  private noteEnemies(): void {
    const enemies = this.run?.battle?.enemies;
    if (!enemies) return;
    const fresh = enemies.map((e) => e.defId).filter((id, i, all) => !this.profile.bestiary.includes(id) && all.indexOf(id) === i);
    if (fresh.length) this.profile = recordEnemies(fresh);
  }

  /**
   * Коллекция открывается тем, что попало герою в руки: обе базы экипировки, артефакты в сокетах со своими тирами
   * и зелье в слоте. Как и бестиарий, проверяется при каждой перерисовке — любая выдача предмета кончается render().
   */
  private noteFinds(): void {
    if (!this.run) return;
    const fresh = loadoutFinds(this.run.hero).filter((key, i, all) => !this.profile.collection.includes(key) && all.indexOf(key) === i);
    if (fresh.length) this.profile = recordFinds(fresh);
  }

  // ─── Таймер забега ───────────────────────────────────────────────────────

  /** Сколько идёт забег, мс. Законченный — до момента конца. */
  runElapsed(): number {
    const s = this.run?.stats;
    if (!s?.startedAt) return 0;
    return (s.finishedAt || Date.now()) - s.startedAt;
  }

  /** Таймер живёт только на экранах забега; в меню и на итогах останавливается. */
  private syncClock(): void {
    const active = this.screen === 'run' && !!this.run && !R.isRunOver(this.run);
    if (active && this.clockTimer === null) {
      this.clockTimer = window.setInterval(() => {
        const el = this.root.querySelector('.run-clock');
        if (el) el.textContent = `⏱ ${formatClock(this.runElapsed())}`;
      }, 1000);
    } else if (!active && this.clockTimer !== null) {
      window.clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  // ─── Оверлеи ─────────────────────────────────────────────────────────────

  toggleSheet(): void {
    this.sheetOpen = !this.sheetOpen;
    this.pauseOpen = false;
    this.render();
  }

  togglePause(): void {
    this.pauseOpen = !this.pauseOpen;
    this.sheetOpen = false;
    this.render();
  }

  /** Из паузы — к логу боя: пауза закрывается, лог раскрывается. */
  toggleLogFromPause(): void {
    this.pauseOpen = false;
    this.toggleLog();
  }

  /** Esc: закрыть верхний слой, снять выбор приёма, а если ни того ни другого нет — открыть паузу. */
  escape(): void {
    if (this.sheetOpen) this.toggleSheet();
    else if (this.logOpen) this.toggleLog();
    else if (this.pauseOpen) this.togglePause();
    else if (this.run && R.isRunOver(this.run)) return;
    else if (this.armed) this.arm(null);
    else this.togglePause();
  }

  private overlayOpen(): boolean {
    return this.sheetOpen || this.pauseOpen || (this.logOpen && this.run?.phase !== 'battle');
  }

  private commit(): void {
    if (this.run && !R.isRunOver(this.run)) saveRun(this.run);
    this.render();
  }

  /**
   * Одна запись о забеге в статистику: отметка `run.reported` лежит в самом забеге и переживает перезагрузку,
   * поэтому гибель, отправленная в момент падения героя, не уйдёт второй раз по кнопке «К итогам».
   */
  private report(event: RunReportEvent): void {
    const run = this.run;
    if (!run || run.reported) return;
    run.reported = true;
    // Забег ещё в сохранении (гибель до кнопки «К итогам») — отметку надо сохранить вместе с ним.
    if (!R.isRunOver(run)) saveRun(run);
    reportRun(run, event, this.profile);
  }

  /**
   * Исход уходит в статистику в тот момент, когда он решён, а не когда игрок дощёлкал до экрана итогов: герой пал —
   * запись уже в пути. Раньше гибель отправлял только `finishBattle`, и закрытая на плашке «Герой пал» вкладка
   * (или уход в меню) не оставляли о забеге ни строчки. Вызывается из render(), отметка держит одну запись на забег.
   */
  private noteOutcome(): void {
    const run = this.run;
    if (!run || run.reported) return;
    if (run.phase === 'victory') this.report('victory');
    else if (run.phase === 'defeat' || run.battle?.phase === 'lost') {
      // Время забега тоже останавливается здесь: на плашке гибели часы уже не идут.
      run.stats.finishedAt = run.stats.finishedAt || Date.now();
      this.report('defeat');
    }
  }

  /** Забег закончился — записать результат, снести сохранение. */
  private afterPhaseChange(): void {
    if (this.run && R.isRunOver(this.run)) {
      if (!this.resultRecorded) {
        this.resultRecorded = true;
        this.run.stats.finishedAt = this.run.stats.finishedAt || Date.now();
        // Статистика уходит до записи в профиль: в ней число законченных забегов игрока «до этого».
        this.report(this.run.phase === 'victory' ? 'victory' : 'defeat');
        // Отладочный забег мастерство не качает: `?hero=` и так открывает всё, что нужно.
        if (!this.run.debug) {
          const res = recordResult(this.run);
          this.profile = res.profile;
          this.lastUnlocks = res.unlocks;
        } else this.lastUnlocks = null;
      }
      clearRun();
      this.render();
      return;
    }
    this.commit();
  }

  // ─── Навигация ───────────────────────────────────────────────────────────

  showMenu(): void {
    this.stopStepping();
    this.sheetOpen = false;
    this.pauseOpen = false;
    this.logOpen = false;
    if (this.run && R.isRunOver(this.run)) this.run = null;
    this.screen = 'menu';
    this.render();
  }

  showHeroSelect(): void {
    this.stopStepping();
    this.sheetOpen = false;
    this.logOpen = false;
    if (this.run && R.isRunOver(this.run)) this.run = null;
    this.screen = 'heroSelect';
    this.render();
  }

  selectHero(id: string): void {
    this.heroPick = id;
    this.render();
  }

  setHeroTab(tab: 'hero' | 'start' | 'mastery'): void {
    this.heroTab = tab;
    this.render();
  }

  /** Клик по карточке персонального артефакта на экране героя: закрытый не выбирается, выбор живёт в профиле. */
  selectSignature(heroId: string, id: string): void {
    if (!signatureUnlocked(this.profile, heroDef(heroId), id)) return;
    this.profile = saveSignaturePick(heroId, id);
    this.render();
  }

  /** Черта героя на экране выбора (v0.45): закрытая не выбирается. */
  selectTrait(heroId: string, id: string): void {
    if (!traitUnlocked(this.profile, heroDef(heroId), id)) return;
    this.profile = savePick('traitPick', heroId, id);
    this.render();
  }

  /** Стартовое оружие на экране выбора (v0.45): вариант открывается мастерством 5. */
  selectStart(heroId: string, base: string): void {
    if (!startUnlocked(this.profile, heroDef(heroId), base)) return;
    this.profile = savePick('startPick', heroId, base);
    this.render();
  }

  /** Отладка из консоли: `mv.unlockAll()` открывает вторые персональные артефакты всем героям, `mv.unlockAll(false)` закрывает. */
  unlockAll(on = true): void {
    this.profile = setAllUnlocked(on);
    this.render();
  }

  showCollection(): void {
    this.screen = 'collection';
    this.render();
  }

  setStatsTab(tab: StatsTab): void {
    this.statsTab = tab;
    this.render();
  }

  setStatsScope(scope: StatsScope): void {
    this.statsScope = scope;
    this.render();
  }

  /**
   * Открыть статистику: общая тянется заново **на каждом заходе** (v0.40.5, просьба пользователя) — мимо кэша `fetchRuns`.
   * До этого ответ жил десять минут в localStorage и ещё столько же в уже загруженном `statsFeed`, так что свой только что
   * законченный забег в таблице не появлялся. Прошлые данные остаются на экране, пока летит запрос: заход не моргает
   * «Загружаем…», в шапке видно «обновляем…». Запрос не стакается — пока летит один, второй не шлём.
   */
  showStats(): void {
    this.screen = 'stats';
    dropRunsCache();
    if (this.statsMock) this.statsFeed = this.statsMock;
    else if (!this.statsLoading) {
      this.statsLoading = true;
      this.statsError = null;
      fetchRuns()
        .then((feed) => {
          this.statsFeed = feed;
          this.statsError = null;
        })
        .catch((err: unknown) => {
          // Сеть подвела — старую таблицу не выбрасываем, а пишем в шапке, что обновиться не вышло.
          this.statsError = `Не удалось загрузить: ${err instanceof Error ? err.message : String(err)}`;
        })
        .finally(() => {
          this.statsLoading = false;
          if (this.screen === 'stats') this.render();
        });
    }
    this.render();
  }

  showBestiary(loc?: LocationId): void {
    if (loc) this.bestiaryLoc = loc;
    this.screen = 'bestiary';
    this.render();
  }

  bestiarySelect(id: string): void {
    this.bestiaryPick = id;
    this.render();
  }

  /**
   * `debug` — забег начат отладочным параметром URL: в статистику уйдёт с пометкой. `signature` — персональный артефакт
   * (отладочный `&sig=`, мимо открытия); без него — выбор из профиля, если открыт, иначе первый из пары.
   */
  newRun(heroId: string, seed?: number, debug = false, signature?: string): void {
    this.dropRun();
    const def = heroDef(heroId);
    // Чужой или опечатанный id из URL — молча первый из пары, а не сломанная страница.
    const sig = signature && def.signatures.includes(signature) ? signature : pickedSignature(this.profile, def);
    // Мастерство (v0.45): черта, стартовое оружие и закрытые артефакты — из профиля. Отладочный забег открыт весь.
    this.run = R.newRun(heroId, seed, Date.now(), sig, pickedTrait(this.profile, def), { start: pickedStart(this.profile, def), locked: debug ? [] : lockedForRun(this.profile), trials: true });
    this.run.debug = debug;
    this.armed = null;
    this.resultRecorded = false;
    this.screen = 'run';
    this.commit();
  }

  continueRun(): void {
    if (!this.hasSave()) return;
    this.screen = 'run';
    this.resultRecorded = false;
    this.render();
  }

  abandonRun(): void {
    if (!this.run) return;
    if (!window.confirm('Бросить текущий забег? Прогресс пропадёт.')) return;
    this.stopStepping();
    this.sheetOpen = false;
    this.pauseOpen = false;
    this.dropRun();
    clearRun();
    this.run = null;
    this.showMenu();
  }

  /** Незаконченный забег уходит в статистику как брошенный — перед тем как его заменят новым или сотрут. */
  private dropRun(): void {
    const run = this.run;
    if (!run || R.isRunOver(run)) return;
    // Герой пал, но игрок ушёл в меню, не нажав «К итогам»: это гибель, а не брошенный забег (обычно уже отправлена).
    this.report(run.battle?.phase === 'lost' ? 'defeat' : 'abandoned');
  }

  // ─── Комнаты ─────────────────────────────────────────────────────────────

  /** Отладка: если задано, каждая клетка события разыгрывает этот вид (URL `&events=gnome_art`). */
  forcedEvent: EventKind | null = null;

  enterRoom(): void {
    if (!this.run) return;
    // Отладка (&events=kind): клетка события всегда разыгрывает заданный вид — живой забег, но нужное событие.
    if (this.forcedEvent && this.run.phase === 'map' && R.currentRoomKind(this.run) === 'event') R.startEvent(this.run, this.forcedEvent);
    else R.enterRoom(this.run);
    this.armed = null;
    this.commit();
  }

  // ─── Бой: выбор приёма и цели ───────────────────────────────────────────

  /** Плитка выбранного приёма; null — не выбран. */
  armedSpec(): TileSpec | null {
    if (!this.armed || this.run?.phase !== 'battle' || !this.run.battle) return null;
    return actionSpecs(this).find((s) => s.key === this.armed) ?? null;
  }

  /** Кого достанет выбранный приём; null — приём не выбран, подсветки нет. */
  armedTargets(): number[] | null {
    return this.armedSpec()?.targets ?? null;
  }

  /** Имя и дальность выбранного приёма для ридаута в покое. */
  armedInfo(): { name: string; reach: string } | null {
    const spec = this.armedSpec();
    const b = this.run?.battle;
    if (!spec || !b) return null;
    const r = actionReach(b, spec.action(b.enemies[0]?.uid ?? -1));
    return { name: spec.name, reach: r === 'any' ? 'любая цель' : r === 'row' ? 'весь ряд' : 'первый в ряду' };
  }

  /** Выбрать приём (повторно — снять выбор). */
  arm(key: string | null): void {
    this.armed = this.armed === key ? null : key;
    this.render();
  }

  /** Клик по врагу: применить выбранный приём; нельзя — причина в ридауте без перерисовки. */
  applyArmed(uid: number): void {
    const b = this.run?.battle;
    if (!b || b.phase !== 'player' || this.busy) return;
    const spec = this.armedSpec();
    if (!spec) {
      showPreview(this, { title: findEnemy(b, uid)?.name ?? '', parts: [], err: 'Сначала выберите приём' });
      return;
    }
    const action = spec.action(uid);
    const err = canUseAction(b, action);
    if (err) {
      showPreview(this, { ...spec.preview(uid), err });
      return;
    }
    this.battleAction(action);
  }

  /** Enter или повторный номер приёма: применить к цели, выбранной Tab, иначе к первой, по которой приём применим (Крюк первого не тянет). */
  applyAim(): void {
    const spec = this.armedSpec();
    const b = this.run?.battle;
    if (!spec || !b) return;
    const target = this.aim ?? spec.targets.find((uid) => canUseAction(b, spec.action(uid)) === null) ?? spec.targets[0];
    if (target !== undefined) this.applyArmed(target);
  }

  /** Tab: перебрать цели выбранного приёма; рамка и ридаут — как при наведении, без перерисовки. */
  aimNext(): void {
    const spec = this.armedSpec();
    if (!spec || spec.targets.length === 0) return;
    const i = this.aim === null ? -1 : spec.targets.indexOf(this.aim);
    this.aim = spec.targets[(i + 1) % spec.targets.length];
    for (const el of this.root.querySelectorAll('.enemy.aim')) el.classList.remove('aim');
    this.root.querySelector(`.enemy[data-uid="${this.aim}"]`)?.classList.add('aim');
    showPreview(this, spec.preview(this.aim));
  }

  /** Гибрид: выбор держится, пока приём применим хоть по кому-то; кончилась стамина, ушёл в перезарядку, бой кончился — снимается сам. */
  private settleArmed(): void {
    if (!this.armed) return;
    const b = this.run?.battle;
    if (this.run?.phase !== 'battle' || !b || b.phase !== 'player' || this.busy) {
      this.armed = null;
      return;
    }
    const spec = actionSpecs(this).find((s) => s.key === this.armed);
    if (!spec || spec.err) this.armed = null;
  }

  /**
   * Действие героя. План анимации считается до применения (цели ещё живы), снаряды летят по старому полю,
   * и только когда долетят — перерисовка и всплывающие числа; до этого новые действия не принимаются.
   * animate=false — без ожидания (отладочные параметры URL применяют действия подряд).
   */
  battleAction(action: PlayerAction, animate = true): void {
    const run = this.run;
    if (!run?.battle || this.busy || this.fxTimer !== null) return;
    if (canUseAction(run.battle, action)) return;
    const plan = animate ? planHeroFx(run, action) : null;
    // Нарисованный клип героя стартует до применения приёма: он играет на старом поле вместе со снарядом.
    const clip = plan && heroClip(plan, action);
    if (clip && playHeroClip(this.root, run.hero.defId, clip)) plan!.clipped = true;
    R.battleAction(run, action);
    const events = run.battle.events.splice(0);
    if (!plan) {
      this.commit();
      this.playEvents(events);
      return;
    }
    saveRun(run);
    const impact = playShots(this.root, plan);
    const land = () => {
      this.fxTimer = null;
      playEnemyDeaths(this.root, events, HIT_GAP);
      this.render();
      this.playEvents(events, plan);
    };
    if (impact > 0) this.fxTimer = window.setTimeout(land, impact);
    else land();
  }

  endTurn(): void {
    const run = this.run;
    if (!run?.battle || this.busy || this.fxTimer !== null || run.battle.phase !== 'player') return;
    R.battleEndTurn(run);
    this.armed = null;
    this.busy = true;
    this.render();
    this.scheduleStep();
  }

  /** extra — сколько ещё играют удары многоударного приёма после перерисовки: следующий враг ждёт их. */
  private scheduleStep(extra = 0): void {
    this.stepTimer = window.setTimeout(() => this.step(), ENEMY_STEP_MS + extra);
  }

  private step(): void {
    this.stepTimer = null;
    const run = this.run;
    if (!run?.battle) {
      this.busy = false;
      return;
    }
    // Под оверлеем ход врагов стоит: ждём, пока игрок закроет персонажа или паузу.
    if (this.overlayOpen()) {
      this.scheduleStep();
      return;
    }
    // Жертва атаки — первый союзник, иначе герой: снаряд босса летит в него.
    const victim: EventTarget = run.battle.allies[0]?.uid ?? 'hero';
    R.battleEnemyStep(run);
    const events = run.battle.events.splice(0);
    const plan = planEnemyFx(run, events, victim);
    let clipImpact = 0;
    for (const ev of events) {
      if (ev.type !== 'enemyAction') continue;
      const at = playEnemyAction(this.root, ev.target, ev.name);
      if (at > 0) {
        delayEnemyShots(plan, ev.target, at);
        clipImpact = Math.max(clipImpact, at);
        plan.lunged.add(ev.target);
      }
    }
    const impact = Math.max(playShots(this.root, plan), clipImpact);
    const land = () => {
      this.stepTimer = null;
      playEnemyDeaths(this.root, events, HIT_GAP);
      if (run.battle!.phase === 'enemy') {
        this.render();
        this.scheduleStep(this.playEvents(events, plan));
      } else {
        this.busy = false;
        saveRun(run);
        this.render();
        this.playEvents(events, plan);
      }
    };
    if (impact > 0) this.stepTimer = window.setTimeout(land, impact);
    else land();
  }

  private stopStepping(): void {
    if (this.stepTimer !== null) window.clearTimeout(this.stepTimer);
    this.stepTimer = null;
    if (this.fxTimer !== null) window.clearTimeout(this.fxTimer);
    this.fxTimer = null;
    this.busy = false;
  }

  /** Лог боя за весь забег: в бою — панель на поле, вне боя — оверлей. Открывается поверх паузы. */
  toggleLog(): void {
    this.logOpen = !this.logOpen;
    if (this.logOpen) this.pauseOpen = false;
    this.render();
  }

  finishBattle(): void {
    if (!this.run) return;
    R.finishBattle(this.run);
    this.armed = null;
    this.logOpen = false;
    this.afterPhaseChange();
  }

  // ─── Награды, события, привал ────────────────────────────────────────────

  takeReward(index: number): void {
    if (!this.run) return;
    R.takeReward(this.run, index);
    this.afterPhaseChange();
  }

  skipReward(): void {
    if (!this.run) return;
    R.skipReward(this.run);
    this.afterPhaseChange();
  }

  rerollReward(): void {
    if (!this.run) return;
    if (R.rerollReward(this.run)) this.commit();
  }

  /** Пул награды за бой: «Нападение» или «Защита» (v0.39), после выбора катятся три карточки. */
  /** Испытание локации (v0.48): выбор из двух предложенных перед первой клеткой. */
  chooseTrial(id: string): void {
    if (!this.run) return;
    if (R.chooseTrial(this.run, id)) this.commit();
  }

  chooseRewardFocus(focus: RewardFocus): void {
    if (!this.run) return;
    if (R.chooseRewardFocus(this.run, focus)) this.commit();
  }

  pendingPlace(kind: GearKind, index: number): void {
    if (!this.run) return;
    R.pendingPlace(this.run, kind, index);
    this.afterPhaseChange();
  }

  pendingDiscard(): void {
    if (!this.run) return;
    R.pendingDiscard(this.run);
    this.afterPhaseChange();
  }

  /** Переплавить ожидающий артефакт в тир артефакту своего архетипа (v0.43). */
  pendingSmelt(kind: GearKind, index: number): void {
    if (!this.run) return;
    R.pendingSmelt(this.run, kind, index);
    this.afterPhaseChange();
  }

  pendingCancel(): void {
    if (!this.run) return;
    R.pendingCancel(this.run);
    this.render();
  }

  // Событие: сундук, алтарь, кузнец, добыча с вора. Каждый выбор либо ведёт к следующей клетке, либо открывает выбор слота.
  leaveEvent(): void {
    if (!this.run) return;
    R.leaveEvent(this.run);
    this.afterPhaseChange();
  }

  takeChest(): void {
    if (!this.run) return;
    R.takeChest(this.run);
    this.afterPhaseChange();
  }

  altarPray(): void {
    if (!this.run) return;
    R.altarPray(this.run);
    this.afterPhaseChange();
  }

  altarSacrifice(): void {
    if (!this.run) return;
    if (R.altarSacrifice(this.run)) this.afterPhaseChange();
  }

  forgeUpgrade(kind: GearKind): void {
    if (!this.run) return;
    if (R.forgeUpgrade(this.run, kind)) this.afterPhaseChange();
  }

  gnomeTakeLoot(): void {
    if (!this.run) return;
    if (R.gnomeTakeLoot(this.run)) this.afterPhaseChange();
  }

  // ─── Магазин ─────────────────────────────────────────────────────────────

  shopHeal(): void {
    if (!this.run) return;
    if (R.shopHeal(this.run)) this.commit();
  }

  shopBuyGear(): void {
    if (!this.run) return;
    if (R.shopBuyGear(this.run)) this.afterPhaseChange();
  }

  shopBuyArtifact(): void {
    if (!this.run) return;
    if (R.shopBuyArtifact(this.run)) this.afterPhaseChange();
  }

  shopBuyPotion(): void {
    if (!this.run) return;
    if (R.shopBuyPotion(this.run)) this.commit();
  }

  shopReroll(): void {
    if (!this.run) return;
    if (R.shopReroll(this.run)) this.commit();
  }

  leaveShop(): void {
    if (!this.run) return;
    R.leaveShop(this.run);
    this.afterPhaseChange();
  }

  campRest(): void {
    if (!this.run) return;
    R.campRest(this.run);
    this.afterPhaseChange();
  }

  campForge(kind: GearKind, index: number): void {
    if (!this.run) return;
    R.campForge(this.run, kind, index);
    this.afterPhaseChange();
  }

  // ─── Анимация событий боя ────────────────────────────────────────────────

  private spriteWrap(target: 'hero' | number): HTMLElement | null {
    const sel = target === 'hero' ? '.hero-zone .sprite-wrap' : `[data-uid="${target}"] .sprite-wrap`;
    return this.root.querySelector<HTMLElement>(sel);
  }

  /** Полоска HP бойца в свежем дереве: у героя она в блоке консоли, у врагов и союзников — на плитке. */
  private hpBar(target: EventTarget): HTMLElement | null {
    const sel = target === 'hero' ? '.c-hero .bar-hp' : `[data-uid="${target}"] .bar-hp`;
    return this.root.querySelector<HTMLElement>(sel);
  }

  /** Свечение бафа — герою, союзникам, элите и боссам; рядовые враги только наскакивают. Облако дебафа — всем. */
  private glows(target: EventTarget): boolean {
    if (target === 'hero') return true;
    const e = this.run?.battle?.enemies.find((x) => x.uid === target);
    return !e || enemyDef(e.defId).rank !== 'normal';
  }

  /**
   * Всплывающие числа и эффекты на бойцах по событиям боя — на свежем поле. Облако (дебаф), свечение (баф, лечение)
   * и щит (блок) — по одному на бойца за пакет; план добавляет свои: свечение героя от приёма на себя, глоток зелья.
   */
  private isPhaseShift(target: EventTarget, name: string): boolean {
    const e = typeof target === 'number' && this.run?.battle ? findEnemy(this.run.battle, target) : undefined;
    return !!e && enemyDef(e.defId).phase2?.name === name && e.phase === 2;
  }

  /**
   * Кому отматывать полоску HP (v0.40.2): у бойца, по которому в этом пакете прошло несколько ударов, движок уже снял все HP разом,
   * а цифры идут по очереди. Считаем, сколько HP снимет каждый следующий удар (`left[i]` — хвост после i-го), и ведём полоску за
   * цифрами. Лечение в том же пакете (вампиризм, регенерация) сбивает счёт — такую цель не трогаем.
   */
  private planDrains(events: BattleEvent[]): Map<string, { el: HTMLElement; hp: number; left: number[] }> {
    const hits = new Map<string, number[]>();
    const healed = new Set<string>();
    for (const ev of events) {
      if (ev.type === 'damage') {
        const key = String(ev.target);
        const list = hits.get(key) ?? [];
        list.push(ev.amount);
        hits.set(key, list);
      } else if (ev.type === 'heal') healed.add(String(ev.target));
    }
    const out = new Map<string, { el: HTMLElement; hp: number; left: number[] }>();
    for (const [key, list] of hits) {
      if (list.length < 2 || healed.has(key) || list.reduce((a, b) => a + b, 0) <= 0) continue;
      const el = this.hpBar(key === 'hero' ? 'hero' : Number(key));
      const now = el ? readBar(el) : null;
      if (!el || !now) continue;
      // Хвост с конца: left[i] — сколько HP снимут удары после i-го, left[list.length] = 0.
      const left = new Array<number>(list.length + 1).fill(0);
      for (let i = list.length - 1; i >= 0; i--) left[i] = left[i + 1] + list[i];
      out.set(key, { el, hp: now.hp, left });
    }
    return out;
  }

  /**
   * Всплывающие цифры и эффекты по событиям боя. Удары одного приёма по одной цели идут по очереди с шагом HIT_GAP:
   * каждый — своя цифра, своя тряска, свой наскок бьющего и свой кусок полоски HP. Возвращает, через сколько мс отыграет последний удар.
   */
  playEvents(events: BattleEvent[], plan?: FxPlan): number {
    const counters = new Map<string, number>();
    const hitSeq = new Map<string, number>();
    const drains = this.planDrains(events);
    let actor: EventTarget | null = plan?.lunged.has('hero') ? 'hero' : null;
    let longest = 0;
    const done = new Set<string>();
    const after = (kind: AfterFx['kind'], color: string, target: EventTarget) => {
      const key = `${kind}:${target}`;
      if (done.has(key)) return;
      done.add(key);
      // Глоток сам подсвечивает героя.
      if (kind === 'drink') done.add('glow:hero');
      playAfter(this.root, { kind, color, target });
    };
    // Разбитая склянка сама даёт облако — статусное поверх него не нужно.
    for (const s of plan?.shots ?? []) if (s.kind === 'flask') done.add(`cloud:${s.to}`);
    for (const a of plan?.after ?? []) after(a.kind, a.color, a.target);
    for (const ev of events) {
      if (ev.type === 'log') continue;
      const wrap = this.spriteWrap(ev.target);
      if (!wrap) continue;
      const fx = eventFx(ev);
      // Щит и облако видны у всех, свечение — только у героя, элит и боссов.
      if (fx && (fx.kind !== 'glow' || this.glows(ev.target))) after(fx.kind, fx.color, ev.target);
      const key = String(ev.target);
      const n = counters.get(key) ?? 0;
      counters.set(key, n + 1);
      let text = '';
      let cls = '';
      switch (ev.type) {
        case 'damage': {
          if (ev.kind === 'blocked') {
            text = 'блок';
            cls = 'f-block';
          } else {
            text = ev.kind === 'crit' ? `−${ev.amount} крит!` : `−${ev.amount}`;
            cls = ev.kind === 'crit' ? 'f-crit' : ev.kind === 'dot' ? 'f-dot' : 'f-dmg';
          }
          const seq = hitSeq.get(key) ?? 0;
          hitSeq.set(key, seq + 1);
          const who = actor;
          const hurt = ev.kind !== 'blocked';
          // Цифры ударов разнесены по времени, а не по высоте: каждая стартует с той же строки, что и первая.
          const drain = drains.get(key);
          const land = () => {
            const animatedEnemy = playEnemyClip(this.root, ev.target, hurt ? 'hurt' : 'block');
            if (hurt && !animatedEnemy) shake(wrap);
            // Герою прилетело: своя анимация вместо одной тряски — блок, если удар погас о щит.
            if (ev.target === 'hero' && this.run) playHeroClip(this.root, this.run.hero.defId, hurt ? 'hurt' : 'block');
            if (seq > 0 && who !== null && !this.root.querySelector(`[data-uid="${who}"] .enemy-sheet`)) lungeAgain(this.root, who);
            // Полоска догоняет цифру: первый удар отматывает её назад без перехода, остальные снимают HP по своему куску.
            if (drain) setBarHp(drain.el, drain.hp + drain.left[seq + 1], seq === 0);
            floatText(wrap, text, cls, n - seq);
          };
          if (seq === 0) land();
          else {
            longest = Math.max(longest, seq * HIT_GAP);
            window.setTimeout(land, seq * HIT_GAP);
          }
          continue;
        }
        case 'heal':
          text = `+${ev.amount}`;
          cls = 'f-heal';
          break;
        case 'block':
          text = `+${ev.amount} ⛨`;
          cls = 'f-shield';
          break;
        case 'status':
          text = STATUS_NAMES[ev.status];
          cls = 'f-status';
          break;
        case 'enemyAction':
          text = ev.name;
          cls = 'f-action';
          actor = ev.target;
          // Ход перехода во вторую фазу — босс стоит, наскока нет.
          if (!plan?.lunged.has(ev.target) && !this.isPhaseShift(ev.target, ev.name)) wrap.closest('.enemy, .ally')?.classList.add('acting');
          break;
        case 'stunned':
          text = 'оглушён';
          cls = 'f-status';
          break;
        case 'summon':
          text = 'появляется';
          cls = 'f-status';
          break;
        case 'phase':
          text = ev.name;
          cls = 'f-phase';
          playAfter(this.root, { kind: 'burst', color: ev.color, target: ev.target });
          break;
        default:
          continue;
      }
      floatText(wrap, text, cls, n);
    }
    return longest;
  }
}

/** Числа на полоске: она и есть источник — движок уже посчитал итог, а показ мы отматываем назад. */
function readBar(el: HTMLElement): { hp: number; max: number } | null {
  const m = /(\d+)\/(\d+)/.exec(el.querySelector('.bar-text')?.firstChild?.nodeValue ?? '');
  return m ? { hp: Number(m[1]), max: Number(m[2]) } : null;
}

/**
 * Промежуточное значение на полоске HP. `instant` — отмотка назад перед первым ударом: с переходом полоска сперва поехала бы
 * вверх, к уже снятым HP. Дальше ширина меняется обычным переходом в 200 мс — ровно шаг между ударами (HIT_GAP).
 */
function setBarHp(el: HTMLElement, hp: number, instant: boolean): void {
  const node = el.querySelector('.bar-text')?.firstChild;
  const now = readBar(el);
  const fill = el.querySelector<HTMLElement>('.bar-fill');
  if (!node?.nodeValue || !now || !fill) return;
  const shown = Math.max(0, hp);
  node.nodeValue = node.nodeValue.replace(/\d+(?=\/)/, String(shown));
  const pct = now.max > 0 ? Math.max(0, Math.min(100, (shown / now.max) * 100)) : 0;
  if (instant) {
    fill.style.transition = 'none';
    fill.style.width = `${pct}%`;
    // Чтение размера фиксирует кадр без перехода — иначе браузер склеит обе ширины в одну анимацию.
    void fill.offsetWidth;
    fill.style.transition = '';
  } else fill.style.width = `${pct}%`;
}

function shake(el: HTMLElement): void {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function floatText(wrap: HTMLElement, text: string, cls: string, index: number): void {
  const el = h('div', { class: `float ${cls}`, style: `top:${-8 - index * 20}px` }, text);
  wrap.appendChild(el);
  window.setTimeout(() => el.remove(), FLOAT_MS);
}
