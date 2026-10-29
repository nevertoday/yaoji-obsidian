// 带到今天、撤销、删除的数据安全：用户写的字一个都不能丢（对抗测试 2026-10-25）
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import moment from 'moment';
import {
  appendTodo, ensureSection, isTemplatePending, mergeIntoToday, planCarry, readTodos, removeBrought, restoreTodo,
  splitPending, takePending, takeTodo, undoBrought, withBroughtMark
} from '../src/today.js';

const require = createRequire(import.meta.url);
const MarkdownParser = require('../src/vendor/markdown-parser.js');
const parser = new MarkdownParser();
const S = '### 事项';
const formatDate = (date, pattern) => moment(date).format(pattern);

function countingIO(files) {
  const reads = [];
  return { reads, read: async (path) => { reads.push(path); return path in files ? files[path] : null; } };
}

test('周记格式（gggg-[W]ww）：和今天同一个文件的那几天不算「以前」，今天自己的待办不会被拿走', async () => {
  const settings = { folder: '日记', format: 'gggg-[W]ww', section: S };
  const today = new Date(2026, 9, 28, 9); // 周三，和 10/25 同一周
  const files = {
    '日记/2026-W44.md': `${S}\n- [ ] 周报\n- [x] 开会\n`,
    '日记/2026-W43.md': `${S}\n- [ ] 上周剩的\n`
  };
  const plan = await planCarry({ io: countingIO(files), settings, today, formatDate, parser, all: true });
  assert.deepEqual(plan.days.map((day) => day.path), ['日记/2026-W43.md']);
  assert.equal(plan.total, 1);
});

test('文件名不随日期变（[x]）或一周一轮（dddd）：全部带来也会停，同一个文件只读一次', async () => {
  const constant = countingIO({ '日记/x.md': `${S}\n- [ ] a\n` });
  const plan = await planCarry({ io: constant, settings: { folder: '日记', format: '[x]', section: S }, today: new Date(2026, 9, 25, 9), formatDate, parser, all: true });
  assert.equal(plan.total, 0);
  assert.equal(constant.reads.length, 0);

  const week = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const cyclic = countingIO(Object.fromEntries(week.map((d) => [`日记/${d}.md`, `${S}\n- [ ] ${d} 的事\n`])));
  const plan2 = await planCarry({ io: cyclic, settings: { folder: '日记', format: 'dddd', section: S }, today: new Date(2026, 9, 25, 9), formatDate, parser, all: true });
  assert.equal(plan2.days.length, 6);
  assert.equal(new Set(cyclic.reads).size, cyclic.reads.length);
});

test('今天已经有同样没做完的：带来的子任务合到今天那一条下面，不丢', () => {
  const yesterday = `${S}\n- [ ] 写周报\n    - [ ] 画图\n    - [ ] 找老板签字\n`;
  const taken = takePending(yesterday, S, parser);
  const merged = mergeIntoToday(`${S}\n- [ ] 写周报\n    - [ ] 画图\n`, taken.pending, S, parser);
  assert.equal(merged.content, `${S}\n- [ ] 写周报\n    - [ ] 画图\n    - [ ] 找老板签字\n`);
  assert.equal(taken.content, `${S}\n`);
});

test('两天都剩同一件：第二件的子任务也合进来', () => {
  const moved = [
    { text: '装修', checked: false, indent: 0, children: [{ text: '问报价', checked: false, indent: 1, children: [] }] },
    { text: '装修', checked: false, indent: 0, children: [{ text: '选瓷砖', checked: false, indent: 1, children: [] }] }
  ];
  const { content } = mergeIntoToday(`${S}\n`, moved, S, parser);
  assert.equal(content, `${S}\n- [ ] 装修\n    - [ ] 问报价\n    - [ ] 选瓷砖`);
});

