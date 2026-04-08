import type { ViewSection, SectionContext } from './section-base';
import type { ChartRenderer } from '../../core/stats/chart-renderer';
import type { StatsSnapshot, StatsPeriod, DomainStats, Grade, Flavor } from '../../types';
import { EChartsRenderer } from '../../core/stats/echarts-renderer';
import { generateSnapshot, getDomainStatsData } from '../../core/stats/stats-engine';
import { STATS_PERIODS, GRADE_COLORS, FLAVOR_COLORS } from '../../constants';

export class StatsSection implements ViewSection {
	private chartRenderer: ChartRenderer | null = null;
	private currentPeriod: StatsPeriod = 'week';
	private ctx: SectionContext | null = null;

	async render(ctx: SectionContext): Promise<void> {
		this.ctx = ctx;
		// 清理旧图表实例
		this.disposeCharts();
		this.chartRenderer = new EChartsRenderer();

		const root = ctx.container.createDiv({ cls: 'dandao-stats' });

		// 周期选择器
		this.renderPeriodSelector(root);

		// 内容区
		const content = root.createDiv({ cls: 'dandao-stats-content' });

		await this.renderContent(content, ctx);
	}

	dispose(): void {
		this.disposeCharts();
		this.ctx = null;
	}

	// ============ 周期选择器 ============

	private renderPeriodSelector(root: HTMLElement): void {
		const bar = root.createDiv({ cls: 'dandao-stats-period-bar' });

		for (const p of STATS_PERIODS) {
			const btn = bar.createEl('button', {
				cls: `dandao-stats-period-btn${p.value === this.currentPeriod ? ' active' : ''}`,
				text: p.label,
			});
			btn.addEventListener('click', () => {
				if (p.value === this.currentPeriod) return;
				this.currentPeriod = p.value;
				this.refresh();
			});
		}
	}

	// ============ 内容渲染 ============

	private async renderContent(container: HTMLElement, ctx: SectionContext): Promise<void> {
		const vdm = ctx.vaultDataManager;
		if (!vdm) {
			container.createDiv({ cls: 'dandao-empty', text: '数据管理器未初始化' });
			return;
		}

		try {
			const snapshot = await generateSnapshot(vdm, this.currentPeriod);
			const domainTags = await vdm.getDomainTags();
			// 经脉状态从 plugin.data 获取（通过 ctx.plugin）
			const meridians = ctx.plugin?.data?.meridianStates ?? [];
			const domainStats = await getDomainStatsData(vdm, domainTags, meridians);

			this.renderOverviewCards(container, snapshot);
			this.renderHeatmapChart(container, snapshot);
			this.renderDomainRadar(container, domainStats);
			this.renderTrendChart(container, snapshot);
			this.renderGradeDistribution(container, snapshot);
			this.renderPomodoroStats(container, snapshot);
		} catch (e) {
			console.error('[StatsSection] renderContent error:', e);
			container.createDiv({ cls: 'dandao-empty', text: '统计数据加载失败' });
		}
	}

	// ============ 总览卡片 ============

	private renderOverviewCards(container: HTMLElement, snapshot: StatsSnapshot): void {
		const section = container.createDiv({ cls: 'dandao-section' });
		section.createEl('h5', { text: '📊 总览' });

		const grid = section.createDiv({ cls: 'dandao-stats-cards' });

		const cards = [
			{ label: '药材总量', value: String(snapshot.totalHerbs), icon: '🌿' },
			{ label: '丹药总量', value: String(snapshot.totalPills), icon: '💊' },
			{ label: '活跃天数', value: `${snapshot.activeDays}/${snapshot.totalDays}`, icon: '📅' },
			{ label: '连续天数', value: String(snapshot.streakCurrent), icon: '🔥' },
		];

		for (const card of cards) {
			const el = grid.createDiv({ cls: 'dandao-stats-card' });
			el.createDiv({ cls: 'dandao-stats-card-icon', text: card.icon });
			el.createDiv({ cls: 'dandao-stats-card-value', text: card.value });
			el.createDiv({ cls: 'dandao-stats-card-label', text: card.label });
		}
	}

	// ============ 活跃热力图 ============

	private renderHeatmapChart(container: HTMLElement, snapshot: StatsSnapshot): void {
		if (!this.chartRenderer) return;
		const section = container.createDiv({ cls: 'dandao-section' });
		section.createEl('h5', { text: '🗓️ 活跃热力图' });

		const chartContainer = section.createDiv({ cls: 'dandao-chart-container' });

		const heatmapData: Array<[string, number]> = snapshot.dailyActivity.map(d => [
			d.date,
			d.herbs + d.pills + (d.focus > 0 ? 1 : 0),
		]);

		this.chartRenderer.renderHeatmap(chartContainer, {
			data: heatmapData,
			range: [snapshot.startDate, snapshot.endDate],
			height: 200,
		});
	}

