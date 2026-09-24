import { STATUS_NAMES } from '../engine/combat';
import type { LogMark, StatusId } from '../engine/types';

// ─── Разбор лога боя (v0.51) ───────────────────────────────────────────────
// Движок пишет лог строками и размечает шаги (`LogMark`): ход → шаги героя, врагов и союзников → строки шага.
// Здесь из этого собирается модель для отрисовки (logView.ts), а у каждой строки определяется вид — от него иконка,
// цвет чисел и сводка хода. Вид угадывается по тексту: промах разбора стоит только цвета, строка всё равно видна целиком.
// Модуль без DOM — его разбор проверяется тестами.

/** Чей шаг: герой, враг, союзник или сам бой (начало хода, расстановка). */
export type LogSide = 'hero' | 'enemy' | 'ally' | 'sys';

/** Вид строки: от него иконка в строке и цвет её чисел. */
export type LineKind =
  | 'hit' // удар или заклинание по HP
  | 'dot' // раны и то, что бьёт мимо блока (взрыв ран, свет)
  | 'heal'
  | 'block'
  | 'status' // статус лёг, вырос или снят
  | 'res' // стамина и мана
  | 'death'
  | 'summon'
  | 'miss' // промах, уклонение, нечего взрывать
  | 'phase' // босс сменил фазу
  | 'win'
  | 'lose'
  | 'end' // бой кончился без победы: вор удрал
  | 'info';

export interface LogLine {
  text: string;
  kind: LineKind;
  /** Статус строки — его иконка и цвет; первый найденный, если их несколько. */
  status?: StatusId;
  /** Кого бьёт строка удара или раны: героя, его союзника или врага. */
  target?: 'hero' | 'ally' | 'foe';
  /** Сколько HP потерял в этой строке враг или герой — для сводки хода. */
  toFoe: number;
  toHero: number;
}

export interface LogStep {
  side: LogSide;
  /** Первая строка шага — заголовок: действие героя, приём врага. У начала хода заголовка нет. */
  titled: boolean;
  lines: LogLine[];
}

export interface LogTurn {
  /** Номер хода; null — расстановка до первого хода (статусы испытаний, засада). */
  n: number | null;
  steps: LogStep[];
}

const SIDE: Record<string, LogSide> = { h: 'hero', e: 'enemy', a: 'ally', s: 'sys' };

/** Разметка для лога без неё (бои, записанные до v0.51): заголовки ходов по тексту, остальное — строки боя. */
export function fallbackMarks(lines: string[]): LogMark[] {
  return lines.map((l) => (TURN_RE.test(l) ? 'T' : 's'));
}

const TURN_RE = /^— Ход (\d+) —$/;

/** Лог боя → ходы и шаги. Разметка короче строк (обрезанный лог) — недостающие строки считаются строками боя. */
export function parseBattleLog(lines: string[], marks?: LogMark[]): LogTurn[] {
  const m = marks && marks.length === lines.length ? marks : fallbackMarks(lines);
  const turns: LogTurn[] = [{ n: null, steps: [] }];
  let step: LogStep | null = null;
  lines.forEach((text, i) => {
    const mark = m[i];
    if (mark === 'T') {
      turns.push({ n: Number(TURN_RE.exec(text)?.[1] ?? turns.length), steps: [] });
      step = null;
      return;
    }
    const side = SIDE[mark.toLowerCase()] ?? 'sys';
    const opens = mark !== mark.toLowerCase();
    if (opens || !step || step.side !== side) {
      // У шага самого боя заголовка нет: начало хода — просто строки подряд.
      step = { side, titled: opens && side !== 'sys', lines: [] };
      turns[turns.length - 1].steps.push(step);
    }
    step.lines.push(lineInfo(text));
  });
  return turns.filter((t) => t.n !== null || t.steps.length > 0);
}

// ─── Вид строки ────────────────────────────────────────────────────────────

const L = '[А-Яа-яЁё]';
const STATUS_IDS = (Object.keys(STATUS_NAMES) as StatusId[]).sort((a, b) => STATUS_NAMES[b].length - STATUS_NAMES[a].length);
/** Имена статусов в тексте — ровно как их пишет движок: с заглавной, целым словом («Яд», но не «ядовитый»). */
export const STATUS_RE = new RegExp(`(?<!${L})(${STATUS_IDS.map((id) => STATUS_NAMES[id]).join('|')})(?!${L})`, 'g');
const STATUS_BY_NAME = new Map(STATUS_IDS.map((id) => [STATUS_NAMES[id], id]));

/** Статусы, которые движок называет глаголом, а не именем статуса. */
const STATUS_WORDS: [RegExp, StatusId][] = [
  [/цепенеет от холода|скован льдом|лёд расколот/, 'frozen'],
  [/оглушён/, 'stun'],
  [/выходит из тени/, 'stealth'],
];

const HIT_RE =
  /^Герой (?:бьёт|хлещет) |^(?:Удар|Раскол ×[\d.]+|Таран|Заклинание|Обвал|Пролом щита|Финишер|Цепная атака|Сквозной удар) по | атакует(?: |: )|^Шипы |^Ответный удар: | взрывается: |^Герой ранит себя|^Перегрев: /;
