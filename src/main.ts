import { Plugin } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  DEFAULT_RUNTIME,
  type CauldronSettings,
  type RuntimeState,
  type PluginData,
} from './settings';
import { CAULDRON_VIEW_TYPE } from './constants';
import { EventBus } from './core/event-bus';
import { bootstrapPlugin, teardownPlugin } from './core/plugin-bootstrap';
import type { VaultDataManager } from './core/vault-data-manager';
import type { DomainTagManager } from './core/domain-tag-manager';
import type { CatalystCollector } from './core/catalyst-collector';
import type { HerbCollector } from './core/herb-collector';
import type { PomodoroTimer } from './pomodoro/pomodoro-timer';
import type { CycleManager } from './core/cycle-manager';
import type { CauldronView } from './ui/cauldron-view';

export default class CauldronPlugin extends Plugin {
  settings: CauldronSettings = DEFAULT_SETTINGS;
  runtime: RuntimeState = DEFAULT_RUNTIME;
  eventBus!: EventBus;

  // 核心管理器（由 bootstrapPlugin 初始化）
  vaultDataManager!: VaultDataManager;
  domainTagManager!: DomainTagManager;
  herbCollector!: HerbCollector;
  catalystCollector!: CatalystCollector;
  pomodoroTimer!: PomodoroTimer;
  cycleManager!: CycleManager;

  async onload() {
    // 1. 加载持久化数据
    await this.loadPluginData();

    // 2. 创建事件总线
    this.eventBus = new EventBus();

    // 3. 委托给 bootstrap
    await bootstrapPlugin(this);
  }

  async onunload() {
    teardownPlugin(this);
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
      await view.refresh();
    }
  }
}
