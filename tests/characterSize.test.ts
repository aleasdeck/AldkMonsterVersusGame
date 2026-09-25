import { describe, expect, it } from 'vitest';
import { ENEMY_LIST, enemyDef } from '../src/data/enemies';
import { HERO_LIST } from '../src/data/heroes';
import { ENEMY_BODY_HEIGHT, HERO_BODY_HEIGHT } from '../src/data/characterSizes';
import { enemySize } from '../src/ui/characterSize';
import { spriteBounds, spriteSize } from '../src/ui/sprites';
import { hasMobArt } from '../src/ui/mobs';

describe('масштаб персонажей по видимому телу', () => {
  it('каждый монстр и герой имеет явно заданный рост', () => {
    expect(Object.keys(ENEMY_BODY_HEIGHT).sort()).toEqual(ENEMY_LIST.map((e) => e.id).sort());
    expect(Object.keys(HERO_BODY_HEIGHT).sort()).toEqual(HERO_LIST.map((h) => h.id).sort());
  });
  it('скелеты одного роста, некромант выше, големы крупнее людей, мелочь меньше', () => {
    const height = (id: string) => enemySize(enemyDef(id)).body;
    expect(height('skeleton_warrior')).toBe(height('skeleton_archer'));
    expect(height('necromancer')).toBeGreaterThan(height('skeleton_warrior'));
    expect(height('bone_golem')).toBeGreaterThan(height('necromancer'));
    expect(height('dragon')).toBeGreaterThan(height('bone_golem'));
    expect(height('rat')).toBeLessThan(height('goblin'));
    expect(height('goblin')).toBeLessThan(height('skeleton_warrior'));
    expect(height('gnome_thief')).toBeLessThan(height('bandit_archer'));
  });
  it('прозрачные поля процедурных картинок не уменьшают видимый рост', () => {
    // Лепка меряется моделью (рост против таблицы проверяет tests/mobs.test.ts).
    for (const def of ENEMY_LIST.filter((e) => !hasMobArt(e.id))) {
      const size = enemySize(def), bounds = spriteBounds(def.sprite, def.id);
      expect(size.px - size.top - size.foot).toBeCloseTo(ENEMY_BODY_HEIGHT[def.id]);
      expect(size.px * bounds.height / spriteSize(def.sprite)).toBeCloseTo(size.body);
      expect(size.top).toBeGreaterThanOrEqual(0);
      expect(size.foot).toBeGreaterThanOrEqual(0);
    }
  });
  it('ранг не меняет размер, альбом пропорционален бою', () => {
    const def = enemyDef('necromancer');
    expect(enemySize({ ...def, rank: 'normal' })).toEqual(enemySize(def));
    for (const e of ENEMY_LIST) {
      const battle = enemySize(e), album = enemySize(e, 0.24);
      expect(album.body).toBeCloseTo(battle.body * 0.24);
      expect(album.px).toBeCloseTo(battle.px * 0.24);
      expect(battle.body).toBeLessThanOrEqual(184);
    }
  });
});
