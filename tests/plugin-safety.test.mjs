// main.js / view.js 走真代码：假的 obsidian、假的库（内存里的文件）。带到今天、撤销、删除、Templater、时区、跨零点（对抗测试 2026-10-25）
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import realMoment from 'moment';

const stub = `
export const moment = (...a) => globalThis.__moment(...a);
export function normalizePath(p) { return String(p).replace(/\\\\/g, '/').replace(/\\/+/g, '/').replace(/^\\/|\\/$/g, '') || '/'; }
export class TAbstractFile { constructor(path) { this.path = path; this.name = path.split('/').pop(); } }
export class TFile extends TAbstractFile {}
export class TFolder extends TAbstractFile {}
export class Notice { constructor(fragment) { this.fragment = fragment; globalThis.__notices.push(this); } hide() {} }
export class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; }
  async loadData() { return globalThis.__data; } async saveData(d) { globalThis.__data = d; }
  addSettingTab() {} registerView() {} registerEditorExtension() {} addRibbonIcon() {} addCommand() {}
  registerInterval() {} registerDomEvent() {} registerObsidianProtocolHandler() {} registerEvent() {}
}
export class Modal { constructor(app) { this.app = app; } open() {} close() {} }
export class FuzzySuggestModal extends Modal {}
export class PluginSettingTab { constructor(app) { this.app = app; } }
export class Setting {}
export class ItemView { constructor(leaf) { this.leaf = leaf; this.app = leaf.app; } registerEvent() {} }
export const MarkdownRenderer = { render: async () => {} };
export class Menu {}
export function setIcon() {}
export const Platform = { isDesktopApp: false };
export async function requestUrl() { throw new Error('offline'); }
export function getLanguage() { return 'zh'; }
`;
const cm = `
export const EditorState = { transactionFilter: { of: () => null } };
export const StateField = { define: () => ({}) };
export const Decoration = { replace: () => ({ range: () => null }), set: () => null, none: null };
export const EditorView = { decorations: { from: () => null }, atomicRanges: { of: () => null } };
`;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'obsidian') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(stub)}), shortCircuit: true };
  if (specifier.startsWith('@codemirror/')) return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(cm)}), shortCircuit: true };
  return next(specifier, context);
}`));

// 够 showNotice 用的假 DOM
function element(tag) {
  const el = {
    tag, children: [], listeners: {}, className: '', _text: '',
    get textContent() { return this._text + this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); },
    set textContent(v) { this._text = String(v); },
    append(...nodes) { this.children.push(...nodes); },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    querySelector(sel) { for (const c of this.children) { if (typeof c === 'string') continue; if (c.tag === sel) return c; const f = c.querySelector(sel); if (f) return f; } return null; },
    click() { this.listeners.click?.({ stopPropagation() {}, preventDefault() {} }); }
  };
  return el;
}
globalThis.window = globalThis;
globalThis.document = { createDocumentFragment: () => element('#fragment'), createElement: element };
globalThis.localStorage = { getItem: () => 'zh' };
const realSetTimeout = setTimeout;
// 插件里的等待（等 Templater）放快 100 倍
window.setTimeout = (fn, ms) => realSetTimeout(fn, (ms || 0) / 100);
window.setInterval = () => 0;
globalThis.__notices = [];

let clock = new Date(2026, 9, 25, 9, 0, 0);
const setClock = (date) => { clock = date; };
let momentImpl = realMoment;
globalThis.__moment = (...a) => (a.length ? momentImpl(...a) : momentImpl(clock));

const { default: Plugin } = await import('../src/main.js');
const { TodayView } = await import('../src/view.js');
const { readTodos } = await import('../src/today.js');
const { TFile, TFolder } = await import('obsidian');

const S = '### 事项';
const sleep = (ms) => new Promise((resolve) => realSetTimeout(resolve, ms));

function makeVault(files) {
  const store = new Map(Object.entries(files));
  const nodes = new Map();
  const node = (p) => { if (!nodes.has(p)) nodes.set(p, new TFile(p)); return nodes.get(p); };
  return {
    store,
    getAbstractFileByPath(p) { return store.has(p) ? node(p) : (p === '日记' ? new TFolder(p) : null); },
    async read(f) { return store.get(f.path); },
    async modify(f, data) { store.set(f.path, data); },
    async process(f, fn) { const next = fn(store.get(f.path)); store.set(f.path, next); return next; },
    async create(p, data) { if (store.has(p)) throw new Error('exists'); store.set(p, data); return node(p); },
    async createFolder() {},
    on() { return {}; }
  };
}

async function makePlugin(files, settings = {}) {
  const vault = makeVault(files);
  const app = {
    vault,
    workspace: { getLeavesOfType: () => [], onLayoutReady() {} },
    metadataCache: { getFirstLinkpathDest: () => null },
    plugins: { plugins: {}, getPlugin: () => null },
    internalPlugins: { getPluginById: () => null }
  };
  globalThis.__data = { adoptChecked: true, ...settings };
  const plugin = new Plugin(app, { id: 'yaoji-today' });
  await plugin.onload();
  globalThis.__notices.length = 0;
  return { plugin, vault };
}

const messages = () => globalThis.__notices.map((n) => n.fragment.textContent);
const undoButton = () => globalThis.__notices.map((n) => n.fragment.querySelector('button')).find(Boolean);

test('周记格式：命令「把没做完的带到今天」不会拿走这一周自己的待办', async () => {
  setClock(new Date(2026, 9, 28, 9));
  const week = `# 本周\n${S}\n- [ ] 周报\n- [ ] 交房租\n- [x] 开会\n`;
  const { plugin, vault } = await makePlugin({ '日记/2026-W44.md': week, '日记/2026-W43.md': `${S}\n- [ ] 上周的\n` }, { format: 'gggg-[W]ww' });
  await plugin.carryNow();
  assert.equal(vault.store.get('日记/2026-W44.md'), `# 本周\n${S}\n- [ ] 周报\n- [ ] 交房租\n- [x] 开会\n- [ ] 上周的\n`);
  assert.equal(vault.store.get('日记/2026-W43.md'), `${S}\n`);
  // 自动带也一样
  vault.store.set('日记/2026-W43.md', `${S}\n- [x] 都做完了\n`);
  plugin.handledKey = '';
  await plugin.ensureToday({ carry: true });
  assert.match(vault.store.get('日记/2026-W44.md'), /- \[ \] 周报\n- \[ \] 交房租/);
  setClock(new Date(2026, 9, 25, 9));
});

