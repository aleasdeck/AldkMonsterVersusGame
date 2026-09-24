import { button, h } from '../dom';
import { heroDef } from '../../data/heroes';
import { potionDef } from '../../data/potions';
import { defendBlock, rangeText, restAttackRange } from '../../engine/combat';
import { heroStats } from '../../engine/run';
import type { DerivedStats, HeroDef, HeroPersistent } from '../../engine/types';
import { artifactTip, bar, hpTip, potionChip, setCounters } from '../components';
import { innateOf, socketedArtifacts } from '../../engine/stats';
import { artifactDef } from '../../data/artifacts';
import { traitDef } from '../../data/traits';
import { ART_TIER_COLORS } from '../../data/gear';
import { armorSkillTip, sheetGearTile, weaponSkillTip } from '../cards';
import { uiIcon, type UiIconId } from '../icons';
import { heroAvatar } from '../heroSprite';
import { traitTip } from '../console';
import { paramTip } from '../tips';
import type { TipFn } from '../dom';
import type { App } from '../app';

// ─── Оверлей «Персонаж» (v0.50) ────────────────────────────────────────────
// Слева — кто это: портрет, HP, главные статы плитками (как на выборе героя), навык и черта, наборы, особые свойства строками,
// владение значками и зелье. Справа — экипировка в грамматике карточек (cards.ts: sheetGearTile).

/**
 * Главные статы плитками в две колонки: значок, число, подпись; как считается — в подсказке. Урон — тем же расчётом, что число
 * карточки и плитки боя (restAttackRange: с ключевой вещью «удар оружием»); дальности здесь нет — её показывают точки у оружия.
 */
function statTiles(s: DerivedStats): HTMLElement {
  const tile = (icon: UiIconId, value: string, label: string, tip: string) =>
    h('div', { class: 'sheet-stat', tip: paramTip(icon, label.charAt(0).toUpperCase() + label.slice(1), tip, { aside: h('b', { class: 'tip-val' }, value) }) }, uiIcon(icon, 16), h('b', null, value), h('small', null, label));
  return h(
    'div',
    { class: 'sheet-stat-grid' },
    tile('dmg', rangeText(restAttackRange(s)), 'урон', 'Урон базовой атаки: кубик оружия в руках героя + Сила'),
    tile('def', s.defendBonus ? `${s.def}+${s.defendBonus}` : `${s.def}`, 'защита', `Защита${s.defendBonus ? ' и бонус брони к «Защититься»' : ''}: «Защититься» даёт 80 % от неё блоком, округление вверх`),
    tile('sta', s.firstTurnSta ? `${s.sta}+${s.firstTurnSta}` : `${s.sta}`, 'стамина', `Очки действий за ход, полностью восстанавливаются в начале хода${s.firstTurnSta ? `; в первый ход боя ещё +${s.firstTurnSta}` : ''}`),
    tile('mp', s.mpRegen ? `${s.maxMp}+${s.mpRegen}` : `${s.maxMp}`, 'мана', 'Мана и реген за ход; полностью — после комнаты'),
    tile('block', `+${defendBlock(s)}`, 'блок', '«Защититься»: столько блока до начала следующего хода'),
    tile('fatigue', `−${Math.round((1 - s.fatigue) * 100)}%`, 'усталость', 'На столько слабее каждая следующая атака в этом ходу'),
    tile('crit', `${Math.round(s.crit * 100)}%`, 'крит', 'Шанс критического удара'),
    tile('critDmg', `${s.critDmg}%`, 'крит. урон', 'Сколько процентов обычного урона наносит критический удар'),
  );
}

