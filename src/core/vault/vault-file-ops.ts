import { App, TFile, TFolder, normalizePath } from 'obsidian';

/**
 * VaultFileOps — 封装 Vault 文件/目录的基本操作。
 * 包含目录创建、文件创建、读写、正文替换等底层方法。
 */
export class VaultFileOps {
	constructor(private app: App) {}

	// ----------------------------------------------------------------
	// 目录管理
	// ----------------------------------------------------------------

	/** 确保目录存在，如果不存在则创建 */
	async ensureFolder(path: string): Promise<void> {
		const normalized = normalizePath(path);
		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (existing instanceof TFolder) return;
		try {
			await this.app.vault.createFolder(normalized);
		} catch {
			// 目录可能在并发中被创建，或已存在，静默忽略
		}
	}

	/** 确保多级目录存在 */
	async ensureFolders(...paths: string[]): Promise<void> {
		for (const p of paths) {
			await this.ensureFolder(p);
		}
	}

	// ----------------------------------------------------------------
	// 文件管理
	// ----------------------------------------------------------------

	/** 确保文件存在，不存在则创建 */
	async ensureFile(path: string, initialContent: string): Promise<TFile> {
		const normalized = normalizePath(path);
		// 先检查是否已存在
		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (existing instanceof TFile) return existing;

		// 尝试创建
		try {
			return await this.app.vault.create(normalized, initialContent);
		} catch {
			// 创建失败（可能已存在），等待缓存更新后再次检查
			await new Promise((resolve) => setTimeout(resolve, 50));
			const after = this.app.vault.getAbstractFileByPath(normalized);
			if (after instanceof TFile) return after;

			// 最后尝试：直接从 adapter 获取
			const adapter = this.app.vault.adapter;
			if (adapter && await adapter.exists(normalized)) {
				// 文件确实存在，强制刷新缓存
				const file = this.app.vault.getAbstractFileByPath(normalized);
				if (file instanceof TFile) return file;
			}

			// 仍然找不到，记录警告但不抛出，返回 null 由调用方处理
			console.warn('丹道插件：ensureFile 无法获取文件', normalized);
			throw new Error(`无法创建或获取文件: ${normalized}`);
		}
	}

	/** 获取文件（如果存在） */
	getFile(path: string): TFile | null {
		const normalized = normalizePath(path);
		const f = this.app.vault.getAbstractFileByPath(normalized);
		return f instanceof TFile ? f : null;
	}

	/** 获取目录下的所有 md 文件 */
	getMdFilesInFolder(folderPath: string): TFile[] {
		const normalized = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalized);
		if (!(folder instanceof TFolder)) return [];

		return folder.children.filter(
			(f): f is TFile => f instanceof TFile && f.extension === 'md',
		);
	}

	/** 读取文件原始内容 */
	async readFile(file: TFile): Promise<string> {
		return this.app.vault.read(file);
	}

	/** 替换文件正文（保留 frontmatter） */
	async replaceBody(file: TFile, newBody: string): Promise<void> {
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
}
