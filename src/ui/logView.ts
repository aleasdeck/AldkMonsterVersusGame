import { STATUS_NAMES } from '../engine/combat';
import type { LogMark, StatusId } from '../engine/types';
import { h, type Child } from './dom';
import { STATUS_COLORS, statusIcon, uiIcon } from './icons';
import { actorOf, isFormula, parseBattleLog, splitNotes, STATUS_RE, totalsOf, type LineKind, type LogLine, type LogStep, type LogTurn, type LogTotals } from './logParse';

// ─── Лог боя: отрисовка (v0.51) ────────────────────────────────────────────
// Ход — блок с заголовком и сводкой (сколько снято с врагов и с героя), в нём шаги: действие героя, ход врага или
// союзника, начало хода. У шага строка-заголовок и последствия под ней; раскладка удара — отдельной тусклой строкой.
// Три варианта вида на выбор (решение за пользователем): А — лента с полосами сторон, Б — диалог (герой слева, враги
// справа), В — сводка (шаг одной строкой с итогом, клик раскрывает). Когда вариант выбран, остальные удаляются вместе
// с переключателем.

export type LogVariant = 'a' | 'b' | 'c';

export const LOG_VARIANTS: { id: LogVariant; label: string; name: string }[] = [
  { id: 'a', label: 'А', name: 'Лента: шаги полосами цвета стороны, раскладка удара под ним' },
  { id: 'b', label: 'Б', name: 'Диалог: герой слева, враги справа' },
  { id: 'c', label: 'В', name: 'Сводка: шаг одной строкой с итогом, клик — подробности' },
];

const KEY = 'mv_log_variant';

function isVariant(v: unknown): v is LogVariant {
  return v === 'a' || v === 'b' || v === 'c';
}

function loadVariant(): LogVariant {
  try {
    const v = localStorage.getItem(KEY);
    return isVariant(v) ? v : 'a';
  } catch {
    return 'a';
  }
}

/** Вид лога: живёт в localStorage, задаётся адресом `&logv=a|b|c` и кнопками в шапке лога. */
export let logVariant: LogVariant = loadVariant();

export function setLogVariant(v: string | null): void {
  if (!isVariant(v)) return;
  logVariant = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // Хранилище закрыто (приватное окно) — выбор проживёт до перезагрузки.
  }
}

/** Раскрытые шаги сводки (вариант В): ключ «бой:ход:шаг» — переживает перерисовку после каждого действия. */
const openSteps = new Set<string>();

/**
 * Лог одного боя. `key` — номер боя в забеге: по нему сводка помнит раскрытые шаги. `marks` нет (бой записан
 * до разметки) — ходы по заголовкам, всё остальное строками боя.
 */
export function battleLogView(lines: string[], marks: LogMark[] | undefined, key: string | number): HTMLElement {
  const turns = parseBattleLog(lines, marks);
  return h('div', { class: `lg lg-${logVariant}` }, ...turns.map((t, i) => turnView(t, `${key}:${i}`)));
}

/** Кнопки вариантов в шапке лога: нажатая подсвечена, подсказка — что за вид. */
export function logVariantSwitch(onPick: () => void): HTMLElement {
  return h(
    'div',
    { class: 'lg-switch' },
    ...LOG_VARIANTS.map((v) =>
      h(
        'button',
        {
          class: `lg-switch-btn${v.id === logVariant ? ' on' : ''}`,
          tip: v.name,
          tipTitle: `Вид лога ${v.label}`,
          onclick: () => {
            setLogVariant(v.id);
            onPick();
          },
        },
        v.label,
      ),
    ),
  );
}

// ─── Ход ───────────────────────────────────────────────────────────────────

