// Точки каждого кадра клипов героя числами — проверить путь кисти и острия, не глядя в картинку.
//
//   node tools/hero-proto/probe.mjs                    → все клипы Воина
//   node tools/hero-proto/probe.mjs --clips attack,heavy
//   node tools/hero-proto/probe.mjs --hero mage        → модель из HERO_MODELS с зондом `probe` (src/ui/heroes/model.ts)
//
// Координаты — единицы поля модели (земля — `ground`, x растёт к врагам). По кадру: таз, кисть, острие (угол клинка
// в мире — на глаз, куда смотрит меч), стопы. Помечает острие под землёй и кадр контакта (*).
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const ONLY = opt('clips', '');
const HERO = opt('hero', 'warrior');
/** Облик модели на обсуждении: `<герой>Model(look)`. */
const LOOK = opt('look', '');

const bundle = await build({
  stdin: {
    contents: [
      "export { modelClips } from './src/ui/heroes/model';",
      // Модель, ещё не записанная в HERO_MODELS (идёт работа, игра её не видит), — из своего файла: `<герой>Model()`.
      existsSync(resolve(ROOT, `src/ui/heroes/${HERO}.ts`)) ? `export * as own from './src/ui/heroes/${HERO}';` : 'export const own = {};',
      "export { HERO_MODELS } from './src/ui/heroes';",
      "export { HERO_CLIPS, renderHeroClip } from './src/ui/heroes/clips';",
      "export { MOB_STYLE } from './src/ui/mobs/styles';",
    ].join('\n'),
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'warning',
});
const { own, modelClips, HERO_MODELS, HERO_CLIPS, renderHeroClip, MOB_STYLE } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const model = (LOOK ? undefined : HERO_MODELS[HERO]) ?? own[`${HERO}Model`]?.(LOOK || undefined);
if (!model?.probe) throw new Error(`У героя «${HERO}» нет модели с зондом probe: ни в HERO_MODELS, ни ${HERO}Model() в src/ui/heroes/${HERO}.ts`);
const probe = model.probe;
const r = (v) => String(Math.round(v)).padStart(4);
for (const clip of modelClips(model).filter((c) => c !== 'idle' && (!ONLY || ONLY.split(',').includes(c)))) {
  const rows = [];
  probe.on = (info) => rows.push(info);
  renderHeroClip(model, clip, { ...MOB_STYLE, d: 1.5 });
  probe.on = undefined;
  const spec = HERO_CLIPS[clip];
  console.log(`\n${clip} — ${spec.name} (${spec.frames} × ${spec.fps}, контакт ${spec.contact ?? '—'})`);
  console.log('  кадр   таз x,y    кисть x,y   острие x,y  клинок°  стопы F,N');
  rows.forEach((o, f) => {
    const ang = (Math.atan2(o.tipY - o.handY, o.tipX - o.handX) * 180) / Math.PI;
    const warn = o.tipY > o.ground + 1 ? `  ← острие в земле${probe.grounded.includes(clip) ? ' (нарочно)' : ''}` : '';
    console.log(`  ${String(f).padStart(2)}${f === spec.contact ? '*' : ' '} ${r(o.hipX)}${r(o.hipY)}  ${r(o.handX)}${r(o.handY)}  ${r(o.tipX)}${r(o.tipY)}   ${r(ang)}    ${r(o.footF)}${r(o.footN)}${warn}`);
  });
}
