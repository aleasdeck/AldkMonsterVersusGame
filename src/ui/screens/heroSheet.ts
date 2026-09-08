import { button, h } from '../dom';
import { heroDef } from '../../data/heroes';
import { potionDef } from '../../data/potions';
import { ARMOR_TYPE_GLYPHS, ARMOR_TYPE_NAMES, MASTERY_MULT, MASTERY_NAMES, WEAPON_TYPE_GLYPHS, WEAPON_TYPE_NAMES, weaponTypeHint } from '../../data/gear';
import { defendBlock } from '../../engine/combat';
import { heroStats } from '../../engine/run';
import type { ArmorType, DerivedStats, WeaponType } from '../../engine/types';
import { bar, potionChip } from '../components';
import { gearTile } from '../gearTile';
import { spriteImg } from '../sprites';
import type { App } from '../app';

/** Статы полными словами; строки с нулевым значением не показываются. */
function statRows(s: DerivedStats, hp: number): HTMLElement[] {
  const row = (k: string, v: string, tip: string) => h('div', { class: 'stat', tip }, h('span', { class: 'stat-k' }, k), h('span', { class: 'stat-v' }, v));
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const rows: (HTMLElement | null)[] = [
    row('Здоровье', `${hp}/${s.maxHp}`, 'Текущее и максимальное HP. Максимум растёт от брони и артефактов'),
    row('Урон', `${s.dmgMin + s.str}–${s.dmgMax + s.str}`, 'Урон базовой атаки: кубик оружия в руках героя + Сила'),
    row('Защита', `${s.def}${s.defendBonus ? ` (+${s.defendBonus})` : ''}`, `«Защититься» даёт 80 % от Защиты и бонуса брони, округление вверх: +${defendBlock(s)} блока`),
    row('Стамина', `${s.sta}${s.firstTurnSta ? ` (+${s.firstTurnSta} в первый ход)` : ''}`, 'Очки действий за ход, полностью восстанавливаются в начале хода'),
    s.maxMp ? row('Мана', `${s.maxMp}${s.mpRegen ? ` (+${s.mpRegen} за ход)` : ''}`, 'Мана и реген за ход; полностью — после комнаты') : null,
    row('Усталость', `−${Math.round((1 - s.fatigue) * 100)} %`, 'На столько слабее каждая следующая атака в этом ходу'),
    s.crit ? row('Крит', `${pct(s.crit)} (×${s.critMult})`, 'Шанс критического удара и его множитель') : null,
    s.firstHit ? row('Первый удар', `+${s.firstHit}`, 'Бонус урона первого удара в ходу') : null,
    s.spellPower ? row('Сила заклинаний', `+${s.spellPower}`, 'Бонус к урону заклинаний') : null,
    s.thorns ? row('Шипы', `${s.thorns}`, 'Урон атакующему врагу') : null,
    s.lifesteal ? row('Вампиризм', `${s.lifesteal}`, 'Лечение при базовой атаке') : null,
    s.regen ? row('Регенерация', `${s.regen}`, 'HP в начале хода') : null,
    s.hitReduce ? row('Гашение удара', `−${s.hitReduce}`, 'На столько слабее каждый удар врага по герою, до блока') : null,
    s.blockKeep ? row('Стойкий блок', `${s.blockKeep}`, 'Столько блока переживает начало хода') : null,
  ];
  return rows.filter((r): r is HTMLElement => !!r);
}

/** Умения владения оружием и ношения брони — полными названиями, цвет как у иконок. */
function skills(def: ReturnType<typeof heroDef>): HTMLElement {
  const weapons: WeaponType[] = ['melee', 'ranged', 'magic'];
  const armors: ArmorType[] = ['heavy', 'medium', 'light'];
  return h(
    'div',
    { class: 'sheet-skills' },
    h('div', { class: 'sheet-sub' }, 'Оружие'),
    ...weapons.map((t) => {
      const m = def.mastery[t];
      return h(
        'div',
        { class: 'skill-row', tip: `Свойство типа: ${weaponTypeHint(t)}` },
        h('span', { class: `mastery-${m}` }, WEAPON_TYPE_GLYPHS[t]),
        h('span', null, WEAPON_TYPE_NAMES[t]),
        h('span', { class: `skill-val mastery-${m}` }, `${MASTERY_NAMES[m]} · ${Math.round(MASTERY_MULT[m] * 100)} %`),
      );
    }),
    h('div', { class: 'sheet-sub' }, 'Броня'),
    ...armors.map((t) => {
      const ok = def.armorSkill[t];
      return h(
        'div',
        { class: 'skill-row', tip: ok ? 'Умеет носить: перк базы работает' : 'Не умеет: перк базы не работает, DEF, HP и аффикс остаются' },
        h('span', { class: ok ? 'skill-yes' : 'skill-no' }, ARMOR_TYPE_GLYPHS[t]),
        h('span', null, ARMOR_TYPE_NAMES[t]),
        h('span', { class: `skill-val ${ok ? 'skill-yes' : 'skill-no'}` }, ok ? 'умеет' : 'не умеет'),
      );
    }),
  );
}

/**
 * Оверлей «Персонаж»: слева портрет, роль, HP и статы полными словами, умения; справа экипировка с сокетами
 * и описаниями артефактов. Открывается с любого экрана забега, включая бой; в бою статы — боевые.
 */
export function heroSheet(app: App): HTMLElement {
  const run = app.run!;
  const def = heroDef(run.hero.defId);
  const b = run.phase === 'battle' ? run.battle : null;
  const s = b ? b.hero.stats : heroStats(run);
  const hp = b ? b.hero.hp : run.hero.hp;
  const potion = b ? b.hero.potion : run.hero.potion;
  return h(
    'div',
    { class: 'overlay sheet-overlay', onclick: (ev: MouseEvent) => ev.target === ev.currentTarget && app.toggleSheet() },
    h(
      'div',
      { class: 'panel sheet' },
      button('✕', () => app.toggleSheet(), { class: 'small sheet-close', tip: 'Закрыть (Esc)' }),
      h(
        'div',
        { class: 'sheet-left' },
        h('div', { class: 'sheet-head' }, spriteImg(def.sprite, def.id, 80, 'bob'), h('div', null, h('div', { class: 'sheet-name' }, def.name), h('div', { class: 'sheet-role' }, def.role))),
        bar('hp', hp, s.maxHp, 'HP'),
        h('div', { class: 'sheet-stats' }, ...statRows(s, hp)),
        skills(def),
        h(
          'div',
          { class: 'sheet-potion' },
          potionChip(potion),
          potion ? h('span', null, h('span', { class: 'potion-name' }, potionDef(potion).name), h('span', { class: 'dim' }, ` · ${potionDef(potion).describe}`)) : h('span', { class: 'dim' }, 'слот зелья пуст'),
        ),
      ),
      h('div', { class: 'sheet-right' }, gearTile(run.hero.weapon, def, s, { expanded: true }), gearTile(run.hero.armor, def, s, { expanded: true })),
    ),
  );
}
