# Monster Versus — заметки для Claude

Браузерный пошаговый пиксельный рогалик (по мотивам MicroMonsters). Vite + TypeScript + DOM/CSS, без фреймворка, тесты Vitest. Весь код, комментарии, тексты игры и документация — на русском.

Что читать по задаче:
- `README.md` — запуск, все debug-параметры URL (`?hero=…&seed=…&phase=…`), объект `mv` в консоли.
- `docs/GDD.md` — дизайн-документ: числа героев/врагов/предметов, правила боя, §8 «Экраны и интерфейс» (раскладка кадра, плитки, оверлеи, клавиши), §12 «Принятые решения», §13 «Статус» (история версий с цифрами бота).
- Этот файл — карта кода, рабочие соглашения и ловушки.

## Команды

```bash
npm run dev                                          # http://localhost:5173
npx vitest run                                       # тесты движка (~2 с, 160 тестов)
node node_modules/typescript/bin/tsc --noEmit -p .   # typecheck — ТОЛЬКО так (см. ловушки)
node node_modules/vite/bin/vite.js build             # сборка в dist/
SIM=1 npx vitest run tests/balance-sim.test.ts       # бот-симулятор баланса, все герои, 60 забегов
SIM=1 SIM_HERO=berserk SIM_N=300 npx vitest run tests/balance-sim.test.ts   # один герой; 300 забегов на всех — ~15 с
SIM_DEBUG=1 SIM_HERO=warrior SIM_SEED=3 SIM_FIGHTS=4 npx vitest run tests/sim-debug.test.ts   # лог первых боёв бота
SIM_DEBUG=stall SIM_HERO=paladin npx vitest run tests/sim-debug.test.ts                     # найти пат
```

Перед коммитом: tsc из node_modules + `npx vitest run`. После правки любых чисел баланса — SIM на 300 забегах.

## Карта кода

```
src/engine/   чистая логика, без DOM, покрыта тестами
  types.ts      ВСЕ типы + SAVE_VERSION, MAX_ENEMIES, MAX_ALLIES. Начинать чтение отсюда.
  rng.ts        mulberry32: createRng/next/int/chance/pick/shuffle/weighted
  stats.ts      computeStats: база героя → кубик оружия (владение) → перки → аффиксы → пассивки
  combat.ts     бой: статусы, урон, союзники, действия героя, ИИ врагов, createBattle, describeAction/computeIntent
  equipment.ts  слоты, addArtifact/replaceArtifact/equipGear, апгрейд дубликатом
  loot.ts       константы экономики (золото, цены, шанс зелья, цена кузнеца) и генерация наград/магазина/событий (rollEventKind)
  run.ts        машина состояний забега: enterRoom → startEvent | startBattle → finishBattle → reward → advanceRoom …; события: takeChest, altarPray/altarSacrifice, forgeUpgrade, leaveEvent
src/data/     типизированные таблицы; каждый файл экспортирует list-based Record + xxxDef(id)
  heroes.ts     6 героев (warrior, mage, assassin, paladin, berserk, archer), signature — персональный артефакт, SIGNATURE_OWNER
  enemies.ts    67 врагов по локациям (секции ═══), хелпер act(), ai: cycle | boss-rules
  artifacts.ts  42 артефакта: пассивные / активные физ. (STA) / активные маг. (MP), тиры 1–3 через t(a,b,c); 6 персональных (по одному на героя)
  gear.ts       15 баз оружия + 8 брони (одна startOnly), перки, типы, владение, вес оружия (heft → HEFT_MULT), DEF/HP брони по типу (ARMOR_TYPE_STATS), аффиксы, makeGear, upgradeGearTier (кузнец)
  potions.ts    7 зелий, без тира
  locations.ts  6 локаций с encounters, ACTS (тиры лута), ACT_SCALE, ACT_DMG_BONUS, ROOM_KINDS, EVENT_WEIGHTS, BOSS_HEAL_PCT
  collection.ts каталог для сундуков/коллекции — собирается автоматически из данных выше
src/ui/       рендер и клики
  app.ts        class App: state (run, screen, target, busy, logOpen, sheetOpen, pauseOpen…), render() диспатчит по screen/run.phase
                и добавляет оверлеи, commit() = saveRun + render, ход врагов с таймером ENEMY_STEP_MS (под оверлеем ждёт), таймер забега
  frame.ts      runFrame(app, parts): топбар 40 + центр 320 + консоль 180 — все шесть экранов забега
  topbar.ts     кнопка «Персонаж» (☻), золото, акт/локация, лента комнат (ROOM_ICONS), ход, таймер, меню; console.ts — блок героя, hubGear, кнопка лога
  screens/*.ts  один экран — одна функция xxxScreen(app): HTMLElement; heroSheet.ts и pause.ts — оверлеи; bestiary.ts — альбом врагов по локациям (describeAction из combat.ts)
  components.ts карточки предметов, бары, чипы, иконки типов, pendingModal; gearTile.ts — плитка экипировки с сокетами 2×2; dom.ts — h()/button()
  tooltip.ts    свои подсказки: атрибуты tip / tipTitle в h() → data-tip; keywords.ts — подсветка ключевых слов в описаниях
  preview.ts    ридаут и штриховка предпросмотра урона в бою (пишет в DOM без перерисовки); diff.ts — дельты к надетому в карточках
  fx.ts         типовые анимации боя: planHeroFx/planEnemyFx (план до применения действия), playShots (снаряды на старом поле, возвращает impact), playAfter/eventFx (облако дебафа, свечение бафа, щит блока перед бойцом, глоток); спрайты снарядов процедурные
  hotkeys.ts    1–9, Space, C, L, Esc
  sprites.ts, backgrounds.ts, icons.ts   процедурная пиксель-графика (data URL)
  save.ts       localStorage: забег (mv_run_v1, сброс при смене SAVE_VERSION) и профиль (mv_profile_v1, переживает версии; статистика, сундуки, коллекция, бестиарий — recordEnemies из App.render())
src/main.ts   монтирование, масштаб кадра 960×540, разбор debug-параметров URL
src/style.css один файл, секции /* ─── … */
tests/        vitest; sim/bot.ts — умный бот (W — веса оценки, planTurn, playRun, chooseReward)
```

