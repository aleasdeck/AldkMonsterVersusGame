import type { Style } from './pixel';

/**
 * Три варианта отрисовки одних и тех же моделей (прототип v0.52, выбор за пользователем).
 * Отличаются плотностью пикселя, числом ступеней света, фактурой, контуром и плавностью покоя.
 * Цикл покоя у всех три секунды: за него враг дышит, шевелит хвостом или ушами и один раз моргает.
 */
export const MOB_STYLES: Record<'a' | 'b' | 'c', Style> = {
  /** Крупный пиксель (3 px поля): ближе всего к нынешним спрайтам, три тона, сплошной тёмный контур. */
  a: { id: 'a', d: 3, tones: 3, dither: 0, texture: 0, outline: 'dark', inner: true, rim: 0, frames: 12, fps: 4 },
  /** Пиксель фона (2 px поля): пять тонов со сдвигом оттенка, фактура, выборочный контур, контровой свет. */
  b: { id: 'b', d: 2, tones: 5, dither: 0.45, texture: 0.8, outline: 'selective', inner: true, rim: 0.5, frames: 24, fps: 8 },
  /** Тонкий пиксель (1 px поля): детали на уровне рисованных героев, шесть тонов, плавный покой. */
  c: { id: 'c', d: 1, tones: 6, dither: 0.35, texture: 1, outline: 'selective', inner: true, rim: 0.55, frames: 36, fps: 12 },
};

export type MobStyleId = keyof typeof MOB_STYLES;
