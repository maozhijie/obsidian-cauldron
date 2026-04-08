import { App, TFile } from 'obsidian';
import type { HerbRecord, CatalystRecord, Rarity } from '../types';
import { VaultDataManager } from './vault/vault-data-manager';
import { DomainTagManager } from './domain-tag-manager';
import { CatalystCollector } from './catalyst-collector';
import { parseAllTasks, detectNewCompletions, hashTaskLine } from './task-parser';

/**
 * HerbCollector — 药材采集引擎。
 * 监听 Vault 文件变更，检测新完成的任务，生成药材记录并写入日志 md。
 */
export class HerbCollector {
	private app: App;
	private vaultDataManager: VaultDataManager;
	private domainTagManager: DomainTagManager;
	private catalystCollector: CatalystCollector | null = null;
	private getTaskStateCache: () => Record<string, string[]>;
	private setTaskStateCache: (cache: Record<string, string[]>) => void;

	/** 文件内容缓存，用于对比变更 */
	private fileContentCache: Map<string, string> = new Map();

	constructor(
		app: App,
		vaultDataManager: VaultDataManager,
		domainTagManager: DomainTagManager,
		getTaskStateCache: () => Record<string, string[]>,
		setTaskStateCache: (cache: Record<string, string[]>) => void,
	) {
		this.app = app;
		this.vaultDataManager = vaultDataManager;
		this.domainTagManager = domainTagManager;
		this.getTaskStateCache = getTaskStateCache;
		this.setTaskStateCache = setTaskStateCache;
	}

	/** 注入 CatalystCollector（避免循环依赖，由 main.ts 在初始化后设置） */
	setCatalystCollector(collector: CatalystCollector): void {
		this.catalystCollector = collector;
	}

	/**
	 * 初始化：扫描 Vault 中所有 .md 文件，建立初始的 taskStateCache。
	 * 首次加载时不会误触发已有的已完成任务。
	 */
	async initialize(): Promise<void> {
		const cache = this.getTaskStateCache();
		const files = this.app.vault.getMarkdownFiles();

		// 只处理非日记文件，限制最多处理 500 个文件
		const targetFiles = files
			.filter(f => !this.isDailyNotePath(f.path))
			.sort((a, b) => b.stat.mtime - a.stat.mtime)
			.slice(0, 500);

		for (const file of targetFiles) {
			try {
				const content = await this.app.vault.cachedRead(file);
				const tasks = parseAllTasks(content);
				const completedHashes = tasks
					.filter(t => t.isCompleted)
					.map(t => hashTaskLine(t.lineText));

				if (completedHashes.length > 0) {
					cache[file.path] = completedHashes;
				}

				// 缓存文件内容
				this.fileContentCache.set(file.path, content);
			} catch {
				// 跳过无法读取的文件
			}
		}

		this.setTaskStateCache(cache);
	}

	/**
	 * 文件变更回调（由 main.ts 通过 vault.on('modify') 调用）。
	 * 返回 true 表示采集到了新的药材/药引，需要刷新视图。
	 */
	async onFileModify(file: TFile): Promise<boolean> {
		// 忽略非 .md 文件
		if (file.extension !== 'md') return false;

		// 忽略日记文件（避免自写日志触发循环）
		if (this.isDailyNotePath(file.path)) return false;

		const newContent = await this.app.vault.cachedRead(file);
		const oldContent = this.fileContentCache.get(file.path);
		const cache = this.getTaskStateCache();
		const fileHashes = cache[file.path] ?? [];

		let newCompletions;

		if (oldContent !== undefined) {
			// 有旧内容缓存：使用 detectNewCompletions 对比
			newCompletions = detectNewCompletions(oldContent, newContent);
		} else {
			// 无旧内容缓存：对比 taskStateCache 中的哈希列表
			const allTasks = parseAllTasks(newContent);
			const hashSet = new Set(fileHashes);
			newCompletions = allTasks.filter(t => {
				if (!t.isCompleted) return false;
				const h = hashTaskLine(t.lineText);
				return !hashSet.has(h);
			});
		}

		let hasNewCollection = false;

		// 处理每个新完成的任务
		for (const task of newCompletions) {
			const hash = hashTaskLine(task.lineText);

			// 去重：检查哈希是否已存在
			if (fileHashes.includes(hash)) continue;

			// 匹配领域标签
			const domainTag = await this.domainTagManager.matchTag(task.tags);
			if (domainTag) {
				// 创建药材记录
				const herb = this.createHerbRecord(task.text, task.isImportant, domainTag.name);
				const dateKey = this.getTodayKey();
				await this.vaultDataManager.addHerb(dateKey, herb);

				// 创建守时引/延时引
				const catalyst = this.createTimeCatalyst(task.text, task.dueDate);
				if (this.catalystCollector) {
					await this.catalystCollector.collectTimeCatalyst(catalyst.类型 as '守时引' | '延时引', task.text);
				} else {
					await this.vaultDataManager.addCatalyst(dateKey, catalyst);
				}

				hasNewCollection = true;
			}

			// 将哈希加入缓存
			fileHashes.push(hash);
		}

		// 更新 cache
		if (fileHashes.length > 0) {
			cache[file.path] = fileHashes;
		}
		this.setTaskStateCache(cache);

		// 更新文件内容缓存
		this.fileContentCache.set(file.path, newContent);

		return hasNewCollection;
	}

	// ----------------------------------------------------------------
	// 私有方法
	// ----------------------------------------------------------------

	private createHerbRecord(taskText: string, isImportant: boolean, domainName: string): HerbRecord {
		const rarity: Rarity = isImportant ? '珍材' : '良材';
		return {
			领域: domainName,
			稀有度: rarity,
			数量: isImportant ? 2 : 1,
			来源: 'todo',
			来源任务: taskText,
			采集时间: new Date().toISOString(),
		};
	}

	private createTimeCatalyst(taskText: string, dueDate?: string): CatalystRecord {
		let type: '守时引' | '延时引' = '守时引';

		if (dueDate) {
			const due = new Date(dueDate + 'T23:59:59');
			const now = new Date();
			if (now > due) {
				type = '延时引';
			}
		}

		return {
			类型: type,
			数量: 1,
			来源任务: taskText,
			采集时间: new Date().toISOString(),
		};
	}

	/** 判断路径是否是日记文件 */
	private isDailyNotePath(path: string): boolean {
		// 检查文件名是否符合 YYYY-MM-DD.md 格式
		const fileName = path.split('/').pop() || '';
		return /^\d{4}-\d{2}-\d{2}\.md$/.test(fileName);
	}

	/** 返回当前日期 YYYY-MM-DD */
	private getTodayKey(): string {
		const now = new Date();
		const y = now.getFullYear();
		const m = String(now.getMonth() + 1).padStart(2, '0');
		const d = String(now.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
}
