import type { Flavor, Grade, Rarity, CultivationRealm, FlavorConflict, FlavorHarmony, PillPattern, StatsPeriod } from './types';

// 性味列表
export const FLAVORS: Flavor[] = ['神识', '根骨', '灵动', '融合'];

// 稀有度列表
export const RARITIES: Rarity[] = ['凡材', '良材', '珍材', '异材'];

// 品级列表
export const GRADES: Grade[] = ['凡品', '灵品', '宝品', '神品'];

// 性味对应颜色
export const FLAVOR_COLORS: Record<Flavor, string> = {
  '神识': '#4a90d9',
  '根骨': '#8b6914',
  '灵动': '#2d8659',
  '融合': '#d4a017',
};

// 品级对应颜色
export const GRADE_COLORS: Record<Grade, string> = {
  '凡品': '#a8a8a8',
  '灵品': '#5cb8b2',
  '宝品': '#8b5cf6',
  '神品': '#d4a017',
};

// 性味图标
export const FLAVOR_ICONS: Record<Flavor, string> = {
  '神识': '🧠',
  '根骨': '💪',
  '灵动': '⚡',
  '融合': '🔮',
};

// 药引图标
export const CATALYST_ICONS: Record<string, string> = {
  '守时引': '⏰',
  '延时引': '⏳',
  '专注引': '🧘',
  '断念引': '💔',
};

// 默认领域标签
export const DEFAULT_DOMAIN_TAGS = [
  { name: '学术写作', flavor: '神识' as Flavor, color: '#4a90d9' },
  { name: '运动', flavor: '根骨' as Flavor, color: '#8b6914' },
  { name: '编程', flavor: '灵动' as Flavor, color: '#2d8659' },
  { name: '社交', flavor: '融合' as Flavor, color: '#d4a017' },
];

// 默认标签常量
export const DEFAULT_DOMAIN_TAG = 'cauldron/domain';
export const DEFAULT_SEED_TAG = 'cauldron/seed';
export const DEFAULT_PROJECT_TAG = 'cauldron/project';
export const DEFAULT_GOAL_TAG = 'cauldron/goal';
export const DEFAULT_EXCLUDE_TAG = 'cauldron/archive';

// 侧边栏视图类型
export const CAULDRON_VIEW_TYPE = 'dandao-cauldron-view';

// ============ 境界升级经验表 ============
// 每个境界9层，表示从第1层到第9层各需多少XP
export const REALM_THRESHOLDS: Record<CultivationRealm, number[]> = {
  '练气': [100, 200, 300, 400, 500, 600, 700, 800, 1000],
  '筑基': [1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000],
  '金丹': [8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000, 25000],
  '元婴': [30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000],
  '化神': [80000, 90000, 100000, 110000, 120000, 130000, 140000, 150000, 200000],
};

// 各境界解锁的功能
export const REALM_UNLOCKS: Record<CultivationRealm, string[]> = {
  '练气': ['日炉'],
  '筑基': ['周炉', '目标系统'],
  '金丹': ['自定义丹纹', '月炉'],
  '元婴': ['项目炉', '高级配伍'],
  '化神': ['全部功能'],
};

// ============ 性味相冲配置 ============
export const FLAVOR_CONFLICTS: FlavorConflict[] = [
  { a: '神识', b: '根骨', penalty: 1 },
  { a: '灵动', b: '融合', penalty: 1 },
];

// 冲和配置：冲突药材比例在40%-60%之间时触发
export const FLAVOR_HARMONIES: FlavorHarmony[] = [
  { flavors: ['神识', '根骨'], ratio: [0.4, 0.6], bonus: '心身合一' },
  { flavors: ['灵动', '融合'], ratio: [0.4, 0.6], bonus: '动静相宜' },
];

// ============ 药材陈化规则 ============
export const AGING_RULES = {
  freshDays: 3,       // 0-3天：新鲜
  agingDays: 5,       // 3-5天：陈化中
  matureDays: 7,      // 5-7天：成熟
  defaultExpiryDays: 7, // 默认有效期
  // 陈化后增值的特殊领域（可配置）
  appreciatingDomains: [] as string[],
} as const;

// ============ 丹炉升级经验表 ============
// level -> 所需累计XP
export const FURNACE_LEVEL_TABLE: Array<{ level: number; xpRequired: number; gradeBonus: number; purityFloor: number; patternChance: number }> = [
  { level: 1, xpRequired: 0, gradeBonus: 0, purityFloor: 0, patternChance: 0 },
  { level: 2, xpRequired: 50, gradeBonus: 0, purityFloor: 0.05, patternChance: 0.02 },
  { level: 3, xpRequired: 150, gradeBonus: 0, purityFloor: 0.1, patternChance: 0.04 },
  { level: 4, xpRequired: 350, gradeBonus: 1, purityFloor: 0.15, patternChance: 0.06 },
  { level: 5, xpRequired: 700, gradeBonus: 1, purityFloor: 0.2, patternChance: 0.08 },
  { level: 6, xpRequired: 1200, gradeBonus: 1, purityFloor: 0.25, patternChance: 0.10 },
  { level: 7, xpRequired: 2000, gradeBonus: 2, purityFloor: 0.3, patternChance: 0.12 },
  { level: 8, xpRequired: 3500, gradeBonus: 2, purityFloor: 0.35, patternChance: 0.15 },
  { level: 9, xpRequired: 6000, gradeBonus: 3, purityFloor: 0.4, patternChance: 0.18 },
  { level: 10, xpRequired: 10000, gradeBonus: 3, purityFloor: 0.5, patternChance: 0.20 },
];

