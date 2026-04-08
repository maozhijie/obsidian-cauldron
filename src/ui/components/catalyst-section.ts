import type { ViewSection, SectionContext } from './section-base';
import type { CatalystRecord } from '../../types';
import { CATALYST_ICONS } from '../../constants';

export class CatalystSection implements ViewSection {
	private catalysts: CatalystRecord[] = [];

	setData(catalysts: CatalystRecord[]): void {
		this.catalysts = catalysts;
	}

	async render(ctx: SectionContext): Promise<void> {
		const section = ctx.container.createDiv({ cls: 'dandao-section dandao-catalysts' });
		section.createEl('h5', { text: '🧪 今日引囊' });

		if (this.catalysts.length === 0) {
			section.createDiv({
				text: '今日尚无药引',
				cls: 'catalyst-empty',
			});
			return;
		}

		const counts = this.countCatalysts();
		const list = section.createDiv({ cls: 'catalyst-list' });

		for (const [type, count] of counts) {
			const icon = CATALYST_ICONS[type] ?? '🔹';
			list.createEl('span', {
				text: `${icon} ${type} x${count}`,
				cls: 'catalyst-item',
			});
		}
	}

	private countCatalysts(): Map<string, number> {
		const map = new Map<string, number>();
		for (const c of this.catalysts) {
			map.set(c.类型, (map.get(c.类型) ?? 0) + c.数量);
		}
		return map;
	}
}
