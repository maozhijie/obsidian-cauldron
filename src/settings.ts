import { App, PluginSettingTab, Setting, TFile } from 'obsidian';
import type CauldronPlugin from './main';
import { DomainTagModal } from './ui/domain-tag-modal';
import { FLAVOR_COLORS } from './constants';
import type { DomainTag } from './types';

// ============ 插件设置（存储在 data.json 的 settings 字段） ============
export interface CauldronSettings {
  sealTime: string;                // 封炉时间，如 "23:00"
  pomodoroWorkMinutes: number;     // 番茄钟工作时长
  pomodoroBreakMinutes: number;    // 番茄钟休息时长
  showAnimation: boolean;          // 是否播放开炉动画
  showSound: boolean;              // 是否播放开炉音效
  dandaoFolder: string;            // 数据目录名（默认 dandao）
}

// ============ 运行时状态（存储在 data.json 的 runtime 字段） ============
export interface RuntimeState {
  lastSealDate: string;            // 上次封炉日期 YYYY-MM-DD
  lastOpenedDate: string;          // 上次打开日期 YYYY-MM-DD
  taskStateCache: Record<string, string[]>;  // 文件路径 → 已完成任务行文本哈希数组
}

// ============ data.json 完整结构 ============
export interface PluginData {
  settings: CauldronSettings;
  runtime: RuntimeState;
}

// ============ 默认值 ============
export const DEFAULT_SETTINGS: CauldronSettings = {
  sealTime: '23:00',
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
  showAnimation: true,
  showSound: false,
  dandaoFolder: 'dandao',
};

export const DEFAULT_RUNTIME: RuntimeState = {
  lastSealDate: '',
  lastOpenedDate: '',
  taskStateCache: {},
};

// ============ 设置页（占位，后续 Task 8 完善） ============
export class CauldronSettingTab extends PluginSettingTab {
  plugin: CauldronPlugin;

  constructor(app: App, plugin: CauldronPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: '丹道修炼系统 · 设置' });

    // ======== 1. 基础设置 ========
    containerEl.createEl('h3', { text: '基础设置' });

    new Setting(containerEl)
      .setName('封炉时间')
      .setDesc('每日自动封炉的时间点（24小时制，如 23:00）')
      .addText(text => text
        .setPlaceholder('23:00')
        .setValue(this.plugin.settings.sealTime)
        .onChange(async (value) => {
          this.plugin.settings.sealTime = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('番茄钟工作时长')
      .setDesc('单个番茄钟工作时段时长（分钟）')
      .addSlider(slider => slider
        .setLimits(5, 60, 5)
        .setValue(this.plugin.settings.pomodoroWorkMinutes)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.pomodoroWorkMinutes = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('番茄钟休息时长')
      .setDesc('番茄钟休息时段时长（分钟）')
      .addSlider(slider => slider
        .setLimits(1, 30, 1)
        .setValue(this.plugin.settings.pomodoroBreakMinutes)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.pomodoroBreakMinutes = value;
          await this.plugin.savePluginData();
        }));

    // ======== 2. 领域标签管理 ========
    containerEl.createEl('h3', { text: '领域标签管理' });

    new Setting(containerEl)
      .setDesc('领域标签定义了任务的成长维度映射。你可以直接编辑配置文件，或在此处管理。');

    // 标签列表预览
    const tagListContainer = containerEl.createDiv({ cls: 'dandao-tag-list' });
    const manager = this.plugin.domainTagManager;
    if (manager) {
      const tags: DomainTag[] = manager.getTags();
      if (tags.length === 0) {
        tagListContainer.createEl('p', { text: '暂无标签', attr: { style: 'color:var(--text-muted);' } });
      } else {
        for (const tag of tags) {
          const row = tagListContainer.createDiv({ attr: { style: 'display:flex;align-items:center;gap:8px;padding:4px 0;' } });
          const color = tag.color || FLAVOR_COLORS[tag.flavor] || '#888';
          row.createEl('span', {
            attr: {
              style: `display:inline-block;width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0;`,
            },
          });
          row.createEl('span', { text: tag.name, attr: { style: 'font-weight:500;' } });
          row.createEl('span', { text: tag.flavor, attr: { style: 'color:var(--text-muted);font-size:0.9em;' } });
        }
      }
    } else {
      tagListContainer.createEl('p', { text: '插件初始化中...', attr: { style: 'color:var(--text-muted);' } });
    }

    new Setting(containerEl)
      .setName('领域配置文件')
      .setDesc('直接在 Obsidian 中编辑领域标签配置')
      .addButton(button => button
        .setButtonText('打开配置文件')
        .onClick(async () => {
          const path = this.plugin.settings.dandaoFolder + '/领域配置.md';
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file) {
            await this.app.workspace.getLeaf().openFile(file as TFile);
          }
        }));

    new Setting(containerEl)
      .setName('新建领域标签')
      .setDesc('通过对话框快速创建新标签')
      .addButton(button => button
        .setButtonText('新建标签')
        .setCta()
        .onClick(() => {
          new DomainTagModal(this.app, async (tag) => {
            await this.plugin.domainTagManager?.addTag(tag);
            this.display(); // 刷新设置页
          }).open();
        }));

    // ======== 3. 数据目录 ========
    containerEl.createEl('h3', { text: '数据目录' });

    new Setting(containerEl)
      .setName('数据存储路径')
      .setDesc('修炼数据存储的 Vault 目录名称（修改后需重启插件）')
      .addText(text => text
        .setPlaceholder('dandao')
        .setValue(this.plugin.settings.dandaoFolder)
        .onChange(async (value) => {
          this.plugin.settings.dandaoFolder = value;
          await this.plugin.savePluginData();
        }));

    // ======== 4. 显示设置 ========
    containerEl.createEl('h3', { text: '显示设置' });

    new Setting(containerEl)
      .setName('开炉动画')
      .setDesc('封炉后首次查看丹药时是否播放动画效果')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showAnimation)
        .onChange(async (value) => {
          this.plugin.settings.showAnimation = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('开炉音效')
      .setDesc('封炉后首次查看丹药时是否播放音效')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.showSound)
        .onChange(async (value) => {
          this.plugin.settings.showSound = value;
          await this.plugin.savePluginData();
        }));

    // ======== 5. 高级设置 ========
    containerEl.createEl('h3', { text: '高级设置' });

    new Setting(containerEl)
      .setName('手动封炉')
      .setDesc('手动触发今日封炉（调试用）')
      .addButton(button => button
        .setButtonText('立即封炉')
        .onClick(() => {
          this.plugin.cycleManager?.manualSeal();
        }));
  }
}
