// Страница обсуждения «Лепка Воина»: модель и клипы из игры (src/ui/heroes) рядом с прежним рисованным листом.
//
//   node tools/hero-proto/build.mjs          → hero-preview/lepka-voina.html (один файл)
//
// Модель — src/ui/heroes/warrior.ts, разметка — page.ts и template.html. Фоны, прежний лист и портрет Воина — data URI.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(ROOT, 'hero-preview');
const uri = (p) => 'data:image/png;base64,' + readFileSync(join(ROOT, p)).toString('base64');

const bundle = await build({ entryPoints: [join(HERE, 'page.ts')], bundle: true, format: 'iife', minify: true, write: false, logLevel: 'warning', target: 'es2020', loader: { '.png': 'empty' } });
const js = bundle.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const assets = {
  bg: Object.fromEntries(['forest', 'crypt', 'caves'].map((id) => [id, uri(`src/assets/backgrounds/${id}-wide.png`)])),
  ref: uri('src/assets/heroes/warrior.png'),
  avatar: uri('src/assets/heroes/warrior-avatar.png'),
};
const html = readFileSync(join(HERE, 'template.html'), 'utf8')
  .replace('{{ASSETS}}', () => JSON.stringify(assets))
  .replace('{{BUNDLE}}', () => js);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'lepka-voina.html'), html);
console.log(`${join(OUT, 'lepka-voina.html')} — ${Math.round(html.length / 1024)} КБ`);
