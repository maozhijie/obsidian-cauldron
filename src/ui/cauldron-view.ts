import { ItemView, WorkspaceLeaf } from 'obsidian';
import { CAULDRON_VIEW_TYPE } from '../constants';
import type { VaultDataManager } from '../core/vault-data-manager';
import type { PomodoroTimer } from '../pomodoro/pomodoro-timer';
import type { DomainTagManager } from '../core/domain-tag-manager';
import type { SectionContext } from './components/section-base';
import { renderTabBar, type TabDefinition } from './components/tab-bar';
import { StatusBarSection } from './components/status-bar';
import { HerbSection } from './components/herb-section';
import { CatalystSection } from './components/catalyst-section';
import { PomodoroSection, updatePomodoroDisplay } from './components/pomodoro-section';
import { PillSection } from './components/pill-section';
import { FurnaceSection } from './components/furnace-section';
import { InvestmentSection } from './components/investment-section';
import { SeedSection } from './components/seed-section';
import { CultivationSection } from './components/cultivation-section';
import { StatsSection } from './components/stats-section';

const TABS: TabDefinition[] = [
	{ id: 'alchemy', label: '炼丹' },
	{ id: 'investment', label: '投注' },
	{ id: 'seeds', label: '种子' },
	{ id: 'cultivation', label: '修炼' },
	{ id: 'stats', label: '统计' },
];

// 炼丹 Tab 子组件
const statusBarSection = new StatusBarSection();
const herbSection = new HerbSection();
const catalystSection = new CatalystSection();
const pomodoroSection = new PomodoroSection();
const furnaceSection = new FurnaceSection();
const pillSection = new PillSection();

// 其他 Tab 子组件
const investmentSection = new InvestmentSection();
const seedSection = new SeedSection();
const cultivationSection = new CultivationSection();
const statsSection = new StatsSection();

/**
 * CauldronView — 丹道修炼主侧边栏视图。
 *
 * 由于 Obsidian 的 registerView 工厂函数签名为 (leaf) => View，
 * 无法直接在构造函数中传入额外参数。因此 vaultDataManager / pomodoroTimer
 * 声明为可选公共属性，由 main.ts 在激活视图后设置。
 */
export class CauldronView extends ItemView {
	vaultDataManager?: VaultDataManager;
	pomodoroTimer?: PomodoroTimer;
	domainTagManager?: DomainTagManager;
	sealTime = '23:00';

	private activeTab = 'alchemy';
	private refreshTimer?: number;
	private tickHandler?: (remaining: number, total: number) => void;
	private pomodoroEventsRegistered = false;
	private isRendering = false;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	// ============ ItemView 必须实现 ============

	getViewType(): string {
		return CAULDRON_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '丹道修炼';
	}

	getIcon(): string {
		return 'flame';
	}

	// ============ 生命周期 ============

	async onOpen(): Promise<void> {
		this.registerPomodoroEvents();
		await this.render();

		// 每秒刷新番茄钟显示
		this.refreshTimer = window.setInterval(() => {
			if (this.activeTab === 'alchemy') {
				const needsRerender = updatePomodoroDisplay(this.contentEl, this.pomodoroTimer);
				if (needsRerender) {
					this.render();
				}
			}
		}, 1000);
	}

	private registerPomodoroEvents(): void {
		if (this.pomodoroEventsRegistered || !this.pomodoroTimer) return;

		this.tickHandler = () => {
			if (this.activeTab === 'alchemy') {
				const needsRerender = updatePomodoroDisplay(this.contentEl, this.pomodoroTimer);
				if (needsRerender) {
					this.render();
				}
			}
		};
		this.pomodoroTimer.on('tick', this.tickHandler);
		this.pomodoroTimer.on('state-change', this.tickHandler);
		this.pomodoroEventsRegistered = true;
	}

	/** 外部设置 pomodoroTimer 后调用 */
	onPomodoroTimerSet(): void {
		this.registerPomodoroEvents();
	}

	async onClose(): Promise<void> {
		if (this.refreshTimer !== undefined) {
			window.clearInterval(this.refreshTimer);
			this.refreshTimer = undefined;
		}
		if (this.tickHandler) {
			this.pomodoroTimer?.off('tick', this.tickHandler);
			this.pomodoroTimer?.off('state-change', this.tickHandler);
			this.tickHandler = undefined;
		}
	}

	// ============ 公共方法 ============

	/** 外部调用刷新（如采集了新药材后） */
	async refresh(): Promise<void> {
		await this.render();
	}

	/** 切换到指定 Tab */
	switchTab(tabId: string): void {
		this.activeTab = tabId;
		this.render();
	}

	// ============ 主渲染 ============

	async render(): Promise<void> {
		if (this.isRendering) return;
		this.isRendering = true;

		try {
			const container = this.contentEl;
			container.empty();

			const root = container.createDiv({ cls: 'dandao-container' });

			// 头部
			this.renderHeader(root);

			// Tab 栏
			renderTabBar(root, TABS, this.activeTab, (tabId) => {
				this.activeTab = tabId;
				this.render();
			});

			// 当前 Tab 内容
			const content = root.createDiv({ cls: 'dandao-tab-content' });
			const ctx: SectionContext = {
				container: content,
				vaultDataManager: this.vaultDataManager,
				pomodoroTimer: this.pomodoroTimer,
				domainTagManager: this.domainTagManager,
				sealTime: this.sealTime,
			};

			switch (this.activeTab) {
				case 'alchemy':
					await this.renderAlchemyTab(ctx);
					break;
				case 'investment':
					await investmentSection.render(ctx);
					break;
				case 'seeds':
					await seedSection.render(ctx);
					break;
				case 'cultivation':
					await cultivationSection.render(ctx);
					break;
				case 'stats':
					await statsSection.render(ctx);
					break;
			}
		} finally {
			this.isRendering = false;
		}
	}

	// ============ 炼丹 Tab ============

	private async renderAlchemyTab(ctx: SectionContext): Promise<void> {
		const todayKey = this.getTodayKey();
		const dailyLog = await this.vaultDataManager?.getDailyLog(todayKey);
		const unviewedPills = await this.vaultDataManager?.getUnviewedPills() ?? [];

		const herbs = dailyLog?.药材 ?? [];
		const catalysts = dailyLog?.药引 ?? [];
		const pill = dailyLog?.丹药;

		statusBarSection.setData(herbs, unviewedPills.length);
		await statusBarSection.render(ctx);

		herbSection.setData(herbs);
		await herbSection.render(ctx);

		catalystSection.setData(catalysts);
		await catalystSection.render(ctx);

		await pomodoroSection.render(ctx);

		await furnaceSection.render(ctx);

		pillSection.setData(pill, unviewedPills);
		await pillSection.render(ctx);
	}

	// ============ 渲染各区块 ============

	private renderHeader(root: HTMLElement): void {
		const header = root.createDiv({ cls: 'dandao-header' });
		header.createEl('h4', { text: '丹道修炼' });
		header.createEl('span', { text: '日行一炼，积沙成塔', cls: 'dandao-subtitle' });
	}

	// ============ 辅助方法 ============

	private getTodayKey(): string {
		const now = new Date();
		const y = now.getFullYear();
		const m = String(now.getMonth() + 1).padStart(2, '0');
		const d = String(now.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
}
