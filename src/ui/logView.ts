import { STATUS_NAMES } from '../engine/combat';
import type { LogMark, StatusId } from '../engine/types';
import { h, type Child } from './dom';
import { STATUS_COLORS, statusIcon, uiIcon } from './icons';
import { actorOf, isFormula, parseBattleLog, splitNotes, STATUS_RE, totalsOf, type LineKind, type LogLine, type LogStep, type LogTotals, type LogTurn } from './logParse';

// ─── Лог боя: отрисовка (v0.51) ────────────────────────────────────────────
// Лента (выбрана из трёх прототипов — ленты, диалога и сводки): ход — блок с заголовком и сводкой (урон по врагам,
// потери героя, павшие), в нём шаги полосой цвета стороны — действие героя, ход врага или союзника, начало хода.
// У шага строка-заголовок, последствия под ней с отступом; раскладка удара — отдельной тусклой строкой.

/** Лог одного боя. `marks` нет (бой записан до разметки) — ходы по заголовкам, всё остальное строками боя. */
export function battleLogView(lines: string[], marks?: LogMark[]): HTMLElement {
  return h('div', { class: 'lg' }, ...parseBattleLog(lines, marks).map(turnView));
}

// ─── Ход ───────────────────────────────────────────────────────────────────

function turnView(t: LogTurn): HTMLElement {
  const head = h('div', { class: 'lg-turn-head' }, h('span', { class: 'lg-turn-n' }, t.n === null ? 'Начало боя' : `Ход ${t.n}`), h('span', { class: 'lg-rule' }), totalsView(totalsOf(t.steps.flatMap((s) => s.lines))));
  const body: HTMLElement[] = [];
  let foes = false;
  for (const s of t.steps) {
    // Ход врагов начинается с первого шага врага или союзника: дальше до конца хода отвечают они.
    if (!foes && (s.side === 'enemy' || s.side === 'ally')) {
      foes = true;
      body.push(h('div', { class: 'lg-sep' }, h('span', null, 'ход врагов')));
    }
    body.push(stepView(s));
  }
  return h('section', { class: 'lg-turn' }, head, ...body);
}

/** Сводка хода: урон по врагам, павшие, потери героя. Пустые части не пишутся. */
function totalsView(t: LogTotals): HTMLElement {
  const chip = (icon: HTMLElement, text: string, cls: string, tip: string) => h('span', { class: `lg-chip ${cls}`, tip }, icon, text);
  return h(
    'span',
    { class: 'lg-totals' },
    t.toFoe > 0 ? chip(uiIcon('dmg', 15), `${t.toFoe}`, 'lg-foe', 'Урон по врагам за ход') : null,
    t.kills > 0 ? chip(uiIcon('skull', 15), t.kills > 1 ? `×${t.kills}` : '', 'lg-kill', 'Повержено врагов') : null,
    t.toHero > 0 ? chip(uiIcon('hp', 15), `−${t.toHero}`, 'lg-hurt', 'Потеряно HP героем за ход') : null,
  );
}

// ─── Шаг ───────────────────────────────────────────────────────────────────

/** Шаг: полоса цвета стороны, заголовок, под ним последствия. У начала хода заголовка и полосы нет. */
function stepView(s: LogStep): HTMLElement {
  const lines = s.lines.flatMap((l, i) => lineView(l, s.titled && i === 0));
  return h('div', { class: `lg-step lg-${s.side}${s.titled ? '' : ' lg-untitled'}` }, ...lines);
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
 * уходит отдельной строкой под ним.
 */
function lineView(l: LogLine, head: boolean): HTMLElement[] {
  const segs = splitNotes(l.text);
  const fi = segs.findIndex((_, i) => isFormula(segs, i));
  const text: Child[] = head ? paintHead(l) : paintSegments(segs, fi, l.kind);
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
 * и раскладка — как у обычной строки.
 */
function paintHead(l: LogLine): Child[] {
  const who = actorOf(l.text);
  const out: Child[] = [];
  let rest = l.text;
  if (who && rest.startsWith(who)) {
    rest = rest.slice(who.length);
    out.push(h('span', { class: 'lg-who' }, who));
  }
  // Имя приёма — после последнего двоеточия, без чисел и скобок; «: 9 (кубик 3)» — обычная строка удара.
  const cut = rest.lastIndexOf(': ');
  const name = cut >= 0 ? rest.slice(cut + 2) : '';
  if (name.trim() && !/[\d()→]/.test(name)) return [...out, ...paint(rest.slice(0, cut + 2), l.kind), h('span', { class: 'lg-act' }, name)];
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
      out.push(h('b', { class: `num ${cls}`.trim(), style: color && !turns ? `color:${color}` : null }, m[0].replace(' ', '\u00a0')));
      if (turns) color = null;
    }
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
