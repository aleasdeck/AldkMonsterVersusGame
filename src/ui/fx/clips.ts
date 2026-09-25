import type { FxClip } from './bake';
import { dustClip } from './cry';

/**
 * Реестр клипов лепки эффектов: всё, что запекается кадрами. По нему tests/fx.test.ts проверяет край кадра,
 * растворение и детерминизм, а tools/fx-sheet.mjs рисует листы в PNG. Новый клип эффекта — сюда же.
 */
export const FX_CLIPS: Record<string, FxClip> = {
  'dust:1': dustClip(1),
  'dust:-1': dustClip(-1),
};
