import { describe, expect, it } from 'vitest';
import { actorOf, hpLost, isFormula, lineInfo, parseBattleLog, splitNotes, totalsOf } from '../src/ui/logParse';
import type { LogMark } from '../src/engine/types';

/** Разбор лога для отрисовки (v0.51): ходы и шаги — по разметке движка, вид строки и потери HP — по тексту. */

const LOG: [LogMark, string][] = [
  ['T', '— Ход 1 —'],
  ['H', 'Герой: Огненный шар'],
  ['h', 'Заклинание по Могильный слизень: 4 (3 + сила заклинаний 1)'],
  ['h', 'Герой: +1 блока (перк брони)'],
  ['h', 'Могильный слизень: Горение 3 на 3 хода'],
  ['h', 'Заряд: 1'],
  ['H', 'Герой бьёт Могильный слизень: 13 (кубик 4 + заряд 9 = 13)'],
  ['E', 'Могильный слизень теряет 3 HP от ран'],
  ['E', 'Могильный слизень: Плевок'],
  ['e', 'Могильный слизень атакует: 4 → 1 по HP (блок −3)'],
  ['T', '— Ход 2 —'],
  ['s', 'Герой: +2 HP (регенерация)'],
  ['H', 'Герой бьёт Могильный слизень: 9 (кубик 3 + Сила 1 = 4, приём ×2 = 8) → 6 по HP (блок −2)'],
  ['h', 'Могильный слизень повержен'],
  ['h', 'Победа!'],
];

