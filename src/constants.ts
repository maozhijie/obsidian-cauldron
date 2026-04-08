import type { Flavor, Grade, Rarity } from './types';

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

// 丹道数据目录默认名
export const DEFAULT_DANDAO_FOLDER = 'dandao';
export const LOG_SUBFOLDER = '日志';
export const DOMAIN_CONFIG_FILENAME = '领域配置.md';

// 侧边栏视图类型
export const CAULDRON_VIEW_TYPE = 'dandao-cauldron-view';
