import type { BattleState, EnemyState, GearInstance, LootItem, RunState } from '../../engine/types';
import { canUseAction, computeIntent } from '../../engine/combat';
import { canPlaceArtifact, slotKindAt } from '../../engine/equipment';
import { artifactPrice, gearPrice } from '../../engine/loot';
import { awaitsFocus, canReroll, chestClosed, heroStats } from '../../engine/run';
import { innateOf, socketedArtifacts } from '../../engine/stats';
import { archetypeCounts, artifactTags } from '../../data/archetypes';
import { artifactDef } from '../../data/artifacts';
import { PHASE_SHIFT } from '../../data/enemies';
import { canWearArmor, canWieldWeapon } from '../../data/gear';
import { heroDef } from '../../data/heroes';

/**
 * Мысли Воина в обучении (v0.58.0, страница обсуждения — tools/tutorial-proto/obuchenie.html, тексты оттуда): герой думает
 * о мире — о волках, щите и усталой руке, — а не об интерфейсе; связь слов с экраном держит подсветка (`point`). Каждая мысль
 * приходит один раз за обучение, когда её условие впервые выполнилось. Условия читают только забег и то, что видно на экране,
 * поэтому их можно проверять без DOM (tests/tutorial.test.ts); узлы для подсветки ищет контроллер (index.ts) через `Finder`.
 */

/** Что сейчас на экране забега: от этого зависит, какие мысли уместны и где стоит облачко. */
export type ThoughtView = 'map' | 'battle' | 'pool' | 'reward' | 'placing' | 'shop' | 'event' | 'camp' | 'end';

/** Снимок хода героя: конец прошлого хода — для реакций на то, что сделали враги. */
export interface TurnSnap {
  turn: number;
  hp: number;
  sta: number;
  block: number;
  defended: boolean;
  /** Намерения врагов на ход, который начался после этого снимка. */
  intents: Record<number, string>;
  uids: number[];
}

export interface ThoughtCtx {
  run: RunState;
  view: ThoughtView;
  /** Выбранный приём (`App.armed`) и кого он достаёт. */
  armed: string | null;
  armedTargets: number[] | null;
  /** Сколько мс бой стоит без изменений — «выдохся и не заканчивает ход». */
  idleMs: number;
  /** Конец прошлого хода героя в этом бою. */
  prev: TurnSnap | null;
  /** Броня, снятая последней сменой: оберег переехал в новую. */
  armorSwap: { from: GearInstance; to: GearInstance } | null;
}

/** Поиск узлов для подсветки: контроллер отдаёт его точкам мыслей. */
export interface Finder {
  all(sel: string): Element[];
  /** Плитка приёма по имени («Ударить», «Защита», «Щитовой удар»). */
  tile(name: string): Element[];
  /** Узлы внутри врага с этим uid; без селектора — сам враг. */
  enemy(uid: number, sel?: string): Element[];
  /** Узлы внутри карточки награды по её номеру; без селектора — сама карточка. */
  card(i: number, sel?: string): Element[];
  /** Строка таблицы артефакта в карточке, где есть это слово («набор», «дубликат»). */
  cardRow(i: number, word: string): Element[];
  /** Кнопка по началу надписи. */
  button(text: string): Element[];
}

export interface Thought {
  id: string;
  text: string;
  when: (c: ThoughtCtx) => boolean;
  /** Что подсветить, пока мысль на экране. */
  point?: (c: ThoughtCtx, f: Finder) => Element[];
  /** Приходит только после этой мысли — «следом». */
  after?: string;
  /** Реакция на то, что уже случилось: без подсветки и вне очереди. */
  react?: boolean;
  /** Про то, что случится в этот же ход: вне очереди и сокращает прошлую мысль. */
  urgent?: boolean;
}

// ─── Чтение забега ─────────────────────────────────────────────────────────

/** Бой в ход героя: большинство мыслей боя — про его ход. */
function turn(c: ThoughtCtx): BattleState | null {
  const b = c.view === 'battle' ? c.run.battle : null;
  return b && b.phase === 'player' ? b : null;
}

/** Первый ход боя на этой клетке, герой ещё ничего не сделал. */
function opening(c: ThoughtCtx, room: number): boolean {
  const b = turn(c);
  return !!b && c.run.roomIndex === room && b.turn === 1 && b.hero.attacks === 0 && !b.hero.defended && b.hero.sta === b.hero.maxSta;
}

