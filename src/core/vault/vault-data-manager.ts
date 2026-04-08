import { App, TFile, normalizePath } from 'obsidian';
import type {
	DailyLogFrontmatter,
	DomainTag,
	HerbRecord,
	CatalystRecord,
	PillRecord,
	SealStatus,
	Project,
	Seed,
	Goal,
	Flavor,
	SeedStatus,
	MultiCycleFurnace,
} from '../../types';
import type { CauldronSettings } from '../../settings';
import type CauldronPlugin from '../../main';
import { TagNoteQuery } from './tag-note-query';

/**
 * VaultDataManager — 封装标签笔记 + data.json 的存储方式
 *
 * 核心变更：
 * - 领域/种子/项目/目标：通过标签笔记存储
 * - 修炼/丹炉状态：由 plugin 实例管理，通过回调读写
 * - 日志：集成日记插件（Daily Notes）
 * - 删除所有 dandao/ 固定路径相关逻辑
 */
export class VaultDataManager {
	private app: App;
	private settings: CauldronSettings;
	private tagQuery: TagNoteQuery;
	private plugin: CauldronPlugin;

	constructor(app: App, settings: CauldronSettings, tagQuery: TagNoteQuery, plugin: CauldronPlugin) {
		this.app = app;
		this.settings = settings;
		this.tagQuery = tagQuery;
		this.plugin = plugin;
	}

	/** 获取 App 引用（供 UI 组件创建 Modal 使用） */
	getApp(): App {
		return this.app;
	}

	// ================================================================
	// 领域配置读写（标签笔记）
	// ================================================================

	/** 读取领域标签列表 */
	async getDomainTags(): Promise<DomainTag[]> {
		const files = this.tagQuery.getNotesWithTag(this.settings.domainTag, this.settings.excludeTag);
		const tags: DomainTag[] = [];
		for (const file of files) {
			const flavor = this.tagQuery.readFrontmatterField<string>(file, 'flavor') as Flavor;
			const color = this.tagQuery.readFrontmatterField<string>(file, 'color');
			if (flavor) {
				tags.push({ name: file.basename, flavor, color });
			}
		}
		return tags;
	}

	/** 保存领域标签（创建或更新笔记） */
	async saveDomainTag(tag: DomainTag): Promise<void> {
		const files = this.tagQuery.getNotesWithTag(this.settings.domainTag);
		const existing = files.find(f => f.basename === tag.name);
		if (existing) {
			await this.tagQuery.updateNoteFrontmatter(existing, (fm) => {
				fm['flavor'] = tag.flavor;
				if (tag.color) fm['color'] = tag.color;
			});
		} else {
			await this.tagQuery.createTaggedNote('', tag.name, this.settings.domainTag, {
				flavor: tag.flavor,
				...(tag.color ? { color: tag.color } : {}),
			});
		}
	}

	/** 删除领域标签 */
	async removeDomainTag(name: string): Promise<void> {
		const files = this.tagQuery.getNotesWithTag(this.settings.domainTag);
		const file = files.find(f => f.basename === name);
		if (file) await this.tagQuery.deleteNote(file);
	}

	// ================================================================
	// 种子相关（标签笔记）
	// ================================================================

	async getSeeds(): Promise<Array<Seed & { file: TFile }>> {
		const files = this.tagQuery.getNotesWithTag(this.settings.seedTag, this.settings.excludeTag);
		return files.map(file => ({
			id: file.path,
			text: file.basename,
			status: this.tagQuery.readFrontmatterField<string>(file, 'status') as SeedStatus || 'pending',
			createdDate: this.tagQuery.readFrontmatterField<string>(file, 'createdDate') || '',
			convertedTaskPath: this.tagQuery.readFrontmatterField<string>(file, 'convertedTaskPath'),
			tags: this.tagQuery.readFrontmatterField<string[]>(file, 'tags') || [],
			file,
		}));
	}

