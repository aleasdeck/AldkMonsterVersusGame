/**
 * Monster Versus — приёмник статистики забегов.
 *
 * Живёт внутри Google Таблицы (Расширения → Apps Script) или отдельным проектом на script.google.com с id таблицы
 * в SPREADSHEET_ID; опубликован как веб-приложение с доступом «Все» (кто может прислать запись; таблицу видит только владелец).
 * Игра шлёт POST с JSON одной записи (поля — src/engine/report.ts плюс touch/screen/lang из src/ui/telemetry.ts),
 * каждая запись — строка листа «runs», колонка на поле, первая колонка ts — время приёма.
 * Ключ, которого в шапке нет, добавляет колонку справа; старые колонки не двигаются, так что записи разных
 * версий игры лежат в одной таблице. Вложенное (detail) кладётся строкой JSON.
 *
 * Обратно игра читает общую статистику: GET ?data=runs отдаёт последние RUNS_LIMIT забегов без отладочных
 * и без колонок PRIVATE_KEYS (id игрока и полный JSON забега наружу не уходят) — {keys, rows}, строка = массив
 * по keys. Ответ кэшируется на CACHE_SEC, чтобы каждое открытие экрана «Статистика» не читало таблицу заново.
 *
 * GET ?data=rating — строки для общего рейтинга игроков: все забеги листа (без лимита и отладочных; брошенные — тоже, их
 * игра считает гибелью),
 * только колонки RATING_KEYS, а вместо id игрока — его ключ `who`, начало SHA-256 от id (playerKey_). Очки и места
 * считает игра (src/engine/rating.ts), чтобы правка формулы не требовала нового развёртывания.
 * Как поставить, обновить и проверить — docs/statistika.md.
 */
const SHEET_NAME = 'runs';
/** id таблицы из её адреса: docs.google.com/spreadsheets/d/<id>/edit. Пусто — скрипт живёт внутри таблицы и пишет в неё. */
const SPREADSHEET_ID = '';
/** Сколько последних забегов уходит в игру по ?data=runs. */
const RUNS_LIMIT = 2000;
/** Колонки, которые наружу не отдаются. */
const PRIVATE_KEYS = ['player', 'detail'];
/** Секунд держать готовый ответ ?data=runs в кэше. */
const CACHE_SEC = 600;
const CACHE_KEY = 'runs-v1';
/** Колонки забега, которые нужны рейтингу; `who` — ключ игрока, его ставит скрипт. */
const RATING_KEYS = ['event', 'difficulty', 'act', 'room', 'turns', 'hero'];
const RATING_CACHE_KEY = 'rating-v1';
/** Сколько первых шестнадцатеричных знаков SHA-256 от id — ключ игрока. Должно совпадать с PLAYER_KEY_LEN в src/engine/rating.ts. */
const PLAYER_KEY_LEN = 12;

function doPost(e) {
  // Записи могут прийти одновременно — шапку и строку правит один за раз.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const report = JSON.parse(e.postData.contents);
    if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('ожидался объект');
    appendReport_(report);
    CacheService.getScriptCache().removeAll([CACHE_KEY, RATING_CACHE_KEY]);
    return text_('ok');
  } catch (err) {
    return text_('error: ' + err);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Запустить один раз из редактора (выбрать setup в панели, «Выполнить»): скрипт спросит разрешения, найдёт таблицу
 * и заведёт лист runs; имя таблицы — в журнале выполнения. После этого развёртывание уже не просит разрешений.
 */
function setup() {
  const sheet = sheet_();
  Logger.log('Таблица «' + sheet.getParent().getName() + '», лист «' + sheet.getName() + '» на месте');
}

/** Без параметров — проверка, что развёрнуто; ?data=runs — список забегов для экрана «Статистика» в игре, ?data=rating — строки рейтинга. */
function doGet(e) {
  const data = e && e.parameter && e.parameter.data;
  if (data === 'runs') return json_(runsJson_());
  if (data === 'rating') return json_(ratingJson_());
  return text_('Monster Versus: приёмник статистики на месте');
}

function appendReport_(report) {
  const sheet = sheet_();
  const header = header_(sheet);
  const row = Object.assign({ ts: new Date() }, report);
  const fresh = Object.keys(row).filter((key) => header.indexOf(key) < 0);
  if (fresh.length) {
    header.push(...fresh);
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
  }
  sheet.appendRow(header.map((key) => cell_(row[key])));
}

/** JSON {keys, rows} последних забегов без отладочных и без приватных колонок; строкой, чтобы класть в кэш как есть. */
function runsJson_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) return hit;
  const body = JSON.stringify(collectRuns_());
  try {
    cache.put(CACHE_KEY, body, CACHE_SEC);
  } catch (err) {
    // Кэш вмещает 100 КБ на ключ; не влезло — отдаём без кэша, следующий запрос снова прочтёт лист.
  }
  return body;
}

