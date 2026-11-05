// 侧边栏里的「今天」：顶上一行输入框，回车加到最上面；下面是这一天的事项。
// 样子和习惯都照浏览器扩展的侧边栏（2026-11-05 整理，用户反馈「丑、累赘、和扩展没法比」）：
// 标头一行「今天 · 11/5 · 周四　吉　…　✓ 2」、方的输入框、一行一件细线隔开（子任务和上面那件一组）、做完的排在最后、
// #标签是正文下面一排浅底小签、GitHub 问题是项目色的浅底牌子、星标是字稍重加一道细线；
// 双击就地改字、指到一件右边「⋯」和右键是同一份菜单（完成 · 编辑 · 星标 · 做了一次 · 复制文字 | GitHub | 删除）。
// 全按日记文件画：点方框、星标、改字、删除都是改文件，文件一变（这里改的、在笔记里改的、手机同步来的）就重画。
import * as obsidian from 'obsidian';
import { language, t } from './i18n.js';
import { addDays, dateKey, editTodo, readTodos, restoreTodo, takeTodo } from './today.js';
import { ISSUE_URL_RE } from './github.js';
import G from './vendor/github-issues.js';
import TodoCount from './vendor/todo-count.js';
import PlainText from './vendor/todo-plain-text.js';
import { Solar } from 'lunar-javascript';

const { ItemView, MarkdownRenderer, Menu, setIcon } = obsidian;

