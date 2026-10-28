// 今天的日记和「带到今天」：只处理文字，不碰 Obsidian。main.js 把读写交进来，测试里换成内存版。
// 文件里的样子和浏览器扩展一模一样（core/markdown-parser.js 是从扩展拷来的同一份）。
import TodoCount from './vendor/todo-count.js';

// 今天已经自动带过了：写在今天日记的事项标题下面（Obsidian 注释，阅读时看不见）。
// 插件和扩展都开着、或者两台电脑都开着时，谁先写下它谁带，另一边看到就不再带。
export const BROUGHT_MARK = '%%yaoji:brought%%';
// 一次自动带的上限，和扩展一样（#17）：多了只说一句，不动
export const AUTO_LIMIT = 20;
// 自己带只看最近 7 天（和浏览器扩展同一条，扩展的 GitHub 问题 #30）：更早攒下的一大堆不算，免得挡着昨天新剩的几件
export const AUTO_DAYS = 7;
// 往前看多少天、连着多少天没有日记就停
export const LOOK_BACK_DAYS = 45;
export const MISSING_STREAK_LIMIT = 30;
// 「全部带来」最多往前看这么多天；文件名连着这么多天都是看过的那几个（周记、月记、不带日期的文件名）就停
export const ALL_LOOK_BACK_DAYS = 3660;
export const REPEAT_STREAK_LIMIT = 400;

