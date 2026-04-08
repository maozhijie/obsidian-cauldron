import { App, TFile, TFolder, debounce, normalizePath } from 'obsidian';
import type {
	DailyLogFrontmatter,
	DomainConfigFrontmatter,
	HerbRecord,
	CatalystRecord,
	PillRecord,
	DomainTag,
	SealStatus,
} from '../types';
import {
	DEFAULT_DANDAO_FOLDER,
	LOG_SUBFOLDER,
	DOMAIN_CONFIG_FILENAME,
	CATALYST_ICONS,
	FLAVOR_ICONS,
} from '../constants';

/**
 * VaultDataManager — 封装 .dandao/ 目录下 Markdown 文件的读写逻辑。
 *
 * 所有日志和领域配置均以 frontmatter 为权威数据源，
 * 正文仅作可读镜像，每次 frontmatter 变更后自动重新生成。
 */
export class VaultDataManager {
	private app: App;
	private dandaoFolder: string;

	/** 防抖：正文重新生成（500ms） */
	private debouncedUpdateBody: (file: TFile, data: DailyLogFrontmatter) => void;

	constructor(app: App, dandaoFolder: string) {
		this.app = app;
		this.dandaoFolder = dandaoFolder || DEFAULT_DANDAO_FOLDER;

		this.debouncedUpdateBody = debounce(
			(file: TFile, data: DailyLogFrontmatter) => {
				this.replaceBody(file, this.generateLogContent(data));
			},
			500,
			true,
		);
	}

	/** 获取当前数据目录名 */
	getFolderName(): string {
		return this.dandaoFolder;
	}

	// ----------------------------------------------------------------
	// 目录管理
	// ----------------------------------------------------------------

	/** 确保 dandao/ 和 dandao/日志/ 目录存在 */
	async ensureDirectories(): Promise<void> {
		const root = normalizePath(this.dandaoFolder);
		const logDir = normalizePath(`${this.dandaoFolder}/${LOG_SUBFOLDER}`);

		await this.ensureFolder(root);
		await this.ensureFolder(logDir);
	}

