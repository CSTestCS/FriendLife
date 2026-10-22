// Bundles the game into dist/ (one script + static files).
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'node:fs';

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

// built-in speech synthesizer: its own bundle, loaded as a worker
// meSpeak's engine breaks after ~80 calls (an emscripten file-system leak); expose
// its own recovery routine so the worker can restart the engine regularly.
const mespeakReboot = {
  name: 'mespeak-reboot',
  setup(b) {
    b.onLoad({ filter: /mespeak[\\/]src[\\/]index\.js$/ }, (args) => ({
      contents: `${readFileSync(args.path, 'utf8')}\nmodule.exports.reboot = function () { recoverFromFSError('periodic restart'); };\n`,
      loader: 'js',
    }));
  },
};
const speechOptions = { ...options, entryPoints: ['src/engine/speechWorker.js'], outfile: 'dist/speech.js', sourcemap: false, minify: true, plugins: [mespeakReboot] };

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  await build(speechOptions);
  console.log('watching…');
} else {
  await build(options);
  await build(speechOptions);
}
