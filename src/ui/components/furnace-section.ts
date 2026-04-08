import type { ViewSection, SectionContext } from './section-base';
import type { FurnaceState } from '../../types';
import { FurnaceManager } from '../../core/furnace-manager';

/** 丹炉等级称号 */
const FURNACE_TITLES: Record<number, string> = {
	1: '泥炉',
	2: '铁炉',
	3: '铜炉',
	4: '银炉',
	5: '金炉',
	6: '玄铁炉',
	7: '紫金炉',
	8: '太乙炉',
	9: '混元炉',
	10: '鸿蒙炉',
};

export class FurnaceSection implements ViewSection {
	async render(ctx: SectionContext): Promise<void> {
		const section = ctx.container.createDiv({ cls: 'dandao-section dandao-furnace' });
		section.createEl('h5', { text: '🔥 丹炉' });

		if (!ctx.vaultDataManager) {
			section.createDiv({ text: '数据未就绪', cls: 'dandao-empty' });
			return;
		}

		try {
			const plugin = ctx.plugin;
			if (!plugin) {
				section.createDiv({ text: '插件未初始化', cls: 'dandao-empty' });
				return;
			}
			const furnaceManager = new FurnaceManager(plugin);
			const state = await furnaceManager.getState();

			this.renderFurnaceInfo(section, state, furnaceManager);
		} catch {
			section.createDiv({ text: '丹炉数据加载失败', cls: 'dandao-empty' });
		}
	}

	private renderFurnaceInfo(
		section: HTMLElement,
		state: FurnaceState,
		fm: FurnaceManager,
	): void {
		const title = FURNACE_TITLES[state.level] ?? `${state.level}级丹炉`;
		const card = section.createDiv({ cls: 'furnace-card' });

		// 等级 + 称号
		const header = card.createDiv({ cls: 'furnace-card-header' });
		header.createEl('span', { text: `Lv.${state.level}`, cls: 'furnace-level' });
		header.createEl('span', { text: title, cls: 'furnace-title' });

		// 经验条
		const xpBar = card.createDiv({ cls: 'furnace-xp-bar' });
		const xpFill = xpBar.createDiv({ cls: 'furnace-xp-fill' });
		const xpPercent = state.xpToNextLevel > 0
			? Math.min(100, Math.round((state.xp / state.xpToNextLevel) * 100))
			: 100;
		xpFill.style.width = `${xpPercent}%`;

		card.createDiv({
			text: `经验 ${state.xp} / ${state.xpToNextLevel}`,
			cls: 'furnace-xp-text',
		});

		// 加成展示
		const bonuses = card.createDiv({ cls: 'furnace-bonuses' });

		const gradeBonus = fm.getGradeBonus(state);
		this.createBonusItem(bonuses, '品级加成', gradeBonus > 0 ? `+${gradeBonus}` : '—');

		const purityFloor = fm.getPurityFloor(state);
		const purityPct = Math.round(purityFloor * 100);
		this.createBonusItem(bonuses, '纯度下限', purityPct > 0 ? `${purityPct}%` : '—');

		const patternChance = fm.getPatternChance(state);
		const patternPct = Math.round(patternChance * 100);
		this.createBonusItem(bonuses, '丹纹概率', patternPct > 0 ? `+${patternPct}%` : '—');

		// 总炼丹数
		card.createDiv({
			text: `累计炼丹：${state.totalPillsRefined} 次`,
			cls: 'furnace-total',
		});
	}

	private createBonusItem(parent: HTMLElement, label: string, value: string): void {
		const item = parent.createDiv({ cls: 'furnace-bonus-item' });
		item.createEl('span', { text: label, cls: 'furnace-bonus-label' });
		item.createEl('span', { text: value, cls: 'furnace-bonus-value' });
	}
}
