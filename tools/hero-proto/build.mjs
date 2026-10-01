// Страницы обсуждения лепки героев: модель и клипы из игры (src/ui/heroes) рядом с прежним рисованным листом.
//
//   node tools/hero-proto/build.mjs                  → hero-preview/lepka-voina.html (один файл)
//   node tools/hero-proto/build.mjs --hero paladin   → hero-preview/lepka-paladina.html
//   node tools/hero-proto/build.mjs --hero berserk   → hero-preview/lepka-berserka.html
//   node tools/hero-proto/build.mjs --hero trio      → hero-preview/lepka-troih.html (Маг, Ассасин, Лучник: облики)
//
// Модель — src/ui/heroes/<герой>.ts, разметка — страница и шаблон героя из PAGES. Фоны, прежний лист и портрет — data URI.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, 'hero-preview');
const args = process.argv.slice(2);
const i = args.indexOf('--hero');
const HERO = i >= 0 ? args[i + 1] : 'warrior';
/**
 * Страница, шаблон и файл на героя: Воин, Паладин и Берсерк — итоговые страницы; «трое» — Маг, Ассасин и Лучник на
 * шагах 2–3 рецепта (модель и облики), у неё листы и портреты трёх героев (`heroes`).
 */
const PAGES = {
  warrior: { page: 'page.ts', template: 'template.html', out: 'lepka-voina.html' },
  paladin: { page: 'paladin-page.ts', template: 'paladin.html', out: 'lepka-paladina.html' },
  berserk: { page: 'berserk-page.ts', template: 'berserk.html', out: 'lepka-berserka.html' },
  trio: { page: 'trio-page.ts', template: 'trio.html', out: 'lepka-troih.html', heroes: ['mage', 'assassin', 'archer'] },
};
const spec = PAGES[HERO];
if (!spec) throw new Error(`Нет страницы обсуждения для «${HERO}»: ${Object.keys(PAGES).join(', ')}`);
const uri = (p) => 'data:image/png;base64,' + readFileSync(join(ROOT, p)).toString('base64');

const bundle = await build({ entryPoints: [join(HERE, spec.page)], bundle: true, format: 'iife', minify: true, write: false, logLevel: 'warning', target: 'es2020', loader: { '.png': 'empty' } });
const js = bundle.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const bg = Object.fromEntries(['forest', 'crypt', 'caves'].map((id) => [id, uri(`src/assets/backgrounds/${id}-wide.png`)]));
const assets = spec.heroes
  ? {
      bg,
      refs: Object.fromEntries(spec.heroes.map((id) => [id, uri(`src/assets/heroes/${id}.png`)])),
      avatars: Object.fromEntries(spec.heroes.map((id) => [id, uri(`src/assets/heroes/${id}-avatar.png`)])),
    }
  : {
      bg,
      ref: uri(`src/assets/heroes/${HERO}.png`),
      avatar: uri(`src/assets/heroes/${HERO}-avatar.png`),
      // Рисованные портреты соседей — ряд выбора героя на странице Паладина (Воин рисуется из своей лепки).
      others: Object.fromEntries(['mage', 'assassin', 'berserk', 'archer'].map((id) => [id, uri(`src/assets/heroes/${id}-avatar.png`)])),
    };
const html = readFileSync(join(HERE, spec.template), 'utf8')
  .replace('{{ASSETS}}', () => JSON.stringify(assets))
  .replace('{{BUNDLE}}', () => js);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, spec.out), html);
console.log(`${join(OUT, spec.out)} — ${Math.round(html.length / 1024)} КБ`);