	async addSeed(text: string, tags?: string[]): Promise<void> {
		const today = new Date().toISOString().slice(0, 10);
		await this.tagQuery.createTaggedNote(
			this.settings.seedFolder,
			text,
			this.settings.seedTag,
			{ status: 'pending', createdDate: today, ...(tags ? { tags } : {}) }
		);
	}

	async updateSeed(file: TFile, updates: Partial<{ status: SeedStatus; convertedTaskPath: string }>): Promise<void> {
		await this.tagQuery.updateNoteFrontmatter(file, (fm) => {
			Object.assign(fm, updates);
		});
	}

	async removeSeed(file: TFile): Promise<void> {
		await this.tagQuery.deleteNote(file);
	}

	// ================================================================
	// 项目相关（标签笔记）
	// ================================================================

	async getProjects(): Promise<Array<Project & { file: TFile }>> {
		const files = this.tagQuery.getNotesWithTag(this.settings.projectTag, this.settings.excludeTag);
		return files.map(file => ({
			id: file.path,
			name: file.basename,
			description: this.tagQuery.readFrontmatterField<string>(file, 'description') || '',
			isActive: this.tagQuery.readFrontmatterField<boolean>(file, 'isActive') ?? true,
			createdDate: this.tagQuery.readFrontmatterField<string>(file, 'createdDate') || '',
			file,
		}));
	}

	async addProject(name: string, description?: string): Promise<TFile> {
		const today = new Date().toISOString().slice(0, 10);
		return await this.tagQuery.createTaggedNote(
			this.settings.projectFolder,
			name,
			this.settings.projectTag,
			{ isActive: true, createdDate: today, ...(description ? { description } : {}) }
		);
	}

	async updateProject(file: TFile, updates: Partial<{ isActive: boolean; description: string }>): Promise<void> {
		await this.tagQuery.updateNoteFrontmatter(file, (fm) => {
			Object.assign(fm, updates);
		});
	}

	async removeProject(file: TFile): Promise<void> {
		await this.tagQuery.deleteNote(file);
	}

	// ================================================================
	// 目标相关（标签笔记）
	// ================================================================

	async getGoals(): Promise<Array<Goal & { file: TFile }>> {
		const files = this.tagQuery.getNotesWithTag(this.settings.goalTag, this.settings.excludeTag);
		return files.map(file => ({
			id: file.path,
			name: file.basename,
			targetValue: this.tagQuery.readFrontmatterField<number>(file, 'targetValue') || 0,
			currentValue: this.tagQuery.readFrontmatterField<number>(file, 'currentValue') || 0,
			unit: this.tagQuery.readFrontmatterField<string>(file, 'unit') || '',
			projectId: this.tagQuery.readFrontmatterField<string>(file, 'project'),
			file,
		}));
	}

	async addGoal(goal: Omit<Goal, 'id'>): Promise<TFile> {
		return await this.tagQuery.createTaggedNote(
			'',
			goal.name,
			this.settings.goalTag,
			{
				targetValue: goal.targetValue,
				currentValue: goal.currentValue || 0,
				unit: goal.unit,
				...(goal.projectId ? { project: goal.projectId } : {}),
			}
		);
	}

	async updateGoal(file: TFile, updates: Partial<{ currentValue: number; targetValue: number; unit: string }>): Promise<void> {
		await this.tagQuery.updateNoteFrontmatter(file, (fm) => {
			Object.assign(fm, updates);
		});
	}

	async removeGoal(file: TFile): Promise<void> {
		await this.tagQuery.deleteNote(file);
	}

	// ================================================================
	// 日志相关（集成日记插件）
	// ================================================================

	/** 获取日记插件配置 */
	private getDailyNotesConfig(): { folder: string; format: string } | null {
		// 检查是否启用日记集成
		if (!this.settings.useDailyNotes) return null;
		// 读取 Obsidian 核心日记插件配置
		const dailyNotesPlugin = (this.app as any).internalPlugins?.getPluginById?.('daily-notes');
		if (!dailyNotesPlugin?.enabled) return null;
		const config = dailyNotesPlugin.instance?.options || {};
		return {
			folder: config.folder || '',
			format: config.format || 'YYYY-MM-DD',
		};
	}