const foe = (b: BattleState, defId: string, intent?: string): EnemyState | undefined => b.enemies.find((e) => e.defId === defId && (!intent || e.intent === intent));
const hasStatus = (statuses: { id: string }[], id: string) => statuses.some((st) => st.id === id);

/** Прошлый ход героя только что кончился: реакции — на ход врагов между ними. */
function afterEnemies(c: ThoughtCtx, b: BattleState): TurnSnap | null {
  return c.prev && c.prev.turn === b.turn - 1 ? c.prev : null;
}

/** Сколько вещей «Щита» у героя: вставленные и врождённый Щитовой удар. */
function shieldCount(run: RunState): number {
  const innate = innateOf(run.hero);
  return archetypeCounts([...socketedArtifacts(run.hero.weapon, run.hero.armor), ...(innate ? [innate] : [])]).shield ?? 0;
}

/** Карточки награды (без экрана пула и без зелья — у него своя мысль). */
function options(c: ThoughtCtx): LootItem[] {
  return c.view === 'reward' ? (c.run.rewards[0]?.options ?? []) : [];
}

function optionAt(c: ThoughtCtx, test: (item: LootItem) => boolean): number {
  return options(c).findIndex(test);
}

const gearOpt = (test: (g: GearInstance) => boolean) => (item: LootItem) => item.kind === 'gear' && test(item.gear);
const artOpt = (test: (id: string) => boolean) => (item: LootItem) => item.kind === 'artifact' && test(item.artifact.id);

/** Карточка-тройка с этим условием есть: и мысль, и её подсветка ищут одну и ту же карточку. */
function cardThought(test: (item: LootItem, c: ThoughtCtx) => boolean, sel: (i: number, f: Finder) => Element[]): Pick<Thought, 'when' | 'point'> {
  return {
    when: (c) => optionAt(c, (item) => test(item, c)) >= 0,
    point: (c, f) => sel(optionAt(c, (item) => test(item, c)), f),
  };
}

const bow = gearOpt((g) => g.base === 'bow');
const robe = gearOpt((g) => g.base === 'robe');

/** Артефакт для доспеха ждёт гнезда: к оружию не встаёт, а в броне есть свободное подходящее гнездо. */
function armorCharmWaits(c: ThoughtCtx): boolean {
  const art = c.view === 'placing' ? c.run.pending?.artifacts[0] : null;
  if (!art || artifactDef(art.id).slot !== 'armor') return false;
  const { weapon, armor } = c.run.hero;
  const weaponRefuses = weapon.slots.every((_, i) => !!canPlaceArtifact(c.run.hero, 'weapon', i, art.id));
  const armorFree = armor.slots.some((a, i) => !a && slotKindAt(armor, i) !== 'weapon' && !canPlaceArtifact(c.run.hero, 'armor', i, art.id));
  return weaponRefuses && armorFree;
}

// ─── Мысли ─────────────────────────────────────────────────────────────────