Ключевые инварианты:
- Движок мутирует `RunState`/`BattleState` на месте и не трогает DOM. UI вызывает `R.xxx(run)` и `commit()`.
- Вся случайность — через `run.rng` / переданный `Rng`. Один сид + герой = тот же забег. Не использовать `Math.random` в движке.
- UI: наведение (ридаут, штриховка, дельты в плитке) пишет прямо в готовые узлы через preview.ts/diff.ts и ничего не хранит в App — любое действие перерисует экран. `App.render()` считает отпечаток экрана (screen, phase, клетка, число наград, pending) и при его смене глотает клики `SETTLE_MS` (400 мс) в capture-фазе на root — иначе второй клик двойного клика по «Надеть» в награде нажимал «Войти» на карте; в Playwright-скриптах после перехода ждать ≥ 400 мс перед кликом. Второе исключение — слой `.fx-layer` в поле боя: fx.ts вешает в него снаряды и облака, а `App.render()` переносит живой слой в новое дерево, чтобы полёт доигрался.
- Анимации боя (fx.ts): `App.battleAction` считает план до мутации, применяет действие, играет снаряды и ждёт `impact` мс (`fxTimer`, действия в это время не принимаются), потом render + playEvents. Род анимации выводится из эффектов и типа оружия, переопределение и цвет — поле `fx: FxSpec` у ArtifactDef/PotionDef/Base оружия/EnemyAction. Рядовые враги только наскакивают (`acting`), `fx` ставить лишь элите и боссам. Дебаф → облако, блок → щит, баф/лечение → свечение — из событий боя, в данных не задаются; приём на себя с эффектом block тоже даёт щит. Отладочные циклы в main.ts зовут `battleAction(action, false)` — без ожидания. Кнопки, у которых при недоступности нужен ридаут, делаются без атрибута `disabled` (браузер не шлёт им наведение), а с классом `off`.
- `canXxx(run)` возвращает `string | null` (причина запрета или null), парный `xxx(run)` возвращает boolean/void. UI показывает причину в подсказке.
- Забег: 3 акта × 10 клеток `['fight','fight','event','fight','fight','event','fight','elite','event','boss']`, после босса лечение `BOSS_HEAL_PCT` и сразу следующая локация (привала между актами нет). Клетка `event` при входе разыгрывает `EventKind` по `EVENT_WEIGHTS` (camp 10, elite 5, shop 25, chest 25, altar 25, forge 10); `run.event` хранит, что выпало (элита из события даёт золото и награду как клетка элиты — `effectiveRoomKind`). Локации 3 из 6 случайно без повторов; числа врагов заданы под «родной» tier локации и приводятся к акту через `enemyScale`.
- Фазы забега: `map | battle | reward | shop | event | camp | victory | defeat`; `shop` и `camp` — тоже из события; фаза `event` — сундук, алтарь, кузнец (по `run.event.kind`). `run.pending` — артефакт ждёт выбора слота (обрабатывать до всего остального). После боя может быть 2 экрана награды (второй — зелье), поэтому в тестах и ботах награды пропускать циклом `while (run.phase === 'reward')`. В тестах событие нужного вида — `startEvent(run, kind)` после `run.roomIndex = 2`.
- Бой: STA — очки действий, полностью в начале хода; MP — только реген в начале хода, полностью после комнаты; блок сгорает в начале хода (кроме `blockKeep`); каждая следующая атака в ходу слабее в `fatigue` раз; «Защититься» даёт `ceil(DEF × DEFEND_MULT)`. Статус `smoke` (Дымовая шашка): `damageHero` получает `rng` и гасит удар с шансом `SMOKE_MISS_CHANCE`; для удара в спину и снятия атакой шашка равна скрытности — проверять через `isHidden(h)`, не `getStatus(h, 'stealth')`; праща — `stunOnHit` (шанс на удар). Статус `vulnerable`: `VULNERABLE_MULT` 1.25 к ударам и заклинаниям в `damageEnemy`/`damageHero`/`previewOnTarget`, округление `Math.round` (вниз — съедает бонус при уроне 3–7). Новые статы `onKillHeal`, `blockStart`, `markOnHit`. Эффект `attack.blockPct` — доля урона замаха (dmg, не дошедшего до HP) в блок героя (Щитовой удар); эффект `blockStrike` — урон = текущий блок × mult как удар без кубика, усталости и крита, `canUseAction` даёт «Нет блока» (Таран). Лимит применений за ход: `ArtifactDef.usesPerTurn`, счётчик `hero.uses` (сброс в `startPlayerTurn`, проверка в `canUseAction`).

