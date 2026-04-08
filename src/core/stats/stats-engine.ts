import type { VaultDataManager } from '../vault/vault-data-manager';
import type {
	StatsPeriod,
	StatsSnapshot,
	DomainStats,
	Flavor,
	Grade,
	DomainTag,
	MeridianState,
	DailyLogFrontmatter,
	InvestmentRecord,
} from '../../types';
import { STATS_PERIODS, GRADES } from '../../constants';

/** 纯数据聚合引擎 — 不依赖 DOM */

/** 根据 period 计算日期范围 [startDate, endDate] */
function computeDateRange(period: StatsPeriod, allDateKeys: string[]): { startDate: string; endDate: string } {
	const today = new Date();
	const endDate = formatDate(today);

	const cfg = STATS_PERIODS.find(p => p.value === period);
	if (!cfg || cfg.days < 0) {
		// 'all' — 使用最早日志日期
		const earliest = allDateKeys.length > 0 ? allDateKeys[0]! : endDate;
		return { startDate: earliest ?? endDate, endDate };
	}

	const start = new Date(today);
	start.setDate(start.getDate() - cfg.days + 1);
	return { startDate: formatDate(start), endDate };
}

function formatDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function gradeToNumber(g: Grade): number {
	return GRADES.indexOf(g);
}

/**
 * 生成统计快照
 */
export async function generateSnapshot(
	vdm: VaultDataManager,
	period: StatsPeriod,
): Promise<StatsSnapshot> {
	try {
		const allDateKeys = vdm.getLogDateKeys();
		const { startDate, endDate } = computeDateRange(period, allDateKeys);

		const logs = await vdm.getAllDailyLogs(startDate, endDate);
		const investmentRecords = await vdm.getInvestmentRecords();

		// 聚合
		let totalHerbs = 0;
		let totalCatalysts = 0;
		let totalPills = 0;
		const herbsByDomain: Record<string, number> = {};
		const herbsByFlavor: Record<Flavor, number> = { '神识': 0, '根骨': 0, '灵动': 0, '融合': 0 };
		const pillsByGrade: Record<Grade, number> = { '凡品': 0, '灵品': 0, '宝品': 0, '神品': 0 };
		let puritySum = 0;
		let gradeSum = 0;
		let pillCount = 0;
		let pomodoroCompleted = 0;
		let pomodoroInterrupted = 0;
		let totalFocusMinutes = 0;

		const activeDateSet = new Set<string>();
		const dailyMap = new Map<string, { herbs: number; pills: number; focus: number }>();

		// 需要领域标签来映射 flavor
		const domainTags = await vdm.getDomainTags();
		const domainFlavorMap = new Map<string, Flavor>();
		for (const dt of domainTags) {
			domainFlavorMap.set(dt.name, dt.flavor);
		}

		for (const log of logs) {
			const dateKey = log.日期;
			activeDateSet.add(dateKey);
			if (!dailyMap.has(dateKey)) {
				dailyMap.set(dateKey, { herbs: 0, pills: 0, focus: 0 });
			}
			const daily = dailyMap.get(dateKey)!;

			// 药材
			if (Array.isArray(log.药材)) {
				for (const herb of log.药材) {
					const qty = herb.数量 || 1;
					totalHerbs += qty;
					daily.herbs += qty;
					const domain = herb.领域 || '未知';
					herbsByDomain[domain] = (herbsByDomain[domain] || 0) + qty;
					const flavor = domainFlavorMap.get(domain);
					if (flavor && herbsByFlavor[flavor] !== undefined) {
						herbsByFlavor[flavor] += qty;
					}

					// 番茄钟统计: 来源为 pomodoro 的药材
					if (herb.来源 === 'pomodoro') {
						pomodoroCompleted++;
						totalFocusMinutes += 25; // 默认25分钟
					}
				}
			}

			// 药引
			if (Array.isArray(log.药引)) {
				for (const catalyst of log.药引) {
					totalCatalysts += catalyst.数量 || 1;
				}
			}

			// 丹药
			if (log.丹药) {
				totalPills++;
				daily.pills++;
				const pill = log.丹药;
				pillsByGrade[pill.品级] = (pillsByGrade[pill.品级] || 0) + 1;
				puritySum += pill.纯度 || 0;
				gradeSum += gradeToNumber(pill.品级);
				pillCount++;
			}
		}

		// 计算 streak
		const { streakCurrent, streakMax } = computeStreaks(activeDateSet);

		// 总天数
		const startD = new Date(startDate);
		const endD = new Date(endDate);
		const totalDays = Math.max(1, Math.floor((endD.getTime() - startD.getTime()) / 86400000) + 1);

		// 投注统计
		const investmentsByType: Record<string, number> = {};
		for (const record of investmentRecords) {
			if (record.investDate >= startDate && record.investDate <= endDate) {
				investmentsByType[record.type] = (investmentsByType[record.type] || 0) + 1;
			}
		}

		// dailyActivity
		const dailyActivity = buildDailyActivity(startDate, endDate, dailyMap);

		return {
			period,
			startDate,
			endDate,
			totalHerbs,
			totalCatalysts,
			totalPills,
			herbsByDomain,
			herbsByFlavor,
			pillsByGrade,
			avgPurity: pillCount > 0 ? puritySum / pillCount : 0,
			avgGrade: pillCount > 0 ? gradeSum / pillCount : 0,
			activeDays: activeDateSet.size,
			totalDays,
			streakCurrent,
			streakMax,
			pomodoroCompleted,
			pomodoroInterrupted,
			totalFocusMinutes,
			investmentsByType,
			dailyActivity,
		};
	} catch (e) {
		console.error('[StatsEngine] generateSnapshot error:', e);
		return emptySnapshot(period);
	}
}

