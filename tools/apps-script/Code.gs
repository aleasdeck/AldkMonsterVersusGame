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

function doPost(e) {
  // Записи могут прийти одновременно — шапку и строку правит один за раз.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const report = JSON.parse(e.postData.contents);
    if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('ожидался объект');
    appendReport_(report);
    CacheService.getScriptCache().remove(CACHE_KEY);
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

/** Без параметров — проверка, что развёрнуто; ?data=runs — список забегов для экрана «Статистика» в игре. */
function doGet(e) {
  const data = e && e.parameter && e.parameter.data;
  if (data === 'runs') return json_(runsJson_());
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