	/** 获取当日日记文件路径 */
	getDailyNotePath(dateKey: string): string {
		const config = this.getDailyNotesConfig();
		if (!config) return normalizePath(`${dateKey}.md`);
		const folder = config.folder ? normalizePath(config.folder) : '';
		// 简单实现：直接用 dateKey 作为文件名（YYYY-MM-DD 格式）
		// 完整实现应解析 config.format，但大多数人用默认格式
		return normalizePath(folder ? `${folder}/${dateKey}.md` : `${dateKey}.md`);
	}

	/** 确保日记文件存在 */
	async ensureDailyLog(dateKey: string): Promise<TFile> {
		const path = this.getDailyNotePath(dateKey);
		let file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		if (!file) {
			// 创建日记文件
			const dir = path.substring(0, path.lastIndexOf('/'));
			if (dir) {
				const folderObj = this.app.vault.getAbstractFileByPath(dir);
				if (!folderObj) await this.app.vault.createFolder(dir);
			}
			file = await this.app.vault.create(path, `---\n---\n`);
		}
		return file;
	}

	/** 读取指定日期的日志 frontmatter */
	async getDailyLog(dateKey: string): Promise<DailyLogFrontmatter | null> {
		const path = this.getDailyNotePath(dateKey);
		const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		if (!file) return null;

		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return null;
		const fm = cache.frontmatter;
		return {
			日期: dateKey,
			封炉状态: (fm['封炉状态'] as SealStatus) || '',
			药材: Array.isArray(fm['药材']) ? (fm['药材'] as HerbRecord[]) : [],
			药引: Array.isArray(fm['药引']) ? (fm['药引'] as CatalystRecord[]) : [],
			丹药: fm['丹药'] ? (fm['丹药'] as PillRecord) : undefined,
		};
	}

