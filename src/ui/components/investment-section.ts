import type { ViewSection, SectionContext } from './section-base';
import type {
	Project,
	TaskTemplate,
	Character,
	InvestmentRecord,
	PillRecord,
} from '../../types';
import type { VaultDataManager } from '../../core/vault/vault-data-manager';
import { GRADE_COLORS } from '../../constants';
import { ProjectModal } from '../modals/project-modal';
import { TemplateModal } from '../modals/template-modal';
import { CharacterModal } from '../modals/character-modal';
import { InvestModal } from '../modals/invest-modal';

/**
 * InvestmentSection — 投注系统 Tab 主界面。
 *
 * 三栏布局：项目 / 模板 / 角色，含新建、投注操作及投注历史摘要。
 */
export class InvestmentSection implements ViewSection {
	private ctx: SectionContext | null = null;

	async render(ctx: SectionContext): Promise<void> {
		this.ctx = ctx;
		const vdm = ctx.vaultDataManager;
		if (!vdm) {
			ctx.container.createEl('p', {
				text: '数据管理器未就绪',
				cls: 'dandao-empty',
			});
			return;
		}

		const root = ctx.container.createDiv({ cls: 'invest-section' });

		// 三栏布局容器
		const columns = root.createDiv({ cls: 'invest-columns' });

		try {
			const [projects, templates, characters, records] = await Promise.all([
				vdm.getProjects(),
				vdm.getTemplates(),
				vdm.getCharacters(),
				vdm.getInvestmentRecords(),
			]);

			this.renderProjectColumn(columns, projects, vdm);
			this.renderTemplateColumn(columns, templates, vdm);
			this.renderCharacterColumn(columns, characters, vdm);

			// 投注历史摘要
			this.renderHistorySummary(root, records);
		} catch (err) {
			console.error('[InvestmentSection] render 失败:', err);
			root.createEl('p', {
				text: '加载投注数据时出错',
				cls: 'dandao-empty',
			});
		}
	}

	dispose(): void {
		this.ctx = null;
	}

	// ================================================================
	// 项目栏
	// ================================================================

	private renderProjectColumn(
		parent: HTMLElement,
		projects: Project[],
		vdm: VaultDataManager,
	): void {
		const col = parent.createDiv({ cls: 'invest-column' });

		const header = col.createDiv({ cls: 'invest-col-header' });
		header.createEl('h5', { text: '📋 项目' });
		const addBtn = header.createEl('button', {
			text: '+ 新建',
			cls: 'invest-add-btn',
		});
		addBtn.addEventListener('click', () => {
			this.openProjectModal(vdm);
		});

		const list = col.createDiv({ cls: 'invest-card-list' });

		if (projects.length === 0) {
			list.createEl('p', {
				text: '暂无项目',
				cls: 'dandao-empty',
			});
			return;
		}

		for (const project of projects) {
			this.renderProjectCard(list, project, vdm);
		}
	}

	private renderProjectCard(
		parent: HTMLElement,
		project: Project,
		vdm: VaultDataManager,
	): void {
		const card = parent.createDiv({ cls: 'invest-card' });

		const titleRow = card.createDiv({ cls: 'invest-card-title-row' });
		titleRow.createSpan({ text: project.name, cls: 'invest-card-name' });

		const statusTag = titleRow.createSpan({ cls: 'invest-card-status' });
		statusTag.setText(project.isActive ? '进行中' : '已完成');
		if (project.isActive) statusTag.addClass('invest-status-active');

		if (project.description) {
			card.createEl('p', {
				text: project.description,
				cls: 'invest-card-desc',
			});
		}

		// 活跃增益
		const now = Date.now();
		const activeBoosts = project.boosts.filter(
			(b) => new Date(b.expiryDate).getTime() > now,
		);
		if (activeBoosts.length > 0) {
			const boostEl = card.createDiv({ cls: 'invest-card-boosts' });
			for (const boost of activeBoosts) {
				const remaining = Math.ceil(
					(new Date(boost.expiryDate).getTime() - now) / (1000 * 60 * 60 * 24),
				);
				boostEl.createSpan({
					text: `🔥 ${boost.pillName} — 剩余${remaining}天`,
					cls: 'invest-boost-tag',
				});
			}
		}

		const investBtn = card.createEl('button', {
			text: '投注丹药',
			cls: 'invest-card-btn',
		});
		investBtn.addEventListener('click', () => {
			this.openInvestModal('project', project.id, project.name, vdm);
		});
	}

	// ================================================================
	// 模板栏
	// ================================================================

	private renderTemplateColumn(
		parent: HTMLElement,
		templates: TaskTemplate[],
		vdm: VaultDataManager,
	): void {
		const col = parent.createDiv({ cls: 'invest-column' });

		const header = col.createDiv({ cls: 'invest-col-header' });
		header.createEl('h5', { text: '📝 模板' });
		const addBtn = header.createEl('button', {
			text: '+ 新建',
			cls: 'invest-add-btn',
		});
		addBtn.addEventListener('click', () => {
			this.openTemplateModal(vdm);
		});

		const list = col.createDiv({ cls: 'invest-card-list' });

		if (templates.length === 0) {
			list.createEl('p', {
				text: '暂无模板',
				cls: 'dandao-empty',
			});
			return;
		}

		for (const tpl of templates) {
			this.renderTemplateCard(list, tpl, vdm);
		}
	}

