import { STATUS_HINTS, STATUS_NAMES } from '../engine/combat';
import type { StatusId } from '../engine/types';
import { h, type Child } from './dom';
import { statusIcon } from './icons';

/**
 * Ключевые слова игры в описаниях: найденные слова оборачиваются в подсвеченный span
 * со своей подсказкой. Словарь статусов берётся из движка, чтобы описания не расходились с правилами.
 * Границы слов ищутся через lookaround: `\b` в JS не знает кириллицы.
 */

interface Keyword {
  re: RegExp;
  title: string;
  text: string;
  /** Статус, если ключевое слово — статус: прототипы карточек (v0.50) ставят перед словом его иконку. */
  status?: StatusId;
}

const L = '[а-яёa-z]';
const word = (stem: string) => new RegExp(`(?<!${L})(?:${stem})(?!${L})`, 'i');

/** Основа слова для каждого статуса: ловит падежи и глаголы («оглушает», «кровотечения»). */
const STATUS_STEMS: Record<StatusId, string> = {
  strength: 'сил(?:а|ы|е|у|ой)',
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
  ...(Object.keys(STATUS_STEMS) as StatusId[]).map((id) => ({ re: word(STATUS_STEMS[id]), title: STATUS_NAMES[id], text: STATUS_HINTS[id], status: id })),
  { re: word('блок[а-яё]*'), title: 'Блок', text: 'Гасит урон ударов и заклинаний, но не ран. Сгорает в начале вашего хода, если броня не держит его.' },
  { re: word('усталост[а-яё]*'), title: 'Усталость', text: 'Каждая следующая атака в ходу слабее предыдущей: у большинства героев на 25 %.' },
  { re: word('крит[а-яё]*'), title: 'Крит', text: 'Критический удар: урон ×2, с перками оружия больше.' },
  { re: word('перезарядк[а-яё]*|кд'), title: 'Перезарядка', text: 'Столько ходов приём недоступен после применения.' },
  { re: word('стамин[а-яё]*|sta'), title: 'Стамина', text: 'Очки действий. Полностью восстанавливаются в начале каждого хода.' },
  { re: word('ман(?:а|ы|е|у|ой)|mp'), title: 'Мана', text: 'Восстанавливается только регеном в начале хода и целиком после комнаты.' },
  { re: word('заклинани[а-яё]*'), title: 'Заклинание', text: 'Урон не зависит от оружия и усталости, гасится блоком, растёт от Силы заклинаний.' },
  { re: word('удар в спину'), title: 'Удар в спину', text: 'Атака из скрытности: всегда крит, после неё герой виден.' },
];

/**
 * Разметить текст: строки и подсвеченные span'ы ключевых слов с подсказками.
 * opts.icons — перед статусом его пиксельная иконка (прототипы карточек v0.50); opts.numbers — числа крупнее и ярче.
 */
export function markKeywords(text: string, opts: { icons?: boolean; numbers?: boolean } = {}): Child[] {
  const out = markKeywordsRaw(text, !!opts.icons);
  return opts.numbers ? markNumbers(out) : out;
}

/**
 * Числа эффекта в тексте — отдельным span'ом: «Горение 3 на 3 хода», «+10 %», «4–6», «×1.5». Строки внутри ключевых слов
 * не трогаются (там чисел нет), подсказки остаются на своих span'ах.
 */
export function markNumbers(children: Child[]): Child[] {
  const re = /[+−-]?\d+(?:[.,]\d+)?(?:–\d+)?(?:\s?%)?|×\s?\d+(?:[.,]\d+)?/g;
  const out: Child[] = [];
  for (const c of children) {
    if (typeof c !== 'string') {
      out.push(c);
      continue;
    }
    let last = 0;
    for (const m of c.matchAll(re)) {
      const i = m.index ?? 0;
      if (i > last) out.push(c.slice(last, i));
      // Неразрывный пробел: «−20 %» не должно рваться между числом и знаком процента.
      out.push(h('b', { class: 'num' }, m[0].replace(' ', '\u00a0')));
      last = i + m[0].length;
    }
    if (last < c.length) out.push(c.slice(last));
  }
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
    out.push(h('span', { class: `kw ${icon ? 'with-icon' : ''}`.trim(), 'data-tip-title': best.kw.title, 'data-tip': best.kw.text }, icon, rest.slice(best.index, best.index + best.len)));
    rest = rest.slice(best.index + best.len);
  }
  return out;
}
