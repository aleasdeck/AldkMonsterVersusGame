import { describe, expect, it } from 'vitest';
import { COLLECTIBLES, COLLECTIBLE_IDS, PRIZE_INDEX, STRIP_LEN, buildChestStrip, collectible, lockedIds, rollCollectible } from '../src/data/collection';
import { ARTIFACT_IDS } from '../src/data/artifacts';
import { gearBases } from '../src/data/gear';
import { createRng } from '../src/engine/rng';

describe('каталог находок', () => {
  it('содержит все артефакты и все базы экипировки, id уникальны', () => {
    const expected = ARTIFACT_IDS.length + gearBases('weapon').length + gearBases('armor').length;
    expect(COLLECTIBLES.length).toBe(expected);
    expect(new Set(COLLECTIBLE_IDS).size).toBe(expected);
    for (const id of ARTIFACT_IDS) expect(collectible(`art:${id}`)).not.toBeNull();
    for (const b of gearBases('weapon')) expect(collectible(`weapon:${b.id}`)).not.toBeNull();
    for (const b of gearBases('armor')) expect(collectible(`armor:${b.id}`)).not.toBeNull();
  });

  it('у каждой записи есть имя, подпись и описание', () => {
    for (const c of COLLECTIBLES) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.sub.length).toBeGreaterThan(0);
      expect(c.desc.length).toBeGreaterThan(0);
    }
  });
});

describe('сундук', () => {
  it('никогда не выдаёт уже найденное и в итоге отдаёт весь каталог', () => {
    const rng = createRng(7);
    const unlocked: string[] = [];
    for (let i = 0; i < COLLECTIBLES.length; i++) {
      const prize = rollCollectible(rng, unlocked);
      expect(prize).not.toBeNull();
      expect(unlocked).not.toContain(prize);
      unlocked.push(prize!);
    }
    expect(new Set(unlocked).size).toBe(COLLECTIBLES.length);
    expect(lockedIds(unlocked)).toEqual([]);
  });

  it('на собранной коллекции приза нет', () => {
    expect(rollCollectible(createRng(1), COLLECTIBLE_IDS)).toBeNull();
  });

  it('лента крутки содержит приз на фиксированном месте', () => {
    const strip = buildChestStrip(createRng(42), 'art:fireball');
    expect(strip.length).toBe(STRIP_LEN);
    expect(strip[PRIZE_INDEX]).toBe('art:fireball');
    for (const id of strip) expect(collectible(id)).not.toBeNull();
  });
});