test('文件名不随日期变：命令会停下来，不会卡死', async () => {
  const { plugin, vault } = await makePlugin({ '日记/x.md': `${S}\n- [ ] a\n` }, { format: '[x]' });
  await plugin.carryNow();
  assert.equal(vault.store.get('日记/x.md'), `${S}\n- [ ] a\n`);
  assert.deepEqual(messages(), ['以前的都做完了']);
});

test('今天已经有同名的：昨天这件的子任务带过来，不丢', async () => {
  const { plugin, vault } = await makePlugin({
    '日记/2026-10-24.md': `${S}\n- [ ] 写周报\n    - [ ] 画图\n    - [ ] 找老板签字\n`,
    '日记/2026-10-25.md': `${S}\n- [ ] 写周报\n`
  });
  await plugin.ensureToday({ carry: true });
  assert.equal(vault.store.get('日记/2026-10-25.md'), `${S}\n%%yaoji:brought%%\n- [ ] 写周报\n    - [ ] 画图\n    - [ ] 找老板签字\n`);
  assert.equal(vault.store.get('日记/2026-10-24.md'), `${S}\n`);
});

test('带来以后改了今天再撤销：今天自己的同名待办和子任务都在', async () => {
  const today = `${S}\n- [ ] 写周报\n    - [ ] 我今天写的子任务：联系财务\n`;
  const { plugin, vault } = await makePlugin({ '日记/2026-10-24.md': `${S}\n- [ ] 写周报\n`, '日记/2026-10-25.md': today });
  await plugin.ensureToday({ carry: true });
  const undo = undoButton();
  await plugin.addTodo('顺手加一件');
  undo.click();
  await sleep(20);
  assert.equal(vault.store.get('日记/2026-10-25.md'), `${S}\n%%yaoji:brought%%\n- [ ] 顺手加一件\n- [ ] 写周报\n    - [ ] 我今天写的子任务：联系财务\n`);
  assert.equal(vault.store.get('日记/2026-10-24.md'), `${S}\n- [ ] 写周报\n`);
});