// 输入框里再打一次已经在计次的事：提示「颈椎操 第 4 次」（扩展的 GitHub 问题 #46）
export function countedMessage(counted) {
  return t('{text} 第 {count} 次', { text: TodoCount.label(counted.text), count: counted.count });
}

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

    // 标头一行：「今天 · 11/5 · 周四」、吉日、做完几件都在这一行（以前做完几件单独占一行，和扩展不一样）
    this.headerEl = root.createDiv({ cls: 'yaoji-head' });
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
      this.plugin.addTodoOn(this.shownDate(), value).then((counted) => {
        if (counted) this.plugin.notify(countedMessage(counted), [], 2500);
      }, (error) => {
        console.error('[今日待办] 添加失败', error);
        // 没写进去：字放回输入框，不让它就这么没了
        if (!this.inputEl.value) this.inputEl.value = value;
        this.plugin.notify(t('写不进今天的日记：{error}', { error: error?.message || error }), [], 8000);
      });
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

    this.drawHead(date, todos);
    this.listEl.empty();
    const sourcePath = file?.path || '';
    const draw = (list, parentPath, depth, startIndex = 0) => {
      list.forEach((todo, offset) => {
        const index = startIndex + offset;
        const path = [...parentPath, index];
        const children = todo.children || [];
        const row = this.drawItem(todo, path, depth, sourcePath);
        // 子任务和它上面那件是一组：组里不画分隔线，一组画完才一道线
        if (children.length) row.addClass('has-children');
        if (depth > 0) row.addClass('is-child');
        draw(children, path, depth + 1);
      });
    };
    // 做完的放到最后（和扩展一样，只是显示的顺序；日记里的顺序不动，改哪件还是按它在日记里的位置）
    const order = todos.map((todo, index) => ({ todo, index }));
    const shown = [...order.filter((item) => !item.todo.checked), ...order.filter((item) => item.todo.checked)];
    shown.forEach(({ todo, index }) => draw([todo], [], 0, index));
    this.listEl.toggleClass('is-empty', !todos.length);
    if (!todos.length) this.listEl.createDiv({ cls: 'yaoji-empty', text: t('今天还没有待办') });
    this.drawLeft();
  }

  // 标头一行（和扩展一样）：「今天 · 11/5 · 周四」，吉日那天后面一个金色的「吉」（指上去写是哪位值神）；
  // 右边做完几件「✓ 2」，翻前后一天的两个箭头指到这一行才出来。别的天写「11/3 · 周二」+「回到今天」
  drawHead(date, todos = []) {
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
    const lucky = luckyDay(date);
    if (lucky) day.createSpan({ cls: 'yaoji-lucky', text: t('吉'), attr: { title: `${t('黄道吉日')} · ${lucky}`, 'aria-label': `${t('黄道吉日')} · ${lucky}` } });
    if (this.date) {
      const back = day.createEl('button', { cls: 'yaoji-today-link', text: t('回到今天') });
      back.addEventListener('click', () => this.goTo(null));
    }
    const side = head.createDiv({ cls: 'yaoji-head-side' });
    const done = doneCount(todos);
    if (done) {
      const count = side.createSpan({ cls: 'yaoji-done-count', attr: { 'aria-label': t('做完 {count} 件', { count: done }), title: t('做完 {count} 件', { count: done }) } });
      setIcon(count.createSpan({ cls: 'yaoji-done-icon' }), 'check');
      count.createSpan({ text: String(done) });
    }
    // 翻前后一天：鼠标移到标头这一行才出现
    const nav = side.createDiv({ cls: 'yaoji-nav' });
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

    const box = row.createEl('input', { type: 'checkbox', cls: 'yaoji-check' });
    box.checked = !!todo.checked;
    box.setAttribute('aria-label', todo.checked ? t('标为未完成') : t('完成'));
    box.addEventListener('click', (event) => {
      event.preventDefault();
      this.change(todo, path, (item) => { item.checked = !item.checked; }, sourcePath);
    });

    const body = row.createDiv({ cls: 'yaoji-body' });
    const text = body.createDiv({ cls: 'yaoji-text' });
    const raw = String(todo.text || '');
    // #标签（和扩展的 GitHub 问题 #71 一样）：从句子里拿出来，正文下面一排浅底小签；日记里的字不动
    const tags = [];
    let words = raw;
    const hits = raw.includes('#') ? (G.findTags?.(raw) || []) : [];
    if (hits.length) {
      let rest = '';
      let cursor = 0;
      for (const hit of hits) {
        rest += raw.slice(cursor, hit.start);
        cursor = hit.end;
        if (!tags.some((tag) => tag.toLowerCase() === hit.tag.toLowerCase())) tags.push(hit.tag);
      }
      words = (rest + raw.slice(cursor)).replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+(\n|$)/g, '$1').trim();
    }
    // GitHub 问题：字里不写地址，字下面一个项目色的浅底小签「■ xposter #40」（和扩展的 GitHub 问题 #84 一样），点编号在 GitHub 打开
    const issues = G.findIssueUrls(raw);
    const issue = issues[0] || null;
    // 做了几次（扩展的 GitHub 问题 #46 方案 A）：「×3」从字里拿出来，放成字后面一个小数，点一下 +1；方框还是「做完」
    const counted = TodoCount.parse(words);
    const shown = (counted.count ? counted.base : words).replace(ISSUE_URL_RE, '').replace(/[ \t]+$/gm, '');
    MarkdownRenderer.render(this.app, shown, text, sourcePath, this).then(() => {
      if (counted.count) {
        const host = text.querySelector(':scope > p:last-child') || text;
        const count = host.createEl('button', { cls: 'yaoji-count', text: `×${counted.count}` });
        count.disabled = !!todo.checked;
        count.setAttribute('aria-label', todo.checked ? t('做了 {count} 次', { count: counted.count }) : t('做了 {count} 次，再记一次', { count: counted.count }));
        if (!todo.checked) count.title = t('再记一次');
        count.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!todo.checked) this.bump(todo, path, 1, sourcePath);
        });
      }
      // 太长的折成两行，点一下展开
      window.requestAnimationFrame(() => {
        if (text.scrollHeight > text.clientHeight + 2) {
          row.addClass('is-long');
          text.addEventListener('click', (event) => {
            if (event.target.closest('a, img, .internal-embed, button')) return;
            row.toggleClass('is-open', !row.hasClass('is-open'));
          });
        }
      });
    });

    // 标签那一排：和下面牌子同一个项目的标签不再单独一块（说两遍）
    const repoName = issue ? issue.repo.split('/').pop().toLowerCase() : '';
    const chips = tags.filter((tag) => tag.toLowerCase() !== repoName);
    if (chips.length) {
      const tagRow = body.createDiv({ cls: 'yaoji-tags' });
      for (const tag of chips) {
        const chip = tagRow.createEl('button', { cls: 'yaoji-tag', text: `#${tag}`, attr: { title: t('找带 #{tag} 的事', { tag }) } });
        chip.addEventListener('click', (event) => {
          event.stopPropagation();
          this.searchTag(tag);
        });
      }
    }
    if (issue) {
      const color = `var(--yaoji-repo-${G.repoColor(issue.repo, this.plugin.settings.github?.colors || {})})`;
      row.style.setProperty('--yaoji-issue', color);
      const badge = body.createDiv({ cls: 'yaoji-issue' });
      badge.createSpan({ cls: 'yaoji-issue-name', text: issue.repo.split('/').pop() });
      const link = badge.createEl('a', { cls: 'yaoji-issue-num', text: `#${issue.number}`, href: issue.url });
      link.addEventListener('click', (event) => { event.preventDefault(); window.open(issue.url); });
    }

    // 双击这一件就地改字（和扩展一样）：回车存，Shift+回车换行，Esc 不改，点别处也存
    text.addEventListener('dblclick', (event) => {
      if (event.target.closest('a, img, .internal-embed, button')) return;
      event.preventDefault();
      this.startEdit(row, text, todo, path, sourcePath);
    });

    // 指到这一件，右边一个「⋯」：和右键同一份菜单
    const more = row.createEl('button', { cls: 'clickable-icon yaoji-more', attr: { 'aria-label': t('更多') } });
    setIcon(more, 'more-horizontal');
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      const rect = more.getBoundingClientRect();
      this.menuFor(todo, path, sourcePath, counted, row, text).showAtPosition({ x: rect.right, y: rect.bottom + 4 });
    });

    row.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      // 不让 Obsidian 侧栏自己的右键菜单接着处理（它会把这个菜单关掉）
      event.stopPropagation();
      this.menuFor(todo, path, sourcePath, counted, row, text).showAtMouseEvent(event);
    });
    return row;
  }

  // 一件事的菜单（右键和「⋯」同一份，顺序和扩展一样）：完成 · 编辑 · 星标 · 做了一次 · 复制文字 | GitHub | 删除
  menuFor(todo, path, sourcePath, counted, row, text) {
    const menu = new Menu();
    menu.addItem((item) => item
      .setTitle(todo.checked ? t('标为未完成') : t('完成'))
      .setIcon(todo.checked ? 'square' : 'check-square')
      .onClick(() => this.change(todo, path, (target) => { target.checked = !target.checked; }, sourcePath)));
    menu.addItem((item) => item
      .setTitle(t('编辑'))
      .setIcon('pencil')
      .onClick(() => this.startEdit(row, text, todo, path, sourcePath)));
    menu.addItem((item) => item
      .setTitle(todo.highlighted ? t('取消星标') : t('星标'))
      .setIcon('star')
      .onClick(() => this.change(todo, path, (target) => { target.highlighted = !target.highlighted; }, sourcePath)));
    // 做了几次：没做完的才有；有次数时写着现在几次，还能「少记一次」
    if (!todo.checked) {
      menu.addItem((item) => item
        .setTitle(counted.count ? `${t('做了一次')} · ${t('现在 {count} 次', { count: counted.count })}` : t('做了一次'))
        .setIcon('rotate-cw')
        .onClick(() => this.bump(todo, path, 1, sourcePath)));
      if (counted.count) {
        menu.addItem((item) => item
          .setTitle(t('少记一次'))
          .setIcon('minus')
          .onClick(() => this.bump(todo, path, -1, sourcePath)));
      }
    }
    menu.addItem((item) => item
      .setTitle(t('复制文字'))
      .setIcon('copy')
      .onClick(() => this.copyText(todo)));
    // 发到 GitHub（会员）：发过的给「在 GitHub 打开 #42」；登录了、连着 GitHub 才有「发到 GitHub」
    const issue = this.plugin.github?.issueOf(todo.text);
    const file = this.plugin.fileAt(sourcePath);
    if (issue || (this.plugin.github?.ready() && file)) menu.addSeparator();
    if (issue) {
      menu.addItem((item) => item
        .setTitle(t('在 GitHub 打开 #{number}', { number: issue.number }))
        .setIcon('github')
        .onClick(() => window.open(issue.url)));
    } else if (this.plugin.github?.ready() && file) {
      menu.addItem((item) => item
        .setTitle(t('发到 GitHub'))
        .setIcon('send')
        .onClick(() => this.plugin.github.send({ file, todo, path })));
    }
    menu.addSeparator();
    menu.addItem((item) => {
      item
        .setTitle(t('删除'))
        .setIcon('trash-2')
        .onClick(() => this.remove(todo, path, sourcePath));
      item.setWarning?.(true);
    });
    return menu;
  }

  // 就地改字：输入框换掉那一块字（GitHub 地址不放进框里，存的时候原样接回去，和扩展一样）
  startEdit(row, text, todo, path, sourcePath) {
    if (row.hasClass('is-editing')) return;
    const raw = String(todo.text || '');
    const urls = G.findIssueUrls(raw).map((item) => item.url);
    const value = urls.reduce((acc, url) => acc.split(url).join(''), raw).replace(/[ \t]{2,}/g, ' ').trim();
    row.addClass('is-editing');
    const input = document.createElement('textarea');
    input.className = 'yaoji-edit';
    input.rows = 1;
    input.setAttribute('aria-label', t('编辑'));
    input.value = value;
    text.after(input);
    const fit = () => { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; };
    fit();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      input.remove();
      row.removeClass('is-editing');
      if (!save || !next || next === value) return;
      const full = [next, ...urls].join(' ');
      await this.change(todo, path, (target) => { target.text = full; }, sourcePath);
    };
    input.addEventListener('input', fit);
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finish(true); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  // 复制成一段纯文本（和扩展一样：连子任务、不带 Markdown 记号）
  async copyText(todo) {
    try {
      const { text } = PlainText.todoToPlainText(todo);
      await navigator.clipboard.writeText(text);
      this.plugin.notify(t('已复制'), [], 2000);
    } catch (error) {
      console.debug('[今日待办] 复制失败', error);
      this.plugin.notify(t('复制失败'), [], 3000);
    }
  }

  // 点一个标签：在 Obsidian 的搜索里找带它的事（没有搜索插件就什么都不做）
  searchTag(tag) {
    try {
      const search = this.app.internalPlugins?.getPluginById?.('global-search')?.instance;
      search?.openGlobalSearch?.(`tag:#${tag}`);
    } catch (error) {
      console.debug('[今日待办] 打开搜索失败', error);
    }
  }

  // 「以前还有 1168 件没做完　全部带来」（2026-10-31 方案 A，和浏览器扩展一样）：只在看今天、而且以前还有没做完的时才有；
  // 点「全部带来」以前所有没做完的都带到今天（能撤销），不分几天、没有菜单
  drawLeft() {
    const left = this.leftEl;
    left.empty();
    const note = this.plugin.leftOver;
    const show = !this.date && note && note.dateKey === dateKey(this.plugin.now());
    left.toggleClass('is-hidden', !show);
    if (!show) return;
    const [before, after = ''] = t('以前还有 {count} 件没做完', { count: '\u0000' }).split('\u0000');
    // 字要包在一个 span 里，数字两边的空格才不会被吃掉
    const label = left.createSpan({ cls: 'yaoji-left-text' });
    label.append(before);
    label.createEl('b', { text: String(note.total) });
    label.append(after);
    const bring = left.createEl('button', { cls: 'yaoji-left-link', text: t('全部带来') });
    bring.addEventListener('click', async () => {
      bring.disabled = true;
      try { await this.plugin.carryNow(); } finally { bring.disabled = false; }
    });
  }


  // sourcePath：这一行是从哪篇日记画出来的。过了零点还没重画时，点的是昨天那篇的行，就只改昨天那篇
  async change(todo, path, apply, sourcePath = this.plugin.pathFor(this.shownDate())) {
    const file = this.plugin.fileAt(sourcePath);
    if (!file) return;
    let ok = false;
    await this.app.vault.process(file, (content) => {
      const next = editTodo(content, path, todo.text, apply, this.plugin.settings.section, this.plugin.parser);
      if (next === null) return content;
      ok = true;
      return next;
    });
    if (!ok) this.redraw();
    return ok;
  }

  // step：+1 做了一次，-1 少记一次（减到 0 就不再计次）；提示里能撤销
  async bump(todo, path, step, sourcePath = this.plugin.pathFor(this.shownDate())) {
    const before = String(todo.text || '');
    const from = TodoCount.parse(before).count;
    const count = Math.min(TodoCount.MAX, Math.max(0, from + step));
    if (count === from) return;
    const after = TodoCount.withCount(before, count);
    // 没写进去（这一行刚在别处改过）：不说「第 N 次」，清单重画成文件里的样子
    if (!(await this.change(todo, path, (item) => { item.text = after; }, sourcePath))) return;
    const text = TodoCount.label(before);
    this.plugin.notify(step > 0 ? t('{text} 第 {count} 次', { text, count }) : t('{text} 少记了一次', { text }), [{
      label: t('撤销'),
      run: () => this.change({ ...todo, text: after }, path, (item) => { item.text = before; }, sourcePath)
    }], 4000);
  }

  async remove(todo, path, sourcePath = this.plugin.pathFor(this.shownDate())) {
    const file = this.plugin.fileAt(sourcePath);
    if (!file) return;
    let before = '';
    let after = null;
    let removed = null;
    await this.app.vault.process(file, (content) => {
      before = content;
      const taken = takeTodo(content, path, todo.text, this.plugin.settings.section, this.plugin.parser);
      if (!taken) return content;
      after = taken.content;
      removed = taken.removed;
      return after;
    });
    if (after === null) { this.redraw(); return; }
    this.plugin.notify(t('已删除'), [{
      label: t('撤销'),
      // 这期间又改过：不整篇换回去，把删掉的整块（子任务、勾选都在）放回原来的位置
      run: () => this.app.vault.process(file, (content) => (
        content === after ? before : restoreTodo(content, removed, this.plugin.settings.section, this.plugin.parser)
      ))
    }], 6000);
  }
}
