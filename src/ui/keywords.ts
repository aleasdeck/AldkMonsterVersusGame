import { DEBUFFS, STATUS_HINTS, STATUS_NAMES } from '../engine/combat';
import type { StatusId } from '../engine/types';
import { h, type Child } from './dom';
import { STATUS_COLORS, statusIcon, uiIconColor, type UiIconId } from './icons';
import { tipChip, tipChips, tipHead, tipText } from './tips';

/**
 * Ключевые слова игры в описаниях: найденные слова оборачиваются в подсвеченный span
 * со своей подсказкой. Словарь статусов берётся из движка, чтобы описания не расходились с правилами.
 * Границы слов ищутся через lookaround: `\b` в JS не знает кириллицы.
 */

interface Keyword {
  re: RegExp;
  title: string;
  text: string;
  /** Статус, если ключевое слово — статус: карточки (v0.50) ставят перед словом его иконку. */
  status?: StatusId;
  /** Значок шапки подсказки у слова-не-статуса: блок, крит, стамина. */
  icon?: UiIconId;
  /** Цвет шапки, если не цвет значка. */
  color?: string;
  /** Что дорисовать в подсказке под текстом: у Проклятия — сами статусы значками. */
  extra?: () => Child[];
}

/**
 * Подсказка статуса с числом (v0.51.2): «N урона в начале хода» у Кровотечения 4 становится «4 урона в начале хода».
 * Без числа — правило как есть.
 */
export function statusHint(id: StatusId, value?: number | null): string {
  const text = STATUS_HINTS[id];
  return value === null || value === undefined ? text : text.replace(/(?<![А-Яа-яЁёA-Za-z])N(?![А-Яа-яЁёA-Za-z])/g, `${value}`);
}

const L = '[а-яёa-z]';
const word = (stem: string) => new RegExp(`(?<!${L})(?:${stem})(?!${L})`, 'i');
/**
 * Слово только с заглавной: стат Силы в описаниях всегда пишется с большой буквы («+2 к Силе»), а строчная «сила» — это
 * сила раны или статуса («добавляет силу», «силой N»), и значок Силы ей не нужен.
 */
const wordCased = (stem: string) => new RegExp(`(?<![а-яёА-ЯЁa-zA-Z])(?:${stem})(?![а-яёА-ЯЁa-zA-Z])`);

/** Основа слова для каждого статуса: ловит падежи и глаголы («оглушает», «кровотечения»). */
const STATUS_STEMS: Record<StatusId, string> = {
  // «Сила заклинаний» — не статус Силы: у неё своё правило (растит урон заклинаний). Регистр важен — см. wordCased.
  strength: 'Сил(?:а|ы|е|у|ой)(?! заклинани)',
  weak: 'слабост[а-яё]*',
  bleed: 'кровотеч[а-яё]*',
  burn: 'горени[а-яё]*|горит|горят',
  stun: 'оглуш[а-яё]*',
  exhaust: 'изнур[а-яё]*',
  dodge: 'уклон[а-яё]*',
  evade: 'уворот[а-яё]*|уворач[а-яё]*',
  thorns: 'шип[а-яё]*',
  regen: 'регенерац[а-яё]*',
  invuln: 'неуязвим[а-яё]*',
  poison: 'яд(?:а|у|ом|е)?',
  stealth: 'скрытност[а-яё]*',
  vulnerable: 'уязвим[а-яё]*',
  doom: 'предсмерти[а-яё]*|предсмертн[а-яё]*',
  echo: 'эхо',
  enchant: 'заточк[а-яё]*',
  charge: 'заряд(?:а|ы|ов|ом|у|е)?',
  rage: 'ярост[а-яё]*',
  fury: 'неистовств[а-яё]*',
  cold: 'холод(?:а|у|ом|е)?',
  frozen: 'оцепен[а-яё]*',
  focus: 'верн(?:ый|ого|ым) глаз(?:а|ом)?',
  taunt: 'насмешк[а-яё]*',
};

