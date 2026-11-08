// 侧边栏里的「今天」：顶上一行输入框，回车加到最上面；下面是这一天的事项。
// 样子和习惯都照浏览器扩展的侧边栏（2026-11-05 整理，用户反馈「丑、累赘、和扩展没法比」）：
// 标头一行「今天 · 11/5 · 周四　吉　…　✓ 2」、方的输入框、一行一件细线隔开（子任务和上面那件一组）、做完的排在最后、
// #标签是正文下面一排浅底小签、GitHub 问题是项目色的浅底牌子、星标是字稍重加一道细线；
// 双击就地改字、指到一件右边「⋯」和右键是同一份菜单（完成 · 编辑 · 星标 · 做了一次 · 复制文字 | GitHub | 删除）。
// 全按日记文件画：点方框、星标、改字、删除都是改文件，文件一变（这里改的、在笔记里改的、手机同步来的）就重画。
import * as obsidian from 'obsidian';
import { language, t } from './i18n.js';
import { addDays, dateKey, editTodo, editTodos, insertTodo, mergeIntoToday, mergeTodos, moveTodo, readTodos, restoreTodo, takeTodo, takeTodos, undoBrought } from './today.js';
import { ISSUE_URL_RE } from './github.js';
import { MilestonesModal, reachedMessage } from './milestones.js';
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

// 加标签：接在第一行后面，已经有的（不分大小写）不重复（和扩展的多选「标签」一样）
export function withTag(text, tag) {
  const clean = String(tag || '').replace(/^[#＃]/, '').trim();
  if (!clean) return String(text || '');
  const [first, ...rest] = String(text || '').split('\n');
  const has = (G.findTags?.(String(text || '')) || []).some((hit) => hit.tag.toLowerCase() === clean.toLowerCase());
  return has ? String(text || '') : [`${first} #${clean}`, ...rest].join('\n');
}

// 多选「改成同一句」（和扩展的 GitHub 问题 #89 一样）：字换成同一句，各自的图片、文档和 GitHub 地址留着接在后面
const EMBED_RE = /!\[\[[^\]\n]+\]\]|!\[[^\]\n]*\]\([^)\n]+\)/g;
export function renameTo(text, words) {
  const value = String(text || '');
  const kept = [...(value.match(EMBED_RE) || []), ...G.findIssueUrls(value).map((issue) => issue.url)];
  return [String(words || '').trim(), ...kept].filter(Boolean).join(' ');
}

