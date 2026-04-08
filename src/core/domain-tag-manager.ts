import type { App } from 'obsidian';
import type { DomainTag, Flavor } from '../types';
import { DEFAULT_DOMAIN_TAGS } from '../constants';
import { VaultDataManager } from './vault/vault-data-manager';

/**
 * DomainTagManager — 领域标签的增删改查逻辑。
 * 内存缓存 + 通过 VaultDataManager 持久化到 dandao/领域配置.md。
 */
export class DomainTagManager {
	private app: App;
	private vaultDataManager: VaultDataManager;
	private tags: DomainTag[] = [];

	constructor(app: App, vaultDataManager: VaultDataManager) {
		this.app = app;
		this.vaultDataManager = vaultDataManager;
	}

	/** 初始化：从 Vault 加载标签，首次使用时自动创建默认标签 */
	async initialize(): Promise<void> {
		const loaded = await this.vaultDataManager.getDomainTags();
		if (loaded.length === 0) {
			// 首次使用，写入默认标签
			this.tags = [...DEFAULT_DOMAIN_TAGS];
			await this.save();
		} else {
			this.tags = loaded;
		}
	}

	/** 重新从 Vault 加载标签（用于检测用户手动编辑后的变化） */
	async reload(): Promise<void> {
		this.tags = await this.vaultDataManager.getDomainTags();
	}

	/** 返回当前标签列表（同步，从缓存读取） */
	getTags(): DomainTag[] {
		return this.tags;
	}

	/** 按名称查找标签 */
	getTagByName(name: string): DomainTag | undefined {
		return this.tags.find((t) => t.name === name);
	}

	/** 获取标签对应的性味 */
	getFlavorForTag(tagName: string): Flavor | undefined {
		const tag = this.getTagByName(tagName);
		return tag?.flavor;
	}

	/** 添加标签（名称不可重复） */
	async addTag(tag: DomainTag): Promise<void> {
		if (this.getTagByName(tag.name)) {
			throw new Error(`领域标签 "${tag.name}" 已存在`);
		}
		this.tags.push(tag);
		await this.save();
	}

	/** 更新标签 */
	async updateTag(oldName: string, newTag: DomainTag): Promise<void> {
		const idx = this.tags.findIndex((t) => t.name === oldName);
		if (idx < 0) {
			throw new Error(`未找到领域标签 "${oldName}"`);
		}
		// 如果改了名称，检查新名称是否冲突
		if (newTag.name !== oldName && this.getTagByName(newTag.name)) {
			throw new Error(`领域标签 "${newTag.name}" 已存在`);
		}
		this.tags[idx] = newTag;
		// 如果重命名，删除旧笔记
		if (newTag.name !== oldName) {
			await this.vaultDataManager.removeDomainTag(oldName);
		}
		await this.save();
	}

	/** 删除标签 */
	async removeTag(name: string): Promise<void> {
		const idx = this.tags.findIndex((t) => t.name === name);
		if (idx < 0) {
			throw new Error(`未找到领域标签 "${name}"`);
		}
		this.tags.splice(idx, 1);
		await this.vaultDataManager.removeDomainTag(name);
	}

	/** 从任务的标签列表中匹配第一个已注册的领域标签 */
	async matchTag(taskTags: string[]): Promise<DomainTag | undefined> {
		for (const tagName of taskTags) {
			const match = this.getTagByName(tagName);
			if (match) return match;
		}
		return undefined;
	}

	/** 将当前 tags 写入 Vault */
	private async save(): Promise<void> {
		for (const tag of this.tags) {
			await this.vaultDataManager.saveDomainTag(tag);
		}
	}
}
