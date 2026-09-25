import { button, h } from '../dom';
import { heroDef } from '../../data/heroes';
import { enemyDef } from '../../data/enemies';
import { ROOM_NAMES } from '../../data/locations';
import { DIFFICULTIES } from '../../data/boons';
import { currentLocation, currentRoomKind } from '../../engine/run';
import { heroSprite } from '../heroSprite';
import { artifactDef } from '../../data/artifacts';
import { nextUnlockText } from '../../data/mastery';
import type { App } from '../app';

/** «45 с», «12 мин 34 с», «1 ч 05 мин» — крупнее часа секунды не нужны. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} ч ${String(minutes).padStart(2, '0')} мин`;
  if (minutes > 0) return `${minutes} мин ${seconds} с`;
  return `${seconds} с`;
}

export function endScreen(app: App): HTMLElement {
  const run = app.run!;
  const won = run.phase === 'victory';
  const def = heroDef(run.hero.defId);
  const loc = currentLocation(run);
  const boss = enemyDef(loc.encounters.boss[0][0]).name;
  const s = run.stats;
  const row = (k: string, v: string) => h('div', { class: 'stat' }, h('span', { class: 'stat-k' }, k), h('span', { class: 'stat-v' }, v));
  return h(
    'div',
    { class: `screen end ${won ? 'won' : 'lost'}` },
    h(
      'div',
      { class: 'panel result-panel' },
      h('h1', null, won ? 'Победа!' : 'Забег окончен'),
      h('p', { class: 'dim' }, won ? `${boss} повержен. Три локации пройдены.` : `${def.name} пал: ${loc.name}, комната ${run.roomIndex + 1} (${ROOM_NAMES[currentRoomKind(run)]}).`),
      h(
        'div',
        { class: 'result-body' },
        heroSprite(def.id, 112, won ? 'idle' : 'death'),
        h(
          'div',
          { class: 'stats-grid wide' },
          // Сложность — в строке героя: лишняя строка вместе с заметкой мастерства вылезла бы за кадр 540.
          row('Герой', DIFFICULTIES[run.difficulty] ? `${def.name} · ${DIFFICULTIES[run.difficulty].name}` : def.name),
          row('Боёв выиграно', `${s.roomsCleared}`),
          row('Врагов убито', `${s.kills}`),
          row('Ходов', `${s.turns}`),
          // Сейвы до появления поля времени не имеют startedAt — строку не показываем.
          s.startedAt && s.finishedAt ? row('Время', formatDuration(s.finishedAt - s.startedAt)) : null,
          row('Урон нанесён', `${s.damageDealt}`),
          row('Урон получен', `${s.damageTaken}`),
          row('Сид', `${run.seed}`),
        ),
      ),
      masteryNote(app),
      h(
        'div',
        { class: 'row' },
        button('Персонаж', () => app.toggleSheet(), { class: 'big', tip: 'Билд, с которым закончился забег (C)' }),
        button('Лог боя', () => app.toggleLog(), { class: 'big', tip: 'Все бои забега (L)' }),
      ),
      h(
        'div',
        { class: 'row' },
        button('Новый забег', () => app.showHeroSelect(), { class: 'primary big' }),
        button('В меню', () => app.showMenu(), { class: 'big' }),
      ),
    ),
  );
}

/** Что дал забег мастерству героя (v0.45): опыт, новый уровень и что он открыл, артефакты, открытые наборами. */
function masteryNote(app: App): HTMLElement | null {
  const u = app.lastUnlocks;
  if (!u || u.hero !== app.run?.hero.defId) return null;
  const lines: string[] = [`Мастерство: +${u.xpGained} опыта${u.levelAfter > u.levelBefore ? `, уровень ${u.levelBefore} → ${u.levelAfter}` : ''}`];
  for (let lvl = u.levelBefore; lvl < u.levelAfter; lvl++) {
    const text = nextUnlockText(u.hero, lvl);
    if (text) lines.push(`Открыто: ${text}`);
  }
  if (u.artifacts.length) lines.push(`Открыто в пуле: ${u.artifacts.map((id) => artifactDef(id).name).join(', ')}`);
  return h('div', { class: 'mastery-note' }, ...lines.map((l) => h('div', null, l)));
}
