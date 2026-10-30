// 今日待办 · Obsidian 插件
// 自己管今天的日记：跨天建好文件、放好事项这一节、把以前没做完的带过来；命令面板里随时加一件事。
// 不依赖别的插件。文件里的样子和浏览器扩展一样，两边可以一起用（docs/obsidian-plugin-plan.md，扩展仓库）。
import * as obsidian from 'obsidian';
import MarkdownParser from './vendor/markdown-parser.js';
import { detectLanguage, setLanguage, t } from './i18n.js';
import { DEFAULT_SETTINGS, YaojiSettingTab, cleanSection, detectDiarySettings, sameAsDiary } from './settings.js';
import { TodayView, VIEW_ICON, VIEW_TYPE, countedMessage } from './view.js';
import { Bridge } from './bridge.js';
import { hideBroughtMark } from './hide-mark.js';
import { AUTH_ACTION, MEMBER_BASE, MemberClient } from './member.js';
import { Github } from './github.js';
import {
  addDays, countOrAppend, dateKey, editTodo, ensureSection, isTemplatePending, mergeIntoToday,
  newNoteContent, notePath, planCarry, sectionEndLine, undoBrought
} from './today.js';

const { Modal, Notice, Plugin, TFile, moment, normalizePath } = obsidian;

// 刚打开时先等日记插件、Templater 把今天的文件建好，再看要不要自己建
const START_DELAY_MS = 2000;
const TEMPLATE_WAIT_MS = 1500;
const TEMPLATE_WAIT_TRIES = 4;
const DAY_CHECK_MS = 60 * 1000;

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

export default class YaojiTodayPlugin extends Plugin {
  async onload() {
    setLanguage(detectLanguage(obsidian));
    this.parser = new MarkdownParser();
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    // data.json 里手写的「事项」（没有 #）找不到标题，每次都会在日记末尾多加一行：读进来就补成标题
    this.settings.section = cleanSection(this.settings.section);
    this.handledKey = '';
    this.running = null;
    // 今天自动带时太多没带：侧边栏底下那一句用
    this.leftOver = null;

    this.settingTab = new YaojiSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    // 浏览器扩展连这里读写日记（电脑版才有）
    this.bridge = new Bridge(this);

    // 小小东会员：浏览器里登录，确认后跳回 obsidian://yaoji-auth
    this.member = new MemberClient({
      get: () => this.settings.member || null,
      set: (value) => { this.settings.member = value; void this.saveSettings(); this.refreshSettingsTab(); }
    }, { base: () => this.settings.memberBase || MEMBER_BASE });
    this.github = new Github(this);
    this.registerObsidianProtocolHandler(AUTH_ACTION, async (params) => {
      try {
        await this.member.finishLogin(params);
        this.notify(t('登录好了'), [], 3000);
        void this.github.warm().then(() => this.refreshSettingsTab());
      } catch (error) {
        console.debug('[今日待办] 登录没成', error);
        this.notify(t('登录没成功，再试一次'), [], 6000);
      }
    });
    this.registerView(VIEW_TYPE, (leaf) => new TodayView(leaf, this));
    // 编辑器里藏起「今天带过了」那一行
    this.registerEditorExtension(hideBroughtMark);
    this.addRibbonIcon(VIEW_ICON, t('今日待办'), () => this.showView());

    this.addCommand({ id: 'add', name: t('添加待办'), callback: () => new AddModal(this.app, (text) => this.addTodo(text)).open() });
    this.addCommand({ id: 'open-today', name: t('打开今天'), callback: () => this.openToday() });
    this.addCommand({ id: 'carry', name: t('把没做完的带到今天'), callback: () => this.carryNow() });
    this.addCommand({ id: 'show-sidebar', name: t('在侧边栏打开'), callback: () => this.showView() });

    this.app.workspace.onLayoutReady(() => {
      this.bridge.start();
      // 登录了：后台问一下 GitHub 连没连、项目清单旧没旧；问题关了的定时打勾
      if (this.member.signedIn()) {
        void this.member.refresh().catch(() => {});
        void this.github.warm();
      }
      this.github.startTicking();
      window.setTimeout(async () => {
        await this.adoptDiaryOnce();
        this.checkDay();
      }, START_DELAY_MS);
    });
    // 跨天：开着过了零点、或者第二天从后台切回来
    this.registerInterval(window.setInterval(() => this.checkDay(), DAY_CHECK_MS));
    this.registerDomEvent(window, 'focus', () => this.checkDay());
  }