## Как добавлять контент

- **Враг**: запись в `enemies.ts` (секция локации, `act(...)`, `ai`), добавить в `encounters` локации в `locations.ts`, строка в таблице GDD §7. Спрайт — `blob(...)` или `humanoid(...)`.
- **Артефакт**: `artifacts.ts` в нужной секции; новый `Effect`/стат — сначала в `types.ts` (`Effect`, `DerivedStats`), обработка в `combat.ts`, дефолт в `stats.ts`, описание в GDD §5. Коллекция подхватит сам.
- **База оружия/брони**: `gear.ts` `WEAPON_BASES`/`ARMOR_BASES` с перком через `byTier([...])`; оружию — `heft` (light/heavy или ничего) и `spread`, броне — `armorType` (он же задаёт DEF/HP через `ARMOR_TYPE_STATS`); GDD §4. Новые статы перка — как у артефактов.
- **Герой**: `heroes.ts` (mastery, armorSkill, стартовое снаряжение, `signature` — персональный артефакт, он один в оружии, броня пустая), GDD §3.2, потом SIM на нём. Персональные артефакты фильтрует `canDropFor` в loot.ts; в UI чип/карточка получают класс `signature`.
- **Изменил форму `RunState`/`BattleState`/`HeroPersistent`** — поднять `SAVE_VERSION` в `types.ts` (старые сейвы просто сбрасываются, миграций нет).
- Тесты: `combat.test.ts` (`mkBattle(hero, [enemies])` фиксирует урон на среднем, крит 0 и ставит героям классическую пару артефактов `LEGACY_PAIR`, не стартовую), `run.test.ts` (простой `playBattle`, `resolvePending`), `weapons.test.ts`, `armor.test.ts`. Новая механика — новый `it` рядом с похожим.
- После фичи обновить: `README.md` (если новые параметры/команды), GDD — таблицы + новый абзац `vX.Y:` в §13 и при необходимости пункт в §12.

## Как менять UI (v0.11, гибрид «топбар + консоль»)

