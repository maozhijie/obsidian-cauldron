import type { HerbRecord, CatalystRecord, PillRecord, Flavor, Grade, Rarity, FurnaceState } from '../types';
import { filterValidHerbs, adjustRarityByAging, calculateAgingStatus } from './aging-engine';
import { analyzeCompatibility, type CompatibilityResult } from './compatibility-engine';
import { generatePattern } from './pattern-engine';
import { FURNACE_LEVEL_TABLE } from '../constants';

// ============ 辅助类型 ============

interface SovereignResult {
	domain: string;
	flavor: Flavor;
	totalQuantity: number;
}

interface MinisterResult {
	domain: string;
	flavor: Flavor;
}

// 稀有度优先级（越高越好）
const RARITY_RANK: Record<Rarity, number> = {
	'凡材': 0,
	'良材': 1,
	'珍材': 2,
	'异材': 3,
};

// ============ 君药判定 ============

/**
 * 按领域分组统计药材总数量，选出数量最多的领域作为君药。
 * 并列时：优先选包含更高稀有度药材的领域；仍并列则选最晚采集的。
 */
export function determineSovereign(
	herbs: HerbRecord[],
	flavorMap: Record<string, Flavor>,
): SovereignResult | null {
	if (herbs.length === 0) return null;

	// 按领域分组
	const domainMap = new Map<string, { total: number; maxRarity: number; latestTime: string }>();

	for (const h of herbs) {
		const entry = domainMap.get(h.领域) ?? { total: 0, maxRarity: -1, latestTime: '' };
		entry.total += h.数量;
		const rRank = RARITY_RANK[h.稀有度] ?? 0;
		if (rRank > entry.maxRarity) entry.maxRarity = rRank;
		if (h.采集时间 > entry.latestTime) entry.latestTime = h.采集时间;
		domainMap.set(h.领域, entry);
	}

	// 排序：数量降序 → 稀有度降序 → 最晚采集时间降序
	const sorted = [...domainMap.entries()].sort((a, b) => {
		if (b[1].total !== a[1].total) return b[1].total - a[1].total;
		if (b[1].maxRarity !== a[1].maxRarity) return b[1].maxRarity - a[1].maxRarity;
		return b[1].latestTime.localeCompare(a[1].latestTime);
	});

	const first = sorted[0];
	if (!first) return null;
	const [domain, info] = first;
	return {
		domain,
		flavor: flavorMap[domain] ?? '神识',
		totalQuantity: info.total,
	};
}

// ============ 臣药判定 ============

/**
 * 从剩余领域中选出数量次多的领域作为臣药。
 * 如果该领域数量不足君药的 30%，则不设臣药。
 */
export function determineMinister(
	herbs: HerbRecord[],
	sovereignDomain: string,
	sovereignQuantity: number,
	flavorMap: Record<string, Flavor>,
): MinisterResult | null {
	// 排除君药领域后按领域分组
	const domainMap = new Map<string, number>();
	for (const h of herbs) {
		if (h.领域 === sovereignDomain) continue;
		domainMap.set(h.领域, (domainMap.get(h.领域) ?? 0) + h.数量);
	}

	if (domainMap.size === 0) return null;

	// 选数量最多的
	const sorted = [...domainMap.entries()].sort((a, b) => b[1] - a[1]);
	const first = sorted[0];
	if (!first) return null;
	const [domain, total] = first;

	// 不足君药 30% 则不设臣药
	if (total < sovereignQuantity * 0.3) return null;

	return {
		domain,
		flavor: flavorMap[domain] ?? '神识',
	};
}

// ============ 品级计算 ============

/**
 * 根据药材和药引计算丹药品级。
 * 可选参数：配伍结果加减分、丹炉品级加成。
 */
export function calculateGrade(
	herbs: HerbRecord[],
	catalysts: CatalystRecord[],
	compatibilityResult?: CompatibilityResult,
	furnaceGradeBonus?: number,
): Grade {
	const focusCount = catalysts
		.filter(c => c.类型 === '专注引')
		.reduce((s, c) => s + c.数量, 0);
	const onTimeCount = catalysts
		.filter(c => c.类型 === '守时引')
		.reduce((s, c) => s + c.数量, 0);
	const overtimeCount = catalysts
		.filter(c => c.类型 === '延时引')
		.reduce((s, c) => s + c.数量, 0);
	const breakCount = catalysts
		.filter(c => c.类型 === '断念引')
		.reduce((s, c) => s + c.数量, 0);
	const herbTotal = herbs.reduce((s, h) => s + h.数量, 0);

	let score = 0;

	// 专注引贡献
	if (focusCount >= 5) score += 3;
	else if (focusCount >= 3) score += 2;
	else if (focusCount >= 1) score += 1;

	// 守时引贡献
	if (herbTotal > 0 && onTimeCount >= herbTotal * 0.8) score += 1;

	// 延时引惩罚
	if (overtimeCount > onTimeCount) score -= 1;

	// 断念引惩罚
	if (breakCount > focusCount) score -= 1;

	// 配伍加减分
	if (compatibilityResult) {
		score += compatibilityResult.gradeBonus - compatibilityResult.gradePenalty;
	}

	// 丹炉品级加成
	if (furnaceGradeBonus) {
		score += furnaceGradeBonus;
	}

	// 映射品级
	if (score >= 4) return '神品';
	if (score >= 3) return '宝品';
	if (score >= 2) return '灵品';
	return '凡品';
}

