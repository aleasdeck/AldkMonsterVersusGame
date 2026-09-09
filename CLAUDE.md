# Monster Versus — заметки для Claude

Браузерный пошаговый пиксельный рогалик (по мотивам MicroMonsters). Vite + TypeScript + DOM/CSS, без фреймворка, тесты Vitest. Весь код, комментарии, тексты игры и документация — на русском.

Что читать по задаче:
- `README.md` — запуск, все debug-параметры URL (`?hero=…&seed=…&phase=…`), объект `mv` в консоли.
- `docs/GDD.md` — дизайн-документ: числа героев/врагов/предметов, правила боя, §8 «Экраны и интерфейс» (раскладка кадра, плитки, оверлеи, клавиши), §12 «Принятые решения», §13 «Статус» (история версий с цифрами бота).
- Этот файл — карта кода, рабочие соглашения и ловушки.

## Команды

```bash
npm run dev                                          # http://localhost:5173
npx vitest run                                       # тесты движка (~1 с, 140 тестов)
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
  combat.ts     бой: статусы, урон, союзники, действия героя, ИИ врагов, createBattle, computeIntent
  equipment.ts  слоты, addArtifact/replaceArtifact/equipGear, апгрейд дубликатом
  loot.ts       константы экономики (золото, цены, шанс зелья) и генерация наград/магазина/событий
  run.ts        машина состояний забега: enterRoom → battle → finishBattle → reward → advanceRoom …
src/data/     типизированные таблицы; каждый файл экспортирует list-based Record + xxxDef(id)
  heroes.ts     6 героев (warrior, mage, assassin, paladin, berserk, archer)
  enemies.ts    67 врагов по локациям (секции ═══), хелпер act(), ai: cycle | boss-rules
  artifacts.ts  31 артефакт: пассивные / активные физ. (STA) / активные маг. (MP), тиры 1–3 через t(a,b,c)
  gear.ts       15 баз оружия + 8 брони (одна startOnly), перки, типы, владение, аффиксы, makeGear
  potions.ts    7 зелий, без тира
  locations.ts  6 локаций с encounters, ACTS (тиры лута), ACT_SCALE, ACT_DMG_BONUS, ROOM_KINDS
  collection.ts каталог для сундуков/коллекции — собирается автоматически из данных выше
src/ui/       рендер и клики
  app.ts        class App: state (run, screen, target, busy, logOpen, sheetOpen, pauseOpen…), render() диспатчит по screen/run.phase
                и добавляет оверлеи, commit() = saveRun + render, ход врагов с таймером ENEMY_STEP_MS (под оверлеем ждёт), таймер забега
  frame.ts      runFrame(app, parts): топбар 40 + центр 320 + консоль 180 — все шесть экранов забега
  topbar.ts     портрет, золото, акт/локация, лента комнат (ROOM_ICONS), ход, таймер, меню; console.ts — блок героя, hubGear, кнопка лога
  screens/*.ts  один экран — одна функция xxxScreen(app): HTMLElement; heroSheet.ts и pause.ts — оверлеи
  components.ts карточки предметов, бары, чипы, иконки типов, pendingModal; gearTile.ts — плитка экипировки с сокетами 2×2; dom.ts — h()/button()
  tooltip.ts    свои подсказки: атрибуты tip / tipTitle в h() → data-tip; keywords.ts — подсветка ключевых слов в описаниях
  preview.ts    ридаут и штриховка предпросмотра урона в бою (пишет в DOM без перерисовки); diff.ts — дельты к надетому в карточках
  hotkeys.ts    1–9, Space, C, L, Esc
  sprites.ts, backgrounds.ts, icons.ts   процедурная пиксель-графика (data URL)
  save.ts       localStorage: забег (mv_run_v1, сброс при смене SAVE_VERSION) и профиль (mv_profile_v1, переживает версии)
src/main.ts   монтирование, масштаб кадра 960×540, разбор debug-параметров URL
src/style.css один файл, секции /* ─── … */
tests/        vitest; sim/bot.ts — умный бот (W — веса оценки, planTurn, playRun, chooseReward)
```

Ключевые инварианты:
- Движок мутирует `RunState`/`BattleState` на месте и не трогает DOM. UI вызывает `R.xxx(run)` и `commit()`.
- Вся случайность — через `run.rng` / переданный `Rng`. Один сид + герой = тот же забег. Не использовать `Math.random` в движке.
- UI: наведение (ридаут, штриховка, дельты в плитке) пишет прямо в готовые узлы через preview.ts/diff.ts и ничего не хранит в App — любое действие перерисует экран. Кнопки, у которых при недоступности нужен ридаут, делаются без атрибута `disabled` (браузер не шлёт им наведение), а с классом `off`.
- `canXxx(run)` возвращает `string | null` (причина запрета или null), парный `xxx(run)` возвращает boolean/void. UI показывает причину в подсказке.
- Забег: 3 акта × 8 комнат `['fight','fight','event','fight','fight','elite','shop','boss']`, между актами `camp`. Локации 3 из 6 случайно без повторов; числа врагов заданы под «родной» tier локации и приводятся к акту через `enemyScale`.
- Фазы забега: `map | battle | reward | shop | event | camp | victory | defeat`; `run.pending` — артефакт ждёт выбора слота (обрабатывать до всего остального). После боя может быть 2 экрана награды (второй — зелье), поэтому в тестах и ботах награды пропускать циклом `while (run.phase === 'reward')`.
- Бой: STA — очки действий, полностью в начале хода; MP — только реген в начале хода, полностью после комнаты; блок сгорает в начале хода (кроме `blockKeep`); каждая следующая атака в ходу слабее в `fatigue` раз; «Защититься» даёт `ceil(DEF × DEFEND_MULT)`.

