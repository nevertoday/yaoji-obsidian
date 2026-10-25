import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'cjs',
  target: 'es2020',
  platform: 'browser',
  // Obsidian 自己提供这些，不打进 main.js
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  outfile: 'main.js',
  logLevel: 'info',
  sourcemap: watch ? 'inline' : false,
  minify: false,
  banner: { js: '/* 今日待办 · Obsidian 插件 · © 2026 小小东 */' }
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
