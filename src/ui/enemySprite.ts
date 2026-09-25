import type { EventTarget, SpriteSpec } from '../engine/types';
import { spriteImg } from './sprites';
import { hasMobArt, mobSprite, playMobAction, playMobClip } from './mobs';

/**
 * Спрайт врага или союзника: пиксельная лепка с покоем, ударом и уроном (mobs/, v0.52; с v0.52.6 — все шесть локаций,
 * рисованные листы скелетов и некроманта убраны), у кого модели нет — процедурный спрайт.
 */
export function enemySprite(spec: SpriteSpec, id: string, px: number, cls = '', instance?: object): HTMLElement {
  if (hasMobArt(id)) return mobSprite(id, px, cls, instance);
  return spriteImg(spec, id, px, cls);
}

/** Реакция бойца на урон: у лепки — свой клип; на блок клипа нет — щит показывает эффект блока. false — игра трясёт спрайт. */
export function playEnemyClip(root: HTMLElement, target: EventTarget, clip: 'hurt' | 'block'): boolean {
  return clip === 'hurt' && playMobClip(root, target, 'hurt');
}

/** Приём врага: удар лепки своим клипом, контакт на пятом кадре (мс от начала); 0 — общий наскок. */
export function playEnemyAction(root: HTMLElement, target: EventTarget, name: string): number {
  return playMobAction(root, target, name);
}
