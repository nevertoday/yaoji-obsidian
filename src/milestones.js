// 里程碑（和浏览器扩展的 GitHub 问题 #97 方案 B 一样，照奖杯底座上刻的那一行）。
// 写了 #里程碑 的事就是一个里程碑：第一次出现是「写下它」，第一次勾掉是「到了」；不设件数、不算分。
// 窗里一行一个：左边一个很大的序号，右边那句话和到的那天，最新的在上面；还没到的在最上面，序号是空心的轮廓。
// 今天刚到、这台电脑上还没看过的那个，第一次看见时空心的数字被墨填满一次。数直接读库里过去一年的日记。
// 最下面一行「认 #里程碑 的事　换个词」：换词是常驻的一条框（不放进菜单），记在插件设置 milestoneTag。
import * as obsidian from 'obsidian';
import { language, t } from './i18n.js';
import { addDays, dateKey, readTodos } from './today.js';
import G from './vendor/github-issues.js';

const { Modal } = obsidian;

export const LOOKBACK_DAYS = 366;
const SEEN_KEY = 'yaoji.milestonesSeen';
const LOCALES = { zh: 'zh-CN', 'zh-TW': 'zh-TW' };

// 没换过时跟着界面语言（中文 #里程碑，英文 #milestone…）
export function defaultMilestoneTag() {
  const local = t('里程碑·标签');
  return local && local !== '里程碑·标签' ? local : '里程碑';
}

export function milestoneTag(settings) {
  return G.cleanTag(settings?.milestoneTag || '') || defaultMilestoneTag();
}

// 面板上的那句话：第一行，去掉标签、图片、网址
export function milestoneText(text) {
  let line = String(text || '').split('\n').find((part) => part.trim()) || '';
  const hits = G.findTags(line);
  for (const hit of [...hits].reverse()) line = line.slice(0, hit.start) + line.slice(hit.end);
  return line.replace(/!\[\[[^\]]*\]\]/g, '').replace(/https?:\/\/\S+/g, '').replace(/^==|==$/g, '').replace(/\s+/g, ' ').trim();
}

export function isMilestone(text, tag) {
  const key = String(tag || '').toLocaleLowerCase();
  return G.findTags(String(text || '')).some((hit) => hit.tag.toLocaleLowerCase() === key);
}

// days：[{ key: 'YYYY-MM-DD', todos }]。同一句话算同一个；reached 按到的那天从早到晚，ahead 按写下的那天从早到晚
export function collectMilestones(days, tag) {
  const byText = new Map();
  // pos：那一天清单里的位置。新加的在最上面，同一天里越往下的越早写下
  let pos = 0;
  const walk = (key, list) => (list || []).forEach((todo) => {
    if (isMilestone(todo.text, tag)) {
      const text = milestoneText(todo.text);
      if (text) {
        const id = text.toLocaleLowerCase();
        let item = byText.get(id);
        if (!item) { item = { text, since: key, on: '', sincePos: pos }; byText.set(id, item); }
        if (todo.checked && !item.on) { item.on = key; item.text = text; }
        pos += 1;
      }
    }
    walk(key, todo.children);
  });
  [...days].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).forEach((day) => { pos = 0; walk(day.key, day.todos); });
  const all = [...byText.values()];
  // 早的在前；同一天的先看哪天写下的，再看位置（越往下的越早写下）
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const written = (a, b) => cmp(a.since, b.since) || b.sincePos - a.sincePos;
  const reached = all.filter((item) => item.on).sort((a, b) => cmp(a.on, b.on) || written(a, b));
  const ahead = all.filter((item) => !item.on).sort(written);
  return { reached, ahead };
}

// 还没到的在最上面（接着往下编号），到了的从新到旧；fresh：今天到的、还没看过的
export function milestoneRows({ reached = [], ahead = [] } = {}, { todayKey = '', seen = null } = {}) {
  const top = ahead.map((item, i) => ({ ...item, n: reached.length + i + 1, ahead: true })).reverse();
  const done = reached.map((item, i) => ({ ...item, n: i + 1, fresh: Boolean(seen) && item.on === todayKey && !seen.has(item.text.toLocaleLowerCase()) })).reverse();
  return [...top, ...done];
}

// 过去一年的日记（有的那几天）读出来算
export async function readMilestones(plugin, { days = LOOKBACK_DAYS } = {}) {
  const today = plugin.now();
  const list = [];
  for (let offset = 0; offset < days; offset++) {
    const date = addDays(today, -offset);
    const file = plugin.fileAt(plugin.pathFor(date));
    if (!file) continue;
    try {
      const content = await plugin.app.vault.cachedRead(file);
      list.push({ key: dateKey(date), todos: readTodos(content, plugin.settings.section, plugin.parser) });
    } catch (error) {
      console.debug('[今日待办] 里程碑：读不到', file.path, error);
    }
  }
  return collectMilestones(list, milestoneTag(plugin.settings));
}

// 勾掉一件写了 #里程碑 的事：提示里说这是第几个
export async function reachedMessage(plugin, todo) {
  const tag = milestoneTag(plugin.settings);
  if (!isMilestone(todo?.text, tag)) return '';
  const text = milestoneText(todo.text);
  if (!text) return '';
  const chars = [...text];
  const name = chars.length > 14 ? `${chars.slice(0, 13).join('')}…` : text;
  const { reached } = await readMilestones(plugin);
  const before = reached.filter((item) => item.text.toLocaleLowerCase() !== text.toLocaleLowerCase()).length;
  return t('刻上第 {n} 个里程碑：{name}', { n: before + 1, name });
}

function readSeen() {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw == null ? null : new Set(JSON.parse(raw));
  } catch { return null; }
}

