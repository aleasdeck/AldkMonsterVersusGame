import { h, type Child, type TipFn } from './dom';
import { markKeywords, NUMBER_RE } from './keywords';
import { statusIcon, uiIcon, uiIconColor, type UiIconId } from './icons';
import type { StatusId } from '../engine/types';

// ─── Подсказки (v0.52) ─────────────────────────────────────────────────────
// Та же грамматика, что у карточек v0.50, только плотнее: шапка — значок в рамке цвета вещи, имя её цветом, справа число
// (сила статуса, тир, счётчик набора), под именем строка «что это»; ниже параметры чипами, текст абзацами (ключевые слова
// с иконками статусов, числа цветом смысла), строки со своими значками, секции через пунктир и хвост — что будет по клику.
// Сплошной строкой не пишется ничего: даже строковую подсказку plainTip режет на абзацы и красит.

/** Значок шапки, строки или чипа: пиксельная иконка параметра, иконка статуса, глиф или готовый элемент. */
export type TipIcon = UiIconId | { status: StatusId } | { glyph: string; color?: string } | HTMLElement;

/** Тон строки: выгодно, не сработает, мелочь, призыв к действию. */
export type Tone = 'good' | 'bad' | 'dim' | 'accent';

export function tipIconEl(icon: TipIcon, px = 16): HTMLElement {
  if (icon instanceof HTMLElement) return icon;
  if (typeof icon === 'string') return uiIcon(icon, px);
  if ('status' in icon) {
    const img = statusIcon(icon.status, px);
    img.classList.add('ui-icon');
    return img;
  }
  return h('span', { class: 'tip-glyph', style: icon.color ? `color:${icon.color}` : null }, icon.glyph);
}

/** Строка из частей через точку-разделитель, как строка «что это» у карточек. */
function sepJoin(items: Child[]): Child[] {
  const out: Child[] = [];
  for (const it of items) {
    if (it === null || it === undefined || it === false || it === '') continue;
    if (out.length) out.push(h('span', { class: 'sep' }, '·'));
    out.push(it);
  }
  return out;
}

// ─── Шапка ─────────────────────────────────────────────────────────────────

export interface TipHeadOpts {
  title: Child;
  /** Значок слева в рамке цвета вещи. */
  icon?: TipIcon;
  /** Цвет имени и рамки значка; им же tooltip.ts красит рамку всей подсказки. Нет — имя акцентным, рамка обычная. */
  color?: string;
  /** Цвет имени, если он не цвет вещи: у первого тира имя обычным текстом (серый читается как «выключено»), рамка — серая. */
  nameColor?: string;
  /** Строка «что это» под именем: короткие метки через точку. */
  sub?: Child[];
  /** Справа от имени: сила статуса, «тир 2/3», «2/3» у набора. */
  aside?: Child;
}

/** Шапка подсказки: значок в рамке, имя цветом вещи, число справа, строка «что это». */
export function tipHead(o: TipHeadOpts): HTMLElement {
  const nameColor = o.nameColor ?? o.color;
  return h(
    'div',
    { class: 'tip-head', 'data-accent': o.color ?? null },
    o.icon ? h('span', { class: 'tip-icon', style: o.color ? `border-color:${o.color}` : null }, tipIconEl(o.icon, 16)) : null,
    h(
      'div',
      { class: 'tip-head-body' },
      h('div', { class: 'tip-title-row' }, h('span', { class: 'tip-name', style: nameColor ? `color:${nameColor}` : null }, o.title), o.aside ? h('span', { class: 'tip-aside' }, o.aside) : null),
      o.sub?.length ? h('div', { class: 'tip-sub' }, ...sepJoin(o.sub)) : null,
    ),
  );
}

// ─── Тело ──────────────────────────────────────────────────────────────────

/** Абзац: ключевые слова подсвечены, перед статусом его иконка, числа цветом смысла. */
export function tipText(text: string, tone?: Tone): HTMLElement {
  return h('div', { class: `tip-text ${tone ? `tip-${tone}` : ''}`.trim() }, ...markKeywords(text, { icons: true, numbers: true }));
}

/** Строка со значком: либо текст (с ключевыми словами), либо имя приглушённо и значение ярко — как ячейки таблицы карточки. */
export interface TipLine {
  icon?: TipIcon;
  text?: string;
  label?: Child;
  value?: Child;
  tone?: Tone;
}

