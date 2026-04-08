import type { PillRecord, PillPattern, Grade, FurnaceState } from '../types';
import { PATTERN_POOL, FURNACE_LEVEL_TABLE } from '../constants';

/**
 * 判断是否生成丹纹。
 * - 凡品/灵品 → 不产生丹纹
 * - 宝品 → 基础概率 10% + 丹炉 patternChance
 * - 神品 → 基础概率 30% + 丹炉 patternChance
 */
export function shouldGeneratePattern(grade: Grade, furnaceState: FurnaceState): boolean {
	let baseChance = 0;

	if (grade === '宝品') {
		baseChance = 0.10;
	} else if (grade === '神品') {
		baseChance = 0.30;
	} else {
		return false; // 凡品/灵品不产生丹纹
	}

	// 丹炉 patternChance 加成
	const entry = FURNACE_LEVEL_TABLE.find(e => e.level === furnaceState.level);
	const patternChance = entry?.patternChance ?? 0;

	const totalChance = baseChance + patternChance;
	return Math.random() < totalChance;
}

/**
 * 生成丹纹。
 * 先判断是否生成，如果生成则按稀有度权重随机选取：
 * - common 60%, rare 30%, legendary 10%
 */
export function generatePattern(
	pill: PillRecord,
	furnaceState: FurnaceState,
): PillPattern | null {
	if (!shouldGeneratePattern(pill.品级, furnaceState)) {
		return null;
	}

	// 按稀有度分组
	const commonPatterns = PATTERN_POOL.filter(p => p.rarity === 'common');
	const rarePatterns = PATTERN_POOL.filter(p => p.rarity === 'rare');
	const legendaryPatterns = PATTERN_POOL.filter(p => p.rarity === 'legendary');

	// 权重随机选稀有度
	const roll = Math.random();
	let pool: PillPattern[];

	if (roll < 0.10 && legendaryPatterns.length > 0) {
		pool = legendaryPatterns;
	} else if (roll < 0.40 && rarePatterns.length > 0) {
		pool = rarePatterns;
	} else {
		pool = commonPatterns.length > 0 ? commonPatterns : PATTERN_POOL;
	}

	if (pool.length === 0) return null;

	// 从池中随机选一个
	const idx = Math.floor(Math.random() * pool.length);
	return { ...pool[idx]! };
}
