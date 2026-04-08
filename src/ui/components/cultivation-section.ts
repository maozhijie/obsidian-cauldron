import type { ViewSection, SectionContext } from './section-base';
import type { CultivationState, MeridianState, BreakthroughCondition, CultivationRealm } from '../../types';
import { MERIDIAN_LEVEL_TABLE } from '../../constants';
import { BreakthroughEngine } from '../../core/cultivation/breakthrough-engine';
import { CultivationManager } from '../../core/cultivation/cultivation-manager';
import { MeridianManager } from '../../core/cultivation/meridian-manager';
import { EventBus } from '../../core/event-bus';

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

/** 层级中文数字 */
const LEVEL_CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

export class CultivationSection implements ViewSection {
	async render(ctx: SectionContext): Promise<void> {
		const { container, vaultDataManager } = ctx;

		if (!vaultDataManager) {
			container.createDiv({ cls: 'dandao-empty' }).setText('修炼系统尚未初始化');
			return;
		}

		try {
			const eventBus = new EventBus();
			const cultivationMgr = new CultivationManager(vaultDataManager, eventBus);
			const meridianMgr = new MeridianManager(vaultDataManager);
			const breakthroughEngine = new BreakthroughEngine(vaultDataManager, eventBus);

			const state = await cultivationMgr.getState();
			const meridians = await meridianMgr.getAllStates();
			const canBreakthrough = cultivationMgr.canAttemptBreakthrough(state);

			const wrap = container.createDiv({ cls: 'cult-section' });

			// 1. 境界大字展示
			this.renderRealmTitle(wrap, state);

			// 2. XP进度条
			this.renderXpBar(wrap, state);

			// 3. 境界信息卡
			this.renderInfoCard(wrap, state);

			// 4. 经脉网格
			this.renderMeridianGrid(wrap, meridians, meridianMgr);

			// 5. 突破区
			if (canBreakthrough) {
				await this.renderBreakthroughArea(wrap, state, meridians, breakthroughEngine, ctx);
			}
		} catch (err) {
			console.error('[CultivationSection] 渲染出错:', err);
			container.createDiv({ cls: 'dandao-empty' }).setText('修炼数据加载失败');
		}
	}

	/** 境界大字 */
	private renderRealmTitle(parent: HTMLElement, state: CultivationState): void {
		const titleWrap = parent.createDiv({ cls: 'cult-realm-title' });
		const color = REALM_COLORS[state.realm];
		titleWrap.style.color = color;
		const levelCn = LEVEL_CN[state.realmLevel] ?? String(state.realmLevel);
		titleWrap.setText(`${state.realm} · 第${levelCn}层`);
	}

	/** XP 进度条 */
	private renderXpBar(parent: HTMLElement, state: CultivationState): void {
		const barWrap = parent.createDiv({ cls: 'cult-xp-wrap' });
		const pct = state.xpToNextLevel > 0
			? Math.min(100, Math.round((state.currentRealmXp / state.xpToNextLevel) * 100))
			: 100;

		const track = barWrap.createDiv({ cls: 'cult-xp-track' });
		const fill = track.createDiv({ cls: 'cult-xp-fill' });

		const color = REALM_COLORS[state.realm];
		const nextIdx = REALM_ORDER.indexOf(state.realm) + 1;
		const nextColor = nextIdx < REALM_ORDER.length
			? REALM_COLORS[REALM_ORDER[nextIdx]!]
			: color;
		fill.style.width = `${pct}%`;
		fill.style.background = `linear-gradient(90deg, ${color}, ${nextColor})`;

		const label = barWrap.createDiv({ cls: 'cult-xp-label' });
		label.setText(`${state.currentRealmXp} / ${state.xpToNextLevel} XP (${pct}%)`);
	}

