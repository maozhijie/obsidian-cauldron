import { App, Modal } from 'obsidian';
import type { MultiCycleFurnace, FurnaceCycleType } from '../../types';
import { MultiCycleManager } from '../../core/multi-cycle-manager';
import { VaultDataManager } from '../../core/vault/vault-data-manager';

/** 周期类型标签 */
const CYCLE_LABELS: Record<FurnaceCycleType, string> = {
	daily: '日炉',
	weekly: '周炉',
	monthly: '月炉',
	project: '项目炉',
};

const CYCLE_ICONS: Record<FurnaceCycleType, string> = {
	daily: '☀️',
	weekly: '📅',
	monthly: '🗓️',
	project: '📦',
};

/**
 * MultiCycleModal — 周期炉管理弹窗。
 * 列出活跃周期炉，支持创建新炉、查看详情、手动封炉。
 */
export class MultiCycleModal extends Modal {
	private vaultDataManager: VaultDataManager;
	private multiCycleManager: MultiCycleManager;

	constructor(app: App, vaultDataManager: VaultDataManager) {
		super(app);
		this.vaultDataManager = vaultDataManager;
		this.multiCycleManager = new MultiCycleManager(vaultDataManager);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('multi-cycle-modal');

		contentEl.createEl('h2', { cls: 'multi-cycle-title' }).setText('周期炉管理');

		try {
			await this.renderContent(contentEl);
		} catch {
			contentEl.createEl('p', { cls: 'dandao-empty' }).setText('加载周期炉数据失败');
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async renderContent(contentEl: HTMLElement): Promise<void> {
		// 创建新周期炉
		this.renderCreateSection(contentEl);

		// 活跃周期炉列表
		const furnaces = await this.multiCycleManager.getActiveFurnaces();

		const listSection = contentEl.createDiv({ cls: 'multi-cycle-list-section' });
		listSection.createEl('h4').setText(`活跃周期炉 (${furnaces.length})`);

		if (furnaces.length === 0) {
			listSection.createDiv({ cls: 'dandao-empty' }).setText('暂无活跃周期炉');
			return;
		}

		const list = listSection.createDiv({ cls: 'multi-cycle-list' });
		for (const furnace of furnaces) {
			this.renderFurnaceCard(list, furnace);
		}

		// 已封炉列表
		const allFurnaces = await this.vaultDataManager.listMultiCycleFurnaces();
		const sealed = allFurnaces.filter(f => f.status === 'sealed');
		if (sealed.length > 0) {
			const sealedSection = contentEl.createDiv({ cls: 'multi-cycle-sealed-section' });
			sealedSection.createEl('h4').setText(`已封炉 (${sealed.length})`);
			const sealedList = sealedSection.createDiv({ cls: 'multi-cycle-list' });
			for (const furnace of sealed.slice(0, 10)) {
				this.renderFurnaceCard(sealedList, furnace);
			}
		}
	}

	private renderCreateSection(contentEl: HTMLElement): void {
		const createSection = contentEl.createDiv({ cls: 'multi-cycle-create' });

		const types: FurnaceCycleType[] = ['weekly', 'monthly', 'project'];
		for (const type of types) {
			const btn = createSection.createEl('button', { cls: 'multi-cycle-create-btn' });
			btn.setText(`${CYCLE_ICONS[type]} 新建${CYCLE_LABELS[type]}`);
			btn.addEventListener('click', async () => {
				try {
					await this.multiCycleManager.createFurnace(type);
					// 重新渲染
					await this.onOpen();
				} catch {
					// silently ignore
				}
			});
		}
	}

	private renderFurnaceCard(container: HTMLElement, furnace: MultiCycleFurnace): void {
		const card = container.createDiv({ cls: `multi-cycle-card cycle-${furnace.status}` });

		const header = card.createDiv({ cls: 'cycle-card-header' });
		const icon = CYCLE_ICONS[furnace.type] ?? '🔥';
		const label = CYCLE_LABELS[furnace.type] ?? furnace.type;
		header.createEl('span', { cls: 'cycle-type-icon' }).setText(icon);
		header.createEl('span', { cls: 'cycle-type-label' }).setText(label);

		if (furnace.status === 'sealed') {
			header.createEl('span', { cls: 'cycle-status-sealed' }).setText('已封');
		}

		const info = card.createDiv({ cls: 'cycle-card-info' });
		info.createDiv({ cls: 'cycle-date' }).setText(
			`${furnace.startDate}${furnace.endDate ? ` → ${furnace.endDate}` : ' → 进行中'}`,
		);

		if (furnace.pill) {
			info.createDiv({ cls: 'cycle-pill-info' }).setText(
				`丹药：${furnace.pill.名称} (${furnace.pill.品级})`,
			);
		}

		// 手动封炉按钮（仅活跃状态）
		if (furnace.status === 'active') {
			const sealBtn = card.createEl('button', { cls: 'cycle-seal-btn' });
			sealBtn.setText('手动封炉');
			sealBtn.addEventListener('click', async (e) => {
				e.stopPropagation();
				try {
					await this.multiCycleManager.sealFurnace(furnace.id);
					await this.onOpen();
				} catch {
					// silently ignore
				}
			});
		}
	}
}
