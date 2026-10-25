// 侧边栏里的「今天」（方案 B）：顶上一行输入框，回车加到最后；下面是这一天的事项。
// 全按日记文件画：点方框、星标、删除都是改文件，文件一变（这里改的、在笔记里改的、手机同步来的）就重画。
import * as obsidian from 'obsidian';
import { language, t } from './i18n.js';
import { addDays, appendTodo, dateKey, deleteTodo, editTodo, readTodos } from './today.js';

const { ItemView, MarkdownRenderer, Menu, setIcon } = obsidian;

export const VIEW_TYPE = 'yaoji-today-view';
export const VIEW_ICON = 'calendar-check';

const LOCALES = { zh: 'zh-CN', 'zh-TW': 'zh-TW' };

export class TodayView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.date = null; // null = 跟着今天走
    this.renderToken = 0;
    this.redrawTimer = 0;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return t('今日待办'); }
  getIcon() { return VIEW_ICON; }

  shownDate() {
    return this.date || new Date();
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass('yaoji-today');

    this.headerEl = root.createDiv({ cls: 'yaoji-head' });
    this.inputEl = root.createEl('input', {
      type: 'text', cls: 'yaoji-input', attr: { placeholder: t('加一件事，回车'), 'aria-label': t('添加待办') }
    });
    this.listEl = root.createDiv({ cls: 'yaoji-list' });
    this.leftEl = root.createDiv({ cls: 'yaoji-left' });

    this.inputEl.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Escape') { this.inputEl.blur(); return; }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const value = this.inputEl.value.trim();
      if (!value) return;
      this.inputEl.value = '';
      this.plugin.addTodoOn(this.shownDate(), value).catch((error) => console.error('[今日待办] 添加失败', error));
    });

    // 文件变了就重画：只看这一天的那篇
    const onChange = (file) => {
      if (file?.path === this.plugin.pathFor(this.shownDate())) this.queueRedraw();
    };
    this.registerEvent(this.app.vault.on('modify', onChange));
    this.registerEvent(this.app.vault.on('create', onChange));
    this.registerEvent(this.app.vault.on('delete', onChange));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (oldPath === this.plugin.pathFor(this.shownDate())) this.queueRedraw();
      else onChange(file);
    }));

    await this.redraw();
  }

  async onClose() {
    window.clearTimeout(this.redrawTimer);
  }

  queueRedraw() {
    window.clearTimeout(this.redrawTimer);
    this.redrawTimer = window.setTimeout(() => this.redraw(), 80);
  }

  // 跨天时插件叫一声：看的是「今天」就跟着换到新的一天
  dayChanged() {
    if (!this.date) this.redraw();
  }

  goTo(date) {
    this.date = date && dateKey(date) !== dateKey(new Date()) ? date : null;
    this.redraw();
  }

  async redraw() {
    const token = ++this.renderToken;
    const date = this.shownDate();
    const file = this.plugin.fileAt(this.plugin.pathFor(date));
    const content = file ? await this.app.vault.read(file) : '';
    if (token !== this.renderToken) return;
    const todos = readTodos(content, this.plugin.settings.section, this.plugin.parser);

    this.drawHead(date);
    this.listEl.empty();
    const sourcePath = file?.path || '';
    const draw = (list, parentPath, depth) => {
      list.forEach((todo, index) => {
        const path = [...parentPath, index];
        this.drawItem(todo, path, depth, sourcePath);
        draw(todo.children || [], path, depth + 1);
      });
    };
    draw(todos, [], 0);
    this.drawLeft();
  }

  drawHead(date) {
    const head = this.headerEl;
    head.empty();
    const locale = LOCALES[language()] || language();
    const day = head.createDiv({ cls: 'yaoji-day' });
    day.createSpan({ cls: 'yaoji-date', text: new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(date) });
    day.createSpan({ cls: 'yaoji-weekday', text: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date) });
    if (this.date) {
      const back = day.createEl('button', { cls: 'yaoji-today-link', text: t('回到今天') });
      back.addEventListener('click', () => this.goTo(null));
    }
    // 翻前后一天：鼠标移到日期这一行才出现
    const nav = head.createDiv({ cls: 'yaoji-nav' });
    const prev = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': t('前一天') } });
    setIcon(prev, 'chevron-left');
    prev.addEventListener('click', () => this.goTo(addDays(date, -1)));
    const next = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': t('后一天') } });
    setIcon(next, 'chevron-right');
    next.addEventListener('click', () => this.goTo(addDays(date, 1)));
  }

  drawItem(todo, path, depth, sourcePath) {
    const row = this.listEl.createDiv({ cls: 'yaoji-item' });
    row.toggleClass('is-done', !!todo.checked);
    row.toggleClass('is-star', !!todo.highlighted);
    row.style.setProperty('--depth', String(depth));

    const box = row.createEl('input', { type: 'checkbox', cls: 'task-list-item-checkbox yaoji-check' });
    box.checked = !!todo.checked;
    box.addEventListener('click', (event) => {
      event.preventDefault();
      this.change(todo, path, (item) => { item.checked = !item.checked; });
    });

    const text = row.createDiv({ cls: 'yaoji-text' });
    MarkdownRenderer.render(this.app, todo.text, text, sourcePath, this).then(() => {
      // 太长的折成两行，点一下展开
      window.requestAnimationFrame(() => {
        if (text.scrollHeight > text.clientHeight + 2) {
          row.addClass('is-long');
          text.addEventListener('click', (event) => {
            if (event.target.closest('a, img, .internal-embed')) return;
            row.toggleClass('is-open', !row.hasClass('is-open'));
          });
        }
      });
    });

    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      // 不让 Obsidian 侧栏自己的右键菜单接着处理（它会把这个菜单关掉）
      event.stopPropagation();
      const menu = new Menu();
      menu.addItem((item) => item
        .setTitle(todo.highlighted ? t('取消星标') : t('星标'))
        .setIcon('star')
        .onClick(() => this.change(todo, path, (target) => { target.highlighted = !target.highlighted; })));
      menu.addItem((item) => item
        .setTitle(t('删除'))
        .setIcon('trash-2')
        .onClick(() => this.remove(todo, path)));
      menu.showAtMouseEvent(event);
    });
  }

  // 「昨天剩 N 件，太多了没带」：只在看今天、而且今天自动带时太多没带才有；点了去那一天
  drawLeft() {
    const left = this.leftEl;
    left.empty();
    const note = this.plugin.leftOver;
    const show = !this.date && note && note.dateKey === dateKey(new Date());
    left.toggleClass('is-hidden', !show);
    if (!show) return;
    const message = note.onlyYesterday ? t('昨天剩 {count} 件，太多了没带', { count: '\u0000' }) : t('之前剩 {count} 件，太多了没带', { count: '\u0000' });
    const [before, after = ''] = message.split('\u0000');
    const link = left.createEl('button', { cls: 'yaoji-left-link' });
    link.append(before);
    link.createEl('b', { text: String(note.total) });
    link.append(after);
    link.addEventListener('click', () => this.goTo(note.date));
  }

  async change(todo, path, apply) {
    const file = this.plugin.fileAt(this.plugin.pathFor(this.shownDate()));
    if (!file) return;
    let ok = false;
    await this.app.vault.process(file, (content) => {
      const next = editTodo(content, path, todo.text, apply, this.plugin.settings.section, this.plugin.parser);
      if (next === null) return content;
      ok = true;
      return next;
    });
    if (!ok) this.redraw();
  }

  async remove(todo, path) {
    const file = this.plugin.fileAt(this.plugin.pathFor(this.shownDate()));
    if (!file) return;
    let before = '';
    let after = null;
    await this.app.vault.process(file, (content) => {
      before = content;
      after = deleteTodo(content, path, todo.text, this.plugin.settings.section, this.plugin.parser);
      return after === null ? content : after;
    });
    if (after === null) { this.redraw(); return; }
    this.plugin.notify(t('已删除'), [{
      label: t('撤销'),
      // 这期间又改过：不整篇换回去，只把这件加回最后
      run: () => this.app.vault.process(file, (content) => (
        content === after ? before : appendTodo(content, todo.text, this.plugin.settings.section, this.plugin.parser)
      ))
    }], 6000);
  }
}
