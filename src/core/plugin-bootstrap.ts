import { TFile, debounce } from 'obsidian';
import type CauldronPlugin from '../main';
import { CAULDRON_VIEW_TYPE } from '../constants';
import { VaultDataManager } from '../core/vault-data-manager';
import { DomainTagManager } from '../core/domain-tag-manager';
import { CatalystCollector } from '../core/catalyst-collector';
import { HerbCollector } from '../core/herb-collector';
import { PomodoroTimer } from '../pomodoro/pomodoro-timer';
import { CycleManager } from '../core/cycle-manager';
import { CauldronView } from '../ui/cauldron-view';
import { CauldronSettingTab } from '../settings';
import { FurnaceModal, PillListModal } from '../ui/furnace-modal';
import { SeedManager } from '../core/seed-manager';
import { QuickSeedModal } from '../ui/modals/seed-modal';
import { BreakthroughModal } from '../ui/modals/breakthrough-modal';
import { MultiCycleModal } from '../ui/modals/multi-cycle-modal';
import { CultivationManager } from '../core/cultivation/cultivation-manager';

/**
 * bootstrapPlugin — 从 main.ts onload() 中提取的全部初始化逻辑。
 */
export async function bootstrapPlugin(plugin: CauldronPlugin): Promise<void> {
  // 1. VaultDataManager → 确保目录存在
  plugin.vaultDataManager = new VaultDataManager(plugin.app, plugin.settings.dandaoFolder);
  await plugin.vaultDataManager.ensureDirectories();

  // 2. DomainTagManager → 初始化标签
  plugin.domainTagManager = new DomainTagManager(plugin.app, plugin.vaultDataManager);
  await plugin.domainTagManager.initialize();

  // 3. CatalystCollector
  plugin.catalystCollector = new CatalystCollector(plugin.vaultDataManager);

  // 4. HerbCollector → 注入 CatalystCollector → 建立初始缓存
  plugin.herbCollector = new HerbCollector(
    plugin.app,
    plugin.vaultDataManager,
    plugin.domainTagManager,
    () => plugin.runtime.taskStateCache,
    (cache) => { plugin.runtime.taskStateCache = cache; },
  );
  plugin.herbCollector.setCatalystCollector(plugin.catalystCollector);
  await plugin.herbCollector.initialize();

  // 5. PomodoroTimer → 绑定事件
  plugin.pomodoroTimer = new PomodoroTimer(
    plugin.settings.pomodoroWorkMinutes,
    plugin.settings.pomodoroBreakMinutes,
  );
  plugin.pomodoroTimer.on('complete', async () => {
    await plugin.catalystCollector.collectFocusCatalyst();
    await refreshView(plugin);
  });
  plugin.pomodoroTimer.on('interrupt', async () => {
    await plugin.catalystCollector.collectInterruptCatalyst();
    await refreshView(plugin);
  });

  // 6. CycleManager
  plugin.cycleManager = new CycleManager(
    plugin.app,
    plugin.vaultDataManager,
    plugin.domainTagManager,
    () => plugin.settings.sealTime,
    (date: string) => { plugin.runtime.lastSealDate = date; plugin.savePluginData(); },
    () => plugin.runtime.lastSealDate,
  );

  // 7. 注册视图
  plugin.registerView(CAULDRON_VIEW_TYPE, (leaf) => new CauldronView(leaf));

  // 8. 注册设置页
  plugin.addSettingTab(new CauldronSettingTab(plugin.app, plugin));

  // 9. Ribbon 图标
  plugin.addRibbonIcon('flame', '打开丹道修炼面板', () => {
    plugin.activateView();
  });

  // 10. 注册命令
  plugin.addCommand({
    id: 'open-cauldron-view',
    name: '打开丹道修炼面板',
    callback: () => plugin.activateView(),
  });
  plugin.addCommand({
    id: 'start-pomodoro',
    name: '开始番茄钟',
    callback: () => plugin.pomodoroTimer.start(),
  });
  plugin.addCommand({
    id: 'stop-pomodoro',
    name: '停止番茄钟',
    callback: () => plugin.pomodoroTimer.stop(),
  });
  plugin.addCommand({
    id: 'manual-seal',
    name: '手动封炉',
    callback: () => plugin.cycleManager.manualSeal(),
  });
  plugin.addCommand({
    id: 'open-pill-list',
    name: '查看丹药历史',
    callback: () => new PillListModal(plugin.app, plugin.vaultDataManager).open(),
  });
  plugin.addCommand({
    id: 'quick-seed',
    name: '快速播种',
    callback: () => {
      const seedManager = new SeedManager(plugin.vaultDataManager, plugin.eventBus);
      new QuickSeedModal(plugin.app, seedManager, () => refreshView(plugin)).open();
    },
  });
  plugin.addCommand({
    id: 'open-investment',
    name: '打开投注系统',
    callback: async () => {
      await activateViewAndSwitchTab(plugin, 'investment');
    },
  });
  plugin.addCommand({
    id: 'attempt-breakthrough',
    name: '尝试突破',
    callback: async () => {
      const cultivationMgr = new CultivationManager(plugin.vaultDataManager, plugin.eventBus);
      const state = await cultivationMgr.getState();
      new BreakthroughModal(plugin.app, plugin.vaultDataManager, state).open();
    },
  });
  plugin.addCommand({
    id: 'manage-multi-furnace',
    name: '管理周期炉',
    callback: () => {
      new MultiCycleModal(plugin.app, plugin.vaultDataManager).open();
    },
  });
  plugin.addCommand({
    id: 'open-stats',
    name: '打开统计面板',
    callback: async () => {
      await activateViewAndSwitchTab(plugin, 'stats');
    },
  });

  // 11. 监听文件变更（防抖）
  const debouncedFileHandler = debounce(
    async (file: TFile) => {
      const hasNewCollection = await plugin.herbCollector.onFileModify(file);
      if (hasNewCollection) {
        await refreshView(plugin);
      }
    },
    1000,
    true,
  );

  // 监听 dandao 目录下文件变更（用户手动编辑日志时刷新视图）
  const debouncedDandaoRefresh = debounce(
    async () => {
      await refreshView(plugin);
    },
    500,
    true,
  );

  plugin.registerEvent(plugin.app.vault.on('modify', (file) => {
    if (file instanceof TFile) {
      const folder = plugin.settings.dandaoFolder.toLowerCase();
      const path = file.path.toLowerCase();
      if (path.startsWith(folder + '/') || path.startsWith(folder + '\\')) {
        debouncedDandaoRefresh();
      } else {
        debouncedFileHandler(file);
      }
    }
  }));

  // 12. 每60秒检查封炉
  plugin.registerInterval(
    window.setInterval(() => { plugin.cycleManager.checkAndSeal(); }, 60_000),
  );

  // 13. 补封遗漏日期
  await plugin.cycleManager.checkMissedSeals();

  // 14. 检查未查看丹药，展示 FurnaceModal
  await showUnviewedPills(plugin);
}