// 勾掉一件后那一行「撤销」留多久（和扩展 2026-11-07 勾选方案 B 一样，照「邮件」的撤销发送）：
// 外面一层的事留在原处 10 秒（扩展「勾选后多久移到下面」的默认值），到点这一行连撤销一起淡出 0.2 秒再挪到最后；
// 子任务本来就不挪，撤销照旧 4 秒。⌘Z 能撤多久以前的
const ROW_UNDO_MS = 4000;
const DONE_STAY_MS = 10000;
const DONE_LEAVE_MS = 200;
const UNDO_WINDOW_MS = 60 * 1000;

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
    // 刚勾掉、还能撤的那一行；⌘Z 撤的是最后一件能撤的事
    this.rowUndo = null;
    this.rowUndoTimer = 0;
    this.lastUndo = null;
    this.renaming = false;
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
    // 这一栏自己能拿焦点：点方框以后清单重画、那个方框没了，焦点还留在这一栏里，⌘Z 照样收得到
    root.setAttribute('tabindex', '-1');

    // 标头一行：「今天 · 11/5 · 周四」、吉日、做完几件都在这一行（以前做完几件单独占一行，和扩展不一样）
    this.headerEl = root.createDiv({ cls: 'yaoji-head' });
    const inputBox = root.createDiv({ cls: 'yaoji-input-box' });
    setIcon(inputBox.createSpan({ cls: 'yaoji-input-plus' }), 'plus');
    this.inputEl = inputBox.createEl('input', {
      type: 'text', cls: 'yaoji-input', attr: { placeholder: t('添加任务，回车保存'), 'aria-label': t('添加待办') }
    });
    this.listEl = root.createDiv({ cls: 'yaoji-list' });
    this.leftEl = root.createDiv({ cls: 'yaoji-left' });
    // 多选（和扩展的 GitHub 问题 #73 一样，照「访达」）：按住 ⌘ / Ctrl 点一件选上、再点取消，Shift 点选一段；
    // 底下一条「已选 N 件 · 完成 · 标签 · 复制 · 明天 · 删除」，Esc 或 × 取消
    this.picked = new Map();
    this.lastPicked = '';
    this.pickBar = root.createDiv({ cls: 'yaoji-pick-bar is-hidden' });
    this.registerDomEvent(root, 'keydown', (event) => {
      if (event.key === 'Escape' && this.picked.size && !event.target.closest?.('textarea, input')) {
        event.preventDefault();
        this.clearPicked();
      }
      // ⌘Z / Ctrl+Z（和扩展一样）：在这一栏里、不在打字时，撤最后一件能撤的（勾掉、删掉、批量、做了一次、改发到）
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && String(event.key).toLowerCase() === 'z'
        && !event.target.closest?.('textarea, input:not([type="checkbox"]), [contenteditable="true"]')) {
        const entry = this.lastUndo;
        if (!entry || entry.used || Date.now() - entry.at > UNDO_WINDOW_MS) return;
        event.preventDefault();
        event.stopPropagation();
        entry.fire();
      }
    });

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
    window.clearTimeout(this.rowUndoTimer);
  }

  // 记下一件能撤的事：提示里的「撤销」和 ⌘Z 用的是同一份，撤过一次就不再撤
  remember(run) {
    const entry = { at: Date.now(), used: false, fire: async () => {
      if (entry.used) return;
      entry.used = true;
      if (this.lastUndo === entry) this.lastUndo = null;
      await run();
    } };
    this.lastUndo = entry;
    return entry;
  }

  // ---------- 勾掉一件（和扩展 2026-11-07 勾选方案 B 一样）----------
  // 不出提示：就在那一行右边一个不动的灰字「撤销」，不画倒计时；⌘Z 也行。写了 #里程碑 的另外说刻上了第几个
  toggleDone(todo, path, sourcePath) {
    const reaching = !todo.checked;
    const key = path.join('.');
    if (this.rowUndo?.key === key) this.clearRowUndo();
    return this.change(todo, path, (item) => { item.checked = !item.checked; }, sourcePath).then(async (ok) => {
      if (!ok || !reaching) return;
      const entry = this.remember(() => {
        this.clearRowUndo();
        return this.change({ ...todo, checked: true }, path, (item) => { item.checked = false; }, sourcePath);
      });
      window.clearTimeout(this.rowUndoTimer);
      const stays = path.length === 1;
      const ms = stays ? DONE_STAY_MS : ROW_UNDO_MS;
      this.rowUndo = { key, text: todo.text, until: Date.now() + ms, entry, stays };
      this.rowUndoTimer = window.setTimeout(() => this.endRowUndo(), ms);
      this.paintRowUndo();
      const message = await reachedMessage(this.plugin, todo);
      if (message) this.plugin.notify(message, [], 4000);
    });
  }

  // 到点：留在原处的那一行连撤销一起淡出 0.2 秒，再重画（挪到最后）；子任务只是撤销淡掉
  endRowUndo() {
    const state = this.rowUndo;
    if (!state) return;
    const row = this.rowUndoRow(state);
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!row || calm) { this.clearRowUndo(); if (state.stays) this.redraw(); return; }
    if (!state.stays) {
      row.querySelector(':scope > .yaoji-row-undo')?.addClass('is-leaving');
      this.rowUndoTimer = window.setTimeout(() => this.clearRowUndo(), DONE_LEAVE_MS);
      return;
    }
    row.addClass('is-leaving');
    this.rowUndoTimer = window.setTimeout(() => { this.clearRowUndo(); this.redraw(); }, DONE_LEAVE_MS);
  }

  rowUndoRow(state) {
    return this.rows?.find((entry) => entry.key === state.key && entry.todo.text === state.text)?.el || null;
  }

  // 刚勾掉、还在原处的那件（重画时不挪到最后）
  isStaying(index, todo) {
    const state = this.rowUndo;
    return Boolean(state?.stays && !state.entry.used && state.key === String(index) && state.text === todo.text);
  }

  clearRowUndo() {
    window.clearTimeout(this.rowUndoTimer);
    const state = this.rowUndo;
    this.rowUndo = null;
    if (!state) return;
    const row = this.rows?.find((entry) => entry.key === state.key)?.el;
    row?.querySelectorAll(':scope > .yaoji-row-undo').forEach((el) => el.remove());
    row?.removeClass('has-row-undo');
  }

  // row：正在画的这一行（重画时接着画上）
  paintRowUndo(row = null) {
    const state = this.rowUndo;
    if (!state) return;
    if (state.until <= Date.now() || state.entry.used) { this.clearRowUndo(); return; }
    const target = row || this.rowUndoRow(state);
    if (!target || target.querySelector(':scope > .yaoji-row-undo')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'yaoji-row-undo';
    button.textContent = t('撤销');
    button.setAttribute('aria-label', t('撤销完成'));
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      state.entry.fire();
    });
    button.addEventListener('dblclick', (event) => event.stopPropagation());
    target.addClass('has-row-undo');
    target.insertBefore(button, target.querySelector(':scope > .yaoji-more'));
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
    const hadFocus = this.contentEl.contains(document.activeElement);

    this.drawHead(date, todos);
    this.listEl.empty();
    this.rows = [];
    const sourcePath = file?.path || '';
    this.sourcePath = sourcePath;
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
    // 做完的放到最后（和扩展一样，只是显示的顺序；日记里的顺序不动，改哪件还是按它在日记里的位置）；
    // 刚勾掉、撤销还在的那件先留在原处
    const order = todos.map((todo, index) => ({ todo, index }));
    const open = (item) => !item.todo.checked || this.isStaying(item.index, item.todo);
    const shown = [...order.filter(open), ...order.filter((item) => !open(item))];
    shown.forEach(({ todo, index }) => draw([todo], [], 0, index));
    this.listEl.toggleClass('is-empty', !todos.length);
    if (!todos.length) this.listEl.createDiv({ cls: 'yaoji-empty', text: t('今天还没有待办') });
    // 选着的还在（字对得上）就接着选着；文件改过、对不上的放下
    for (const [key, item] of this.picked) {
      const row = this.rows.find((entry) => entry.key === key);
      if (!row || row.todo.text !== item.text) this.picked.delete(key);
      else row.el.addClass('is-picked');
    }
    this.drawPickBar();
    this.drawLeft();
    if (hadFocus && !this.contentEl.contains(document.activeElement)) this.contentEl.focus({ preventScroll: true });
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
    // 里程碑（和扩展的 GitHub 问题 #97 一样）：一面小旗，和翻天的箭头一起指到这一行才出来
    const flag = nav.createEl('button', { cls: 'clickable-icon yaoji-ms-open', attr: { 'aria-label': t('里程碑') } });
    setIcon(flag, 'flag');
    flag.addEventListener('click', () => new MilestonesModal(this.app, this.plugin).open());
    const prev = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': t('前一天') } });
    setIcon(prev, 'chevron-left');
    prev.addEventListener('click', () => this.goTo(addDays(date, -1)));
    const next = nav.createEl('button', { cls: 'clickable-icon', attr: { 'aria-label': t('后一天') } });
    setIcon(next, 'chevron-right');
    next.addEventListener('click', () => this.goTo(addDays(date, 1)));
  }

  drawItem(todo, path, depth, sourcePath) {
    const row = this.listEl.createDiv({ cls: 'yaoji-item' });
    const key = path.join('.');
    row.dataset.key = key;
    row.dataset.parent = path.slice(0, -1).join('.');
    this.rows.push({ key, path, todo, el: row, depth });
    // 拖动排序：指到这一件，左边出来一个把手，按住拖到同一层的别的位置（和扩展一样）
    const grip = row.createSpan({ cls: 'yaoji-grip', attr: { 'aria-hidden': 'true' } });
    setIcon(grip, 'grip-vertical');
    grip.addEventListener('pointerdown', (event) => this.startDrag(event, row, todo, path));
    // 不按键点一件：记下来当 Shift 的起点（照常是点这一件该做的事）
    row.addEventListener('pointerdown', (event) => {
      if (event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey)) this.lastClicked = key;
    });
    // 按住 ⌘ / Ctrl / Shift 点：选上（不进编辑、不勾方框）。点在链接上的照老规矩开链接（⌘ 点 = 新标签页，和扩展的问题清单 L13 一样）
    row.addEventListener('click', (event) => {
      if (!(event.metaKey || event.ctrlKey || event.shiftKey)) return;
      if (event.target.closest('.yaoji-edit, .yaoji-grip, a')) return;
      event.preventDefault();
      event.stopPropagation();
      this.pickGesture(key, event.shiftKey);
    }, true);
    row.toggleClass('is-done', !!todo.checked);
    row.toggleClass('is-star', !!todo.highlighted);
    row.style.setProperty('--depth', String(depth));

    const box = row.createEl('input', { type: 'checkbox', cls: 'yaoji-check' });
    box.checked = !!todo.checked;
    box.setAttribute('aria-label', todo.checked ? t('标为未完成') : t('完成'));
    box.addEventListener('click', (event) => {
      event.preventDefault();
      this.toggleDone(todo, path, sourcePath);
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
    // 第一行是「#标签 问题地址」（扩展的 GitHub 问题 #96）：两样拿走后第一行空了，前后的空行也去掉
    const shown = (counted.count ? counted.base : words).replace(ISSUE_URL_RE, '').replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
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
    }
    // 「两个都要」（在扩展里发到两个项目）：每个问题一块牌子，并排（和扩展的问题清单 G5 一样）
    const seenIssues = new Set();
    const badges = issues.length ? body.createDiv({ cls: 'yaoji-issues' }) : null;
    for (const item of issues) {
      if (seenIssues.has(item.url)) continue;
      seenIssues.add(item.url);
      const badge = badges.createDiv({ cls: 'yaoji-issue' });
      badge.dataset.url = item.url;
      if (item !== issue) badge.style.setProperty('--yaoji-issue', `var(--yaoji-repo-${G.repoColor(item.repo, this.plugin.settings.github?.colors || {})})`);
      badge.createSpan({ cls: 'yaoji-issue-name', text: item.repo.split('/').pop() });
      const link = badge.createEl('a', { cls: 'yaoji-issue-num', text: `#${item.number}`, href: item.url });
      link.addEventListener('click', (event) => { event.preventDefault(); window.open(item.url); });
      // GitHub 上关了：后面跟一句「✓ 已完成 / 不做了 / 重复了」，删掉了的写「已删除」（和扩展一样；开着的不多说）
      const state = this.plugin.github?.badgeOf?.(item);
      if (state?.label) {
        badge.addClass(`is-${state.status.replace('_', '-')}`);
        badge.createSpan({ cls: 'yaoji-issue-state', text: `${state.status === 'done' ? '✓ ' : ''}${state.label}` });
      }
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
      // 多选时在选中的那几件上右键：批量操作（和扩展的 GitHub 问题 #83 一样）；在没选中的上右键放下多选
      if (this.picked.size && this.picked.has(key)) { this.batchMenu().showAtMouseEvent(event); return; }
      if (this.picked.size) this.clearPicked();
      this.menuFor(todo, path, sourcePath, counted, row, text).showAtMouseEvent(event);
    });
    if (this.rowUndo?.key === key && this.rowUndo.text === todo.text) this.paintRowUndo(row);
    return row;
  }

  // 一件事的菜单（右键和「⋯」同一份，顺序和扩展一样）：完成 · 编辑 · 星标 · 做了一次 · 复制文字 | GitHub | 删除
  menuFor(todo, path, sourcePath, counted, row, text) {
    const menu = new Menu();
    menu.addItem((item) => item
      .setTitle(todo.checked ? t('标为未完成') : t('完成'))
      .setIcon(todo.checked ? 'square' : 'check-square')
      .onClick(() => this.toggleDone(todo, path, sourcePath)));
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
    // 在下面加一条 / 添加子任务（和扩展一样）：先出一个空的输入框，写好回车才写进日记；做完的那件下面不加
    if (!todo.checked) {
      menu.addItem((item) => item
        .setTitle(t('在下面加一条'))
        .setIcon('list-plus')
        .onClick(() => this.composeNear(row, todo, path, 'below', sourcePath)));
      menu.addItem((item) => item
        .setTitle(t('添加子任务'))
        .setIcon('corner-down-right')
        .onClick(() => this.composeNear(row, todo, path, 'child', sourcePath)));
    }
    menu.addItem((item) => item
      .setTitle(t('复制文字'))
      .setIcon('copy')
      .onClick(() => this.copyText(todo)));
    // 发到 GitHub（会员）：发过的收成一行「项目 #44 ›」（和扩展的 GitHub 问题 #91 方案 A 一样，照「访达」的「共享 ›」），
    // 指上去是 打开 · 复制链接 · 改发到 · 撤回；登录了、连着 GitHub 才有「发到 GitHub」。GitHub 上删掉了的，可以重新发
    const github = this.plugin.github;
    const file = this.plugin.fileAt(sourcePath);
    // 每个问题一行（「两个都要」时两行，和扩展的问题清单 G5 一样）；GitHub 上删掉了的不列
    const seen = new Set();
    const live = G.findIssueUrls(String(todo.text || ''))
      .filter((item) => !seen.has(item.url) && seen.add(item.url))
      .filter((item) => github?.badgeOf?.(item)?.status !== 'deleted');
    if (live.length || (github?.ready() && file)) menu.addSeparator();
    for (const issue of live) {
      const fill = (sub) => {
        sub.addItem((item) => item.setTitle(t('在 GitHub 打开')).setIcon('external-link').onClick(() => window.open(issue.url)));
        sub.addItem((item) => item.setTitle(t('复制链接')).setIcon('link').onClick(() => this.copyLink(issue.url)));
        if (github?.ready() && file) {
          sub.addItem((item) => item.setTitle(t('改发到')).setIcon('arrow-right-left').onClick(() => github.move({ file, todo, path, issue })));
          sub.addSeparator();
          sub.addItem((item) => { item.setTitle(t('撤回')).setIcon('undo-2').onClick(() => this.askWithdraw(row, todo, path, sourcePath, issue)); item.setWarning?.(true); });
        }
      };
      const name = `${issue.repo.split('/').pop()} #${issue.number}`;
      let sub = null;
      menu.addItem((item) => {
        item.setTitle(name).setIcon('github');
        // 新一点的 Obsidian 有子菜单；没有就平铺在这一组里
        sub = typeof item.setSubmenu === 'function' ? item.setSubmenu() : null;
        if (!sub) item.onClick(() => window.open(issue.url));
      });
      if (sub) fill(sub); else fill(menu);
    }
    if (!live.length && github?.ready() && file) {
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

  // ---------- 两件之间加一条 / 加子任务 ----------
  // 输入框放在这件（连子任务）下面；子任务的往里缩一格。回车写进日记，Esc 或空着点别处就收起，不留空行
  composeNear(row, todo, path, mode, sourcePath) {
    this.listEl.querySelector('.yaoji-compose')?.remove();
    const depth = path.length - 1 + (mode === 'child' ? 1 : 0);
    let last = row;
    const prefix = `${path.join('.')}.`;
    for (const entry of this.rows) if (entry.key.startsWith(prefix)) last = entry.el;
    const wrap = document.createElement('div');
    wrap.className = 'yaoji-item yaoji-compose';
    wrap.style.setProperty('--depth', String(depth));
    last.after(wrap);
    const input = wrap.createEl('textarea', { cls: 'yaoji-edit', attr: { rows: '1', placeholder: t('添加任务，回车保存'), 'aria-label': mode === 'child' ? t('添加子任务') : t('在下面加一条') } });
    input.focus();
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const value = input.value.trim();
      wrap.remove();
      if (!save || !value) return;
      const file = this.plugin.fileAt(sourcePath);
      if (!file) return;
      await this.app.vault.process(file, (content) => insertTodo(content, path, todo.text, value, mode, this.plugin.settings.section, this.plugin.parser)?.content ?? content);
    };
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finish(true); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  // ---------- 拖动排序 ----------
  // 只在同一层里挪（顶层和顶层、同一件的子任务之间）；拖的时候一道墨线指出会落在哪，松手才写进日记
  startDrag(event, row, todo, path) {
    if (event.button !== 0 || this.picked.size) return;
    event.preventDefault();
    const parent = row.dataset.parent;
    const depth = path.length - 1;
    const siblings = this.rows.filter((entry) => entry.el.dataset.parent === parent && entry.depth === depth);
    if (siblings.length < 2) return;
    // 每一件连它的子任务算一块
    const blocks = siblings.map((entry) => {
      const prefix = `${entry.key}.`;
      const tail = [...this.rows].reverse().find((other) => other.key.startsWith(prefix))?.el || entry.el;
      return { entry, top: entry.el.offsetTop, bottom: tail.offsetTop + tail.offsetHeight };
    });
    const line = this.listEl.createDiv({ cls: 'yaoji-drop-line' });
    row.addClass('is-dragging');
    let slot = -1;
    const place = (clientY) => {
      const y = clientY - this.listEl.getBoundingClientRect().top + this.listEl.scrollTop;
      slot = blocks.findIndex((block) => y < (block.top + block.bottom) / 2);
      if (slot === -1) slot = blocks.length;
      const at = slot < blocks.length ? blocks[slot].top : blocks[blocks.length - 1].bottom;
      line.style.top = `${at - 1}px`;
      line.style.setProperty('--depth', String(depth));
    };
    place(event.clientY);
    const move = (e) => place(e.clientY);
    const end = async () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      line.remove();
      row.removeClass('is-dragging');
      const from = path[path.length - 1];
      const before = slot < blocks.length ? blocks[slot].entry.path[depth] : null;
      if (before === from || (before === null && from === Math.max(...siblings.map((s) => s.path[depth])))) return;
      const file = this.plugin.fileAt(this.sourcePath);
      if (!file) return;
      await this.app.vault.process(file, (content) => moveTodo(content, path, todo.text, before, this.plugin.settings.section, this.plugin.parser) ?? content);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  // ---------- 多选 ----------
  // Shift 点选一段（照「访达」）：起点是最后点选的那件；还没选时是普通点过的那件——往上往下都行
  pickGesture(key, range) {
    const start = this.picked.size ? (this.lastPicked || this.lastClicked) : this.lastClicked;
    if (range && start) {
      const keys = this.rows.map((entry) => entry.key);
      const a = keys.indexOf(start);
      const b = keys.indexOf(key);
      if (a >= 0 && b >= 0) {
        for (const entry of this.rows.slice(Math.min(a, b), Math.max(a, b) + 1)) this.setPicked(entry, true);
        this.lastPicked = start;
        this.drawPickBar();
        return;
      }
    }
    const entry = this.rows.find((item) => item.key === key);
    if (entry) this.setPicked(entry, !this.picked.has(key));
    this.lastPicked = key;
    this.drawPickBar();
  }

  setPicked(entry, on) {
    if (on) this.picked.set(entry.key, { path: entry.path, text: entry.todo.text, todo: entry.todo });
    else this.picked.delete(entry.key);
    entry.el.toggleClass('is-picked', on);
  }

  clearPicked() {
    this.picked.clear();
    this.lastPicked = '';
    for (const entry of this.rows || []) entry.el.removeClass('is-picked');
    this.drawPickBar();
  }

  pickedTargets() {
    return [...this.picked.values()].map(({ path, text }) => ({ path, text }));
  }

  // 底下那一条（墨色，和扩展一样）：已选 N 件 · 完成 · 标签 · 复制 · 移到… · 删除 · ⋯ · ×
  // 「⋯」里是改成同一句、星标、合并成一条。改成同一句时这一条换成「N 件改成 [框] 改好 ×」（框常驻在这一条上，不放进菜单）
  drawPickBar() {
    const bar = this.pickBar;
    if (!bar) return;
    const count = this.picked.size;
    if (!count) this.renaming = false;
    // 正在写的时候清单重画了（文件刚改过、又选了一件）：只换件数，框和里面的字不动
    const live = this.renaming && bar.hasClass('is-renaming') ? bar.querySelector('.yaoji-pick-rename-count') : null;
    if (live) { live.setText(t('{count} 件改成', { count })); return; }
    bar.empty();
    bar.toggleClass('is-hidden', !count);
    bar.toggleClass('is-renaming', this.renaming);
    if (!count) return;
    if (this.renaming) { this.drawRenameBar(bar, count); return; }
    // 窄的侧栏里放不下「已选 N 件」：只写数字（styles.css 按这一栏的宽度换）
    const counter = bar.createSpan({ cls: 'yaoji-pick-count', attr: { 'aria-label': t('已选 {count} 件', { count }) } });
    counter.createSpan({ cls: 'yaoji-pick-count-full', text: t('已选 {count} 件', { count }) });
    counter.createSpan({ cls: 'yaoji-pick-count-short', text: String(count), attr: { 'aria-hidden': 'true' } });
    const allDone = [...this.picked.values()].every((item) => item.todo.checked);
    const act = (label, run) => {
      const button = bar.createEl('button', { cls: 'yaoji-pick-act', text: label });
      button.addEventListener('click', (event) => { event.stopPropagation(); run(button); });
      return button;
    };
    const above = (button) => { const rect = button.getBoundingClientRect(); return { x: rect.left, y: rect.top - 4 }; };
    act(allDone ? t('取消完成') : t('完成'), () => this.batch('done'));
    act(t('标签'), (button) => this.tagMenu().showAtPosition(above(button)));
    act(t('复制'), () => this.batch('copy'));
    act(t('移到…'), (button) => this.moveMenu().showAtPosition(above(button)));
    act(t('删除'), () => this.batch('delete'));
    const more = bar.createEl('button', { cls: 'yaoji-pick-more clickable-icon', attr: { 'aria-label': t('更多') } });
    setIcon(more, 'more-horizontal');
    more.addEventListener('click', (event) => { event.stopPropagation(); this.pickMoreMenu().showAtPosition(above(more)); });
    const close = bar.createEl('button', { cls: 'yaoji-pick-close clickable-icon', attr: { 'aria-label': t('取消选择') } });
    setIcon(close, 'x');
    close.addEventListener('click', () => this.clearPicked());
  }

  drawRenameBar(bar, count) {
    const label = bar.createEl('label', { cls: 'yaoji-pick-rename' });
    label.createSpan({ cls: 'yaoji-pick-rename-count', text: t('{count} 件改成', { count }) });
    const input = label.createEl('input', { type: 'text', cls: 'yaoji-pick-input', attr: { placeholder: t('写成同一句'), 'aria-label': t('写成同一句'), spellcheck: 'false' } });
    const ok = bar.createEl('button', { cls: 'yaoji-pick-act', text: t('改好') });
    const close = bar.createEl('button', { cls: 'yaoji-pick-close clickable-icon', attr: { 'aria-label': t('取消') } });
    setIcon(close, 'x');
    const submit = () => {
      const value = input.value.trim();
      if (!value) { input.focus(); return; }
      this.renaming = false;
      this.batch('rename', value);
    };
    const stop = () => { this.renaming = false; this.drawPickBar(); };
    ok.addEventListener('click', (event) => { event.stopPropagation(); submit(); });
    close.addEventListener('click', (event) => { event.stopPropagation(); stop(); });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === 'Enter') { event.preventDefault(); submit(); }
      else if (event.key === 'Escape') { event.preventDefault(); stop(); }
    });
    window.setTimeout(() => input.focus(), 0);
  }

  startRename() {
    this.renaming = true;
    this.drawPickBar();
  }

  // 移到…（和扩展一样）：明天、后天、下周一（下周一和前两个重了就不列）；后面写着是哪天
  moveDays() {
    const today = this.shownDate();
    const locale = LOCALES[language()] || language();
    // 「11/6 周五」：日期和星期分开写（一起格式化时中文会挤成「11/6周五」）
    const label = (date) => `${new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric' }).format(date)} ${new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)}`;
    const tomorrow = addDays(today, 1);
    const after = addDays(today, 2);
    let monday = addDays(today, 1);
    while (monday.getDay() !== 1) monday = addDays(monday, 1);
    const days = [{ name: t('明天'), date: tomorrow }, { name: t('后天'), date: after }];
    if (dateKey(monday) !== dateKey(tomorrow) && dateKey(monday) !== dateKey(after)) days.push({ name: t('下周一'), date: monday });
    return days.map((day) => ({ ...day, hint: label(day.date) }));
  }

  moveMenu() {
    const menu = new Menu();
    for (const day of this.moveDays()) {
      menu.addItem((item) => item.setTitle(`${day.name} · ${day.hint}`).setIcon('arrow-right').onClick(() => this.batch('move', { date: day.date, label: day.name })));
    }
    return menu;
  }

  pickMoreMenu() {
    const items = [...this.picked.values()];
    const allStar = items.every((item) => item.todo.highlighted);
    const menu = new Menu();
    menu.addItem((item) => item.setTitle(t('改成同一句…')).setIcon('pencil').onClick(() => window.setTimeout(() => this.startRename(), 0)));
    menu.addItem((item) => item.setTitle(allStar ? t('取消星标') : t('星标')).setIcon('star').onClick(() => this.batch('star')));
    if (items.length >= 2) menu.addItem((item) => item.setTitle(t('合并成一条')).setIcon('combine').onClick(() => this.batch('merge')));
    return menu;
  }

  batchMenu() {
    const menu = new Menu();
    const items = [...this.picked.values()];
    const allDone = items.every((item) => item.todo.checked);
    const allStar = items.every((item) => item.todo.highlighted);
    menu.addItem((item) => item.setTitle(t('已选 {count} 件', { count: items.length })).setIcon('check-square').setDisabled?.(true));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle(allDone ? t('取消完成') : t('完成')).setIcon('check').onClick(() => this.batch('done')));
    menu.addItem((item) => item.setTitle(allStar ? t('取消星标') : t('星标')).setIcon('star').onClick(() => this.batch('star')));
    menu.addItem((item) => item.setTitle(t('复制')).setIcon('copy').onClick(() => this.batch('copy')));
    for (const day of this.moveDays()) {
      menu.addItem((item) => item.setTitle(`${day.name} · ${day.hint}`).setIcon('arrow-right').onClick(() => this.batch('move', { date: day.date, label: day.name })));
    }
    menu.addItem((item) => item.setTitle(t('改成同一句…')).setIcon('pencil').onClick(() => window.setTimeout(() => this.startRename(), 0)));
    if (items.length >= 2) menu.addItem((item) => item.setTitle(t('合并成一条')).setIcon('combine').onClick(() => this.batch('merge')));
    menu.addSeparator();
    menu.addItem((item) => { item.setTitle(t('删除')).setIcon('trash-2').onClick(() => this.batch('delete')); item.setWarning?.(true); });
    return menu;
  }

  // 加标签：今天这些事里用过的标签（用得多的在前），最后一项「新标签…」
  tagMenu() {
    const counts = new Map();
    for (const entry of this.rows || []) {
      for (const hit of G.findTags?.(String(entry.todo.text || '')) || []) {
        const lower = hit.tag.toLowerCase();
        const item = counts.get(lower) || { tag: hit.tag, count: 0 };
        item.count += 1;
        counts.set(lower, item);
      }
    }
    const menu = new Menu();
    [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 8).forEach(({ tag }) => {
      menu.addItem((item) => item.setTitle(`#${tag}`).setIcon('hash').onClick(() => this.batch('tag', tag)));
    });
    menu.addItem((item) => item.setTitle(t('新标签…')).setIcon('plus').onClick(() => this.askTag()));
    return menu;
  }

  // 新标签：底下那条换成一个小输入框，回车加上，Esc 回去
  askTag() {
    const bar = this.pickBar;
    bar.empty();
    const input = bar.createEl('input', { type: 'text', cls: 'yaoji-pick-input', attr: { placeholder: t('写一个标签'), 'aria-label': t('写一个标签') } });
    input.focus();
    input.addEventListener('keydown', (event) => {
      if (event.isComposing) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        const tag = input.value.replace(/^[#＃]/, '').trim().replace(/\s+/g, '');
        if (tag) this.batch('tag', tag); else this.drawPickBar();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.drawPickBar();
      }
    });
  }

  // 批量做一件事：改完提示里能撤销（日记这期间没再改过就整篇换回去）
  async batch(kind, value) {
    const targets = this.pickedTargets();
    const items = [...this.picked.values()];
    const count = targets.length;
    if (!count) return;
    if (kind === 'copy') {
      const text = items.map((item) => PlainText.todoToPlainText(item.todo).text).join('\n');
      try { await navigator.clipboard.writeText(text); this.plugin.notify(t('已复制 {count} 件', { count }), [], 2000); } catch { this.plugin.notify(t('复制失败'), [], 3000); }
      this.clearPicked();
      return;
    }
    const file = this.plugin.fileAt(this.sourcePath);
    if (!file) return;
    const section = this.plugin.settings.section;
    const parser = this.plugin.parser;
    let before = '';
    let after = null;
    let moved = [];
    await this.app.vault.process(file, (content) => {
      before = content;
      if (kind === 'merge') {
        after = mergeTodos(content, targets, section, parser);
        return after ?? content;
      }
      if (kind === 'delete' || kind === 'move') {
        const taken = takeTodos(content, targets, section, parser);
        if (!taken) return content;
        moved = taken.removed;
        after = taken.content;
        return after;
      }
      const allDone = items.every((item) => item.todo.checked);
      const allStar = items.every((item) => item.todo.highlighted);
      const change = {
        done: (todo) => { todo.checked = !allDone; },
        star: (todo) => { todo.highlighted = !allStar; },
        tag: (todo) => { todo.text = withTag(todo.text, value); },
        rename: (todo) => { todo.text = renameTo(todo.text, value); }
      }[kind];
      after = change ? editTodos(content, targets, change, section, parser) : null;
      return after ?? content;
    });
    if (after === null) { this.plugin.notify(t('日记刚改过，再选一次'), [], 4000); this.clearPicked(); this.redraw(); return; }
    let dayFile = null;
    let record = null;
    if (kind === 'move') {
      // 先写进那一天（没有就照模板建），再从这一天拿掉（上面已经拿掉了）；写不进那一天就整篇换回去
      try {
        dayFile = await this.plugin.noteFor(value.date);
        await this.app.vault.process(dayFile, (content) => {
          const merged = mergeIntoToday(content, moved, section, parser);
          record = merged.record;
          return merged.content;
        });
      } catch (error) {
        console.error('[今日待办] 移到明天失败', error);
        await this.app.vault.process(file, (content) => (content === after ? before : content));
        this.plugin.notify(t('移不过去：{message}', { message: error?.message || error }), [], 6000);
        this.clearPicked();
        return;
      }
    }
    const message = {
      done: t('{count} 件都改好了', { count }),
      star: t('{count} 件都改好了', { count }),
      tag: t('{count} 件加上了 #{tag}', { count, tag: value }),
      rename: t('{count} 件都改成了同一句', { count }),
      merge: t('{count} 件合成了一条', { count }),
      delete: t('删掉了 {count} 件', { count }),
      move: t('{count} 件移到了 {day}', { count, day: value?.label || '' })
    }[kind];
    this.clearPicked();
    const entry = this.remember(async () => {
      let ok = false;
      await this.app.vault.process(file, (content) => {
        if (content !== after) return content;
        ok = true;
        return before;
      });
      if (ok && dayFile && record) await this.app.vault.process(dayFile, (content) => undoBrought(content, record, section, parser)?.content ?? content);
      if (!ok) this.plugin.notify(t('日记刚改过，撤销不了'), [], 4000);
    });
    this.plugin.notify(message, [{ label: t('撤销'), run: () => entry.fire() }], 6000);
  }

  async copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      this.plugin.notify(t('已复制'), [], 2000);
    } catch {
      this.plugin.notify(t('复制失败'), [], 3000);
    }
  }

  // 撤回之前问一句（和扩展的 GitHub 问题 #67 一样）：牌子底下「GitHub 上的 #44 会删掉　撤回 · 不了」，光标停在「撤回」上
  askWithdraw(row, todo, path, sourcePath, issue) {
    const badge = [...row.querySelectorAll('.yaoji-issue')].find((node) => node.dataset.url === issue.url) || row.querySelector('.yaoji-issue');
    if (!badge || row.querySelector('.yaoji-issue-ask')) return;
    const ask = document.createElement('div');
    ask.className = 'yaoji-issue-ask';
    (badge.closest('.yaoji-issues') || badge).after(ask);
    ask.createSpan({ text: t('GitHub 上的 #{number} 会删掉', { number: issue.number }) });
    const yes = ask.createEl('button', { cls: 'yaoji-issue-act', text: t('撤回') });
    const no = ask.createEl('button', { cls: 'yaoji-issue-act', text: t('不了') });
    const close = () => ask.remove();
    no.addEventListener('click', (event) => { event.stopPropagation(); close(); });
    [yes, no].forEach((button) => button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    }));
    yes.addEventListener('click', async (event) => {
      event.stopPropagation();
      ask.empty();
      ask.createSpan({ text: t('正在撤回…') });
      const file = this.plugin.fileAt(sourcePath);
      const ok = file ? await this.plugin.github.withdraw({ file, todo, path, issue }) : false;
      if (!ok) close();
    });
    yes.focus();
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
    const entry = this.remember(() => this.change({ ...todo, text: after }, path, (item) => { item.text = before; }, sourcePath));
    this.plugin.notify(step > 0 ? t('{text} 第 {count} 次', { text, count }) : t('{text} 少记了一次', { text }), [{
      label: t('撤销'),
      run: () => entry.fire()
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
    // 这期间又改过：不整篇换回去，把删掉的整块（子任务、勾选都在）放回原来的位置
    const entry = this.remember(() => this.app.vault.process(file, (content) => (
      content === after ? before : restoreTodo(content, removed, this.plugin.settings.section, this.plugin.parser)
    )));
    this.plugin.notify(t('已删除'), [{ label: t('撤销'), run: () => entry.fire() }], 6000);
  }
}