function turnView(t: LogTurn, key: string): HTMLElement {
  const all = t.steps.flatMap((s) => s.lines);
  const head = h('div', { class: 'lg-turn-head' }, h('span', { class: 'lg-turn-n' }, t.n === null ? 'Начало боя' : `Ход ${t.n}`), h('span', { class: 'lg-rule' }), totalsView(totalsOf(all), true));
  const body: HTMLElement[] = [];
  let foes = false;
  let prev: string | null = null;
  t.steps.forEach((s, i) => {
    // Ход врагов начинается с первого шага врага или союзника: дальше до конца хода отвечают они.
    if (!foes && (s.side === 'enemy' || s.side === 'ally')) {
      foes = true;
      prev = null;
      body.push(h('div', { class: 'lg-sep' }, h('span', null, 'ход врагов')));
    }
    body.push(logVariant === 'c' ? compactStep(s, `${key}:${i}`) : stepView(s, prev));
    prev = s.titled ? actorOf(s.lines[0].text) : null;
  });
  return h('section', { class: 'lg-turn' }, head, ...body);
}

/** Сводка: сколько снято с врагов и с героя, блок, лечение, павшие. Пустые части не пишутся. */
function totalsView(t: LogTotals, turn: boolean): HTMLElement {
  const chip = (icon: HTMLElement, text: string, cls: string, tip: string) => h('span', { class: `lg-chip ${cls}`, tip }, icon, text);
  return h(
    'span',
    { class: 'lg-totals' },
    t.toFoe > 0 ? chip(uiIcon('dmg', 15), `${t.toFoe}`, 'lg-foe', turn ? 'Урон по врагам за ход' : 'Урон по врагам') : null,
    t.kills > 0 ? chip(uiIcon('skull', 15), t.kills > 1 ? `×${t.kills}` : '', 'lg-kill', 'Повержено врагов') : null,
    t.toHero > 0 ? chip(uiIcon('hp', 15), `−${t.toHero}`, 'lg-hurt', turn ? 'Потеряно HP героем за ход' : 'Потеряно HP героем') : null,
    !turn && t.guard > 0 ? chip(uiIcon('block', 15), `−${t.guard}`, 'lg-blk', 'Удар принял блок героя') : null,
    !turn && t.block > 0 ? chip(uiIcon('block', 15), `+${t.block}`, 'lg-blk', 'Блок герою') : null,
    !turn && t.heal > 0 ? chip(uiIcon('heal', 15), `+${t.heal}`, 'lg-heal', 'Лечение герою') : null,
  );
}

// ─── Шаг ───────────────────────────────────────────────────────────────────

/**
 * Шаг лентой (А) и репликой (Б): заголовок, под ним последствия. В диалоге имя действующего — подписью над репликой,
 * и только когда говорит другой: три приёма героя подряд подписаны один раз.
 */
function stepView(s: LogStep, prevActor: string | null = null): HTMLElement {
  const actor = s.titled ? actorOf(s.lines[0].text) : null;
  const dialog = logVariant === 'b';
  const caption = dialog && actor && actor !== prevActor ? h('div', { class: 'lg-caption' }, actor) : null;
  const lines = s.lines.flatMap((l, i) => lineView(l, s.titled && i === 0, dialog ? actor : null));
  return h('div', { class: `lg-step lg-${s.side}${s.titled ? '' : ' lg-untitled'}` }, caption, ...lines);
}

/** Шаг сводкой (В): заголовок и итог в одну строку, клик раскрывает все строки шага. */
function compactStep(s: LogStep, key: string): HTMLElement {
  if (!s.titled) return stepView(s);
  const [first, ...rest] = s.lines;
  const t = totalsOf(s.lines);
  const statuses = stepStatuses(rest);
  // Число удара, блока или лечения уже стоит в итоге справа — в строке шага остаётся только кто и кого.
  const counted = first.kind === 'hit' || first.kind === 'dot' || first.kind === 'block' || first.kind === 'heal';
  const cut = counted ? first.text.search(/: [+−-]?\d/) : -1;
  const head = cut > 0 ? { ...first, text: first.text.slice(0, cut) } : first;
  const summary = h(
    'div',
    { class: 'lg-sum' },
    h('span', { class: 'lg-sum-text' }, ...paintHead(head, null)),
    h('span', { class: 'lg-sum-chips' }, ...statuses, totalsView(t, false)),
    rest.length ? h('span', { class: 'lg-more' }, '▸') : null,
  );
  const el = h('div', { class: `lg-step lg-${s.side}${openSteps.has(key) ? ' lg-open' : ''}` }, summary, h('div', { class: 'lg-detail' }, ...rest.flatMap((l) => lineView(l, false, null))));
  if (rest.length) {
    summary.classList.add('lg-click');
    summary.addEventListener('click', () => {
      if (openSteps.has(key)) openSteps.delete(key);
      else openSteps.add(key);
      el.classList.toggle('lg-open');
    });
  }
  return el;
}