	private renderTemplateCard(
		parent: HTMLElement,
		tpl: TaskTemplate,
		vdm: VaultDataManager,
	): void {
		const card = parent.createDiv({ cls: 'invest-card' });

		const titleRow = card.createDiv({ cls: 'invest-card-title-row' });
		titleRow.createSpan({ text: tpl.name, cls: 'invest-card-name' });
		titleRow.createSpan({
			text: `Lv.${tpl.investmentLevel}`,
			cls: 'invest-card-level',
		});

		if (tpl.description) {
			card.createEl('p', {
				text: tpl.description,
				cls: 'invest-card-desc',
			});
		}

		const metaEl = card.createDiv({ cls: 'invest-card-meta' });
		metaEl.createSpan({
			text: `累计投注 ${tpl.totalInvestments} 次`,
			cls: 'invest-meta-text',
		});

		const investBtn = card.createEl('button', {
			text: '投注丹药',
			cls: 'invest-card-btn',
		});
		investBtn.addEventListener('click', () => {
			this.openInvestModal('template', tpl.id, tpl.name, vdm);
		});
	}

	// ================================================================
	// 角色栏
	// ================================================================

	private renderCharacterColumn(
		parent: HTMLElement,
		characters: Character[],
		vdm: VaultDataManager,
	): void {
		const col = parent.createDiv({ cls: 'invest-column' });

		const header = col.createDiv({ cls: 'invest-col-header' });
		header.createEl('h5', { text: '🧑‍🎤 角色' });
		const addBtn = header.createEl('button', {
			text: '+ 新建',
			cls: 'invest-add-btn',
		});
		addBtn.addEventListener('click', () => {
			this.openCharacterModal(vdm);
		});

		const list = col.createDiv({ cls: 'invest-card-list' });

		if (characters.length === 0) {
			list.createEl('p', {
				text: '暂无角色',
				cls: 'dandao-empty',
			});
			return;
		}

		for (const char of characters) {
			this.renderCharacterCard(list, char, vdm);
		}
	}

	private renderCharacterCard(
		parent: HTMLElement,
		char: Character,
		vdm: VaultDataManager,
	): void {
		const card = parent.createDiv({ cls: 'invest-card' });

		const titleRow = card.createDiv({ cls: 'invest-card-title-row' });
		titleRow.createSpan({ text: char.name, cls: 'invest-card-name' });
		titleRow.createSpan({
			text: `Lv.${char.level}`,
			cls: 'invest-card-level',
		});

		// XP 进度条
		const xpBar = card.createDiv({ cls: 'invest-xp-bar' });
		const xpFill = xpBar.createDiv({ cls: 'invest-xp-fill' });
		const nextLevelXp = this.getNextLevelXp(char.level);
		const progress = nextLevelXp > 0
			? Math.min((char.xp / nextLevelXp) * 100, 100)
			: 100;
		xpFill.style.width = `${progress}%`;

		card.createDiv({ cls: 'invest-card-meta' }).createSpan({
			text: `XP: ${char.xp}${nextLevelXp > 0 ? ` / ${nextLevelXp}` : ' (MAX)'}`,
			cls: 'invest-meta-text',
		});

		const investBtn = card.createEl('button', {
			text: '投注丹药',
			cls: 'invest-card-btn',
		});
		investBtn.addEventListener('click', () => {
			this.openInvestModal('character', char.id, char.name, vdm);
		});
	}

	// ================================================================
	// 投注历史摘要
	// ================================================================

	private renderHistorySummary(
		parent: HTMLElement,
		records: InvestmentRecord[],
	): void {
		if (records.length === 0) return;

		const section = parent.createDiv({ cls: 'dandao-section invest-history' });
		section.createEl('h5', { text: '近期投注' });

		const recent = records.slice(-5).reverse();
		const list = section.createDiv({ cls: 'invest-history-list' });

		for (const rec of recent) {
			const row = list.createDiv({ cls: 'invest-history-item' });

			const typeIcon = rec.type === 'project' ? '📋'
				: rec.type === 'template' ? '📝' : '🧑‍🎤';
			row.createSpan({ text: typeIcon, cls: 'invest-history-icon' });
			row.createSpan({ text: rec.targetName, cls: 'invest-history-target' });

			const pillTag = row.createSpan({ cls: 'invest-history-pill' });
			const gradeColor = GRADE_COLORS[rec.pillRecord.品级];
			pillTag.setText(rec.pillRecord.名称);
			pillTag.style.color = gradeColor;

			const dateStr = rec.investDate.slice(0, 10);
			row.createSpan({ text: dateStr, cls: 'invest-history-date' });
		}
	}

	// ================================================================
	// Modal 打开辅助
	// ================================================================

	private getApp(): import('obsidian').App | null {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const vdm = this.ctx?.vaultDataManager as any;
		return vdm?.app ?? vdm?.['app'] ?? null;
	}

