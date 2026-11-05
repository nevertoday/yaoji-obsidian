import './helpers/fake-obsidian.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLanguage } from '../src/i18n.js';

// 里程碑（和扩展的 GitHub 问题 #97 方案 B 一样）：写了 #里程碑 的事，做到那天刻一行大号序号
const { collectMilestones, milestoneRows, milestoneText, milestoneTag, defaultMilestoneTag } = await import('../src/milestones.js');
const todo = (text, checked = false, children = []) => ({ text, checked, children });

test('same sentence across days is one milestone; first tick is the day it was reached; subtasks count', () => {
  const days = [
    { key: '2026-10-02', todos: [todo('跑完第一个半马 #里程碑', true, [todo('搬进新家 #里程碑', true)])] },
    { key: '2026-10-01', todos: [todo('跑完第一个半马 #里程碑'), todo('读完 12 本书 #里程碑'), todo('买菜', true)] },
    { key: '2026-10-05', todos: [todo('读完 12 本书 #里程碑 https://x.com/a ![[图.png]]')] }
  ];
  const { reached, ahead } = collectMilestones(days, '里程碑');
  assert.deepEqual(reached.map((m) => [m.text, m.since, m.on]), [['跑完第一个半马', '2026-10-01', '2026-10-02'], ['搬进新家', '2026-10-02', '2026-10-02']]);
  assert.deepEqual(ahead.map((m) => [m.text, m.since]), [['读完 12 本书', '2026-10-01']]);
  const rows = milestoneRows({ reached, ahead }, { todayKey: '2026-10-02', seen: new Set(['跑完第一个半马']) });
  assert.deepEqual(rows.map((r) => [r.n, r.text, Boolean(r.ahead), Boolean(r.fresh)]), [[3, '读完 12 本书', true, false], [2, '搬进新家', false, true], [1, '跑完第一个半马', false, false]]);
  assert.equal(milestoneText('==上线 #里程碑== ![[a.png]]'), '上线');
});

test('the word can be changed; unset follows the UI language', () => {
  setLanguage('zh');
  assert.equal(defaultMilestoneTag(), '里程碑');
  assert.equal(milestoneTag({ milestoneTag: '#目标' }), '目标');
  setLanguage('en');
  assert.equal(milestoneTag({ milestoneTag: '' }), 'milestone');
  setLanguage('zh');
  assert.deepEqual(collectMilestones([{ key: '2026-11-01', todos: [todo('上线 #目标', true), todo('不算 #里程碑', true)] }], '目标').reached.map((m) => m.text), ['上线']);
});

test('wiring: a flag next to the day arrows and a command open it; ticking one says which number it is', () => {
  const view = readFileSync(new URL('../src/view.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(view, /setIcon\(flag, 'flag'\);\n {4}flag\.addEventListener\('click', \(\) => new MilestonesModal\(this\.app, this\.plugin\)\.open\(\)\);/);
  assert.match(view, /const message = await reachedMessage\(this\.plugin, todo\);/);
  assert.match(main, /this\.addCommand\(\{ id: 'milestones', name: t\('里程碑'\), callback: \(\) => new MilestonesModal\(this\.app, this\)\.open\(\) \}\);/);
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.yaoji-ms-row\.is-ahead \.yaoji-ms-n \{\n  color: transparent;/);
});
