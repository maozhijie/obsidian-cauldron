import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { PillRecord, Flavor } from '../types';
import { VaultDataManager } from './vault/vault-data-manager';
import { DomainTagManager } from './domain-tag-manager';
import { refinePill } from './refinement-engine';
import { FurnaceManager } from './furnace-manager';
import { CultivationManager } from './cultivation/cultivation-manager';
import { EventBus } from './event-bus';
import type CauldronPlugin from '../main';

/**
 * CycleManager — 每日封炉判定与补封逻辑。
 *
 * 由 main.ts 的 registerInterval 每分钟调用 checkAndSeal()，
 * 启动时调用一次 checkMissedSeals() 补封遗漏日期。
 */
export class CycleManager {
	private app: App;
	private plugin: CauldronPlugin;
	private vaultDataManager: VaultDataManager;
	private domainTagManager: DomainTagManager;
	private furnaceManager: FurnaceManager;
	private getSealTime: () => string;
	private setLastSealDate: (date: string) => void;
	private getLastSealDate: () => string;
	private onPillCreated?: (dateKey: string, pill: PillRecord) => void;

	constructor(
		app: App,
		plugin: CauldronPlugin,
		vaultDataManager: VaultDataManager,
		domainTagManager: DomainTagManager,
		getSealTime: () => string,
		setLastSealDate: (date: string) => void,
		getLastSealDate: () => string,
		onPillCreated?: (dateKey: string, pill: PillRecord) => void,
	) {
		this.app = app;
		this.plugin = plugin;
		this.vaultDataManager = vaultDataManager;
		this.domainTagManager = domainTagManager;
		this.furnaceManager = new FurnaceManager(plugin);
		this.getSealTime = getSealTime;
		this.setLastSealDate = setLastSealDate;
		this.getLastSealDate = getLastSealDate;
		this.onPillCreated = onPillCreated;
	}

	// ----------------------------------------------------------------
	// 核心方法
	// ----------------------------------------------------------------

	/**
	 * 检查是否需要封炉（由 registerInterval 每分钟调用）。
	 * 当前时间 >= 封炉时间 且 今日尚未封炉 → 执行封炉。
	 */
	checkAndSeal(): void {
		const now = new Date();
		const currentTime = this.formatTime(now);
		const sealTime = this.getSealTime();
		const todayKey = this.getTodayKey();

		if (this.isTimeReached(currentTime, sealTime) && todayKey !== this.getLastSealDate()) {
			// 异步执行封炉，不阻塞定时器
			this.sealDay(todayKey).catch(err => {
				console.error('丹道：封炉失败', err);
			});
		}
	}

	/**
	 * 补封检查（启动时调用一次）。
	 * 查找所有未封炉的历史日期并逐一补封。
	 */
	async checkMissedSeals(): Promise<void> {
		const unsealedDates = await this.vaultDataManager.getUnsealedLogs();
		const todayKey = this.getTodayKey();

		// 排除今天，只补封过去的日期
		const missedDates = unsealedDates.filter(d => d !== todayKey);

		if (missedDates.length === 0) return;

		for (const dateKey of missedDates) {
			await this.sealDay(dateKey);
		}

		new Notice(`丹道：已补封 ${missedDates.length} 天的修炼日志`);
	}

	/**
	 * 封炉某一天。
	 * 读取当日日志 → 调用配伍引擎 → 写入丹药 → 标记封炉。
	 */
	async sealDay(dateKey: string): Promise<void> {
		const dailyLog = await this.vaultDataManager.getDailyLog(dateKey);

		// 日志不存在或药材为空 → 只标记封炉，不生成丹药
		if (!dailyLog || dailyLog.药材.length === 0) {
			await this.vaultDataManager.setSealStatus(dateKey);
			this.setLastSealDate(dateKey);
			new Notice('丹道：今日封炉完成，但未采集任何药材。');
			return;
		}

		// 构建 flavorMap：领域名 → 性味
		const flavorMap = this.buildFlavorMap();

		// 获取丹炉状态
		const furnaceState = await this.furnaceManager.getState();

		// 调用配伍引擎（传入丹炉状态）
		const pill = refinePill(dailyLog.药材, dailyLog.药引, flavorMap, furnaceState);

		if (pill) {
			await this.vaultDataManager.setPillData(dateKey, pill);

			// 给丹炉加经验
			await this.furnaceManager.addXp(pill.药材总量, pill.品级);

			// 给修炼系统加经验
			try {
				const cultivationMgr = new CultivationManager(this.plugin, new EventBus());
				const sealXp = cultivationMgr.calculateSealXp(pill.药材总量, pill.品级);
				if (sealXp > 0) {
					await cultivationMgr.addXp(sealXp, 'seal');
				}
			} catch (err) {
				console.error('丹道：封炉修炼XP增加失败', err);
			}

			new Notice(`丹道：今日封炉完成，炼成 ${pill.名称}！`);
		} else {
			new Notice('丹道：今日封炉完成，但未采集任何药材。');
		}

		// 标记封炉状态
		await this.vaultDataManager.setSealStatus(dateKey);

		// 更新 lastSealDate
		this.setLastSealDate(dateKey);

		// 触发回调
		if (pill && this.onPillCreated) {
			this.onPillCreated(dateKey, pill);
		}
	}

	/**
	 * 手动封炉（由设置页面的"立即封炉"按钮调用）。
	 */
	async manualSeal(): Promise<void> {
		const todayKey = this.getTodayKey();
		await this.sealDay(todayKey);
	}

	// ----------------------------------------------------------------
	// 辅助方法
	// ----------------------------------------------------------------

	/** 返回当前日期 YYYY-MM-DD */
	getTodayKey(): string {
		const now = new Date();
		const y = now.getFullYear();
		const m = String(now.getMonth() + 1).padStart(2, '0');
		const d = String(now.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	/**
	 * 比较 HH:MM 格式的时间，判断 currentTime 是否 >= sealTime。
	 */
	private isTimeReached(currentTime: string, sealTime: string): boolean {
		const toMinutes = (t: string): number => {
			const parts = t.split(':');
			return parseInt(parts[0] ?? '0', 10) * 60 + parseInt(parts[1] ?? '0', 10);
		};
		return toMinutes(currentTime) >= toMinutes(sealTime);
	}

	/** 格式化 Date 为 HH:MM */
	private formatTime(date: Date): string {
		const h = String(date.getHours()).padStart(2, '0');
		const m = String(date.getMinutes()).padStart(2, '0');
		return `${h}:${m}`;
	}

	/** 从 DomainTagManager 构建 领域名→性味 映射 */
	private buildFlavorMap(): Record<string, Flavor> {
		const map: Record<string, Flavor> = {};
		const tags = this.domainTagManager.getTags();
		for (const tag of tags) {
			map[tag.name] = tag.flavor;
		}
		return map;
	}
}
