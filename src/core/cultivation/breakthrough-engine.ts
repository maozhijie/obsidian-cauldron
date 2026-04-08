import type { CultivationState, CultivationRealm, BreakthroughCondition, MeridianState, Grade } from '../../types';
import { BREAKTHROUGH_CONDITIONS, REALM_UNLOCKS, REALM_THRESHOLDS } from '../../constants';
import type CauldronPlugin from '../../main';
import { EventBus } from '../event-bus';

/** 境界顺序 */
const REALM_ORDER: CultivationRealm[] = ['练气', '筑基', '金丹', '元婴', '化神'];

/** 品级等级映射（用于 pill_grade 条件检测） */
const GRADE_RANK: Record<Grade, number> = {
	'凡品': 0,
	'灵品': 1,
	'宝品': 2,
	'神品': 3,
};

/**
 * 根据境界的 pill_grade 条件判断所需的最低品级
 * 练气/筑基要求灵品，金丹要求宝品，元婴/化神要求神品
 */
function getRequiredGradeForRealm(realm: CultivationRealm): Grade {
	switch (realm) {
		case '练气':
		case '筑基':
			return '灵品';
		case '金丹':
			return '宝品';
		case '元婴':
		case '化神':
		default:
			return '神品';
	}
}

/**
 * 根据 balanced_domains 条件中的 description 解析所需的经脉等级
 * 例如 "经脉均衡度(至少3条经脉lv3+)" → 3
 */
function parseRequiredMeridianLevel(description: string): number {
	const match = description.match(/lv(\d+)/);
	return match ? parseInt(match[1]!, 10) : 1;
}

export class BreakthroughEngine {
	private plugin: CauldronPlugin;
	private eventBus: EventBus;

	constructor(plugin: CauldronPlugin, eventBus: EventBus) {
		this.plugin = plugin;
		this.eventBus = eventBus;
	}

	/** 获取当前境界的突破条件及完成状态 */
	async getConditions(state: CultivationState, meridians: MeridianState[]): Promise<BreakthroughCondition[]> {
		const templates = BREAKTHROUGH_CONDITIONS[state.realm];
		if (!templates) return [];

		const results: BreakthroughCondition[] = [];

		for (const tmpl of templates) {
			let current = 0;

			switch (tmpl.type) {
				case 'consecutive_days':
					current = await this.calculateConsecutiveDays();
					break;
				case 'total_pills':
					current = await this.calculateTotalPills();
					break;
				case 'pill_grade':
					current = await this.checkPillGrade(state.realm);
					break;
				case 'balanced_domains': {
					const requiredLevel = parseRequiredMeridianLevel(tmpl.description);
					current = this.countBalancedDomains(meridians, requiredLevel);
					break;
				}
				case 'furnace_level': {
					const furnace = this.plugin.data.furnaceState ?? { level: 1, xp: 0, xpToNextLevel: 50, totalPillsRefined: 0 };
					current = furnace.level;
					break;
				}
			}

			results.push({
				type: tmpl.type,
				description: tmpl.description,
				required: tmpl.required,
				current,
				met: current >= tmpl.required,
			});
		}

		return results;
	}

	/** 检查所有条件是否满足 */
	async areAllConditionsMet(state: CultivationState, meridians: MeridianState[]): Promise<boolean> {
		const conditions = await this.getConditions(state, meridians);
		return conditions.length > 0 && conditions.every(c => c.met);
	}

