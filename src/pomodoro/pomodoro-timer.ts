import type { PomodoroMode, PomodoroState } from '../types';

export type PomodoroEventType = 'tick' | 'complete' | 'interrupt' | 'break-complete' | 'state-change';

export interface PomodoroEvents {
  tick: (remainingSeconds: number, totalSeconds: number) => void;
  complete: () => void;
  interrupt: () => void;
  'break-complete': () => void;
  'state-change': (mode: PomodoroMode) => void;
}

export class PomodoroTimer {
  private mode: PomodoroMode = 'idle';
  private remainingSeconds = 0;
  private totalSeconds = 0;
  private intervalId: number | null = null;
  private workMinutes: number;
  private breakMinutes: number;
  private listeners: Map<PomodoroEventType, Function[]> = new Map();

  constructor(workMinutes = 25, breakMinutes = 5) {
    this.workMinutes = workMinutes;
    this.breakMinutes = breakMinutes;
  }

  // ============ 公共方法 ============

  start(): void {
    this.clearTimer();
    this.mode = 'running';
    this.totalSeconds = this.workMinutes * 60;
    this.remainingSeconds = this.totalSeconds;
    this.startTimer();
    this.emit('state-change', this.mode);
  }

  pause(): void {
    if (this.mode !== 'running') return;
    this.mode = 'paused';
    this.clearTimer();
    this.emit('state-change', this.mode);
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.mode = 'running';
    this.startTimer();
    this.emit('state-change', this.mode);
  }

  stop(): void {
    if (this.mode === 'idle') return;
    const wasWorking = this.mode === 'running' || this.mode === 'paused';
    this.clearTimer();
    if (wasWorking) {
      this.emit('interrupt');
    }
    this.mode = 'idle';
    this.remainingSeconds = 0;
    this.totalSeconds = 0;
    this.emit('state-change', this.mode);
  }

  startBreak(): void {
    this.clearTimer();
    this.mode = 'break';
    this.totalSeconds = this.breakMinutes * 60;
    this.remainingSeconds = this.totalSeconds;
    this.startTimer();
    this.emit('state-change', this.mode);
  }

  reset(): void {
    this.clearTimer();
    this.mode = 'idle';
    this.remainingSeconds = 0;
    this.totalSeconds = 0;
    this.emit('state-change', this.mode);
  }

  getState(): PomodoroState {
    return {
      mode: this.mode,
      remainingSeconds: this.remainingSeconds,
      totalSeconds: this.totalSeconds,
    };
  }

  getMode(): PomodoroMode {
    return this.mode;
  }

  getRemainingSeconds(): number {
    return this.remainingSeconds;
  }

  getFormattedTime(): string {
    const minutes = Math.floor(this.remainingSeconds / 60);
    const seconds = this.remainingSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  updateConfig(workMinutes: number, breakMinutes: number): void {
    this.workMinutes = workMinutes;
    this.breakMinutes = breakMinutes;
  }

  destroy(): void {
    this.clearTimer();
    this.listeners.clear();
  }

  // ============ 事件系统 ============

  on(event: PomodoroEventType, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: PomodoroEventType, callback: Function): void {
    const cbs = this.listeners.get(event);
    if (!cbs) return;
    const idx = cbs.indexOf(callback);
    if (idx !== -1) {
      cbs.splice(idx, 1);
    }
  }

  // ============ 序列化/恢复 ============

  serialize(): PomodoroState {
    return {
      mode: this.mode,
      remainingSeconds: this.remainingSeconds,
      totalSeconds: this.totalSeconds,
      startedAt: this.mode !== 'idle' ? new Date().toISOString() : undefined,
    };
  }

  static restore(
    state: PomodoroState,
    workMinutes: number,
    breakMinutes: number,
  ): PomodoroTimer {
    const timer = new PomodoroTimer(workMinutes, breakMinutes);
    timer.mode = state.mode;
    timer.remainingSeconds = state.remainingSeconds;
    timer.totalSeconds = state.totalSeconds;

    // 如果恢复时 mode 为 running 或 break，重新启动定时器
    if (state.mode === 'running' || state.mode === 'break') {
      timer.startTimer();
    }

    return timer;
  }

  // ============ 内部方法 ============

  private emit(event: PomodoroEventType, ...args: unknown[]): void {
    const cbs = this.listeners.get(event);
    if (!cbs) return;
    for (const cb of cbs) {
      try {
        cb(...args);
      } catch (e) {
        console.error(`[PomodoroTimer] Event callback error (${event}):`, e);
      }
    }
  }

  private startTimer(): void {
    this.clearTimer();
    this.intervalId = window.setInterval(() => {
      this.tick();
    }, 1000);
  }

  private clearTimer(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private tick(): void {
    this.remainingSeconds--;
    this.emit('tick', this.remainingSeconds, this.totalSeconds);

    if (this.remainingSeconds <= 0) {
      this.clearTimer();

      if (this.mode === 'running') {
        // 工作时段完成 → 触发 complete，自动进入休息
        this.emit('complete');
        this.startBreak();
      } else if (this.mode === 'break') {
        // 休息时段完成
        this.emit('break-complete');
        this.mode = 'idle';
        this.remainingSeconds = 0;
        this.totalSeconds = 0;
        this.emit('state-change', this.mode);
      }
    }
  }
}