	/** 境界信息卡 */
	private renderInfoCard(parent: HTMLElement, state: CultivationState): void {
		const card = parent.createDiv({ cls: 'cult-info-card' });

		const items: Array<{ label: string; value: string }> = [
			{ label: '总修为', value: `${state.totalXp} XP` },
			{ label: '心境值', value: String(state.heartStateValue) },
			{ label: '突破尝试', value: `${state.breakthroughAttempts} 次` },
		];

		const statsRow = card.createDiv({ cls: 'cult-info-stats' });
		for (const item of items) {
			const el = statsRow.createDiv({ cls: 'cult-info-item' });
			el.createSpan({ cls: 'cult-info-label' }).setText(item.label);
			el.createSpan({ cls: 'cult-info-value' }).setText(item.value);
		}

		// 已解锁功能
		if (state.unlockedFeatures.length > 0) {
			const featureWrap = card.createDiv({ cls: 'cult-features' });
			featureWrap.createSpan({ cls: 'cult-features-title' }).setText('已解锁');
			const tagWrap = featureWrap.createDiv({ cls: 'cult-features-tags' });
			for (const f of state.unlockedFeatures) {
				tagWrap.createSpan({ cls: 'dandao-tag' }).setText(f);
			}
		}
	}

	/** 经脉网格 */
	private renderMeridianGrid(parent: HTMLElement, meridians: MeridianState[], mgr: MeridianManager): void {
		const section = parent.createDiv({ cls: 'dandao-section' });
		section.createEl('h5').setText('经脉');

		if (meridians.length === 0) {
			section.createDiv({ cls: 'dandao-empty' }).setText('暂无经脉数据');
			return;
		}

		const grid = section.createDiv({ cls: 'cult-meridian-grid' });

		for (const m of meridians) {
			const levelInfo = mgr.calculateLevel(m.totalInvestment);
			const bonus = mgr.getHerbYieldBonus(m);
			const bonusPct = Math.round(bonus * 100);

			const card = grid.createDiv({ cls: 'cult-meridian-card' });

			// 左侧圆形等级图标
			const levelBadge = card.createDiv({ cls: 'cult-meridian-badge' });
			levelBadge.setText(String(m.level));

			// 右侧信息
			const info = card.createDiv({ cls: 'cult-meridian-info' });

			const nameRow = info.createDiv({ cls: 'cult-meridian-name-row' });
			nameRow.createSpan({ cls: 'cult-meridian-domain' }).setText(m.domainTag);
			nameRow.createSpan({ cls: 'cult-meridian-level-name' }).setText(levelInfo.name);

			// 进度条
			const track = info.createDiv({ cls: 'cult-meridian-track' });
			const fill = track.createDiv({ cls: 'cult-meridian-fill' });
			fill.style.width = `${Math.round(levelInfo.progress * 100)}%`;

			// 加成
			info.createDiv({ cls: 'cult-meridian-bonus' }).setText(`采集加成 +${bonusPct}%`);
		}
	}

	/** 突破区 */
	private async renderBreakthroughArea(
		parent: HTMLElement,
		state: CultivationState,
		meridians: MeridianState[],
		engine: BreakthroughEngine,
		ctx: SectionContext,
	): Promise<void> {
		const section = parent.createDiv({ cls: 'cult-breakthrough' });
		section.createEl('h5').setText('突破');

		let conditions: BreakthroughCondition[] = [];
		try {
			conditions = await engine.getConditions(state, meridians);
		} catch {
			section.createDiv({ cls: 'dandao-empty' }).setText('条件加载失败');
			return;
		}

		// 条件清单
		const condList = section.createDiv({ cls: 'cult-cond-list' });
		for (const c of conditions) {
			const row = condList.createDiv({ cls: `cult-cond-row ${c.met ? 'met' : 'unmet'}` });
			row.createSpan({ cls: 'cult-cond-icon' }).setText(c.met ? '✓' : '✗');
			row.createSpan({ cls: 'cult-cond-desc' }).setText(c.description);
			row.createSpan({ cls: 'cult-cond-progress' }).setText(`${c.current}/${c.required}`);
		}

		const allMet = conditions.length > 0 && conditions.every(c => c.met);

		// 突破按钮
		const btnWrap = section.createDiv({ cls: 'cult-breakthrough-btn-wrap' });
		const btn = btnWrap.createEl('button', { cls: 'cult-breakthrough-btn' });
		btn.setText('尝试突破');
		if (!allMet) {
			btn.disabled = true;
			btn.addClass('disabled');
		}
		btn.addEventListener('click', async () => {
			if (!allMet || !ctx.vaultDataManager) return;
			// 动态导入 breakthrough modal 避免循环依赖
			const { BreakthroughModal } = await import('../modals/breakthrough-modal');
			const modal = new BreakthroughModal(
				(window as any).app,
				ctx.vaultDataManager,
				state,
			);
			modal.open();
		});
	}
}
