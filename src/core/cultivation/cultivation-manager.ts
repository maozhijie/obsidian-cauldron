import type { CultivationState, CultivationRealm, PillRecord, Grade } from '../../types';
import { VaultDataManager } from '../vault/vault-data-manager';
import { EventBus } from '../event-bus';
import { REALM_THRESHOLDS, REALM_UNLOCKS } from '../../constants';

/** 品级 → XP 权重 */
const GRADE_XP_WEIGHT: Record<Grade, number> = {
	'凡品': 5,
	'灵品': 15,
	'宝品': 30,
	'神品': 60,
};

/** 品级 → 封炉额外 XP */
const SEAL_GRADE_BONUS: Record<Grade, number> = {
	'凡品': 0,
	'灵品': 5,
	'宝品': 15,
	'神品': 30,
};

/** 境界顺序 */
const REALM_ORDER: CultivationRealm[] = ['练气', '筑基', '金丹', '元婴', '化神'];

export class CultivationManager {
	constructor(
		private vaultDataManager: VaultDataManager,
		private eventBus: EventBus,
	) {}

	/** 获取当前修炼状态 */
	async getState(): Promise<CultivationState> {
		return this.vaultDataManager.getCultivationState();
	}

	/** 获取默认初始状态 */
	getDefaultState(): CultivationState {
		return {
			realm: '练气',
			realmLevel: 1,
			totalXp: 0,
			currentRealmXp: 0,
			xpToNextLevel: REALM_THRESHOLDS['练气'][0] ?? 100,
			breakthroughAttempts: 0,
			heartStateValue: 0,
			unlockedFeatures: ['日炉'],
		};
	}

	/** 增加经验值（各种来源） */
	async addXp(amount: number, _source?: string): Promise<CultivationState> {
		const state = await this.getState();
		state.totalXp += amount;
		state.currentRealmXp += amount;

		// 循环处理升级（可能一次获得大量 XP 连升多级）
		while (state.currentRealmXp >= state.xpToNextLevel) {
			if (state.realmLevel < 9) {
				// 层级提升
				state.currentRealmXp -= state.xpToNextLevel;
				state.realmLevel += 1;
				state.xpToNextLevel = REALM_THRESHOLDS[state.realm][state.realmLevel - 1] ?? 0;
			} else {
				// 已到第9层，标记为可突破状态（但不自动突破）
				break;
			}
		}

		await this.vaultDataManager.saveCultivationState(state);
		this.eventBus.emit('cultivation-changed', { state });
		return state;
	}

	/** 从丹药投注获得 XP：品级权重 * 纯度 */
	calculatePillXp(pill: PillRecord): number {
		const weight = GRADE_XP_WEIGHT[pill.品级] ?? 5;
		return Math.round(weight * pill.纯度);
	}

	/** 从封炉获得 XP：herbCount * 2 + 品级额外 */
	calculateSealXp(herbCount: number, grade: Grade): number {
		const bonus = SEAL_GRADE_BONUS[grade] ?? 0;
		return herbCount * 2 + bonus;
	}

	/** 检查是否可以尝试突破 */
	canAttemptBreakthrough(state: CultivationState): boolean {
		if (state.realm === '化神') return false;
		return state.realmLevel >= 9 && state.currentRealmXp >= state.xpToNextLevel;
	}

	/** 获取当前境界解锁的功能 */
	getUnlockedFeatures(realm: CultivationRealm): string[] {
		const idx = REALM_ORDER.indexOf(realm);
		const features: string[] = [];
		for (let i = 0; i <= idx; i++) {
			const r = REALM_ORDER[i];
			if (r) features.push(...(REALM_UNLOCKS[r] ?? []));
		}
		return features;
	}

	/** 检查某功能是否已解锁 */
	isFeatureUnlocked(state: CultivationState, feature: string): boolean {
		return state.unlockedFeatures.includes(feature);
	}

	/** 获取下一个境界 */
	getNextRealm(current: CultivationRealm): CultivationRealm | null {
		const idx = REALM_ORDER.indexOf(current);
		if (idx < 0 || idx >= REALM_ORDER.length - 1) return null;
		return REALM_ORDER[idx + 1] ?? null;
	}

	/** 获取当前层升级所需 XP */
	getXpForCurrentLevel(state: CultivationState): number {
		return REALM_THRESHOLDS[state.realm][state.realmLevel - 1] ?? 0;
	}
}
