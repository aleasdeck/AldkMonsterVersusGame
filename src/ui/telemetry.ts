import type { RunState } from '../engine/types';
import { runReport, type RunReportEvent } from '../engine/report';
import type { Profile } from './save';

// ─── Статистика забегов ─────────────────────────────────────────────────────
// Каждый законченный или брошенный забег уходит одной записью (engine/report.ts) в Google Таблицу через веб-приложение
// Apps Script (tools/apps-script/Code.gs). Как завести таблицу и вставить адрес — docs/statistika.md.

/**
 * Адрес веб-приложения Apps Script: `https://script.google.com/macros/s/…/exec`.
 * Пустая строка — статистика не отправляется вовсе (форки и локальные сборки ничего никуда не шлют).
 */
export const STATS_URL = 'https://script.google.com/macros/s/AKfycbyquae97wKxUt1Cte1nppAUSwIt2vYxQtSmY1zCon1aMnSPjh-HMs-j3p8g3FjBcswYPg/exec';

/** Хосты разработчика: dev-сервер, localhost, домашняя сеть с телефона. Отсюда записи не уходят — кроме `&stats=1`. */
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

function isLocal(): boolean {
  const host = window.location.hostname;
  return import.meta.env.DEV || host === '' || LOCAL_HOST.test(host);
}

/** `&stats=1` — слать и с машины разработчика (проверить, что таблица принимает); запись всё равно помечается debug. */
function forced(): boolean {
  return new URLSearchParams(window.location.search).get('stats') === '1';
}

/** Чем играют: тач или мышь, размер окна, язык браузера — без user agent и прочих отпечатков. */
function client(): { touch: boolean; screen: string; lang: string } {
  return {
    touch: window.matchMedia('(pointer: coarse)').matches,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    lang: navigator.language,
  };
}

/**
 * Отправить запись о забеге. Огонь и забыть: ответ не читается (`no-cors`), ошибки сети глотаются — игра статистике ничего не должна.
 * `keepalive` доводит запрос, даже если вкладку тут же закроют.
 */
export function reportRun(run: RunState, event: RunReportEvent, profile: Profile): void {
  if (!STATS_URL) return;
  const local = isLocal();
  if (local && !forced()) return;
  const report = runReport(run, { event, player: profile.playerId, playerRuns: profile.runs, debug: run.debug || local, now: Date.now() });
  try {
    // Тело — строка: text/plain не требует preflight, Apps Script читает его из e.postData.contents.
    void fetch(STATS_URL, { method: 'POST', mode: 'no-cors', keepalive: true, body: JSON.stringify({ ...report, ...client() }) }).catch(() => {});
  } catch {
    /* fetch недоступен — играем без статистики */
  }
}
