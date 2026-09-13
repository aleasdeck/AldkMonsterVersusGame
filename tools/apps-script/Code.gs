/**
 * Monster Versus — приёмник статистики забегов.
 *
 * Живёт внутри Google Таблицы (Расширения → Apps Script) или отдельным проектом на script.google.com с id таблицы
 * в SPREADSHEET_ID; опубликован как веб-приложение с доступом «Все» (кто может прислать запись; таблицу видит только владелец).
 * Игра шлёт POST с JSON одной записи (поля — src/engine/report.ts плюс touch/screen/lang из src/ui/telemetry.ts),
 * каждая запись — строка листа «runs», колонка на поле, первая колонка ts — время приёма.
 * Ключ, которого в шапке нет, добавляет колонку справа; старые колонки не двигаются, так что записи разных
 * версий игры лежат в одной таблице. Вложенное (detail) кладётся строкой JSON.
 * Как поставить, обновить и проверить — docs/statistika.md.
 */
const SHEET_NAME = 'runs';
/** id таблицы из её адреса: docs.google.com/spreadsheets/d/<id>/edit. Пусто — скрипт живёт внутри таблицы и пишет в неё. */
const SPREADSHEET_ID = '';

function doPost(e) {
  // Записи могут прийти одновременно — шапку и строку правит один за раз.
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const report = JSON.parse(e.postData.contents);
    if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('ожидался объект');
    appendReport_(report);
    return text_('ok');
  } catch (err) {
    return text_('error: ' + err);
  } finally {
    lock.releaseLock();
  }
}

/** Открыть адрес веб-приложения в браузере — проверка, что развёрнуто. */
function doGet() {
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

function sheet_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
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

function text_(s) {
  return ContentService.createTextOutput(s);
}
