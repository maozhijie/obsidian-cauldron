import type { ViewSection, SectionContext } from './section-base';
import type { PillRecord, Grade, PillPattern } from '../../types';
import { GRADE_COLORS } from '../../constants';

/** 丹纹稀有度颜色 */
const PATTERN_RARITY_COLORS: Record<string, string> = {
	common: '#2196F3',
	rare: '#9C27B0',
	legendary: '#FF9800',
};

const PATTERN_RARITY_LABELS: Record<string, string> = {
	common: '普通',
	rare: '稀有',
	legendary: '传说',
};

export class PillSection implements ViewSection {
	private pill?: PillRecord;
	private unviewedPills: Array<{ dateKey: string; pill: PillRecord }> = [];

	setData(
		pill: PillRecord | undefined,
		unviewedPills: Array<{ dateKey: string; pill: PillRecord }>,
	): void {
		this.pill = pill;
		this.unviewedPills = unviewedPills;
	}

	async render(ctx: SectionContext): Promise<void> {
		const section = ctx.container.createDiv({ cls: 'dandao-section dandao-pills' });
		section.createEl('h5', { text: '💊 丹囊' });

		if (this.pill) {
			this.renderPillPreview(section, this.pill);
		} else if (this.unviewedPills.length > 0) {
			const latest = this.unviewedPills[this.unviewedPills.length - 1]!;
			this.renderPillPreview(section, latest.pill);
		} else {
			section.createDiv({ text: '尚无丹药', cls: 'pill-empty' });
		}

		const listBtn = section.createEl('button', {
			text: '查看全部丹药 →',
			cls: 'pill-list-btn',
		});
		listBtn.addEventListener('click', () => {
			// 将在后续任务中实现丹药列表弹窗
		});
	}

	private renderPillPreview(section: HTMLElement, pill: PillRecord): void {
		const preview = section.createDiv({ cls: 'pill-preview' });

		const nameSpan = preview.createEl('span', {
			text: `【${pill.主性味}·${pill.品级}】${pill.名称}`,
			cls: 'pill-name',
		});
		const gradeColor = GRADE_COLORS[pill.品级 as Grade];
		if (gradeColor) {
			nameSpan.style.color = gradeColor;
		}

		const purity = Math.round(pill.纯度 * 100);
		preview.createEl('span', {
			text: `纯度 ${purity}% | 药材 ${pill.药材总量}份`,
			cls: 'pill-meta',
		});

		// 丹纹徽章
		if (pill.丹纹) {
			this.renderPatternBadge(preview, pill.丹纹);
		}
	}

	private renderPatternBadge(parent: HTMLElement, pattern: PillPattern): void {
		const badge = parent.createDiv({ cls: `pill-pattern-badge pattern-${pattern.rarity}` });
		const color = PATTERN_RARITY_COLORS[pattern.rarity] ?? '#2196F3';
		badge.style.borderColor = color;
		badge.style.color = color;

		const rarityLabel = PATTERN_RARITY_LABELS[pattern.rarity] ?? '普通';
		badge.createEl('span', { text: `✦ ${pattern.name}`, cls: 'pattern-name' });
		badge.createEl('span', { text: rarityLabel, cls: 'pattern-rarity' });

		badge.title = `${pattern.description}\n效果：${pattern.effect}`;
	}
}
