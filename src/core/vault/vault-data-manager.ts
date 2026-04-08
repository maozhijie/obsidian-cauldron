import { App, TFile, debounce, normalizePath } from 'obsidian';
import type {
	DailyLogFrontmatter,
	DomainTag,
	HerbRecord,
	CatalystRecord,
	PillRecord,
	SealStatus,
	Project,
	TaskTemplate,
	Character,
	InvestmentRecord,
	Seed,
	Goal,
	CultivationState,
	FurnaceState,
	MeridianState,
	MultiCycleFurnace,
} from '../../types';
import {
	DEFAULT_DANDAO_FOLDER,
	LOG_SUBFOLDER,
	DOMAIN_CONFIG_FILENAME,
	INVESTMENT_SUBFOLDER,
	PROJECTS_FILENAME,
	TEMPLATES_FILENAME,
	CHARACTERS_FILENAME,
	INVESTMENT_RECORDS_FILENAME,
	SEEDS_FILENAME,
	GOALS_FILENAME,
	CULTIVATION_FILENAME,
	MULTI_CYCLE_SUBFOLDER,
} from '../../constants';
import { VaultFileOps } from './vault-file-ops';
import { VaultFrontmatter } from './vault-frontmatter';
import { VaultMarkdownBuilder } from './vault-markdown-builder';

/**
 * VaultDataManager — 封装 .dandao/ 目录下 Markdown 文件的读写逻辑。
 *
 * 所有日志和领域配置均以 frontmatter 为权威数据源，
 * 正文仅作可读镜像，每次 frontmatter 变更后自动重新生成。
 *
 * 这是一个 facade，组合 VaultFileOps / VaultFrontmatter / VaultMarkdownBuilder。
 */
export class VaultDataManager {
	private app: App;
	private dandaoFolder: string;
	private fileOps: VaultFileOps;
	private frontmatter: VaultFrontmatter;
	private builder: VaultMarkdownBuilder;

	/** 防抖：正文重新生成（500ms） */
	private debouncedUpdateBody: (file: TFile, data: DailyLogFrontmatter) => void;

	constructor(app: App, dandaoFolder: string) {
		this.app = app;
		this.dandaoFolder = dandaoFolder || DEFAULT_DANDAO_FOLDER;
		this.fileOps = new VaultFileOps(app);
		this.frontmatter = new VaultFrontmatter(app, this.fileOps);
		this.builder = new VaultMarkdownBuilder();

		this.debouncedUpdateBody = debounce(
			(file: TFile, data: DailyLogFrontmatter) => {
				this.fileOps.replaceBody(file, this.builder.generateLogContent(data));
			},
			500,
			true,
		);
	}

	/** 获取当前数据目录名 */
	getFolderName(): string {
		return this.dandaoFolder;
	}

	/** 获取 App 引用（供 UI 组件创建 Modal 使用） */
	getApp(): App {
		return this.app;
	}

	// ================================================================
	// 目录管理
	// ================================================================

	/** 确保 dandao/ 和 dandao/日志/ 目录存在 */
	async ensureDirectories(): Promise<void> {
		const root = normalizePath(this.dandaoFolder);
		const logDir = normalizePath(`${this.dandaoFolder}/${LOG_SUBFOLDER}`);
		await this.fileOps.ensureFolders(root, logDir);
	}

	// ================================================================
	// 领域配置读写
	// ================================================================

