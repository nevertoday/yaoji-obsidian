import test from 'node:test';
import assert from 'node:assert/strict';

// bridge.js 引了 obsidian，这里只测不碰 Obsidian 的几个判断：先给一个假的 obsidian 模块
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'obsidian') return { url: 'data:text/javascript,export class Modal{};export const Platform={};export class TFile{};export class TFolder{};export const normalizePath=(p)=>p;', shortCircuit: true };
  return next(specifier, context);
}`));
const { cleanVaultPath, hostAllowed, originAllowed } = await import('../src/bridge.js');

test('路径：能解码中文，不许 .. 和 .obsidian', () => {
  assert.equal(cleanVaultPath('/%E6%88%91/%E6%97%A5%E8%AE%B0/D-2026-10-25_%20%E5%91%A8%E6%97%A5.md', '.obsidian'), '我/日记/D-2026-10-25_ 周日.md');
  assert.equal(cleanVaultPath('/', '.obsidian'), '');
  assert.equal(cleanVaultPath('/a/../../etc/passwd', '.obsidian'), null);
  assert.equal(cleanVaultPath('/.obsidian/plugins/x/data.json', '.obsidian'), null);
  assert.equal(cleanVaultPath('/.my-config/plugins/x/data.json', '.my-config'), null);
  assert.equal(cleanVaultPath('/日记/a.md', ''), null);
  assert.equal(cleanVaultPath('/%E0%A4%A', '.obsidian'), null);
});

test('只认扩展来的请求，网页不行；Host 只能是本机（防 DNS 重绑定）', () => {
  assert.equal(originAllowed('chrome-extension://abcdefghijklmnopabcdefghijklmnop'), true);
  assert.equal(originAllowed(''), true);
  assert.equal(originAllowed('https://evil.example'), false);
  assert.equal(originAllowed('null'), false);
  assert.equal(hostAllowed('127.0.0.1:27125'), true);
  assert.equal(hostAllowed('evil.example:27125'), false);
});
