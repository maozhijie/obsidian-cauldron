/**
 * 图表渲染抽象层 — 定义接口和数据类型
 * 具体实现见 echarts-renderer.ts
 */

// ============ Chart 数据接口 ============

export interface BarChartData {
	categories: string[];
	series: Array<{
		name: string;
		data: number[];
		color?: string;
	}>;
	title?: string;
	height?: number;
}

export interface LineChartData {
	dates: string[];
	series: Array<{
		name: string;
		data: number[];
		color?: string;
		smooth?: boolean;
	}>;
	title?: string;
	height?: number;
}

export interface RadarChartData {
	indicators: Array<{ name: string; max: number }>;
	series: Array<{
		name: string;
		data: number[];
		color?: string;
	}>;
	title?: string;
	height?: number;
}

export interface PieChartData {
	items: Array<{
		name: string;
		value: number;
		color?: string;
	}>;
	title?: string;
	height?: number;
	isRing?: boolean;
}

export interface HeatmapData {
	/** [date, value] 数组，date 为 YYYY-MM-DD */
	data: Array<[string, number]>;
	/** 日历范围 [startDate, endDate] */
	range: [string, string];
	title?: string;
	height?: number;
}

// ============ ChartRenderer 抽象接口 ============

export interface ChartRenderer {
	renderBarChart(container: HTMLElement, data: BarChartData): void;
	renderLineChart(container: HTMLElement, data: LineChartData): void;
	renderRadarChart(container: HTMLElement, data: RadarChartData): void;
	renderPieChart(container: HTMLElement, data: PieChartData): void;
	renderHeatmap(container: HTMLElement, data: HeatmapData): void;
	/** 销毁所有图表实例，释放资源 */
	dispose(): void;
}