	/** 追加药材到日记 */
	async addHerb(dateKey: string, herb: HerbRecord): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!Array.isArray(fm['药材'])) fm['药材'] = [];
			(fm['药材'] as HerbRecord[]).push(herb);
		});
	}

	/** 追加药引到日记 */
	async addCatalyst(dateKey: string, catalyst: CatalystRecord): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!Array.isArray(fm['药引'])) fm['药引'] = [];
			(fm['药引'] as CatalystRecord[]).push(catalyst);
		});
	}

	/** 设置丹药数据（封炉时调用） */
	async setPillData(dateKey: string, pill: PillRecord): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm['丹药'] = pill;
		});
	}

	/** 标记封炉状态 */
	async setSealStatus(dateKey: string): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm['封炉状态'] = '已封炉';
		});
	}

	/** 标记丹药为已查看 */
	async markPillViewed(dateKey: string): Promise<void> {
		const path = this.getDailyNotePath(dateKey);
		const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		if (!file) return;

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (fm['丹药']) {
				(fm['丹药'] as Record<string, unknown>)['已查看'] = true;
			}
		});
	}

	/** 获取所有未查看的丹药 */
	async getUnviewedPills(): Promise<Array<{ dateKey: string; pill: PillRecord }>> {
		const allLogs = await this.getAllDailyLogs();
		return allLogs
			.filter(log => log.丹药 && !log.丹药.已查看)
			.map(log => ({ dateKey: log.日期, pill: log.丹药! }));
	}

	/** 获取所有未封炉的日期 */
	async getUnsealedLogs(): Promise<string[]> {
		const config = this.getDailyNotesConfig();
		const folder = config?.folder || '';
		const prefix = folder ? normalizePath(folder) + '/' : '';
		const files = this.app.vault.getMarkdownFiles().filter(f => {
			if (prefix && !f.path.startsWith(prefix)) return false;
			return /^\d{4}-\d{2}-\d{2}$/.test(f.basename);
		});

		const unsealed: string[] = [];
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache?.frontmatter) continue;
			const fm = cache.frontmatter;
			// 只关注有药材数据但未封炉的文件
			if (Array.isArray(fm['药材']) && fm['药材'].length > 0 && fm['封炉状态'] !== '已封炉') {
				unsealed.push(file.basename);
			}
		}
		return unsealed;
	}

	/** 获取日期范围内所有日志（用于统计聚合） */
	async getAllDailyLogs(startDate?: string, endDate?: string): Promise<DailyLogFrontmatter[]> {
		const config = this.getDailyNotesConfig();
		const folder = config?.folder || '';
		const prefix = folder ? normalizePath(folder) + '/' : '';
		const files = this.app.vault.getMarkdownFiles().filter(f => {
			if (prefix && !f.path.startsWith(prefix)) return false;
			return /^\d{4}-\d{2}-\d{2}$/.test(f.basename);
		});

		const logs: DailyLogFrontmatter[] = [];
		for (const file of files) {
			const dateKey = file.basename;
			if (startDate && dateKey < startDate) continue;
			if (endDate && dateKey > endDate) continue;

			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache?.frontmatter) continue;
			const fm = cache.frontmatter;
			if (!fm['药材'] && !fm['药引'] && !fm['丹药']) continue;

			logs.push({
				日期: dateKey,
				封炉状态: (fm['封炉状态'] as SealStatus) || '',
				药材: Array.isArray(fm['药材']) ? (fm['药材'] as HerbRecord[]) : [],
				药引: Array.isArray(fm['药引']) ? (fm['药引'] as CatalystRecord[]) : [],
				丹药: fm['丹药'] ? (fm['丹药'] as PillRecord) : undefined,
			});
		}
		return logs.sort((a, b) => a.日期.localeCompare(b.日期));
	}

	/** 获取所有日志日期列表 */
	getLogDateKeys(): string[] {
		const config = this.getDailyNotesConfig();
		const folder = config?.folder || '';
		const prefix = folder ? normalizePath(folder) + '/' : '';
		const files = this.app.vault.getMarkdownFiles().filter(f => {
			if (prefix && !f.path.startsWith(prefix)) return false;
			return /^\d{4}-\d{2}-\d{2}$/.test(f.basename);
		});
		return files.map(f => f.basename).sort();
	}

	/** 获取所有丹药列表 */
	async getAllPills(): Promise<Array<{ dateKey: string; pill: PillRecord }>> {
		const allLogs = await this.getAllDailyLogs();
		return allLogs
			.filter(log => log.丹药)
			.map(log => ({ dateKey: log.日期, pill: log.丹药! }));
	}

	// ================================================================
	// 多周期丹炉（存储在 data.json）
	// ================================================================

	async getMultiCycleFurnace(id: string): Promise<MultiCycleFurnace | null> {
		const furnaces = this.plugin.data.multiCycleFurnaces ?? [];
		return furnaces.find(f => f.id === id) ?? null;
	}

	async saveMultiCycleFurnace(furnace: MultiCycleFurnace): Promise<void> {
		if (!this.plugin.data.multiCycleFurnaces) {
			this.plugin.data.multiCycleFurnaces = [];
		}
		const furnaces = this.plugin.data.multiCycleFurnaces;
		const idx = furnaces.findIndex(f => f.id === furnace.id);
		if (idx >= 0) {
			furnaces[idx] = furnace;
		} else {
			furnaces.push(furnace);
		}
		await this.plugin.savePluginData();
	}

	async listMultiCycleFurnaces(): Promise<MultiCycleFurnace[]> {
		return this.plugin.data.multiCycleFurnaces ?? [];
	}

	async deleteMultiCycleFurnace(id: string): Promise<void> {
		if (!this.plugin.data.multiCycleFurnaces) return;
		this.plugin.data.multiCycleFurnaces = this.plugin.data.multiCycleFurnaces.filter(f => f.id !== id);
		await this.plugin.savePluginData();
	}
}
