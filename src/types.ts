// ============ 类型别名 ============
export type Flavor = '神识' | '根骨' | '灵动' | '融合';
export type Rarity = '凡材' | '良材' | '珍材' | '异材';
export type Grade = '凡品' | '灵品' | '宝品' | '神品';
export type CatalystType = '守时引' | '延时引' | '专注引' | '断念引';
export type HerbSource = 'todo' | 'pomodoro' | 'note' | 'timeblock';
export type SealStatus = '' | '已封炉';

// ============ 领域标签 ============
export interface DomainTag {
  name: string;           // 显示名称，如 "学术写作"
  flavor: Flavor;         // 性味
  color?: string;         // 界面显示颜色（可选）
}

// ============ 药材记录 ============
export interface HerbRecord {
  领域: string;                    // 关联的领域标签名称
  稀有度: Rarity;
  数量: number;                    // 份数（默认 1）
  来源: HerbSource;
  来源任务: string;                // 来源任务文本
  采集时间: string;                // ISO 时间戳
  有效期?: string;                  // 有效期 ISO 日期字符串
  陈化状态?: AgingStatus;           // 陈化状态
}

// ============ 药引记录 ============
export interface CatalystRecord {
  类型: CatalystType;
  数量: number;                    // 通常为 1
  来源任务?: string;               // 关联的任务文本（若有）
  采集时间: string;                // ISO 时间戳
}

// ============ 丹药记录 ============
export interface PillRecord {
  名称: string;                    // 自动生成
  君药领域: string;                // 君药领域标签名
  主性味: Flavor;                  // 君药性味
  臣药领域?: string;               // 臣药领域标签名
  辅性味?: Flavor;                 // 臣药性味
  品级: Grade;
  纯度: number;                    // 0-1
  药材总量: number;                // 药材份数总和
  已查看: boolean;
  丹纹?: PillPattern;              // 丹纹
}

// ============ 每日日志 frontmatter ============
export interface DailyLogFrontmatter {
  日期: string;                    // YYYY-MM-DD
  封炉状态: SealStatus;
  药材: HerbRecord[];
  药引: CatalystRecord[];
  丹药?: PillRecord;              // 封炉后才有
}

// ============ 领域配置 frontmatter ============
export interface DomainConfigFrontmatter {
  领域标签: DomainTag[];
}

// ============ 解析的任务 ============
export interface ParsedTask {
  text: string;                    // 任务文本内容
  tags: string[];                  // 标签列表
  completedDate?: string;          // 完成日期 YYYY-MM-DD
  dueDate?: string;                // 截止日期 YYYY-MM-DD
  isCompleted: boolean;            // 是否已完成
  isImportant: boolean;            // 是否重要（高优先级标记）
  lineNumber: number;              // 行号
  lineText: string;                // 原始行文本（用于哈希去重）
}

// ============ 番茄钟状态 ============
export type PomodoroMode = 'idle' | 'running' | 'paused' | 'break';

export interface PomodoroState {
  mode: PomodoroMode;
  remainingSeconds: number;        // 剩余秒数
  totalSeconds: number;            // 本次总秒数
  startedAt?: string;              // 开始时间 ISO
}

// ============ M4: 项目系统 ============
export interface Project {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdDate: string;
}

// ============ M5: 播种层 ============
export type SeedStatus = 'pending' | 'converted' | 'discarded';

export interface Seed {
  id: string;
  text: string;
  createdDate: string;
  status: SeedStatus;
  tags?: string[];
  convertedTaskPath?: string;
}

export interface Goal {
  id: string;
  name: string;
  projectId?: string;
  targetValue: number;
  currentValue: number;
  unit: string;
}

// ============ 3.1: 外丹深化 ============
export type AgingStatus = 'fresh' | 'aging' | 'mature' | 'expired';

export interface FlavorConflict {
  a: Flavor;
  b: Flavor;
  penalty: number;
}

export interface FlavorHarmony {
  flavors: Flavor[];
  ratio: number[];
  bonus: string;
}

export interface FurnaceState {
  level: number;
  xp: number;
  xpToNextLevel: number;
  totalPillsRefined: number;
}

export interface PillPattern {
  name: string;
  description: string;
  effect: string;
  rarity: 'common' | 'rare' | 'legendary';
}

export type FurnaceCycleType = 'daily' | 'weekly' | 'monthly' | 'project';

export interface MultiCycleFurnace {
  type: FurnaceCycleType;
  id: string;
  startDate: string;
  endDate?: string;
  projectId?: string;
  status: 'active' | 'sealed';
  pill?: PillRecord;
}

// ============ 3.2: 内丹体系 ============
export type CultivationRealm = '练气' | '筑基' | '金丹' | '元婴' | '化神';

export interface CultivationState {
  realm: CultivationRealm;
  realmLevel: number;
  totalXp: number;
  currentRealmXp: number;
  xpToNextLevel: number;
  breakthroughAttempts: number;
  heartStateValue: number;
  unlockedFeatures: string[];
}

export interface MeridianState {
  domainTag: string;
  totalInvestment: number;
  level: number;
  progress: number;
}

export interface BreakthroughCondition {
  type: string;
  description: string;
  required: number;
  current: number;
  met: boolean;
}

// ============ 统计视图 ============
export type StatsPeriod = 'week' | 'month' | 'quarter' | 'year' | 'all';

export interface StatsSnapshot {
  period: StatsPeriod;
  startDate: string;
  endDate: string;
  totalHerbs: number;
  totalCatalysts: number;
  totalPills: number;
  herbsByDomain: Record<string, number>;
  herbsByFlavor: Record<Flavor, number>;
  pillsByGrade: Record<Grade, number>;
  avgPurity: number;
  avgGrade: number;
  activeDays: number;
  totalDays: number;
  streakCurrent: number;
  streakMax: number;
  pomodoroCompleted: number;
  pomodoroInterrupted: number;
  totalFocusMinutes: number;
  investmentsByType: Record<string, number>;
  dailyActivity: Array<{ date: string; herbs: number; pills: number; focus: number }>;
}

export interface DomainStats {
  domain: string;
  flavor: Flavor;
  totalHerbs: number;
  totalPills: number;
  meridianLevel: number;
  meridianProgress: number;
}
