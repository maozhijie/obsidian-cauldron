import { App, TFile, normalizePath } from 'obsidian';

/**
 * TagNoteQuery — 标签笔记的查询/创建/更新/删除工具类
 * 
 * 提供基于标签的笔记操作，支持：
 * - 按标签查询笔记（支持排除标签过滤）
 * - 创建带标签的笔记
 * - 更新笔记 frontmatter
 * - 删除笔记
 */
export class TagNoteQuery {
	constructor(private app: App) {}

	/**
	 * 获取带有指定标签的所有笔记，排除带 excludeTag 的笔记
	 */
	getNotesWithTag(tag: string, excludeTag?: string): TFile[] {
		const files: TFile[] = [];
		const allFiles = this.app.vault.getMarkdownFiles();
		for (const file of allFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;
			const tags = this.getAllTags(cache);
			if (tags.includes(tag)) {
				if (excludeTag && tags.includes(excludeTag)) continue;
				files.push(file);
			}
		}
		return files;
	}

	/**
	 * 创建带标签的笔记
	 */
	async createTaggedNote(
		folder: string,
		name: string,
		tag: string,
		frontmatter: Record<string, unknown> = {}
	): Promise<TFile> {
		const dir = folder ? normalizePath(folder) : '';
		if (dir) {
			const folderObj = this.app.vault.getAbstractFileByPath(dir);
			if (!folderObj) {
				await this.app.vault.createFolder(dir);
			}
		}
		const filePath = normalizePath(dir ? `${dir}/${name}.md` : `${name}.md`);
		
		// 构建 frontmatter YAML
		const fm: Record<string, unknown> = { tags: [tag], ...frontmatter };
		const yaml = this.buildYaml(fm);
		const content = `---\n${yaml}---\n`;
		
		const file = await this.app.vault.create(filePath, content);
		return file;
	}

	/**
	 * 更新笔记的 frontmatter
	 */
	async updateNoteFrontmatter(file: TFile, updater: (fm: Record<string, unknown>) => void): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			updater(fm);
		});
	}

	/**
	 * 读取笔记的 frontmatter 字段
	 */
	readFrontmatterField<T>(file: TFile, field: string): T | undefined {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return undefined;
		return cache.frontmatter[field] as T;
	}

	/**
	 * 删除笔记
	 */
	async deleteNote(file: TFile): Promise<void> {
		await this.app.vault.trash(file, true);
	}

	/**
	 * 从 CachedMetadata 中提取所有标签（包括 frontmatter tags 和正文中的 #tag）
	 */
	private getAllTags(cache: import('obsidian').CachedMetadata): string[] {
		const tags: string[] = [];
		// frontmatter tags
		if (cache.frontmatter?.tags) {
			const fmTags = cache.frontmatter.tags;
			if (Array.isArray(fmTags)) {
				tags.push(...fmTags.map((t: string) => t.replace(/^#/, '')));
			} else if (typeof fmTags === 'string') {
				tags.push(fmTags.replace(/^#/, ''));
			}
		}
		// inline tags
		if (cache.tags) {
			for (const t of cache.tags) {
				tags.push(t.tag.replace(/^#/, ''));
			}
		}
		return tags;
	}

	/**
	 * 简单的 YAML 构建器
	 */
	private buildYaml(obj: Record<string, unknown>): string {
		let yaml = '';
		for (const [key, value] of Object.entries(obj)) {
			if (Array.isArray(value)) {
				yaml += `${key}:\n`;
				for (const item of value) {
					if (typeof item === 'object' && item !== null) {
						const entries = Object.entries(item as Record<string, unknown>);
						if (entries.length > 0) {
							const firstEntry = entries[0]!;
							yaml += `  - ${firstEntry[0]}: ${JSON.stringify(firstEntry[1])}\n`;
							for (let i = 1; i < entries.length; i++) {
								const entry = entries[i]!;
								yaml += `    ${entry[0]}: ${JSON.stringify(entry[1])}\n`;
							}
						}
					} else {
						yaml += `  - ${JSON.stringify(item)}\n`;
					}
				}
			} else if (value === null || value === undefined) {
				yaml += `${key}:\n`;
			} else {
				yaml += `${key}: ${JSON.stringify(value)}\n`;
			}
		}
		return yaml;
	}
}
