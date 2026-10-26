// 编辑器里「带过了」那一行：只在它被粘到别的字上时拆开；别处写着的 %%yaoji:brought%% 不碰（对抗测试 2026-10-25）
// 插件自己不装 CodeMirror（Obsidian 自带），这里借浏览器扩展仓库装的那份；找不到就跳过
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const extension = resolve(process.env.YAOJI_EXTENSION_DIR || '../插件-obsidian日记todo');
const found = existsSync(resolve(extension, 'node_modules/@codemirror/state')) && existsSync(resolve(extension, 'node_modules/@codemirror/view'));
let EditorState = null;
let hideBroughtMark = null;
if (found) {
  const parent = pathToFileURL(resolve(extension, 'package.json')).href;
  register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@codemirror/')) return next(specifier, { ...context, parentURL: ${JSON.stringify(parent)} });
  return next(specifier, context);
}`));
  ({ EditorState } = await import('@codemirror/state'));
  ({ hideBroughtMark } = await import('../src/hide-mark.js'));
}

const skip = !found && '没找到扩展仓库里的 @codemirror';

function edit(doc, change, selection, userEvent) {
  const state = EditorState.create({ doc, extensions: hideBroughtMark });
  return state.update({ changes: change, selection, userEvent }).state.doc.toString();
}

test('别的笔记、任务文字里写着标记：打字不会把那一行拆开', { skip }, () => {
  const doc = 'The plugin writes `%%yaoji:brought%%` under the heading.';
  assert.equal(edit(doc, { from: doc.length, insert: '!' }, { anchor: doc.length + 1 }, 'input.type'), `${doc}!`);
  const task = '- [ ] 解释 %%yaoji:brought%% 是什么';
  assert.equal(edit(task, { from: task.length, insert: 'x' }, { anchor: task.length + 1 }, 'input.type'), `${task}x`);
});

test('单独一行的标记被退格、删除粘上了：当场拆回单独一行', { skip }, () => {
  const doc = '### 事项\n%%yaoji:brought%%\n- [ ] a';
  const at = doc.indexOf('- [ ]');
  // 下面一行行首退格
  assert.equal(edit(doc, { from: at - 1, to: at }, { anchor: at - 1 }, 'delete.backward'), doc);
  // 上面一行行尾按删除
  const end = doc.indexOf('\n');
  assert.equal(edit(doc, { from: end, to: end + 1 }, { anchor: end }, 'delete.forward'), doc);
});