/**
 * 获取领域统计
 */
export async function getDomainStatsData(
	vdm: VaultDataManager,
	domainTags: DomainTag[],
	meridians: MeridianState[],
): Promise<DomainStats[]> {
	try {
		const logs = await vdm.getAllDailyLogs();
		const results: DomainStats[] = [];

		for (const dt of domainTags) {
			let totalHerbs = 0;
			let totalPills = 0;

			for (const log of logs) {
				if (Array.isArray(log.药材)) {
					for (const herb of log.药材) {
						if (herb.领域 === dt.name) {
							totalHerbs += herb.数量 || 1;
						}
					}
				}
				if (log.丹药 && log.丹药.君药领域 === dt.name) {
					totalPills++;
				}
			}

			const meridian = meridians.find(m => m.domainTag === dt.name);

			results.push({
				domain: dt.name,
				flavor: dt.flavor,
				totalHerbs,
				totalPills,
				meridianLevel: meridian?.level ?? 0,
				meridianProgress: meridian?.progress ?? 0,
			});
		}
		return results;
	} catch (e) {
		console.error('[StatsEngine] getDomainStatsData error:', e);
		return [];
	}
}

// ============ 内部工具函数 ============

function computeStreaks(activeDates: Set<string>): { streakCurrent: number; streakMax: number } {
	if (activeDates.size === 0) return { streakCurrent: 0, streakMax: 0 };

	const sorted = Array.from(activeDates).sort();
	let maxStreak = 1;
	let currentStreak = 1;

	for (let i = 1; i < sorted.length; i++) {
		const prev = new Date(sorted[i - 1]!);
		const curr = new Date(sorted[i]!);
		const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000);
		if (diffDays === 1) {
			currentStreak++;
			maxStreak = Math.max(maxStreak, currentStreak);
		} else {
			currentStreak = 1;
		}
	}

	// 计算从今天往回的连续天数
	const today = formatDate(new Date());
	let streakCurrent = 0;
	let checkDate = new Date();
	while (true) {
		const key = formatDate(checkDate);
		if (activeDates.has(key)) {
			streakCurrent++;
			checkDate.setDate(checkDate.getDate() - 1);
		} else {
			break;
		}
	}

	return { streakCurrent, streakMax: Math.max(maxStreak, streakCurrent) };
}

function buildDailyActivity(
	startDate: string,
	endDate: string,
	dailyMap: Map<string, { herbs: number; pills: number; focus: number }>,
): Array<{ date: string; herbs: number; pills: number; focus: number }> {
	const result: Array<{ date: string; herbs: number; pills: number; focus: number }> = [];
	const current = new Date(startDate);
	const end = new Date(endDate);

	while (current <= end) {
		const key = formatDate(current);
		const data = dailyMap.get(key) || { herbs: 0, pills: 0, focus: 0 };
		result.push({ date: key, ...data });
		current.setDate(current.getDate() + 1);
	}
	return result;
}

function emptySnapshot(period: StatsPeriod): StatsSnapshot {
	const today = formatDate(new Date());
	return {
		period,
		startDate: today,
		endDate: today,
		totalHerbs: 0,
		totalCatalysts: 0,
		totalPills: 0,
		herbsByDomain: {},
		herbsByFlavor: { '神识': 0, '根骨': 0, '灵动': 0, '融合': 0 },
		pillsByGrade: { '凡品': 0, '灵品': 0, '宝品': 0, '神品': 0 },
		avgPurity: 0,
		avgGrade: 0,
		activeDays: 0,
		totalDays: 1,
		streakCurrent: 0,
		streakMax: 0,
		pomodoroCompleted: 0,
		pomodoroInterrupted: 0,
		totalFocusMinutes: 0,
		investmentsByType: {},
		dailyActivity: [],
	};
}
