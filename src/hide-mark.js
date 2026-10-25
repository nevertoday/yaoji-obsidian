// 编辑器里藏起「今天带过了」那一行（%%yaoji:brought%%）：文件里照旧写着，给另一台电脑和浏览器扩展看；
// 人在编辑模式下看不到这一行，光标上下移动也跳过它。阅读模式下 %% 注释本来就不显示。
import { EditorState, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { BROUGHT_MARK, isBroughtLine } from './today.js';

const hidden = Decoration.replace({ block: true });

function linesIn(doc, from, to) {
  const found = [];
  for (let number = doc.lineAt(from).number, last = doc.lineAt(to).number; number <= last; number += 1) {
    const line = doc.line(number);
    if (isBroughtLine(line.text)) found.push(hidden.range(line.from, line.to));
  }
  return found;
}

// 打开时整篇看一遍；之后每次改动只重看改到的那几行
function update(value, tr) {
  if (!tr.docChanged) return value;
  let next = value.map(tr.changes);
  const doc = tr.state.doc;
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    const from = doc.lineAt(fromB).from;
    const to = doc.lineAt(Math.min(toB, doc.length)).to;
    next = next.update({ filterFrom: from, filterTo: to, filter: () => false, add: linesIn(doc, from, to) });
  });
  return next;
}

const field = StateField.define({
  create: (state) => (state.doc.toString().includes(BROUGHT_MARK) ? Decoration.set(linesIn(state.doc, 0, state.doc.length)) : Decoration.none),
  update,
  provide: (self) => [
    EditorView.decorations.from(self),
    EditorView.atomicRanges.of((view) => view.state.field(self))
  ]
});

// 看不见的那一行像一堵墙：在它下面一行的行首按退格、在它上面一行的行尾按删除，都不能把字粘到它身上
// （粘上以后那一行就不算「带过了」，下面那件事也读不出来了）。粘上了就当场拆开，光标留在原来那一行
const keepOwnLine = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !(tr.isUserEvent('delete') || tr.isUserEvent('input'))) return tr;
  const doc = tr.state.doc;
  // 都按这次改完以后的位置算：after 为真的，光标正好在那里时跟到换行后面（字粘在标记后面的情况）
  const fixes = [];
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    for (let number = doc.lineAt(fromB).number, last = doc.lineAt(Math.min(toB, doc.length)).number; number <= last; number += 1) {
      const line = doc.line(number);
      const at = line.text.indexOf(BROUGHT_MARK);
      if (at < 0 || isBroughtLine(line.text)) continue;
      const start = line.from + at;
      const end = start + BROUGHT_MARK.length;
      if (line.text.slice(0, at).trim()) fixes.push({ from: start, after: false });
      if (line.text.slice(at + BROUGHT_MARK.length).trim()) fixes.push({ from: end, after: true });
    }
  });
  if (!fixes.length) return tr;
  let head = tr.newSelection.main.head;
  const original = head;
  for (const fix of fixes) if (fix.from < original || (fix.from === original && fix.after)) head += 1;
  return [tr, { changes: fixes.map((fix) => ({ from: fix.from, insert: '\n' })), selection: { anchor: head }, sequential: true }];
});

export const hideBroughtMark = [field, keepOwnLine];