function lineEl(l: TipLine): HTMLElement {
  const body: Child[] = [];
  if (l.label !== undefined && l.label !== null) body.push(h('span', { class: 'tip-label' }, l.label), ' ');
  if (l.value !== undefined && l.value !== null) body.push(typeof l.value === 'string' ? h('span', { class: 'tip-value' }, ...markKeywords(l.value, { icons: true, numbers: true })) : l.value);
  if (l.text) body.push(...markKeywords(l.text, { icons: true, numbers: true }));
  return h(
    'div',
    { class: `tip-line ${l.tone ? `tip-${l.tone}` : ''}`.trim() },
    l.icon ? h('span', { class: 'tip-line-icon' }, tipIconEl(l.icon, 14)) : h('span', { class: 'tip-line-icon tip-bullet' }),
    h('span', { class: 'tip-line-body' }, ...body),
  );
}

/** Столбик строк со значками: эффекты приёма врага, бонусы набора, строки сравнения. */
export function tipLines(lines: TipLine[]): HTMLElement | null {
  if (!lines.length) return null;
  return h('div', { class: 'tip-lines' }, ...lines.map(lineEl));
}

/** Чип параметра: значок и значение в рамке — те же чипы, что на карточках «Старта». */
export function tipChip(icon: TipIcon, text: Child, cls = ''): HTMLElement {
  return h('span', { class: `param ${cls}`.trim() }, tipIconEl(icon, 14), text !== '' && text !== null ? h('span', { class: 'param-text' }, text) : null);
}

/** Ряд чипов: цена, перезарядка, цель, число «сейчас». */
export function tipChips(chips: (HTMLElement | null)[]): HTMLElement | null {
  const list = chips.filter((c): c is HTMLElement => !!c);
  return list.length ? h('div', { class: 'tip-chips' }, ...list) : null;
}

/**
 * Секция под пунктиром: подпись цветом (следующий тир — цветом тира) и содержимое. Подпись встаёт в начало абзаца, а не
 * отдельной строкой: так подсказка не растёт в высоту.
 */
export function tipSection(label: Child, body: Child[] | string, labelColor?: string): HTMLElement {
  const content = typeof body === 'string' ? markKeywords(body, { icons: true, numbers: true }) : body;
  return h('div', { class: 'tip-sect' }, label ? h('span', { class: 'tip-sect-label', style: labelColor ? `color:${labelColor}` : null }, label) : null, label ? ' ' : null, ...content);
}

/** Оговорка мелко: значок и текст; тон — выгодно, не сработает или приглушённо. */
export function tipNote(text: string, icon?: TipIcon, tone: Tone = 'dim'): HTMLElement {
  return h('div', { class: `tip-note tip-${tone}` }, icon ? h('span', { class: 'tip-line-icon' }, tipIconEl(icon, 14)) : null, h('span', null, ...markKeywords(text, { icons: true, numbers: true })));
}

/** Хвост: что сделает клик по элементу. */
export function tipAction(text: string): HTMLElement {
  return h('div', { class: 'tip-action' }, h('span', { class: 'tip-action-mark' }, '▸'), h('span', null, text));
}

/** Шкала-пипки: «Холод 2 из 4», опыт мастерства; on — сколько горит, color — цвет горящих. */
export function tipPips(total: number, on: number, color: string): HTMLElement {
  return h('span', { class: 'tip-pips' }, ...Array.from({ length: total }, (_, i) => h('i', { class: i < on ? 'on' : '', style: i < on ? `background:${color}` : null })));
}

/** Полоска прогресса: опыт до следующего уровня. */
export function tipBar(cur: number, max: number, color: string): HTMLElement {
  const pct = max > 0 ? Math.max(0, Math.min(100, (cur / max) * 100)) : 100;
  return h('span', { class: 'tip-bar' }, h('i', { style: `width:${pct}%;background:${color}` }));
}

/** Клавиша: «C», «Esc», «Space». */
export function tipKey(key: string): HTMLElement {
  return h('span', { class: 'tip-key' }, key);
}

// ─── Готовые подсказки ─────────────────────────────────────────────────────

export interface ParamTipOpts {
  /** Цвет имени и рамки; по умолчанию — цвет пиксельной иконки. */
  color?: string;
  aside?: Child;
  sub?: Child[];
  /** Оговорка под текстом. */
  note?: string;
  noteTone?: Tone;
  /** Хвост: что сделает клик. */
  action?: string;
}

/**
 * Подсказка параметра: значок и имя шапкой, пояснение абзацем. Цвет имени — цвет значка, чтобы «⚡ Цена» и «◆ Мана»
 * читались тем же цветом, что их чип и полоска.
 */
export function paramTip(icon: TipIcon | null, title: string, text?: string, o: ParamTipOpts = {}): TipFn {
  return () => {
    const color = o.color ?? (typeof icon === 'string' ? uiIconColor(icon) : undefined);
    const out: Child[] = [tipHead({ icon: icon ?? undefined, title, color, aside: o.aside, sub: o.sub })];
    if (text) out.push(...text.split('\n').map((line) => tipText(line)));
    if (o.note) out.push(tipNote(o.note, o.noteTone === 'bad' ? 'cross' : o.noteTone === 'good' ? 'check' : undefined, o.noteTone ?? 'dim'));
    if (o.action) out.push(tipAction(o.action));
    return out;
  };
}