test('带来以后在带来的那件下面加了子任务再撤销：新加的子任务不丢', async () => {
  const { plugin, vault } = await makePlugin({ '日记/2026-10-24.md': `${S}\n- [ ] 装修\n` });
  await plugin.ensureToday({ carry: true });
  const path = '日记/2026-10-25.md';
  vault.store.set(path, vault.store.get(path).replace('- [ ] 装修', '- [ ] 装修\n    - [ ] 问三家报价（刚写的）'));
  undoButton().click();
  await sleep(20);
  assert.match(vault.store.get(path), /- \[ \] 装修\n    - \[ \] 问三家报价（刚写的）/);
  assert.equal(vault.store.get('日记/2026-10-24.md'), `${S}\n- [ ] 装修\n`);
  assert.ok(messages().includes('有的日记这期间改过，那部分没撤回'));
});

test('Templater 等了还没渲染完：不带、不加，什么都不写', async () => {
  const raw = `<% tp.system.prompt("今天心情") %>\n${S}\n`;
  const { plugin, vault } = await makePlugin({ '日记/2026-10-24.md': `${S}\n- [ ] 交水费\n`, '日记/2026-10-25.md': raw });
  await plugin.ensureToday({ carry: true });
  assert.equal(vault.store.get('日记/2026-10-25.md'), raw);
  assert.equal(vault.store.get('日记/2026-10-24.md'), `${S}\n- [ ] 交水费\n`);
  await plugin.addTodo('想加的一件');
  assert.equal(vault.store.get('日记/2026-10-25.md'), raw);
  assert.match(messages().join('\n'), /写不进今天的日记/);
  // Templater 写完以后照常带
  vault.store.set('日记/2026-10-25.md', `开心\n${S}\n`);
  await plugin.ensureToday({ carry: true });
  assert.match(vault.store.get('日记/2026-10-25.md'), /- \[ \] 交水费/);
});

test('日记里只是提到 <% %>（代码里）：加一件事不用等', async () => {
  const { plugin, vault } = await makePlugin({ '日记/2026-10-25.md': `${S}\n- [ ] 改 ERB 模板 \`<%= name %>\`\n` });
  const started = Date.now();
  await plugin.addTodo('x');
  assert.ok(Date.now() - started < 40);
  assert.match(vault.store.get('日记/2026-10-25.md'), /- \[ \] x/);
});

test('什么都没带成（今天已经都有）：不说「带来了…」', async () => {
  const { plugin } = await makePlugin({ '日记/2026-10-24.md': `${S}\n- [ ] 买菜\n`, '日记/2026-10-25.md': `${S}\n- [ ] 买菜\n` });
  const file = await plugin.ensureToday({ carry: false });
  const { planCarry } = await import('../src/today.js');
  const plan = await planCarry({ io: plugin.io(), settings: plugin.settings, today: plugin.now(), parser: plugin.parser, formatDate: (d, p) => plugin.formatDate(d, p) });
  // 看完到带之间昨天又改过：昨天不动，今天也没加 → 什么都没发生
  plugin.app.vault.store.set('日记/2026-10-24.md', `${S}\n- [ ] 买菜\n- [ ] 新的\n`);
  await plugin.applyCarry(file, plan);
  assert.deepEqual(messages(), []);
});