  onunload() {
    this.bridge?.stop();
  }

  refreshSettingsTab() {
    if (this.settingTab?.containerEl?.isConnected) this.settingTab.display();
  }

  async saveSettings() {
    this.settings.section = cleanSection(this.settings.section);
    await this.saveData(this.settings);
  }

  // 现在几点、今天是哪天：按 Obsidian 里 moment() 的时间算，和日记插件、Templater 用的是同一个时间
  // （有的库装了改时区的插件，电脑在美国、库按北京时间过日子）。返回的 Date 用 getDate() 这些读出来就是那个时间
  now() {
    const m = moment();
    return new Date(m.year(), m.month(), m.date(), m.hours(), m.minutes(), m.seconds());
  }

  // date 是 now() 那样「读出来就是那个时间」的 Date：按年月日时分秒交给 moment，不再按电脑时区换算一遍
  // （Obsidian 的时区和电脑不一样时，换两遍会差一天）
  formatDate(date, pattern) {
    const d = new Date(date);
    return moment([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()]).format(pattern);
  }

  pathFor(date) {
    return normalizePath(notePath(this.settings, date, (d, p) => this.formatDate(d, p)));
  }

  fileAt(path) {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
    return file instanceof TFile ? file : null;
  }

  io() {
    return {
      read: async (path) => {
        const file = this.fileAt(path);
        return file ? this.app.vault.read(file) : null;
      }
    };
  }

  // 第一次装上：库里已经有日记设置（日记核心插件 / Periodic Notes）就直接用它，说一句，能改
  async adoptDiaryOnce() {
    if (this.settings.adoptChecked) return;
    this.settings.adoptChecked = true;
    const diary = detectDiarySettings(this.app);
    if (diary && !sameAsDiary(this.settings, diary)) {
      Object.assign(this.settings, { folder: diary.folder, format: diary.format, template: diary.template });
      const shown = this.pathFor(this.now()).replace(/[^/]+$/, '') || '/';
      showNotice(t('日记放在「{path}」，和日记插件一样', { path: shown }), [{ label: t('改'), run: () => this.openSettings() }], 10000);
    }
    await this.saveSettings();
  }

  openSettings() {
    const setting = this.app.setting;
    setting?.open?.();
    setting?.openTabById?.(this.manifest.id);
  }

  checkDay() {
    if (this.handledKey === dateKey(this.now())) return;
    this.ensureToday({ carry: true })
      .then(() => this.views().forEach((view) => view.dayChanged()))
      .catch((error) => console.error('[今日待办] 准备今天的日记失败', error));
  }

