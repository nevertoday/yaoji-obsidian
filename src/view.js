// 侧边栏里的「今天」：顶上一行输入框，回车加到最后；下面是这一天的事项。
// 样子整套照浏览器扩展的侧边栏（GitHub 问题 #22 方案 A）：标头「今天 · 10/25 · 周日」、吉日和做完几件、
// 方的输入框、一行一件细线隔开、墨色方勾、星标加粗一条线、GitHub 问题是字下面的项目色牌子。深浅跟着 Obsidian。
// 全按日记文件画：点方框、星标、删除都是改文件，文件一变（这里改的、在笔记里改的、手机同步来的）就重画。
import * as obsidian from 'obsidian';
import { language, t } from './i18n.js';
import { AUTO_LIMIT, addDays, appendTodo, dateKey, deleteTodo, editTodo, readTodos } from './today.js';
import { ISSUE_URL_RE } from './github.js';
import G from './vendor/github-issues.js';
import { Solar } from 'lunar-javascript';

const { ItemView, MarkdownRenderer, Menu, setIcon } = obsidian;

// 黄道吉日（和扩展一样只在中文界面里说）：值神是吉的那天，标头下面一行「吉 · 金匮」
function luckyDay(date) {
  if (!['zh', 'zh-TW'].includes(language())) return '';
  try {
    const lunar = Solar.fromDate(date).getLunar();
    return lunar.getDayTianShenLuck() === '吉' ? lunar.getDayTianShen() : '';
  } catch {
    return '';
  }
}

// 做完几件（连子任务）
function doneCount(list) {
  return (list || []).reduce((sum, todo) => sum + (todo.checked ? 1 : 0) + doneCount(todo.children), 0);
}

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
    return this.date || this.plugin.now();
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass('yaoji-today');

    this.headerEl = root.createDiv({ cls: 'yaoji-head' });
    this.metaEl = root.createDiv({ cls: 'yaoji-meta' });
    const inputBox = root.createDiv({ cls: 'yaoji-input-box' });
    setIcon(inputBox.createSpan({ cls: 'yaoji-input-plus' }), 'plus');
    this.inputEl = inputBox.createEl('input', {
      type: 'text', cls: 'yaoji-input', attr: { placeholder: t('添加任务，回车保存'), 'aria-label': t('添加待办') }
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
    this.date = date && dateKey(date) !== dateKey(this.plugin.now()) ? date : null;
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
    this.drawMeta(date, todos);
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

  // 标头：今天写「今天 · 10/25 · 周日」，别的天写「10/23 · 周五」+ 回到今天（和扩展一样）
  drawHead(date) {
    const head = this.headerEl;
    head.empty();
    const locale = LOCALES[language()] || language();
    const day = head.createDiv({ cls: 'yaoji-day' });
    const parts = [
      ...(this.date ? [] : [t('今天')]),
      `${date.getMonth() + 1}/${date.getDate()}`,
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
    ];
    day.createSpan({ cls: 'yaoji-date', text: parts.join(' · ') });
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

  // 标头下面一行：吉日（金色，带一个小点）、做完几件。都没有就不占地方
  drawMeta(date, todos) {
    const meta = this.metaEl;
    meta.empty();
    const lucky = luckyDay(date);
    const done = doneCount(todos);
    meta.toggleClass('is-hidden', !lucky && !done);
    if (lucky) meta.createSpan({ cls: 'yaoji-lucky', text: `${t('吉')} · ${lucky}` });
    if (lucky && done) meta.createSpan({ cls: 'yaoji-meta-sep' });
    if (done) {
      const count = meta.createSpan({ cls: 'yaoji-done-count', attr: { 'aria-label': t('做完 {count} 件', { count: done }) } });
      setIcon(count.createSpan({ cls: 'yaoji-done-icon' }), 'check');
      count.createSpan({ text: String(done) });
    }
  }

  drawItem(todo, path, depth, sourcePath) {
    const row = this.listEl.createDiv({ cls: 'yaoji-item' });
    row.toggleClass('is-done', !!todo.checked);
    row.toggleClass('is-star', !!todo.highlighted);
    row.style.setProperty('--depth', String(depth));

    const box = row.createEl('input', { type: 'checkbox', cls: 'yaoji-check' });
    box.checked = !!todo.checked;
    box.addEventListener('click', (event) => {
      event.preventDefault();
      this.change(todo, path, (item) => { item.checked = !item.checked; });
    });

    const body = row.createDiv({ cls: 'yaoji-body' });
    const text = body.createDiv({ cls: 'yaoji-text' });
    // GitHub 问题：字里不再写地址，字下面一个项目色的小牌子「■ xposter #40」，点它在 GitHub 打开
    const issues = G.findIssueUrls(String(todo.text || ''));
    if (issues.length) {
      const issue = issues[0];
      const color = `var(--yaoji-repo-${G.repoColor(issue.repo, this.plugin.settings.github?.colors || {})})`;
      row.addClass('has-issue');
      row.style.setProperty('--yaoji-issue', color);
      const badge = body.createDiv({ cls: 'yaoji-issue' });
      badge.createSpan({ cls: 'yaoji-issue-name', text: issue.repo.split('/').pop() });
      const link = badge.createEl('a', { cls: 'yaoji-issue-num', text: `#${issue.number}`, href: issue.url });
      link.addEventListener('click', (event) => { event.preventDefault(); window.open(issue.url); });
    }
    const shown = String(todo.text || '').replace(ISSUE_URL_RE, '').replace(/[ \t]+$/gm, '');
    MarkdownRenderer.render(this.app, shown, text, sourcePath, this).then(() => {
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
      // 发到 GitHub（会员）：发过的给「在 GitHub 打开 #42」；登录了、连着 GitHub 才有「发到 GitHub」
      const issue = this.plugin.github?.issueOf(todo.text);
      if (issue) {
        menu.addItem((item) => item
          .setTitle(t('在 GitHub 打开 #{number}', { number: issue.number }))
          .setIcon('github')
          .onClick(() => window.open(issue.url)));
      } else if (this.plugin.github?.ready()) {
        const file = this.plugin.fileAt(this.plugin.pathFor(this.shownDate()));
        if (file) {
          menu.addItem((item) => item
            .setTitle(t('发到 GitHub'))
            .setIcon('send')
            .onClick(() => this.plugin.github.send({ file, todo, path })));
        }
      }
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
    const show = !this.date && note && note.dateKey === dateKey(this.plugin.now());
    left.toggleClass('is-hidden', !show);
    if (!show) return;
    // 7 天以前留下的不多（不是「太多了」才没带）：只说剩几件
    const tooMany = note.total > AUTO_LIMIT;
    const message = !tooMany
      ? t('之前剩 {count} 件', { count: '\u0000' })
      : note.onlyYesterday ? t('昨天剩 {count} 件，太多了没带', { count: '\u0000' }) : t('之前剩 {count} 件，太多了没带', { count: '\u0000' });
    const [before, after = ''] = message.split('\u0000');
    const link = left.createEl('button', { cls: 'yaoji-left-link' });
    // 按钮是 flex，字要包在一个 span 里，数字两边的空格才不会被吃掉
    const label = link.createSpan();
    label.append(before);
    label.createEl('b', { text: String(note.total) });
    label.append(after);
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
