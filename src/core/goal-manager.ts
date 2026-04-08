import type { Goal } from '../types';
import type { VaultDataManager } from './vault/vault-data-manager';
import type { EventBus } from './event-bus';

/**
 * GoalManager — 目标管理核心逻辑。
 * 负责目标的创建、进度更新和查询。
 */
export class GoalManager {
	private vaultDataManager: VaultDataManager;
	private eventBus?: EventBus;

	constructor(vaultDataManager: VaultDataManager, eventBus?: EventBus) {
		this.vaultDataManager = vaultDataManager;
		this.eventBus = eventBus;
	}

	/** 创建新目标 */
	async createGoal(name: string, targetValue: number, unit: string, projectId?: string): Promise<Goal> {
		try {
			const file = await this.vaultDataManager.addGoal({
				name: name.trim(),
				projectId,
				targetValue,
				currentValue: 0,
				unit,
			});
			const goals = await this.vaultDataManager.getGoals();
			const goal = goals.find(g => g.file.path === file.path);
			if (!goal) throw new Error('创建目标后未找到');
			return goal;
		} catch (err) {
			console.error('[GoalManager] 创建目标失败:', err);
			throw err;
		}
	}

	/** 更新目标进度 */
	async updateProgress(goalId: string, delta: number): Promise<void> {
		try {
			const goals = await this.vaultDataManager.getGoals();
			const goal = goals.find(g => g.id === goalId);
			if (!goal) {
				console.warn(`[GoalManager] 目标 ${goalId} 未找到`);
				return;
			}

			await this.vaultDataManager.updateGoal(goal.file, { currentValue: goal.currentValue + delta });
		} catch (err) {
			console.error('[GoalManager] 更新目标进度失败:', err);
			throw err;
		}
	}

	/** 获取未完成目标 */
	async getActiveGoals(): Promise<Goal[]> {
		try {
			const goals = await this.vaultDataManager.getGoals();
			return goals.filter(g => g.currentValue < g.targetValue);
		} catch (err) {
			console.error('[GoalManager] 获取活跃目标失败:', err);
			return [];
		}
	}

	/** 获取已完成目标 */
	async getCompletedGoals(): Promise<Goal[]> {
		try {
			const goals = await this.vaultDataManager.getGoals();
			return goals.filter(g => g.currentValue >= g.targetValue);
		} catch (err) {
			console.error('[GoalManager] 获取已完成目标失败:', err);
			return [];
		}
	}

	/** 删除目标 */
	async removeGoal(goalId: string): Promise<void> {
		try {
			const goals = await this.vaultDataManager.getGoals();
			const goal = goals.find(g => g.id === goalId);
			if (!goal) return;
			await this.vaultDataManager.removeGoal(goal.file);
		} catch (err) {
			console.error('[GoalManager] 删除目标失败:', err);
			throw err;
		}
	}

	/** 获取所有目标 */
	async getAllGoals(): Promise<Goal[]> {
		try {
			return await this.vaultDataManager.getGoals();
		} catch (err) {
			console.error('[GoalManager] 获取所有目标失败:', err);
			return [];
		}
	}
}
