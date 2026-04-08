import { App, Modal, Setting } from 'obsidian';
import type { TaskTemplate } from '../../types';

/**
 * TemplateModal — 模板创建/编辑弹窗。
 */
export class TemplateModal extends Modal {
	private templateName: string;
	private templateDescription: string;
	private onSubmit: (name: string, description: string) => void | Promise<void>;
	private isEdit: boolean;

	constructor(
		app: App,
		onSubmit: (name: string, description: string) => void | Promise<void>,
		existing?: TaskTemplate,
	) {
		super(app);
		this.onSubmit = onSubmit;
		this.isEdit = !!existing;
		this.templateName = existing?.name ?? '';
		this.templateDescription = existing?.description ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', {
			text: this.isEdit ? '编辑模板' : '新建模板',
		});

		new Setting(contentEl)
			.setName('模板名称')
			.addText((text) => {
				text.setPlaceholder('如：每日复盘')
					.setValue(this.templateName)
					.onChange((value) => {
						this.templateName = value.trim();
					});
			});

		new Setting(contentEl)
			.setName('模板描述')
			.addTextArea((area) => {
				area.setPlaceholder('模板的简要描述……')
					.setValue(this.templateDescription)
					.onChange((value) => {
						this.templateDescription = value.trim();
					});
				area.inputEl.rows = 3;
			});

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText('保存')
				.setCta()
				.onClick(async () => {
					if (!this.templateName) {
						this.showError(contentEl, '请输入模板名称');
						return;
					}
					try {
						await this.onSubmit(this.templateName, this.templateDescription);
						this.close();
					} catch (e) {
						const msg = e instanceof Error ? e.message : '保存失败';
						this.showError(contentEl, msg);
					}
				});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private showError(container: HTMLElement, message: string): void {
		container.querySelector('.dandao-modal-error')?.remove();
		const notice = container.createEl('p', {
			text: message,
			cls: 'dandao-modal-error',
			attr: { style: 'color:var(--text-error);margin-top:4px;' },
		});
		setTimeout(() => notice.remove(), 3000);
	}
}