test('Obsidian 的时区和电脑不一样：今天的日记按 Obsidian 的日子', async () => {
  // 假的 moment-timezone：默认时区和电脑差 9 个钟头以上
  const local = -new Date(2026, 9, 25).getTimezoneOffset();
  const zone = local >= 0 ? local - 12 * 60 : local + 12 * 60;
  momentImpl = (...a) => {
    if (Array.isArray(a[0])) return realMoment.utc(a[0]).utcOffset(zone, true);
    return realMoment(...a).utcOffset(zone);
  };
  try {
    const { plugin } = await makePlugin({});
    for (const instant of [Date.UTC(2026, 9, 25, 2), Date.UTC(2026, 9, 25, 14), Date.UTC(2026, 9, 25, 22)]) {
      setClock(new Date(instant));
      const expected = realMoment(instant).utcOffset(zone).format('YYYY-MM-DD');
      assert.equal(plugin.pathFor(plugin.now()), `日记/${expected}.md`);
    }
  } finally {
    momentImpl = realMoment;
    setClock(new Date(2026, 9, 25, 9));
  }
});

test('只写了字的事项标题（data.json 里是「事项」）：打开时补成 ### 事项，不会每次多加一行', async () => {
  const { plugin, vault } = await makePlugin({ '日记/2026-10-25.md': 'hello\n' }, { section: '事项' });
  assert.equal(plugin.settings.section, '### 事项');
  await plugin.ensureToday({ carry: false });
  plugin.handledKey = '';
  await plugin.ensureToday({ carry: false });
  assert.equal(vault.store.get('日记/2026-10-25.md'), `hello\n\n${S}\n`);
});

function makeView(plugin) {
  const view = new TodayView({ app: plugin.app }, plugin);
  view.redraw = async () => {};
  return view;
}

test('侧边栏删除带子任务的一件，再改别的，再撤销：整块回来，勾选也在', async () => {
  const content = `${S}\n- [ ] 旅行准备\n    - [ ] 订酒店 1000 元以内\n    - [x] 买机票\n- [ ] 买菜\n`;
  const { plugin, vault } = await makePlugin({ '日记/2026-10-25.md': content });
  const view = makeView(plugin);
  const rows = readTodos(content, S, plugin.parser);
  await view.remove(rows[0], [0], '日记/2026-10-25.md');
  const firstUndo = undoButton();
  await plugin.addTodo('回邮件');
  firstUndo.click();
  await sleep(20);
  assert.equal(vault.store.get('日记/2026-10-25.md'), `${S}\n- [ ] 旅行准备\n    - [ ] 订酒店 1000 元以内\n    - [x] 买机票\n- [ ] 回邮件\n- [ ] 买菜\n`);
});

test('过了零点还没重画：点的是昨天画出来的那一行，就改昨天那篇', async () => {
  const yesterday = `${S}\n- [x] 买菜\n- [ ] 打电话\n`;
  const todayNote = `${S}\n- [x] 买菜\n`;
  setClock(new Date(2026, 9, 24, 23, 59, 50));
  const { plugin, vault } = await makePlugin({ '日记/2026-10-24.md': yesterday, '日记/2026-10-25.md': todayNote });
  const view = makeView(plugin);
  const rows = readTodos(yesterday, S, plugin.parser);
  setClock(new Date(2026, 9, 25, 0, 0, 20));
  await view.remove(rows[0], [0], '日记/2026-10-24.md');
  await view.change(rows[0], [0], (item) => { item.checked = false; }, '日记/2026-10-24.md');
  assert.equal(vault.store.get('日记/2026-10-25.md'), todayNote);
  assert.equal(vault.store.get('日记/2026-10-24.md'), `${S}\n- [ ] 打电话\n`);
  setClock(new Date(2026, 9, 25, 9));
});
