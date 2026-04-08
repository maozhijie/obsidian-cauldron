import { ItemView, WorkspaceLeaf } from 'obsidian';
import {
	CAULDRON_VIEW_TYPE,
	FLAVOR_ICONS,
	CATALYST_ICONS,
	GRADE_COLORS,
	FLAVOR_COLORS,
} from '../constants';
import type {
	DailyLogFrontmatter,
	HerbRecord,
	CatalystRecord,
	PillRecord,
	PomodoroMode,
	Flavor,
	Grade,
} from '../types';
import type { VaultDataManager } from '../core/vault-data-manager';
import type { PomodoroTimer } from '../pomodoro/pomodoro-timer';
import type { DomainTagManager } from '../core/domain-tag-manager';

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
		// 注册番茄钟 tick 事件处理
		this.registerPomodoroEvents();

		await this.render();

		// 每秒刷新番茄钟显示
		this.refreshTimer = window.setInterval(() => {
			this.updatePomodoroDisplay();
		}, 1000);
	}

	/** 当 pomodoroTimer 被外部设置后，调用此方法注册事件 */
	private registerPomodoroEvents(): void {
		if (this.pomodoroEventsRegistered || !this.pomodoroTimer) return;

		this.tickHandler = () => {
			this.updatePomodoroDisplay();
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

	// ============ 主渲染 ============

	async render(): Promise<void> {
		// 防止重复渲染
		if (this.isRendering) return;
		this.isRendering = true;

		try {
			const container = this.contentEl;
			container.empty();

			// 获取数据
			const todayKey = this.getTodayKey();
			const dailyLog = await this.vaultDataManager?.getDailyLog(todayKey);
			const unviewedPills = await this.vaultDataManager?.getUnviewedPills() ?? [];

			const herbs = dailyLog?.药材 ?? [];
			const catalysts = dailyLog?.药引 ?? [];
			const pill = dailyLog?.丹药;

			// 根容器
			const root = container.createDiv({ cls: 'dandao-container' });

			// 头部
			this.renderHeader(root);

			// 状态栏
			this.renderStatusBar(root, herbs, unviewedPills.length);

			// 今日药篓
			this.renderHerbs(root, herbs);

			// 今日引囊
			this.renderCatalysts(root, catalysts);

			// 番茄钟
			this.renderPomodoro(root);

			// 丹囊
			this.renderPills(root, pill, unviewedPills);
		} finally {
			this.isRendering = false;
		}
	}

	// ============ 渲染各区块 ============

	private renderHeader(root: HTMLElement): void {
		const header = root.createDiv({ cls: 'dandao-header' });
		header.createEl('h4', { text: '丹道修炼' });
		header.createEl('span', { text: '日行一炼，积沙成塔', cls: 'dandao-subtitle' });
	}

	private renderStatusBar(
		root: HTMLElement,
		herbs: HerbRecord[],
		unviewedCount: number,
	): void {
		const bar = root.createDiv({ cls: 'dandao-status-bar' });

		// 距封炉
		const sealItem = bar.createDiv({ cls: 'status-item' });
		sealItem.createEl('span', { text: '距封炉', cls: 'status-label' });
		sealItem.createEl('span', { text: this.getTimeUntilSeal(), cls: 'status-value' });

		// 今日药材
		const herbCount = herbs.reduce((sum, h) => sum + h.数量, 0);
		const herbItem = bar.createDiv({ cls: 'status-item' });
		herbItem.createEl('span', { text: '今日药材', cls: 'status-label' });
		herbItem.createEl('span', { text: `${herbCount} 份`, cls: 'status-value' });

		// 待查看丹药
		const pillItem = bar.createDiv({ cls: 'status-item' });
		pillItem.createEl('span', { text: '待查看丹药', cls: 'status-label' });
		pillItem.createEl('span', { text: `${unviewedCount} 颗`, cls: 'status-value' });
	}

	private renderHerbs(root: HTMLElement, herbs: HerbRecord[]): void {
		const section = root.createDiv({ cls: 'dandao-section dandao-herbs' });
		section.createEl('h5', { text: '📦 今日药篓' });

		if (herbs.length === 0) {
			section.createDiv({
				text: '今日尚未采集药材，完成任务或番茄钟即可获得',
				cls: 'herb-empty',
			});
			return;
		}

		const grouped = this.groupHerbsByDomain(herbs);
		const list = section.createDiv({ cls: 'herb-list' });

		for (const [domain, info] of grouped) {
			const item = list.createDiv({ cls: 'herb-item' });
			item.createEl('span', { text: '🌿', cls: 'herb-icon' });
			item.createEl('span', { text: domain, cls: 'herb-domain' });

			const flavorSpan = item.createEl('span', {
				text: `(${info.flavor})`,
				cls: 'herb-flavor',
			});
			const flavorColor = FLAVOR_COLORS[info.flavor as Flavor];
			if (flavorColor) {
				flavorSpan.style.color = flavorColor;
			}

			item.createEl('span', { text: `x${info.quantity}`, cls: 'herb-quantity' });
		}
	}

	private renderCatalysts(root: HTMLElement, catalysts: CatalystRecord[]): void {
		const section = root.createDiv({ cls: 'dandao-section dandao-catalysts' });
		section.createEl('h5', { text: '🧪 今日引囊' });

		if (catalysts.length === 0) {
			section.createDiv({
				text: '今日尚无药引',
				cls: 'catalyst-empty',
			});
			return;
		}

		const counts = this.countCatalysts(catalysts);
		const list = section.createDiv({ cls: 'catalyst-list' });

		for (const [type, count] of counts) {
			const icon = CATALYST_ICONS[type] ?? '🔹';
			list.createEl('span', {
				text: `${icon} ${type} x${count}`,
				cls: 'catalyst-item',
			});
		}
	}

	private renderPomodoro(root: HTMLElement): void {
		const section = root.createDiv({ cls: 'dandao-section dandao-pomodoro' });
		section.createEl('h5', { text: '🍅 番茄钟' });

		const mode = this.pomodoroTimer?.getMode() ?? 'idle';
		const formattedTime = this.pomodoroTimer?.getFormattedTime() ?? '25:00';

		// 显示区
		const display = section.createDiv({ cls: 'pomodoro-display' });
		display.createEl('span', { text: formattedTime, cls: 'pomodoro-time' });
		display.createEl('span', { text: this.getModeLabel(mode), cls: 'pomodoro-status' });

		// 控制按钮
		const controls = section.createDiv({ cls: 'pomodoro-controls' });

		if (mode === 'idle') {
			const startBtn = controls.createEl('button', { text: '开始' });
			startBtn.addEventListener('click', () => {
				this.pomodoroTimer?.start();
				// 不需要手动 render，state-change 事件会触发 updatePomodoroDisplay
				// updatePomodoroDisplay 会检测按钮变化并自动 render
			});
		}

		if (mode === 'running') {
			const pauseBtn = controls.createEl('button', { text: '暂停' });
			pauseBtn.addEventListener('click', () => {
				this.pomodoroTimer?.pause();
				// state-change 事件会自动触发更新
			});
		}

		if (mode === 'paused') {
			const resumeBtn = controls.createEl('button', { text: '继续' });
			resumeBtn.addEventListener('click', () => {
				this.pomodoroTimer?.resume();
				// state-change 事件会自动触发更新
			});
		}

		if (mode === 'running' || mode === 'paused') {
			const stopBtn = controls.createEl('button', { text: '停止' });
			stopBtn.addEventListener('click', () => {
				this.pomodoroTimer?.stop();
				// state-change 事件会自动触发更新
			});
		}

		if (mode === 'break') {
			const breakInfo = controls.createEl('span', { text: '休息中…', cls: 'pomodoro-break-info' });
			breakInfo.style.color = 'var(--text-muted)';
		}
	}

	private renderPills(
		root: HTMLElement,
		pill: PillRecord | undefined,
		unviewedPills: Array<{ dateKey: string; pill: PillRecord }>,
	): void {
		const section = root.createDiv({ cls: 'dandao-section dandao-pills' });
		section.createEl('h5', { text: '💊 丹囊' });

		if (pill) {
			const preview = section.createDiv({ cls: 'pill-preview' });

			const nameSpan = preview.createEl('span', {
				text: `【${pill.主性味}·${pill.品级}】${pill.名称}`,
				cls: 'pill-name',
			});
			const gradeColor = GRADE_COLORS[pill.品级 as Grade];
			if (gradeColor) {
				nameSpan.style.color = gradeColor;
			}

			const purity = Math.round(pill.纯度 * 100);
			preview.createEl('span', {
				text: `纯度 ${purity}% | 药材 ${pill.药材总量}份`,
				cls: 'pill-meta',
			});
		} else if (unviewedPills.length > 0) {
			// 显示最近一颗未查看的丹药
			const latest = unviewedPills[unviewedPills.length - 1]!;
			const preview = section.createDiv({ cls: 'pill-preview' });

			const nameSpan = preview.createEl('span', {
				text: `【${latest.pill.主性味}·${latest.pill.品级}】${latest.pill.名称}`,
				cls: 'pill-name',
			});
			const gradeColor = GRADE_COLORS[latest.pill.品级 as Grade];
			if (gradeColor) {
				nameSpan.style.color = gradeColor;
			}

			const purity = Math.round(latest.pill.纯度 * 100);
			preview.createEl('span', {
				text: `纯度 ${purity}% | 药材 ${latest.pill.药材总量}份`,
				cls: 'pill-meta',
			});
		} else {
			section.createDiv({ text: '尚无丹药', cls: 'pill-empty' });
		}

		const listBtn = section.createEl('button', {
			text: '查看全部丹药 →',
			cls: 'pill-list-btn',
		});
		listBtn.addEventListener('click', () => {
			// 将在后续任务中实现丹药列表弹窗
		});
	}

	// ============ 番茄钟局部更新 ============

	/**
	 * 仅更新番茄钟时间和状态显示，避免全量 render。
	 */
	private updatePomodoroDisplay(): void {
		const timeEl = this.contentEl.querySelector('.pomodoro-time');
		const statusEl = this.contentEl.querySelector('.pomodoro-status');

		if (timeEl) {
			timeEl.textContent = this.pomodoroTimer?.getFormattedTime() ?? '25:00';
		}
		if (statusEl) {
			const mode = this.pomodoroTimer?.getMode() ?? 'idle';
			statusEl.textContent = this.getModeLabel(mode);
		}

		// 状态切换时需要更新按钮，做一次全量渲染
		const mode = this.pomodoroTimer?.getMode() ?? 'idle';
		const controlsEl = this.contentEl.querySelector('.pomodoro-controls');
		if (controlsEl) {
			// 简单检查：如果当前按钮和 mode 不匹配，全量重渲染
			const hasStart = controlsEl.querySelector('button')?.textContent === '开始';
			if ((mode === 'idle') !== hasStart) {
				this.render();
			}
		}
	}

	// ============ 辅助方法 ============

	private getTodayKey(): string {
		const now = new Date();
		const y = now.getFullYear();
		const m = String(now.getMonth() + 1).padStart(2, '0');
		const d = String(now.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	private getTimeUntilSeal(): string {
		const now = new Date();
		const parts = this.sealTime.split(':').map(Number);
		const hours = parts[0] ?? 23;
		const minutes = parts[1] ?? 0;
		const sealDate = new Date(now);
		sealDate.setHours(hours, minutes, 0, 0);
		if (sealDate <= now) {
			sealDate.setDate(sealDate.getDate() + 1);
		}
		const diffMs = sealDate.getTime() - now.getTime();
		const diffH = Math.floor(diffMs / 3600000);
		const diffM = Math.floor((diffMs % 3600000) / 60000);
		return `${diffH}小时${diffM}分`;
	}

	private getModeLabel(mode: PomodoroMode): string {
		switch (mode) {
			case 'idle': return '空闲';
			case 'running': return '工作中';
			case 'paused': return '暂停';
			case 'break': return '休息中';
			default: return '空闲';
		}
	}

	/**
	 * 按领域分组药材，合并同领域的数量。
	 * 返回 Map<领域名, { flavor: string, quantity: number }>
	 */
	private groupHerbsByDomain(
		herbs: HerbRecord[],
	): Map<string, { flavor: string; quantity: number }> {
		const map = new Map<string, { flavor: string; quantity: number }>();
		for (const h of herbs) {
			const existing = map.get(h.领域);
			if (existing) {
				existing.quantity += h.数量;
			} else {
				// 尝试通过 domainTagManager 查询真实性味，否则默认"神识"
				const flavor = this.domainTagManager?.getFlavorForTag(h.领域) ?? '神识';
				map.set(h.领域, { flavor, quantity: h.数量 });
			}
		}
		return map;
	}

	/**
	 * 统计各类药引数量。
	 * 返回 Map<药引类型, 总数量>
	 */
	private countCatalysts(catalysts: CatalystRecord[]): Map<string, number> {
		const map = new Map<string, number>();
		for (const c of catalysts) {
			map.set(c.类型, (map.get(c.类型) ?? 0) + c.数量);
		}
		return map;
	}
}
