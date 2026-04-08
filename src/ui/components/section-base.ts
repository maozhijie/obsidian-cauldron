import type { VaultDataManager } from '../../core/vault/vault-data-manager';
import type { PomodoroTimer } from '../../pomodoro/pomodoro-timer';
import type { DomainTagManager } from '../../core/domain-tag-manager';
import type CauldronPlugin from '../../main';

export interface SectionContext {
	container: HTMLElement;
	vaultDataManager?: VaultDataManager;
	pomodoroTimer?: PomodoroTimer;
	domainTagManager?: DomainTagManager;
	plugin?: CauldronPlugin;
	sealTime: string;
}

/** 所有 section 组件的通用接口 */
export interface ViewSection {
	render(ctx: SectionContext): Promise<void>;
	dispose?(): void;
}