describe('разбор лога боя (v0.51)', () => {
  it('ходы и шаги — по разметке: у шага героя и врага заголовок, начало хода — без него', () => {
    const turns = parseBattleLog(
      LOG.map(([, t]) => t),
      LOG.map(([m]) => m),
    );
    expect(turns.map((t) => t.n)).toEqual([1, 2]);
    const [one, two] = turns;
    expect(one.steps.map((s) => `${s.side}:${s.titled}:${s.lines.length}`)).toEqual(['hero:true:5', 'hero:true:1', 'enemy:true:1', 'enemy:true:2']);
    expect(one.steps[3].lines[0].text).toBe('Могильный слизень: Плевок');
    expect(two.steps.map((s) => `${s.side}:${s.titled}`)).toEqual(['sys:false', 'hero:true']);
    expect(two.steps[1].lines.map((l) => l.kind)).toEqual(['hit', 'death', 'win']);
  });

  it('без разметки (бой до v0.51) — ходы по заголовкам, всё прочее строками боя', () => {
    const turns = parseBattleLog(LOG.map(([, t]) => t));
    expect(turns.map((t) => t.n)).toEqual([1, 2]);
    expect(turns[0].steps).toHaveLength(1);
    expect(turns[0].steps[0].side).toBe('sys');
    expect(turns[0].steps[0].titled).toBe(false);
  });

  it('расстановка до первого хода — свой блок без номера', () => {
    const turns = parseBattleLog(['Засада! Враги нападают первыми', 'Крыса: Укус', 'Крыса атакует: 3 → 2 по HP (кольчуга −1)', '— Ход 1 —'], ['S', 'E', 'e', 'T']);
    expect(turns.map((t) => t.n)).toEqual([null, 1]);
    expect(turns[0].steps.map((s) => s.side)).toEqual(['sys', 'enemy']);
  });

  it('вид строки и потери HP: удар по врагу и по герою, раны, шипы, ответный удар, союзник', () => {
    const hit = lineInfo('Герой бьёт Гоблин: 6 (кубик 3 + заряд 3 = 6) → 4 по HP (блок −2)');
    expect([hit.kind, hit.target, hit.toFoe, hit.toHero]).toEqual(['hit', 'foe', 4, 0]);
    const bite = lineInfo('Гоблин атакует: 5 → 3 по HP (кольчуга −1, блок −1)');
    expect([bite.kind, bite.target, bite.toHero, bite.guard]).toEqual(['hit', 'hero', 3, 1]);
    expect(lineInfo('Гоблин атакует: 4').toHero).toBe(4);
    expect(lineInfo('Гоблин атакует Волк: 4 (3 по HP)').target).toBe('ally');
    expect(lineInfo('Шипы Хитиновый жук: 3 урона герою').toHero).toBe(3);
    expect(lineInfo('Шипы героя: 2 урона Волк').toFoe).toBe(2);
    expect(lineInfo('Ответный удар: 2 урона Волк (щит погасил 3)').toFoe).toBe(2);
    expect(lineInfo('Пролом щита по Гоблин: блок 4 снят, 8 урона (4 × 2)').toFoe).toBe(8);
    const dot = lineInfo('Пират теряет 3 HP от ран');
    expect([dot.kind, dot.toFoe]).toEqual(['dot', 3]);
    expect(lineInfo('Герой теряет 2 HP от ран (4 − мазь 2)').toHero).toBe(2);
    const burst = lineInfo('Взрыв ран по Кабан: 9 (Кровотечение 3 × 3) → 9 по HP');
    expect([burst.kind, burst.status, burst.toFoe]).toEqual(['dot', 'bleed', 9]);
    const miss = lineInfo('Герой бьёт Призрак капитана: 8 (кубик 8) → 0 по HP (уворот 30 %)');
    expect([miss.kind, miss.toFoe]).toEqual(['miss', 0]);
  });

  it('вид строки: статусы, блок, лечение, ресурсы, гибель, смена фазы', () => {
    expect(lineInfo('Слизнёнок: Горение 3 на 3 хода')).toMatchObject({ kind: 'status', status: 'burn' });
    expect(lineInfo('Заряд: 2')).toMatchObject({ kind: 'status', status: 'charge' });
    expect(lineInfo('Жаба цепенеет от холода: пропустит ход')).toMatchObject({ kind: 'status', status: 'frozen' });
    expect(lineInfo('Сердце улья оглушён и пропускает ход')).toMatchObject({ kind: 'status', status: 'stun' });
    expect(lineInfo('Герой защищается: +6 блока')).toMatchObject({ kind: 'block', block: 6 });
    expect(lineInfo('Гоблин: +6 блока')).toMatchObject({ kind: 'block', block: 0 });
    expect(lineInfo('Герой: +3 HP (вампиризм)')).toMatchObject({ kind: 'heal', heal: 3 });
    expect(lineInfo('Тролль: +5 HP').kind).toBe('heal');
    expect(lineInfo('Боевой транс: +1 STA').kind).toBe('res');
    expect(lineInfo('Герой теряет 1 маны').kind).toBe('res');
    expect(lineInfo('Крыса повержен').kind).toBe('death');
    expect(lineInfo('Волк пал').kind).toBe('death');
    expect(lineInfo('Герой пал.').kind).toBe('lose');
    expect(lineInfo('Гном-деньгокрад удирает с добычей').kind).toBe('end');
    expect(lineInfo('Вожак стаи: Раненый зверь!').kind).toBe('phase');
    expect(lineInfo('Появляется Слизнёнок').kind).toBe('summon');
    expect(lineInfo('Гоблин: Подлый удар').kind).toBe('info');
    // «Яд» — имя статуса только целиком: в «Ядовитом облаке» статуса нет.
    expect(lineInfo('Герой: Ядовитое облако').status).toBeUndefined();
  });

  it('пояснения в скобках: вложенные остаются внутри, раскладка — только до стрелки', () => {
    const fin = splitNotes('Финишер по Волк: 8 (4 × 2 удар(ов); 50 % от среднего удара 5) → 6 по HP (блок −2)');
    expect(fin.map((s) => s.note)).toEqual([false, true, false, true]);
    expect(fin[1].text).toBe('4 × 2 удар(ов); 50 % от среднего удара 5');
    expect(isFormula(fin, 1)).toBe(true);
    expect(isFormula(fin, 3)).toBe(false);
    const block = splitNotes('Герой: +1 блока (перк брони)');
    expect(isFormula(block, 1)).toBe(false);
    const roll = splitNotes('Удар по Скелет-воин: 4 (кубик 4)');
    expect(isFormula(roll, 1)).toBe(true);
  });

  it('кто действует в заголовке шага', () => {
    expect(actorOf('Герой: Огненный шар')).toBe('Герой');
    expect(actorOf('Герой бьёт Гоблин: 9 (кубик 9)')).toBe('Герой');
    expect(actorOf('Могильный слизень: Плевок')).toBe('Могильный слизень');
    expect(actorOf('Могильный слизень теряет 3 HP от ран')).toBe('Могильный слизень');
    expect(actorOf('Сердце улья оглушён и пропускает ход')).toBe('Сердце улья');
  });

  it('сводка шага: урон по врагам и по герою, блок и лечение героя, павшие', () => {
    const lines = LOG.slice(1).map(([, t]) => lineInfo(t));
    expect(totalsOf(lines)).toEqual({ toFoe: 4 + 13 + 3 + 6, toHero: 1, block: 1, heal: 2, guard: 3, kills: 1 });
    expect(hpLost('Заклинание по Гоблин: 4 (3 + сила заклинаний 1) → 0 по HP (блок −4)')).toBe(0);
  });
});
