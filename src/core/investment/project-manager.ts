import type { App } from 'obsidian';
import type { Project } from '../../types';
import type { VaultDataManager } from '../vault/vault-data-manager';

/**
 * ProjectManager — 项目 CRUD 管理。
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
		try {
			const file = await this.vaultDataManager.addProject(name, description);
			const projects = await this.vaultDataManager.getProjects();
			const project = projects.find(p => p.file.path === file.path);
			if (!project) throw new Error('创建项目后未找到');
			return project;
		} catch (err) {
			console.error('[ProjectManager] create 失败:', err);
			throw err;
		}
	}

	async update(project: Project): Promise<void> {
		try {
			const projects = await this.vaultDataManager.getProjects();
			const existing = projects.find(p => p.id === project.id);
			if (!existing) return;
			await this.vaultDataManager.updateProject(existing.file, {
				isActive: project.isActive,
				description: project.description,
			});
		} catch (err) {
			console.error('[ProjectManager] update 失败:', err);
		}
	}

	async remove(id: string): Promise<void> {
		try {
			const projects = await this.vaultDataManager.getProjects();
			const project = projects.find(p => p.id === id);
			if (!project) return;
			await this.vaultDataManager.removeProject(project.file);
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
	// 工具
	// ================================================================

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	}
}
