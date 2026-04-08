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
  seedReminderDays: number;        // 种子过期提醒天数
  agingExpiryDays: number;         // 药材默认有效期天数
  breakthroughDifficulty: 'easy' | 'normal' | 'hard';  // 突破难度
  defaultStatsPeriod: string;      // 默认统计周期

  // 标签配置
  domainTag: string;      // 领域标签
  seedTag: string;        // 种子标签
  projectTag: string;     // 项目标签
  goalTag: string;        // 目标标签
  excludeTag: string;     // 排除/归档标签

  // 笔记创建位置
  projectFolder: string;  // 项目笔记存放文件夹
  seedFolder: string;     // 种子笔记存放文件夹

  // 日记集成
  useDailyNotes: boolean; // 是否使用日记集成
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

  // 修炼状态（原存储在 dandao/修炼档案.md，现移到 data.json）
  cultivationState?: import('./types').CultivationState;
  furnaceState?: import('./types').FurnaceState;
  meridianStates?: import('./types').MeridianState[];

  // 多周期丹炉数据
  multiCycleFurnaces?: import('./types').MultiCycleFurnace[];
}

// ============ 默认值 ============
export const DEFAULT_SETTINGS: CauldronSettings = {
  sealTime: '23:00',
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
  showAnimation: true,
  showSound: false,
  seedReminderDays: 7,
  agingExpiryDays: 7,
  breakthroughDifficulty: 'normal',
  defaultStatsPeriod: 'week',

  // 标签配置
  domainTag: 'cauldron/domain',
  seedTag: 'cauldron/seed',
  projectTag: 'cauldron/project',
  goalTag: 'cauldron/goal',
  excludeTag: 'cauldron/archive',

  // 笔记创建位置
  projectFolder: '',
  seedFolder: '',

  // 日记集成
  useDailyNotes: true,
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
          // TODO: 后续需要改为基于标签搜索领域笔记
          const path = '领域配置.md';
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

    // ======== 3. 标签与存储 ========
    containerEl.createEl('h3', { text: '标签与存储' });

    new Setting(containerEl)
      .setName('领域标签')
      .setDesc('用于标识领域笔记的标签名称')
      .addText(text => text
        .setPlaceholder('cauldron/domain')
        .setValue(this.plugin.settings.domainTag)
        .onChange(async (value) => {
          this.plugin.settings.domainTag = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('种子标签')
      .setDesc('用于标识种子笔记的标签名称')
      .addText(text => text
        .setPlaceholder('cauldron/seed')
        .setValue(this.plugin.settings.seedTag)
        .onChange(async (value) => {
          this.plugin.settings.seedTag = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('项目标签')
      .setDesc('用于标识项目笔记的标签名称')
      .addText(text => text
        .setPlaceholder('cauldron/project')
        .setValue(this.plugin.settings.projectTag)
        .onChange(async (value) => {
          this.plugin.settings.projectTag = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('目标标签')
      .setDesc('用于标识目标笔记的标签名称')
      .addText(text => text
        .setPlaceholder('cauldron/goal')
        .setValue(this.plugin.settings.goalTag)
        .onChange(async (value) => {
          this.plugin.settings.goalTag = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('归档标签')
      .setDesc('用于标识已归档/排除笔记的标签名称')
      .addText(text => text
        .setPlaceholder('cauldron/archive')
        .setValue(this.plugin.settings.excludeTag)
        .onChange(async (value) => {
          this.plugin.settings.excludeTag = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('项目笔记文件夹')
      .setDesc('创建项目笔记时存放的文件夹路径（留空表示 Vault 根目录）')
      .addText(text => text
        .setPlaceholder('Projects')
        .setValue(this.plugin.settings.projectFolder)
        .onChange(async (value) => {
          this.plugin.settings.projectFolder = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('种子笔记文件夹')
      .setDesc('创建种子笔记时存放的文件夹路径（留空表示 Vault 根目录）')
      .addText(text => text
        .setPlaceholder('Seeds')
        .setValue(this.plugin.settings.seedFolder)
        .onChange(async (value) => {
          this.plugin.settings.seedFolder = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('使用日记集成')
      .setDesc('是否将药材和丹药记录保存到日记中（需要 Daily Notes 插件或核心日记插件）')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.useDailyNotes)
        .onChange(async (value) => {
          this.plugin.settings.useDailyNotes = value;
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

    // ======== 5. 游戏参数 ========
    containerEl.createEl('h3', { text: '游戏参数' });

    new Setting(containerEl)
      .setName('种子过期提醒天数')
      .setDesc('种子超过此天数未处理时标记为过期（1-30天）')
      .addSlider(slider => slider
        .setLimits(1, 30, 1)
        .setValue(this.plugin.settings.seedReminderDays)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.seedReminderDays = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('药材有效期天数')
      .setDesc('药材采集后的默认有效期（3-14天）')
      .addSlider(slider => slider
        .setLimits(3, 14, 1)
        .setValue(this.plugin.settings.agingExpiryDays)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.agingExpiryDays = value;
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('突破难度')
      .setDesc('影响突破成功率和条件要求')
      .addDropdown(dropdown => dropdown
        .addOption('easy', '简单')
        .addOption('normal', '普通')
        .addOption('hard', '困难')
        .setValue(this.plugin.settings.breakthroughDifficulty)
        .onChange(async (value) => {
          this.plugin.settings.breakthroughDifficulty = value as 'easy' | 'normal' | 'hard';
          await this.plugin.savePluginData();
        }));

    new Setting(containerEl)
      .setName('默认统计周期')
      .setDesc('打开统计面板时默认展示的时间范围')
      .addDropdown(dropdown => dropdown
        .addOption('week', '近一周')
        .addOption('month', '近一月')
        .addOption('quarter', '近一季')
        .addOption('year', '近一年')
        .addOption('all', '全部')
        .setValue(this.plugin.settings.defaultStatsPeriod)
        .onChange(async (value) => {
          this.plugin.settings.defaultStatsPeriod = value;
          await this.plugin.savePluginData();
        }));

    // ======== 6. 高级设置 ========
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
