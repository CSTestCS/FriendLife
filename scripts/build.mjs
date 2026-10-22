// Bundles the game into dist/ (one script + static files).
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, existsSync } from 'node:fs';

const watch = process.argv.includes('--watch');
mkdirSync('dist', { recursive: true });
cpSync('static', 'dist', { recursive: true });
// sample VRM / VRMA files offered in Library → "Add sample content"
mkdirSync('dist/samples', { recursive: true });
if (existsSync('samples')) {
  for (const f of readdirSync('samples')) if (/\.(vrm|vrma|json|png)$/i.test(f)) cpSync(`samples/${f}`, `dist/samples/${f}`);
}

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/bundle.js',
  target: ['chrome120'],
  sourcemap: true,
  minify: !watch,
  legalComments: 'none',
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching…');
} else {
  await build(options);
}