function collectRuns_() {
  const sheet = sheet_();
  const header = header_(sheet);
  const last = sheet.getLastRow();
  if (!header.length || last < 2) return { keys: [], rows: [] };
  const first = Math.max(2, last - RUNS_LIMIT + 1);
  const values = sheet.getRange(first, 1, last - first + 1, header.length).getValues();
  const debugAt = header.indexOf('debug');
  const keep = header.map((key, i) => ({ key, i })).filter((c) => PRIVATE_KEYS.indexOf(c.key) < 0);
  const rows = values
    .filter((row) => debugAt < 0 || !(row[debugAt] === true || row[debugAt] === 'TRUE'))
    .map((row) => keep.map((c) => out_(row[c.i])));
  return { keys: keep.map((c) => c.key), rows: rows };
}

/** JSON {keys, rows} для рейтинга; строкой, как runsJson_. */
function ratingJson_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(RATING_CACHE_KEY);
  if (hit) return hit;
  const body = JSON.stringify(collectRating_());
  try {
    cache.put(RATING_CACHE_KEY, body, CACHE_SEC);
  } catch (err) {
    // Больше 100 КБ — без кэша, как и список забегов.
  }
  return body;
}

/**
 * Все забеги — победы, гибели и брошенные, не отладочные: ключ игрока и RATING_KEYS. Колонки читаются по одной — лист целиком тянул бы
 * и detail (килобайты JSON на строку). Записи без id игрока (их не бывает с v0.27) пропускаются.
 */
function collectRating_() {
  const sheet = sheet_();
  const header = header_(sheet);
  const last = sheet.getLastRow();
  const keys = ['who'].concat(RATING_KEYS);
  if (!header.length || last < 2) return { keys: keys, rows: [] };
  const column = (key) => {
    const at = header.indexOf(key);
    return at < 0 ? null : sheet.getRange(2, at + 1, last - 1, 1).getValues().map((r) => r[0]);
  };
  const player = column('player');
  const event = column('event');
  if (!player || !event) return { keys: keys, rows: [] };
  const debug = column('debug');
  const cols = RATING_KEYS.map((key) => (key === 'event' ? event : column(key)));
  const ids = {};
  const rows = [];
  for (let i = 0; i < player.length; i++) {
    if (event[i] !== 'victory' && event[i] !== 'defeat' && event[i] !== 'abandoned') continue;
    if (debug && (debug[i] === true || debug[i] === 'TRUE')) continue;
    const id = String(player[i] || '');
    if (!id) continue;
    if (!ids[id]) ids[id] = playerKey_(id);
    rows.push([ids[id]].concat(cols.map((c) => (c ? out_(c[i]) : ''))));
  }
  return { keys: keys, rows: rows };
}

/** Ключ игрока: первые PLAYER_KEY_LEN знаков SHA-256 его id в шестнадцатеричном виде — так же считает игра (playerKey в rating.ts). */
function playerKey_(id) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, id, Utilities.Charset.UTF_8);
  return bytes
    .map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))
    .join('')
    .slice(0, PLAYER_KEY_LEN);
}

function sheet_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  // Отдельный проект без id таблицы: getActiveSpreadsheet() отдаёт null — объясняем, а не падаем на getSheetByName.
  if (!ss) throw new Error('скрипт не привязан к таблице: впишите id таблицы в SPREADSHEET_ID (docs.google.com/spreadsheets/d/<id>/edit) или перенесите код в Apps Script самой таблицы');
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

/** Шапка листа; пустой лист — пустая шапка. */
function header_(sheet) {
  const width = sheet.getLastColumn();
  if (width === 0) return [];
  return sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
}

/** Примитивы — как есть, вложенное — строкой JSON, отсутствующее — пустая ячейка. */
function cell_(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object' && !(value instanceof Date)) return JSON.stringify(value);
  return value;
}

/** Ячейка наружу: дата — строкой ISO, остальное как лежит (числа, булевы, строки). */
function out_(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function text_(s) {
  return ContentService.createTextOutput(s);
}

function json_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