const KEYWORDS: Keyword[] = [
  ...(Object.keys(STATUS_STEMS) as StatusId[]).map((id) => ({ re: id === 'strength' ? wordCased(STATUS_STEMS[id]) : word(STATUS_STEMS[id]), title: STATUS_NAMES[id], text: STATUS_HINTS[id], status: id })),
  { re: word('блок[а-яё]*'), title: 'Блок', icon: 'block', text: 'Гасит урон ударов и заклинаний, но не ран. Сгорает в начале вашего хода, если броня не держит его.' },
  { re: word('усталост[а-яё]*'), title: 'Усталость', icon: 'fatigue', text: 'Каждая следующая атака в ходу слабее предыдущей: у большинства героев на 25 %.' },
  { re: word('крит[а-яё]*'), title: 'Крит', icon: 'crit', text: 'Критический удар: урон × крит. урон героя (от 150 %). Верный крит выпадает наверняка: удар в спину, удар по оглушённому или скованному льдом, Верный глаз.' },
  // Проклятие (v0.50) — вредный статус на враге; список тот же, что считает «Резонанс» (DEBUFFS в движке).
  {
    re: word('проклят[а-яё]*'),
    title: 'Проклятие',
    icon: 'skull',
    color: '#b388ff',
    text: 'Вредный статус на враге — всё, что герой навесил ему во вред:',
    extra: () => [tipChips(DEBUFFS.map((id) => tipChip({ status: id }, STATUS_NAMES[id])))],
  },
  { re: word('перезарядк[а-яё]*|кд'), title: 'Перезарядка', icon: 'cd', text: 'Столько ходов приём недоступен после применения.' },
  { re: word('стамин[а-яё]*|sta'), title: 'Стамина', icon: 'sta', text: 'Очки действий. Полностью восстанавливаются в начале каждого хода.' },
  { re: word('ман(?:а|ы|е|у|ой)|mp'), title: 'Мана', icon: 'mp', text: 'Восстанавливается только регеном в начале хода и целиком после комнаты.' },
  { re: word('заклинани[а-яё]*'), title: 'Заклинание', icon: 'spell', text: 'Урон не зависит от оружия и усталости, гасится блоком, растёт от Силы заклинаний.' },
  { re: word('удар в спину'), title: 'Удар в спину', icon: 'crit', text: 'Атака из скрытности: всегда крит и мимо блока врага, после неё герой виден.' },
];

/**
 * Подсказка ключевого слова (v0.51.2): иконка и имя цветом статуса, правило абзацем. value — число сразу за словом
 * («Кровотечение 4»): им заполняется N в правиле.
 */
function keywordTip(kw: Keyword, value: number | null): Child[] {
  const color = kw.status ? STATUS_COLORS[kw.status] : (kw.color ?? (kw.icon ? uiIconColor(kw.icon) : undefined));
  return [
    tipHead({ icon: kw.status ? { status: kw.status } : kw.icon, title: kw.title, color }),
    tipText(kw.status ? statusHint(kw.status, value) : kw.text),
    ...(kw.extra?.() ?? []),
  ];
}

/**
 * Разметить текст: строки и подсвеченные span'ы ключевых слов с подсказками.
 * opts.icons — перед статусом его пиксельная иконка (карточки v0.50); opts.numbers — числа крупнее и ярче.
 */
export function markKeywords(text: string, opts: { icons?: boolean; numbers?: boolean } = {}): Child[] {
  const out = markKeywordsRaw(text, !!opts.icons);
  return opts.numbers ? markNumbers(out) : out;
}

/**
 * Смысл числа по соседям (v0.50, как в Balatro: цвет числа = что оно значит): сила статуса — цветом статуса,
 * урон, блок, HP, стамина, мана, Сила — своими цветами ресурсов, срок в ходах — приглушённо. Остальное — общим выделением.
 */