  views() {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE).map((leaf) => leaf.view).filter((view) => view instanceof TodayView);
  }

  // 右侧栏打开「今天」；已经开着就切过去
  async showView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  notify(message, actions, timeout) {
    return showNotice(message, actions, timeout);
  }

  // 今天的日记：没有就建，没有事项这一节就补；carry 时顺便把以前没做完的带过来（一天只自动带一次）
  ensureToday({ carry = false } = {}) {
    if (this.running) return this.running.then(() => this.ensureToday({ carry }));
    this.running = this.prepareToday({ carry }).finally(() => { this.running = null; });
    return this.running;
  }

  async prepareToday({ carry }) {
    const today = this.now();
    const key = dateKey(today);
    const path = this.pathFor(today);
    const { vault } = this.app;
    const section = this.settings.section;

    const file = this.fileAt(path) || await this.createNote(path, today);

    // Templater 还在渲染：等它写完再动，免得抢着写
    for (let i = 0; i < TEMPLATE_WAIT_TRIES && isTemplatePending(await vault.read(file)); i++) {
      await wait(TEMPLATE_WAIT_MS);
    }

    const current = await vault.read(file);
    // 等过了还没渲染完（比如 Templater 在问「今天心情」）：这次什么都不写，过一分钟再看。
    // 现在写进去的（带来的待办）会被 Templater 渲染完整篇覆盖掉，而以前那几天已经拿走了
    if (isTemplatePending(current)) return file;
    if (ensureSection(current, section, this.parser) !== current) {
      await vault.process(file, (text) => ensureSection(text, section, this.parser));
    }

    if (carry && this.handledKey !== key) {
      this.handledKey = key;
      await this.autoCarry(file, today);
    }
    return file;
  }

  // 打开今天时不再自己带（2026-10-31 用户定的方案 A，和浏览器扩展同一条规矩）：只数一数以前还有几件没做完，
  // 侧边栏底下那一行「以前还有 N 件没做完　全部带来」说它们；点了才带，全部带
  async autoCarry(file, today) {
    const plan = await planCarry({
      io: this.io(), settings: this.settings, today, parser: this.parser, all: true,
      formatDate: (d, p) => this.formatDate(d, p)
    });
    this.setLeftOver(plan.days, today);
  }


  // 侧边栏底下那句话和它的小菜单用的数：每天剩几件、最近 3 天 / 7 天 / 全部各几件、点「去看看」去哪天
  setLeftOver(days, today = this.now()) {
    const total = days.reduce((sum, day) => sum + day.pending.length, 0);
    this.leftOver = total
      ? { dateKey: dateKey(today), total, date: addDays(today, -days[0].offset) }
      : null;
    this.views().forEach((view) => view.drawLeft());
  }

  // 带过来以后、撤销以后：重看一遍还剩几件（不再自己带）
  async refreshLeftOver() {
    try {
      const plan = await planCarry({ io: this.io(), settings: this.settings, today: this.now(), parser: this.parser, all: true, formatDate: (d, p) => this.formatDate(d, p) });
      this.setLeftOver(plan.days);
    } catch { /* 读不了就先留着原来那句 */ }
  }


  // 带过来：先写今天，再从以前的日记拿走（和扩展同样的顺序：中途出错也只会多一份，不会丢）
  async applyCarry(file, plan) {
    const { vault } = this.app;
    const section = this.settings.section;
    // 和今天是同一个文件的（周记这种）不算以前的，不从里面拿
    const days = plan.days.filter((day) => this.fileAt(day.path) !== file);
    if (!days.length) return;
    const moved = days.flatMap((day) => day.pending.map((todo) => this.cloneTodo(todo)));
    let todayBefore = '';
    let todayAfter = '';
    let record = [];
    let pending = false;
    await vault.process(file, (text) => {
      todayBefore = text;
      todayAfter = text;
      // Templater 还没渲染完：写进去也会被它覆盖，以前那几天也别动
      if (isTemplatePending(text)) { pending = true; return text; }
      const merged = mergeIntoToday(text, moved, section, this.parser);
      todayAfter = merged.content;
      record = merged.record;
      return todayAfter;
    });
    if (pending) throw new Error('Templater');

    const touched = [];
    for (const day of days) {
      const source = this.fileAt(day.path);
      if (!source) continue;
      let changed = false;
      await vault.process(source, (text) => {
        // 看完到现在这篇又被改过：不动它，宁可两边都有，也不拿错
        if (text !== day.before) return text;
        changed = true;
        return day.after;
      });
      if (changed) touched.push(day);
    }

    // 今天没变、以前那几天也一篇没动：什么都没带成，不说「带来了」
    if (todayAfter === todayBefore && !touched.length) return;
    const count = days.reduce((sum, day) => sum + day.pending.length, 0);
    const onlyYesterday = days.length === 1 && days[0].offset === 1;
    const message = onlyYesterday ? t('带来了昨天的 {count} 件', { count }) : t('带来了之前的 {count} 件', { count });
    showNotice(message, [{
      label: t('撤销'),
      run: () => this.undoCarry({ file, todayBefore, todayAfter, record, touched })
    }], 8000);
  }

  async undoCarry({ file, todayBefore, todayAfter, record, touched }) {
    const { vault } = this.app;
    let partial = false;
    for (const day of touched) {
      const source = this.fileAt(day.path);
      if (!source) { partial = true; continue; }
      await vault.process(source, (text) => {
        if (text === day.after) return day.before;
        partial = true;
        return text;
      });
    }
    // 今天这期间又改过：只拿掉真带来的、没动过的那几条（今天本来就有的同名待办、用户新加的子任务都留着）
    await vault.process(file, (text) => {
      if (text === todayAfter) return todayBefore;
      const undone = undoBrought(text, record, this.settings.section, this.parser);
      if (undone.partial) partial = true;
      return undone.content;
    });
    showNotice(partial ? t('有的日记这期间改过，那部分没撤回') : t('撤回了'), [], 4000);
    await this.refreshLeftOver();
  }

  // 侧边栏里改一件事的文字（发到 GitHub 后接上问题地址）：按位置找、文字对得上才改
  async editTodoText(file, path, expectText, change) {
    let ok = false;
    await this.app.vault.process(file, (content) => {
      const next = editTodo(content, path, expectText, (todo) => { todo.text = change(todo.text); }, this.settings.section, this.parser);
      if (next === null) return content;
      ok = true;
      return next;
    });
    return ok;
  }

  cloneTodo(todo) {
    return { ...todo, id: this.parser.generateId(), children: (todo.children || []).map((child) => this.cloneTodo(child)) };
  }

  // ---------- 命令 ----------

  async addTodo(text) {
    const value = String(text || '').trim();
    if (!value) return;
    try {
      const counted = await this.addTodoOn(this.now(), value);
      showNotice(counted ? countedMessage(counted) : t('加上了'), [], 2000);
    } catch (error) {
      showNotice(t('写不进今天的日记：{error}', { error: error?.message || error }), [], 8000);
    }
  }

  // 加到某一天最后：今天走 ensureToday（建文件、带过来）；别的天没有日记就照模板建一篇
  async addTodoOn(date, text) {
    const file = dateKey(date) === dateKey(this.now())
      ? await this.ensureToday({ carry: true })
      : await this.noteFor(date);
    // Templater 还没渲染完：现在加的会被它覆盖掉，不写，告诉用户
    let pending = false;
    let counted = null;
    await this.app.vault.process(file, (content) => {
      if (isTemplatePending(content)) { pending = true; return content; }
      // 已经在计次的同一件：那一行 +1，不加新的一行（扩展的 GitHub 问题 #46）
      const result = countOrAppend(content, text, this.settings.section, this.parser);
      counted = result.counted;
      return result.content;
    });
    if (pending) throw new Error('Templater');
    return counted;
  }

  async noteFor(date) {
    const path = this.pathFor(date);
    return this.fileAt(path) || this.createNote(path, date);
  }

  // 建一篇日记。模板里有 Templater 的 <% %>：交给 Templater 建（它才会渲染）；否则自己按模板写
  async createNote(path, date) {
    await this.ensureFolder(path);
    const title = path.split('/').pop().replace(/\.md$/, '');
    const template = this.templateFile();
    const templateText = template ? await this.app.vault.read(template) : '';
    const templater = this.app.plugins?.plugins?.['templater-obsidian']?.templater;
    if (template && /<%[\s\S]*?%>/.test(templateText) && typeof templater?.create_new_note_from_template === 'function') {
      try {
        const dir = path.split('/').slice(0, -1).join('/');
        const created = await templater.create_new_note_from_template(template, this.app.vault.getAbstractFileByPath(dir) || dir, title, false);
        const file = this.fileAt(path) || (created instanceof TFile ? created : null);
        if (file) return file;
      } catch (error) {
        console.warn('[今日待办] Templater 建日记失败，改成直接写', error);
      }
    }
    const existing = this.fileAt(path);
    if (existing) return existing;
    const content = newNoteContent({
      template: templateText,
      title,
      date,
      formatDate: (d, p) => this.formatDate(d, p),
      section: this.settings.section,
      parser: this.parser
    });
    try {
      return await this.app.vault.create(path, content);
    } catch (error) {
      // 同一刻别的插件刚建好了
      const file = this.fileAt(path);
      if (!file) throw error;
      return file;
    }
  }

  async openToday() {
    try {
      const file = await this.ensureToday({ carry: true });
      await this.openFile(file, true);
    } catch (error) {
      showNotice(t('写不进今天的日记：{error}', { error: error?.message || error }), [], 8000);
    }
  }

  async carryNow() {
    try {
      const file = await this.ensureToday({ carry: false });
      const plan = await planCarry({
        io: this.io(), settings: this.settings, today: this.now(), parser: this.parser, all: true,
        formatDate: (d, p) => this.formatDate(d, p)
      });
      if (!plan.total) {
        showNotice(t('以前的都做完了'), [], 3000);
        return;
      }
      await this.applyCarry(file, plan);
    } catch (error) {
      showNotice(t('写不进今天的日记：{error}', { error: error?.message || error }), [], 8000);
    }
    await this.refreshLeftOver();
  }

  async openPath(path) {
    const file = this.fileAt(path);
    if (file) await this.openFile(file, false);
  }

  // 打开日记；atTodos 时光标停在事项最后一条的末尾，接着就能写
  async openFile(file, atTodos) {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    const editor = leaf.view?.editor;
    if (!atTodos || !editor) return;
    const line = sectionEndLine(editor.getValue(), this.settings.section, this.parser);
    editor.setCursor({ line, ch: editor.getLine(line).length });
    editor.focus?.();
  }

  async ensureFolder(path) {
    const parts = path.split('/').slice(0, -1);
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      if (!this.app.vault.getAbstractFileByPath(dir)) {
        await this.app.vault.createFolder(dir).catch(() => {});
      }
    }
  }

  templateFile() {
    const name = String(this.settings.template || '').trim();
    if (!name) return null;
    const file = this.fileAt(name.endsWith('.md') ? name : `${name}.md`)
      || this.app.metadataCache.getFirstLinkpathDest(name, '');
    return file instanceof TFile ? file : null;
  }
}

// 一句话 + 最多一个动作；点了动作就收起
function showNotice(message, actions = [], timeout = 5000) {
  const fragment = document.createDocumentFragment();
  const row = document.createElement('div');
  row.className = 'yaoji-notice';
  const text = document.createElement('span');
  text.textContent = message;
  row.append(text);
  fragment.append(row);
  const notice = new Notice(fragment, timeout);
  for (const action of actions) {
    const button = document.createElement('button');
    button.className = 'yaoji-notice-action';
    button.textContent = action.label;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      notice.hide();
      action.run();
    });
    row.append(button);
  }
  return notice;
}

// 「添加待办」：一行输入，回车加到今天
class AddModal extends Modal {
  constructor(app, onSubmit) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.modalEl.addClass('yaoji-add-modal');
    const input = this.contentEl.createEl('input', { type: 'text', cls: 'yaoji-add-input', attr: { placeholder: t('加一件事，回车') } });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      const value = input.value;
      this.close();
      this.onSubmit(value);
    });
    window.setTimeout(() => input.focus(), 0);
  }

  onClose() {
    this.contentEl.empty();
  }
}