test('没做完 > 做完 > 没做完：孙任务还挂在原来那件下面，不变成并列', () => {
  const content = `${S}\n- [ ] A\n    - [x] B\n        - [ ] C\n`;
  const { pending, content: left } = takePending(content, S, parser);
  assert.equal(parser.todosToMarkdown(pending), '- [ ] A\n    - [ ] C');
  assert.equal(left, `${S}\n- [x] B\n`);
  // 反过来：做完 > 没做完 > 做完，留下的那件也还在原来那件下面
  const reverse = splitPending(parser.parseTodos('- [x] A\n    - [ ] B\n        - [x] C'));
  assert.equal(parser.todosToMarkdown(reverse.remain), '- [x] A\n    - [x] C');
});

test('撤销（今天改过以后）：今天本来就有的同名待办和它的子任务不动', () => {
  const before = `${S}\n- [ ] 写周报\n    - [ ] 今天自己加的子任务\n`;
  const merged = mergeIntoToday(before, [{ text: '写周报', checked: false, indent: 0, children: [] }], S, parser);
  const edited = appendTodo(merged.content, '用户刚加的', S, parser);
  const undone = undoBrought(edited, merged.record, S, parser);
  assert.equal(undone.content, `${S}\n- [ ] 写周报\n    - [ ] 今天自己加的子任务\n- [ ] 用户刚加的\n`);
  assert.equal(undone.partial, false);
});

test('撤销（今天改过以后）：带来的拿掉；用户在带来的那件下面加了子任务，那件留着，说一句没全撤回', () => {
  const merged = mergeIntoToday(`${S}\n- [ ] 自己的\n`, [
    { text: '装修', checked: false, indent: 0, children: [] },
    { text: '交水费', checked: false, indent: 0, children: [{ text: '找单子', checked: false, indent: 1, children: [] }] }
  ], S, parser);
  const edited = merged.content.replace('- [ ] 装修', '- [ ] 装修\n    - [ ] 问三家报价（刚写的）');
  const undone = undoBrought(edited, merged.record, S, parser);
  assert.equal(undone.content, `${S}\n- [ ] 自己的\n- [ ] 装修\n    - [ ] 问三家报价（刚写的）\n`);
  assert.equal(undone.partial, true);
});

test('撤销（今天改过以后）：合到今天那件下面的子任务拿掉，那件本身和它原来的子任务留着', () => {
  const before = `${S}\n- [ ] 写周报\n    - [ ] 画图\n`;
  const merged = mergeIntoToday(before, [{ text: '写周报', checked: false, indent: 0, children: [{ text: '签字', checked: false, indent: 1, children: [] }] }], S, parser);
  const edited = appendTodo(merged.content, '新的', S, parser);
  assert.equal(undoBrought(edited, merged.record, S, parser).content, `${S}\n- [ ] 写周报\n    - [ ] 画图\n- [ ] 新的\n`);
});

test('撤销：今天原来就有一条一样的（勾掉了的），只拿带来的那条', () => {
  const merged = mergeIntoToday(`${S}\n- [x] 买菜\n`, [{ text: '买菜', checked: false, indent: 0, children: [] }], S, parser);
  // 用户把原来那条又取消了勾
  const edited = merged.content.replace('- [x] 买菜', '- [ ] 买菜');
  assert.equal(removeBrought(edited, merged.record, S, parser), `${S}\n- [ ] 买菜\n`);
});

test('删除再撤销（这期间又改过）：整块放回原处，子任务和勾选都在', () => {
  const content = `${S}\n- [ ] 旅行准备\n    - [ ] 订酒店\n    - [x] 买机票\n- [ ] 买菜\n`;
  const taken = takeTodo(content, [0], '旅行准备', S, parser);
  assert.equal(taken.content, `${S}\n- [ ] 买菜\n`);
  const edited = appendTodo(taken.content, '回邮件', S, parser);
  assert.equal(restoreTodo(edited, taken.removed, S, parser), `${S}\n- [ ] 旅行准备\n    - [ ] 订酒店\n    - [x] 买机票\n- [ ] 买菜\n- [ ] 回邮件\n`);
  // 子任务：父任务还在就放回父任务下面
  const child = takeTodo(content, [0, 1], '买机票', S, parser);
  assert.equal(restoreTodo(appendTodo(child.content, 'x', S, parser), child.removed, S, parser), `${S}\n- [ ] 旅行准备\n    - [ ] 订酒店\n    - [x] 买机票\n- [ ] 买菜\n- [ ] x\n`);
  // 父任务也没了：放到最后，不丢
  const gone = takeTodo(child.content, [0], '旅行准备', S, parser).content;
  assert.equal(restoreTodo(gone, child.removed, S, parser), `${S}\n- [ ] 买菜\n- [x] 买机票\n`);
});

