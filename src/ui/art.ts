/**
 * Нарисованные вручную спрайты поверх процедурных.
 *
 * Кладём PNG в `src/assets/sprites/` под именем id героя или врага (`warrior.png`, `wolf.png`) —
 * и он подменяет процедурный спрайт везде: бой, блок героя, выбор героя, бестиарий, итоги.
 * Файла нет — рисуется как раньше, из `SpriteSpec`. Ничего в данных править не нужно.
 *
 * Мастер-формат: 128×128, прозрачный фон, боец стоит на нижней кромке кадра.
 */

const files = import.meta.glob('../assets/sprites/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const ART: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const id = path.slice(path.lastIndexOf('/') + 1, -'.png'.length);
  ART[id] = url;
}

/** Адрес нарисованного спрайта для id, или null — тогда рисуем процедурно. */
export function artUrl(id: string): string | null {
  return ART[id] ?? null;
}

/** Какие id уже нарисованы — для отладочного `mv.art()`. */
export function artIds(): string[] {
  return Object.keys(ART).sort();
}