/** Почему нельзя: красный крест и причина — у кнопок с запретом (золото, сокеты, перезарядка). */
export function whyTip(reason: string, title = 'Недоступно'): TipFn {
  return () => [tipHead({ icon: 'cross', title, color: '#ff6b6b' }), tipText(reason)];
}

// ─── Строковые подсказки ──────────────────────────────────────────────────

/** Горячая клавиша в конце строки: «… (C)», «… (Esc)». */
const HOTKEY_RE = /\s*\(((?:[A-ZА-ЯЁ0-9]|Esc|Space|Tab|Enter)(?:\s?[,/]\s?(?:[A-ZА-ЯЁ0-9]|Esc|Space|Tab|Enter))*)\)\s*$/;
/** «Имя: текст» — короткое имя до двоеточия без точек внутри. */
const LABEL_RE = /^([А-ЯЁA-Z«][^:.!?]{1,28}):\s+(.+)$/;

function plainLine(line: string, lead: boolean): HTMLElement {
  const trimmed = line.trim();
  // «— вставить сюда» — что сделает клик.
  if (trimmed.startsWith('— ')) return tipAction(trimmed.slice(2));
  if (trimmed.startsWith('✓ ')) return lineEl({ icon: 'check', text: trimmed.slice(2), tone: 'good' });
  if (trimmed.startsWith('· ')) return lineEl({ text: trimmed.slice(2), tone: 'dim' });
  const key = HOTKEY_RE.exec(trimmed);
  const body = key ? trimmed.slice(0, key.index) : trimmed;
  const keys = key ? key[1].split(/\s?[,/]\s?/).map(tipKey) : [];
  const label = LABEL_RE.exec(body);
  const children: Child[] = label ? [h('span', { class: 'tip-label' }, `${label[1]}:`), ' ', ...markKeywords(label[2], { icons: true, numbers: true })] : markKeywords(body, { icons: true, numbers: true });
  return h('div', { class: `tip-text ${lead ? 'tip-lead' : ''}`.trim() }, ...children, ...(keys.length ? [' ', ...keys] : []));
}

/**
 * Строковая подсказка без сборщика: заголовок — шапкой, каждая строка — своим абзацем с отступом, ключевые слова и числа
 * цветом, «Имя: текст» — имя приглушённо, горячая клавиша в скобках — клавишей.
 */
export function plainTip(text: string, title?: string | null): Child[] {
  const out: Child[] = [];
  if (title) out.push(tipHead({ title }));
  const lines = text.split('\n').filter((l) => l.trim());
  lines.forEach((l, i) => out.push(plainLine(l, !title && i === 0 && lines.length > 1)));
  return out;
}

// ─── Разница тиров ─────────────────────────────────────────────────────────

/**
 * Описание следующего тира, где видно, что изменилось: предложение с теми же словами — только изменившиеся числа выделены
 * («Кровотечение 4 → 5»), новое или переписанное предложение («Раз в ход» → «До 2 раз за ход») — целиком.
 */
export function tierDiff(cur: string, next: string): Child[] {
  const a = cur.split(/(?<=\.)\s+/);
  const b = next.split(/(?<=\.)\s+/);
  const skeleton = (s: string) => s.replace(NUMBER_RE, '#');
  const out: Child[] = [];
  b.forEach((sentence, i) => {
    if (i) out.push(' ');
    const kids = markKeywords(sentence, { icons: true, numbers: true });
    const prev = a[i];
    if (prev === sentence) {
      out.push(...kids);
      return;
    }
    if (prev === undefined || skeleton(prev) !== skeleton(sentence)) {
      out.push(h('span', { class: 'chg-text' }, ...kids));
      return;
    }
    const was = [...prev.matchAll(NUMBER_RE)].map((m) => m[0]);
    const now = [...sentence.matchAll(NUMBER_RE)].map((m) => m[0]);
    const nums = kids.filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains('num'));
    if (nums.length === now.length) {
      now.forEach((v, j) => {
        if (v === was[j]) return;
        // Цвет смысла (сила статуса) стоит в style — снимаем: изменившееся число выделяется одним зелёным.
        nums[j].classList.add('chg');
        nums[j].style.removeProperty('color');
      });
    }
    out.push(...kids);
  });
  return out;
}

/** «ход», «хода», «ходов» — по числу. */
export function turnsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? 'ход' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'хода' : 'ходов';
}
