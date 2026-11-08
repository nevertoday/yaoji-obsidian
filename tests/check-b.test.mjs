import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 2026-11-07 和扩展的勾选方案 B 一样（照「邮件」的撤销发送）：没有缩短的细线，「撤销」是不动的灰色细字；
// 外面一层的事勾掉后留在原处 10 秒，到点连撤销一起淡出 0.2 秒再挪到最后
const view = readFileSync(new URL('../src/view.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('check B: no draining line; 撤销 is quiet grey 400, ink + underline on hover; ⋯ steps aside', () => {
  assert.doesNotMatch(view, /yaoji-row-timer/);
  assert.doesNotMatch(css, /yaoji-row-timer|yaoji-row-undo-timer|yaoji-row-undo-in/);
  const rule = css.match(/\.yaoji-today button\.yaoji-row-undo \{[^}]*\}/)[0];
  assert.match(rule, /color: var\(--yaoji-muted\);/);
  assert.match(rule, /font-weight: 400;/);
  assert.doesNotMatch(rule, /animation|text-decoration/);
  assert.match(css, /\.yaoji-today button\.yaoji-row-undo:hover \{\n  text-decoration: underline;/);
  assert.match(css, /\.yaoji-item\.has-row-undo \.yaoji-more \{\n  display: none;/);
  assert.match(css, /\.yaoji-item\.is-leaving,\n\.yaoji-today button\.yaoji-row-undo\.is-leaving \{\n  opacity: 0;\n  transition: opacity 200ms ease;/);
});

test('check B: a ticked top-level todo stays in place for 10s, then fades 0.2s and moves; subtasks keep 4s', () => {
  assert.match(view, /const DONE_STAY_MS = 10000;/);
  assert.match(view, /const DONE_LEAVE_MS = 200;/);
  assert.match(view, /const stays = path\.length === 1;\n {6}const ms = stays \? DONE_STAY_MS : ROW_UNDO_MS;/);
  assert.match(view, /const open = \(item\) => !item\.todo\.checked \|\| this\.isStaying\(item\.index, item\.todo\);/);
  assert.match(view, /row\.addClass\('is-leaving'\);\n {4}this\.rowUndoTimer = window\.setTimeout\(\(\) => \{ this\.clearRowUndo\(\); this\.redraw\(\); \}, DONE_LEAVE_MS\);/);
  assert.match(view, /if \(!row \|\| calm\) \{ this\.clearRowUndo\(\); if \(state\.stays\) this\.redraw\(\); return; \}/);
});
