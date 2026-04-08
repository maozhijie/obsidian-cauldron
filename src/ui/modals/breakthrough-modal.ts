import { App, Modal } from 'obsidian';
import type { CultivationState, CultivationRealm, BreakthroughCondition } from '../../types';
import { BreakthroughEngine } from '../../core/cultivation/breakthrough-engine';
import { EventBus } from '../../core/event-bus';
import type { VaultDataManager } from '../../core/vault/vault-data-manager';

/** 境界主题色 */
const REALM_COLORS: Record<CultivationRealm, string> = {
	'练气': '#66BB6A',
	'筑基': '#42A5F5',
	'金丹': '#FFA726',
	'元婴': '#9C27B0',
	'化神': '#FF5722',
};

/** 境界顺序 */
const REALM_ORDER: CultivationRealm[] = ['练气', '筑基', '金丹', '元婴', '化神'];

/**
 * BreakthroughModal — 突破仪式模态框。
 * 显示条件检查、尝试突破、展示成功/失败结果。
 */
export class BreakthroughModal extends Modal {
	private vaultDataManager: VaultDataManager;
	private state: CultivationState;

	constructor(app: App, vaultDataManager: VaultDataManager, state: CultivationState) {
		super(app);
		this.vaultDataManager = vaultDataManager;
		this.state = state;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		const state = this.state;
		const eventBus = new EventBus();
		const engine = new BreakthroughEngine(this.vaultDataManager, eventBus);

		const container = contentEl.createDiv({ cls: 'bt-container' });

		// 顶部：当前境界 → 目标境界
		const currentColor = REALM_COLORS[state.realm];
		const nextRealm = this.getNextRealm(state.realm);
		const nextColor = nextRealm ? REALM_COLORS[nextRealm] : currentColor;

		const header = container.createDiv({ cls: 'bt-header' });
		const fromEl = header.createSpan({ cls: 'bt-realm-from' });
		fromEl.setText(state.realm);
		fromEl.style.color = currentColor;
		header.createSpan({ cls: 'bt-arrow' }).setText('→');
		const toEl = header.createSpan({ cls: 'bt-realm-to' });
		toEl.setText(nextRealm ?? '已至巅峰');
		toEl.style.color = nextColor;

		// 中部：条件列表
		let conditions: BreakthroughCondition[] = [];
		try {
			const meridians = await this.vaultDataManager.getMeridianStates();
			conditions = await engine.getConditions(state, meridians);
		} catch {
			container.createDiv({ cls: 'dandao-empty' }).setText('条件加载失败');
		}

		const condSection = container.createDiv({ cls: 'bt-conditions' });
		condSection.createEl('h4').setText('突破条件');

		for (const c of conditions) {
			const row = condSection.createDiv({ cls: `bt-cond-row ${c.met ? 'met' : 'unmet'}` });
			row.createSpan({ cls: 'bt-cond-icon' }).setText(c.met ? '✓' : '✗');
			row.createSpan({ cls: 'bt-cond-desc' }).setText(c.description);
			row.createSpan({ cls: 'bt-cond-val' }).setText(`${c.current}/${c.required}`);
		}

		const allMet = conditions.length > 0 && conditions.every(c => c.met);

		// 结果区（初始隐藏）
		const resultArea = container.createDiv({ cls: 'bt-result' });
		resultArea.style.display = 'none';

		// 按钮区
		const actions = container.createDiv({ cls: 'bt-actions' });
		const btn = actions.createEl('button', { cls: 'bt-attempt-btn' });
		btn.setText('尝试突破');
		if (!allMet) {
			btn.disabled = true;
			btn.addClass('disabled');
		}

		btn.addEventListener('click', async () => {
			btn.disabled = true;
			btn.setText('突破中…');

			try {
				const result = await engine.attemptBreakthrough(this.state);
				resultArea.empty();
				resultArea.style.display = '';

				if (result.success) {
					container.addClass('bt-success');
					resultArea.createDiv({ cls: 'bt-result-title success' }).setText('突破成功！');
					const newRealmEl = resultArea.createDiv({ cls: 'bt-new-realm' });
					newRealmEl.setText(result.newState.realm);
					const newColor = REALM_COLORS[result.newState.realm];
					newRealmEl.style.color = newColor;

					// 解锁功能
					if (result.newState.unlockedFeatures.length > 0) {
						const unlockWrap = resultArea.createDiv({ cls: 'bt-unlocks' });
						unlockWrap.createSpan({ cls: 'bt-unlocks-label' }).setText('新解锁');
						const tags = unlockWrap.createDiv({ cls: 'bt-unlocks-tags' });
						for (const f of result.newState.unlockedFeatures) {
							tags.createSpan({ cls: 'dandao-tag' }).setText(f);
						}
					}

					resultArea.createDiv({ cls: 'bt-result-msg' }).setText(result.message);
				} else {
					container.addClass('bt-failure');
					resultArea.createDiv({ cls: 'bt-result-title failure' }).setText('突破失败');
					resultArea.createDiv({ cls: 'bt-result-msg' }).setText(result.message);
					resultArea.createDiv({ cls: 'bt-encourage' }).setText('心境磨砺，下次必成。');
				}

				// 关闭按钮
				const closeBtn = resultArea.createEl('button', { cls: 'bt-close-btn' });
				closeBtn.setText('确认');
				closeBtn.addEventListener('click', () => this.close());
			} catch (err) {
				console.error('[BreakthroughModal] 突破出错:', err);
				resultArea.empty();
				resultArea.style.display = '';
				resultArea.createDiv({ cls: 'bt-result-msg' }).setText('突破过程发生异常');
				btn.disabled = false;
				btn.setText('重新尝试');
			}
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private getNextRealm(current: CultivationRealm): CultivationRealm | null {
		const idx = REALM_ORDER.indexOf(current);
		if (idx < 0 || idx >= REALM_ORDER.length - 1) return null;
		return REALM_ORDER[idx + 1] ?? null;
	}
}
