import { App, Modal, Setting } from 'obsidian';
import type { Seed } from '../../types';
import type { SeedManager } from '../../core/seed-manager';

/**
 * SeedConvertModal — 种子转化为任务的弹窗。
 * 显示种子详情，允许用户输入目标文件路径完成转化。
 */
export class SeedConvertModal extends Modal {
	private seed: Seed;
	private seedManager: SeedManager;
	private taskPath = '';
	private onDone: () => void;

	constructor(app: App, seed: Seed, seedManager: SeedManager, onDone: () => void) {
		super(app);
		this.seed = seed;
		this.seedManager = seedManager;
		this.onDone = onDone;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('seed-convert-modal');

		contentEl.createEl('h3', { text: '🌱 转化种子为任务' });

		// 种子详情
		const detailEl = contentEl.createDiv({ cls: 'seed-modal-detail' });
		detailEl.createEl('p', { text: this.seed.text, cls: 'seed-modal-text' });

		const metaEl = detailEl.createDiv({ cls: 'seed-modal-meta' });
		metaEl.createSpan({ text: `创建于 ${this.seed.createdDate}` });
		if (this.seed.tags && this.seed.tags.length > 0) {
			const tagsEl = metaEl.createSpan({ cls: 'seed-modal-tags' });
			for (const tag of this.seed.tags) {
				tagsEl.createSpan({ text: `#${tag}`, cls: 'dandao-tag' });
			}
		}

		// 输入目标路径
		new Setting(contentEl)
			.setName('目标文件路径')
			.setDesc('种子将转化为该文件中的任务（如 项目/我的任务.md）')
			.addText(text => {
				text.setPlaceholder('输入笔记路径…')
					.onChange(val => { this.taskPath = val.trim(); });
			});

		// 操作按钮
		const actions = contentEl.createDiv({ cls: 'seed-modal-actions' });

		const confirmBtn = actions.createEl('button', { cls: 'mod-cta', text: '确认转化' });
		confirmBtn.addEventListener('click', async () => {
			if (!this.taskPath) {
				return;
			}
			try {
				await this.seedManager.convertSeed(this.seed.id, this.taskPath);
				this.onDone();
				this.close();
			} catch (err) {
				console.error('[SeedConvertModal] 转化失败:', err);
			}
		});

		const cancelBtn = actions.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * QuickSeedModal — 快速播种弹窗（命令面板调用）。
 */
export class QuickSeedModal extends Modal {
	private seedManager: SeedManager;
	private onDone?: () => void;

	constructor(app: App, seedManager: SeedManager, onDone?: () => void) {
		super(app);
		this.seedManager = seedManager;
		this.onDone = onDone;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('quick-seed-modal');

		contentEl.createEl('h3', { text: '🌱 快速播种' });

		let seedText = '';
		let seedTags = '';

		new Setting(contentEl)
			.setName('种子内容')
			.setDesc('记录你的灵感、想法或待办事项')
			.addTextArea(area => {
				area.setPlaceholder('输入种子内容…')
					.onChange(val => { seedText = val; });
				area.inputEl.rows = 3;
				area.inputEl.style.width = '100%';
				// 自动聚焦
				setTimeout(() => area.inputEl.focus(), 50);
			});

		new Setting(contentEl)
			.setName('标签（可选）')
			.setDesc('用逗号分隔，如：灵感,编程')
			.addText(text => {
				text.setPlaceholder('标签1, 标签2…')
					.onChange(val => { seedTags = val; });
			});

		const actions = contentEl.createDiv({ cls: 'seed-modal-actions' });
		const confirmBtn = actions.createEl('button', { cls: 'mod-cta', text: '播种' });
		confirmBtn.addEventListener('click', async () => {
			if (!seedText.trim()) return;
			try {
				const tags = seedTags
					.split(/[,，]/)
					.map(t => t.trim())
					.filter(t => t.length > 0);
				await this.seedManager.createSeed(seedText, tags.length > 0 ? tags : undefined);
				this.onDone?.();
				this.close();
			} catch (err) {
				console.error('[QuickSeedModal] 播种失败:', err);
			}
		});

		const cancelBtn = actions.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