	private openProjectModal(vdm: VaultDataManager): void {
		const app = this.getApp();
		if (!app) return;
		new ProjectModal(app, async (name, desc) => {
			try {
				await vdm.saveProject({
					id: this.generateId(),
					name,
					description: desc,
					isActive: true,
					createdDate: new Date().toISOString(),
					boosts: [],
				});
				await this.refresh();
			} catch (err) {
				console.error('[InvestmentSection] 创建项目失败:', err);
			}
		}).open();
	}

	private openTemplateModal(vdm: VaultDataManager): void {
		const app = this.getApp();
		if (!app) return;
		new TemplateModal(app, async (name, desc) => {
			try {
				await vdm.saveTemplate({
					id: this.generateId(),
					name,
					description: desc,
					investmentLevel: 0,
					totalInvestments: 0,
				});
				await this.refresh();
			} catch (err) {
				console.error('[InvestmentSection] 创建模板失败:', err);
			}
		}).open();
	}

	private openCharacterModal(vdm: VaultDataManager): void {
		const app = this.getApp();
		if (!app) return;
		new CharacterModal(app, async (name) => {
			try {
				await vdm.saveCharacter({
					id: this.generateId(),
					name,
					xp: 0,
					level: 1,
				});
				await this.refresh();
			} catch (err) {
				console.error('[InvestmentSection] 创建角色失败:', err);
			}
		}).open();
	}

	private openInvestModal(
		type: 'project' | 'template' | 'character',
		targetId: string,
		targetName: string,
		vdm: VaultDataManager,
	): void {
		const app = this.getApp();
		if (!app) return;
		new InvestModal(app, vdm, type, targetName, async (pill: PillRecord) => {
			try {
				// 直接通过 vaultDataManager 进行投注操作
				await this.performInvest(vdm, type, targetId, pill);
				await this.refresh();
			} catch (err) {
				console.error('[InvestmentSection] 投注失败:', err);
			}
		}).open();
	}

	/**
	 * 执行投注：更新目标数据 + 标记丹药为已投注 + 写入投注记录。
	 */
	private async performInvest(
		vdm: VaultDataManager,
		type: 'project' | 'template' | 'character',
		targetId: string,
		pill: PillRecord,
	): Promise<void> {
		let targetName = '';

		if (type === 'project') {
			const projects = await vdm.getProjects();
			const project = projects.find((p) => p.id === targetId);
			if (project) {
				targetName = project.name;
				const durationMap: Record<string, number> = {
					'凡品': 1, '灵品': 3, '宝品': 5, '神品': 7,
				};
				const days = durationMap[pill.品级] ?? 1;
				const now = new Date();
				const expiry = new Date(now);
				expiry.setDate(expiry.getDate() + days);
				project.boosts.push({
					pillName: pill.名称,
					investDate: now.toISOString(),
					expiryDate: expiry.toISOString(),
					effect: 'rarity+1',
				});
				await vdm.saveProject(project);
			}
		} else if (type === 'template') {
			const templates = await vdm.getTemplates();
			const tpl = templates.find((t) => t.id === targetId);
			if (tpl) {
				targetName = tpl.name;
				tpl.totalInvestments += 1;
				tpl.investmentLevel += 1;
				await vdm.saveTemplate(tpl);
			}
		} else if (type === 'character') {
			const characters = await vdm.getCharacters();
			const char = characters.find((c) => c.id === targetId);
			if (char) {
				targetName = char.name;
				const weightMap: Record<string, number> = {
					'凡品': 10, '灵品': 25, '宝品': 50, '神品': 100,
				};
				const weight = weightMap[pill.品级] ?? 10;
				char.xp += Math.round(weight * pill.纯度);
				// Recalculate level
				const levelTable: number[] = [0, 0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500];
				let level = 1;
				for (let i = levelTable.length - 1; i >= 1; i--) {
					if (char.xp >= (levelTable[i] as number)) { level = i; break; }
				}
				char.level = level;
				await vdm.saveCharacter(char);
			}
		}

		// 标记丹药已投注
		const allPills = await vdm.getAllPills();
		for (const entry of allPills) {
			if (entry.pill.名称 === pill.名称 && entry.pill.投注状态 !== 'invested') {
				entry.pill.投注状态 = 'invested';
				entry.pill.投注目标 = targetId;
				await vdm.setPillData(entry.dateKey, entry.pill);
				break;
			}
		}

		// 写入投注记录
		await vdm.addInvestmentRecord({
			id: this.generateId(),
			type,
			targetId,
			targetName,
			pillRecord: pill,
			investDate: new Date().toISOString(),
		});
	}

	// ================================================================
	// 工具方法
	// ================================================================

	private async refresh(): Promise<void> {
		if (!this.ctx) return;
		this.ctx.container.empty();
		await this.render(this.ctx);
	}

	private getNextLevelXp(currentLevel: number): number {
		const table: number[] = [0, 0, 50, 150, 300, 500, 800, 1200, 1800, 2500, 3500];
		const nextIdx = currentLevel + 1;
		return nextIdx < table.length ? (table[nextIdx] as number) : 0;
	}

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	}
}
