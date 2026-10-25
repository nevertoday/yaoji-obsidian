// 设置：日记放在哪、文件名、待办放在哪个标题下；用了日记插件的模板才多一行模板。
// 默认值和浏览器扩展一样（core/storage.js note / sections）。
import * as obsidian from 'obsidian';
import { t } from './i18n.js';
import { notePath } from './today.js';

const { PluginSettingTab, Setting, moment, normalizePath } = obsidian;

export const DEFAULT_SETTINGS = {
  folder: '日记',
  format: 'YYYY-MM-DD',
  section: '### 事项',
  template: '',
  // 第一次打开时看过日记插件的设置了（只看一次）
  adoptChecked: false,
  // 配对过的浏览器：[{ token, origin, name, at }]
  browsers: []
};

// 标题要以 # 开头才找得到；只写了字就当三级标题
export function cleanSection(value) {
  const text = String(value || '').trim();
  if (!text) return DEFAULT_SETTINGS.section;
  return /^#{1,6}\s+\S/.test(text) ? text : `### ${text.replace(/^#+\s*/, '')}`;
}

const cleanFolder = (value) => String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();

// 库里已有的日记设置：Periodic Notes 开着的「日记」优先，再看日记核心插件。都没开返回 null
export function detectDiarySettings(app) {
  try {
    const periodic = app.plugins?.getPlugin?.('periodic-notes')?.settings?.daily;
    if (periodic?.enabled) {
      return { folder: cleanFolder(periodic.folder), format: periodic.format || 'YYYY-MM-DD', template: periodic.template || '' };
    }
    const daily = app.internalPlugins?.getPluginById?.('daily-notes');
    if (daily?.enabled) {
      const options = daily.instance?.options || {};
      return { folder: cleanFolder(options.folder), format: options.format || 'YYYY-MM-DD', template: options.template || '' };
    }
  } catch (error) {
    console.debug('[今日待办] 读不到日记插件的设置', error);
  }
  return null;
}

export function sameAsDiary(settings, diary) {
  return cleanFolder(settings.folder) === diary.folder
    && (settings.format || 'YYYY-MM-DD') === diary.format
    && String(settings.template || '') === String(diary.template || '');
}

export class YaojiSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const plugin = this.plugin;
    const settings = plugin.settings;
    containerEl.empty();

    const diary = detectDiarySettings(this.app);
    if (diary && !sameAsDiary(settings, diary)) {
      new Setting(containerEl)
        .setName(t('用日记插件的设置'))
        .setDesc(`${diary.folder || '/'} · ${diary.format}`)
        .addButton((button) => button.setButtonText(t('沿用')).onClick(async () => {
          Object.assign(settings, diary);
          await plugin.saveSettings();
          this.display();
        }));
    }

    let preview = null;
    const showPreview = () => {
      const path = normalizePath(notePath(settings, this.plugin.now(), (d, p) => moment(d).format(p)));
      preview?.setText(t('今天是 {path}', { path }));
    };

    new Setting(containerEl)
      .setName(t('日记放在哪'))
      .addText((text) => text
        .setPlaceholder('/')
        .setValue(settings.folder)
        .onChange(async (value) => {
          settings.folder = cleanFolder(value);
          await plugin.saveSettings();
          showPreview();
        }));

    const fileSetting = new Setting(containerEl)
      .setName(t('文件名'))
      .addMomentFormat((format) => format
        .setDefaultFormat('YYYY-MM-DD')
        .setValue(settings.format)
        .onChange(async (value) => {
          settings.format = String(value || '').trim() || 'YYYY-MM-DD';
          await plugin.saveSettings();
          showPreview();
        }));
    preview = fileSetting.descEl.createSpan({ cls: 'yaoji-path-preview' });
    showPreview();

    new Setting(containerEl)
      .setName(t('待办放在哪个标题下'))
      .addText((text) => {
        text.setPlaceholder(DEFAULT_SETTINGS.section).setValue(settings.section);
        // 打完再整理（只写了字就补成 ###），不在打字途中改输入框
        text.inputEl.addEventListener('blur', async () => {
          settings.section = cleanSection(text.getValue());
          text.setValue(settings.section);
          await plugin.saveSettings();
        });
        return text;
      });

    // 连上的浏览器：一个一行，能断开。一个都没有就不出现
    for (const browser of Array.isArray(settings.browsers) ? settings.browsers : []) {
      new Setting(containerEl)
        .setName(t('连着的浏览器'))
        .setDesc(`${browser.name || 'Chrome'} · ${new Date(browser.at || Date.now()).toLocaleDateString()}`)
        .addButton((button) => button.setButtonText(t('断开')).onClick(async () => {
          settings.browsers = settings.browsers.filter((entry) => entry.token !== browser.token);
          await plugin.saveSettings();
          this.display();
        }));
    }

    if (settings.template || diary?.template) {
      new Setting(containerEl)
        .setName(t('新日记用的模板'))
        .addText((text) => text
          .setPlaceholder(t('不用模板'))
          .setValue(settings.template)
          .onChange(async (value) => {
            settings.template = String(value || '').trim();
            await plugin.saveSettings();
          }));
    }
  }
}
