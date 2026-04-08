import type { App } from 'obsidian';
import type { Project, ProjectBoost, PillRecord } from '../../types';
import type { VaultDataManager } from '../vault/vault-data-manager';
import { INVESTMENT_EFFECTS } from '../../constants';

/**
 * ProjectManager — 项目 CRUD 及投注增益管理。
 *
 * 项目投注 = 消耗丹药 → 创建临时增益（ProjectBoost），
 * 增益持续天数由丹药品级决定。
 */
export class ProjectManager {
	constructor(
		private app: App,
		private vaultDataManager: VaultDataManager,
	) {}

	// ================================================================
	// CRUD
	// ================================================================

	async getAll(): Promise<Project[]> {
		try {
			return await this.vaultDataManager.getProjects();
		} catch (err) {
			console.error('[ProjectManager] getAll 失败:', err);
			return [];
		}
	}

	async getById(id: string): Promise<Project | undefined> {
		try {
			const all = await this.getAll();
			return all.find((p) => p.id === id);
		} catch (err) {
			console.error('[ProjectManager] getById 失败:', err);
			return undefined;
		}
	}

	async create(name: string, description: string): Promise<Project> {
		const project: Project = {
			id: this.generateId(),
			name,
			description,
			isActive: true,
			createdDate: new Date().toISOString(),
			boosts: [],
		};

		try {
			await this.vaultDataManager.saveProject(project);
		} catch (err) {
			console.error('[ProjectManager] create 失败:', err);
		}
		return project;
	}

	async update(project: Project): Promise<void> {
		try {
			await this.vaultDataManager.saveProject(project);
		} catch (err) {
			console.error('[ProjectManager] update 失败:', err);
		}
	}

	async remove(id: string): Promise<void> {
		try {
			await this.vaultDataManager.removeProject(id);
		} catch (err) {
			console.error('[ProjectManager] remove 失败:', err);
		}
	}

	async getActiveProjects(): Promise<Project[]> {
		try {
			const all = await this.getAll();
			return all.filter((p) => p.isActive);
		} catch (err) {
			console.error('[ProjectManager] getActiveProjects 失败:', err);
			return [];
		}
	}

	// ================================================================
	// 投注逻辑
	// ================================================================

	/**
	 * 消耗丹药 → 创建 ProjectBoost（临时增益）→ 保存到项目。
	 * 增益持续天数由 INVESTMENT_EFFECTS.project.durationByGrade 决定。
	 */
	async investPill(projectId: string, pill: PillRecord): Promise<ProjectBoost> {
		const durationDays =
			INVESTMENT_EFFECTS.project.durationByGrade[pill.品级] ?? 1;

		const now = new Date();
		const expiry = new Date(now);
		expiry.setDate(expiry.getDate() + durationDays);

		const boost: ProjectBoost = {
			pillName: pill.名称,
			investDate: now.toISOString(),
			expiryDate: expiry.toISOString(),
			effect: INVESTMENT_EFFECTS.project.effect,
		};

		try {
			const project = await this.getById(projectId);
			if (!project) {
				console.error('[ProjectManager] investPill: 项目不存在', projectId);
				return boost;
			}
			project.boosts.push(boost);
			await this.vaultDataManager.saveProject(project);
		} catch (err) {
			console.error('[ProjectManager] investPill 失败:', err);
		}

		return boost;
	}

	/** 获取项目中尚未过期的增益列表 */
	getActiveBoosts(project: Project): ProjectBoost[] {
		const now = Date.now();
		return project.boosts.filter(
			(b) => new Date(b.expiryDate).getTime() > now,
		);
	}

	/** 清理所有项目中已过期的增益记录 */
	async cleanExpiredBoosts(): Promise<void> {
		try {
			const projects = await this.getAll();
			const now = Date.now();

			for (const project of projects) {
				const before = project.boosts.length;
				project.boosts = project.boosts.filter(
					(b) => new Date(b.expiryDate).getTime() > now,
				);
				if (project.boosts.length !== before) {
					await this.vaultDataManager.saveProject(project);
				}
			}
		} catch (err) {
			console.error('[ProjectManager] cleanExpiredBoosts 失败:', err);
		}
	}

	/** 检查某项目是否有活跃增益 */
	hasActiveBoost(project: Project): boolean {
		return this.getActiveBoosts(project).length > 0;
	}

	// ================================================================
	// 工具
	// ================================================================

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	}
}
