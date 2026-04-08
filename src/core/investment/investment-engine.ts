import type { PillRecord, InvestmentRecord } from '../../types';
import type { VaultDataManager } from '../vault/vault-data-manager';
import type { EventBus } from '../event-bus';
import type { ProjectManager } from './project-manager';
import type { TemplateManager } from './template-manager';
import type { CharacterManager } from './character-manager';

/**
 * InvestmentEngine — 统一投注入口。
 *
 * 协调 ProjectManager / TemplateManager / CharacterManager，
 * 处理丹药状态标记、投注记录保存和事件广播。
 */
export class InvestmentEngine {
	constructor(
		private projectManager: ProjectManager,
		private templateManager: TemplateManager,
		private characterManager: CharacterManager,
		private vaultDataManager: VaultDataManager,
		private eventBus: EventBus,
	) {}

	/**
	 * 统一投注入口。
	 * 1. 调用对应 manager 的 investPill
	 * 2. 标记丹药投注状态为 'invested'
	 * 3. 创建 InvestmentRecord 并保存
	 * 4. 通过 eventBus 广播 'investment-made'
	 */
	async invest(
		type: 'project' | 'template' | 'character',
		targetId: string,
		pill: PillRecord,
	): Promise<InvestmentRecord> {
		let targetName = '';

		try {
			// 1. 调用对应 manager 执行投注
			switch (type) {
				case 'project': {
					const project = await this.projectManager.getById(targetId);
					targetName = project?.name ?? targetId;
					await this.projectManager.investPill(targetId, pill);
					break;
				}
				case 'template': {
					const template = await this.templateManager.getById(targetId);
					targetName = template?.name ?? targetId;
					await this.templateManager.investPill(targetId, pill);
					break;
				}
				case 'character': {
					const character = await this.characterManager.getById(targetId);
					targetName = character?.name ?? targetId;
					await this.characterManager.investPill(targetId, pill);
					break;
				}
			}

			// 2. 标记丹药投注状态（更新日志中的 PillRecord）
			await this.markPillInvested(pill, targetId);
		} catch (err) {
			console.error('[InvestmentEngine] invest 执行失败:', err);
		}

		// 3. 创建投注记录
		const record: InvestmentRecord = {
			id: this.generateId(),
			type,
			targetId,
			targetName,
			pillRecord: pill,
			investDate: new Date().toISOString(),
		};

		try {
			await this.vaultDataManager.addInvestmentRecord(record);
		} catch (err) {
			console.error('[InvestmentEngine] 保存投注记录失败:', err);
		}

		// 4. 广播事件
		try {
			this.eventBus.emit('investment-made', { record });
		} catch (err) {
			console.error('[InvestmentEngine] 广播事件失败:', err);
		}

		return record;
	}

	/**
	 * 获取可投注的丹药列表（投注状态 !== 'invested' 的丹药）。
	 */
	async getAvailablePills(): Promise<PillRecord[]> {
		try {
			const allPills = await this.vaultDataManager.getAllPills();
			return allPills
				.filter((entry) => entry.pill.投注状态 !== 'invested')
				.map((entry) => entry.pill);
		} catch (err) {
			console.error('[InvestmentEngine] getAvailablePills 失败:', err);
			return [];
		}
	}

	/**
	 * 获取投注历史记录。
	 */
	async getHistory(): Promise<InvestmentRecord[]> {
		try {
			return await this.vaultDataManager.getInvestmentRecords();
		} catch (err) {
			console.error('[InvestmentEngine] getHistory 失败:', err);
			return [];
		}
	}

	// ================================================================
	// 内部方法
	// ================================================================

	/**
	 * 标记丹药为已投注：遍历所有日志找到匹配的丹药并更新状态。
	 */
	private async markPillInvested(
		pill: PillRecord,
		targetId: string,
	): Promise<void> {
		try {
			const allPills = await this.vaultDataManager.getAllPills();
			for (const entry of allPills) {
				if (entry.pill.名称 === pill.名称 && entry.pill.投注状态 !== 'invested') {
					entry.pill.投注状态 = 'invested';
					entry.pill.投注目标 = targetId;
					await this.vaultDataManager.setPillData(entry.dateKey, entry.pill);
					break;
				}
			}
		} catch (err) {
			console.error('[InvestmentEngine] markPillInvested 失败:', err);
		}
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	}
}
