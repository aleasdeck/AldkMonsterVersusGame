import { describe, expect, it } from 'vitest';
import { ART_TIERS, COLLECTIBLES, COLLECTIBLE_IDS, collectible, collectibleLines, findKey, foundState, loadoutFinds, migrateFinds } from '../src/data/collection';
import { ARTIFACT_IDS } from '../src/data/artifacts';
import { POTION_IDS } from '../src/data/potions';
import { dropBases } from '../src/data/gear';
import { HERO_LIST, heroDef } from '../src/data/heroes';
import { addArtifact } from '../src/engine/equipment';
import { newRun } from '../src/engine/run';

describe('каталог находок', () => {
  it('содержит все артефакты, все базы экипировки и все зелья, id уникальны', () => {
    const expected = ARTIFACT_IDS.length + dropBases('weapon').length + dropBases('armor').length + POTION_IDS.length;
    expect(COLLECTIBLES.length).toBe(expected);
    expect(new Set(COLLECTIBLE_IDS).size).toBe(expected);
    for (const id of ARTIFACT_IDS) expect(collectible(`art:${id}`)).not.toBeNull();
    for (const b of dropBases('weapon')) expect(collectible(`weapon:${b.id}`)).not.toBeNull();
    for (const b of dropBases('armor')) expect(collectible(`armor:${b.id}`)).not.toBeNull();
    for (const id of POTION_IDS) expect(collectible(`potion:${id}`)).not.toBeNull();
  });

  it('у каждой записи есть имя, подпись и описание; у артефакта — три тира', () => {
    for (const c of COLLECTIBLES) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.sub.length).toBeGreaterThan(0);
      if (c.kind === 'artifact') {
        expect(c.tiers).toHaveLength(3);
        for (const text of c.tiers!) expect(text.length).toBeGreaterThan(0);
      } else {
        expect(c.desc.length).toBeGreaterThan(0);
        expect(c.tiers).toBeUndefined();
      }
    }
  });
});

describe('открытие записей забегом', () => {
  it('стартовый набор героя открывает его оружие, броню и персональный артефакт 1 тира', () => {
    const run = newRun('warrior', 1);
    const keys = loadoutFinds(run.hero);
    expect(keys).toContain(`weapon:${run.hero.weapon.base}`);
    expect(keys).toContain(`armor:${run.hero.armor.base}`);
    expect(keys).toContain(findKey(`art:${heroDef('warrior').signature}`, 1));
  });

  it('«Шкура» Берсерка записи не открывает — её нет в каталоге', () => {
    const run = newRun('berserk', 1);
    expect(run.hero.armor.base).toBe('hide');
    expect(loadoutFinds(run.hero).some((k) => k.startsWith('armor:'))).toBe(false);
  });

  it('у каждого героя стартовое снаряжение либо в каталоге, либо намеренно вне его', () => {
    for (const hero of HERO_LIST) {
      const run = newRun(hero.id, 1);
      expect(loadoutFinds(run.hero)).toContain(`weapon:${run.hero.weapon.base}`);
    }
  });

  it('зелье в слоте открывает свою запись', () => {
    const run = newRun('mage', 2);
    run.hero.potion = POTION_IDS[0];
    expect(loadoutFinds(run.hero)).toContain(`potion:${POTION_IDS[0]}`);
  });

  it('артефакт открывает ровно тот тир, каким он был у героя', () => {
    const run = newRun('warrior', 3);
    addArtifact(run.hero, { id: 'fireball', tier: 2 });
    const keys = loadoutFinds(run.hero);
    expect(keys).toContain('art:fireball@2');
    expect(keys).not.toContain('art:fireball@1');
    expect(keys).not.toContain('art:fireball@3');

    // Дубликат поднял тир — открывается и он, а прежний остаётся открытым в профиле.
    addArtifact(run.hero, { id: 'fireball', tier: 1 });
    expect(loadoutFinds(run.hero)).toContain('art:fireball@3');
  });
});

describe('состояние записи', () => {
  const art = collectible('art:fireball')!;
  const gear = collectible(`weapon:${dropBases('weapon')[0].id}`)!;

  it('артефакт открыт с любого найденного тира, закрытые тиры спрятаны', () => {
    const st = foundState(new Set(['art:fireball@2']), art);
    expect(st.open).toBe(true);
    expect(st.tiers).toEqual([false, true, false]);
    const lines = collectibleLines(art, st);
    expect(lines).toHaveLength(ART_TIERS.length);
    expect(lines[0]).toBe('Тир 1: ???');
    expect(lines[1]).toContain(art.tiers![1]);
    expect(lines[2]).toBe('Тир 3: ???');
  });

  it('ненайденная запись закрыта', () => {
    expect(foundState(new Set<string>(), art).open).toBe(false);
    expect(foundState(new Set<string>(), gear).open).toBe(false);
  });

  it('у экипировки и зелий тиров нет — запись открывается целиком', () => {
    const st = foundState(new Set([gear.id]), gear);
    expect(st.open).toBe(true);
    expect(st.tiers).toEqual([]);
    expect(collectibleLines(gear, st)).toEqual(gear.desc.split('\n'));
  });
});

describe('перенос старого профиля', () => {
  it('артефакт без тира (находка из сундука) становится всеми тремя тирами', () => {
    expect(migrateFinds(['art:fireball'])).toEqual(['art:fireball@1', 'art:fireball@2', 'art:fireball@3']);
  });

  it('ключи с тиром и записи без тиров не трогаются, дубликаты схлопываются', () => {
    expect(migrateFinds(['weapon:sword', 'art:fireball@2', 'weapon:sword'])).toEqual(['weapon:sword', 'art:fireball@2']);
  });
});
