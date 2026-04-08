import type { HerbRecord, Flavor, FlavorConflict, FlavorHarmony } from '../types';
import { FLAVOR_CONFLICTS, FLAVOR_HARMONIES } from '../constants';

export interface CompatibilityResult {
	hasConflict: boolean;
	conflictPairs: Array<{ a: Flavor; b: Flavor }>;
	hasHarmony: boolean;
	harmonyBonus?: string;
	gradePenalty: number;  // 相冲减分
	gradeBonus: number;    // 冲和加分
}

/**
 * 分析药材的配伍关系（相冲 / 冲和）。
 *
 * 1. 统计各性味的药材数量
 * 2. 检查 FLAVOR_CONFLICTS 中的冲突对是否同时出现
 * 3. 如果冲突存在，计算双方比例：
 *    - 比例不在 40%-60% 之间 → 纯相冲，gradePenalty = conflict.penalty
 *    - 比例在 40%-60% 之间 → 冲和！hasHarmony = true, gradeBonus = 2
 */
export function analyzeCompatibility(
	herbs: HerbRecord[],
	flavorMap: Record<string, Flavor>,
): CompatibilityResult {
	const result: CompatibilityResult = {
		hasConflict: false,
		conflictPairs: [],
		hasHarmony: false,
		gradePenalty: 0,
		gradeBonus: 0,
	};

	if (herbs.length === 0) return result;

	// 统计各性味的药材数量
	const flavorCounts: Record<string, number> = {};
	let totalQuantity = 0;
	for (const herb of herbs) {
		const flavor = flavorMap[herb.领域];
		if (!flavor) continue;
		flavorCounts[flavor] = (flavorCounts[flavor] ?? 0) + herb.数量;
		totalQuantity += herb.数量;
	}

	if (totalQuantity === 0) return result;

	// 检查每个冲突对
	for (const conflict of FLAVOR_CONFLICTS) {
		const countA = flavorCounts[conflict.a] ?? 0;
		const countB = flavorCounts[conflict.b] ?? 0;

		// 双方都存在才有冲突
		if (countA === 0 || countB === 0) continue;

		result.hasConflict = true;
		result.conflictPairs.push({ a: conflict.a, b: conflict.b });

		// 计算比例
		const conflictTotal = countA + countB;
		const ratioA = countA / conflictTotal;

		// 比例在 40%-60% 之间 → 冲和
		if (ratioA >= 0.4 && ratioA <= 0.6) {
			result.hasHarmony = true;
			result.gradeBonus += 2;

			// 查找对应的冲和加成
			const harmony = FLAVOR_HARMONIES.find(
				h => h.flavors.includes(conflict.a) && h.flavors.includes(conflict.b),
			);
			if (harmony) {
				result.harmonyBonus = harmony.bonus;
			}
		} else {
			// 纯相冲
			result.gradePenalty += conflict.penalty;
		}
	}

	return result;
}
