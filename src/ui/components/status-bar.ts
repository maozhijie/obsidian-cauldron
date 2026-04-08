import type { ViewSection, SectionContext } from './section-base';
import type { HerbRecord } from '../../types';

export class StatusBarSection implements ViewSection {
	private herbs: HerbRecord[] = [];
	private unviewedCount = 0;

	setData(herbs: HerbRecord[], unviewedCount: number): void {
		this.herbs = herbs;
		this.unviewedCount = unviewedCount;
	}

	async render(ctx: SectionContext): Promise<void> {
		const bar = ctx.container.createDiv({ cls: 'dandao-status-bar' });

		// 距封炉
		const sealItem = bar.createDiv({ cls: 'status-item' });
		sealItem.createEl('span', { text: '距封炉', cls: 'status-label' });
		sealItem.createEl('span', { text: this.getTimeUntilSeal(ctx.sealTime), cls: 'status-value' });

		// 今日药材
		const herbCount = this.herbs.reduce((sum, h) => sum + h.数量, 0);
		const herbItem = bar.createDiv({ cls: 'status-item' });
		herbItem.createEl('span', { text: '今日药材', cls: 'status-label' });
		herbItem.createEl('span', { text: `${herbCount} 份`, cls: 'status-value' });

		// 待查看丹药
		const pillItem = bar.createDiv({ cls: 'status-item' });
		pillItem.createEl('span', { text: '待查看丹药', cls: 'status-label' });
		pillItem.createEl('span', { text: `${this.unviewedCount} 颗`, cls: 'status-value' });
	}

	private getTimeUntilSeal(sealTime: string): string {
		const now = new Date();
		const parts = sealTime.split(':').map(Number);
		const hours = parts[0] ?? 23;
		const minutes = parts[1] ?? 0;
		const sealDate = new Date(now);
		sealDate.setHours(hours, minutes, 0, 0);
		if (sealDate <= now) {
			sealDate.setDate(sealDate.getDate() + 1);
		}
		const diffMs = sealDate.getTime() - now.getTime();
		const diffH = Math.floor(diffMs / 3600000);
		const diffM = Math.floor((diffMs % 3600000) / 60000);
		return `${diffH}小时${diffM}分`;
	}
}
