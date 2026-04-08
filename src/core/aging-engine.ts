import type { HerbRecord, AgingStatus, Rarity } from '../types';
import { AGING_RULES } from '../constants';

/**
 * 计算两个日期之间的天数差（只看日期部分，忽略时分秒）。
 */
function daysBetween(dateA: string, dateB: string): number {
	const a = new Date(dateA);
	const b = new Date(dateB);
	// 归零时分秒
	a.setHours(0, 0, 0, 0);
	b.setHours(0, 0, 0, 0);
	return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 计算药材的陈化状态。
 * - 0-3天 → 'fresh'
 * - 3-5天 → 'aging'
 * - 5-7天 → 'mature'
 * - 7+天  → 'expired'
 */
export function calculateAgingStatus(herb: HerbRecord, currentDate: string): AgingStatus {
	const days = daysBetween(herb.采集时间, currentDate);
	if (days < 0) return 'fresh'; // 未来采集，视为新鲜

	if (days < AGING_RULES.freshDays) return 'fresh';
	if (days < AGING_RULES.agingDays) return 'aging';
	if (days < AGING_RULES.matureDays) return 'mature';
	return 'expired';
}

/**
 * 过滤掉过期药材，返回有效药材。
 */
export function filterValidHerbs(herbs: HerbRecord[], currentDate: string): HerbRecord[] {
	return herbs.filter(herb => {
		const status = calculateAgingStatus(herb, currentDate);
		return status !== 'expired';
	});
}

// 稀有度排序
const RARITY_ORDER: Rarity[] = ['凡材', '良材', '珍材', '异材'];

function rarityIndex(r: Rarity): number {
	return RARITY_ORDER.indexOf(r);
}

function rarityByIndex(idx: number): Rarity {
	const clamped = Math.max(0, Math.min(idx, RARITY_ORDER.length - 1));
	return RARITY_ORDER[clamped]!;
}

/**
 * 计算陈化后的稀有度调整。
 * - fresh → 无变化
 * - aging → 大部分降一级，appreciatingDomains 中的领域不降
 * - mature → 降一级，但 appreciatingDomains 中的领域升一级（凡材→良材）
 * - expired → 不应调用（应被 filterValidHerbs 过滤）
 */
export function adjustRarityByAging(herb: HerbRecord, agingStatus: AgingStatus): HerbRecord {
	if (agingStatus === 'fresh' || agingStatus === 'expired') {
		return { ...herb, 陈化状态: agingStatus };
	}

	const isAppreciating = AGING_RULES.appreciatingDomains.includes(herb.领域);
	const currentIdx = rarityIndex(herb.稀有度);
	let newIdx = currentIdx;

	if (agingStatus === 'aging') {
		// 大部分降一级，appreciatingDomains 不降
		if (!isAppreciating) {
			newIdx = currentIdx - 1;
		}
	} else if (agingStatus === 'mature') {
		if (isAppreciating) {
			// 增值领域升一级
			newIdx = currentIdx + 1;
		} else {
			// 普通降一级
			newIdx = currentIdx - 1;
		}
	}

	return {
		...herb,
		稀有度: rarityByIndex(newIdx),
		陈化状态: agingStatus,
	};
}

/**
 * 为新采集的药材设置有效期。
 * 有效期 = 采集时间 + expiryDays（默认 AGING_RULES.defaultExpiryDays）
 */
export function setHerbExpiry(herb: HerbRecord, expiryDays?: number): HerbRecord {
	const days = expiryDays ?? AGING_RULES.defaultExpiryDays;
	const collectDate = new Date(herb.采集时间);
	collectDate.setDate(collectDate.getDate() + days);

	// 格式化为 YYYY-MM-DD
	const y = collectDate.getFullYear();
	const m = String(collectDate.getMonth() + 1).padStart(2, '0');
	const d = String(collectDate.getDate()).padStart(2, '0');

	return {
		...herb,
		有效期: `${y}-${m}-${d}`,
	};
}
