import { button, h } from '../dom';
import { heroDef } from '../../data/heroes';
import { potionDef } from '../../data/potions';
import { defendBlock } from '../../engine/combat';
import { heroStats } from '../../engine/run';
import type { DerivedStats } from '../../engine/types';
import { artifactChip, artifactTitle, bar, potionChip, setCounters, skillLine } from '../components';
import { innateOf, socketedArtifacts } from '../../engine/stats';
import { artifactDef } from '../../data/artifacts';
import { traitDef } from '../../data/traits';
import { gearTile } from '../gearTile';
import { heroAvatar } from '../heroSprite';
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
    row('Дальность', s.sweep ? 'весь ряд' : s.reachAny ? 'любая цель' : 'первый в ряду', 'Кого достают удар и физические приёмы: ближнее оружие бьёт только первого в ряду, дальнее, магическое и копьё — любого врага, плеть хлещет весь ряд. Заклинания и склянки достают любого всегда. Три точки на карточке оружия — тот же маркер'),
    row('Крит', `${pct(s.crit)}`, 'Шанс критического удара'),
    row('Крит. урон', `${s.critDmg} %`, 'Сколько процентов обычного урона наносит критический удар'),
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
    s.critOnlySure ? row('Хладнокровие', 'крит наверняка', 'Случайного крита нет: критуют только удары из тени, по оглушённым и с Верным глазом') : null,
    s.critSta ? row('Крит даёт STA', `+${s.critSta}`, 'Набор «Тень» 3/3: крит возвращает стамину, раз в ход') : null,
    s.onHitCold ? row('Холод с удара', `${s.onHitCold} за ход`, 'Столько первых ударов оружием за ход вешают Холод 1') : null,
    s.coldAdd ? row('Сила холода', `+${s.coldAdd}`, 'Каждый Холод, который вешает герой, сильнее: набор «Холод»') : null,
    s.frozenLong ? row('Вечная мерзлота', '2 хода', 'Оцепенение держит два хода; удары по оцепеневшему слабее на 30 %') : null,
    s.freezeVuln ? row('Лёд открывает', 'Уязвимость', 'Набор «Холод» 3/3: оцепеневший враг получает Уязвимость на 2 хода') : null,
  ];
  return rows.filter((r): r is HTMLElement => !!r);
}

/** Врождённый навык и черта (v0.44): одна строка — чип навыка с уровнем и имя черты, описания в подсказках. */
function innateLine(hero: import('../../engine/types').HeroPersistent): HTMLElement | null {
  const innate = innateOf(hero);
  if (!innate) return null;
  const trait = hero.trait ? traitDef(hero.trait) : null;
  return h(
    'div',
    { class: 'sheet-innate' },
    artifactChip(innate),
    h(
      'div',
      null,
      h('div', { tip: `${artifactTitle(innate)}\nВрождённый навык: не занимает сокет, уровень = номер локации` }, `Навык: ${artifactDef(innate.id).name}, ур. ${innate.tier}`),
      trait ? h('div', { class: 'trait-name', tip: trait.describe(innate.tier) }, `Черта: ${trait.name}`) : null,
    ),
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
        h('div', { class: 'sheet-head' }, heroAvatar(def.id, 80), h('div', null, h('div', { class: 'sheet-name' }, def.name), h('div', { class: 'sheet-role' }, def.role))),
        bar('hp', hp, s.maxHp, 'HP'),
        innateLine(run.hero),
        setCounters([...socketedArtifacts(run.hero.weapon, run.hero.armor), ...(innateOf(run.hero) ? [innateOf(run.hero)!] : [])]),
        h('div', { class: 'sheet-stats' }, ...statRows(s, hp)),
        skillLine(def),
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
