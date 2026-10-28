import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { countOrAppend, mergeIntoToday } from '../src/today.js';
import { MESSAGES } from '../src/i18n.js';

// 扩展的 GitHub 问题 #46 方案 A（照「时钟 › 秒表」的「计次」）：一件事做几次，次数写在字后面「颈椎操 ×3」，
// 和浏览器扩展同一种写法（src/vendor/todo-count.js 从扩展拷来）
const require = createRequire(import.meta.url);
const MarkdownParser = require('../src/vendor/markdown-parser.js');
const parser = new MarkdownParser();
const section = '### 事项';
const view = readFileSync(new URL('../src/view.js', import.meta.url), 'utf8');

test('输入框里再打一次已经在计次、没做完的那件：不加新的一行，那一行 +1', () => {
  const note = '### 事项\n- [ ] 颈椎操 ×3\n- [x] 喝水 ×2\n- [ ] 运动\n    - [ ] 深蹲 ×1\n';
  const first = countOrAppend(note, '颈椎操+1', section, parser);
  assert.deepEqual(first.counted, { text: '颈椎操 ×3', count: 4 });
  assert.match(first.content, /- \[ \] 颈椎操 ×4\n/);
  assert.equal(first.content.split('颈椎操').length, 2);
  assert.match(countOrAppend(note, '深蹲', section, parser).content, /    - \[ \] 深蹲 ×2\n/);
  // 做完了的、没在计次的：照常加一行
  const water = countOrAppend(note, '喝水', section, parser);
  assert.equal(water.counted, null);
  assert.match(water.content, /- \[ \] 喝水\n?$/);
  assert.equal(countOrAppend(note, '运动', section, parser).counted, null);
});

test('带到今天：次数从 0 开始；今天已经有的同一件（带着次数）不再多一行', () => {
  const moved = [{ id: 'x', checked: false, text: '颈椎操 ×3', highlighted: false, indent: 0, children: [] }];
  const fresh = mergeIntoToday('### 事项\n', moved, section, parser);
  assert.match(fresh.content, /- \[ \] 颈椎操$/);
  const same = mergeIntoToday('### 事项\n- [ ] 颈椎操 ×1\n', moved, section, parser);
  assert.equal(same.added, 0);
  assert.equal(same.content.split('颈椎操').length, 2);
});

test('清单里：字后面一个小数，点一下 +1；右键「做了一次」「少记一次」；提示能撤销', () => {
  assert.match(view, /const counted = TodoCount\.parse\(todo\.text\);/);
  assert.match(view, /host\.createEl\('button', \{ cls: 'yaoji-count', text: `×\$\{counted\.count\}` \}\)/);
  assert.match(view, /if \(!todo\.checked\) this\.bump\(todo, path, 1, sourcePath\);/);
  assert.match(view, /\.setTitle\(t\('少记一次'\)\)/);
  assert.match(view, /run: \(\) => this\.change\(\{ \.\.\.todo, text: after \}, path, \(item\) => \{ item\.text = before; \}, sourcePath\)/);
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.yaoji-text \.yaoji-count \{[\s\S]*?box-shadow: none;[\s\S]*?font-variant-numeric: tabular-nums;/);
});

test('新加的字 13 种语言都有', () => {
  for (const key of ['做了一次', '少记一次', '现在 {count} 次', '做了 {count} 次', '做了 {count} 次，再记一次', '再记一次', '{text} 第 {count} 次', '{text} 少记了一次']) {
    assert.equal(Object.keys(MESSAGES[key] || {}).length, 12, key);
  }
});