## Как добавлять контент

- **Враг**: запись в `enemies.ts` (секция локации, `act(...)`, `ai`), добавить в `encounters` локации в `locations.ts`, строка в таблице GDD §7. Спрайт — `blob(...)` или `humanoid(...)`.
- **Артефакт**: `artifacts.ts` в нужной секции; новый `Effect`/стат — сначала в `types.ts` (`Effect`, `DerivedStats`), обработка в `combat.ts`, дефолт в `stats.ts`, описание в GDD §5. Коллекция подхватит сам.
- **База оружия/брони**: `gear.ts` `WEAPON_BASES`/`ARMOR_BASES` с перком через `byTier([...])`; GDD §4. Новые статы перка — как у артефактов.
- **Герой**: `heroes.ts` (mastery, armorSkill, стартовое снаряжение, 2 артефакта), GDD §3.2, потом SIM на нём.
- **Изменил форму `RunState`/`BattleState`/`HeroPersistent`** — поднять `SAVE_VERSION` в `types.ts` (старые сейвы просто сбрасываются, миграций нет).
- Тесты: `combat.test.ts` (`mkBattle(hero, [enemies])` фиксирует урон на среднем, крит 0), `run.test.ts` (простой `playBattle`, `resolvePending`), `weapons.test.ts`, `armor.test.ts`. Новая механика — новый `it` рядом с похожим.
- После фичи обновить: `README.md` (если новые параметры/команды), GDD — таблицы + новый абзац `vX.Y:` в §13 и при необходимости пункт в §12.

## Как менять UI (v0.11, гибрид «топбар + консоль»)

- Экран забега = `runFrame(app, { cls, center, top?, mid, right?, log?, overlays? })`: центр 320 px, `top` — строка во всю ширину правее блока героя (в бою ридаут), `mid` — центр консоли под ней (в бою плитки, на хабах `hubGear(app)`), `right` — блок 110 px, `overlays` — модалки. Топбар и блок героя экран не рисует — они общие. Экраны вне забега (меню, выбор героя, коллекция, сундук, итоги) каркас не используют.
- Оверлеи «Персонаж» и «Пауза» — состояние `app.sheetOpen` / `app.pauseOpen`, рисуются в `App.render()` поверх экрана; ничего не вставлять в DOM мимо `render()`, кроме наведения (ниже).
- Подсказки: только атрибуты `tip` / `tipTitle` в `h()` и `button()`; нативный `title` не использовать (две подсказки). Описания предметов пропускать через `markKeywords()`.
- Наведение в бою: `bindPreview(app, el, () => spec)` из `preview.ts` — ридаут `.readout` и штриховка `.bar-ghost` на полоске цели. Пишет в готовые узлы, ничего не хранит. На хабах предпросмотра при наведении нет (убран по просьбе пользователя): дельты к надетому — только в карточке (`gearDiffLines` из `diff.ts`).
- Плитки боя: `TileSpec` в `battle.ts`; крупное число — `effectValue()`, число артефакта в сокете — `artifactShort()` в `gearTile.ts`. Ряды: класс `.tiles.rows-1|rows-2` ставит рендер по числу плиток (два ряда с восьми).
- Хоткеи в `hotkeys.ts` работают только при `app.screen === 'run'` и не в полях ввода; новые клавиши — туда же и в подпись паузы.
- Размеры кадра фиксированы (960×540, консоль 180, блок героя 205, плитка 78): новая строка в блок героя или плитку — сначала посчитать высоту, потом проверить скриншотом.
- Проверка: dev-сервер пользователя обычно уже крутится на :5173 (свой не поднимать). Скриншот: `msedge.exe --headless=new --disable-gpu --hide-scrollbars --window-size=960,540 --virtual-time-budget=6000 --screenshot=<png> "http://localhost:5173/?hero=warrior&seed=5&enter=1"`, PNG смотреть Read-тулом. Обязательные адреса: бой с 9 плитками `?hero=warrior&art=whirlwind,stun_strike,war_cry,second_wind,bleed_cut,fireball&enter=1`, союзники `?hero=mage&art=wolf_whistle&use=wolf_whistle&enter=1`, `&phase=reward|shop|event|camp`, `&sheet=1`, `&pause=1`. Наведение и полный забег — временным блоком в конце `main.ts` (диспатч `mouseenter`, автоигра через методы App), затем `git checkout src/main.ts`. Расширение Claude in Chrome у пользователя не работает.
- После правок UI: README (управление, параметры) и GDD §8.

## Баланс

Единственный источник истины — умный бот (`tests/sim/bot.ts`), цель **40–60 % побед за каждого героя** на 300 забегах. Живой игрок при 50 % бота сложность чувствует; при 90 % — нет.

Рычаги, которые реально работают на бота (измерено в v0.10): урон врагов `ACT_DMG_BONUS` (locations.ts) и доля DEF в блоке `DEFEND_MULT` (combat.ts). Почти не работают: лечение, частота лута, цены, усталость. HP врагов +40 % даёт паты (бот вечно защищается). Нерфы отдельных приёмов (Вихрь и т. п.) — по наводке пользователя, симулятор их не видит.

Текущее состояние (v0.10): все герои 50–59 %, паты Паладина ~3 % против блокирующей элиты — открытая задача. Ассасин исторически ниже остальных.

Сравнение «до/после» честно только на одной версии бота: `git worktree add --detach <scratchpad>/base HEAD`, node_modules — junction через PowerShell `New-Item -ItemType Junction`, прогнать SIM там. Убирать строго: сначала `(Get-Item …\node_modules).Delete()`, потом `git worktree remove --force`.

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
