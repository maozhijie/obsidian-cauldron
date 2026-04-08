import type {
	DailyLogFrontmatter,
	DomainTag,
	Project,
	TaskTemplate,
	Character,
	InvestmentRecord,
	Seed,
	Goal,
	CultivationState,
	FurnaceState,
	MeridianState,
	MultiCycleFurnace,
	PillRecord,
} from '../../types';
import {
	CATALYST_ICONS,
	FLAVOR_ICONS,
} from '../../constants';

/**
 * VaultMarkdownBuilder — 生成各种 Vault 数据文件的可读 Markdown 正文。
 * 所有 `generateXxx()` 方法均为纯函数，不访问 Vault。
 */
export class VaultMarkdownBuilder {
	// ----------------------------------------------------------------
	// 日志正文
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
	// 领域配置正文
	// ----------------------------------------------------------------

	generateDomainConfigBody(tags: DomainTag[]): string {
		const lines: string[] = [];
		lines.push('# 领域配置');
		lines.push('');
		if (tags.length === 0) {
			lines.push('_暂无领域标签，请在设置中添加。_');
		} else {
			for (const tag of tags) {
				const icon = FLAVOR_ICONS[tag.flavor] ?? '🔹';
				const colorHint = tag.color ? ` (${tag.color})` : '';
				lines.push(`- ${icon} **${tag.name}** — 性味：${tag.flavor}${colorHint}`);
			}
		}
		lines.push('');
		return lines.join('\n');
	}

	// ----------------------------------------------------------------
	// 投注系统正文
	// ----------------------------------------------------------------

	generateProjectsBody(projects: Project[]): string {
		const lines: string[] = ['# 项目列表', ''];
		if (projects.length === 0) {
			lines.push('_暂无项目_');
		} else {
			for (const p of projects) {
				const status = p.isActive ? '🟢 活跃' : '⚪ 归档';
				lines.push(`## ${p.name}`);
				lines.push(`- 状态：${status}`);
				lines.push(`- 描述：${p.description || '无'}`);
				lines.push(`- 创建日期：${p.createdDate}`);
				if (p.boosts.length > 0) {
					lines.push('- 增益：');
					for (const b of p.boosts) {
						lines.push(`  - 💊 ${b.pillName} (${b.investDate} → ${b.expiryDate}): ${b.effect}`);
					}
				}
				lines.push('');
			}
		}
		lines.push('');
		return lines.join('\n');
	}

	generateTemplatesBody(templates: TaskTemplate[]): string {
		const lines: string[] = ['# 任务模板', ''];
		if (templates.length === 0) {
			lines.push('_暂无模板_');
		} else {
			for (const t of templates) {
				lines.push(`- **${t.name}** — ${t.description || '无描述'} | 投注等级 ${t.investmentLevel} | 累计投注 ${t.totalInvestments}`);
			}
		}
		lines.push('');
		return lines.join('\n');
	}

	generateCharactersBody(characters: Character[]): string {
		const lines: string[] = ['# 角色列表', ''];
		if (characters.length === 0) {
			lines.push('_暂无角色_');
		} else {
			for (const c of characters) {
				lines.push(`- **${c.name}** — 等级 ${c.level} | 经验 ${c.xp}`);
			}
		}
		lines.push('');
		return lines.join('\n');
	}

	generateInvestmentRecordsBody(records: InvestmentRecord[]): string {
		const lines: string[] = ['# 投注记录', ''];
		if (records.length === 0) {
			lines.push('_暂无投注记录_');
		} else {
			for (const r of records) {
				const pill = r.pillRecord;
				lines.push(`- ${r.investDate} | ${r.type} → ${r.targetName} | 💊 ${pill.名称} (${pill.品级})`);
			}
		}
		lines.push('');
		return lines.join('\n');
	}

	// ----------------------------------------------------------------
	// 播种层正文
	// ----------------------------------------------------------------

