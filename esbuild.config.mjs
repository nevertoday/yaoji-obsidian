import esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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

// 开发时装进自己的库试：YAOJI_VAULT=/path/to/vault npm run build（Obsidian 里关掉再打开插件就是新的）
const vault = process.env.YAOJI_VAULT;
const installToVault = {
  name: 'install-to-vault',
  setup(build) {
    build.onEnd((result) => {
      if (!vault || result.errors.length) return;
      const dir = join(vault, '.obsidian', 'plugins', 'yaoji-today');
      mkdirSync(dir, { recursive: true });
      for (const file of ['main.js', 'manifest.json', 'styles.css']) copyFileSync(file, join(dir, file));
      console.log(`installed to ${dir}`);
    });
  }
};
options.plugins = [installToVault];

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