	/** 读取领域标签列表 */
	async getDomainTags(): Promise<DomainTag[]> {
		const path = this.getDomainConfigPath();
		const file = this.fileOps.getFile(path);
		if (!file) return [];

		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || !Array.isArray(fm['领域标签'])) {
			return this.frontmatter.readArrayField<DomainTag>(file, '领域标签');
		}
		return fm['领域标签'] as DomainTag[];
	}

	/** 保存领域标签列表到领域配置.md */
	async saveDomainTags(tags: DomainTag[]): Promise<void> {
		const path = this.getDomainConfigPath();
		await this.ensureDirectories();
		const file = await this.fileOps.ensureFile(path, '---\n领域标签: []\n---\n');

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			fm['领域标签'] = tags;
		});

		const body = this.builder.generateDomainConfigBody(tags);
		await this.fileOps.replaceBody(file, body);
	}

	// ================================================================
	// 日志文件读写
	// ================================================================

	/** 读取指定日期的日志 frontmatter */
	async getDailyLog(dateKey: string): Promise<DailyLogFrontmatter | null> {
		const path = this.getLogPath(dateKey);
		const file = this.fileOps.getFile(path);
		if (!file) return null;

		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm && fm['日期']) {
			return this.fmToDailyLog(fm);
		}
		// fallback：手动解析
		return this.parseDailyLogFromContent(file);
	}

	/** 确保当日日志文件存在，不存在则创建 */
	async ensureDailyLog(dateKey: string): Promise<TFile> {
		const path = this.getLogPath(dateKey);
		const existing = this.fileOps.getFile(path);
		if (existing) return existing;

		await this.ensureDirectories();

		const initialFm: DailyLogFrontmatter = {
			日期: dateKey,
			封炉状态: '' as SealStatus,
			药材: [],
			药引: [],
		};

		const content = this.buildFileContent(initialFm, this.builder.generateLogContent(initialFm));
		return await this.fileOps.ensureFile(path, content);
	}

	/** 追加药材到日志 */
	async addHerb(dateKey: string, herb: HerbRecord): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			if (!Array.isArray(fm['药材'])) fm['药材'] = [];
			(fm['药材'] as HerbRecord[]).push(herb);
		});

		const data = await this.getDailyLog(dateKey);
		if (data) this.debouncedUpdateBody(file, data);
	}

	/** 追加药引到日志 */
	async addCatalyst(dateKey: string, catalyst: CatalystRecord): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			if (!Array.isArray(fm['药引'])) fm['药引'] = [];
			(fm['药引'] as CatalystRecord[]).push(catalyst);
		});

		const data = await this.getDailyLog(dateKey);
		if (data) this.debouncedUpdateBody(file, data);
	}

	/** 设置丹药数据（封炉时调用） */
	async setPillData(dateKey: string, pill: PillRecord): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			fm['丹药'] = pill;
		});

		const data = await this.getDailyLog(dateKey);
		if (data) await this.fileOps.replaceBody(file, this.builder.generateLogContent(data));
	}

	/** 标记封炉状态 */
	async setSealStatus(dateKey: string): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			fm['封炉状态'] = '已封炉';
		});

		const data = await this.getDailyLog(dateKey);
		if (data) await this.fileOps.replaceBody(file, this.builder.generateLogContent(data));
	}

	/** 标记丹药为已查看 */
	async markPillViewed(dateKey: string): Promise<void> {
		const path = this.getLogPath(dateKey);
		const file = this.fileOps.getFile(path);
		if (!file) return;

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			if (fm['丹药']) {
				(fm['丹药'] as PillRecord)['已查看'] = true;
			}
		});
	}

	// ================================================================
	// 历史查询
	// ================================================================

	/** 获取所有未查看的丹药 */
	async getUnviewedPills(): Promise<Array<{ dateKey: string; pill: PillRecord }>> {
		const results: Array<{ dateKey: string; pill: PillRecord }> = [];
		const files = this.getLogFiles();

		for (const file of files) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm || !fm['丹药']) continue;
			const pill = fm['丹药'] as PillRecord;
			if (!pill.已查看) {
				results.push({ dateKey: file.basename, pill });
			}
		}
		return results;
	}

	/** 获取所有未封炉的日期 */
	async getUnsealedLogs(): Promise<string[]> {
		const dates: string[] = [];
		const files = this.getLogFiles();

		for (const file of files) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm) continue;
			if (fm['封炉状态'] !== '已封炉') {
				dates.push(file.basename);
			}
		}
		return dates;
	}

	/** 获取日期范围内所有日志（用于统计聚合） */
	async getAllDailyLogs(startDate?: string, endDate?: string): Promise<DailyLogFrontmatter[]> {
		const files = this.getLogFiles();
		const results: DailyLogFrontmatter[] = [];

		for (const file of files) {
			const dateKey = file.basename;
			if (startDate && dateKey < startDate) continue;
			if (endDate && dateKey > endDate) continue;

			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (fm && fm['日期']) {
				results.push(this.fmToDailyLog(fm));
			}
		}
		return results;
	}

	/** 获取所有日志日期列表 */
	getLogDateKeys(): string[] {
		return this.getLogFiles().map(f => f.basename).sort();
	}

	/** 获取所有丹药列表 */
	async getAllPills(): Promise<Array<{ dateKey: string; pill: PillRecord }>> {
		const results: Array<{ dateKey: string; pill: PillRecord }> = [];
		const files = this.getLogFiles();

		for (const file of files) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm || !fm['丹药']) continue;
			results.push({
				dateKey: file.basename,
				pill: fm['丹药'] as PillRecord,
			});
		}
		return results;
	}

	// ================================================================
	// 投注系统
	// ================================================================

	async getProjects(): Promise<Project[]> {
		const file = this.fileOps.getFile(this.getProjectsPath());
		if (!file) return [];
		return this.frontmatter.readArrayField<Project>(file, '项目列表');
	}

	async saveProject(project: Project): Promise<void> {
		const path = this.getProjectsPath();
		await this.ensureInvestmentDir();
		const file = await this.fileOps.ensureFile(path, '---\n项目列表: []\n---\n');

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			const list = Array.isArray(fm['项目列表']) ? (fm['项目列表'] as Project[]) : [];
			const idx = list.findIndex(p => p.id === project.id);
			if (idx >= 0) list[idx] = project; else list.push(project);
			fm['项目列表'] = list;
		});

		const projects = await this.getProjects();
		await this.fileOps.replaceBody(file, this.builder.generateProjectsBody(projects));
	}

	async removeProject(id: string): Promise<void> {
		const file = this.fileOps.getFile(this.getProjectsPath());
		if (!file) return;

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			if (Array.isArray(fm['项目列表'])) {
				fm['项目列表'] = (fm['项目列表'] as Project[]).filter(p => p.id !== id);
			}
		});

		const projects = await this.getProjects();
		await this.fileOps.replaceBody(file, this.builder.generateProjectsBody(projects));
	}

	async getTemplates(): Promise<TaskTemplate[]> {
		const file = this.fileOps.getFile(this.getTemplatesPath());
		if (!file) return [];
		return this.frontmatter.readArrayField<TaskTemplate>(file, '模板列表');
	}

	async saveTemplate(template: TaskTemplate): Promise<void> {
		const path = this.getTemplatesPath();
		await this.ensureInvestmentDir();
		const file = await this.fileOps.ensureFile(path, '---\n模板列表: []\n---\n');

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			const list = Array.isArray(fm['模板列表']) ? (fm['模板列表'] as TaskTemplate[]) : [];
			const idx = list.findIndex(t => t.id === template.id);
			if (idx >= 0) list[idx] = template; else list.push(template);
			fm['模板列表'] = list;
		});

		const templates = await this.getTemplates();
		await this.fileOps.replaceBody(file, this.builder.generateTemplatesBody(templates));
	}

	async removeTemplate(id: string): Promise<void> {
		const file = this.fileOps.getFile(this.getTemplatesPath());
		if (!file) return;

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			if (Array.isArray(fm['模板列表'])) {
				fm['模板列表'] = (fm['模板列表'] as TaskTemplate[]).filter(t => t.id !== id);
			}
		});

		const templates = await this.getTemplates();
		await this.fileOps.replaceBody(file, this.builder.generateTemplatesBody(templates));
	}

	async getCharacters(): Promise<Character[]> {
		const file = this.fileOps.getFile(this.getCharactersPath());
		if (!file) return [];
		return this.frontmatter.readArrayField<Character>(file, '角色列表');
	}

	async saveCharacter(character: Character): Promise<void> {
		const path = this.getCharactersPath();
		await this.ensureInvestmentDir();
		const file = await this.fileOps.ensureFile(path, '---\n角色列表: []\n---\n');

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			const list = Array.isArray(fm['角色列表']) ? (fm['角色列表'] as Character[]) : [];
			const idx = list.findIndex(c => c.id === character.id);
			if (idx >= 0) list[idx] = character; else list.push(character);
			fm['角色列表'] = list;
		});

		const characters = await this.getCharacters();
		await this.fileOps.replaceBody(file, this.builder.generateCharactersBody(characters));
	}

	async removeCharacter(id: string): Promise<void> {
		const file = this.fileOps.getFile(this.getCharactersPath());
		if (!file) return;

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			if (Array.isArray(fm['角色列表'])) {
				fm['角色列表'] = (fm['角色列表'] as Character[]).filter(c => c.id !== id);
			}
		});

		const characters = await this.getCharacters();
		await this.fileOps.replaceBody(file, this.builder.generateCharactersBody(characters));
	}

	async getInvestmentRecords(): Promise<InvestmentRecord[]> {
		const file = this.fileOps.getFile(this.getInvestmentRecordsPath());
		if (!file) return [];
		return this.frontmatter.readArrayField<InvestmentRecord>(file, '投注记录');
	}

	async addInvestmentRecord(record: InvestmentRecord): Promise<void> {
		const path = this.getInvestmentRecordsPath();
		await this.ensureInvestmentDir();
		const file = await this.fileOps.ensureFile(path, '---\n投注记录: []\n---\n');

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			if (!Array.isArray(fm['投注记录'])) fm['投注记录'] = [];
			(fm['投注记录'] as InvestmentRecord[]).push(record);
		});

		const records = await this.getInvestmentRecords();
		await this.fileOps.replaceBody(file, this.builder.generateInvestmentRecordsBody(records));
	}

	// ================================================================
	// 播种层
	// ================================================================

	async getSeeds(): Promise<Seed[]> {
		const file = this.fileOps.getFile(this.getSeedsPath());
		if (!file) return [];
		return this.frontmatter.readArrayField<Seed>(file, '种子列表');
	}

	async addSeed(seed: Seed): Promise<void> {
		const path = this.getSeedsPath();
		await this.ensureDirectories();
		const file = await this.fileOps.ensureFile(path, '---\n种子列表: []\n---\n');

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			if (!Array.isArray(fm['种子列表'])) fm['种子列表'] = [];
			(fm['种子列表'] as Seed[]).push(seed);
		});

		const seeds = await this.getSeeds();
		await this.fileOps.replaceBody(file, this.builder.generateSeedsBody(seeds));
	}

	async updateSeed(seed: Seed): Promise<void> {
		const file = this.fileOps.getFile(this.getSeedsPath());
		if (!file) return;

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			const list = Array.isArray(fm['种子列表']) ? (fm['种子列表'] as Seed[]) : [];
			const idx = list.findIndex(s => s.id === seed.id);
			if (idx >= 0) list[idx] = seed;
			fm['种子列表'] = list;
		});

		const seeds = await this.getSeeds();
		await this.fileOps.replaceBody(file, this.builder.generateSeedsBody(seeds));
	}

	async removeSeed(id: string): Promise<void> {
		const file = this.fileOps.getFile(this.getSeedsPath());
		if (!file) return;

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			if (Array.isArray(fm['种子列表'])) {
				fm['种子列表'] = (fm['种子列表'] as Seed[]).filter(s => s.id !== id);
			}
		});

		const seeds = await this.getSeeds();
		await this.fileOps.replaceBody(file, this.builder.generateSeedsBody(seeds));
	}

	async getGoals(): Promise<Goal[]> {
		const file = this.fileOps.getFile(this.getGoalsPath());
		if (!file) return [];
		return this.frontmatter.readArrayField<Goal>(file, '目标列表');
	}

	async saveGoal(goal: Goal): Promise<void> {
		const path = this.getGoalsPath();
		await this.ensureDirectories();
		const file = await this.fileOps.ensureFile(path, '---\n目标列表: []\n---\n');

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			const list = Array.isArray(fm['目标列表']) ? (fm['目标列表'] as Goal[]) : [];
			const idx = list.findIndex(g => g.id === goal.id);
			if (idx >= 0) list[idx] = goal; else list.push(goal);
			fm['目标列表'] = list;
		});

		const goals = await this.getGoals();
		await this.fileOps.replaceBody(file, this.builder.generateGoalsBody(goals));
	}

	async removeGoal(id: string): Promise<void> {
		const file = this.fileOps.getFile(this.getGoalsPath());
		if (!file) return;

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			if (Array.isArray(fm['目标列表'])) {
				fm['目标列表'] = (fm['目标列表'] as Goal[]).filter(g => g.id !== id);
			}
		});

		const goals = await this.getGoals();
		await this.fileOps.replaceBody(file, this.builder.generateGoalsBody(goals));
	}

	// ================================================================
	// 修炼系统
	// ================================================================

	async getCultivationState(): Promise<CultivationState> {
		const file = this.fileOps.getFile(this.getCultivationPath());
		if (!file) return this.defaultCultivationState();
		const state = await this.frontmatter.readObjectField<CultivationState>(file, '修炼状态');
		return state ?? this.defaultCultivationState();
	}

	async saveCultivationState(state: CultivationState): Promise<void> {
		const path = this.getCultivationPath();
		await this.ensureDirectories();
		const file = await this.fileOps.ensureFile(path, '---\n修炼状态: {}\n丹炉状态: {}\n经脉列表: []\n---\n');

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			fm['修炼状态'] = state;
		});

		await this.refreshCultivationBody(file);
	}

	async getFurnaceState(): Promise<FurnaceState> {
		const file = this.fileOps.getFile(this.getCultivationPath());
		if (!file) return this.defaultFurnaceState();
		const state = await this.frontmatter.readObjectField<FurnaceState>(file, '丹炉状态');
		return state ?? this.defaultFurnaceState();
	}

	async saveFurnaceState(state: FurnaceState): Promise<void> {
		const path = this.getCultivationPath();
		await this.ensureDirectories();
		const file = await this.fileOps.ensureFile(path, '---\n修炼状态: {}\n丹炉状态: {}\n经脉列表: []\n---\n');

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			fm['丹炉状态'] = state;
		});

		await this.refreshCultivationBody(file);
	}

	async getMeridianStates(): Promise<MeridianState[]> {
		const file = this.fileOps.getFile(this.getCultivationPath());
		if (!file) return [];
		return this.frontmatter.readArrayField<MeridianState>(file, '经脉列表');
	}

	async saveMeridianState(state: MeridianState): Promise<void> {
		const path = this.getCultivationPath();
		await this.ensureDirectories();
		const file = await this.fileOps.ensureFile(path, '---\n修炼状态: {}\n丹炉状态: {}\n经脉列表: []\n---\n');

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			const list = Array.isArray(fm['经脉列表']) ? (fm['经脉列表'] as MeridianState[]) : [];
			const idx = list.findIndex(m => m.domainTag === state.domainTag);
			if (idx >= 0) list[idx] = state; else list.push(state);
			fm['经脉列表'] = list;
		});

		await this.refreshCultivationBody(file);
	}

	// ================================================================
	// 多周期丹炉
	// ================================================================

	async getMultiCycleFurnace(id: string): Promise<MultiCycleFurnace | null> {
		const path = this.getMultiCycleFurnacePath(id);
		const file = this.fileOps.getFile(path);
		if (!file) return null;
		return this.frontmatter.readObjectField<MultiCycleFurnace>(file, '周期炉');
	}

	async saveMultiCycleFurnace(furnace: MultiCycleFurnace): Promise<void> {
		const path = this.getMultiCycleFurnacePath(furnace.id);
		await this.ensureMultiCycleDir();
		const file = await this.fileOps.ensureFile(path, '---\n周期炉: {}\n---\n');

		await this.frontmatter.updateFrontmatter(file, (fm) => {
			fm['周期炉'] = furnace;
		});

		await this.fileOps.replaceBody(file, this.builder.generateMultiCycleFurnaceBody(furnace));
	}

	async listMultiCycleFurnaces(): Promise<MultiCycleFurnace[]> {
		const dir = normalizePath(`${this.dandaoFolder}/${MULTI_CYCLE_SUBFOLDER}`);
		const files = this.fileOps.getMdFilesInFolder(dir);
		const results: MultiCycleFurnace[] = [];

		for (const file of files) {
			const furnace = await this.frontmatter.readObjectField<MultiCycleFurnace>(file, '周期炉');
			if (furnace) results.push(furnace);
		}
		return results;
	}

	// ================================================================
	// 路径辅助（私有）
	// ================================================================

	private getLogPath(dateKey: string): string {
		return normalizePath(`${this.dandaoFolder}/${LOG_SUBFOLDER}/${dateKey}.md`);
	}

	private getDomainConfigPath(): string {
		return normalizePath(`${this.dandaoFolder}/${DOMAIN_CONFIG_FILENAME}`);
	}

	private getProjectsPath(): string {
		return normalizePath(`${this.dandaoFolder}/${INVESTMENT_SUBFOLDER}/${PROJECTS_FILENAME}`);
	}

	private getTemplatesPath(): string {
		return normalizePath(`${this.dandaoFolder}/${INVESTMENT_SUBFOLDER}/${TEMPLATES_FILENAME}`);
	}

	private getCharactersPath(): string {
		return normalizePath(`${this.dandaoFolder}/${INVESTMENT_SUBFOLDER}/${CHARACTERS_FILENAME}`);
	}

	private getInvestmentRecordsPath(): string {
		return normalizePath(`${this.dandaoFolder}/${INVESTMENT_SUBFOLDER}/${INVESTMENT_RECORDS_FILENAME}`);
	}

	private getSeedsPath(): string {
		return normalizePath(`${this.dandaoFolder}/${SEEDS_FILENAME}`);
	}

	private getGoalsPath(): string {
		return normalizePath(`${this.dandaoFolder}/${GOALS_FILENAME}`);
	}

	private getCultivationPath(): string {
		return normalizePath(`${this.dandaoFolder}/${CULTIVATION_FILENAME}`);
	}

	private getMultiCycleFurnacePath(id: string): string {
		return normalizePath(`${this.dandaoFolder}/${MULTI_CYCLE_SUBFOLDER}/${id}.md`);
	}

	// ================================================================
	// 目录确保辅助
	// ================================================================

	private async ensureInvestmentDir(): Promise<void> {
		await this.ensureDirectories();
		await this.fileOps.ensureFolder(
			normalizePath(`${this.dandaoFolder}/${INVESTMENT_SUBFOLDER}`),
		);
	}

	private async ensureMultiCycleDir(): Promise<void> {
		await this.ensureDirectories();
		await this.fileOps.ensureFolder(
			normalizePath(`${this.dandaoFolder}/${MULTI_CYCLE_SUBFOLDER}`),
		);
	}

	// ================================================================
	// 内部工具方法
	// ================================================================

	/** 获取日志目录中的所有 md 文件 */
	private getLogFiles(): TFile[] {
		return this.fileOps.getMdFilesInFolder(
			normalizePath(`${this.dandaoFolder}/${LOG_SUBFOLDER}`),
		);
	}

	/** 从 metadataCache frontmatter 对象构建 DailyLogFrontmatter */
	private fmToDailyLog(fm: Record<string, unknown>): DailyLogFrontmatter {
		return {
			日期: (fm['日期'] as string) ?? '',
			封炉状态: (fm['封炉状态'] as SealStatus) ?? '',
			药材: Array.isArray(fm['药材']) ? (fm['药材'] as HerbRecord[]) : [],
			药引: Array.isArray(fm['药引']) ? (fm['药引'] as CatalystRecord[]) : [],
			丹药: fm['丹药'] ? (fm['丹药'] as PillRecord) : undefined,
		};
	}

	/** 从文件内容手动解析 DailyLogFrontmatter */
	private async parseDailyLogFromContent(file: TFile): Promise<DailyLogFrontmatter | null> {
		const raw = await this.fileOps.readFile(file);
		const fm = this.frontmatter.extractYamlFrontmatter(raw);
		if (!fm || !fm['日期']) return null;
		return this.fmToDailyLog(fm);
	}

	/** 构建包含 frontmatter 和正文的完整文件内容 */
	private buildFileContent(fm: DailyLogFrontmatter, body: string): string {
		const yamlLines: string[] = [];
		yamlLines.push('---');
		yamlLines.push(`日期: "${fm.日期}"`);
		yamlLines.push(`封炉状态: "${fm.封炉状态}"`);
		yamlLines.push('药材: []');
		yamlLines.push('药引: []');
		yamlLines.push('---');
		return yamlLines.join('\n') + '\n' + body;
	}

	/** 刷新修炼档案正文 */
	private async refreshCultivationBody(file: TFile): Promise<void> {
		const cultivation = await this.frontmatter.readObjectField<CultivationState>(file, '修炼状态')
			?? this.defaultCultivationState();
		const furnace = await this.frontmatter.readObjectField<FurnaceState>(file, '丹炉状态')
			?? this.defaultFurnaceState();
		const meridians = await this.frontmatter.readArrayField<MeridianState>(file, '经脉列表');

		await this.fileOps.replaceBody(
			file,
			this.builder.generateCultivationBody(cultivation, furnace, meridians),
		);
	}

	private defaultCultivationState(): CultivationState {
		return {
			realm: '练气',
			realmLevel: 1,
			totalXp: 0,
			currentRealmXp: 0,
			xpToNextLevel: 100,
			breakthroughAttempts: 0,
			heartStateValue: 0,
			unlockedFeatures: ['日炉'],
		};
	}

	private defaultFurnaceState(): FurnaceState {
		return {
			level: 1,
			xp: 0,
			xpToNextLevel: 50,
			totalPillsRefined: 0,
		};
	}
}
