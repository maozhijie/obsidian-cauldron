import { App, Modal, Setting } from 'obsidian';
import type { Goal } from '../../types';
import type { GoalManager } from '../../core/goal-manager';

/**
 * GoalModal — 目标创建/编辑弹窗。
 */
export class GoalModal extends Modal {
	private goalManager: GoalManager;
	private editGoal?: Goal;
	private onDone: () => void;

	private goalName = '';
	private targetValue = 0;
	private unit = '';
	private projectId = '';

	constructor(app: App, goalManager: GoalManager, onDone: () => void, editGoal?: Goal) {
		super(app);
		this.goalManager = goalManager;
		this.onDone = onDone;
		this.editGoal = editGoal;

		if (editGoal) {
			this.goalName = editGoal.name;
			this.targetValue = editGoal.targetValue;
			this.unit = editGoal.unit;
			this.projectId = editGoal.projectId ?? '';
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('goal-modal');

		const isEdit = !!this.editGoal;
		contentEl.createEl('h3', { text: isEdit ? '🎯 编辑目标' : '🎯 新建目标' });

		new Setting(contentEl)
			.setName('目标名称')
			.addText(text => {
				text.setPlaceholder('如：阅读 12 本书')
					.setValue(this.goalName)
					.onChange(val => { this.goalName = val.trim(); });
				setTimeout(() => text.inputEl.focus(), 50);
			});

		new Setting(contentEl)
			.setName('目标值')
			.addText(text => {
				text.setPlaceholder('如：12')
					.setValue(this.targetValue > 0 ? String(this.targetValue) : '')
					.onChange(val => {
						const n = parseInt(val, 10);
						this.targetValue = isNaN(n) ? 0 : n;
					});
			});

		new Setting(contentEl)
			.setName('单位')
			.addText(text => {
				text.setPlaceholder('如：本、次、小时')
					.setValue(this.unit)
					.onChange(val => { this.unit = val.trim(); });
			});

		new Setting(contentEl)
			.setName('关联项目（可选）')
			.addText(text => {
				text.setPlaceholder('项目ID')
					.setValue(this.projectId)
					.onChange(val => { this.projectId = val.trim(); });
			});

		const actions = contentEl.createDiv({ cls: 'seed-modal-actions' });

		const confirmBtn = actions.createEl('button', {
			cls: 'mod-cta',
			text: isEdit ? '保存' : '创建',
		});
		confirmBtn.addEventListener('click', async () => {
			if (!this.goalName || this.targetValue <= 0 || !this.unit) return;
			try {
				if (isEdit && this.editGoal) {
					const updated: Goal = {
						...this.editGoal,
						name: this.goalName,
						targetValue: this.targetValue,
						unit: this.unit,
						projectId: this.projectId || undefined,
					};
					await this.goalManager['vaultDataManager'].saveGoal(updated);
				} else {
					await this.goalManager.createGoal(
						this.goalName,
						this.targetValue,
						this.unit,
						this.projectId || undefined,
					);
				}
				this.onDone();
				this.close();
			} catch (err) {
				console.error('[GoalModal] 操作失败:', err);
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
 * GoalProgressModal — 更新目标进度弹窗。
 */
export class GoalProgressModal extends Modal {
	private goal: Goal;
	private goalManager: GoalManager;
	private onDone: () => void;
	private delta = 1;

	constructor(app: App, goal: Goal, goalManager: GoalManager, onDone: () => void) {
		super(app);
		this.goal = goal;
		this.goalManager = goalManager;
		this.onDone = onDone;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: '📈 更新进度' });
		contentEl.createEl('p', {
			text: `${this.goal.name}：${this.goal.currentValue} / ${this.goal.targetValue} ${this.goal.unit}`,
		});

		new Setting(contentEl)
			.setName('增加数量')
			.addText(text => {
				text.setPlaceholder('1')
					.setValue('1')
					.onChange(val => {
						const n = parseFloat(val);
						this.delta = isNaN(n) ? 0 : n;
					});
				setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 50);
			});

		const actions = contentEl.createDiv({ cls: 'seed-modal-actions' });

		const confirmBtn = actions.createEl('button', { cls: 'mod-cta', text: '更新' });
		confirmBtn.addEventListener('click', async () => {
			if (this.delta === 0) return;
			try {
				await this.goalManager.updateProgress(this.goal.id, this.delta);
				this.onDone();
				this.close();
			} catch (err) {
				console.error('[GoalProgressModal] 更新失败:', err);
			}
		});

		const cancelBtn = actions.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