/** Особые свойства полными словами — всё, чего нет в плитках; строки с нулевым значением не показываются. */
function statRows(s: DerivedStats): HTMLElement[] {
  const row = (k: string, v: string, tip: string) => h('div', { class: 'stat', tip: paramTip(null, k, tip, { aside: h('b', { class: 'tip-val' }, v) }) }, h('span', { class: 'stat-k' }, k), h('span', { class: 'stat-v' }, v));
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const rows: (HTMLElement | null)[] = [
    s.critRamp ? row('Азарт', `+${pct(s.critRamp)}`, 'Столько шанса крита копится с каждого удара без крита; крит сбрасывает') : null,
    s.executeCrit ? row('Добивание', `+${pct(s.executeCrit)}`, 'Прибавка к шансу крита по врагу ниже 20 % HP') : null,
    s.critHeal ? row('Крит лечит', `${s.critHeal}`, 'HP за каждый критический удар') : null,
    s.firstHit ? row('Первый удар', `+${s.firstHit}`, 'Бонус урона первого удара в ходу') : null,
    s.spellPower ? row('Сила заклинаний', `+${s.spellPower}`, 'Бонус к урону заклинаний') : null,
    s.thorns ? row('Шипы', `${s.thorns}`, 'Урон атакующему врагу') : null,
    s.lifesteal ? row('Вампиризм', `${s.lifesteal}`, 'Лечение при базовой атаке') : null,
    s.onHitBleed ? row('Кровь с удара', `${s.onHitBleed}`, 'Кровотечение с каждого удара на 2 хода') : null,
    s.onHitBurn ? row('Горение с удара', `${s.onHitBurn}`, 'Горение с каждого удара на 2 хода') : null,
    s.onHitPoison ? row('Яд с удара', `${s.onHitPoison}`, 'Яд с каждого удара на 3 хода') : null,
    s.regen ? row('Регенерация', `${s.regen}`, 'HP в начале хода') : null,
    s.hitReduce ? row('Гашение удара', `−${s.hitReduce}`, 'На столько слабее каждый удар врага по герою, до блока') : null,
    s.dotReduce ? row('Гашение ран', `−${s.dotReduce}`, 'На столько слабее общий тик Кровотечения, Горения и Яда на герое за ход; сами раны остаются висеть') : null,
    s.riposte ? row('Ответный удар', `${s.riposte} %`, 'Когда блок гасит удар врага, ударивший получает столько процентов среднего урона оружия с Силой, раз за его ход') : null,
    s.lowHpStr || s.lowHpSta || s.lowHpReduce
      ? row('Боевой транс', [s.lowHpStr ? `+${s.lowHpStr} Сила` : '', s.lowHpSta ? `+${s.lowHpSta} STA` : '', s.lowHpReduce ? `−${s.lowHpReduce} удар` : ''].filter(Boolean).join(', '), 'Пока HP ниже половины: Сила, стамина в начале хода и гашение каждого удара врага')
      : null,
    s.blockKeep ? row('Стойкий блок', `${s.blockKeep}`, 'Столько блока переживает начало хода') : null,
    // Архетипы и ключевые вещи (v0.43).
    s.strikeMult ? row('Удар оружием', `${Math.round(s.strikeMult * 100)} %`, 'Ключевая вещь: на столько слабее каждый удар оружием') : null,
    s.vsBleed ? row('По крови', `+${pct(s.vsBleed)}`, 'На столько сильнее удар оружием по кровоточащей цели') : null,
    s.bleedAdd || s.bleedMult ? row('Сила крови', [s.bleedAdd ? `+${s.bleedAdd}` : '', s.bleedMult ? `×${1 + s.bleedMult}` : ''].filter(Boolean).join(' '), 'Каждое Кровотечение, которое вешает герой: прибавка набора «Кровь» и множитель «Клятвы крови» (вверх)') : null,
    s.bleedTwice ? row('Кровь тикает', 'дважды', 'Набор «Кровь» 3/3: Кровотечение на врагах тикает в их ход и ещё раз перед вашим') : null,
    s.burnAdd ? row('Сила огня', `+${s.burnAdd}`, 'Каждое Горение, которое вешает герой, сильнее: набор «Огонь»') : null,
    s.burnSpread ? row('Пожар', 'да', 'Набор «Огонь» 3/3: погибший горящий враг поджигает остальных своим Горением') : null,
    s.spellIgniteAll ? row('Заклинания жгут', `${s.spellIgniteAll}`, '«Пироман»: каждое заклинание вешает Горение всем врагам на 2 хода') : null,
    s.burnImmune || s.blockPerBurning ? row('Жаропрочность', s.blockPerBurning ? `+${s.blockPerBurning} блока` : 'да', 'Горение на вас не держится; блок в начале хода за каждого горящего врага') : null,
    // Архетипы v0.47: бонусы наборов и ключевые вещи.
    s.poisonAdd ? row('Сила яда', `+${s.poisonAdd}`, 'Каждый Яд, который вешает герой, сильнее: набор «Яд»') : null,
    s.poisonNoDecay ? row('Яд бессрочный', 'да', '«Токсиколог»: ваш Яд не спадает по сроку') : null,
    s.poisonWeaken ? row('Яд ослабляет', `−${pct(s.poisonWeaken)}`, 'Набор «Яд» 3/3: отравленный враг бьёт настолько слабее') : null,
    s.blockSkillAdd ? row('Блок приёмов', `+${s.blockSkillAdd}`, 'Набор «Щит»: «Защититься» и каждый приём с блоком дают больше') : null,
    s.blockToDmg ? row('Удар щитом', `+${pct(s.blockToDmg)} блока`, 'Набор «Щит» 3/3: удар оружием сильнее на долю текущего Блока') : null,
    s.maxHpPct ? row('Здоровье ключевой', `${Math.round(s.maxHpPct * 100)} %`, 'Ключевая вещь: максимум HP меньше на эту долю') : null,
    s.thornsAll ? row('Шипы по всем', 'да', 'Набор «Возмездие» 3/3: Шипы колют всех врагов, а не только ударившего') : null,
    s.hitStr ? row('Мученик', `+${s.hitStr} Сила за удар`, 'Лечение не действует; каждый удар врага, дошедший до HP, даёт Силу до конца боя') : null,
    s.healAdd || s.healMult ? row('Сила лечения', [s.healAdd ? `+${s.healAdd}` : '', s.healMult ? `×${1 + s.healMult}` : ''].filter(Boolean).join(' '), 'Каждое лечение героя: прибавка набора «Свет» и множитель «Обета»') : null,
    s.healSmite ? row('Свет жжёт', 'да', 'Набор «Свет» 3/3: каждое лечение наносит столько же урона первому врагу, мимо блока (не добивает)') : null,
    s.overhealBlock ? row('Избыток в блок', pct(s.overhealBlock), 'Такая доля лечения сверх максимума HP становится Блоком') : null,
    s.momentum ? row('Разгон', `+${s.momentum} за удар`, 'Каждый удар оружием сильнее на столько за каждый уже сделанный в этом ходу удар') : null,
    s.noDefend ? row('Безрассудство', 'без защиты', '«Защититься» недоступно; усталости нет') : null,
    s.thirdFree ? row('Третий удар', 'без STA', 'Набор «Серия» 3/3: каждый третий удар в ходу возвращает стамину') : null,
    s.critOnlySure ? row('Хладнокровие', 'крит наверняка', 'Случайного крита нет, только верный: удары из тени, по оглушённым и оцепеневшим, с Верным глазом и приёмы «всегда крит»') : null,
    s.critSta ? row('Крит даёт STA', `+${s.critSta}`, 'Набор «Тень» 3/3: крит возвращает стамину, раз в ход') : null,
    s.onHitCold ? row('Холод с удара', `${s.onHitCold} за ход`, 'Столько первых ударов оружием за ход вешают Холод 1') : null,
    s.coldAdd ? row('Сила холода', `+${s.coldAdd}`, 'Каждый Холод, который вешает герой, сильнее: набор «Холод»') : null,
    s.frozenLong ? row('Вечная мерзлота', '2 хода', 'Оцепенение держит два хода; удары по оцепеневшему слабее на 30 %') : null,
    s.freezeVuln ? row('Лёд открывает', 'Уязвимость', 'Набор «Холод» 3/3: оцепеневший враг получает Уязвимость на 2 хода') : null,
  ];
  return rows.filter((r): r is HTMLElement => !!r);
}

