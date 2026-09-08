import { STATUS_HINTS, STATUS_NAMES } from '../engine/combat';
import type { StatusId } from '../engine/types';
import { h, type Child } from './dom';

/**
 * Ключевые слова игры в описаниях: найденные слова оборачиваются в подсвеченный span
 * со своей подсказкой. Словарь статусов берётся из движка, чтобы описания не расходились с правилами.
 * Границы слов ищутся через lookaround: `\b` в JS не знает кириллицы.
 */

interface Keyword {
  re: RegExp;
  title: string;
  text: string;
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
  dodge: 'уклон[а-яё]*|уворач[а-яё]*',
  thorns: 'шип[а-яё]*',
  regen: 'регенерац[а-яё]*',
  invuln: 'неуязвим[а-яё]*',
  poison: 'яд(?:а|у|ом|е)?',
  stealth: 'скрытност[а-яё]*',
};

const KEYWORDS: Keyword[] = [
  ...(Object.keys(STATUS_STEMS) as StatusId[]).map((id) => ({ re: word(STATUS_STEMS[id]), title: STATUS_NAMES[id], text: STATUS_HINTS[id] })),
  { re: word('блок[а-яё]*'), title: 'Блок', text: 'Гасит урон ударов и заклинаний, но не ран. Сгорает в начале вашего хода, если броня не держит его.' },
  { re: word('усталост[а-яё]*'), title: 'Усталость', text: 'Каждая следующая атака в ходу слабее предыдущей: у большинства героев на 25 %.' },
  { re: word('крит[а-яё]*'), title: 'Крит', text: 'Критический удар: урон ×2, с перками оружия больше.' },
  { re: word('перезарядк[а-яё]*|кд'), title: 'Перезарядка', text: 'Столько ходов приём недоступен после применения.' },
  { re: word('стамин[а-яё]*|sta'), title: 'Стамина', text: 'Очки действий. Полностью восстанавливаются в начале каждого хода.' },
  { re: word('ман(?:а|ы|е|у|ой)|mp'), title: 'Мана', text: 'Восстанавливается только регеном в начале хода и целиком после комнаты.' },
  { re: word('заклинани[а-яё]*'), title: 'Заклинание', text: 'Урон не зависит от оружия и усталости, гасится блоком, растёт от Силы заклинаний.' },
  { re: word('удар в спину'), title: 'Удар в спину', text: 'Атака из скрытности: всегда крит, после неё герой виден.' },
];

/** Разметить текст: строки и подсвеченные span'ы ключевых слов с подсказками. */
export function markKeywords(text: string): Child[] {
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
    out.push(h('span', { class: 'kw', 'data-tip-title': best.kw.title, 'data-tip': best.kw.text }, rest.slice(best.index, best.index + best.len)));
    rest = rest.slice(best.index + best.len);
  }
  return out;
}
