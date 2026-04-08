import type {
  HerbRecord, CatalystRecord, PillRecord, InvestmentRecord,
  Seed, CultivationState, CultivationRealm, FurnaceState,
} from '../types';

// 事件映射类型
export type CauldronEvents = {
  'herb-collected': { dateKey: string; herb: HerbRecord };
  'catalyst-collected': { dateKey: string; catalyst: CatalystRecord };
  'pill-refined': { dateKey: string; pill: PillRecord };
  'day-sealed': { dateKey: string };
  'investment-made': { record: InvestmentRecord };
  'seed-created': { seed: Seed };
  'seed-converted': { seed: Seed; taskPath: string };
  'cultivation-changed': { state: CultivationState };
  'breakthrough-attempt': { success: boolean; realm: CultivationRealm };
  'furnace-leveled': { state: FurnaceState };
  'view-refresh': undefined;
  'data-changed': { source: string };
};

export type CauldronEventKey = keyof CauldronEvents;

/**
 * EventBus — 集中式类型安全事件总线。
 * 所有模块通过 plugin.eventBus 访问。
 */
export class EventBus {
  private listeners: Map<string, Set<Function>> = new Map();

  /** 注册事件监听 */
  on<K extends CauldronEventKey>(
    event: K,
    callback: (data: CauldronEvents[K]) => void,
  ): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(callback);
  }

  /** 取消事件监听 */
  off<K extends CauldronEventKey>(
    event: K,
    callback: (data: CauldronEvents[K]) => void,
  ): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /** 触发事件，每个回调独立 try-catch */
  emit<K extends CauldronEventKey>(
    event: K,
    ...[data]: CauldronEvents[K] extends undefined ? [] : [CauldronEvents[K]]
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(data);
      } catch (err) {
        console.error(`[EventBus] 事件 "${event}" 的回调出错:`, err);
      }
    }
  }

  /** 清除所有监听器（plugin onunload 时调用） */
  removeAllListeners(): void {
    this.listeners.clear();
  }
}
