import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import MarkdownParser from '../src/vendor/markdown-parser.js';
import { mergeTodos } from '../src/today.js';

// 第三轮（2026-11-05，补上扩展后来加的要求）：勾掉就在那一行撤销 + ⌘Z（扩展 #99 C）、多选条（#73、#89）、GitHub 牌子和菜单（#91、#67、#15）
const view = readFileSync(new URL('../src/view.js', import.meta.url), 'utf8');
const github = readFileSync(new URL('../src/github.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const parser = new MarkdownParser();
const S = '## 事项';

test('merge: first in note order keeps its place, texts join line by line, others\' subtasks move under it', () => {
  const note = `${S}\n- [ ] a\n    - [ ] a1\n- [ ] ==b==\n    - [ ] b1\n- [ ] c\n- [x] d\n`;
  const merged = mergeTodos(note, [{ path: [3], text: 'd' }, { path: [0], text: 'a' }, { path: [1], text: 'b' }], S, parser);
  assert.match(merged, /- \[ \] a\n {4}b\n {4}d\n {4}- \[ \] a1\n {4}- \[ \] b1\n- \[ \] c\n/);
  assert.equal(mergeTodos(note, [{ path: [0], text: '别的字' }, { path: [1], text: 'b' }], S, parser), null);
  assert.equal(mergeTodos(note, [{ path: [0], text: 'a' }], S, parser), null);
});

test('ticking one: no notice, 撤销 on that row with a draining line; ⌘Z runs the same undo; redraws keep it', () => {
  assert.match(view, /box\.addEventListener\('click', \(event\) => \{\n {6}event\.preventDefault\(\);\n {6}this\.toggleDone\(todo, path, sourcePath\);/);
  assert.match(view, /const ROW_UNDO_MS = 4000;/);
  assert.match(view, /if \(this\.rowUndo\?\.key === key && this\.rowUndo\.text === todo\.text\) this\.paintRowUndo\(row\);/);
  assert.match(view, /String\(event\.key\)\.toLowerCase\(\) === 'z'/);
  assert.match(view, /root\.setAttribute\('tabindex', '-1'\);/);
  // 删除、批量、做了一次的「撤销」和 ⌘Z 是同一份
  assert.equal((view.match(/run: \(\) => entry\.fire\(\)/g) || []).length, 3);
  assert.match(css, /\.yaoji-row-timer \{\n  position: absolute;/);
});

test('pick bar: 完成 · 标签 · 复制 · 移到… · 删除 · ⋯ · ×; ⋯ has 改成同一句 / 星标 / 合并; rename is a bar, not a menu', () => {
  assert.match(view, /act\(t\('移到…'\), \(button\) => this\.moveMenu\(\)\.showAtPosition\(above\(button\)\)\);/);
  assert.match(view, /menu\.addItem\(\(item\) => item\.setTitle\(t\('改成同一句…'\)\)/);
  assert.match(view, /label\.createSpan\(\{ cls: 'yaoji-pick-rename-count', text: t\('\{count\} 件改成', \{ count \}\) \}\);/);
  assert.match(view, /rename: \(todo\) => \{ todo\.text = renameTo\(todo\.text, value\); \}/);
  assert.match(view, /move: t\('\{count\} 件移到了 \{day\}', \{ count, day: value\?\.label \|\| '' \}\)/);
  assert.match(css, /\.yaoji-pick-bar:not\(\.is-renaming\) \{\n  flex-wrap: nowrap;/);
});

test('GitHub: badge says ✓ 已完成 / 不做了 / 重复了; one row 「项目 #44」 with open · copy link · move · withdraw (asked first)', () => {
  assert.match(github, /if \(G\.rememberIssueStates\?\.\(result\?\.issues\)\) this\.plugin\.views\?\.\(\)\.forEach\(\(view\) => view\.queueRedraw\(\)\);/);
  assert.match(github, /async move\(\{ file, todo, path, issue, to = '', back = null \}\)/);
  assert.match(github, /async withdraw\(\{ file, todo, path, issue \}\)/);
  assert.match(view, /badge\.createSpan\(\{ cls: 'yaoji-issue-state', text: `\$\{state\.status === 'done' \? '✓ ' : ''\}\$\{state\.label\}` \}\);/);
  assert.match(view, /sub = typeof item\.setSubmenu === 'function' \? item\.setSubmenu\(\) : null;/);
  assert.match(view, /ask\.createSpan\(\{ text: t\('GitHub 上的 #\{number\} 会删掉', \{ number: issue\.number \}\) \}\);/);
});
