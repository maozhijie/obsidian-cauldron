import type { ViewSection, SectionContext } from './section-base';
import type { HerbRecord, Flavor, AgingStatus } from '../../types';
import { FLAVOR_COLORS } from '../../constants';
import { calculateAgingStatus } from '../../core/aging-engine';

/** 陈化状态配置 */
const AGING_CONFIG: Record<AgingStatus, { label: string; cls: string }> = {
	fresh:   { label: '新鲜', cls: 'herb-aging-fresh' },
	aging:   { label: '陈化中', cls: 'herb-aging-aging' },
	mature:  { label: '成熟', cls: 'herb-aging-mature' },
	expired: { label: '过期', cls: 'herb-aging-expired' },
};

export class HerbSection implements ViewSection {
	private herbs: HerbRecord[] = [];

	setData(herbs: HerbRecord[]): void {
		this.herbs = herbs;
	}

	async render(ctx: SectionContext): Promise<void> {
		const section = ctx.container.createDiv({ cls: 'dandao-section dandao-herbs' });
		section.createEl('h5', { text: '📦 今日药篓' });

		if (this.herbs.length === 0) {
			section.createDiv({
				text: '今日尚未采集药材，完成任务或番茄钟即可获得',
				cls: 'herb-empty',
			});
			return;
		}

		const todayKey = this.getTodayKey();
		const grouped = this.groupHerbsByDomain(ctx, todayKey);
		const list = section.createDiv({ cls: 'herb-list' });

		for (const [domain, info] of grouped) {
			const agingCfg = AGING_CONFIG[info.agingStatus];
			const itemCls = `herb-item ${agingCfg.cls}`;
			const item = list.createDiv({ cls: itemCls });

			item.createEl('span', { text: '🌿', cls: 'herb-icon' });

			const domainSpan = item.createEl('span', { text: domain, cls: 'herb-domain' });
			if (info.agingStatus === 'expired') {
				domainSpan.style.textDecoration = 'line-through';
			}

			const flavorSpan = item.createEl('span', {
				text: `(${info.flavor})`,
				cls: 'herb-flavor',
			});
			const flavorColor = FLAVOR_COLORS[info.flavor as Flavor];
			if (flavorColor) {
				flavorSpan.style.color = flavorColor;
			}

			// 陈化状态标识
			item.createEl('span', {
				text: agingCfg.label,
				cls: `herb-aging-badge ${agingCfg.cls}`,
			});

			// 有效期倒计时
			if (info.expiryText) {
				item.createEl('span', {
					text: info.expiryText,
					cls: 'herb-expiry',
				});
			}

			item.createEl('span', { text: `x${info.quantity}`, cls: 'herb-quantity' });
		}
	}

	private groupHerbsByDomain(
		ctx: SectionContext,
		todayKey: string,
	): Map<string, { flavor: string; quantity: number; agingStatus: AgingStatus; expiryText: string }> {
		const map = new Map<string, { flavor: string; quantity: number; agingStatus: AgingStatus; expiryText: string }>();
		for (const h of this.herbs) {
			const existing = map.get(h.领域);
			if (existing) {
				existing.quantity += h.数量;
			} else {
				const flavor = ctx.domainTagManager?.getFlavorForTag(h.领域) ?? '神识';
				const agingStatus = h.陈化状态 ?? calculateAgingStatus(h, todayKey);
				const expiryText = this.getExpiryText(h, todayKey);
				map.set(h.领域, { flavor, quantity: h.数量, agingStatus, expiryText });
			}
		}
		return map;
	}

	private getExpiryText(herb: HerbRecord, todayKey: string): string {
		if (!herb.有效期) return '';
		const today = new Date(todayKey);
		const expiry = new Date(herb.有效期);
		today.setHours(0, 0, 0, 0);
		expiry.setHours(0, 0, 0, 0);
		const diffDays = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
		if (diffDays < 0) return '已过期';
		if (diffDays === 0) return '今日到期';
		return `还剩${diffDays}天`;
	}

	private getTodayKey(): string {
		const now = new Date();
		const y = now.getFullYear();
		const m = String(now.getMonth() + 1).padStart(2, '0');
		const d = String(now.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
}