/**
 * Врождённый навык и черта (v0.44): навык — глиф в рамке цвета уровня (та же шкала, что тиры), имя и уровень; черта — звезда и имя.
 * Описания — в подсказках.
 */
function innateBlock(hero: HeroPersistent): HTMLElement | null {
  const innate = innateOf(hero);
  if (!innate) return null;
  const def = artifactDef(innate.id);
  const color = ART_TIER_COLORS[innate.tier];
  const trait = hero.trait ? traitDef(hero.trait) : null;
  return h(
    'div',
    { class: 'sheet-innate' },
    h(
      'div',
      { class: 'sheet-innate-row', tip: artifactTip(innate, { note: 'Врождённый навык: не занимает сокет, уровень = номер локации' }) },
      h('span', { class: 'item-icon', style: `border-color:${color}` }, h('span', { class: 'item-glyph', style: `color:${color}` }, def.glyph)),
      h('span', null, h('span', { class: 'dim' }, 'Навык '), def.name, h('span', { class: 'dim' }, ` · ур. ${innate.tier}`)),
    ),
    trait
      ? h('div', { class: 'sheet-innate-row', tip: traitTip(trait, innate.tier) }, h('span', { class: 'item-icon' }, uiIcon('star', 16)), h('span', null, h('span', { class: 'dim' }, 'Черта '), h('span', { class: 'trait-name' }, trait.name)))
      : null,
  );
}