// ============ 纯度计算 ============

/**
 * 根据守时引和延时引计算丹药纯度。
 * 纯度 = 守时引 / (守时引 + 延时引)，范围 [0.3, 1.0]，保留两位小数。
 * 可选 purityFloor：丹炉等级提供的纯度保底值。
 */
export function calculatePurity(catalysts: CatalystRecord[], purityFloor?: number): number {
	const onTimeCount = catalysts
		.filter(c => c.类型 === '守时引')
		.reduce((s, c) => s + c.数量, 0);
	const overtimeCount = catalysts
		.filter(c => c.类型 === '延时引')
		.reduce((s, c) => s + c.数量, 0);

	const totalCompletion = onTimeCount + overtimeCount;
	if (totalCompletion === 0) return 0.5;

	const raw = onTimeCount / totalCompletion;
	const clamped = Math.max(0.3, Math.min(1.0, raw));
	const purity = Math.round(clamped * 100) / 100;

	// 应用丹炉纯度保底
	if (purityFloor && purityFloor > 0) {
		return Math.max(purity, purityFloor);
	}
	return purity;
}

// ============ 丹药命名 ============

/**
 * 生成丹药名称。
 * 有臣药：【主性味·辅性味·品级】君药领域丹
 * 无臣药：【主性味·品级】君药领域丹
 */
export function generatePillName(
	sovereign: SovereignResult,
	minister: MinisterResult | null,
	grade: Grade,
): string {
	if (minister) {
		return `【${sovereign.flavor}·${minister.flavor}·${grade}】${sovereign.domain}丹`;
	}
	return `【${sovereign.flavor}·${grade}】${sovereign.domain}丹`;
}

// ============ 主函数 ============

/**
 * 配伍炼丹主函数。
 * 接收一天的药材和药引数组以及领域→性味映射，返回炼制的丹药记录。
 * 药材为空时返回 null。
 * 可选 furnaceState：传入丹炉状态以启用丹炉加成和丹纹生成。
 */
export function refinePill(
	herbs: HerbRecord[],
	catalysts: CatalystRecord[],
	flavorMap: Record<string, Flavor>,
	furnaceState?: FurnaceState,
): PillRecord | null {
	if (herbs.length === 0) return null;

	// 0. 获取当前日期（用于陈化计算）
	const now = new Date();
	const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

	// 1. 过滤过期药材
	let validHerbs = filterValidHerbs(herbs, currentDate);
	if (validHerbs.length === 0) return null;

	// 2. 对有效药材调用陈化稀有度调整
	validHerbs = validHerbs.map(herb => {
		const agingStatus = calculateAgingStatus(herb, currentDate);
		return adjustRarityByAging(herb, agingStatus);
	});

	// 3. 分析配伍关系
	const compatResult = analyzeCompatibility(validHerbs, flavorMap);

	// 4. 丹炉加成
	let furnaceGradeBonus = 0;
	let purityFloor = 0;
	if (furnaceState) {
		const entry = FURNACE_LEVEL_TABLE.find(e => e.level === furnaceState.level);
		if (entry) {
			furnaceGradeBonus = entry.gradeBonus;
			purityFloor = entry.purityFloor;
		}
	}

	// 5. 君药判定
	const sovereign = determineSovereign(validHerbs, flavorMap);
	if (!sovereign) return null;

	// 6. 臣药判定
	const minister = determineMinister(validHerbs, sovereign.domain, sovereign.totalQuantity, flavorMap);

	// 7. 品级计算（含配伍和丹炉加成）
	const grade = calculateGrade(validHerbs, catalysts, compatResult, furnaceGradeBonus);

	// 8. 纯度计算（含丹炉纯度保底）
	const purity = calculatePurity(catalysts, purityFloor);

	// 9. 丹药命名
	const name = generatePillName(sovereign, minister, grade);

	// 10. 药材总量
	const herbTotal = validHerbs.reduce((s, h) => s + h.数量, 0);

	// 11. 组装丹药记录
	const pill: PillRecord = {
		名称: name,
		君药领域: sovereign.domain,
		主性味: sovereign.flavor,
		品级: grade,
		纯度: purity,
		药材总量: herbTotal,
		已查看: false,
	};

	if (minister) {
		pill.臣药领域 = minister.domain;
		pill.辅性味 = minister.flavor;
	}

	// 12. 丹纹判定
	if (furnaceState) {
		const pattern = generatePattern(pill, furnaceState);
		if (pattern) {
			pill.丹纹 = pattern;
		}
	}

	return pill;
}
