import { DEBUFFS, STATUS_HINTS, STATUS_NAMES } from '../engine/combat';
import type { StatusId } from '../engine/types';
import { h, type Child } from './dom';
import { STATUS_COLORS, statusIcon } from './icons';

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
  { re: word('крит[а-яё]*'), title: 'Крит', text: 'Критический удар: урон × крит. урон героя (от 150 %). Верный крит выпадает наверняка: удар в спину, Верный глаз, «Оглушающий удар» по оглушённому.' },
  // Проклятие (v0.50) — вредный статус на враге; список тот же, что считает «Резонанс» (DEBUFFS в движке).
  { re: word('проклят[а-яё]*'), title: 'Проклятие', text: `Вредный статус на враге: ${DEBUFFS.map((id) => STATUS_NAMES[id]).join(', ')}.` },
  { re: word('перезарядк[а-яё]*|кд'), title: 'Перезарядка', text: 'Столько ходов приём недоступен после применения.' },
  { re: word('стамин[а-яё]*|sta'), title: 'Стамина', text: 'Очки действий. Полностью восстанавливаются в начале каждого хода.' },
  { re: word('ман(?:а|ы|е|у|ой)|mp'), title: 'Мана', text: 'Восстанавливается только регеном в начале хода и целиком после комнаты.' },
  { re: word('заклинани[а-яё]*'), title: 'Заклинание', text: 'Урон не зависит от оружия и усталости, гасится блоком, растёт от Силы заклинаний.' },
  { re: word('удар в спину'), title: 'Удар в спину', text: 'Атака из скрытности: всегда крит, после неё герой виден.' },
];

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
  // Сразу после статуса («Горение 3», «Яд 2») — это его сила.
  if (!before.trim() && prev instanceof HTMLElement && prev.dataset.status) return { cls: 'n-status', color: STATUS_COLORS[prev.dataset.status as StatusId] };
  if (/^[^.,;:]{0,14}урон/.test(a)) return { cls: 'n-dmg' };
  if (/^\s*(?:к\s+)?(?:блок|блока)/.test(a)) return { cls: 'n-block' };
  if (/^[^.,;:]{0,16}\bhp/.test(a) || /(?:лечит|лечение|восстанавливает)(?:\s+на)?\s*$/i.test(before)) return { cls: 'n-heal' };
  if (/^\s*(?:к\s+)?(?:sta|стамин)/.test(a)) return { cls: 'n-sta' };
  if (/^\s*(?:к\s+)?(?:mp|ман)/.test(a)) return { cls: 'n-mp' };
  if (/^\s*(?:к\s+)?сил/.test(a)) return { cls: 'n-str' };
  return { cls: '' };
}

/**
 * Числа эффекта в тексте — отдельным span'ом: «Горение 3 на 3 хода», «+10 %», «4–6», «×1.5». Строки внутри ключевых слов
 * не трогаются (там чисел нет), подсказки остаются на своих span'ах; цвет — по смыслу числа (numberKind).
 */
export function markNumbers(children: Child[]): Child[] {
  const re = /[+−-]?\d+(?:[.,]\d+)?(?:–\d+)?(?:\s?%)?|×\s?\d+(?:[.,]\d+)?/g;
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
    out.push(h('span', { class: `kw ${icon ? 'with-icon' : ''}`.trim(), 'data-tip-title': best.kw.title, 'data-tip': best.kw.text, 'data-status': best.kw.status ?? null }, icon, rest.slice(best.index, best.index + best.len)));
    rest = rest.slice(best.index + best.len);
  }
  return out;
}
