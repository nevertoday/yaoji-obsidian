// 今天的日记和「带到今天」：只处理文字，不碰 Obsidian。main.js 把读写交进来，测试里换成内存版。
// 文件里的样子和浏览器扩展一模一样（core/markdown-parser.js 是从扩展拷来的同一份）。

// 今天已经自动带过了：写在今天日记的事项标题下面（Obsidian 注释，阅读时看不见）。
// 插件和扩展都开着、或者两台电脑都开着时，谁先写下它谁带，另一边看到就不再带。
export const BROUGHT_MARK = '%%yaoji:brought%%';
// 一次自动带的上限，和扩展一样（#17）：多了只说一句，不动
export const AUTO_LIMIT = 20;
// 往前看多少天、连着多少天没有日记就停
export const LOOK_BACK_DAYS = 45;
export const MISSING_STREAK_LIMIT = 30;

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

// Templater 之类还没渲染完（文件里还有 <% %>）：先别动
export function isTemplatePending(content) {
  return /<%[\s\S]*?%>/.test(String(content || ''));
}

export function hasBroughtMark(content) {
  return String(content || '').includes(BROUGHT_MARK);
}

// 只有「带过了」这一笔的那一行（编辑器里要藏起来的就是它）
export function isBroughtLine(text) {
  return String(text || '').trim() === BROUGHT_MARK;
}

// 日记里没有事项这一节就加在末尾；有就原样不动
export function ensureSection(content, section, parser) {
  const text = String(content || '');
  if (parser.extractSection(text, section)) return text;
  const body = text.replace(/\s+$/, '');
  return body ? `${body}\n\n${section}\n` : `${section}\n`;
}

// 在事项标题下面写上「今天带过了」。没有这一节先加上
export function withBroughtMark(content, section, parser) {
  const text = ensureSection(content, section, parser);
  if (hasBroughtMark(text)) return text;
  const found = parser.extractSection(text, section);
  const lines = text.split('\n');
  lines.splice(found.startLine + 1, 0, BROUGHT_MARK);
  return lines.join('\n');
}

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
    if (!todo.checked) {
      pending.push({ ...todo, children: child.pending });
      child.remain.forEach((node) => remain.push(normalizeIndent(node, 0)));
    } else {
      remain.push({ ...todo, children: child.remain });
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
  return {
    pending,
    content: parser.replaceSection(content, section, parser.todosToMarkdown(remain))
  };
}

const textKey = (text) => String(text || '').split('\n').map((line) => line.trim().replace(/\s+/g, ' ')).join('\n').trim();

// 带来的放到今天最后；今天已经有一模一样没做完的就不再放一条
export function mergeIntoToday(content, moved, section, parser) {
  const text = ensureSection(content, section, parser);
  const found = parser.extractSection(text, section);
  const todos = parser.parseTodos(found.content);
  const open = new Set(todos.filter((t) => !t.checked).map((t) => textKey(t.text)));
  let added = 0;
  for (const todo of moved) {
    const key = textKey(todo.text);
    if (key && open.has(key)) continue;
    todos.push(todo);
    open.add(key);
    added += 1;
  }
  return { content: parser.replaceSection(text, section, parser.todosToMarkdown(todos)), added };
}

// 往前看：哪几天还有没做完的。只读不写
// io.read(path) → 文字，文件不存在返回 null
export async function planCarry({ io, settings, today, formatDate, parser, maxDays = LOOK_BACK_DAYS, all = false }) {
  const days = [];
  let missing = 0;
  for (let offset = 1; all || offset <= maxDays; offset++) {
    const path = notePath(settings, addDays(today, -offset), formatDate);
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

// 撤销时从今天拿掉带来的那几条：按文字认，每条只拿一次，只拿还没勾掉的
export function removeBrought(content, moved, section, parser) {
  const found = parser.extractSection(String(content || ''), section);
  if (!found) return content;
  const want = new Map();
  for (const todo of moved) {
    const key = textKey(todo.text);
    want.set(key, (want.get(key) || 0) + 1);
  }
  const todos = parser.parseTodos(found.content);
  const kept = [];
  for (let i = todos.length - 1; i >= 0; i--) {
    const key = textKey(todos[i].text);
    if (!todos[i].checked && want.get(key) > 0) {
      want.set(key, want.get(key) - 1);
      continue;
    }
    kept.unshift(todos[i]);
  }
  return parser.replaceSection(content, section, parser.todosToMarkdown(kept));
}

// 加一件事到今天最后
export function appendTodo(content, text, section, parser) {
  const value = String(text || '').trim();
  const base = ensureSection(content, section, parser);
  if (!value) return base;
  const found = parser.extractSection(base, section);
  const todos = parser.parseTodos(found.content);
  todos.push({ id: parser.generateId(), checked: false, text: value, highlighted: false, indent: 0, children: [] });
  return parser.replaceSection(base, section, parser.todosToMarkdown(todos));
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
  return parser.replaceSection(content, section, parser.todosToMarkdown(todos));
}

export function deleteTodo(content, path, expectText, section, parser) {
  const found = parser.extractSection(String(content || ''), section);
  if (!found) return null;
  const todos = parser.parseTodos(found.content);
  const parent = path.length > 1 ? todoAt(todos, path.slice(0, -1)) : null;
  const list = path.length > 1 ? parent?.children : todos;
  const index = path[path.length - 1];
  if (!list?.[index] || list[index].text !== expectText) return null;
  list.splice(index, 1);
  return parser.replaceSection(content, section, parser.todosToMarkdown(todos));
}

// 一天的事项（树）。没有这一节返回空
export function readTodos(content, section, parser) {
  const found = parser.extractSection(String(content || ''), section);
  return found ? parser.parseTodos(found.content) : [];
}