/**
 * teardownPlugin — plugin onunload 时的清理逻辑。
 */
export function teardownPlugin(plugin: CauldronPlugin): void {
  // 清理事件总线
  if (plugin.eventBus) {
    plugin.eventBus.removeAllListeners();
  }
  // 停止番茄钟
  if (plugin.pomodoroTimer) {
    plugin.pomodoroTimer.destroy();
  }
}

// ============ 内部辅助 ============

/** 激活视图并切换到指定 Tab */
async function activateViewAndSwitchTab(plugin: CauldronPlugin, tabId: string): Promise<void> {
  await plugin.activateView();
  const leaves = plugin.app.workspace.getLeavesOfType(CAULDRON_VIEW_TYPE);
  for (const leaf of leaves) {
    const view = leaf.view as CauldronView;
    view.switchTab(tabId);
  }
}

/** 刷新所有已打开的 CauldronView */
async function refreshView(plugin: CauldronPlugin): Promise<void> {
  const leaves = plugin.app.workspace.getLeavesOfType(CAULDRON_VIEW_TYPE);
  for (const leaf of leaves) {
    const view = leaf.view as CauldronView;
    view.vaultDataManager = plugin.vaultDataManager;
    view.pomodoroTimer = plugin.pomodoroTimer;
    view.domainTagManager = plugin.domainTagManager;
    view.sealTime = plugin.settings.sealTime;
    view.onPomodoroTimerSet();
    await view.refresh();
  }
}

/** 检查未查看丹药并展示 FurnaceModal */
async function showUnviewedPills(plugin: CauldronPlugin): Promise<void> {
  const unviewed = await plugin.vaultDataManager.getUnviewedPills();
  if (unviewed.length > 0) {
    const latest = unviewed[unviewed.length - 1]!;
    const dailyLog = await plugin.vaultDataManager.getDailyLog(latest.dateKey);
    new FurnaceModal(
      plugin.app,
      plugin.vaultDataManager,
      latest.pill,
      latest.dateKey,
      dailyLog ?? undefined,
    ).open();
  }
}