function writeSeen(set) {
  try { window.localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-500))); } catch { /* 存不下就下次再填一次 */ }
}

const dateOf = (key) => new Date(`${key}T12:00:00`);

function dateLine(key) {
  const date = dateOf(key);
  const locale = LOCALES[language()] || language();
  return `${date.toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric' })} · ${date.toLocaleDateString(locale, { weekday: 'short' })}`;
}

export class MilestonesModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    this.modalEl.addClass('yaoji-ms-modal');
    this.titleEl.setText(t('里程碑'));
    // 最上面一条：在这里直接加一个——带上 #里程碑 写进今天的日记（和扩展一样）
    this.drawAdd(this.contentEl.createEl('form', { cls: 'yaoji-ms-add' }));
    this.listEl = this.contentEl.createDiv({ cls: 'yaoji-ms-body' });
    this.footEl = this.contentEl.createDiv({ cls: 'yaoji-ms-foot' });
    this.seen = readSeen();
    this.drawFoot();
    this.listEl.createEl('p', { cls: 'yaoji-ms-empty', text: t('正在翻过去一年的日记…') });
    await this.drawList();
  }

  onClose() {
    this.contentEl.empty();
  }

  async drawList() {
    const data = await readMilestones(this.plugin);
    const todayKey = dateKey(this.plugin.now());
    const rows = milestoneRows(data, { todayKey, seen: this.seen });
    this.listEl.empty();
    if (!rows.length) {
      this.listEl.createEl('p', { cls: 'yaoji-ms-empty', text: t('在一件事后面写上 #{tag}，做到那天，它会刻在这里。', { tag: milestoneTag(this.plugin.settings) }) });
    }
    const list = this.listEl.createEl('ol', { cls: 'yaoji-ms-list' });
    for (const row of rows) {
      const li = list.createEl('li');
      const el = row.ahead
        ? li.createDiv({ cls: 'yaoji-ms-row is-ahead' })
        : li.createEl('button', { cls: `yaoji-ms-row${row.fresh ? ' is-new' : ''}`, attr: { type: 'button', 'aria-label': `${t('第 {n} 个里程碑', { n: row.n })} · ${row.text} · ${dateLine(row.on)}` } });
      el.createSpan({ cls: 'yaoji-ms-n', text: String(row.n).padStart(2, '0'), attr: { 'aria-hidden': 'true' } });
      const copy = el.createSpan({ cls: 'yaoji-ms-copy' });
      copy.createEl('b', { text: row.text, attr: { dir: 'auto' } });
      if (row.ahead) {
        const days = Math.max(0, Math.round((dateOf(todayKey) - dateOf(row.since)) / 86400000));
        copy.createEl('small', { text: days ? t('还没到 · 写下它 {days} 天了', { days }) : t('还没到 · 今天写下的') });
      } else {
        copy.createEl('small', { text: dateLine(row.on) });
        el.addEventListener('click', () => this.openDay(row.on));
      }
    }
    // 以前到的都算看过（第一次打开时翻出来的旧里程碑不填墨）
    const next = new Set(readSeen() || []);
    data.reached.forEach((item) => next.add(item.text.toLocaleLowerCase()));
    writeSeen(next);
  }

  drawAdd(form) {
    const input = form.createEl('input', { type: 'text', attr: { maxlength: '200', placeholder: t('写一个想做到的事，回车'), 'aria-label': t('添加里程碑') } });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const value = input.value.trim();
      if (!value) { input.focus(); return; }
      const tag = milestoneTag(this.plugin.settings);
      const line = isMilestone(value, tag) ? value : `${value} #${tag}`;
      input.disabled = true;
      try {
        await this.plugin.addTodoOn(this.plugin.now(), line);
      } catch (error) {
        console.error('[今日待办] 加里程碑失败', error);
        this.plugin.notify(t('写不进今天的日记：{error}', { error: error?.message || error }), [], 8000);
        input.disabled = false;
        input.focus();
        return;
      }
      input.disabled = false;
      input.value = '';
      await this.drawList();
      input.focus();
    });
    window.setTimeout(() => input.focus(), 0);
  }

  async openDay(key) {
    this.close();
    await this.plugin.showView();
    this.plugin.views()[0]?.goTo(dateOf(key));
  }

  drawFoot(renaming = false) {
    const foot = this.footEl;
    foot.empty();
    const tag = milestoneTag(this.plugin.settings);
    if (!renaming) {
      foot.createSpan({ cls: 'yaoji-ms-foot-text', text: t('认 #{tag} 的事', { tag }) });
      const change = foot.createEl('button', { cls: 'yaoji-ms-link', text: t('换个词'), attr: { type: 'button' } });
      change.addEventListener('click', () => this.drawFoot(true));
      return;
    }
    const form = foot.createEl('form', { cls: 'yaoji-ms-rename' });
    form.createSpan({ cls: 'yaoji-ms-hash', text: '#', attr: { 'aria-hidden': 'true' } });
    const input = form.createEl('input', { type: 'text', value: tag, attr: { maxlength: '40', 'aria-label': t('里程碑的标签'), spellcheck: 'false' } });
    form.createEl('button', { cls: 'mod-cta', text: t('改好'), attr: { type: 'submit' } });
    const cancel = form.createEl('button', { cls: 'yaoji-ms-link', text: t('取消'), attr: { type: 'button' } });
    cancel.addEventListener('click', () => this.drawFoot());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.drawFoot(); }
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const clean = G.cleanTag(input.value);
      if (!clean) { input.focus(); return; }
      this.plugin.settings.milestoneTag = clean === defaultMilestoneTag() ? '' : clean;
      await this.plugin.saveSettings();
      this.drawFoot();
      await this.drawList();
    });
    window.setTimeout(() => { input.focus(); input.select(); }, 0);
  }
}
