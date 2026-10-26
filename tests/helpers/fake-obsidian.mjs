// member.js、github.js 引了 obsidian：测试里换成一个假的模块（requestUrl 交给 globalThis.__requestUrl）
import { register } from 'node:module';

const stub = `
export const requestUrl = (options) => globalThis.__requestUrl(options);
export class TFile { constructor(path) { this.path = path; } }
export class FuzzySuggestModal { constructor(app) { this.app = app; } setPlaceholder() {} open() {} }
export function moment() { return { format: () => '10/25' }; }
`;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier === 'obsidian') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(stub)}), shortCircuit: true };
  return next(specifier, context);
}`));

globalThis.window = globalThis;
globalThis.window.open = (url) => { (globalThis.__opened ||= []).push(url); };
