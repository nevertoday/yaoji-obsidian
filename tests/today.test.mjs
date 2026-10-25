import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import moment from 'moment';
import {
  AUTO_LIMIT, BROUGHT_MARK, appendTodo, ensureSection, hasBroughtMark, isTemplatePending, mergeIntoToday,
  newNoteContent, notePath, planCarry, removeBrought, sectionEndLine, splitPending, takePending, withBroughtMark
} from '../src/today.js';

const require = createRequire(import.meta.url);
const MarkdownParser = require('../src/vendor/markdown-parser.js');
const parser = new MarkdownParser();
const formatDate = (date, pattern) => moment(date).format(pattern);
const settings = { folder: '日记', format: 'YYYY-MM-DD', section: '### 事项' };
const today = new Date(2026, 9, 25, 9, 0, 0);

function memoryIO(files) {
  return { read: async (path) => (path in files ? files[path] : null) };
}

test('日记路径：文件夹 + moment 格式 + .md，文件夹空着就在库根目录', () => {
  assert.equal(notePath(settings, today, formatDate), '日记/2026-10-25.md');
  assert.equal(notePath({ ...settings, folder: '/Daily/' }, today, formatDate), 'Daily/2026-10-25.md');
  assert.equal(notePath({ ...settings, folder: '' }, today, formatDate), '2026-10-25.md');
  assert.equal(notePath({ ...settings, format: 'YYYY/MM/YYYY-MM-DD' }, today, formatDate), '日记/2026/10/2026-10-25.md');
});

test('没有事项这一节就加在末尾，有就一字不动', () => {
  assert.equal(ensureSection('', '### 事项', parser), '### 事项\n');
  assert.equal(ensureSection('# 今天\n\n心情不错\n\n', '### 事项', parser), '# 今天\n\n心情不错\n\n### 事项\n');
  const has = '# 今天\n\n### 事项\n- [ ] 买菜\n\n### 想法\n随便写写\n';
  assert.equal(ensureSection(has, '### 事项', parser), has);
});

test('新日记：替换日记插件模板里的 {{date}} {{title}} {{time}}，再补事项', () => {
  const content = newNoteContent({
    template: '# {{title}}\n日期 {{date}} · {{date:dddd}} · {{time:HH}}点\n',
    title: '2026-10-25', date: today, formatDate, section: '### 事项', parser
  });
  assert.equal(content, '# 2026-10-25\n日期 2026-10-25 · Sunday · 09点\n\n### 事项\n');
  assert.equal(newNoteContent({ date: today, formatDate, section: '### 事项', parser }), '### 事项\n');
});

test('模板里事项已经有了就不再加一遍', () => {
  const content = newNoteContent({ template: '## 今天\n### 事项\n- [ ] 晨跑\n', date: today, formatDate, section: '### 事项', parser });
  assert.equal(content, '## 今天\n### 事项\n- [ ] 晨跑\n');
});

test('Templater 还没渲染完能认出来', () => {
  assert.equal(isTemplatePending('<% tp.date.now() %>'), true);
  assert.equal(isTemplatePending('# 2026-10-25'), false);
});

test('「带过了」记号写在事项标题下面，只写一次，扩展的解析器读事项时不受影响', () => {
  const marked = withBroughtMark('# 今天\n\n### 事项\n- [ ] 买菜\n', '### 事项', parser);
  assert.equal(marked, `# 今天\n\n### 事项\n${BROUGHT_MARK}\n- [ ] 买菜\n`);
  assert.equal(withBroughtMark(marked, '### 事项', parser), marked);
  assert.equal(hasBroughtMark(marked), true);
  const todos = parser.parseTodos(parser.extractSection(marked, '### 事项').content);
  assert.deepEqual(todos.map((todo) => todo.text), ['买菜']);
  // 改了事项再写回去，记号还在
  const rewritten = parser.replaceSection(marked, '### 事项', parser.todosToMarkdown([...todos, { text: '回邮件', checked: false, indent: 0, children: [] }]));
  assert.ok(rewritten.includes(BROUGHT_MARK));
  assert.ok(withBroughtMark('', '### 事项', parser).startsWith(`### 事项\n${BROUGHT_MARK}`));
});

test('拆没做完的：没做完的带着它没做完的子任务走，做完的子任务留下', () => {
  const content = [
    '### 事项',
    '- [ ] 写周报',
    '    - [x] 收集数据',
    '    - [ ] 画图',
    '- [x] 开会',
    '    - [ ] 会后发纪要',
    '- [x] 买菜',
    ''
  ].join('\n');
  const { pending, content: after } = takePending(content, '### 事项', parser);
  assert.deepEqual(pending.map((todo) => [todo.text, todo.children.map((child) => child.text)]), [
    ['写周报', ['画图']],
    ['会后发纪要', []]
  ]);
  assert.equal(after, '### 事项\n- [x] 收集数据\n- [x] 开会\n- [x] 买菜\n');
  // 和扩展同一套规则
  assert.equal(splitPending(parser.parseTodos(content)).pending.length, 2);
});

test('带过来放到今天最后，今天已经有一样没做完的就不重复', () => {
  const todayContent = '### 事项\n- [ ] 买菜\n- [x] 晨跑\n';
  const moved = [
    { text: '买菜', checked: false, indent: 0, children: [] },
    { text: '晨跑', checked: false, indent: 0, children: [] },
    { text: '交房租', checked: false, indent: 0, children: [] }
  ];
  const { content, added } = mergeIntoToday(todayContent, moved, '### 事项', parser);
  assert.equal(added, 2);
  assert.equal(content, '### 事项\n- [ ] 买菜\n- [x] 晨跑\n- [ ] 晨跑\n- [ ] 交房租\n');
});