	private async ensureFolder(path: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFolder) return;
		try {
			await this.app.vault.createFolder(path);
		} catch {
			// 目录可能在并发中被创建，或已存在，静默忽略
		}
	}

	/** 确保文件存在，不存在则创建 */
	private async ensureFile(path: string, initialContent: string): Promise<TFile> {
		// 先检查是否已存在
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;

		// 尝试创建
		try {
			return await this.app.vault.create(path, initialContent);
		} catch {
			// 创建失败（可能已存在），等待缓存更新后再次检查
			await new Promise((resolve) => setTimeout(resolve, 50));
			const after = this.app.vault.getAbstractFileByPath(path);
			if (after instanceof TFile) return after;

			// 最后尝试：直接从 adapter 获取
			const adapter = this.app.vault.adapter;
			if (adapter && await adapter.exists(path)) {
				// 文件确实存在，强制刷新缓存
				const file = this.app.vault.getAbstractFileByPath(path);
				if (file instanceof TFile) return file;
			}

			// 仍然找不到，记录警告但不抛出，返回 null 由调用方处理
			console.warn('丹道插件：ensureFile 无法获取文件', path);
			throw new Error(`无法创建或获取文件: ${path}`);
		}
	}

	// ----------------------------------------------------------------
	// 领域配置读写
	// ----------------------------------------------------------------

	/** 读取领域标签列表 */
	async getDomainTags(): Promise<DomainTag[]> {
		const path = this.getDomainConfigPath();
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return [];

		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm || !Array.isArray(fm['领域标签'])) {
			// metadataCache 可能未就绪，尝试手动解析
			return this.parseDomainTagsFromContent(file);
		}
		return fm['领域标签'] as DomainTag[];
	}

	/** 保存领域标签列表到领域配置.md */
	async saveDomainTags(tags: DomainTag[]): Promise<void> {
		const path = this.getDomainConfigPath();
		await this.ensureDirectories();
		const file = await this.ensureFile(path, '---\n领域标签: []\n---\n');

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm['领域标签'] = tags;
		});

		// 更新正文
		const body = this.generateDomainConfigBody(tags);
		await this.replaceBody(file, body);
	}

	// ----------------------------------------------------------------
	// 日志文件读写
	// ----------------------------------------------------------------

	/** 读取指定日期的日志 frontmatter */
	async getDailyLog(dateKey: string): Promise<DailyLogFrontmatter | null> {
		const path = this.getLogPath(dateKey);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;

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
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;

		await this.ensureDirectories();

		const initialFm: DailyLogFrontmatter = {
			日期: dateKey,
			封炉状态: '' as SealStatus,
			药材: [],
			药引: [],
		};

		const content = this.buildFileContent(initialFm, this.generateLogContent(initialFm));
		return await this.ensureFile(path, content);
	}

	/** 追加药材到日志 */
	async addHerb(dateKey: string, herb: HerbRecord): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!Array.isArray(fm['药材'])) fm['药材'] = [];
			fm['药材'].push(herb);
		});

		const data = await this.getDailyLog(dateKey);
		if (data) this.debouncedUpdateBody(file, data);
	}

	/** 追加药引到日志 */
	async addCatalyst(dateKey: string, catalyst: CatalystRecord): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (!Array.isArray(fm['药引'])) fm['药引'] = [];
			fm['药引'].push(catalyst);
		});

		const data = await this.getDailyLog(dateKey);
		if (data) this.debouncedUpdateBody(file, data);
	}

	/** 设置丹药数据（封炉时调用） */
	async setPillData(dateKey: string, pill: PillRecord): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm['丹药'] = pill;
		});

		const data = await this.getDailyLog(dateKey);
		if (data) await this.replaceBody(file, this.generateLogContent(data));
	}

	/** 标记封炉状态 */
	async setSealStatus(dateKey: string): Promise<void> {
		const file = await this.ensureDailyLog(dateKey);

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm['封炉状态'] = '已封炉';
		});

		const data = await this.getDailyLog(dateKey);
		if (data) await this.replaceBody(file, this.generateLogContent(data));
	}

	/** 标记丹药为已查看 */
	async markPillViewed(dateKey: string): Promise<void> {
		const path = this.getLogPath(dateKey);
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;

		await this.app.fileManager.processFrontMatter(file, (fm) => {
			if (fm['丹药']) {
				fm['丹药']['已查看'] = true;
			}
		});
	}

	// ----------------------------------------------------------------
	// 历史查询
	// ----------------------------------------------------------------

	/** 获取所有未查看的丹药 */
	async getUnviewedPills(): Promise<Array<{ dateKey: string; pill: PillRecord }>> {
		const results: Array<{ dateKey: string; pill: PillRecord }> = [];
		const files = this.getLogFiles();

		for (const file of files) {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			if (!fm || !fm['丹药']) continue;
			const pill = fm['丹药'] as PillRecord;
			if (!pill.已查看) {
				const dateKey = file.basename; // YYYY-MM-DD
				results.push({ dateKey, pill });
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

	// ----------------------------------------------------------------
	// 正文生成（私有）
	// ----------------------------------------------------------------

	/** 根据 frontmatter 数据生成可读的 Markdown 正文 */
	private generateLogContent(data: DailyLogFrontmatter): string {
		const lines: string[] = [];
		lines.push(`# ${data.日期} 修炼日志`);
		lines.push('');

		// 药材
		lines.push('## 今日药材');
		if (data.药材.length === 0) {
			lines.push('_今日尚未采集药材_');
		} else {
			for (const h of data.药材) {
				const flavor = this.getFlavorForDomain(h.领域);
				const icon = (FLAVOR_ICONS as Record<string, string>)[flavor] ?? '🌿';
				const desc = h.来源任务 ? ` — ${h.来源任务}` : '';
				lines.push(`- ${icon} ${h.领域} (${h.稀有度}) x${h.数量}${desc}`);
			}
		}
		lines.push('');

		// 药引
		lines.push('## 今日药引');
		if (data.药引.length === 0) {
			lines.push('_今日尚无药引_');
		} else {
			// 按类型汇总
			const catalystMap = new Map<string, number>();
			for (const c of data.药引) {
				catalystMap.set(c.类型, (catalystMap.get(c.类型) ?? 0) + c.数量);
			}
			for (const [type, count] of catalystMap) {
				const icon = CATALYST_ICONS[type] ?? '🔹';
				lines.push(`- ${icon} ${type} x${count}`);
			}
		}
		lines.push('');

		// 丹药
		lines.push('## 丹药');
		if (data.丹药) {
			const p = data.丹药;
			const purity = Math.round(p.纯度 * 100);
			lines.push(
				`**【${p.主性味}·${p.品级}】${p.名称}** | 纯度 ${purity}% | 药材总量 ${p.药材总量}`,
			);
		} else if (data.封炉状态 === '已封炉') {
			lines.push('_今日未产出丹药_');
		} else {
			lines.push('_尚未封炉_');
		}
		lines.push('');

		return lines.join('\n');
	}

	/** 生成领域配置正文 */
	private generateDomainConfigBody(tags: DomainTag[]): string {
		const lines: string[] = [];
		lines.push('# 领域配置');
		lines.push('');
		if (tags.length === 0) {
			lines.push('_暂无领域标签，请在设置中添加。_');
		} else {
			for (const tag of tags) {
				const icon = FLAVOR_ICONS[tag.flavor] ?? '🔹';
				const colorHint = tag.color ? ` (${tag.color})` : '';
				lines.push(`- ${icon} **${tag.name}** — 性味：${tag.flavor}${colorHint}`);
			}
		}
		lines.push('');
		return lines.join('\n');
	}

	// ----------------------------------------------------------------
	// 路径辅助（私有）
	// ----------------------------------------------------------------

	private getLogPath(dateKey: string): string {
		return normalizePath(`${this.dandaoFolder}/${LOG_SUBFOLDER}/${dateKey}.md`);
	}

	private getDomainConfigPath(): string {
		return normalizePath(`${this.dandaoFolder}/${DOMAIN_CONFIG_FILENAME}`);
	}

	// ----------------------------------------------------------------
	// 内部工具方法
	// ----------------------------------------------------------------

	/** 获取日志目录中的所有 md 文件 */
	private getLogFiles(): TFile[] {
		const logDir = normalizePath(`${this.dandaoFolder}/${LOG_SUBFOLDER}`);
		const folder = this.app.vault.getAbstractFileByPath(logDir);
		if (!(folder instanceof TFolder)) return [];

		return folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md',
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

	/** 从文件内容手动解析 DailyLogFrontmatter（metadataCache 未就绪时的回退） */
	private async parseDailyLogFromContent(file: TFile): Promise<DailyLogFrontmatter | null> {
		const raw = await this.app.vault.read(file);
		const fm = this.extractYamlFrontmatter(raw);
		if (!fm || !fm['日期']) return null;
		return this.fmToDailyLog(fm);
	}

	/** 从文件内容手动解析领域标签 */
	private async parseDomainTagsFromContent(file: TFile): Promise<DomainTag[]> {
		const raw = await this.app.vault.read(file);
		const fm = this.extractYamlFrontmatter(raw);
		if (!fm || !Array.isArray(fm['领域标签'])) return [];
		return fm['领域标签'] as DomainTag[];
	}

	/**
	 * 简易 YAML frontmatter 提取。
	 * 仅用于 metadataCache 不可用时的 fallback，不做完整 YAML 解析。
	 */
	private extractYamlFrontmatter(content: string): Record<string, unknown> | null {
		const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (!match || !match[1]) return null;
		try {
			const result: Record<string, unknown> = {};
			const yamlBlock = match[1];
			// 尝试借助 Obsidian 内置的 parseYaml（如果可用）
			const win = window as unknown as Record<string, unknown>;
			if (typeof win['parseYaml'] === 'function') {
				const parseFn = win['parseYaml'] as (s: string) => Record<string, unknown>;
				return parseFn(yamlBlock);
			}
			// 最简解析——只处理顶层 key
			for (const line of yamlBlock.split('\n')) {
				const kv = line.match(/^(\S+):\s*(.*)/);
				if (kv && kv[1] && kv[2] !== undefined) {
					const key = kv[1];
					const val = kv[2].trim();
					if (val.startsWith('[')) {
						try {
							result[key] = JSON.parse(val);
						} catch {
							result[key] = val;
						}
					} else {
						result[key] = val;
					}
				}
			}
			return result;
		} catch {
			return null;
		}
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

	/** 替换文件正文（保留 frontmatter） */
	private async replaceBody(file: TFile, newBody: string): Promise<void> {
		const raw = await this.app.vault.read(file);
		const fmEnd = this.findFrontmatterEnd(raw);
		const prefix = fmEnd >= 0 ? raw.slice(0, fmEnd) : '';
		await this.app.vault.modify(file, prefix + '\n' + newBody);
	}

	/** 找到 frontmatter 结束位置（第二个 --- 之后的换行符位置） */
	private findFrontmatterEnd(content: string): number {
		if (!content.startsWith('---')) return -1;
		const secondDash = content.indexOf('---', 3);
		if (secondDash < 0) return -1;
		const afterDash = secondDash + 3;
		// 跳过紧随的换行符
		if (content[afterDash] === '\r') return afterDash + 2; // \r\n
		if (content[afterDash] === '\n') return afterDash + 1;
		return afterDash;
	}

	/**
	 * 获取领域对应的性味（用于图标查找）。
	 * 这里需要查领域配置，但为了避免异步调用，
	 * 默认返回 '神识'，调用方可以传入完整的 tag 信息。
	 */
	private getFlavorForDomain(_domain: string): string {
		// 简易实现：直接返回默认，上层生成正文时可传入完整信息
		return '神识';
	}
}
