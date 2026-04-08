import { App, Modal, Setting } from 'obsidian';
import type { Character } from '../../types';

/**
 * CharacterModal — 角色创建/编辑弹窗。
 */
export class CharacterModal extends Modal {
	private characterName: string;
	private onSubmit: (name: string) => void | Promise<void>;
	private isEdit: boolean;

	constructor(
		app: App,
		onSubmit: (name: string) => void | Promise<void>,
		existing?: Character,
	) {
		super(app);
		this.onSubmit = onSubmit;
		this.isEdit = !!existing;
		this.characterName = existing?.name ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', {
			text: this.isEdit ? '编辑角色' : '新建角色',
		});

		new Setting(contentEl)
			.setName('角色名称')
			.addText((text) => {
				text.setPlaceholder('如：剑修·青云')
					.setValue(this.characterName)
					.onChange((value) => {
						this.characterName = value.trim();
					});
			});

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText('保存')
				.setCta()
				.onClick(async () => {
					if (!this.characterName) {
						this.showError(contentEl, '请输入角色名称');
						return;
					}
					try {
						await this.onSubmit(this.characterName);
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
