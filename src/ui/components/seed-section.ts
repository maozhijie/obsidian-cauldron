import type { Seed, Goal } from '../../types';
import type { ViewSection, SectionContext } from './section-base';
import { SeedManager } from '../../core/seed-manager';
import { GoalManager } from '../../core/goal-manager';
import { SeedConvertModal } from '../modals/seed-modal';
import { GoalModal, GoalProgressModal } from '../modals/goal-modal';

/**
 * SeedSection — 种子池 Tab 完整视图。
 * 包含：快速输入框、待处理种子列表、历史折叠区、目标管理。
 */
export class SeedSection implements ViewSection {
	async render(ctx: SectionContext): Promise<void> {
		const { container, vaultDataManager } = ctx;
		if (!vaultDataManager) {
			container.createDiv({ cls: 'dandao-empty' }).setText('数据管理器未就绪');
			return;
		}

		const app = vaultDataManager.getApp();
		const seedManager = new SeedManager(vaultDataManager);
		const goalManager = new GoalManager(vaultDataManager);

		const rerender = async () => {
			container.empty();
			await this.renderContent(container, app, seedManager, goalManager);
		};

		await this.renderContent(container, app, seedManager, goalManager);
	}

	private async renderContent(
		container: HTMLElement,
		app: import('obsidian').App,
		seedManager: SeedManager,
		goalManager: GoalManager,
	): Promise<void> {
		const rerender = async () => {
			container.empty();
			await this.renderContent(container, app, seedManager, goalManager);
		};

		// 快速播种区
		this.renderQuickInput(container, seedManager, rerender);

		// 获取所有种子
		let allSeeds: Seed[] = [];
		try {
			allSeeds = await seedManager.getAllSeeds();
		} catch { /* empty */ }

		const pending = allSeeds.filter(s => s.status === 'pending');
		const converted = allSeeds.filter(s => s.status === 'converted');
		const discarded = allSeeds.filter(s => s.status === 'discarded');

		// 种子池列表
		this.renderPendingSeeds(container, pending, app, seedManager, rerender);

		// 已转化/丢弃折叠区
		if (converted.length > 0 || discarded.length > 0) {
			this.renderHistorySection(container, converted, discarded);
		}

		// 目标区
		await this.renderGoalSection(container, app, goalManager, rerender);
	}

