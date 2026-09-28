/**
 * Прогрев картинок (v0.41.4). Фоны локаций и листы героев — файлы по 150–350 КБ, и браузер берётся за них
 * только когда экран уже рисуется: первый вход в локацию мог показать пустой фон, а первый бой — пустое место
 * героя. Здесь адрес заказывается заранее — `new Image()` кладёт файл в кэш браузера, а `background-image`
 * с тем же адресом потом берёт готовое.
 *
 * Своего кэша картинок в игре нет и не нужно: data URL процедурных спрайтов и иконок держат Map в
 * sprites.ts / icons.ts / fx.ts, а файлы кэширует сам браузер — в сборке их имена содержат хеш содержимого,
 * поэтому кэш живёт и между версиями игры.
 */

/** Адреса, уже заказанные браузеру: один запрос на файл за жизнь страницы. */
const asked = new Set<string>();

/** Пока файл качается, ссылка на Image живёт здесь: без неё сборщик мусора вправе выбросить его вместе с запросом. */
const loading = new Set<HTMLImageElement>();

/** Попросить браузер скачать картинки впрок. Повторный заказ того же адреса ничего не делает. */
export function warmImages(...urls: string[]): void {
  for (const url of urls) {
    if (!url || asked.has(url)) continue;
    asked.add(url);
    const img = new Image();
    loading.add(img);
    // Неудача прогрева — не беда: экран нарисуется и так, просто картинка приедет в свой срок.
    const done = (): void => {
      loading.delete(img);
    };
    img.onload = done;
    img.onerror = done;
    img.decoding = 'async';
    img.src = url;
  }
}

/**
 * Картинка холста короткой ссылкой `blob:` вместо `data:`. Листы лепки (враги, герои) и аватарки стоят в CSS-переменных
 * (`--sheet`, `--pic`), и на каждом новом элементе браузер разбирает адрес целиком и ищет картинку по нему в кэше:
 * `data:` в 30–70 КБ стоил около 1,7 мс на спрайт (у героя ещё раз в `::before`), а `render()` пересоздаёт спрайты
 * на каждое действие боя — выбор приёма и попадание тормозили на слабых машинах. Blob — около 0,1 мс. Листы
 * кэшируются до конца страницы, поэтому ссылки не освобождаются.
 */
export function canvasUrl(canvas: HTMLCanvasElement): string {
  const data = canvas.toDataURL();
  if (typeof URL.createObjectURL !== 'function' || typeof Blob === 'undefined') return data;
  const bin = atob(data.slice(data.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
}
