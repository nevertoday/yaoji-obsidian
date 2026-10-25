import test from 'node:test';
import assert from 'node:assert/strict';

// bridge.js 引了 obsidian，这里只测不碰 Obsidian 的几个判断：先给一个假的 obsidian 模块
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'obsidian') return { url: 'data:text/javascript,export class Modal{};export const Platform={};export class TFile{};export class TFolder{};export const normalizePath=(p)=>p;', shortCircuit: true };
  return next(specifier, context);
}`));
const { cleanVaultPath, hostAllowed, originAllowed, sameToken, writableFile } = await import('../src/bridge.js');

test('路径：能解码中文，不许 .. 和 .obsidian', () => {
  assert.equal(cleanVaultPath('/%E6%88%91/%E6%97%A5%E8%AE%B0/D-2026-10-25_%20%E5%91%A8%E6%97%A5.md', '.obsidian'), '我/日记/D-2026-10-25_ 周日.md');
  assert.equal(cleanVaultPath('/', '.obsidian'), '');
  assert.equal(cleanVaultPath('/a/../../etc/passwd', '.obsidian'), null);
  assert.equal(cleanVaultPath('/.obsidian/plugins/x/data.json', '.obsidian'), null);
  assert.equal(cleanVaultPath('/.my-config/plugins/x/data.json', '.my-config'), null);
  assert.equal(cleanVaultPath('/日记/a.md', ''), null);
  assert.equal(cleanVaultPath('/%E0%A4%A', '.obsidian'), null);
});

// 对抗测试里打穿过的：磁盘不分大小写时 .OBSIDIAN 就是 .obsidian（能写进插件文件夹 = 能在电脑上跑程序）
test('路径：以点开头的一段都不碰，大小写、编码、短文件名、冒号都绕不过去', () => {
  for (const raw of [
    '/.OBSIDIAN/plugins/evil/main.js', '/.Obsidian/community-plugins.json', '/%2eobsidian/app.json', '/%2EOBSIDIAN/app.json',
    '/Daily/%2e%2e/.obsidian/app.json', '//.obsidian/app.json', '/.git/hooks/post-commit', '/.trash/a.md', '/.TRASH/a.md',
    '/notes/.hidden/a.md', '/OBSIDI~1/plugins/x/main.js', '/C:/Windows/a.md', '/a.md:stream', '/a%00.md', '/a%0A.md',
    '/..%2f..%2fetc/passwd', '/..%5c..%5cetc/passwd', '/a/../../x.md', '/./a.md'
  ]) assert.equal(cleanVaultPath(raw, '.obsidian'), null, raw);
  assert.equal(cleanVaultPath('/MY-CONFIG/a.md', 'my-config'), null);
  assert.equal(cleanVaultPath('/日记/会议~记录.md', '.obsidian'), '日记/会议~记录.md');
  assert.equal(cleanVaultPath('/日记/2026 年度总结~第2版.md', '.obsidian'), '日记/2026 年度总结~第2版.md');
});

test('只能写笔记和附件', () => {
  for (const ok of ['日记/a.md', 'a.markdown', 'a.txt', '附件/a.PNG', 'a.jpeg', 'a.webp', 'a.svg', 'a.pdf', 'a.mp4']) assert.equal(writableFile(ok), true, ok);
  for (const bad of ['evil.js', 'evil.html', 'a.json', 'a.css', 'a.sh', 'a.md.exe', 'a', 'a.canvas']) assert.equal(writableFile(bad), false, bad);
});

test('密钥比较：长度、内容都要一样', () => {
  assert.equal(sameToken('abc', 'abc'), true);
  assert.equal(sameToken('abc', 'abd'), false);
  assert.equal(sameToken('abc', 'abcd'), false);
  assert.equal(sameToken('', ''), false);
});

test('只认扩展来的请求，网页不行；Host 只能是本机（防 DNS 重绑定）', () => {
  assert.equal(originAllowed('chrome-extension://abcdefghijklmnopabcdefghijklmnop'), true);
  assert.equal(originAllowed(''), true);
  assert.equal(originAllowed('https://evil.example'), false);
  assert.equal(originAllowed('null'), false);
  assert.equal(hostAllowed('127.0.0.1:27125'), true);
  assert.equal(hostAllowed('evil.example:27125'), false);
});
