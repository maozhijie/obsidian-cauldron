import { App, Modal } from 'obsidian';
import type { PillRecord, DailyLogFrontmatter, PillPattern, Flavor } from '../types';
import { GRADE_COLORS, FLAVOR_ICONS } from '../constants';
import type { VaultDataManager } from '../core/vault/vault-data-manager';
import { analyzeCompatibility, type CompatibilityResult } from '../core/compatibility-engine';

/**
 * FurnaceModal — 开炉展示界面，以仪式感方式展示炼成的丹药。
 */
export class FurnaceModal extends Modal {
	private vaultDataManager: VaultDataManager;
	private pill: PillRecord;
	private dateKey: string;
	private dailyLog?: DailyLogFrontmatter;

	constructor(
		app: App,
		vaultDataManager: VaultDataManager,
		pill: PillRecord,
		dateKey: string,
		dailyLog?: DailyLogFrontmatter,
	) {
		super(app);
		this.vaultDataManager = vaultDataManager;
		this.pill = pill;
		this.dateKey = dateKey;
		this.dailyLog = dailyLog;
	}

	onOpen(): void {
		const { contentEl } = this;
		const pill = this.pill;
		const gradeColor = GRADE_COLORS[pill.品级];
		const purityPct = Math.round(pill.纯度 * 100);

		// 容器
		const container = contentEl.createDiv({ cls: 'furnace-container' });

		// 背景光效
		const glow = container.createDiv({ cls: 'furnace-glow' });
		glow.style.background = `radial-gradient(ellipse at center, ${gradeColor}33 0%, transparent 70%)`;

		// 丹药展示区
		const pillDisplay = container.createDiv({ cls: 'furnace-pill-display' });

		// 品级徽章
		const badge = pillDisplay.createDiv({ cls: 'pill-grade-badge' });
		badge.setText(pill.品级);
		badge.style.color = gradeColor;
		badge.style.borderColor = gradeColor;

		// 丹药名称
		const nameEl = pillDisplay.createEl('h2', { cls: 'pill-name' });
		nameEl.setText(`【${pill.主性味}·${pill.品级}】${pill.名称}`);
		nameEl.style.color = gradeColor;

		// 描述文案
		const descEl = pillDisplay.createEl('p', { cls: 'pill-description' });
		descEl.setText(this.generateDescription(pill));

		// 关键数据
		const stats = container.createDiv({ cls: 'furnace-stats' });

		this.createStatItem(stats, '药材总量', `${pill.药材总量} 份`);
		this.createStatItem(stats, '纯度', `${purityPct}%`);

		// 药引统计（如果有日志数据）
		if (this.dailyLog && this.dailyLog.药引.length > 0) {
			const focusCount = this.dailyLog.药引
				.filter((c) => c.类型 === '专注引')
				.reduce((sum, c) => sum + c.数量, 0);
			if (focusCount > 0) {
				this.createStatItem(stats, '专注引', `${focusCount} 次`);
			}
		}

		// 药材详情（如果有日志数据）
		if (this.dailyLog && this.dailyLog.药材.length > 0) {
			const details = container.createDiv({ cls: 'furnace-details' });
			details.createEl('h4').setText('炼丹材料');

			const detailList = details.createDiv({ cls: 'detail-list' });
			for (const herb of this.dailyLog.药材) {
				const item = detailList.createDiv({ cls: 'detail-item' });
				const icon = (FLAVOR_ICONS as Record<string, string>)[herb.领域] ?? '🌿';
				item.setText(`${icon} ${herb.领域} x${herb.数量}`);
			}

			// 配伍分析
			this.renderCompatibilityAnalysis(container, this.dailyLog);
		}

		// 丹纹展示
		if (pill.丹纹) {
			this.renderPatternDisplay(container, pill.丹纹, gradeColor);
		}

		// 丹炉经验获取
		this.renderXpGain(container, pill);

		// 操作区
		const actions = container.createDiv({ cls: 'furnace-actions' });
		const closeBtn = actions.createEl('button', { cls: 'furnace-close-btn' });
		closeBtn.setText('收入丹囊');
		closeBtn.addEventListener('click', async () => {
			await this.vaultDataManager.markPillViewed(this.dateKey);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderCompatibilityAnalysis(container: HTMLElement, dailyLog: DailyLogFrontmatter): void {
		// Build a simple flavorMap from herbs
		const flavorMap: Record<string, Flavor> = {};
		// Use pill data to infer flavors - 君药 and 臣药
		if (this.pill.主性味 && this.pill.君药领域) {
			flavorMap[this.pill.君药领域] = this.pill.主性味;
		}
		if (this.pill.辅性味 && this.pill.臣药领域) {
			flavorMap[this.pill.臣药领域] = this.pill.辅性味;
		}

		const result = analyzeCompatibility(dailyLog.药材, flavorMap);

		if (!result.hasConflict && !result.hasHarmony) return;

		const section = container.createDiv({ cls: 'furnace-compat' });
		section.style.position = 'relative';
		section.style.zIndex = '1';

		const title = section.createEl('h4');
		title.setText('配伍分析');

		if (result.hasHarmony) {
			const harmonyEl = section.createDiv({ cls: 'compat-harmony' });
			harmonyEl.setText(`☯ 冲和！${result.harmonyBonus ?? '阴阳调和'} — 品级+${result.gradeBonus}`);
		}

		if (result.hasConflict && !result.hasHarmony) {
			for (const pair of result.conflictPairs) {
				const conflictEl = section.createDiv({ cls: 'compat-conflict' });
				conflictEl.setText(`⚡ ${pair.a} ↔ ${pair.b} 相冲 — 品级-${result.gradePenalty}`);
			}
		}
	}

	private renderPatternDisplay(container: HTMLElement, pattern: PillPattern, gradeColor: string): void {
		const section = container.createDiv({ cls: 'furnace-pattern' });
		section.style.position = 'relative';
		section.style.zIndex = '1';

		const rarityColors: Record<string, string> = {
			common: '#2196F3',
			rare: '#9C27B0',
			legendary: '#FF9800',
		};
		const rarityLabels: Record<string, string> = {
			common: '普通',
			rare: '稀有',
			legendary: '传说',
		};
		const color = rarityColors[pattern.rarity] ?? gradeColor;

		const badge = section.createDiv({ cls: `furnace-pattern-badge pattern-${pattern.rarity}` });
		badge.style.borderColor = color;
		badge.style.color = color;

		badge.createEl('span', { cls: 'pattern-icon' }).setText('✦');
		badge.createEl('span', { cls: 'pattern-name' }).setText(pattern.name);
		badge.createEl('span', { cls: 'pattern-rarity-tag' }).setText(rarityLabels[pattern.rarity] ?? '');

		section.createEl('p', { cls: 'pattern-desc' }).setText(pattern.description);
		section.createEl('p', { cls: 'pattern-effect' }).setText(`效果：${pattern.effect}`);
	}

	private renderXpGain(container: HTMLElement, pill: PillRecord): void {
		const GRADE_XP: Record<string, number> = {
			'凡品': 0, '灵品': 5, '宝品': 15, '神品': 30,
		};
		const herbCount = pill.药材总量;
		const gradeXp = GRADE_XP[pill.品级] ?? 0;
		const totalXp = herbCount + gradeXp;

		if (totalXp <= 0) return;

		const section = container.createDiv({ cls: 'furnace-xp-gain' });
		section.style.position = 'relative';
		section.style.zIndex = '1';

		section.createEl('span', { cls: 'xp-gain-icon' }).setText('⬆');
		section.createEl('span', { cls: 'xp-gain-text' }).setText(
			`丹炉经验 +${totalXp} (药材${herbCount} + 品级${gradeXp})`,
		);
	}

	private generateDescription(pill: PillRecord): string {
		const gradeDesc: Record<string, string> = {
			'凡品': '火候平平',
			'灵品': '灵气初显',
			'宝品': '宝光内蕴',
			'神品': '神华天成',
		};
		let desc = `此丹以${pill.君药领域}为君药，${pill.主性味}之气为主导`;
		if (pill.臣药领域 && pill.辅性味) {
			desc += `，以${pill.臣药领域}为臣，${pill.辅性味}相调`;
		}
		desc += `。${gradeDesc[pill.品级]}，纯度${Math.round(pill.纯度 * 100)}%。`;
		return desc;
	}

	private createStatItem(parent: HTMLElement, label: string, value: string): void {
		const item = parent.createDiv({ cls: 'stat-item' });
		item.createSpan({ cls: 'stat-label' }).setText(label);
		item.createSpan({ cls: 'stat-value' }).setText(value);
	}
}

/**
 * PillListModal — 历史丹药列表模态框。
 */
export class PillListModal extends Modal {
	private vaultDataManager: VaultDataManager;

	constructor(app: App, vaultDataManager: VaultDataManager) {
		super(app);
		this.vaultDataManager = vaultDataManager;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;

		contentEl.createEl('h2', { cls: 'pill-list-title' }).setText('丹囊 · 历史丹药');

		const allPills = await this.vaultDataManager.getAllPills();

		if (allPills.length === 0) {
			contentEl.createEl('p', { cls: 'pill-list-empty' }).setText(
				'尚无丹药记录。完成任务并等待每日封炉后即可获得丹药。',
			);
			return;
		}

		// 按日期倒序
		allPills.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

		const listContainer = contentEl.createDiv({ cls: 'pill-list-container' });

		for (const { dateKey, pill } of allPills) {
			const row = listContainer.createDiv({ cls: 'pill-list-item' });
			const gradeColor = GRADE_COLORS[pill.品级];
			const purityPct = Math.round(pill.纯度 * 100);

			row.createSpan({ cls: 'pill-date' }).setText(dateKey);

			const nameSpan = row.createSpan({ cls: 'pill-name' });
			nameSpan.setText(`【${pill.主性味}·${pill.品级}】${pill.名称}`);
			nameSpan.style.color = gradeColor;

			row.createSpan({ cls: 'pill-grade' }).setText(pill.品级);
			row.createSpan({ cls: 'pill-purity' }).setText(`${purityPct}%`);

			// 点击打开详细 FurnaceModal
			row.addEventListener('click', async () => {
				const dailyLog = await this.vaultDataManager.getDailyLog(dateKey);
				this.close();
				const furnaceModal = new FurnaceModal(
					this.app,
					this.vaultDataManager,
					pill,
					dateKey,
					dailyLog ?? undefined,
				);
				furnaceModal.open();
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
