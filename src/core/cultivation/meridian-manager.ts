import type { MeridianState, DomainTag } from '../../types';
import { VaultDataManager } from '../vault/vault-data-manager';
import { MERIDIAN_LEVEL_TABLE } from '../../constants';

export class MeridianManager {
	constructor(private vaultDataManager: VaultDataManager) {}

	/** 获取所有经脉状态 */
	async getAllStates(): Promise<MeridianState[]> {
		return this.vaultDataManager.getMeridianStates();
	}

	/** 获取特定领域的经脉状态 */
	async getState(domainTag: string): Promise<MeridianState> {
		const all = await this.getAllStates();
		const found = all.find(m => m.domainTag === domainTag);
		return found ?? this.getDefaultState(domainTag);
	}

	/** 药材采集时增加经脉投资 */
	async addInvestment(domainTag: string, amount: number): Promise<MeridianState> {
		const state = await this.getState(domainTag);
		state.totalInvestment += amount;

		const calc = this.calculateLevel(state.totalInvestment);
		state.level = calc.level;
		state.progress = calc.progress;

		await this.vaultDataManager.saveMeridianState(state);
		return state;
	}

	/** 计算经脉等级 */
	calculateLevel(totalInvestment: number): { level: number; progress: number; name: string } {
		let currentEntry = MERIDIAN_LEVEL_TABLE[0]!;

		for (const entry of MERIDIAN_LEVEL_TABLE) {
			if (totalInvestment >= entry.investmentRequired) {
				currentEntry = entry;
			} else {
				break;
			}
		}

		// 计算进度
		const currentIdx = MERIDIAN_LEVEL_TABLE.findIndex(e => e.level === currentEntry.level);
		let progress = 0;
		if (currentIdx >= 0 && currentIdx < MERIDIAN_LEVEL_TABLE.length - 1) {
			const nextEntry = MERIDIAN_LEVEL_TABLE[currentIdx + 1]!;
			const range = nextEntry.investmentRequired - currentEntry.investmentRequired;
			const current = totalInvestment - currentEntry.investmentRequired;
			progress = range > 0 ? current / range : 1;
		} else {
			// 已满级
			progress = 1;
		}

		return {
			level: currentEntry.level,
			progress: Math.min(1, Math.max(0, progress)),
			name: currentEntry.name,
		};
	}

	/** 获取经脉对应的采集加成 */
	getHerbYieldBonus(state: MeridianState): number {
		const entry = MERIDIAN_LEVEL_TABLE.find(e => e.level === state.level);
		return entry?.herbYieldBonus ?? 0;
	}

	/** 获取默认经脉状态 */
	getDefaultState(domainTag: string): MeridianState {
		return {
			domainTag,
			totalInvestment: 0,
			level: 0,
			progress: 0,
		};
	}

	/** 初始化所有领域标签对应的经脉 */
	async initializeMeridians(domainTags: DomainTag[]): Promise<void> {
		const existing = await this.getAllStates();
		const existingTags = new Set(existing.map(m => m.domainTag));

		for (const tag of domainTags) {
			if (!existingTags.has(tag.name)) {
				await this.vaultDataManager.saveMeridianState(this.getDefaultState(tag.name));
			}
		}
	}
}
