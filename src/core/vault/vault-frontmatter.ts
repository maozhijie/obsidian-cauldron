import { App, TFile } from 'obsidian';
import { VaultFileOps } from './vault-file-ops';

/**
 * VaultFrontmatter — 封装 frontmatter 的解析与原子更新。
 * 提供 readFrontmatter / updateFrontmatter 通用方法，
 * 以及 metadataCache 不可用时的 YAML fallback 解析。
 */
export class VaultFrontmatter {
	constructor(
		private app: App,
		private fileOps: VaultFileOps,
	) {}

	// ----------------------------------------------------------------
	// 通用读写
	// ----------------------------------------------------------------

	/** 读取文件的 frontmatter（优先 metadataCache，fallback 手动解析） */
	async readFrontmatter(file: TFile): Promise<Record<string, unknown> | null> {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (fm) return fm as Record<string, unknown>;

		// fallback: 手动解析
		const raw = await this.fileOps.readFile(file);
		return this.extractYamlFrontmatter(raw);
	}

	/** 原子更新 frontmatter */
	async updateFrontmatter(
		file: TFile,
		updater: (fm: Record<string, unknown>) => void,
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			updater(fm);
		});
	}

	// ----------------------------------------------------------------
	// 类型化读取辅助
	// ----------------------------------------------------------------

	/** 从 frontmatter 读取数组字段 */
	async readArrayField<T>(file: TFile, key: string): Promise<T[]> {
		const fm = await this.readFrontmatter(file);
		if (!fm || !Array.isArray(fm[key])) return [];
		return fm[key] as T[];
	}

	/** 从 frontmatter 读取对象字段 */
	async readObjectField<T>(file: TFile, key: string): Promise<T | null> {
		const fm = await this.readFrontmatter(file);
		if (!fm || fm[key] === undefined || fm[key] === null) return null;
		return fm[key] as T;
	}

	// ----------------------------------------------------------------
	// YAML 手动解析（fallback）
	// ----------------------------------------------------------------

	/**
	 * 简易 YAML frontmatter 提取。
	 * 仅用于 metadataCache 不可用时的 fallback，不做完整 YAML 解析。
	 */
	extractYamlFrontmatter(content: string): Record<string, unknown> | null {
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
}