/** Статусы, которые шаг повесил или нарастил: иконка с силой, по одному на статус. */
function stepStatuses(lines: LogLine[]): HTMLElement[] {
  const seen = new Map<StatusId, string>();
  for (const l of lines) {
    if (l.kind !== 'status' || !l.status || seen.has(l.status)) continue;
    const m = new RegExp(`${STATUS_NAMES[l.status]}:? (\\d+)`).exec(l.text);
    seen.set(l.status, m ? m[1] : '');
  }
  return [...seen].slice(0, 3).map(([id, v]) => h('span', { class: 'lg-chip', style: `color:${STATUS_COLORS[id]}`, tip: STATUS_NAMES[id] }, statusIcon(id, 15), v));
}

// ─── Строка ────────────────────────────────────────────────────────────────

/** Иконка вида строки: статус — своей иконкой, удар по герою — сердцем (по союзнику — голубым), по врагу — клинком. */
function kindIcon(l: LogLine): HTMLElement | null {
  const strike = () => (l.target === 'hero' ? uiIcon('hp', 15) : l.target === 'ally' ? uiIcon('hp', 15, '#8fd3ff') : uiIcon('dmg', 15));
  const map: Partial<Record<LineKind, () => HTMLElement>> = {
    hit: strike,
    dot: () => (l.status ? statusIcon(l.status, 15) : strike()),
    heal: () => uiIcon('heal', 15),
    block: () => uiIcon('block', 15),
    res: () => uiIcon(/MP|ман/.test(l.text) ? 'mp' : 'sta', 15),
    status: () => statusIcon(l.status!, 15),
    death: () => uiIcon('skull', 15),
    summon: () => uiIcon('star', 15),
    miss: () => uiIcon('cross', 15, '#8a8aa3'),
    phase: () => uiIcon('crown', 15),
    win: () => uiIcon('crown', 15),
    lose: () => uiIcon('skull', 15, '#ff6b6b'),
    end: () => uiIcon('cross', 15, '#8a8aa3'),
  };
  if (l.kind === 'status' && !l.status) return null;
  // Страж прикрыл соседа — щит, как у блока: удар ушёл в него.
  if (l.kind === 'info' && / заслоняет /.test(l.text)) return uiIcon('def', 15);
  return map[l.kind]?.() ?? null;
}

/**
 * Строка лога: иконка вида, текст с цветными числами и статусами, пояснения в скобках — приглушённо. Раскладка удара
 * уходит отдельной строкой под ним. `actor` — убрать имя действующего из заголовка (в диалоге оно подписью над репликой).
 */
function lineView(l: LogLine, head: boolean, actor: string | null): HTMLElement[] {
  const segs = splitNotes(l.text);
  const fi = segs.findIndex((_, i) => isFormula(segs, i));
  const text: Child[] = head ? paintHead(l, actor) : paintSegments(segs, fi, l.kind);
  const icon = kindIcon(l);
  // Заголовок без иконки (имя приёма) стоит вровень с полосой шага, последствия с иконками — отступом под ним.
  const row = h('div', { class: `lg-line k-${l.kind}${head ? ' lg-head' : ''}` }, head && !icon ? null : h('span', { class: 'lg-ic' }, icon), h('span', { class: 'lg-tx' }, ...text));
  return fi >= 0 ? [row, h('div', { class: `lg-formula${head ? ' lg-head-f' : ''}` }, segs[fi].text)] : [row];
}

function paintSegments(segs: ReturnType<typeof splitNotes>, skip: number, kind: LineKind): Child[] {
  return segs.flatMap((s, i) => (i === skip ? [] : s.note ? [h('span', { class: 'lg-note' }, `(${s.text})`)] : paint(s.text, kind)));
}

