/**
 * Каталог сборок для симуляций по сборкам (tests/build-sim.test.ts). Сборка — один или два архетипа (метки `ArtifactDef.tags`)
 * и герои, которым она «родная»: с каким навыком и какой чертой её собирать. Бот с `BUILD` (bot.ts) держится её меток —
 * свои вещи берёт даже слабее чужих и меняет чужие на свои, как игрок, решивший собрать именно это.
 *
 * `BASE_BUILDS` — базовые пары по героям (выбраны по сродству навыков и черт); `allBuilds()` — все 9 одиночных архетипов
 * и все 36 пар, герои — те, у кого навык носит метку сборки (нет таких — все шестеро с первым навыком).
 */
import type { ArchetypeId } from '../../src/engine/types';
import { ARCHETYPE_LIST, archetypeDef, artifactTags } from '../../src/data/archetypes';
import { HERO_LIST, heroDef } from '../../src/data/heroes';

/** Герой сборки: навык из пары (1 — первый, 2 — второй) и черта. Без черты — первая героя, как у обычного бота. */
export interface BuildHero {
  hero: string;
  sig: 1 | 2;
  trait?: string;
}

export interface BuildDef {
  /** `shadow+series` — метки через плюс, по нему сборку выбирает `SIM_BUILDS`. */
  id: string;
  tags: ArchetypeId[];
  heroes: BuildHero[];
  /** Зачем эта пара — одной фразой для сводки. */
  why?: string;
}

const b = (tags: ArchetypeId[], heroes: BuildHero[], why: string): BuildDef => ({ id: tags.join('+'), tags, heroes, why });

/**
 * Базовые сборки: по две-четыре на героя. Навык и черта — те, что тянут в эту сторону (Отравитель — яд из тени,
 * Метка жертвы — крит первым ударом, Заряд — заклинания, Вера — лечение сверх максимума в блок).
 */
export const BASE_BUILDS: BuildDef[] = [
  b(['shadow', 'series'], [{ hero: 'berserk', sig: 1, trait: 'rage' }, { hero: 'assassin', sig: 2, trait: 'prey' }], 'много ударов за ход, и каждый может стать критом'),
  b(['blood', 'poison'], [{ hero: 'assassin', sig: 1, trait: 'poisoner' }, { hero: 'berserk', sig: 1, trait: 'thirst' }], 'две раны на цели, Пиявка пьёт с обеих'),
  b(['shadow', 'blood'], [{ hero: 'assassin', sig: 2, trait: 'prey' }, { hero: 'archer', sig: 1, trait: 'range' }], 'крит режет, кровь добирает'),
  b(['shadow', 'poison'], [{ hero: 'assassin', sig: 1, trait: 'poisoner' }, { hero: 'archer', sig: 1, trait: 'range' }], 'удар из тени травит, яд ослабляет'),
  b(['series', 'blood'], [{ hero: 'berserk', sig: 1, trait: 'thirst' }], 'каждый удар серии кладёт порцию крови'),
  b(['fire', 'cold'], [{ hero: 'mage', sig: 2, trait: 'charge' }], 'поджечь всех и заморозить опасного'),
  b(['fire', 'poison'], [{ hero: 'mage', sig: 2, trait: 'charge' }], 'две раны по всем без удара оружием'),
  b(['fire', 'light'], [{ hero: 'paladin', sig: 1, trait: 'faith' }, { hero: 'mage', sig: 2, trait: 'charge' }], 'Тлеющий клинок и лечение, которое жжёт'),
  b(['shield', 'retribution'], [{ hero: 'warrior', sig: 1, trait: 'stance' }, { hero: 'paladin', sig: 2, trait: 'faith' }], 'стоять за блоком, пока шипы и ответ бьют'),
  b(['light', 'retribution'], [{ hero: 'paladin', sig: 2, trait: 'faith' }, { hero: 'warrior', sig: 2, trait: 'stance' }], 'лечиться и наказывать атакующего'),
  b(['shield', 'cold'], [{ hero: 'warrior', sig: 1, trait: 'stance' }], 'оглушить и бить из-за щита'),
  b(['light', 'shield'], [{ hero: 'paladin', sig: 1, trait: 'faith' }, { hero: 'warrior', sig: 1, trait: 'stance' }], 'лечение сверх максимума уходит в блок'),
  b(['cold', 'shadow'], [{ hero: 'archer', sig: 1, trait: 'ambush' }, { hero: 'assassin', sig: 2, trait: 'prey' }], 'оцепеневший враг — верный крит'),
  b(['cold', 'poison'], [{ hero: 'archer', sig: 2, trait: 'range' }, { hero: 'mage', sig: 1, trait: 'charge' }], 'контроль по всем и медленный яд'),
];

/** Метки навыка героя: его сродство с архетипами. */
function sigTags(heroId: string, sig: 1 | 2): ArchetypeId[] {
  return artifactTags(heroDef(heroId).signatures[sig - 1]);
}

/** Герои, чей навык носит одну из меток сборки (с этим навыком); нет таких — все шестеро с первым навыком. */
function affinityHeroes(tags: ArchetypeId[]): BuildHero[] {
  const out: BuildHero[] = [];
  for (const h of HERO_LIST) {
    const sig = ([1, 2] as const).find((s) => sigTags(h.id, s).some((t) => tags.includes(t)));
    if (sig) out.push({ hero: h.id, sig });
  }
  return out.length ? out : HERO_LIST.map((h) => ({ hero: h.id, sig: 1 as const }));
}

/** Все сборки: 9 одиночных архетипов и 36 пар. */
export function allBuilds(): BuildDef[] {
  const ids = ARCHETYPE_LIST.map((a) => a.id);
  const out: BuildDef[] = ids.map((t) => ({ id: t, tags: [t], heroes: affinityHeroes([t]) }));
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push({ id: `${ids[i]}+${ids[j]}`, tags: [ids[i], ids[j]], heroes: affinityHeroes([ids[i], ids[j]]) });
  return out;
}

/**
 * Сборки по `SIM_BUILDS`: `base` (по умолчанию) — базовые, `all` — все пары, иначе id через запятую (`shadow+series,fire`).
 * Сборка из базовых берётся с её героями и чертами; не из каталога — собирается на лету с героями по сродству и первой чертой.
 * Префикс `all:` (`all:shadow+series,fire`) — и базовые в этом общем виде, чтобы таблица всех сборок была однородной.
 * Порядок меток неважен.
 */
export function pickBuilds(spec: string | undefined): BuildDef[] {
  if (!spec || spec === 'base') return BASE_BUILDS;
  const all = allBuilds();
  if (spec === 'all') return all;
  const general = spec.startsWith('all:');
  const key = (tags: string[]) => [...tags].sort().join('+');
  return (general ? spec.slice(4) : spec).split(',').map((id) => {
    const want = key(id.split('+'));
    const found = (general ? undefined : BASE_BUILDS.find((x) => key(x.tags) === want)) ?? all.find((x) => key(x.tags) === want);
    if (!found) throw new Error(`Unknown build: ${id} (архетипы: ${ARCHETYPE_LIST.map((a) => a.id).join(', ')})`);
    return found;
  });
}

/** «Тень + Серия». */
export function buildName(build: BuildDef): string {
  return build.tags.map((t) => archetypeDef(t).name).join(' + ');
}

/** Артефакт идёт в сборку: носит хотя бы одну её метку. */
export function onBuild(id: string, tags: ArchetypeId[]): boolean {
  return artifactTags(id).some((t) => tags.includes(t));
}