- Экран забега = `runFrame(app, { cls, center, top?, mid, right?, log?, overlays? })`: центр 320 px, `top` — строка во всю ширину правее блока героя (в бою ридаут), `mid` — центр консоли под ней (в бою плитки, на хабах `hubGear(app)`), `right` — блок 110 px, `overlays` — модалки. Топбар и блок героя экран не рисует — они общие. Экраны вне забега (меню, выбор героя, коллекция, сундук, итоги) каркас не используют.
- Оверлеи «Персонаж» и «Пауза» — состояние `app.sheetOpen` / `app.pauseOpen`, рисуются в `App.render()` поверх экрана; ничего не вставлять в DOM мимо `render()`, кроме наведения (ниже).
- Подсказки: только атрибуты `tip` / `tipTitle` в `h()` и `button()`; нативный `title` не использовать (две подсказки). Описания предметов пропускать через `markKeywords()`.
- Наведение в бою: `bindPreview(app, el, () => spec)` из `preview.ts` — ридаут `.readout` и штриховка `.bar-ghost` на полоске цели. Пишет в готовые узлы, ничего не хранит. На хабах предпросмотра при наведении нет (убран по просьбе пользователя): дельты к надетому — только в карточке (`gearDiffLines` из `diff.ts`).
- Плитки боя: `TileSpec` в `battle.ts`; крупное число — `effectValue()`, число артефакта в сокете — `artifactShort()` в `gearTile.ts`. Ряды: класс `.tiles.rows-1|rows-2` ставит рендер по числу плиток (два ряда с восьми).
- Хоткеи в `hotkeys.ts` работают только при `app.screen === 'run'` и не в полях ввода; новые клавиши — туда же и в подпись паузы.
- Размеры кадра фиксированы (960×540, консоль 180, блок героя 205, плитка 78): новая строка в блок героя или плитку — сначала посчитать высоту, потом проверить скриншотом.
- Проверка: dev-сервер пользователя обычно уже крутится на :5173 (свой не поднимать). Скриншот: `msedge.exe --headless=new --disable-gpu --hide-scrollbars --window-size=960,540 --virtual-time-budget=6000 --screenshot=<png> "http://localhost:5173/?hero=warrior&seed=5&enter=1"`, PNG смотреть Read-тулом. Обязательные адреса: бой с 9 плитками `?hero=warrior&art=whirlwind,stun_strike,war_cry,second_wind,bleed_cut,fireball&enter=1`, союзники `?hero=mage&art=wolf_whistle&use=wolf_whistle&enter=1`, `&phase=reward|shop|event|camp`, события `&phase=event&event=chest|altar|forge`, трофей босса `&room=9&phase=reward`, очки сверх максимума `&art=second_wind&use=second_wind&enter=1`, `&sheet=1`, `&pause=1`. Наведение и полный забег — временным блоком в конце `main.ts` (диспатч `mouseenter`, автоигра через методы App), затем `git checkout src/main.ts`. Расширение Claude in Chrome у пользователя не работает.
- Скриншот посреди анимации: headless-браузер запускает её с задержкой ~70 мс на клик, поэтому кадры по таймеру врут. Надёжно — Playwright: после клика `document.getAnimations().forEach(a => a.pause())`, выставить `currentTime` анимациям элементов `.fx` и снять кадр (скрипт в scratchpad, глобальный `playwright` в /opt/node22).
- После правок UI: README (управление, параметры) и GDD §8.

## Баланс

Единственный источник истины — умный бот (`tests/sim/bot.ts`), цель **40–60 % побед за каждого героя** на 300 забегах. Живой игрок при 50 % бота сложность чувствует; при 90 % — нет.

Рычаги, которые реально работают на бота (измерено в v0.10): урон врагов `ACT_DMG_BONUS` (locations.ts) и доля DEF в блоке `DEFEND_MULT` (combat.ts). Почти не работают: лечение, частота лута, цены, усталость. HP врагов +40 % даёт паты (бот вечно защищается). Нерфы отдельных приёмов (Вихрь и т. п.) — по наводке пользователя, симулятор их не видит.