test('写回去读不回来（会少任务）就不写：带走的不拿，加的报错', () => {
  const strict = Object.create(parser);
  strict.sectionRoundTrips = () => false;
  const content = `${S}\n- [ ] a\n`;
  assert.deepEqual(takePending(content, S, strict), { pending: [], content });
  assert.throws(() => appendTodo(content, 'b', S, strict));
  assert.throws(() => mergeIntoToday(content, [{ text: 'b', checked: false, indent: 0, children: [] }], S, strict));
});

test('Templater：只有真的 Templater 标签（tp. 或 <%* %>）才算没渲染完；代码里、ERB、普通文字不算', () => {
  assert.equal(isTemplatePending('<% tp.date.now() %>'), true);
  assert.equal(isTemplatePending('<%* tR += "x" %>'), true);
  assert.equal(isTemplatePending('# <%- tp.file.title -%>\n'), true);
  assert.equal(isTemplatePending('- [ ] 改 ERB 模板 `<%= name %>`'), false);
  assert.equal(isTemplatePending('```erb\n<%= user.name %>\n```'), false);
  assert.equal(isTemplatePending('```js\n<% tp.date.now() %>\n```'), false);
  assert.equal(isTemplatePending('折扣 <% 5 %>'), false);
});

// 读 \r\n 要扩展那边新的解析器（npm run sync-core 以后才有）
const synced = typeof MarkdownParser.fencedLines === 'function' || 'vendor 还没同步';

test('Windows 换行的日记：加记号、加事项这一节都还是 \\r\\n', { skip: synced === true ? false : synced }, () => {
  assert.equal(withBroughtMark(`${S}\r\n- [ ] a\r\n`, S, parser), `${S}\r\n%%yaoji:brought%%\r\n- [ ] a\r\n`);
  assert.equal(ensureSection('# 今天\r\n', S, parser), `# 今天\r\n\r\n${S}\r\n`);
  assert.equal(appendTodo(`${S}\r\n- [ ] a\r\n`, 'b', S, parser), `${S}\r\n- [ ] a\r\n- [ ] b\r\n`);
  assert.deepEqual(readTodos(`${S}\r\n- [ ] a\r\n`, S, parser).map((t) => t.text), ['a']);
});

// 对抗测试 2026-10-28：删除后这篇又改过再撤销，删掉那件下面的说明、图片跟着回到它下面（子任务下面的各回各的），每行照原样（Tab、几个空格）
test('删除后又改过再撤销：说明回到那件下面，一行一行照原样', () => {
  for (const [note, path, text] of [
    [`${S}\n- [ ] 写周报\n- [ ] 颈椎操\n每组 10 下\n![[动作.png]]\n- [ ] 喝水\n`, [1], '颈椎操'],
    [`${S}\n- [ ] 颈椎操\n说明\n\n- [ ] 喝水\n`, [0], '颈椎操'],
    [`${S}\n- [ ] 喝水\n- [ ] 装修\n总的说明\n\t- [ ] 问报价\n报价的说明\n\t\t第二行用 Tab\n- [ ] 买菜\n`, [1], '装修'],
    [`${S}\r\n- [ ] 喝水\r\n- [ ] 颈椎操\r\n说明\r\n## 后面\r\n`, [1], '颈椎操']
  ]) {
    const taken = takeTodo(note, path, text, S, parser);
    const back = restoreTodo(appendTodo(taken.content, '别处加的', S, parser), taken.removed, S, parser);
    assert.equal(back, appendTodo(note, '别处加的', S, parser));
  }
});
