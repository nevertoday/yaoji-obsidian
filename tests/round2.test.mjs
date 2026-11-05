import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownParser from '../src/vendor/markdown-parser.js';
import { editTodos, insertTodo, moveTodo, takeTodos } from '../src/today.js';

// 侧边栏第二轮（2026-11-05）：排顺序、两件之间加一条、加子任务、多选批量——都是改日记文件，下面的说明跟着那件走
const parser = new MarkdownParser();
const S = '## 事项';
const note = `${S}\n- [ ] a\n说明一行\n- [ ] b\n\t- [ ] b1\n- [ ] c\n`;

test('moveTodo moves an item (with its notes and subtasks) within its level', () => {
  assert.equal(moveTodo(note, [0], 'a', null, S, parser), `${S}\n- [ ] b\n\t- [ ] b1\n- [ ] c\n- [ ] a\n说明一行\n`);
  assert.equal(moveTodo(note, [2], 'c', 0, S, parser), `${S}\n- [ ] c\n- [ ] a\n说明一行\n- [ ] b\n\t- [ ] b1\n`);
  assert.equal(moveTodo(note, [1], 'b', 1, S, parser), note, 'dropping where it already is changes nothing');
  assert.equal(moveTodo(note, [1], '别的字', 0, S, parser), null, 'text changed elsewhere → no move');
});

test('insertTodo adds below (same level) or as the last subtask, and says where', () => {
  const below = insertTodo(note, [0], 'a', '新的一条', 'below', S, parser);
  assert.equal(below.content, `${S}\n- [ ] a\n说明一行\n- [ ] 新的一条\n- [ ] b\n\t- [ ] b1\n- [ ] c\n`);
  assert.deepEqual(below.path, [1]);
  const child = insertTodo(note, [1], 'b', '子任务二', 'child', S, parser);
  assert.match(child.content, /- \[ \] b\n\t- \[ \] b1\n(\t| {4})- \[ \] 子任务二\n- \[ \] c/);
  assert.deepEqual(child.path, [1, 1]);
  assert.equal(insertTodo(note, [0], 'a', '   ', 'below', S, parser), null);
});

test('editTodos changes several at once, or none if one no longer matches', () => {
  const done = editTodos(note, [{ path: [0], text: 'a' }, { path: [1, 0], text: 'b1' }], (todo) => { todo.checked = true; }, S, parser);
  assert.match(done, /- \[x\] a\n说明一行\n- \[ \] b\n\t- \[x\] b1/);
  assert.equal(editTodos(note, [{ path: [0], text: 'a' }, { path: [2], text: '不对' }], () => {}, S, parser), null);
});

test('takeTodos removes several (a picked subtask of a picked parent is not removed twice)', () => {
  const taken = takeTodos(note, [{ path: [1, 0], text: 'b1' }, { path: [1], text: 'b' }, { path: [2], text: 'c' }], S, parser);
  assert.equal(taken.content.trimEnd(), `${S}\n- [ ] a\n说明一行`);
  assert.deepEqual(taken.removed.map((todo) => todo.text), ['b', 'c']);
});
