import { Plugin, TFile, debounce } from 'obsidian';
import {
  CauldronSettingTab,
  DEFAULT_SETTINGS,
  DEFAULT_RUNTIME,
  type CauldronSettings,
  type RuntimeState,
  type PluginData,
} from './settings';
import { CAULDRON_VIEW_TYPE } from './constants';
import { VaultDataManager } from './core/vault-data-manager';
import { DomainTagManager } from './core/domain-tag-manager';
import { CatalystCollector } from './core/catalyst-collector';
import { HerbCollector } from './core/herb-collector';
import { PomodoroTimer } from './pomodoro/pomodoro-timer';
import { CycleManager } from './core/cycle-manager';
import { CauldronView } from './ui/cauldron-view';
import { FurnaceModal, PillListModal } from './ui/furnace-modal';

export default class CauldronPlugin extends Plugin {
  settings: CauldronSettings = DEFAULT_SETTINGS;
  runtime: RuntimeState = DEFAULT_RUNTIME;

  // 核心管理器
  vaultDataManager!: VaultDataManager;
  domainTagManager!: DomainTagManager;
  herbCollector!: HerbCollector;
  catalystCollector!: CatalystCollector;
  pomodoroTimer!: PomodoroTimer;
  cycleManager!: CycleManager;

  async onload() {
    // 1. 加载持久化数据
    await this.loadPluginData();

    // 2. VaultDataManager → 确保目录存在
    this.vaultDataManager = new VaultDataManager(this.app, this.settings.dandaoFolder);
    await this.vaultDataManager.ensureDirectories();

    // 3. DomainTagManager → 初始化标签
    this.domainTagManager = new DomainTagManager(this.app, this.vaultDataManager);
    await this.domainTagManager.initialize();

    // 4. CatalystCollector
    this.catalystCollector = new CatalystCollector(this.vaultDataManager);

    // 5. HerbCollector → 注入 CatalystCollector → 建立初始缓存
    this.herbCollector = new HerbCollector(
      this.app,
      this.vaultDataManager,
      this.domainTagManager,
      () => this.runtime.taskStateCache,
      (cache) => { this.runtime.taskStateCache = cache; },
    );
    this.herbCollector.setCatalystCollector(this.catalystCollector);
    await this.herbCollector.initialize();

    // 6. PomodoroTimer → 绑定事件
    this.pomodoroTimer = new PomodoroTimer(
      this.settings.pomodoroWorkMinutes,
      this.settings.pomodoroBreakMinutes,
    );
    this.pomodoroTimer.on('complete', async () => {
      await this.catalystCollector.collectFocusCatalyst();
      await this.refreshView();
    });
    this.pomodoroTimer.on('interrupt', async () => {
      await this.catalystCollector.collectInterruptCatalyst();
      await this.refreshView();
    });

    // 7. CycleManager
    this.cycleManager = new CycleManager(
      this.app,
      this.vaultDataManager,
      this.domainTagManager,
      () => this.settings.sealTime,
      (date: string) => { this.runtime.lastSealDate = date; this.savePluginData(); },
      () => this.runtime.lastSealDate,
    );

    // 8. 注册视图
    this.registerView(CAULDRON_VIEW_TYPE, (leaf) => new CauldronView(leaf));

    // 9. 注册设置页
    this.addSettingTab(new CauldronSettingTab(this.app, this));

    // 10. Ribbon 图标
    this.addRibbonIcon('flame', '打开丹道修炼面板', () => {
      this.activateView();
    });

    // 11. 注册命令
    this.addCommand({
      id: 'open-cauldron-view',
      name: '打开丹道修炼面板',
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: 'start-pomodoro',
      name: '开始番茄钟',
      callback: () => this.pomodoroTimer.start(),
    });
    this.addCommand({
      id: 'stop-pomodoro',
      name: '停止番茄钟',
      callback: () => this.pomodoroTimer.stop(),
    });
    this.addCommand({
      id: 'manual-seal',
      name: '手动封炉',
      callback: () => this.cycleManager.manualSeal(),
    });
    this.addCommand({
      id: 'open-pill-list',
      name: '查看丹药历史',
      callback: () => new PillListModal(this.app, this.vaultDataManager).open(),
    });

    // 12. 监听文件变更（防抖）
    const debouncedFileHandler = debounce(
      async (file: TFile) => {
        const hasNewCollection = await this.herbCollector.onFileModify(file);
        if (hasNewCollection) {
          await this.refreshView();
        }
      },
      1000,
      true,
    );

    // 监听 dandao 目录下文件变更（用户手动编辑日志时刷新视图）
    const debouncedDandaoRefresh = debounce(
      async () => {
        await this.refreshView();
      },
      500,
      true,
    );

    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (file instanceof TFile) {
        // 检查是否是 dandao 目录下的文件
        const folder = this.settings.dandaoFolder.toLowerCase();
        const path = file.path.toLowerCase();
        if (path.startsWith(folder + '/') || path.startsWith(folder + '\\')) {
          // dandao 目录下的文件变更，刷新视图
          debouncedDandaoRefresh();
        } else {
          // 其他文件变更，检查是否采集到新药材
          debouncedFileHandler(file);
        }
      }
    }));

    // 13. 每60秒检查封炉
    this.registerInterval(
      window.setInterval(() => { this.cycleManager.checkAndSeal(); }, 60_000),
    );

    // 14. 补封遗漏日期
    await this.cycleManager.checkMissedSeals();

    // 15. 检查未查看丹药，展示 FurnaceModal
    await this.showUnviewedPills();
  }

  async onunload() {
    if (this.pomodoroTimer) {
      this.pomodoroTimer.destroy();
    }
    try {
      await this.savePluginData();
    } catch (e) {
      console.error('丹道插件：保存数据失败（卸载阶段）', e);
    }
  }

  // ============ 数据持久化 ============

  async loadPluginData() {
    const data = (await this.loadData()) as PluginData | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);
    this.runtime = Object.assign({}, DEFAULT_RUNTIME, data?.runtime);
  }

  async savePluginData() {
    const data: PluginData = {
      settings: this.settings,
      runtime: this.runtime,
    };
    await this.saveData(data);
  }

  // ============ 视图激活 ============

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(CAULDRON_VIEW_TYPE)[0];
    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({ type: CAULDRON_VIEW_TYPE, active: true });
        leaf = rightLeaf;
      }
    }
    if (leaf) {
      workspace.revealLeaf(leaf);
      const view = leaf.view as CauldronView;
      view.vaultDataManager = this.vaultDataManager;
      view.pomodoroTimer = this.pomodoroTimer;
      view.domainTagManager = this.domainTagManager;
      view.sealTime = this.settings.sealTime;
      view.onPomodoroTimerSet();
    }
  }

  // ============ 刷新视图 ============

  private async refreshView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(CAULDRON_VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view as CauldronView;
      view.vaultDataManager = this.vaultDataManager;
      view.pomodoroTimer = this.pomodoroTimer;
      view.domainTagManager = this.domainTagManager;
      view.sealTime = this.settings.sealTime;
      view.onPomodoroTimerSet();
      await view.refresh();
    }
  }

  // ============ 开炉检查 ============

  private async showUnviewedPills(): Promise<void> {
    const unviewed = await this.vaultDataManager.getUnviewedPills();
    if (unviewed.length > 0) {
      const latest = unviewed[unviewed.length - 1]!;
      const dailyLog = await this.vaultDataManager.getDailyLog(latest.dateKey);
      new FurnaceModal(
        this.app,
        this.vaultDataManager,
        latest.pill,
        latest.dateKey,
        dailyLog ?? undefined,
      ).open();
    }
  }
}
