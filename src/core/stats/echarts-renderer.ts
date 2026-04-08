/**
 * ECharts 实现 ChartRenderer 接口
 * 按需引入以实现 tree-shaking
 */

import * as echarts from 'echarts/core';
import { BarChart, LineChart, RadarChart, PieChart, HeatmapChart } from 'echarts/charts';
import {
	GridComponent,
	TooltipComponent,
	LegendComponent,
	CalendarComponent,
	VisualMapComponent,
	TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ECharts } from 'echarts/core';
import type {
	ChartRenderer,
	BarChartData,
	LineChartData,
	RadarChartData,
	PieChartData,
	HeatmapData,
} from './chart-renderer';

// 注册组件
echarts.use([
	BarChart, LineChart, RadarChart, PieChart, HeatmapChart,
	GridComponent, TooltipComponent, LegendComponent,
	CalendarComponent, VisualMapComponent, TitleComponent,
	CanvasRenderer,
]);

// 丹道主题色板 — 东方美学
const DANDAO_COLORS = [
	'#c0392b', // 朱砂红
	'#4a90d9', // 石青
	'#2d8659', // 翠绿
	'#d4a017', // 金黄
	'#8b5cf6', // 紫
	'#8b6914', // 褐
	'#e67e22', // 橙
	'#1abc9c', // 青碧
];

const BASE_TEXT_STYLE = {
	fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
	fontSize: 11,
};

export class EChartsRenderer implements ChartRenderer {
	private instances: ECharts[] = [];

	renderBarChart(container: HTMLElement, data: BarChartData): void {
		const height = data.height ?? 200;
		container.style.height = `${height}px`;
		const chart = this.createChart(container);

		chart.setOption({
			color: DANDAO_COLORS,
			textStyle: BASE_TEXT_STYLE,
			tooltip: { trigger: 'axis' },
			grid: { left: 40, right: 16, top: 20, bottom: 30 },
			xAxis: {
				type: 'category',
				data: data.categories,
				axisLabel: { fontSize: 10, interval: 0, rotate: data.categories.length > 8 ? 30 : 0 },
			},
			yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
			series: data.series.map(s => ({
				name: s.name,
				type: 'bar' as const,
				data: s.data,
				itemStyle: s.color ? { color: s.color } : undefined,
				barMaxWidth: 24,
			})),
		});
	}

	renderLineChart(container: HTMLElement, data: LineChartData): void {
		const height = data.height ?? 200;
		container.style.height = `${height}px`;
		const chart = this.createChart(container);

		chart.setOption({
			color: DANDAO_COLORS,
			textStyle: BASE_TEXT_STYLE,
			tooltip: { trigger: 'axis' },
			legend: {
				data: data.series.map(s => s.name),
				bottom: 0,
				textStyle: { fontSize: 10 },
			},
			grid: { left: 40, right: 16, top: 16, bottom: 36 },
			xAxis: {
				type: 'category',
				data: data.dates,
				axisLabel: {
					fontSize: 9,
					formatter: (v: string) => v.slice(5), // MM-DD
				},
			},
			yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
			series: data.series.map(s => ({
				name: s.name,
				type: 'line' as const,
				data: s.data,
				smooth: s.smooth ?? true,
				symbol: 'circle',
				symbolSize: 4,
				lineStyle: { width: 2, color: s.color },
				itemStyle: s.color ? { color: s.color } : undefined,
			})),
		});
	}

	renderRadarChart(container: HTMLElement, data: RadarChartData): void {
		const height = data.height ?? 250;
		container.style.height = `${height}px`;
		const chart = this.createChart(container);

		chart.setOption({
			color: DANDAO_COLORS,
			textStyle: BASE_TEXT_STYLE,
			tooltip: {},
			radar: {
				indicator: data.indicators,
				shape: 'polygon',
				splitNumber: 4,
				axisName: { fontSize: 10 },
			},
			series: [{
				type: 'radar' as const,
				data: data.series.map(s => ({
					name: s.name,
					value: s.data,
					areaStyle: { opacity: 0.15 },
					lineStyle: { width: 2, color: s.color },
					itemStyle: s.color ? { color: s.color } : undefined,
				})),
			}],
		});
	}

	renderPieChart(container: HTMLElement, data: PieChartData): void {
		const height = data.height ?? 200;
		container.style.height = `${height}px`;
		const chart = this.createChart(container);

		const seriesData = data.items.map(item => ({
			name: item.name,
			value: item.value,
			itemStyle: item.color ? { color: item.color } : undefined,
		}));

		chart.setOption({
			color: DANDAO_COLORS,
			textStyle: BASE_TEXT_STYLE,
			tooltip: {
				trigger: 'item',
				formatter: '{b}: {c} ({d}%)',
			},
			legend: {
				orient: 'vertical',
				right: 8,
				top: 'center',
				textStyle: { fontSize: 10 },
			},
			series: [{
				type: 'pie' as const,
				radius: data.isRing ? ['40%', '65%'] : '65%',
				center: ['40%', '50%'],
				data: seriesData,
				label: { show: false },
				emphasis: {
					label: { show: true, fontSize: 12, fontWeight: 'bold' },
				},
			}],
		});
	}

	renderHeatmap(container: HTMLElement, data: HeatmapData): void {
		const height = data.height ?? 200;
		container.style.height = `${height}px`;
		const chart = this.createChart(container);

		const maxVal = Math.max(1, ...data.data.map(d => d[1]));

		chart.setOption({
			textStyle: BASE_TEXT_STYLE,
			tooltip: {
				formatter: (params: { value: [string, number] }) => {
					const v = params.value;
					return `${v[0]}<br/>活跃度: ${v[1]}`;
				},
			},
			visualMap: {
				min: 0,
				max: maxVal,
				show: false,
				inRange: {
					color: ['#f5f0e8', '#fce4e4', '#e8a8a0', '#c0392b'],
				},
			},
			calendar: {
				range: data.range,
				cellSize: [14, 14],
				top: 30,
				left: 40,
				right: 16,
				orient: 'horizontal',
				splitLine: { show: false },
				itemStyle: {
					borderWidth: 2,
					borderColor: 'transparent',
					borderRadius: 2,
				},
				yearLabel: { show: false },
				monthLabel: { fontSize: 10 },
				dayLabel: { fontSize: 9, firstDay: 1 },
			},
			series: [{
				type: 'heatmap' as const,
				coordinateSystem: 'calendar',
				data: data.data,
			}],
		});
	}

	dispose(): void {
		for (const instance of this.instances) {
			try {
				instance.dispose();
			} catch {
				// ignore
			}
		}
		this.instances = [];
	}

	// ============ 内部方法 ============

	private createChart(container: HTMLElement): ECharts {
		const chart = echarts.init(container);
		this.instances.push(chart);
		return chart;
	}
}
