// 从浏览器扩展仓库拷来两边共用的纯逻辑，放进 src/vendor/，并记下来源 commit。
// 拷过来的文件不在这里改：要改去扩展仓库改，再跑一遍 npm run sync-core。
import { execFileSync } from 'node:child_process';
import { copyFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const extension = resolve(process.env.YAOJI_EXTENSION_DIR || '../插件-obsidian日记todo');
const files = ['core/markdown-parser.js', 'core/github-issues.js', 'core/github-auto-tick.js', 'core/todo-plain-text.js'];

const commit = execFileSync('git', ['-C', extension, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['-C', extension, 'status', '--porcelain', '--', ...files], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error(`扩展仓库里这些文件还没提交，先提交再同步：\n${dirty}`);
  process.exit(1);
}

for (const file of files) {
  copyFileSync(join(extension, file), join('src/vendor', file.split('/').pop()));
}
writeFileSync('src/vendor/SOURCE.json', `${JSON.stringify({ repo: 'nevertoday/obsidian-daily-todo-extension', commit, files }, null, 2)}\n`);
console.log(`synced ${files.length} file(s) from ${commit.slice(0, 7)}`);
