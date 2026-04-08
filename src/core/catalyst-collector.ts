import type { CatalystRecord, CatalystType } from '../types';
import { VaultDataManager } from './vault/vault-data-manager';

/**
 * CatalystCollector — 药引采集引擎。
 * 处理番茄钟产生的专注引/断念引，以及来自 HerbCollector 的守时引/延时引。
 */
export class CatalystCollector {
	private vaultDataManager: VaultDataManager;

	constructor(vaultDataManager: VaultDataManager) {
		this.vaultDataManager = vaultDataManager;
	}

	/** 采集专注引（番茄钟正常结束时调用） */
	async collectFocusCatalyst(): Promise<void> {
		const catalyst: CatalystRecord = {
			类型: '专注引',
			数量: 1,
			采集时间: new Date().toISOString(),
		};
		await this.vaultDataManager.addCatalyst(this.getTodayKey(), catalyst);
	}

	/** 采集断念引（番茄钟被中断时调用） */
	async collectInterruptCatalyst(): Promise<void> {
		const catalyst: CatalystRecord = {
			类型: '断念引',
			数量: 1,
			采集时间: new Date().toISOString(),
		};
		await this.vaultDataManager.addCatalyst(this.getTodayKey(), catalyst);
	}

	/** 采集守时引/延时引（由 HerbCollector 在检测到任务完成时调用） */
	async collectTimeCatalyst(type: '守时引' | '延时引', taskText: string): Promise<void> {
		const catalyst: CatalystRecord = {
			类型: type,
			数量: 1,
			来源任务: taskText,
			采集时间: new Date().toISOString(),
		};
		await this.vaultDataManager.addCatalyst(this.getTodayKey(), catalyst);
	}

	/** 返回当前日期 YYYY-MM-DD */
	private getTodayKey(): string {
		const now = new Date();
		const y = now.getFullYear();
		const m = String(now.getMonth() + 1).padStart(2, '0');
		const d = String(now.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
}
