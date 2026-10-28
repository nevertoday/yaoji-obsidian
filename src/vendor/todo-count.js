/**
 * 一件事做几次（GitHub 问题 #46 方案 A，照「时钟 › 秒表」的「计次」）
 *
 * 次数就写在那一行字后面：`- [ ] 颈椎操 ×3`，日记里是普通的字，Obsidian 里看得懂、手改也行。
 * 清单里把「×3」从字里拿出来，放成行尾一个小数，点一下 +1；方框还是「做完」。
 * 多行的事：次数写在第一行末尾。Obsidian 插件（src/today.js）认同一种写法。
 */
(function initTodoCount(globalScope) {
  'use strict';

  // 第一行末尾、前面是空格（或什么都没有）的「×数字」
  const MARK = /(^|[ \t])×(\d{1,4})[ \t]*$/;

  function split(text) {
    const value = String(text ?? '');
    const at = value.indexOf('\n');
    return at < 0 ? [value, ''] : [value.slice(0, at), value.slice(at)];
  }

  // → { base: 去掉次数的字, count: 次数（没有是 0）}
  function parse(text) {
    const [first, rest] = split(text);
    const match = first.match(MARK);
    const count = match ? Number(match[2]) : 0;
    if (!match || !(count > 0)) return { base: String(text ?? ''), count: 0 };
    return { base: first.slice(0, match.index).replace(/[ \t]+$/, '') + rest, count };
  }

  // 把次数改成 count（0 = 拿掉次数）
  function withCount(text, count) {
    const { base } = parse(text);
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (!n) return base;
    const [first, rest] = split(base);
    return `${first.replace(/[ \t]+$/, '')} ×${n}${rest}`;
  }

  // 输入框里打的「颈椎操」「颈椎操+1」「颈椎操 +2」「颈椎操 ×3」都算「颈椎操」
  function inputBase(text) {
    return String(text ?? '').trim().replace(/[ \t]*(?:[+＋][ \t]*\d{0,4}|×[ \t]*\d{1,4})$/, '').trim();
  }

  const key = (text) => split(text)[0].replace(/\s+/g, ' ').trim().toLocaleLowerCase();

  // 输入框里打的是不是这一件（只比第一行，不分大小写、多个空格算一个）
  function sameThing(todoText, typed) {
    const name = key(parse(todoText).base);
    return Boolean(name) && name === key(inputBase(typed));
  }

  // 提示里说的那件事：第一行，去掉 ![[附件]]，太长截短
  function label(text, max = 24) {
    const plain = split(parse(text).base)[0].replace(/!\[\[[^\]]*\]\]/g, '').replace(/\s+/g, ' ').trim();
    return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
  }

  const api = { parse, withCount, inputBase, sameThing, label };
  globalScope.TodoCount = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