test('往前看：最近的在前，跳过没有日记的天，只读不写', async () => {
  const files = {
    '日记/2026-10-24.md': '### 事项\n- [ ] 昨天的\n- [x] 做完的\n',
    '日记/2026-10-22.md': '# 22\n\n### 事项\n- [ ] 前天的\n',
    '日记/2026-10-21.md': '### 事项\n- [x] 都做完了\n'
  };
  const snapshot = JSON.stringify(files);
  const plan = await planCarry({ io: memoryIO(files), settings, today, formatDate, parser });
  assert.equal(plan.total, 2);
  assert.equal(plan.onlyYesterday, false);
  assert.deepEqual(plan.days.map((day) => [day.offset, day.path]), [[1, '日记/2026-10-24.md'], [3, '日记/2026-10-22.md']]);
  assert.equal(plan.days[0].after, '### 事项\n- [x] 做完的\n');
  assert.equal(JSON.stringify(files), snapshot);
});

test('只有昨天剩的：onlyYesterday，用来说「昨天剩」还是「之前剩」', async () => {
  const plan = await planCarry({ io: memoryIO({ '日记/2026-10-24.md': '### 事项\n- [ ] a\n' }), settings, today, formatDate, parser });
  assert.equal(plan.onlyYesterday, true);
  assert.equal(plan.total, 1);
});

test('连着 30 天没有日记就停（全部带来时）', async () => {
  const files = { '日记/2026-10-24.md': '### 事项\n- [ ] 近的\n', '日记/2026-08-01.md': '### 事项\n- [ ] 太远了\n' };
  const plan = await planCarry({ io: memoryIO(files), settings, today, formatDate, parser, all: true });
  assert.deepEqual(plan.days.map((day) => day.path), ['日记/2026-10-24.md']);
});

test('自动带的上限和扩展一样是 20', () => {
  assert.equal(AUTO_LIMIT, 20);
});

test('撤销：从今天拿掉带来的那几条，每条只拿一次，勾掉了的不拿', () => {
  const content = '### 事项\n- [ ] 买菜\n- [ ] 交房租\n- [x] 写周报\n- [ ] 买菜\n';
  const moved = [
    { text: '买菜', checked: false, indent: 0, children: [] },
    { text: '写周报', checked: false, indent: 0, children: [] }
  ];
  assert.equal(removeBrought(content, moved, '### 事项', parser), '### 事项\n- [ ] 买菜\n- [ ] 交房租\n- [x] 写周报\n');
});

test('加一件事：放到最后，没有事项这一节先加上；用户写的 %%yaoji: 不会变成内部记号', () => {
  assert.equal(appendTodo('### 事项\n- [ ] 买菜\n', '回邮件', '### 事项', parser), '### 事项\n- [ ] 买菜\n- [ ] 回邮件\n');
  assert.equal(appendTodo('# 今天\n', '回邮件', '### 事项', parser), '# 今天\n\n### 事项\n- [ ] 回邮件');
  const tricky = appendTodo('### 事项\n', '看 %%yaoji:memory%%', '### 事项', parser);
  const [todo] = parser.parseTodos(parser.extractSection(tricky, '### 事项').content);
  assert.equal(todo.text, '看 %%yaoji:memory%%');
  assert.equal(todo.memorySent, false);
});

test('打开今天时光标停在事项最后一条', () => {
  const content = '# 今天\n\n### 事项\n- [ ] 买菜\n- [ ] 回邮件\n\n### 想法\n';
  assert.equal(sectionEndLine(content, '### 事项', parser), 4);
  assert.equal(sectionEndLine('### 事项\n', '### 事项', parser), 0);
});

import { deleteTodo, editTodo, readTodos, todoAt } from '../src/today.js';

test('侧边栏勾选 / 星标：按位置找到那件，文字对得上才改', () => {
  const content = '# 今天\n\n### 事项\n- [ ] 写周报\n    - [ ] 画图\n- [ ] 买菜\n\n### 想法\n不动\n';
  const checked = editTodo(content, [0, 0], '画图', (todo) => { todo.checked = true; }, '### 事项', parser);
  assert.equal(checked, '# 今天\n\n### 事项\n- [ ] 写周报\n    - [x] 画图\n- [ ] 买菜\n\n### 想法\n不动\n');
  const starred = editTodo(content, [1], '买菜', (todo) => { todo.highlighted = true; }, '### 事项', parser);
  assert.ok(starred.includes('- [ ] ==买菜=='));
  // 文件刚被别处改过、位置上已经不是这件了：不动
  assert.equal(editTodo(content, [1], '回邮件', (todo) => { todo.checked = true; }, '### 事项', parser), null);
  assert.equal(todoAt(readTodos(content, '### 事项', parser), [0, 0]).text, '画图');
});

test('侧边栏删除：只删那一件，子任务跟着走，别的不动', () => {
  const content = '### 事项\n- [ ] 写周报\n    - [ ] 画图\n- [ ] 买菜\n';
  assert.equal(deleteTodo(content, [0], '写周报', '### 事项', parser), '### 事项\n- [ ] 买菜\n');
  assert.equal(deleteTodo(content, [0, 0], '画图', '### 事项', parser), '### 事项\n- [ ] 写周报\n- [ ] 买菜\n');
  assert.equal(deleteTodo(content, [1], '不对', '### 事项', parser), null);
});
