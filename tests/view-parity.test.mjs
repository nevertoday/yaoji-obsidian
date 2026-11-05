import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MESSAGES } from '../src/i18n.js';

// 2026-11-05 整理（用户反馈：Obsidian 插件「丑、累赘、和扩展没法比，操作也没跟上扩展的习惯」）：
// 侧边栏照浏览器扩展的样子和习惯——标头一行、标签小签、GitHub 浅底牌子、做完的放最后、双击改字、「⋯」和右键同一份菜单
const view = readFileSync(new URL('../src/view.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('header is one line: date, lucky mark and done count; no separate meta row', () => {
  assert.doesNotMatch(view, /metaEl|drawMeta/);
  assert.match(view, /if \(lucky\) day\.createSpan\(\{ cls: 'yaoji-lucky', text: t\('吉'\)/);
  assert.match(view, /const side = head\.createDiv\(\{ cls: 'yaoji-head-side' \}\);/);
});

test('done to-dos are listed last (display only; paths still point into the note)', () => {
  assert.match(view, /const shown = \[\.\.\.order\.filter\(\(item\) => !item\.todo\.checked\), \.\.\.order\.filter\(\(item\) => item\.todo\.checked\)\];\n {4}shown\.forEach\(\(\{ todo, index \}\) => draw\(\[todo\], \[\], 0, index\)\);/);
  assert.match(view, /const index = startIndex \+ offset;\n {8}const path = \[\.\.\.parentPath, index\];/);
});

test('tags become a row of chips under the text; the issue is a tinted chip, the row itself is not tinted', () => {
  assert.match(view, /const hits = raw\.includes\('#'\) \? \(G\.findTags\?\.\(raw\) \|\| \[\]\) : \[\];/);
  assert.match(view, /const chips = tags\.filter\(\(tag\) => tag\.toLowerCase\(\) !== repoName\);/);
  assert.doesNotMatch(view, /row\.addClass\('has-issue'\)/);
  assert.match(css, /\.yaoji-issue \{[^}]*background: color-mix\(in srgb, var\(--yaoji-issue\) 12%, transparent\);/);
  assert.doesNotMatch(css, /\.yaoji-item\.has-issue/);
});

test('double-click edits in place (Enter saves, Esc cancels, issue links kept); the ⋯ button and right-click share one menu', () => {
  assert.match(view, /text\.addEventListener\('dblclick', \(event\) => \{[\s\S]*?this\.startEdit\(row, text, todo, path, sourcePath\);/);
  assert.match(view, /if \(event\.key === 'Enter' && !event\.shiftKey\) \{ event\.preventDefault\(\); finish\(true\); \}/);
  assert.match(view, /const full = \[next, \.\.\.urls\]\.join\(' '\);/);
  assert.match(view, /this\.menuFor\(todo, path, sourcePath, counted, row, text\)\.showAtPosition/);
  assert.match(view, /this\.menuFor\(todo, path, sourcePath, counted, row, text\)\.showAtMouseEvent\(event\);/);
  for (const key of ["t('完成')", "t('编辑')", "t('复制文字')", "t('删除')"]) assert.ok(view.includes(key), key);
});

test('styles follow the extension: interface font, 8-point grid, quiet ⋯ until hover, star = weight + thin line', () => {
  assert.match(css, /font-family: var\(--font-interface\);/);
  assert.doesNotMatch(css, /Avenir Next/);
  assert.match(css, /\.yaoji-today \.yaoji-more \{[^}]*opacity: 0;/);
  assert.match(css, /\.yaoji-item\.is-star:not\(\.is-done\) \.yaoji-text,[\s\S]*?text-underline-offset: 0\.42em;/);
  // 间距只用 4 8 16 24
  const spacing = [...css.matchAll(/(?:padding|margin|gap)(?:-[a-z-]+)?:\s*([^;]+);/g)].flatMap((m) => [...m[1].matchAll(/(\d+(?:\.\d+)?)px/g)].map((x) => Number(x[1])));
  const odd = spacing.filter((px) => ![0, 1, 2, 4, 8, 16, 24, 32, 40].includes(px));
  assert.deepEqual(odd, []);
});

test('the new words are in all 13 languages', () => {
  for (const key of ['今天还没有待办', '黄道吉日', '标为未完成', '完成', '编辑', '复制文字', '已复制', '复制失败', '找带 #{tag} 的事', '更多']) {
    assert.equal(Object.keys(MESSAGES[key] || {}).length, 12, key);
  }
});

// 第二轮（2026-11-05，用户点头）：多选批量、拖动排序、两件之间加一条、加子任务——都和扩展一样
test('multi-select: ⌘/Ctrl/Shift click picks rows; an ink bar with 完成 · 标签 · 复制 · 移到… · 删除 · ⋯; right-click on picked rows is the batch menu', () => {
  assert.match(view, /if \(!\(event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey\)\) return;[\s\S]*?this\.pickGesture\(key, event\.shiftKey\);/);
  assert.match(view, /act\(allDone \? t\('取消完成'\) : t\('完成'\), \(\) => this\.batch\('done'\)\);\n {4}act\(t\('标签'\)[\s\S]*?act\(t\('复制'\), \(\) => this\.batch\('copy'\)\);\n {4}act\(t\('移到…'\), \(button\) => this\.moveMenu\(\)\.showAtPosition\(above\(button\)\)\);\n {4}act\(t\('删除'\), \(\) => this\.batch\('delete'\)\);/);
  assert.match(view, /if \(this\.picked\.size && this\.picked\.has\(key\)\) \{ this\.batchMenu\(\)\.showAtMouseEvent\(event\); return; \}/);
  // 每一样都能撤销：日记这期间没再改过就整篇换回去；移到明天的也从明天那篇拿回来
  assert.match(view, /if \(content !== after\) return content;\n {8}ok = true;\n {8}return before;/);
  assert.match(view, /undoBrought\(content, record, section, parser\)\?\.content \?\? content/);
  assert.match(css, /\.yaoji-item\.is-picked,\n\.yaoji-item\.is-picked:hover \{[^}]*box-shadow: inset 2px 0 0 var\(--yaoji-ink\);/);
  assert.match(css, /\.yaoji-pick-bar \{[^}]*position: sticky;[^}]*background: var\(--yaoji-ink\);/);
});

test('drag a grip to reorder within the same level; a line shows where it lands; written on drop with moveTodo', () => {
  assert.match(view, /grip\.addEventListener\('pointerdown', \(event\) => this\.startDrag\(event, row, todo, path\)\);/);
  assert.match(view, /const siblings = this\.rows\.filter\(\(entry\) => entry\.el\.dataset\.parent === parent && entry\.depth === depth\);/);
  assert.match(view, /moveTodo\(content, path, todo\.text, before, this\.plugin\.settings\.section, this\.plugin\.parser\) \?\? content/);
  assert.match(css, /\.yaoji-drop-line \{[^}]*background: var\(--yaoji-ink\);/);
});

test('在下面加一条 / 添加子任务 open an empty input first; nothing is written until Enter (Esc leaves no empty line)', () => {
  assert.match(view, /\.setTitle\(t\('在下面加一条'\)\)[\s\S]*?this\.composeNear\(row, todo, path, 'below', sourcePath\)/);
  assert.match(view, /\.setTitle\(t\('添加子任务'\)\)[\s\S]*?this\.composeNear\(row, todo, path, 'child', sourcePath\)/);
  assert.match(view, /if \(!save \|\| !value\) return;[\s\S]*?insertTodo\(content, path, todo\.text, value, mode,/);
});

test('round-two words are in all 13 languages', () => {
  for (const key of ['在下面加一条', '添加子任务', '已选 {count} 件', '取消完成', '标签', '复制', '明天', '取消选择', '新标签…', '写一个标签', '已复制 {count} 件', '{count} 件都改好了', '{count} 件加上了 #{tag}', '删掉了 {count} 件', '{count} 件移到了明天', '移不过去：{message}', '日记刚改过，再选一次', '日记刚改过，撤销不了']) {
    assert.equal(Object.keys(MESSAGES[key] || {}).length, 12, key);
  }
});

test('Shift range starts from the last picked row, or the plainly clicked row — upward works too (like Finder)', () => {
  assert.match(view, /const start = this\.picked\.size \? \(this\.lastPicked \|\| this\.lastClicked\) : this\.lastClicked;/);
  assert.match(view, /if \(event\.button === 0 && !\(event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey\)\) this\.lastClicked = key;/);
});