Текущее состояние (v0.18, Щитовой удар — блок долей урона, Таран): на 300 забегах Воин 45 %, Маг 43 %, Ассасин 45 %, Паладин 52 %, Берсерк 54 %, Лучник 47 %. v0.15 (статы экипировки по типу брони и весу оружия) на 1200 забегах: Воин 49 %, Маг 40 % (мана 7, стрела до 3/4/5 раз за ход), Ассасин 44 %, Паладин 57 %, Берсерк 52 %, Лучник 47 %. DEF лёгкой брони — сильный рычаг для Мага, Ассасина и Лучника (−1 на тирах 2–5 стоил Ассасину 7 пунктов); усиление перков лёгкой брони бот не замечает, +1 DEF героя — замечает. На 300 забегах разброс ±5, решения принимать по 600. Число событий на этаж — тоже рычаг (третье событие дало +7–12 пунктов). Лаборатория для экспериментов: scratchpad `lab2.py` (копия дерева + патчи + SIM). Паты Паладина ~1–3 % против блокирующей элиты — открытая задача.

Сравнение «до/после» честно только на одной версии бота: `git worktree add --detach <scratchpad>/base HEAD`, node_modules — junction через PowerShell `New-Item -ItemType Junction`, прогнать SIM там. Убирать строго: сначала `(Get-Item …\node_modules).Delete()`, потом `git worktree remove --force`. В облачной сессии проще: `cp -r src tests` плюс конфиги в scratchpad, `ln -s` на node_modules, патчить и гнать SIM там (rsync в контейнере нет).

Перебор рычагов: скрипт в scratchpad патчит одну строку исходника, гонит `SIM_N=200`, откатывает. Python в консоли — `PYTHONIOENCODING=utf-8`.

## Стиль кода

- TS strict, `noUnusedLocals/Parameters`. Одинарные кавычки, точки с запятой, 2 пробела, длинные строки допустимы (до ~220).
- Комментарии и JSDoc — по-русски, объясняют «почему» и игровой смысл, не «что». Числа в комментариях сверять с GDD.
- Секции файлов — `// ─── Название ───…`, в enemies.ts локации — `// ═══`.
- Данные: `const list: XxxDef[] = [...]` → `export const XXX = Object.fromEntries(...)`, `xxxDef(id)` бросает на неизвестный id.
- UI без фреймворка: `h('div', { class: 'x' }, ...children)`, экран целиком перерисовывается через `app.render()`; единственное исключение — наведение (preview.ts, diff.ts, таймер в топбаре), которое пишет в готовые узлы.

## Git

- Ветки `feat/…`, `ui/…`, `fix/…`; после работы merge в `main` (без squash, история — merge-коммиты). Remote: github.com/aleasdeck/AldkMonsterVersusGame.
- Коммиты на английском в стиле `feat: …`, `ui: …`, `fix(ui): …`. **Без AI-атрибуции** (правило пользователя).
- На рабочей машине fetch/push идут через корпоративный прокси: `HTTPS_PROXY` брать из окружения / локальных заметок, в репо не писать; push лучше в фоне (GCM может открыть окно входа).
- Стейл `.git/index.lock` от прошлой сессии — удалять, если `tasklist` не показывает git.

## Ловушки тулинга

- `npx tsc` в цепочке `&&` может подхватить древний глобальный TypeScript (сотни ошибок про `import type`). Только `node node_modules/typescript/bin/tsc`.
- Длинные heredoc (~150 строк с кавычками) в Bash-туле падают с «unexpected EOF». Большие скрипты — через Write в scratchpad, потом `python file.py`.
- `npm test` пропускает SIM-тесты (skipIf без `SIM`), долгий SIM — свой таймаут 30 мин на `it`.
- Бот выбирает оружие через `weaponDice(def, gear)`, а не сырой dmgMin/dmgMax — иначе хватает чужое оружие.
- Кнопка с атрибутом `disabled` не получает `mouseenter` — плитки и строка зелья вместо него используют класс `off` и проверку в onclick, иначе ридаут не покажет причину.
- В JS-регэкспах `` и `\w` не знают кириллицы: границы слов в `keywords.ts` — через lookaround `(?<![а-яёa-z])`.
- Шрифт Handjet мельче VT323: размеры ниже 14 px нечитаемы, база 23 px; заголовки Tiny5.

## Приоритеты пользователя

- Ядро игры — пошаговый бой и сборка билда через оружие/броню со слотами. Визуал не приоритет, процедурные спрайты устраивают.
- Не добавлять без запроса: рюкзак, мета-прогрессию силы, ветвящуюся карту, звук, новые траты золота.
- Пользователь любит получать 2–4 варианта с рекомендацией и выбирать («давай A»). Балансовые правки — с цифрами SIM до/после.
