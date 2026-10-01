import { avatarCells, hasHeroArt, heroAvatarUrl, heroClipContact, heroClipHold, heroFrameMs, heroSheetSprite, playHeroSculptClip } from './heroes';

/**
 * Герои на поле — все шесть пиксельной лепкой (heroes/: Воин с v0.54.3, Паладин с v0.54.5, Берсерк с v0.54.6, Маг,
 * Ассасин и Лучник с v0.54.7). Здесь — общий вход для экранов: спрайт, аватарка и клипы боя. Рисованные листы и портреты
 * генератора (`src/assets/heroes/<id>.png`, `<id>-avatar.png`) в игре больше не используются — остались референсом
 * страниц обсуждения (tools/hero-proto/), а их конвейер (`tools/hero-sheet.py`, `tools/hero-avatars.py`, листание рядов
 * CSS `.hero-sprite`) — в истории ветки.
 *
 * Клипы названы по роли, а не по рисунку: `battle` — покой в бою, `buff` — клич и бафы, `bash` и `riposte` —
 * личные приёмы Воина, `smite` — Паладина, `vanish` — Ассасина. Чужой личный клип модель заменяет своим
 * (`modelClip` в heroes/model.ts: Щитовой удар у Мага — сильный удар).
 */
export type HeroClip = 'idle' | 'battle' | 'attack' | 'heavy' | 'power' | 'heal' | 'buff' | 'block' | 'hurt' | 'death' | 'bash' | 'riposte' | 'smite' | 'vanish';

/**
 * Спрайт героя: место в разметке — квадрат `px` по фигуре в покое, а кадр рисуется поверх шире квадрата,
 * чтобы замах и падение не обрезались. `base` — что играть в покое: 'battle' в бою, 'death' на гибели.
 */
export function heroSprite(heroId: string, px: number, base: HeroClip = 'idle'): HTMLElement {
  if (hasHeroArt(heroId)) return heroSheetSprite(heroId, px, base === 'death' ? 'death' : 'idle');
  const el = document.createElement('div');
  el.className = 'hero-sheet';
  el.style.setProperty('--box', `${px}px`);
  return el;
}

/**
 * Аватарка героя — квадрат `px`. Стоит там, где нужен сам герой, а не его поза: блок героя в консоли,
 * плитка выбора, шапка листа персонажа. В бою, на выборе крупно и на итогах остаётся спрайт — там важны
 * стойка, снаряжение и падение.
 */
export function heroAvatar(heroId: string, px: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hero-avatar';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', heroId);
  el.style.setProperty('--box', `${px}px`);
  if (!hasHeroArt(heroId)) return el;
  // Лепка — пиксель в пиксель: увеличивать без сглаживания, ужимать (подсказка) — со сглаживанием.
  el.classList.toggle('sculpt', avatarCells(px) <= px);
  el.style.setProperty('--pic', `url(${heroAvatarUrl(heroId, px)})`);
  return el;
}

/**
 * Проиграть одноразовый клип героя в бою и вернуться в стойку. false — такого клипа нет (покой), и вызывающий
 * оставляет старый наскок (`acting`). `from` — с какого момента клипа, мс: блок на ударе врага начинается сразу
 * с удара о щит.
 */
export function playHeroClip(root: HTMLElement, heroId: string, want: HeroClip, from = 0): boolean {
  if (!hasHeroArt(heroId) || want === 'idle' || want === 'battle') return false;
  return playHeroSculptClip(root, heroId, want, from);
}

/**
 * Момент контакта клипа, мс от начала: удар о цель, взмах приёма, удар о щит. 0 — у клипа нет контакта.
 * По нему бой приурочивает цифру урона и эффект.
 */
export function heroContactMs(heroId: string, clip: HeroClip): number {
  if (!hasHeroArt(heroId) || clip === 'idle' || clip === 'battle') return 0;
  return heroClipContact(heroId, clip);
}

/** Длительность кадра клипа героя, мс. */
export function heroClipFrameMs(heroId: string, clip: HeroClip): number {
  if (!hasHeroArt(heroId) || clip === 'idle' || clip === 'battle') return 0;
  return heroFrameMs(heroId, clip);
}

/**
 * Клип приёма сам рисует эффект (`selfFx`: свечение бафа гасится) и держит ввод `lock` мс от начала — дым Исчезновения
 * у Ассасина. У героя без клипа и у покоя — ничего.
 */
export function heroClipHolds(heroId: string, clip: HeroClip): { selfFx: boolean; lock: number } {
  if (!hasHeroArt(heroId) || clip === 'idle' || clip === 'battle') return { selfFx: false, lock: 0 };
  return heroClipHold(heroId, clip);
}
