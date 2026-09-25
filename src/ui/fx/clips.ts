import type { FxClip } from './bake';
import { dustClip } from './cry';
import { arrowClip, arrowStuckClip, explosionClip, fireballClip, flaskClip, orbBurstClip, orbClip, shardClip, shatterClip, splashClip, stoneClip, zapClip } from './shots';
import { beamClip, burnClip, cloudClip, rimeClip, ringClip, starClip } from './status';
import { slashClip, STEEL_EDGE } from './strike';

/**
 * Реестр клипов лепки эффектов: всё, что запекается кадрами. По нему tests/fx.test.ts проверяет край кадра,
 * растворение и детерминизм, а tools/fx-sheet.mjs рисует листы в PNG. Новый клип эффекта — сюда же.
 *
 * Клипы, которые в бою кроятся по бойцу (мазок — по росту цели, статусы — по ширине), здесь стоят в двух крайних размерах;
 * снаряды — в одном угле полёта и в зеркале. `loop` — клип полёта или парения: он крутится, пока летит, и тает не сам.
 */
export const FX_CLIPS: Record<string, FxClip> = {
  'dust:1': dustClip(1),
  'dust:-1': dustClip(-1),
  'slash:22': slashClip(22, STEEL_EDGE),
  'slash:38': slashClip(38, '#e63946'),
  'slash:30:l': slashClip(30, '#c9ccd1', true),
  'arrow': arrowClip(-0.15, '#e9c46a'),
  'arrow:l': arrowClip(0.15, '#e9c46a', true),
  'arrow-stuck': arrowStuckClip(-0.15, '#e9c46a'),
  'fireball': fireballClip(-0.1),
  'boom': explosionClip(),
  'shard': shardClip(-0.1),
  'shatter': shatterClip(),
  'zap': zapClip(),
  'flask': flaskClip('#7ddc5a'),
  'splash': splashClip('#7ddc5a'),
  'stone': stoneClip(),
  'orb': orbClip('#b388ff', -0.1),
  'orb-burst': orbBurstClip('#b388ff'),
  'burn:24': burnClip(24),
  'burn:48': burnClip(48),
  'star': starClip(true),
  'star-back': starClip(false),
  'rime:24': rimeClip(24),
  'rime:48': rimeClip(48),
  'poison:24': cloudClip('#9fcf66', 24),
  'poison:48': cloudClip('#9fcf66', 48),
  'heal-ring:32': ringClip('#80ed99', 32),
  'heal-beam:32': beamClip('#80ed99', 32, 48),
};