function numberKind(prev: Child | undefined, before: string, after: string): { cls: string; color?: string } {
  const a = after.toLowerCase();
  if (/^\s*(?:ход|хода|ходов)(?![а-яё])/.test(a)) return { cls: 'n-turns' };
  // Сразу после статуса («Горение 3», «Яд 2») — это его сила; после слова «Блок» — щит («Блок 12» в намерении врага).
  if (!before.trim() && prev instanceof HTMLElement && prev.dataset.status) return { cls: 'n-status', color: STATUS_COLORS[prev.dataset.status as StatusId] };
  if (!before.trim() && prev instanceof HTMLElement && prev.dataset.kw === 'Блок') return { cls: 'n-block' };
  // «Атака 4», «Самоподрыв 18» — удар врага (подсказка намерения).
  if (/(?:^|\s)(?:атака|самоподрыв)\s*$/i.test(before)) return { cls: 'n-dmg' };
  if (/^[^.,;:]{0,14}урон/.test(a)) return { cls: 'n-dmg' };
  if (/^\s*(?:к\s+)?(?:блок|блока)/.test(a)) return { cls: 'n-block' };
  if (/^[^.,;:]{0,16}\bhp/.test(a) || /(?:лечит|лечение|восстанавливает)(?:\s+на)?\s*$/i.test(before)) return { cls: 'n-heal' };
  if (/^\s*(?:к\s+)?(?:sta|стамин)/.test(a)) return { cls: 'n-sta' };
  if (/^\s*(?:к\s+)?(?:mp|ман)/.test(a)) return { cls: 'n-mp' };
  if (/^\s*(?:к\s+)?сил/.test(a)) return { cls: 'n-str' };
  return { cls: '' };
}

/** Число эффекта в тексте: «3», «+10 %», «4–6», «×1.5». Им же подсказки (tips.ts) сравнивают тиры. */
export const NUMBER_RE = /[+−-]?\d+(?:[.,]\d+)?(?:–\d+)?(?:\s?%)?|×\s?\d+(?:[.,]\d+)?/g;

/**
 * Числа эффекта в тексте — отдельным span'ом: «Горение 3 на 3 хода», «+10 %», «4–6», «×1.5». Строки внутри ключевых слов
 * не трогаются (там чисел нет), подсказки остаются на своих span'ах; цвет — по смыслу числа (numberKind).
 */
export function markNumbers(children: Child[]): Child[] {
  const re = NUMBER_RE;
  const out: Child[] = [];
  children.forEach((c, idx) => {
    if (typeof c !== 'string') {
      out.push(c);
      return;
    }
    let last = 0;
    for (const m of c.matchAll(re)) {
      const i = m.index ?? 0;
      if (i > last) out.push(c.slice(last, i));
      const kind = numberKind(i === 0 || !c.slice(0, i).trim() ? children[idx - 1] : undefined, c.slice(0, i), c.slice(i + m[0].length));
      // Неразрывный пробел: «−20 %» не должно рваться между числом и знаком процента.
      out.push(h('b', { class: `num ${kind.cls}`.trim(), style: kind.color ? `color:${kind.color}` : null }, m[0].replace(' ', '\u00a0')));
      last = i + m[0].length;
    }
    if (last < c.length) out.push(c.slice(last));
  });
  return out;
}

function markKeywordsRaw(text: string, icons: boolean): Child[] {
  const out: Child[] = [];
  let rest = text;
  while (rest.length > 0) {
    let best: { index: number; len: number; kw: Keyword } | null = null;
    for (const kw of KEYWORDS) {
      const m = kw.re.exec(rest);
      if (m && (!best || m.index < best.index)) best = { index: m.index, len: m[0].length, kw };
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.index > 0) out.push(rest.slice(0, best.index));
    const icon = icons && best.kw.status ? statusIcon(best.kw.status, 14) : null;
    if (icon) icon.classList.add('kw-icon');
    const kw = best.kw;
    const tail = rest.slice(best.index + best.len);
    // Сила статуса сразу за словом («Кровотечение 4 на 3 хода») — ею подсказка заполнит N в правиле.
    const num = kw.status ? /^\s([+−-]?\d+)(?![.,]\d)/.exec(tail) : null;
    const value = num ? Number(num[1].replace('−', '-')) : null;
    out.push(h('span', { class: `kw ${icon ? 'with-icon' : ''}`.trim(), tip: () => keywordTip(kw, value), 'data-status': kw.status ?? null, 'data-kw': kw.title }, icon, rest.slice(best.index, best.index + best.len)));
    rest = tail;
  }
  return out;
}
