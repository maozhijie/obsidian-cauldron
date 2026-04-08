import type { ViewSection, SectionContext } from './section-base';
import type { PomodoroMode } from '../../types';
import type { PomodoroTimer } from '../../pomodoro/pomodoro-timer';

export class PomodoroSection implements ViewSection {
	async render(ctx: SectionContext): Promise<void> {
		const section = ctx.container.createDiv({ cls: 'dandao-section dandao-pomodoro' });
		section.createEl('h5', { text: '🍅 番茄钟' });

		const mode = ctx.pomodoroTimer?.getMode() ?? 'idle';
		const formattedTime = ctx.pomodoroTimer?.getFormattedTime() ?? '25:00';

		// 显示区
		const display = section.createDiv({ cls: 'pomodoro-display' });
		display.createEl('span', { text: formattedTime, cls: 'pomodoro-time' });
		display.createEl('span', { text: getModeLabel(mode), cls: 'pomodoro-status' });

		// 控制按钮
		const controls = section.createDiv({ cls: 'pomodoro-controls' });

		if (mode === 'idle') {
			const startBtn = controls.createEl('button', { text: '开始' });
			startBtn.addEventListener('click', () => {
				ctx.pomodoroTimer?.start();
			});
		}

		if (mode === 'running') {
			const pauseBtn = controls.createEl('button', { text: '暂停' });
			pauseBtn.addEventListener('click', () => {
				ctx.pomodoroTimer?.pause();
			});
		}

		if (mode === 'paused') {
			const resumeBtn = controls.createEl('button', { text: '继续' });
			resumeBtn.addEventListener('click', () => {
				ctx.pomodoroTimer?.resume();
			});
		}

		if (mode === 'running' || mode === 'paused') {
			const stopBtn = controls.createEl('button', { text: '停止' });
			stopBtn.addEventListener('click', () => {
				ctx.pomodoroTimer?.stop();
			});
		}

		if (mode === 'break') {
			const breakInfo = controls.createEl('span', { text: '休息中…', cls: 'pomodoro-break-info' });
			breakInfo.style.color = 'var(--text-muted)';
		}
	}
}

/**
 * 仅更新番茄钟时间和状态显示，避免全量 render。
 * 返回 true 表示需要全量重渲染（状态切换导致按钮变化）。
 */
export function updatePomodoroDisplay(
	contentEl: HTMLElement,
	pomodoroTimer?: PomodoroTimer,
): boolean {
	const timeEl = contentEl.querySelector('.pomodoro-time');
	const statusEl = contentEl.querySelector('.pomodoro-status');

	if (timeEl) {
		timeEl.textContent = pomodoroTimer?.getFormattedTime() ?? '25:00';
	}
	if (statusEl) {
		const mode = pomodoroTimer?.getMode() ?? 'idle';
		statusEl.textContent = getModeLabel(mode);
	}

	// 状态切换时需要更新按钮，做一次全量渲染
	const mode = pomodoroTimer?.getMode() ?? 'idle';
	const controlsEl = contentEl.querySelector('.pomodoro-controls');
	if (controlsEl) {
		const hasStart = controlsEl.querySelector('button')?.textContent === '开始';
		if ((mode === 'idle') !== hasStart) {
			return true;
		}
	}

	return false;
}

function getModeLabel(mode: PomodoroMode): string {
	switch (mode) {
		case 'idle': return '空闲';
		case 'running': return '工作中';
		case 'paused': return '暂停';
		case 'break': return '休息中';
		default: return '空闲';
	}
}
