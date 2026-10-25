import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LANGUAGES, MESSAGES, normalizeLanguage, setLanguage, t } from '../src/i18n.js';

test('每一句 13 种语言都有（中文是原文）', () => {
  for (const [key, translations] of Object.entries(MESSAGES)) {
    for (const language of LANGUAGES.filter((code) => code !== 'zh')) {
      assert.ok(translations[language], `「${key}」缺 ${language}`);
    }
  }
});

test('译文里的 {占位} 和原文一样', () => {
  for (const [key, translations] of Object.entries(MESSAGES)) {
    const want = (key.match(/{\w+}/g) || []).sort().join();
    for (const [language, text] of Object.entries(translations)) {
      assert.equal((text.match(/{\w+}/g) || []).sort().join(), want, `「${key}」${language}`);
    }
  }
});

test('代码里用到的每一句都在词典里', () => {
  const used = new Set();
  for (const file of readdirSync('src').filter((name) => name.endsWith('.js'))) {
    for (const match of readFileSync(`src/${file}`, 'utf8').matchAll(/\bt\('([^']+)'/g)) used.add(match[1]);
  }
  for (const key of used) assert.ok(MESSAGES[key], `词典里没有「${key}」`);
});

test('Obsidian 的语言代码对得上', () => {
  assert.equal(normalizeLanguage('zh'), 'zh');
  assert.equal(normalizeLanguage('zh-TW'), 'zh-TW');
  assert.equal(normalizeLanguage('pt-BR'), 'pt');
  assert.equal(normalizeLanguage('it'), 'en');
  assert.equal(normalizeLanguage(''), 'en');
});

test('换语言、填数字', () => {
  setLanguage('en');
  assert.equal(t('带来了昨天的 {count} 件', { count: 3 }), 'Brought over 3 from yesterday');
  setLanguage('zh');
  assert.equal(t('带来了昨天的 {count} 件', { count: 3 }), '带来了昨天的 3 件');
});
