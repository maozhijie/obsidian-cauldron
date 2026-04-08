import type { FurnaceState, Grade } from '../types';
import { FURNACE_LEVEL_TABLE } from '../constants';
import { VaultDataManager } from './vault/vault-data-manager';

// 品级对应的经验加成
const GRADE_XP_BONUS: Record<Grade, number> = {
	'凡品': 0,
	'灵品': 5,
	'宝品': 15,
	'神品': 30,
};

/**
 * FurnaceManager — 丹炉养成系统。
 * 通过炼丹获得经验，提升丹炉等级，解锁品级加成、纯度保底和丹纹概率。
 */
export class FurnaceManager {
	constructor(private vaultDataManager: VaultDataManager) {}

	/** 获取当前丹炉状态 */
	async getState(): Promise<FurnaceState> {
		return this.vaultDataManager.getFurnaceState();
	}

	/**
	 * 炼丹后给丹炉加经验。
	 * XP = herbCount + gradeBonus
	 */
	async addXp(herbCount: number, grade: Grade): Promise<FurnaceState> {
		const state = await this.vaultDataManager.getFurnaceState();

		const xpGain = herbCount + GRADE_XP_BONUS[grade];
		state.xp += xpGain;
		state.totalPillsRefined += 1;

		// 重新计算等级
		state.level = this.calculateLevel(state.xp);

		// 更新 xpToNextLevel
		const nextEntry = FURNACE_LEVEL_TABLE.find(e => e.level === state.level + 1);
		state.xpToNextLevel = nextEntry ? nextEntry.xpRequired : state.xp; // 满级时设为当前XP

		await this.vaultDataManager.saveFurnaceState(state);
		return state;
	}

	/** 根据当前等级获取品级加成分数 */
	getGradeBonus(state: FurnaceState): number {
		const entry = FURNACE_LEVEL_TABLE.find(e => e.level === state.level);
		return entry?.gradeBonus ?? 0;
	}

	/** 根据当前等级获取纯度保底值 */
	getPurityFloor(state: FurnaceState): number {
		const entry = FURNACE_LEVEL_TABLE.find(e => e.level === state.level);
		return entry?.purityFloor ?? 0;
	}

	/** 根据当前等级获取丹纹概率加成 */
	getPatternChance(state: FurnaceState): number {
		const entry = FURNACE_LEVEL_TABLE.find(e => e.level === state.level);
		return entry?.patternChance ?? 0;
	}

	/**
	 * 根据累计经验计算丹炉等级。
	 * 遍历 FURNACE_LEVEL_TABLE 找到 xp >= xpRequired 的最高等级。
	 */
	calculateLevel(xp: number): number {
		let level = 1;
		for (const entry of FURNACE_LEVEL_TABLE) {
			if (xp >= entry.xpRequired) {
				level = entry.level;
			} else {
				break;
			}
		}
		return level;
	}
}