	// ============ 领域雷达图 ============

	private renderDomainRadar(container: HTMLElement, domainStats: DomainStats[]): void {
		if (!this.chartRenderer || domainStats.length === 0) return;

		const section = container.createDiv({ cls: 'dandao-section' });
		section.createEl('h5', { text: '🎯 领域分布' });

		const chartContainer = section.createDiv({ cls: 'dandao-chart-container' });

		const maxHerbs = Math.max(1, ...domainStats.map(d => d.totalHerbs));
		const indicators = domainStats.map(d => ({
			name: d.domain,
			max: Math.max(maxHerbs, 10),
		}));

		this.chartRenderer.renderRadarChart(chartContainer, {
			indicators,
			series: [{
				name: '采集量',
				data: domainStats.map(d => d.totalHerbs),
				color: '#c0392b',
			}],
			height: 250,
		});
	}

	// ============ 趋势图 ============

	private renderTrendChart(container: HTMLElement, snapshot: StatsSnapshot): void {
		if (!this.chartRenderer || snapshot.dailyActivity.length === 0) return;

		const section = container.createDiv({ cls: 'dandao-section' });
		section.createEl('h5', { text: '📈 趋势' });

		const chartContainer = section.createDiv({ cls: 'dandao-chart-container' });

		// 对于大量数据，按周聚合
		const activity = snapshot.dailyActivity;
		const dates = activity.map(d => d.date);
		const herbs = activity.map(d => d.herbs);
		const pills = activity.map(d => d.pills);
		const focus = activity.map(d => d.focus);

		this.chartRenderer.renderLineChart(chartContainer, {
			dates,
			series: [
				{ name: '药材', data: herbs, color: '#2d8659', smooth: true },
				{ name: '丹药', data: pills, color: '#c0392b', smooth: true },
				{ name: '专注(分)', data: focus, color: '#4a90d9', smooth: true },
			],
			height: 200,
		});
	}

	// ============ 品级分布 ============

	private renderGradeDistribution(container: HTMLElement, snapshot: StatsSnapshot): void {
		if (!this.chartRenderer) return;

		const total = Object.values(snapshot.pillsByGrade).reduce((a, b) => a + b, 0);
		if (total === 0) return;

		const section = container.createDiv({ cls: 'dandao-section' });
		section.createEl('h5', { text: '🏅 品级分布' });

		const chartContainer = section.createDiv({ cls: 'dandao-chart-container' });

		const items = (Object.entries(snapshot.pillsByGrade) as Array<[Grade, number]>)
			.filter(([, v]) => v > 0)
			.map(([grade, value]) => ({
				name: grade,
				value,
				color: GRADE_COLORS[grade],
			}));

		this.chartRenderer.renderPieChart(chartContainer, {
			items,
			isRing: true,
			height: 200,
		});
	}

	// ============ 番茄钟统计 ============

	private renderPomodoroStats(container: HTMLElement, snapshot: StatsSnapshot): void {
		const section = container.createDiv({ cls: 'dandao-section' });
		section.createEl('h5', { text: '🍅 番茄钟' });

		const grid = section.createDiv({ cls: 'dandao-stats-cards' });

		const items = [
			{ label: '完成数', value: String(snapshot.pomodoroCompleted), icon: '✅' },
			{ label: '中断数', value: String(snapshot.pomodoroInterrupted), icon: '⏸️' },
			{ label: '总专注', value: `${snapshot.totalFocusMinutes}分`, icon: '⏱️' },
		];

		for (const item of items) {
			const el = grid.createDiv({ cls: 'dandao-stats-card' });
			el.createDiv({ cls: 'dandao-stats-card-icon', text: item.icon });
			el.createDiv({ cls: 'dandao-stats-card-value', text: item.value });
			el.createDiv({ cls: 'dandao-stats-card-label', text: item.label });
		}
	}

	// ============ 刷新 ============

	private async refresh(): Promise<void> {
		if (!this.ctx) return;

		// 清理旧内容
		this.disposeCharts();
		this.chartRenderer = new EChartsRenderer();

		const root = this.ctx.container;
		root.empty();

		const wrapper = root.createDiv({ cls: 'dandao-stats' });
		this.renderPeriodSelector(wrapper);
		const content = wrapper.createDiv({ cls: 'dandao-stats-content' });
		await this.renderContent(content, this.ctx);
	}

	private disposeCharts(): void {
		if (this.chartRenderer) {
			this.chartRenderer.dispose();
			this.chartRenderer = null;
		}
	}
}
