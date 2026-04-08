import { App, Modal, Setting } from 'obsidian';
import type { Project } from '../../types';

/**
 * ProjectModal — 项目创建/编辑弹窗。
 */
export class ProjectModal extends Modal {
	private projectName: string;
	private projectDescription: string;
	private onSubmit: (name: string, description: string) => void | Promise<void>;
	private isEdit: boolean;

	constructor(
		app: App,
		onSubmit: (name: string, description: string) => void | Promise<void>,
		existing?: Project,
	) {
		super(app);
		this.onSubmit = onSubmit;
		this.isEdit = !!existing;
		this.projectName = existing?.name ?? '';
		this.projectDescription = existing?.description ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', {
			text: this.isEdit ? '编辑项目' : '新建项目',
		});

		new Setting(contentEl)
			.setName('项目名称')
			.addText((text) => {
				text.setPlaceholder('如：毕业论文')
					.setValue(this.projectName)
					.onChange((value) => {
						this.projectName = value.trim();
					});
			});

		new Setting(contentEl)
			.setName('项目描述')
			.addTextArea((area) => {
				area.setPlaceholder('项目的简要描述……')
					.setValue(this.projectDescription)
					.onChange((value) => {
						this.projectDescription = value.trim();
					});
				area.inputEl.rows = 3;
			});

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText('保存')
				.setCta()
				.onClick(async () => {
					if (!this.projectName) {
						this.showError(contentEl, '请输入项目名称');
						return;
					}
					try {
						await this.onSubmit(this.projectName, this.projectDescription);
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