	/** 快速播种输入框 */
	private renderQuickInput(
		container: HTMLElement,
		seedManager: SeedManager,
		rerender: () => Promise<void>,
	): void {
		const section = container.createDiv({ cls: 'dandao-section seed-quick-input' });
		section.createEl('h5', { text: '🌱 快速播种' });

		const inputRow = section.createDiv({ cls: 'seed-input-row' });
		const input = inputRow.createEl('input', {
			type: 'text',
			placeholder: '记录一个灵感种子…',
			cls: 'seed-input',
		});

		const btn = inputRow.createEl('button', { text: '播种', cls: 'seed-plant-btn' });

		const doPlant = async () => {
			const text = input.value.trim();
			if (!text) return;
			try {
				await seedManager.createSeed(text);
				input.value = '';
				await rerender();
			} catch (err) {
				console.error('[SeedSection] 播种失败:', err);
			}
		};

		btn.addEventListener('click', doPlant);
		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				doPlant();
			}
		});
	}

	/** 待处理种子列表 */
	private renderPendingSeeds(
		container: HTMLElement,
		seeds: Seed[],
		app: import('obsidian').App,
		seedManager: SeedManager,
		rerender: () => Promise<void>,
	): void {
		const section = container.createDiv({ cls: 'dandao-section' });
		section.createEl('h5', { text: `🌿 种子池 (${seeds.length})` });

		if (seeds.length === 0) {
			section.createDiv({ cls: 'dandao-empty' }).setText('暂无待处理种子。播种一些灵感吧！');
			return;
		}

		const list = section.createDiv({ cls: 'seed-list' });

		for (const seed of seeds) {
			const card = list.createDiv({ cls: 'seed-card' });

			const cardBody = card.createDiv({ cls: 'seed-card-body' });
			cardBody.createEl('p', { text: seed.text, cls: 'seed-card-text' });

			const meta = cardBody.createDiv({ cls: 'seed-card-meta' });
			meta.createSpan({ text: seed.createdDate, cls: 'seed-card-date' });

			if (seed.tags && seed.tags.length > 0) {
				const tagsEl = meta.createSpan({ cls: 'seed-card-tags' });
				for (const tag of seed.tags) {
					tagsEl.createSpan({ text: `#${tag}`, cls: 'dandao-tag' });
				}
			}

			// 判断是否过期（超过7天）
			const daysDiff = this.getDaysDiff(seed.createdDate);
			if (daysDiff >= 7) {
				card.addClass('seed-stale');
				meta.createSpan({ text: `⚠ ${daysDiff}天前`, cls: 'seed-stale-badge' });
			}

			const cardActions = card.createDiv({ cls: 'seed-card-actions' });

			const convertBtn = cardActions.createEl('button', { text: '转化', cls: 'seed-action-btn seed-convert-btn' });
			convertBtn.addEventListener('click', () => {
				new SeedConvertModal(app, seed, seedManager, rerender).open();
			});

			const discardBtn = cardActions.createEl('button', { text: '丢弃', cls: 'seed-action-btn seed-discard-btn' });
			discardBtn.addEventListener('click', async () => {
				try {
					await seedManager.discardSeed(seed.id);
					await rerender();
				} catch (err) {
					console.error('[SeedSection] 丢弃种子失败:', err);
				}
			});
		}
	}

	/** 已转化/丢弃历史折叠区 */
	private renderHistorySection(
		container: HTMLElement,
		converted: Seed[],
		discarded: Seed[],
	): void {
		const section = container.createDiv({ cls: 'dandao-section seed-history' });
		const toggle = section.createDiv({ cls: 'seed-history-toggle' });
		toggle.createSpan({ text: `📜 历史记录 (${converted.length + discarded.length})` });
		const arrow = toggle.createSpan({ text: '▸', cls: 'seed-history-arrow' });

		const historyContent = section.createDiv({ cls: 'seed-history-content' });
		historyContent.style.display = 'none';

		let expanded = false;
		toggle.addEventListener('click', () => {
			expanded = !expanded;
			historyContent.style.display = expanded ? 'block' : 'none';
			arrow.setText(expanded ? '▾' : '▸');
		});

		if (converted.length > 0) {
			historyContent.createEl('h6', { text: `✅ 已转化 (${converted.length})` });
			const cList = historyContent.createDiv({ cls: 'seed-history-list' });
			for (const seed of converted) {
				const item = cList.createDiv({ cls: 'seed-history-item seed-converted' });
				item.createSpan({ text: seed.text, cls: 'seed-history-text' });
				if (seed.convertedTaskPath) {
					item.createSpan({ text: `→ ${seed.convertedTaskPath}`, cls: 'seed-history-path' });
				}
			}
		}

		if (discarded.length > 0) {
			historyContent.createEl('h6', { text: `🗑 已丢弃 (${discarded.length})` });
			const dList = historyContent.createDiv({ cls: 'seed-history-list' });
			for (const seed of discarded) {
				const item = dList.createDiv({ cls: 'seed-history-item seed-discarded' });
				item.createSpan({ text: seed.text, cls: 'seed-history-text' });
			}
		}
	}

	/** 目标区 */
	private async renderGoalSection(
		container: HTMLElement,
		app: import('obsidian').App,
		goalManager: GoalManager,
		rerender: () => Promise<void>,
	): Promise<void> {
		const section = container.createDiv({ cls: 'dandao-section' });
		const header = section.createDiv({ cls: 'seed-goal-header' });
		header.createEl('h5', { text: '🎯 目标' });

		const addBtn = header.createEl('button', { text: '+ 新建', cls: 'seed-goal-add-btn' });
		addBtn.addEventListener('click', () => {
			new GoalModal(app, goalManager, rerender).open();
		});

		let activeGoals: Goal[] = [];
		let completedGoals: Goal[] = [];
		try {
			activeGoals = await goalManager.getActiveGoals();
			completedGoals = await goalManager.getCompletedGoals();
		} catch { /* empty */ }

		if (activeGoals.length === 0 && completedGoals.length === 0) {
			section.createDiv({ cls: 'dandao-empty' }).setText('暂无目标。设定一个目标激励自己吧！');
			return;
		}

		const goalList = section.createDiv({ cls: 'seed-goal-list' });

		for (const goal of activeGoals) {
			this.renderGoalCard(goalList, goal, app, goalManager, rerender, false);
		}

		for (const goal of completedGoals) {
			this.renderGoalCard(goalList, goal, app, goalManager, rerender, true);
		}
	}

	/** 单个目标卡片 */
	private renderGoalCard(
		parent: HTMLElement,
		goal: Goal,
		app: import('obsidian').App,
		goalManager: GoalManager,
		rerender: () => Promise<void>,
		isCompleted: boolean,
	): void {
		const card = parent.createDiv({ cls: `seed-goal-card${isCompleted ? ' seed-goal-done' : ''}` });

		const info = card.createDiv({ cls: 'seed-goal-info' });
		info.createSpan({ text: goal.name, cls: 'seed-goal-name' });
		info.createSpan({
			text: `${goal.currentValue} / ${goal.targetValue} ${goal.unit}`,
			cls: 'seed-goal-progress-text',
		});

		// 进度条
		const barWrapper = card.createDiv({ cls: 'seed-goal-bar-wrapper' });
		const bar = barWrapper.createDiv({ cls: 'seed-goal-bar' });
		const pct = Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
		bar.style.width = `${pct}%`;
		if (isCompleted) bar.addClass('seed-goal-bar-done');

		if (!isCompleted) {
			const actions = card.createDiv({ cls: 'seed-goal-actions' });

			const progressBtn = actions.createEl('button', { text: '+1', cls: 'seed-action-btn' });
			progressBtn.addEventListener('click', () => {
				new GoalProgressModal(app, goal, goalManager, rerender).open();
			});

			const delBtn = actions.createEl('button', { text: '删除', cls: 'seed-action-btn seed-discard-btn' });
			delBtn.addEventListener('click', async () => {
				try {
					await goalManager.removeGoal(goal.id);
					await rerender();
				} catch (err) {
					console.error('[SeedSection] 删除目标失败:', err);
				}
			});
		}
	}

	/** 计算天数差 */
	private getDaysDiff(dateStr: string): number {
		const now = new Date();
		const created = new Date(dateStr);
		return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
	}
}
