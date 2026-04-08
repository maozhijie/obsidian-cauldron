import type { App } from 'obsidian';
import type { TaskTemplate, PillRecord } from '../../types';
import type { VaultDataManager } from '../vault/vault-data-manager';
import { INVESTMENT_EFFECTS } from '../../constants';

/**
 * TemplateManager — 模板 CRUD 及投注等级管理。
 *
 * 模板投注 = 消耗丹药 → 投注等级 +1 → 守时引效果倍增。
 */
export class TemplateManager {
	constructor(
		private app: App,
		private vaultDataManager: VaultDataManager,
	) {}

	// ================================================================
	// CRUD
	// ================================================================

	async getAll(): Promise<TaskTemplate[]> {
		try {
			return await this.vaultDataManager.getTemplates();
		} catch (err) {
			console.error('[TemplateManager] getAll 失败:', err);
			return [];
		}
	}

	async getById(id: string): Promise<TaskTemplate | undefined> {
		try {
			const all = await this.getAll();
			return all.find((t) => t.id === id);
		} catch (err) {
			console.error('[TemplateManager] getById 失败:', err);
			return undefined;
		}
	}

	async create(name: string, description: string): Promise<TaskTemplate> {
		const template: TaskTemplate = {
			id: this.generateId(),
			name,
			description,
			investmentLevel: 0,
			totalInvestments: 0,
		};

		try {
			await this.vaultDataManager.saveTemplate(template);
		} catch (err) {
			console.error('[TemplateManager] create 失败:', err);
		}
		return template;
	}

	async update(template: TaskTemplate): Promise<void> {
		try {
			await this.vaultDataManager.saveTemplate(template);
		} catch (err) {
			console.error('[TemplateManager] update 失败:', err);
		}
	}

	async remove(id: string): Promise<void> {
		try {
			await this.vaultDataManager.removeTemplate(id);
		} catch (err) {
			console.error('[TemplateManager] remove 失败:', err);
		}
	}

	// ================================================================
	// 投注逻辑
	// ================================================================

	/**
	 * 消耗丹药 → totalInvestments +1 → investmentLevel +1 → 保存。
	 */
	async investPill(templateId: string, pill: PillRecord): Promise<void> {
		try {
			const template = await this.getById(templateId);
			if (!template) {
				console.error('[TemplateManager] investPill: 模板不存在', templateId);
				return;
			}

			template.totalInvestments += 1;
			template.investmentLevel += 1;
			await this.vaultDataManager.saveTemplate(template);
		} catch (err) {
			console.error('[TemplateManager] investPill 失败:', err);
		}
	}

	/**
	 * 获取守时引效果倍增系数。
	 * 公式: 1 + investmentLevel * catalystMultiplierPerLevel
	 */
	getCatalystMultiplier(template: TaskTemplate): number {
		return (
			1 +
			template.investmentLevel *
				INVESTMENT_EFFECTS.template.catalystMultiplierPerLevel
		);
	}

	// ================================================================
	// 工具
	// ================================================================

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	}
}
