import { App, Modal, Setting } from 'obsidian';
import type { DomainTag, Flavor } from '../types';
import { FLAVORS, FLAVOR_COLORS } from '../constants';

/**
 * DomainTagModal — 领域标签创建/编辑的 Modal 对话框。
 */
export class DomainTagModal extends Modal {
	private tagName: string;
	private tagFlavor: Flavor;
	private tagColor: string;
	private onSubmit: (tag: DomainTag) => void | Promise<void>;
	private isEdit: boolean;

	constructor(app: App, onSubmit: (tag: DomainTag) => void | Promise<void>, existingTag?: DomainTag) {
		super(app);
		this.onSubmit = onSubmit;
		this.isEdit = !!existingTag;
		this.tagName = existingTag?.name ?? '';
		this.tagFlavor = existingTag?.flavor ?? FLAVORS[0] ?? '神识';
		this.tagColor = existingTag?.color ?? '';
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', {
			text: this.isEdit ? '编辑领域标签' : '新建领域标签',
		});

		// 名称输入
		new Setting(contentEl)
			.setName('名称')
			.addText((text) => {
				text.setPlaceholder('如：学术写作')
					.setValue(this.tagName)
					.onChange((value) => {
						this.tagName = value.trim();
					});
			});

		// 性味下拉选择
		const flavorSetting = new Setting(contentEl).setName('性味');

		// 色块预览
		const colorPreview = flavorSetting.controlEl.createEl('span', {
			attr: {
				style: `display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:8px;vertical-align:middle;background:${FLAVOR_COLORS[this.tagFlavor]};`,
			},
		});

		flavorSetting.addDropdown((dropdown) => {
			for (const f of FLAVORS) {
				dropdown.addOption(f, f);
			}
			dropdown.setValue(this.tagFlavor);
			dropdown.onChange((value) => {
				this.tagFlavor = value as Flavor;
				colorPreview.style.background = FLAVOR_COLORS[this.tagFlavor];
			});
		});

		// 颜色输入（可选）
		new Setting(contentEl)
			.setName('颜色')
			.setDesc('自定义显示颜色，留空则使用性味默认色')
			.addText((text) => {
				text.setPlaceholder('#4a90d9')
					.setValue(this.tagColor)
					.onChange((value) => {
						this.tagColor = value.trim();
					});
			});

		// 确认按钮
		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText('保存')
				.setCta()
				.onClick(async () => {
					if (!this.tagName) {
						this.showError(contentEl, '请输入标签名称');
						return;
					}

					const tag: DomainTag = {
						name: this.tagName,
						flavor: this.tagFlavor,
					};
					if (this.tagColor) {
						tag.color = this.tagColor;
					}

					try {
						await this.onSubmit(tag);
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
		// 移除已有的错误提示
		container.querySelector('.dandao-modal-error')?.remove();
		const notice = container.createEl('p', {
			text: message,
			cls: 'dandao-modal-error',
			attr: { style: 'color:var(--text-error);margin-top:4px;' },
		});
		setTimeout(() => notice.remove(), 3000);
	}
}