const DOT_RE = /теряет \d+ HP от ран|истекает кровью: |^Взрыв ран по |^Испепеление по |^Свет обжигает /;
const MISS_RE = /уворачивается|неуязвим|не видит героя|прошёл мимо|нечего|нечем|→ 0 по HP \((?:уклонился|уворот|неуязвим|враг не видит)|^Герой: (?:уклонился|неуязвим|враг не видит героя)$/;

/** Вид строки, статус и потери HP по её тексту. */
export function lineInfo(text: string): LogLine {
  const info: LogLine = { text, kind: kindOf(text), toFoe: 0, toHero: 0 };
  const st = statusOf(text);
  if (st) info.status = st;
  if (info.kind === 'status' && !st) info.kind = 'info';
  if (info.kind === 'hit' || info.kind === 'dot' || info.kind === 'miss') {
    const lost = hpLost(text);
    info.target = hpTarget(text);
    if (info.target === 'hero') info.toHero = lost;
    else if (info.target === 'foe') info.toFoe = lost;
  }
  return info;
}

function kindOf(text: string): LineKind {
  if (text === 'Победа!') return 'win';
  if (text === 'Бой окончен') return 'end';
  if (/^Герой пал\.?$/.test(text)) return 'lose';
  if (/ повержен$| пал$/.test(text)) return 'death';
  if (/ удирает с добычей$/.test(text)) return 'end';
  if (/^(?:Рядом с героем появляется|Появляется) | встаёт снова /.test(text)) return 'summon';
  if (MISS_RE.test(text)) return 'miss';
  if (DOT_RE.test(text)) return 'dot';
  if (HIT_RE.test(text)) return 'hit';
  if (/: \+\d+ HP/.test(text)) return 'heal';
  if (/\+\d+ блока/.test(text)) return 'block';
  if (/\+\d+ (?:STA|MP)|возвращает \d+ STA|теряет \d+ маны/.test(text)) return 'res';
  // Смена фазы босса: «Вожак стаи: Ярость стаи!» — единственная строка с восклицанием после двоеточия.
  if (/^[^:!]+: [^:]+!$/.test(text)) return 'phase';
  if (statusOf(text)) return 'status';
  return 'info';
}

function statusOf(text: string): StatusId | undefined {
  for (const [re, id] of STATUS_WORDS) if (re.test(text)) return id;
  STATUS_RE.lastIndex = 0;
  const m = STATUS_RE.exec(text);
  return m ? STATUS_BY_NAME.get(m[1]) : undefined;
}

/**
 * Сколько HP ушло в строке удара: после «→ N по HP», союзнику — «(N по HP)», раны — «теряет N HP», шипы и ответный удар —
 * «N урона», иначе первое число после двоеточия (удар без блока и уязвимости пишется без хвоста).
 */
export function hpLost(text: string): number {
  const m = /→ (\d+) по HP/.exec(text) ?? /\((\d+) по HP\)/.exec(text) ?? /теряет (\d+) HP/.exec(text) ?? /(\d+) урона/.exec(text) ?? /: (\d+)/.exec(text);
  return m ? Number(m[1]) : 0;
}

/** Кто терял HP: герой, союзник героя или враг. */
function hpTarget(text: string): 'hero' | 'ally' | 'foe' {
  if (/^Герой (?:теряет|ранит себя)|^Перегрев|урона (?:герою|себе)| атакует: | взрывается: /.test(text)) return 'hero';
  // Враг бьёт союзника («Гоблин атакует Волк: 4 (4 по HP)») и колет его шипами.
  if (/ атакует [^:]+: \d+ \(\d+ по HP\)$/.test(text) || /^Шипы (?!героя)[^:]+: \d+ урона (?!герою)/.test(text)) return 'ally';
  return 'foe';
}

// ─── Текст строки ──────────────────────────────────────────────────────────

/** Кусок строки: текст или пояснение в скобках (скобки верхнего уровня, вложенные вроде «удар(ов)» остаются внутри). */
export interface Segment {
  text: string;
  note: boolean;
}

export function splitNotes(text: string): Segment[] {
  const out: Segment[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of text) {
    if (ch === '(' && depth++ === 0) {
      if (buf) out.push({ text: buf, note: false });
      buf = '';
      continue;
    }
    if (ch === ')' && depth > 0 && --depth === 0) {
      out.push({ text: buf, note: true });
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf) out.push({ text: depth > 0 ? `(${buf}` : buf, note: false });
  return out;
}

/**
 * Раскладка удара («кубик 3 + заряд 6 = 9», «3 + сила заклинаний 1») — пояснение до стрелки с арифметикой. Её выносят
 * отдельной строкой под ударом: сначала что случилось, потом как посчитано. Пояснения после стрелки (блок, уязвимость)
 * и короткие («перк брони», «38 %») остаются в строке.
 */
export function isFormula(segments: Segment[], index: number): boolean {
  const s = segments[index];
  if (!s.note) return false;
  const arrow = segments.findIndex((x) => !x.note && x.text.includes('→'));
  if (arrow >= 0 && arrow < index) return false;
  return /[=+×]|кубик/.test(s.text);
}

/** Кто действует в заголовке шага: «Гоблин» в «Гоблин: Удар», «Могильный слизень» в «… теряет 3 HP от ран». */
export function actorOf(text: string): string | null {
  if (text.startsWith('Герой')) return 'Герой';
  const m = /^(.+?)(?:: | теряет | оглушён| скован| собирается| неуязвим| атакует)/.exec(text);
  return m ? m[1] : null;
}

/** Сводка хода: урон по врагам, потери героя, кто пал. */
export interface LogTotals {
  toFoe: number;
  toHero: number;
  kills: number;
}

export function totalsOf(lines: LogLine[]): LogTotals {
  const t: LogTotals = { toFoe: 0, toHero: 0, kills: 0 };
  for (const l of lines) {
    t.toFoe += l.toFoe;
    t.toHero += l.toHero;
    if (l.kind === 'death' && / повержен$/.test(l.text)) t.kills += 1;
  }
  return t;
}