	/** 尝试突破 */
	async attemptBreakthrough(state: CultivationState): Promise<{
		success: boolean;
		newState: CultivationState;
		message: string;
	}> {
		const meridians = this.plugin.data.meridianStates ?? [];
		const allMet = await this.areAllConditionsMet(state, meridians);

		if (!allMet) {
			return {
				success: false,
				newState: state,
				message: '突破条件尚未满足。',
			};
		}

		// 计算成功率：基础 70% + heartStateValue * 5%，最高 99%
		const successRate = Math.min(0.99, 0.70 + state.heartStateValue * 0.05);
		const roll = Math.random();

		if (roll < successRate) {
			// 突破成功
			const nextRealm = this.getNextRealm(state.realm);
			if (!nextRealm) {
				return {
					success: false,
					newState: state,
					message: '已达最高境界，无法继续突破。',
				};
			}

			state.realm = nextRealm;
			state.realmLevel = 1;
			state.currentRealmXp = 0;
			state.xpToNextLevel = this.getFirstLevelXp(nextRealm);
			state.heartStateValue = 0;
			state.breakthroughAttempts = 0;

			// 更新解锁功能：累加所有已达境界的功能
			const features = this.getAllUnlockedFeatures(nextRealm);
			state.unlockedFeatures = features;

			this.plugin.data.cultivationState = state;
			await this.plugin.savePluginData();
			this.eventBus.emit('breakthrough-attempt', { success: true, realm: nextRealm });

			return {
				success: true,
				newState: state,
				message: `突破成功！进入${nextRealm}境界！`,
			};
		} else {
			// 突破失败
			state.heartStateValue += 5;
			state.breakthroughAttempts += 1;

			this.plugin.data.cultivationState = state;
			await this.plugin.savePluginData();
			this.eventBus.emit('breakthrough-attempt', { success: false, realm: state.realm });

			return {
				success: false,
				newState: state,
				message: `突破失败…心境值提升，下次成功率更高。（已尝试${state.breakthroughAttempts}次）`,
			};
		}
	}

	// ================================================================
	// 私有辅助方法
	// ================================================================

	/** 计算连续有封炉记录的天数（从今天往回数） */
	private async calculateConsecutiveDays(): Promise<number> {
		let streak = 0;
		const today = new Date();

		for (let i = 0; i < 365; i++) {
			const date = new Date(today);
			date.setDate(today.getDate() - i);
			const dateKey = this.formatDate(date);
			const log = await this.plugin.vaultDataManager.getDailyLog(dateKey);

			if (log && log.封炉状态 === '已封炉') {
				streak++;
			} else {
				break;
			}
		}

		return streak;
	}

	/** 统计总丹药数 */
	private async calculateTotalPills(): Promise<number> {
		const pills = await this.plugin.vaultDataManager.getAllPills();
		return pills.length;
	}

	/** 检查是否有对应品级的丹药（返回 1 满足 / 0 不满足） */
	private async checkPillGrade(realm: CultivationRealm): Promise<number> {
		const requiredGrade = getRequiredGradeForRealm(realm);
		const requiredRank = GRADE_RANK[requiredGrade];
		const pills = await this.plugin.vaultDataManager.getAllPills();

		for (const { pill } of pills) {
			const rank = GRADE_RANK[pill.品级 as Grade] ?? 0;
			if (rank >= requiredRank) return 1;
		}
		return 0;
	}

	/** 计算有多少条经脉达到要求的等级 */
	private countBalancedDomains(meridians: MeridianState[], requiredLevel: number): number {
		return meridians.filter(m => m.level >= requiredLevel).length;
	}

	/** 获取下一个境界 */
	private getNextRealm(current: CultivationRealm): CultivationRealm | null {
		const idx = REALM_ORDER.indexOf(current);
		if (idx < 0 || idx >= REALM_ORDER.length - 1) return null;
		return REALM_ORDER[idx + 1] ?? null;
	}

	/** 获取某境界第1层所需 XP */
	private getFirstLevelXp(realm: CultivationRealm): number {
		return REALM_THRESHOLDS[realm]?.[0] ?? 100;
	}

	/** 获取从练气到指定境界累计解锁的所有功能 */
	private getAllUnlockedFeatures(realm: CultivationRealm): string[] {
		const idx = REALM_ORDER.indexOf(realm);
		const features: string[] = [];
		for (let i = 0; i <= idx; i++) {
			const r = REALM_ORDER[i];
			if (r) features.push(...(REALM_UNLOCKS[r] ?? []));
		}
		return features;
	}

	/** 格式化日期为 YYYY-MM-DD */
	private formatDate(date: Date): string {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
}