export function joinPath(folder, name) {
  const dir = String(folder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return dir ? `${dir}/${name}` : name;
}

// 某一天的日记路径。formatDate(date, pattern) 由外面给（Obsidian 里是 moment）
export function notePath(settings, date, formatDate) {
  const name = String(formatDate(date, settings.format || 'YYYY-MM-DD') || '').trim();
  return joinPath(settings.folder, name.endsWith('.md') ? name : `${name}.md`);
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function dateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Templater 还没渲染完：代码以外还有 Templater 的标签（<% tp.… %> 或 <%* … %>）就先别动。
// 代码里的、ERB 的 <%= %>、随手写的 <% %> 不算（不然每加一件都要白等几秒）
export function isTemplatePending(content) {
  let fence = '';
  const outside = String(content || '').split('\n').filter((line) => {
    const mark = line.match(/^[ \t]*(`{3,}|~{3,})/)?.[1] || '';
    if (fence) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = '';
      return false;
    }
    if (mark) { fence = mark; return false; }
    return true;
  }).join('\n').replace(/`[^`\n]*`/g, '');
  for (const match of outside.matchAll(/<%[-_]?([*+]?)([\s\S]*?)[-_]?%>/g)) {
    if (match[1] === '*' || /\btp\./.test(match[2])) return true;
  }
  return false;
}

export function hasBroughtMark(content) {
  return String(content || '').includes(BROUGHT_MARK);
}

// 只有「带过了」这一笔的那一行（编辑器里要藏起来的就是它）
export function isBroughtLine(text) {
  return String(text || '').trim() === BROUGHT_MARK;
}

// Windows 换行（\r\n）的日记，加的行也用 \r\n
const eolOf = (text) => (/\r\n/.test(text) ? '\r\n' : '\n');

// 日记里没有事项这一节就加在末尾；有就原样不动
export function ensureSection(content, section, parser) {
  const text = String(content || '');
  if (parser.extractSection(text, section)) return text;
  const eol = eolOf(text);
  const body = text.replace(/\s+$/, '');
  return body ? `${body}${eol}${eol}${section}${eol}` : `${section}\n`;
}

// 在事项标题下面写上「今天带过了」。没有这一节先加上
export function withBroughtMark(content, section, parser) {
  const text = ensureSection(content, section, parser);
  if (hasBroughtMark(text)) return text;
  const found = parser.extractSection(text, section);
  const lines = text.split('\n');
  lines.splice(found.startLine + 1, 0, BROUGHT_MARK + (eolOf(text) === '\r\n' ? '\r' : ''));
  return lines.join('\n');
}

// 把这一节写回去；写完读回来任务少了（被截断、错位）就不写，返回 null
function rewrite(content, section, todos, parser) {
  const generated = parser.todosToMarkdown(todos);
  const next = parser.replaceSection(content, section, generated);
  if (typeof parser.sectionRoundTrips === 'function' && !parser.sectionRoundTrips(next, section, generated)) return null;
  return next;
}

const countTasks = (text) => (String(text || '').match(/^[ \t]*[-*+] \[[ xX]\]/gm) || []).length;

// 新日记的内容：有模板就用模板（替换日记插件认的 {{date}} {{title}} {{time}}），再补上事项这一节
export function newNoteContent({ template = '', title = '', date, formatDate, section, parser }) {
  const filled = String(template || '').replace(/{{\s*(date|time|title)\s*(?::([^}]*))?}}/gi, (_m, kind, fmt) => {
    const name = kind.toLowerCase();
    if (name === 'title') return title;
    const pattern = (fmt || '').trim() || (name === 'date' ? 'YYYY-MM-DD' : 'HH:mm');
    return formatDate(date, pattern);
  });
  return ensureSection(filled, section, parser);
}

// ---------- 带到今天 ----------

function normalizeIndent(todo, target = 0) {
  const delta = target - Math.max(0, Number(todo?.indent) || 0);
  const clone = (node) => {
    const copy = { ...node, indent: Math.max(0, (Number(node?.indent) || 0) + delta), children: [] };
    copy.children = (node.children || []).map((child) => {
      const c = clone(child);
      if (c.indent <= copy.indent) c.indent = copy.indent + 1;
      return c;
    });
    return copy;
  };
  return clone(todo);
}

// 把一天的事项拆成「没做完的」和「留下的」：没做完的连同它没做完的子任务一起走，做完的子任务留在原来那天
// （和扩展 popup/modules/page-shared.js extractPendingTodos 同一套规则）
export function splitPending(list) {
  const remain = [];
  const pending = [];
  for (const todo of list || []) {
    const child = splitPending(todo.children || []);
    // 留在下面的子任务按这件的下一级重新排缩进（不然隔了一层做完的，孙任务会变成并列）
    const under = (nodes) => nodes.map((node) => normalizeIndent(node, (Number(todo.indent) || 0) + 1));
    if (!todo.checked) {
      pending.push({ ...todo, children: under(child.pending) });
      child.remain.forEach((node) => remain.push(normalizeIndent(node, 0)));
    } else {
      remain.push({ ...todo, children: under(child.remain) });
      child.pending.forEach((node) => pending.push(normalizeIndent(node, 0)));
    }
  }
  return { remain, pending };
}

// 一篇以前的日记：没做完的有哪些、拿走以后这篇变成什么样
export function takePending(content, section, parser) {
  const found = parser.extractSection(String(content || ''), section);
  if (!found) return { pending: [], content };
  const { remain, pending } = splitPending(parser.parseTodos(found.content));
  if (!pending.length) return { pending: [], content };
  // 写回去读不回来、或者拿走的加留下的对不上原来的任务数：这一天不动（宁可不带，也不丢）
  const after = rewrite(content, section, remain, parser);
  const left = after === null ? null : parser.extractSection(after, section);
  if (!left || countTasks(left.content) + countTasks(parser.todosToMarkdown(pending)) < countTasks(found.content)) {
    return { pending: [], content };
  }
  return { pending, content: after };
}

// 次数（「颈椎操 ×3」，扩展的 GitHub 问题 #46）不算：带过来的从 0 开始，和今天那件还是同一件
const textKey = (text) => TodoCount.parse(text).base.split('\n').map((line) => line.trim().replace(/\s+/g, ' ')).join('\n').trim();

// 带来的放到今天最后；今天已经有一模一样没做完的就不再放一条，它带来的子任务合到今天那一条下面（不丢）。
// record 记下真加进去的是哪几条（撤销时只拿这些）：
// { key, added: true, skip, children } = 整条是带来的，skip = 放进去时这一层前面已经有几条同样的字；
// { key, added: false, children } = 今天本来就有的那一条，只有 children 里的是带来的
export function mergeIntoToday(content, moved, section, parser) {
  const text = ensureSection(content, section, parser);
  const found = parser.extractSection(text, section);
  const todos = parser.parseTodos(found.content);
  const { added, record } = mergeList(todos, moved, 0);
  const next = rewrite(text, section, todos, parser);
  if (next === null) throw new Error('section did not read back');
  return { content: next, added, record };
}

function mergeList(list, moved, depth) {
  const entries = [];
  let added = 0;
  for (const todo of moved || []) {
    const key = textKey(todo.text);
    const same = key ? list.find((item) => !item.checked && textKey(item.text) === key) : null;
    if (same) {
      same.children = same.children || [];
      const inner = mergeList(same.children, todo.children || [], depth + 1);
      added += inner.added;
      const entry = entries.find((e) => e.node === same);
      if (entry) continue; // 同一次带来的两条一样的：前一条整条是新加的，记录在下面重新算
      if (inner.record.length) entries.push({ key, added: false, children: inner.record });
      continue;
    }
    const skip = list.filter((item) => textKey(item.text) === key).length;
    const node = resetCounts(normalizeIndent(todo, depth));
    list.push(node);
    entries.push({ key, added: true, skip, node });
    added += 1;
  }
  // 整条新加的：按最后的样子（可能又合进了子任务）记下整棵
  const snapshot = (node) => ({ key: textKey(node.text), added: true, skip: 0, children: (node.children || []).map(snapshot) });
  const record = entries.map((e) => (e.added ? { ...snapshot(e.node), skip: e.skip } : e));
  return { added, record };
}

// 带到今天的从 0 次开始（以前的次数留在那天的日记里）
function resetCounts(node) {
  node.text = TodoCount.withCount(node.text, 0);
  (node.children || []).forEach(resetCounts);
  return node;
}

// 往前看：哪几天还有没做完的。只读不写
// io.read(path) → 文字，文件不存在返回 null
export async function planCarry({ io, settings, today, formatDate, parser, maxDays = LOOK_BACK_DAYS, all = false }) {
  const days = [];
  let missing = 0;
  // 周记、月记、不带日期的文件名：好几天是同一个文件。和今天同一个文件的不算「以前」，看过的不再看
  const seen = new Set([notePath(settings, today, formatDate)]);
  let repeats = 0;
  for (let offset = 1; offset <= (all ? ALL_LOOK_BACK_DAYS : maxDays); offset++) {
    const path = notePath(settings, addDays(today, -offset), formatDate);
    if (seen.has(path)) {
      repeats += 1;
      if (repeats >= REPEAT_STREAK_LIMIT) break;
      continue;
    }
    seen.add(path);
    repeats = 0;
    const before = await io.read(path);
    if (before == null) {
      missing += 1;
      if (missing >= MISSING_STREAK_LIMIT) break;
      continue;
    }
    missing = 0;
    const { pending, content } = takePending(before, settings.section, parser);
    if (pending.length) days.push({ offset, path, before, after: content, pending });
  }
  const total = days.reduce((sum, day) => sum + day.pending.length, 0);
  return { days, total, onlyYesterday: days.length === 1 && days[0].offset === 1 };
}

// 侧边栏底下那句「以前还剩 1188 件没做完」点开的小菜单（和浏览器扩展同一条，GitHub 问题 #39 方案 A）：
// 最近 3 天、最近 7 天、全部各剩几件。days：[{ offset, pending }]，最近的在前
export function leftCounts(days) {
  const counts = { 3: 0, 7: 0, all: 0, onlyYesterday: days.length === 1 && days[0].offset === 1 };
  for (const day of days) {
    const count = day.pending?.length ?? Number(day.count) ?? 0;
    if (day.offset <= 3) counts[3] += count;
    if (day.offset <= 7) counts[7] += count;
    counts.all += count;
  }
  return counts;
}

// 菜单里的几行：件数一样的只留范围大的那行（三行都是 1188 件时只写「全部」）；0 件的不写
export function menuRanges(counts) {
  const rows = [];
  for (const range of ['all', 7, 3]) {
    const count = Number(counts?.[range]) || 0;
    if (!count || rows.some((row) => row.count === count)) continue;
    rows.unshift({ range, count });
  }
  return rows;
}

// 超过这么多件，菜单里那行先问一次「带来 N 件？再点一下」
export const MENU_CONFIRM_OVER = 50;

// 分成「自己带的」和「只说一句的」：最近 7 天剩的 20 件以内就带（canBring = 今天还没人带过）；
// 更早的、或者最近的太多，都留在原来那几天，侧边栏底下说一句
export function splitCarry(plan, { canBring = true } = {}) {
  const sum = (days) => days.reduce((count, day) => count + day.pending.length, 0);
  const pack = (days) => ({ days, total: sum(days), onlyYesterday: days.length === 1 && days[0].offset === 1 });
  const recent = plan.days.filter((day) => day.offset <= AUTO_DAYS);
  const recentTotal = sum(recent);
  // 从昨天往前一天天凑，凑满 20 件为止，哪天放不下就停在那天前面（和浏览器扩展同一条）：
  // 一篇日记里堆了一千多件，不再挡住昨天那几件；那一篇留着，侧边栏底下那句话说的就是它，点了去它那天
  const fit = [];
  let fitTotal = 0;
  for (const day of recent) {
    if (fitTotal + day.pending.length > AUTO_LIMIT) break;
    fit.push(day);
    fitTotal += day.pending.length;
  }
  // 今天别处已经带过（canBring = false）：凑上的那几天也当已经带走了，那句话只说剩下的
  const leftDays = fitTotal > 0 ? plan.days.filter((day) => !fit.includes(day)) : plan.days;
  return {
    bring: canBring && fitTotal > 0 ? pack(fit) : null,
    left: sum(leftDays) ? pack(leftDays) : null,
    recentTotal
  };
}

// 撤销时（今天这期间又改过）从今天拿掉带来的：只拿 mergeIntoToday 记下的那几条，
// 而且要和带来时一模一样（没勾、子任务没增没减）；今天本来就有的、用户动过的都留着，partial = 有没拿掉的
export function undoBrought(content, record, section, parser) {
  const found = parser.extractSection(String(content || ''), section);
  const entries = (record || []).map(toRecord);
  if (!found) return { content, partial: entries.length > 0 };
  const todos = parser.parseTodos(found.content);
  const partial = unmerge(todos, entries);
  const next = rewrite(content, section, todos, parser);
  return next === null ? { content, partial: true } : { content: next, partial };
}

export function removeBrought(content, record, section, parser) {
  return undoBrought(content, record, section, parser).content;
}

// 以前直接传带来的待办（没有 key）：当成整条带来的
function toRecord(item) {
  if (typeof item?.key === 'string') return item;
  return { key: textKey(item?.text), added: true, skip: 0, children: (item?.children || []).map(toRecord) };
}

// 和带来时一模一样：没勾，子任务一条不多一条不少、也都没动
function untouched(todo, entry) {
  const children = todo.children || [];
  return !todo.checked && textKey(todo.text) === entry.key && children.length === entry.children.length
    && children.every((child, i) => untouched(child, entry.children[i]));
}

function unmerge(list, entries) {
  let partial = false;
  for (const entry of [...entries].reverse()) {
    const same = list.filter((item) => textKey(item.text) === entry.key);
    if (entry.added) {
      // 前 skip 条是今天本来就有的；带来的放在最后，从后往前找
      const hit = same.slice(entry.skip || 0).reverse().find((item) => untouched(item, entry));
      if (hit) list.splice(list.indexOf(hit), 1);
      else partial = true;
    } else {
      const host = same.find((item) => !item.checked) || same[0];
      if (!host) { partial = true; continue; }
      host.children = host.children || [];
      if (unmerge(host.children, entry.children)) partial = true;
    }
  }
  return partial;
}

// 加一件事到今天最后
export function appendTodo(content, text, section, parser) {
  const value = String(text || '').trim();
  const base = ensureSection(content, section, parser);
  if (!value) return base;
  const found = parser.extractSection(base, section);
  const todos = parser.parseTodos(found.content);
  todos.push({ id: parser.generateId(), checked: false, text: value, highlighted: false, indent: 0, children: [] });
  const next = rewrite(base, section, todos, parser);
  if (next === null) throw new Error('section did not read back');
  return next;
}

// 加一件事（扩展的 GitHub 问题 #46）：已经在计次、还没做完的同一件（打的是「颈椎操」「颈椎操+1」），不加新的一行，那一行 +1
// → { content, counted: { text: 那一行原来的字, count: 现在几次 } | null }
export function countOrAppend(content, text, section, parser) {
  const value = String(text || '').trim();
  const found = value ? parser.extractSection(String(content || ''), section) : null;
  if (found) {
    const todos = parser.parseTodos(found.content);
    let hit = null;
    const walk = (items) => (items || []).some((todo) => {
      if (!todo.checked && TodoCount.parse(todo.text).count > 0 && TodoCount.sameThing(todo.text, value)) { hit = todo; return true; }
      return walk(todo.children);
    });
    walk(todos);
    if (hit) {
      const before = hit.text;
      const count = TodoCount.parse(before).count + 1;
      hit.text = TodoCount.withCount(before, count);
      const next = rewrite(content, section, todos, parser);
      if (next !== null) return { content: next, counted: { text: before, count } };
    }
  }
  return { content: appendTodo(content, value, section, parser), counted: null };
}

// 光标停在事项这一节最后一条下面（打开今天时用）：返回行号
export function sectionEndLine(content, section, parser) {
  const found = parser.extractSection(String(content || ''), section);
  if (!found) return 0;
  const lines = String(content).split('\n');
  let last = found.startLine;
  for (let i = found.startLine + 1; i < found.endLine; i++) {
    if (lines[i].trim()) last = i;
  }
  return last;
}

// ---------- 侧边栏改一件事 ----------
// path 是这件事在树里的位置（[2] = 第三件，[2, 0] = 第三件的第一个子任务）。
// 列表是按文件画的，文件一变就重画，所以 path 和文件对得上；再用文字核对一遍，对不上就不动（返回 null）。

export function todoAt(todos, path) {
  let list = todos;
  let todo = null;
  for (const index of path) {
    todo = list?.[index];
    if (!todo) return null;
    list = todo.children;
  }
  return todo;
}

export function editTodo(content, path, expectText, change, section, parser) {
  const found = parser.extractSection(String(content || ''), section);
  if (!found) return null;
  const todos = parser.parseTodos(found.content);
  const todo = todoAt(todos, path);
  if (!todo || todo.text !== expectText) return null;
  change(todo);
  return rewrite(content, section, todos, parser);
}

export function deleteTodo(content, path, expectText, section, parser) {
  return takeTodo(content, path, expectText, section, parser)?.content ?? null;
}

// 删一件（连子任务），把删掉的整块记下来（removed），撤销时 restoreTodo 原样放回
export function takeTodo(content, path, expectText, section, parser) {
  const found = parser.extractSection(String(content || ''), section);
  if (!found) return null;
  const todos = parser.parseTodos(found.content);
  const parent = path.length > 1 ? todoAt(todos, path.slice(0, -1)) : null;
  const list = path.length > 1 ? parent?.children : todos;
  const index = path[path.length - 1];
  if (!list?.[index] || list[index].text !== expectText) return null;
  const [todo] = list.splice(index, 1);
  const next = rewrite(content, section, todos, parser);
  if (next === null) return null;
  return { content: next, removed: { todo, path: [...path], parentText: parent ? parent.text : null } };
}

// 撤销删除（这期间文件又改过）：父任务还在（字对得上）就放回它下面原来的位置，不在就放到最后；子任务、勾选都在
export function restoreTodo(content, removed, section, parser) {
  const base = ensureSection(content, section, parser);
  const found = parser.extractSection(base, section);
  const todos = parser.parseTodos(found.content);
  const { todo, path, parentText } = removed;
  const parent = path.length > 1 ? todoAt(todos, path.slice(0, -1)) : null;
  if (parent && parent.text === parentText) {
    parent.children = parent.children || [];
    parent.children.splice(Math.min(path[path.length - 1], parent.children.length), 0, normalizeIndent(todo, path.length - 1));
  } else if (path.length === 1) {
    todos.splice(Math.min(path[0], todos.length), 0, normalizeIndent(todo, 0));
  } else {
    todos.push(normalizeIndent(todo, 0));
  }
  return rewrite(base, section, todos, parser) ?? content;
}

// 一天的事项（树）。没有这一节返回空
export function readTodos(content, section, parser) {
  const found = parser.extractSection(String(content || ''), section);
  return found ? parser.parseTodos(found.content) : [];
}