	generateSeedsBody(seeds: Seed[]): string {
		const lines: string[] = ['# 种子池', ''];
		if (seeds.length === 0) {
			lines.push('_种子池为空_');
		} else {
			const pending = seeds.filter(s => s.status === 'pending');
			const converted = seeds.filter(s => s.status === 'converted');
			const discarded = seeds.filter(s => s.status === 'discarded');

			if (pending.length > 0) {
				lines.push('## 待处理');
				for (const s of pending) {
					const tags = s.tags?.length ? ` [${s.tags.join(', ')}]` : '';
					lines.push(`- 🌱 ${s.text}${tags} _(${s.createdDate})_`);
				}
				lines.push('');
			}
			if (converted.length > 0) {
				lines.push('## 已转化');
				for (const s of converted) {
					lines.push(`- ✅ ${s.text} → ${s.convertedTaskPath || '未知'}`);
				}
				lines.push('');
			}
			if (discarded.length > 0) {
				lines.push('## 已丢弃');
				for (const s of discarded) {
					lines.push(`- ❌ ${s.text}`);
				}
				lines.push('');
			}
		}
		lines.push('');
		return lines.join('\n');
	}

	generateGoalsBody(goals: Goal[]): string {
		const lines: string[] = ['# 目标列表', ''];
		if (goals.length === 0) {
			lines.push('_暂无目标_');
		} else {
			for (const g of goals) {
				const pct = g.targetValue > 0 ? Math.round((g.currentValue / g.targetValue) * 100) : 0;
				const bar = this.progressBar(pct);
				lines.push(`- **${g.name}** ${bar} ${g.currentValue}/${g.targetValue} ${g.unit} (${pct}%)`);
			}
		}
		lines.push('');
		return lines.join('\n');
	}

	// ----------------------------------------------------------------
	// 修炼系统正文
	// ----------------------------------------------------------------

	generateCultivationBody(
		cultivation: CultivationState,
		furnace: FurnaceState,
		meridians: MeridianState[],
	): string {
		const lines: string[] = ['# 修炼档案', ''];

		// 境界
		lines.push('## 境界');
		lines.push(`- 当前境界：**${cultivation.realm} · 第${cultivation.realmLevel}层**`);
		lines.push(`- 累计修炼经验：${cultivation.totalXp}`);
		lines.push(`- 当前境界经验：${cultivation.currentRealmXp} / ${cultivation.xpToNextLevel}`);
		lines.push(`- 心境值：${cultivation.heartStateValue}`);
		lines.push(`- 突破尝试次数：${cultivation.breakthroughAttempts}`);
		if (cultivation.unlockedFeatures.length > 0) {
			lines.push(`- 已解锁：${cultivation.unlockedFeatures.join('、')}`);
		}
		lines.push('');

		// 丹炉
		lines.push('## 丹炉');
		lines.push(`- 等级：${furnace.level}`);
		lines.push(`- 经验：${furnace.xp} / ${furnace.xpToNextLevel}`);
		lines.push(`- 累计炼丹数：${furnace.totalPillsRefined}`);
		lines.push('');

		// 经脉
		lines.push('## 经脉');
		if (meridians.length === 0) {
			lines.push('_暂无经脉数据_');
		} else {
			for (const m of meridians) {
				const pct = Math.round(m.progress * 100);
				lines.push(`- **${m.domainTag}** — 等级 ${m.level} | 投资 ${m.totalInvestment} | 进度 ${pct}%`);
			}
		}
		lines.push('');
		return lines.join('\n');
	}

	// ----------------------------------------------------------------
	// 多周期丹炉正文
	// ----------------------------------------------------------------

	generateMultiCycleFurnaceBody(furnace: MultiCycleFurnace): string {
		const lines: string[] = [`# ${furnace.type}炉 · ${furnace.id}`, ''];
		lines.push(`- 类型：${furnace.type}`);
		lines.push(`- 状态：${furnace.status === 'active' ? '🔥 运行中' : '🔒 已封炉'}`);
		lines.push(`- 开始日期：${furnace.startDate}`);
		if (furnace.endDate) lines.push(`- 结束日期：${furnace.endDate}`);
		if (furnace.projectId) lines.push(`- 关联项目：${furnace.projectId}`);
		if (furnace.pill) {
			lines.push('');
			lines.push('## 产出丹药');
			this.appendPillInfo(lines, furnace.pill);
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

	private progressBar(pct: number): string {
		const filled = Math.round(pct / 10);
		const empty = 10 - filled;
		return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
	}

	/**
	 * 获取领域对应的性味（用于图标查找）。
	 * 默认返回 '神识'，调用方可以传入完整的 tag 信息。
	 */
	private getFlavorForDomain(_domain: string): string {
		return '神识';
	}
}