/**
 * Владение оружием и умение носить броню значками в одну строку — те же типы, что на выборе героя: своё в зелёной рамке,
 * чужое тускло в красной. Названия и что даёт владение — в подсказке значка.
 */
function proficiency(def: HeroDef): HTMLElement {
  const chip = (icon: UiIconId, ok: boolean, tip: TipFn) => h('span', { class: `prof-mini ${ok ? 'yes' : 'no'}`, tip }, uiIcon(icon, 16));
  return h(
    'div',
    { class: 'sheet-prof' },
    h('span', { class: 'dim' }, 'Оружие'),
    ...(['melee', 'ranged', 'magic'] as const).map((t) => chip(t, def.weaponSkill[t], weaponSkillTip(t, def.weaponSkill[t]))),
    h('span', { class: 'dim sheet-prof-gap' }, 'Броня'),
    ...(['heavy', 'medium', 'light'] as const).map((t) => chip(t, def.armorSkill[t], armorSkillTip(t, def.armorSkill[t]))),
  );
}

/** Оверлей «Персонаж»: открывается с любого экрана забега, включая бой; в бою статы — боевые. */
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
        h('div', { class: 'sheet-head' }, heroAvatar(def.id, 80), h('div', null, h('div', { class: 'sheet-name' }, def.name), h('div', { class: 'sheet-role' }, def.role))),
        bar('hp', hp, s.maxHp, 'HP', hpTip(hp, s.maxHp, b?.hero.block ?? 0, true), b?.hero.block ?? 0),
        statTiles(s),
        innateBlock(run.hero),
        setCounters([...socketedArtifacts(run.hero.weapon, run.hero.armor), ...(innateOf(run.hero) ? [innateOf(run.hero)!] : [])]),
        h('div', { class: 'sheet-stats' }, ...statRows(s)),
        proficiency(def),
        h(
          'div',
          { class: 'sheet-potion' },
          potionChip(potion),
          potion ? h('span', null, h('span', { class: 'potion-name' }, potionDef(potion).name), h('span', { class: 'dim' }, ` · ${potionDef(potion).describe}`)) : h('span', { class: 'dim' }, 'слот зелья пуст'),
        ),
      ),
      h('div', { class: 'sheet-right' }, sheetGearTile(run.hero.weapon, def, s, run), sheetGearTile(run.hero.armor, def, s, run)),
    ),
  );
}
