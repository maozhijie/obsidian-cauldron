import type {
	DailyLogFrontmatter,
	PillRecord,
} from '../../types';
import {
	CATALYST_ICONS,
	FLAVOR_ICONS,
} from '../../constants';

/**
 * VaultMarkdownBuilder — 生成 Markdown 正文
 * 
 * 精简后仅保留日志内容生成（可选使用）
 * 领域/种子/项目/目标/修炼档案等数据现在存储在独立标签笔记或 data.json 中
 */
export class VaultMarkdownBuilder {
	// ----------------------------------------------------------------
	// 日志正文（可选使用）
	// ----------------------------------------------------------------

	/** 根据 frontmatter 数据生成可读的 Markdown 正文 */
	generateLogContent(data: DailyLogFrontmatter): string {
		const lines: string[] = [];
		lines.push(`# ${data.日期} 修炼日志`);
		lines.push('');

		// 药材
		lines.push('## 今日药材');
		if (data.药材.length === 0) {
			lines.push('_今日尚未采集药材_');
		} else {
			for (const h of data.药材) {
				const flavor = this.getFlavorForDomain(h.领域);
				const icon = (FLAVOR_ICONS as Record<string, string>)[flavor] ?? '🌿';
				const desc = h.来源任务 ? ` — ${h.来源任务}` : '';
				lines.push(`- ${icon} ${h.领域} (${h.稀有度}) x${h.数量}${desc}`);
			}
		}
		lines.push('');

		// 药引
		lines.push('## 今日药引');
		if (data.药引.length === 0) {
			lines.push('_今日尚无药引_');
		} else {
			const catalystMap = new Map<string, number>();
			for (const c of data.药引) {
				catalystMap.set(c.类型, (catalystMap.get(c.类型) ?? 0) + c.数量);
			}
			for (const [type, count] of catalystMap) {
				const icon = CATALYST_ICONS[type] ?? '🔹';
				lines.push(`- ${icon} ${type} x${count}`);
			}
		}
		lines.push('');

		// 丹药
		lines.push('## 丹药');
		if (data.丹药) {
			const p = data.丹药;
			const purity = Math.round(p.纯度 * 100);
			lines.push(
				`**【${p.主性味}·${p.品级}】${p.名称}** | 纯度 ${purity}% | 药材总量 ${p.药材总量}`,
			);
		} else if (data.封炉状态 === '已封炉') {
			lines.push('_今日未产出丹药_');
		} else {
			lines.push('_尚未封炉_');
		}
		lines.push('');

		return lines.join('\n');
	}

	// ----------------------------------------------------------------
	// 辅助方法
	// ----------------------------------------------------------------

	private appendPillInfo(lines: string[], p: PillRecord): void {
		const purity = Math.round(p.纯度 * 100);
		lines.push(`**【${p.主性味}·${p.品级}】${p.名称}** | 纯度 ${purity}% | 药材总量 ${p.药材总量}`);
	}

	/**
	 * 获取领域对应的性味（用于图标查找）。
	 * 默认返回 '神识'，调用方可以传入完整的 tag 信息。
	 */
	private getFlavorForDomain(_domain: string): string {
		return '神识';
	}
}