export const THOUGHTS: Thought[] = [
  // Тропа: первая клетка карты.
  {
    id: 'p1',
    text: 'Тропа в чащу. Где-то в глубине — логово вожака, а по пути драки, развилки и кое-что похуже.',
    when: (c) => c.view === 'map' && c.run.roomIndex === 0,
    point: (_c, f) => f.all('.room-strip'),
  },
  {
    id: 'p2',
    after: 'p1',
    text: 'Ран пока нет, сил — на три дела за раз, а колдовства во мне на донышке.',
    when: (c) => c.view === 'map' && c.run.hero.hp >= heroStats(c.run).maxHp,
    point: (_c, f) => f.all('.c-hero .bar-hp, .c-hero .bar-sta, .c-hero .bar-mp'),
  },
  {
    id: 'p3',
    after: 'p2',
    text: 'В эфесе меча и в кольчуге — пустые гнёзда. Попадётся оберег — будет куда вставить.',
    when: (c) => c.view === 'map' && c.run.roomIndex === 0,
    point: (_c, f) => f.all('.c-gear .sock.empty'),
  },

  // Первый бой: волки.
  {
    id: 'b1',
    text: 'Два волка. Оба припали к земле — сейчас кинутся.',
    when: (c) => opening(c, 0),
    point: (_c, f) => f.all('.enemy .pill'),
  },
  {
    id: 'b2',
    after: 'b1',
    text: 'Взмахнуть мечом, прикрыться щитом — на три таких дела меня хватит. Потом надо перевести дух.',
    when: (c) => (turn(c)?.hero.sta ?? 0) > 0,
    point: (_c, f) => [...f.all('.c-hero .bar-sta'), ...f.all('.tiles .tile-cost')],
  },
  {
    id: 'b3',
    text: 'Ударил — и щит сам встал на место. Привычка.',
    when: (c) => {
      const b = turn(c);
      return !!b && b.hero.attacks >= 1 && b.hero.block > 0 && !b.hero.defended;
    },
    point: (_c, f) => f.all('.hero-zone .block-badge'),
  },
  {
    id: 'b4',
    text: 'Второй взмах уже слабее — рука тяжелеет. Третий выйдет совсем вялым.',
    when: (c) => (turn(c)?.hero.attacks ?? 0) >= 2,
    point: (_c, f) => [...f.all('.hero-zone .fatigue-badge'), ...f.tile('Ударить')],
  },
  {
    id: 'b5',
    urgent: true,
    text: 'Сил на одно дело. Добить — или встретить зубы щитом?',
    when: (c) => {
      const b = turn(c);
      return !!b && b.hero.sta === 1 && !b.hero.defended && b.enemies.some((e) => computeIntent(e, b).kinds.includes('attack'));
    },
    point: (_c, f) => f.tile('Защита'),
  },
  {
    id: 'b6',
    text: 'Всё, выдохся. Надо отдышаться — а там снова буду в полной силе.',
    when: (c) => turn(c)?.hero.sta === 0 && c.idleMs >= 3000,
    point: (_c, f) => f.all('.end-turn'),
  },
  {
    id: 'b7',
    text: 'Щит принял укус. Но держать его поднятым вечно не выйдет — опустил, и всё сначала.',
    when: (c) => {
      const b = turn(c);
      const prev = b && afterEnemies(c, b);
      return !!b && !!prev && prev.block > 0 && b.hero.block < prev.block;
    },
    point: (_c, f) => f.all('.hero-zone .sprite-wrap'),
  },
  {
    id: 'b8',
    urgent: true,
    text: 'Волк задрал морду — сейчас завоет, и стая озвереет.',
    when: (c) => {
      const b = turn(c);
      return !!b && !!foe(b, 'wolf', 'howl');
    },
    point: (c, f) => f.enemy(foe(c.run.battle!, 'wolf', 'howl')!.uid, '.pill'),
  },
  {
    id: 'r1',
    react: true,
    text: 'Зря медлил — мог бы ещё прикрыться щитом. Силы про запас не отложишь.',
    when: (c) => {
      const b = turn(c);
      const prev = b && afterEnemies(c, b);
      return !!b && !!prev && prev.sta >= 1 && !prev.defended && b.hero.hp < prev.hp;
    },
  },

  // Награды: пул, карточка, владение, тир.
  {
    id: 'n1',
    text: 'Что поискать среди трофеев — клинок получше или доспех покрепче?',
    when: (c) => c.view === 'pool',
    point: (_c, f) => f.all('.focus-card'),
  },
  {
    id: 'n2',
    text: 'Лук? Я из него и в сарай не попаду.',
    ...cardThought(
      (item, c) => bow(item) && item.kind === 'gear' && !canWieldWeapon(heroDef(c.run.hero.defId), item.gear),
      (i, f) => [...f.card(i, '.item-type'), ...f.card(i, '.prop-row.off')],
    ),
  },
  {
    id: 'n3',
    text: 'Роба колдуна. На мне она просто тряпка — разве что лишний слой.',
    ...cardThought(
      (item, c) => robe(item) && item.kind === 'gear' && !canWearArmor(heroDef(c.run.hero.defId), item.gear),
      (i, f) => [...f.card(i, '.item-type'), ...f.card(i, '.prop-row.off')],
    ),
  },
  {
    id: 'n4',
    text: 'Сталь добротнее моей, и гнёзд в ней два.',
    ...cardThought(
      (item, c) => item.kind === 'gear' && item.gear.tier === 2 && c.run.hero[item.gear.kind].tier === 1,
      (i, f) => [...f.card(i, '.item-name'), ...f.card(i, '.sock-icons')],
    ),
  },
  // Знаки вещей и наборы.
  {
    id: 'a1',
    text: 'Оберег для щитового боя — под стать моей выучке. Вдвоём они сработаются.',
    ...cardThought(
      (item, c) => artOpt((id) => artifactTags(id).includes('shield'))(item) && shieldCount(c.run) >= 1,
      (i, f) => [...f.card(i, '.arch-label'), ...f.cardRow(i, 'набор')],
    ),
  },
  {
    id: 'a2',
    text: 'Это для тех, кто пускает кровь: рана кровит ещё долго. Не мой путь — но кто знает.',
    ...cardThought(
      (item) => artOpt((id) => artifactTags(id).includes('blood'))(item),
      (i, f) => f.card(i, '.arch-label'),
    ),
  },
  {
    id: 'w1',
    text: 'Копьё. Достанет и того, кто прячется за первым.',
    ...cardThought(
      (item) => gearOpt((g) => g.base === 'spear')(item),
      (i, f) => f.card(i, '.reach-dots'),
    ),
  },
  {
    id: 'u1',
    text: 'Второй такой же оберег? Сложу их вместе — первый станет сильнее.',
    ...cardThought(
      (item, c) => artOpt((id) => socketedArtifacts(c.run.hero.weapon, c.run.hero.armor).some((a) => a.id === id && a.tier < 3))(item),
      (i, f) => f.cardRow(i, 'дубликат'),
    ),
  },
  {
    id: 'e5',
    text: 'Бастион. Щит больше не опустится — но и сам я стану хрупче. Дорогая сделка.',
    ...cardThought(
      (item) => artOpt((id) => id === 'bastion')(item),
      (i, f) => f.card(i),
    ),
  },
  {
    id: 'e6',
    text: 'Рунная сталь — лучше всего, что я держал в руках.',
    ...cardThought(
      (item) => item.kind === 'gear' && item.gear.tier === 3,
      (i, f) => f.card(i, '.item-name'),
    ),
  },
  {
    id: 'm5',
    text: 'Целебное зелье. За поясом место только для одной склянки — зато выпить можно прямо в драке.',
    when: (c) => c.view === 'reward' && c.run.rewards[0]?.source === 'potion',
    point: (_c, f) => f.all('.c-hero .potion-line'),
  },
  {
    id: 'q1',
    text: 'Ничего путного. За пять монет можно попытать удачу ещё раз.',
    when: (c) => c.view === 'reward' && c.run.rewards[0]?.source !== 'potion' && !canReroll(c.run),
    point: (_c, f) => f.button('Перебросить'),
  },
  {
    id: 'n5',
    text: 'Этот оберег — для доспеха, к клинку его не приладишь. В кольчуге как раз пусто.',
    when: armorCharmWaits,
    point: (_c, f) => f.all('.pl-sock'),
  },
  {
    id: 'n6',
    text: 'Новые латы — а оберег сам перебрался из старой кольчуги. Ничего не потерял.',
    when: (c) => {
      const swap = c.armorSwap;
      return !!swap && swap.to.base === 'plate' && swap.from.base === 'mail' && swap.from.slots.some(Boolean) && swap.to.slots.some(Boolean);
    },
    point: (_c, f) => f.all('.c-gear .hub-tile.armor'),
  },

  // Гоблин и лучник: дальность и роли.
  {
    id: 'd1',
    text: 'Гоблин впереди, лучник за ним. Мечом достану только того, кто ближе.',
    when: (c) => opening(c, 1),
    point: (c, f) => f.enemy(c.run.battle!.enemies[0].uid, '.sprite-wrap'),
  },
  {
    id: 'd2',
    urgent: true,
    text: 'До лучника не дотянуться — гоблин стоит на пути, да ещё и прикрывает его собой.',
    when: (c) => {
      const b = turn(c);
      const archer = b && foe(b, 'bandit_archer');
      return !!b && !!archer && b.enemies[0]?.defId === 'goblin' && !!c.armedTargets && !c.armedTargets.includes(archer.uid);
    },
    point: (c, f) => [...f.enemy(foe(c.run.battle!, 'bandit_archer')!.uid), ...f.all('.role-mark.covered'), ...f.all('.role-mark.role-guard')],
  },
  {
    id: 'd3',
    after: 'd1',
    text: 'Лучник держится позади и бьёт издалека. Такого надо вытащить к себе — или обойти.',
    when: (c) => {
      const b = turn(c);
      return !!b && !!foe(b, 'bandit_archer') && b.enemies[0]?.defId !== 'bandit_archer';
    },
    point: (_c, f) => f.all('.role-marks'),
  },
  {
    id: 'd4',
    text: 'Двину гоблина щитом — отлетит назад, и лучник окажется прямо передо мной.',
    when: (c) => {
      const b = turn(c);
      const first = b?.enemies[0];
      return !!b && first?.defId === 'goblin' && !!foe(b, 'bandit_archer') && canUseAction(b, { type: 'artifact', artifactId: 'shield_bash', target: first.uid }) === null;
    },
    point: (_c, f) => f.tile('Щитовой удар'),
  },
  {
    id: 'd5',
    text: 'Плечо гудит после такого удара. Пару вдохов — и снова смогу.',
    when: (c) => (turn(c)?.hero.cooldowns.shield_bash ?? 0) > 0,
    point: (_c, f) => f.tile('Щитовой удар'),
  },
  {
    id: 'd6',
    text: 'Гоблин метит в щель под щитом — от такого не закроешься.',
    when: (c) => {
      const b = turn(c);
      return !!b && !!foe(b, 'goblin', 'sneak');
    },
    point: (c, f) => f.enemy(foe(c.run.battle!, 'goblin', 'sneak')!.uid, '.intent-mark'),
  },
  {
    id: 'd7',
    text: 'Лучник теперь в упор — стрелять ему неудобно, при первой возможности отступит. Бить, пока рядом.',
    when: (c) => turn(c)?.enemies[0]?.defId === 'bandit_archer',
    point: (c, f) => f.enemy(c.run.battle!.enemies[0].uid),
  },

  // Торговец.
  {
    id: 's1',
    text: 'Лечение, сталь, обереги, склянки — всё за монету. Не по душе товар — за пять монет покажет другой.',
    when: (c) => c.view === 'shop',
    point: (_c, f) => [...f.all('.top-left .gold'), ...f.all('.shop-card .card-foot .primary')],
  },
  {
    id: 's2',
    after: 's1',
    text: 'Не по карману. Монеты дают драки — а со зверя покрупнее и добыча богаче.',
    when: (c) => {
      const shop = c.view === 'shop' ? c.run.shop : null;
      return !!shop && ((!!shop.gear && c.run.gold < gearPrice(shop.gear)) || (!!shop.artifact && c.run.gold < artifactPrice(shop.artifact)));
    },
    point: (_c, f) => f.all('.top-left .gold'),
  },

  // Кабан: громила, блок врага, замах.
  {
    id: 'k1',
    text: 'Кабан вышел вперёд и злится — бьёт сильнее.',
    when: (c) => opening(c, 3),
    point: (c, f) => {
      const boar = foe(c.run.battle!, 'boar');
      return boar ? [...f.enemy(boar.uid, '.role-mark.role-brute'), ...f.enemy(boar.uid, '.badges')] : [];
    },
  },
  {
    id: 'k2',
    text: 'Ощетинился. Первый удар уйдёт в щетину, а не в мясо.',
    when: (c) => {
      const b = turn(c);
      return !!b && (foe(b, 'boar')?.block ?? 0) > 0;
    },
    point: (c, f) => f.enemy(foe(c.run.battle!, 'boar')!.uid, '.bar-hp'),
  },
  {
    id: 'k3',
    urgent: true,
    text: 'Роет копытом — сейчас понесётся. Встречу его щитом.',
    when: (c) => {
      const b = turn(c);
      return !!b && !!foe(b, 'boar', 'dig');
    },
    point: (c, f) => [...f.enemy(foe(c.run.battle!, 'boar', 'dig')!.uid, '.pill'), ...f.tile('Защита')],
  },
  {
    id: 'k4',
    react: true,
    text: 'Говорил себе — закройся. Кабан прошёлся по мне от души.',
    when: (c) => {
      const b = turn(c);
      const prev = b && afterEnemies(c, b);
      return !!b && !!prev && prev.block === 0 && b.hero.hp < prev.hp && Object.values(prev.intents).includes('charge');
    },
  },
  {
    id: 'k5',
    text: 'Колдовства во мне на донышке — как раз на один магический щит. После драки оно вернётся.',
    when: (c) => !!turn(c)?.hero.artifacts.some((a) => a.id === 'mana_shield'),
    point: (_c, f) => [...f.all('.c-hero .bar-mp'), ...f.tile(artifactDef('mana_shield').name)],
  },

  // Мышь и паук: статусы.
  {
    id: 'm1',
    text: 'Мышь пьёт кровь — каждый укус её подлечивает. Паук прячется сзади и кусает ядом.',
    when: (c) => opening(c, 4),
    point: (_c, f) => f.all('.enemy .pill'),
  },
  {
    id: 'm2',
    text: 'Мышь вьётся — следующий удар уйдёт в пустоту. Лучший на неё не трачу.',
    when: (c) => {
      const b = turn(c);
      const bat = b && foe(b, 'bat');
      return !!bat && hasStatus(bat.statuses, 'dodge');
    },
    point: (c, f) => f.enemy(foe(c.run.battle!, 'bat')!.uid, '.badges'),
  },
  {
    id: 'm3',
    text: 'Яд жжёт изнутри. Щит от него не спасёт, но и яд скоро выдохнется.',
    when: (c) => {
      const b = turn(c);
      return !!b && hasStatus(b.hero.statuses, 'poison');
    },
    point: (_c, f) => f.all('.hero-zone .badges'),
  },
  {
    id: 'm4',
    text: 'Руки в паутине — в следующий раз замахнусь на раз меньше.',
    when: (c) => {
      const b = turn(c);
      return !!b && hasStatus(b.hero.statuses, 'exhaust');
    },
    point: (_c, f) => [...f.all('.hero-zone .badges'), ...f.all('.c-hero .bar-sta')],
  },

  // Сундук и привал.
  {
    id: 'c1',
    text: 'Замок мудрёный — значит, внутри есть что прятать. Дрогнет рука — уколюсь, и его заест.',
    when: (c) => c.view === 'event' && chestClosed(c.run),
    point: (_c, f) => f.all('.lock-row'),
  },
  {
    id: 'c2',
    react: true,
    text: 'Рука дрогнула. Сундук не мой — зато палец почти цел.',
    when: (c) => c.view === 'event' && c.run.event?.kind === 'chest' && !!c.run.event.jammed,
  },

  // Головорез и шаман.
  {
    id: 'g1',
    text: 'Шаман за спиной головореза — будет латать его, пока жив.',
    when: (c) => opening(c, 6),
    point: (_c, f) => f.all('.role-mark.role-support'),
  },
  {
    id: 'g2',
    text: 'Шаман меня сглазил — каждый удар теперь больнее.',
    when: (c) => {
      const b = turn(c);
      return !!b && hasStatus(b.hero.statuses, 'vulnerable');
    },
    point: (_c, f) => f.all('.hero-zone .badges'),
  },
  {
    id: 'g3',
    urgent: true,
    text: 'Головорез приметил щит и бьёт в обход. Видно, не первый раз дерётся с такими, как я.',
    when: (c) => {
      const b = turn(c);
      return !!b && !!foe(b, 'cutthroat', 'crack');
    },
    point: (c, f) => f.enemy(foe(c.run.battle!, 'cutthroat', 'crack')!.uid, '.intent-mark'),
  },
  {
    id: 'a3',
    text: 'Щит к щиту — теперь закрываюсь заметно крепче.',
    when: (c) => !!turn(c) && shieldCount(c.run) >= 2,
    point: (_c, f) => [...f.tile('Защита'), ...f.tile('Щитовой удар')],
  },
  {
    id: 'g4',
    after: 'a3',
    text: 'Три вещи для щитового боя. Чем крепче держу щит, тем тяжелее бью.',
    when: (c) => !!turn(c) && shieldCount(c.run) >= 3,
    point: (_c, f) => f.tile('Ударить'),
  },

  // Медведь: элита.
  {
    id: 'e1',
    text: 'Медведь. Такой стоит троих волков — но и добыча с него будет знатная.',
    when: (c) => opening(c, 7),
    point: (c, f) => f.enemy(c.run.battle!.enemies[0].uid, '.bar-hp'),
  },
  {
    id: 'e2',
    urgent: true,
    text: 'Встаёт на дыбы! Сейчас обрушится — щит!',
    when: (c) => {
      const b = turn(c);
      return !!b && !!foe(b, 'bear', 'rear');
    },
    point: (c, f) => [...f.enemy(foe(c.run.battle!, 'bear', 'rear')!.uid, '.pill'), ...f.tile('Защита')],
  },
  {
    id: 'e3',
    urgent: true,
    text: 'За щитом не отсидишься — медведь сдирает его лапой.',
    when: (c) => {
      const b = turn(c);
      return !!b && !!foe(b, 'bear', 'crack');
    },
    point: (c, f) => f.enemy(foe(c.run.battle!, 'bear', 'crack')!.uid, '.intent-mark'),
  },
  {
    id: 'e4',
    text: 'Зализывает раны. Второй раз не успеет.',
    when: (c) => {
      const b = turn(c);
      return !!b && !!foe(b, 'bear', 'lick');
    },
    point: (c, f) => f.enemy(foe(c.run.battle!, 'bear', 'lick')!.uid, '.pill'),
  },

  {
    id: 'c3',
    text: 'Привал. Отлежаться — или подточить оберег? Впереди логово.',
    when: (c) => c.view === 'camp',
    point: (_c, f) => f.all('.camp-card'),
  },

  // Логово: босс.
  {
    id: 'x1',
    text: 'Вожак. Стая встаёт за него стеной.',
    when: (c) => opening(c, 9),
  },
  {
    id: 'x2',
    text: 'Ещё волк — прямо передо мной. До вожака опять не дотянуться.',
    when: (c) => {
      const b = turn(c);
      const prev = b && afterEnemies(c, b);
      return !!b && !!prev && !!foe(b, 'alpha_wolf') && b.enemies.some((e) => e.defId === 'wolf' && !prev.uids.includes(e.uid));
    },
    point: (c, f) => c.run.battle!.enemies.filter((e) => e.defId === 'wolf' && !c.prev?.uids.includes(e.uid)).flatMap((e) => f.enemy(e.uid)),
  },
  {
    id: 'x3',
    urgent: true,
    text: 'Ощетинился весь — бить его сейчас, что по ежу. Щит хоть немного прикроет.',
    when: (c) => {
      const b = turn(c);
      return !!b && !!foe(b, 'alpha_wolf', PHASE_SHIFT);
    },
    point: (c, f) => f.enemy(foe(c.run.battle!, 'alpha_wolf')!.uid, '.pill'),
  },
  {
    id: 'x4',
    text: 'Ранен — и только злее. С каждым рыком кусает сильнее, тянуть нельзя.',
    when: (c) => {
      const b = turn(c);
      const alpha = b && foe(b, 'alpha_wolf');
      return !!alpha && alpha.phase >= 2 && alpha.intent !== PHASE_SHIFT;
    },
    point: (c, f) => f.enemy(foe(c.run.battle!, 'alpha_wolf')!.uid),
  },
  {
    id: 'x5',
    react: true,
    text: 'Логово пусто. Лес позади.',
    when: (c) => c.view === 'battle' && c.run.roomIndex === 9 && c.run.battle?.phase === 'won',
  },

  // Итоги: облачко стоит на экране итогов само (screens/end.ts), очередь его не показывает.
  { id: 'z1', text: 'Не в этот раз. В другой раз я буду знать, что он задумал.', when: () => false },
  { id: 'x6', text: 'Дальше — три земли подряд, и каждая злее этой.', when: () => false },
];

export const THOUGHT_BY_ID: Record<string, Thought> = Object.fromEntries(THOUGHTS.map((t) => [t.id, t]));

export function thoughtText(id: string): string {
  return THOUGHT_BY_ID[id]?.text ?? '';
}

/** Что на экране забега, по фазе и ожиданиям — то же, что выбирает App.render(). */
export function thoughtView(run: RunState): ThoughtView {
  if (run.pending) return 'placing';
  switch (run.phase) {
    case 'map':
      return 'map';
    case 'battle':
      return 'battle';
    case 'reward':
      return awaitsFocus(run.rewards[0]) ? 'pool' : 'reward';
    case 'shop':
      return 'shop';
    case 'event':
      return 'event';
    case 'camp':
      return 'camp';
    default:
      return 'end';
  }
}

/** Снимок хода героя для реакций. */
export function turnSnap(b: BattleState): TurnSnap {
  return {
    turn: b.turn,
    hp: b.hero.hp,
    sta: b.hero.sta,
    block: b.hero.block,
    defended: b.hero.defended,
    intents: Object.fromEntries(b.enemies.map((e) => [e.uid, e.intent])),
    uids: b.enemies.map((e) => e.uid),
  };
}
