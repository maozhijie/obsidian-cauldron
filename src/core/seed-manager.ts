import type { Seed } from '../types';
import type { VaultDataManager } from './vault/vault-data-manager';
import type { EventBus } from './event-bus';

/**
 * SeedManager — 种子管理核心逻辑。
 * 负责种子的创建、转化、丢弃和查询。
 */
export class SeedManager {
	private vaultDataManager: VaultDataManager;
	private eventBus?: EventBus;

	constructor(vaultDataManager: VaultDataManager, eventBus?: EventBus) {
		this.vaultDataManager = vaultDataManager;
		this.eventBus = eventBus;
	}

	/** 创建新种子 */
	async createSeed(text: string, tags?: string[]): Promise<Seed> {
		try {
			await this.vaultDataManager.addSeed(text.trim(), tags);
			const seeds = await this.vaultDataManager.getSeeds();
			const seed = seeds.find(s => s.text === text.trim());
			if (seed) {
				this.eventBus?.emit('seed-created', { seed });
				return seed;
			}
			throw new Error('创建种子后未找到');
		} catch (err) {
			console.error('[SeedManager] 创建种子失败:', err);
			throw err;
		}
	}

	/** 将种子转化为任务 */
	async convertSeed(seedId: string, taskPath: string): Promise<void> {
		try {
			const seeds = await this.vaultDataManager.getSeeds();
			const seed = seeds.find(s => s.id === seedId);
			if (!seed) {
				console.warn(`[SeedManager] 种子 ${seedId} 未找到`);
				return;
			}

			await this.vaultDataManager.updateSeed(seed.file, { status: 'converted', convertedTaskPath: taskPath });
			const updated: Seed = { ...seed, status: 'converted', convertedTaskPath: taskPath };
			this.eventBus?.emit('seed-converted', { seed: updated, taskPath });
		} catch (err) {
			console.error('[SeedManager] 转化种子失败:', err);
			throw err;
		}
	}

	/** 丢弃种子 */
	async discardSeed(seedId: string): Promise<void> {
		try {
			const seeds = await this.vaultDataManager.getSeeds();
			const seed = seeds.find(s => s.id === seedId);
			if (!seed) return;

			await this.vaultDataManager.updateSeed(seed.file, { status: 'discarded' });
		} catch (err) {
			console.error('[SeedManager] 丢弃种子失败:', err);
			throw err;
		}
	}

	/** 获取所有待处理种子 */
	async getPendingSeeds(): Promise<Seed[]> {
		try {
			const seeds = await this.vaultDataManager.getSeeds();
			return seeds.filter(s => s.status === 'pending');
		} catch (err) {
			console.error('[SeedManager] 获取待处理种子失败:', err);
			return [];
		}
	}

	/** 获取超过N天未处理的种子 */
	async getStaleSeeds(days: number): Promise<Seed[]> {
		try {
			const seeds = await this.getPendingSeeds();
			const now = new Date();
			return seeds.filter(s => {
				const created = new Date(s.createdDate);
				const diff = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
				return diff >= days;
			});
		} catch (err) {
			console.error('[SeedManager] 获取过期种子失败:', err);
			return [];
		}
	}

	/** 获取所有种子 */
	async getAllSeeds(): Promise<Seed[]> {
		try {
			return await this.vaultDataManager.getSeeds();
		} catch (err) {
			console.error('[SeedManager] 获取所有种子失败:', err);
			return [];
		}
	}
}