// ============ 丹纹候选池 ============
export const PATTERN_POOL: PillPattern[] = [
  { name: '灵光纹', description: '丹药表面浮现灵光', effect: '目标进度+20%', rarity: 'common' },
  { name: '天机纹', description: '隐含天地运转之理', effect: '修炼经验+30%', rarity: 'common' },
  { name: '混元纹', description: '融合多元之力', effect: '多领域经脉同时获得进度', rarity: 'rare' },
  { name: '破境纹', description: '蕴含突破之力', effect: '心境值+5', rarity: 'rare' },
  { name: '太极纹', description: '阴阳调和，至臻圆满', effect: '全属性加成+10%', rarity: 'legendary' },
  { name: '道韵纹', description: '大道至简，返璞归真', effect: '下次炼丹品级保底灵品', rarity: 'legendary' },
];

// ============ 经脉等级表 ============
export const MERIDIAN_LEVEL_TABLE: Array<{ level: number; name: string; investmentRequired: number; herbYieldBonus: number }> = [
  { level: 0, name: '未通', investmentRequired: 0, herbYieldBonus: 0 },
  { level: 1, name: '初通', investmentRequired: 10, herbYieldBonus: 0.05 },
  { level: 2, name: '小成', investmentRequired: 30, herbYieldBonus: 0.10 },
  { level: 3, name: '中成', investmentRequired: 60, herbYieldBonus: 0.15 },
  { level: 4, name: '大成', investmentRequired: 100, herbYieldBonus: 0.20 },
  { level: 5, name: '圆满', investmentRequired: 150, herbYieldBonus: 0.25 },
  { level: 6, name: '通灵', investmentRequired: 220, herbYieldBonus: 0.30 },
  { level: 7, name: '化神', investmentRequired: 300, herbYieldBonus: 0.35 },
  { level: 8, name: '归真', investmentRequired: 400, herbYieldBonus: 0.40 },
  { level: 9, name: '天人', investmentRequired: 520, herbYieldBonus: 0.45 },
  { level: 10, name: '合道', investmentRequired: 666, herbYieldBonus: 0.50 },
];

// ============ 突破条件模板 ============
// 各境界突破需要的条件
export const BREAKTHROUGH_CONDITIONS: Record<CultivationRealm, Array<{ type: string; description: string; required: number }>> = {
  '练气': [
    { type: 'consecutive_days', description: '连续修炼天数', required: 7 },
    { type: 'total_pills', description: '累计炼丹数', required: 5 },
  ],
  '筑基': [
    { type: 'consecutive_days', description: '连续修炼天数', required: 14 },
    { type: 'pill_grade', description: '需拥有灵品以上丹药', required: 1 },
    { type: 'total_pills', description: '累计炼丹数', required: 20 },
  ],
  '金丹': [
    { type: 'consecutive_days', description: '连续修炼天数', required: 30 },
    { type: 'pill_grade', description: '需拥有宝品以上丹药', required: 1 },
    { type: 'balanced_domains', description: '经脉均衡度(至少3条经脉lv3+)', required: 3 },
  ],
  '元婴': [
    { type: 'consecutive_days', description: '连续修炼天数', required: 60 },
    { type: 'pill_grade', description: '需拥有神品丹药', required: 1 },
    { type: 'balanced_domains', description: '经脉均衡度(至少4条经脉lv5+)', required: 4 },
    { type: 'total_pills', description: '累计炼丹数', required: 100 },
  ],
  '化神': [
    { type: 'consecutive_days', description: '连续修炼天数', required: 100 },
    { type: 'balanced_domains', description: '经脉均衡度(至少5条经脉lv7+)', required: 5 },
    { type: 'total_pills', description: '累计炼丹数', required: 300 },
    { type: 'furnace_level', description: '丹炉等级', required: 7 },
  ],
};

// ============ 统计周期配置 ============
export const STATS_PERIODS: Array<{ value: StatsPeriod; label: string; days: number }> = [
  { value: 'week', label: '近一周', days: 7 },
  { value: 'month', label: '近一月', days: 30 },
  { value: 'quarter', label: '近一季', days: 90 },
  { value: 'year', label: '近一年', days: 365 },
  { value: 'all', label: '全部', days: -1 },
];
