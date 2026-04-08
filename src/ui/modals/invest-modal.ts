import { App, Modal } from 'obsidian';
import type { PillRecord, Grade } from '../../types';
import { GRADE_COLORS, INVESTMENT_EFFECTS } from '../../constants';
import type { VaultDataManager } from '../../core/vault/vault-data-manager';

/**
 * InvestModal — 投注丹药选择弹窗。
 *
 * 展示可用丹药列表，选中后预览效果，确认后回调投注。
 */
export class InvestModal extends Modal {
	private vaultDataManager: VaultDataManager;
	private targetType: 'project' | 'template' | 'character';
	private targetName: string;
	private onConfirm: (pill: PillRecord) => void | Promise<void>;
	private selectedPill: PillRecord | null = null;

	constructor(
		app: App,
		vaultDataManager: VaultDataManager,
		targetType: 'project' | 'template' | 'character',
		targetName: string,
		onConfirm: (pill: PillRecord) => void | Promise<void>,
	) {
		super(app);
		this.vaultDataManager = vaultDataManager;
		this.targetType = targetType;
		this.targetName = targetName;
		this.onConfirm = onConfirm;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass('invest-modal');

		contentEl.createEl('h3', {
			text: `投注到「${this.targetName}」`,
			cls: 'invest-modal-title',
		});

		const typeLabel = this.targetType === 'project' ? '项目'
			: this.targetType === 'template' ? '模板' : '角色';
		contentEl.createEl('p', {
			text: `选择一颗丹药投注到此${typeLabel}`,
			cls: 'invest-modal-subtitle',
		});

		// 预览区（初始隐藏）
		const previewEl = contentEl.createDiv({ cls: 'invest-preview invest-preview-hidden' });

		// 确认按钮（初始禁用）
		const confirmBtn = contentEl.createEl('button', {
			text: '确认投注',
			cls: 'invest-confirm-btn invest-confirm-disabled',
		});

		// 加载丹药列表
		try {
			const allPills = await this.vaultDataManager.getAllPills();
			const available = allPills.filter((e) => e.pill.投注状态 !== 'invested');

			if (available.length === 0) {
				contentEl.createEl('p', {
					text: '暂无可用丹药。完成每日炼丹后即可获得丹药。',
					cls: 'invest-empty',
				});
				confirmBtn.remove();
				return;
			}

			// 按日期倒序
			available.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

			const listEl = contentEl.createDiv({ cls: 'invest-pill-list' });

			for (const { pill } of available) {
				const row = listEl.createDiv({ cls: 'invest-pill-item' });
				const gradeColor = GRADE_COLORS[pill.品级];
				const purityPct = Math.round(pill.纯度 * 100);

				const gradeTag = row.createSpan({ cls: 'invest-pill-grade' });
				gradeTag.setText(pill.品级);
				gradeTag.style.color = gradeColor;
				gradeTag.style.borderColor = gradeColor;

				row.createSpan({ cls: 'invest-pill-name', text: pill.名称 });
				row.createSpan({ cls: 'invest-pill-purity', text: `${purityPct}%` });

				row.addEventListener('click', () => {
					// Deselect previous
					listEl.querySelectorAll('.invest-pill-item').forEach((el) =>
						el.removeClass('invest-pill-selected'),
					);
					row.addClass('invest-pill-selected');
					this.selectedPill = pill;

					// Update preview
					this.renderPreview(previewEl, pill);
					previewEl.removeClass('invest-preview-hidden');
					confirmBtn.removeClass('invest-confirm-disabled');
				});
			}
		} catch (err) {
			console.error('[InvestModal] 加载丹药失败:', err);
			contentEl.createEl('p', {
				text: '加载丹药列表时出错',
				cls: 'invest-empty',
			});
			confirmBtn.remove();
			return;
		}

		confirmBtn.addEventListener('click', async () => {
			if (!this.selectedPill) return;
			confirmBtn.addClass('invest-confirm-disabled');
			confirmBtn.setText('投注中……');
			try {
				await this.onConfirm(this.selectedPill);
				this.close();
			} catch (e) {
				console.error('[InvestModal] 投注失败:', e);
				confirmBtn.removeClass('invest-confirm-disabled');
				confirmBtn.setText('确认投注');
				this.showError(contentEl, '投注失败，请重试');
			}
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderPreview(el: HTMLElement, pill: PillRecord): void {
		el.empty();
		el.createEl('h4', { text: '预览效果', cls: 'invest-preview-title' });

		const effectText = this.getEffectDescription(pill);
		el.createEl('p', { text: effectText, cls: 'invest-preview-text' });
	}

	private getEffectDescription(pill: PillRecord): string {
		const grade = pill.品级;
		switch (this.targetType) {
			case 'project': {
				const days = INVESTMENT_EFFECTS.project.durationByGrade[grade as Grade] ?? 1;
				return `投注后：稀有度提升 1 级，持续 ${days} 天`;
			}
			case 'template': {
				const mult = INVESTMENT_EFFECTS.template.catalystMultiplierPerLevel;
				return `投注后：守时引倍率 +${mult}，投注等级 +1`;
			}
			case 'character': {
				const weight = INVESTMENT_EFFECTS.character.xpWeightByGrade[grade as Grade] ?? 10;
				const xp = Math.round(weight * pill.纯度);
				return `投注后：角色获得 ${xp} XP`;
			}
			default:
				return '投注丹药';
		}
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