/**
 * Заголовок шага: кто — цветом стороны, имя приёма — ярко («Гоблин: Подлый удар», «Герой пьёт: Зелье силы»). Цифры
 * и раскладка — как у обычной строки. `actor` — имя срезается (в диалоге оно подписью): «Подлый удар», «Бьёт Гоблин: 9».
 */
function paintHead(l: LogLine, actor: string | null): Child[] {
  const who = actorOf(l.text);
  const out: Child[] = [];
  let rest = l.text;
  if (who && rest.startsWith(who)) {
    rest = rest.slice(who.length);
    if (who === actor) {
      rest = rest.replace(/^:? /, '');
      rest = rest.charAt(0).toUpperCase() + rest.slice(1);
    } else out.push(h('span', { class: 'lg-who' }, who));
  }
  // Имя приёма — после последнего двоеточия, без чисел и скобок; в диалоге «Гоблин: Подлый удар» — вся реплика.
  const cut = actor && who === actor && l.text.startsWith(`${who}: `) ? 0 : rest.lastIndexOf(': ') + 2;
  const name = cut >= 2 || cut === 0 ? rest.slice(cut) : '';
  if (name.trim() && !/[\d()→]/.test(name)) return [...out, ...paint(rest.slice(0, cut), l.kind), h('span', { class: 'lg-act' }, name)];
  const segs = splitNotes(rest);
  const fi = segs.findIndex((_, i) => isFormula(segs, i));
  return [...out, ...paintSegments(segs, fi, l.kind)];
}

const TOKEN_RE = new RegExp(`(→ \\d+ по HP)|${STATUS_RE.source}|([+−-]?\\d+(?:[.,]\\d+)?(?:\\s?%)?|×\\s?\\d+(?:[.,]\\d+)?)`, 'g');
const STATUS_BY_NAME = new Map((Object.keys(STATUS_NAMES) as StatusId[]).map((id) => [STATUS_NAMES[id], id]));

/** Цвет числа по виду строки: урон, лечение, блок, стамина и мана — теми же цветами, что на карточках (v0.50). */
function numClass(kind: LineKind, after: string): string {
  if (kind === 'hit' || kind === 'dot') return 'n-dmg';
  if (kind === 'heal') return 'n-heal';
  if (kind === 'block') return 'n-block';
  if (kind === 'res') return /^\s*(?:MP|ман)/.test(after) ? 'n-mp' : /^\s*STA/.test(after) ? 'n-sta' : '';
  return '';
}

/** Текст без скобок: итог «→ N по HP» — крупно, статусы — своим цветом с силой, сроки — приглушённо, числа — по смыслу. */
function paint(text: string, kind: LineKind): Child[] {
  const out: Child[] = [];
  let last = 0;
  let color: string | null = null;
  for (const m of text.matchAll(TOKEN_RE)) {
    const i = m.index ?? 0;
    const between = text.slice(last, i);
    if (between) out.push(between);
    // Число сразу за статусом («Горение 3», «Холод 1 → 4») — его сила, цветом статуса.
    if (between.trim() && between.trim() !== '→') color = null;
    if (m[1]) {
      const n = m[1].slice(2, -6);
      out.push(h('span', { class: 'lg-arrow' }, '→ '), h('b', { class: `num n-hp${n === '0' ? ' lg-zero' : ''}` }, n), ' по HP');
      color = null;
    } else if (m[2]) {
      const id = STATUS_BY_NAME.get(m[2]);
      color = id ? STATUS_COLORS[id] : null;
      out.push(h('span', { class: 'lg-status', style: color ? `color:${color}` : null }, m[2]));
    } else {
      const after = text.slice(i + m[0].length);
      const turns = /^\s(?:ход|хода|ходов)(?![а-яё])/.test(after);
      const cls = turns ? 'n-turns' : color ? '' : numClass(kind, after);
      out.push(h('b', { class: `num ${cls}`.trim(), style: color && !turns ? `color:${color}` : null }, m[0].replace(' ', ' ')));
      if (turns) color = null;
    }
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
