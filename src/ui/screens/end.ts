import { button, h } from '../dom';
import { heroDef } from '../../data/heroes';
import { enemyDef } from '../../data/enemies';
import { ROOM_NAMES } from '../../data/locations';
import { currentLocation, currentRoomKind } from '../../engine/run';
import { spriteImg } from '../sprites';
import type { App } from '../app';

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
        spriteImg(def.sprite, def.id, 112),
        h(
          'div',
          { class: 'stats-grid wide' },
          row('Герой', def.name),
          row('Боёв выиграно', `${s.roomsCleared}`),
          row('Врагов убито', `${s.kills}`),
          row('Ходов', `${s.turns}`),
          row('Урон нанесён', `${s.damageDealt}`),
          row('Урон получен', `${s.damageTaken}`),
          row('Сид', `${run.seed}`),
        ),
      ),
      h('div', { class: 'chest-earned' }, app.profile.chests > 0 ? `Сундуков за забеги: ${app.profile.chests}` : 'Сундук за этот забег уже открыт'),
      h(
        'div',
        { class: 'row' },
        app.profile.chests > 0 ? button('Открыть сундук', () => app.showChest(), { class: 'primary big' }) : null,
        button('Новый забег', () => app.showHeroSelect(), { class: app.profile.chests > 0 ? 'big' : 'primary big' }),
        button('В меню', () => app.showMenu(), { class: 'big' }),
      ),
    ),
  );
}
