import type { ParsedTask } from '../types';

// ============ 正则表达式 ============

/** 任务行匹配：支持 - 和 * 开头，允许前导空格 */
const RE_TASK_LINE = /^[\s]*[-*]\s+\[([ xX])\]\s+(.+)$/;

/** 标签提取 */
const RE_TAG = /#([^\s#]+)/g;

/** 完成日期 ✅ */
const RE_COMPLETED_DATE = /✅\s*(\d{4}-\d{2}-\d{2})/;

/** 截止日期 📅 */
const RE_DUE_DATE = /📅\s*(\d{4}-\d{2}-\d{2})/;

/** 计划日期 ⏳ */
const RE_SCHEDULED_DATE = /⏳\s*(\d{4}-\d{2}-\d{2})/;

/** 开始日期 🛫 */
const RE_START_DATE = /🛫\s*(\d{4}-\d{2}-\d{2})/;

/** 创建日期 ➕ */
const RE_CREATED_DATE = /➕\s*(\d{4}-\d{2}-\d{2})/;

/** 高优先级 🔺 ⏫ */
const RE_HIGH_PRIORITY = /[🔺⏫]/;

/** 中优先级 🔼 */
const RE_MID_PRIORITY = /🔼/;

/** 低优先级 🔽 ⏬ */
const RE_LOW_PRIORITY = /[🔽⏬]/;

/** 行内代码块 */
const RE_INLINE_CODE = /`[^`]*`/g;

/** 所有日期符号（用于清理纯文本） */
const RE_ALL_DATE_MARKERS = /[✅📅⏳🛫➕]\s*\d{4}-\d{2}-\d{2}/g;

/** 所有优先级符号 */
const RE_ALL_PRIORITY_MARKERS = /[🔺⏫🔼🔽⏬]/g;

// ============ 导出函数 ============

/**
 * 解析单行 Markdown 任务文本。
 * 如果不是任务行则返回 null。
 */
export function parseTaskLine(line: string, lineNumber: number): ParsedTask | null {
  const match = line.match(RE_TASK_LINE);
  if (!match) return null;

  const statusChar = match[1] as string;
  const rawContent = match[2] as string;

  // 空内容检查
  if (!rawContent.trim()) return null;

  const isCompleted = statusChar === 'x' || statusChar === 'X';

  // --- 提取标签（忽略行内代码块中的标签） ---
  // 先把行内代码块替换为占位符，再提取标签
  const contentWithoutCode = rawContent.replace(RE_INLINE_CODE, '');
  const tags: string[] = [];
  let tagMatch: RegExpExecArray | null;
  const tagRegex = new RegExp(RE_TAG.source, 'g');
  while ((tagMatch = tagRegex.exec(contentWithoutCode)) !== null) {
    tags.push(tagMatch[1] as string);
  }

  // --- 提取日期 ---
  const completedDateMatch = rawContent.match(RE_COMPLETED_DATE);
  const completedDate = completedDateMatch ? completedDateMatch[1] : undefined;

  const dueDateMatch = rawContent.match(RE_DUE_DATE);
  const dueDate = dueDateMatch ? dueDateMatch[1] : undefined;

  // --- 检测优先级 ---
  const isImportant = RE_HIGH_PRIORITY.test(rawContent);

  // --- 提取纯文本 ---
  let text: string = rawContent;
  // 去掉日期标记
  text = text.replace(RE_ALL_DATE_MARKERS, '');
  // 去掉优先级标记
  text = text.replace(RE_ALL_PRIORITY_MARKERS, '');
  // 去掉标签（同样需要忽略行内代码中的标签）
  // 策略：先保护行内代码，去掉标签，再恢复
  const codeBlocks: string[] = [];
  let codeIdx = 0;
  text = text.replace(RE_INLINE_CODE, (m) => {
    const placeholder = `\x00CODE${codeIdx}\x00`;
    codeBlocks.push(m);
    codeIdx++;
    return placeholder;
  });
  text = text.replace(/#[^\s#]+/g, '');
  // 恢复行内代码
  for (let i = 0; i < codeBlocks.length; i++) {
    text = text.replace(`\x00CODE${i}\x00`, codeBlocks[i] as string);
  }
  // 清理多余空格
  text = text.replace(/\s+/g, ' ').trim();

  if (!text) return null;

  return {
    text,
    tags,
    completedDate,
    dueDate,
    isCompleted,
    isImportant,
    lineNumber,
    lineText: line,
  };
}

/**
 * 解析整个文件内容，返回所有任务。
 */
export function parseAllTasks(content: string): ParsedTask[] {
  const lines = content.split('\n');
  const tasks: ParsedTask[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const task = parseTaskLine(line, i);
    if (task) {
      tasks.push(task);
    }
  }
  return tasks;
}

/**
 * 对比两次文件内容，找出新完成的任务。
 * 匹配逻辑：使用任务文本（去除状态标记后的内容）进行匹配。
 */
export function detectNewCompletions(oldContent: string, newContent: string): ParsedTask[] {
  const oldTasks = parseAllTasks(oldContent);
  const newTasks = parseAllTasks(newContent);

  // 构建旧内容中未完成任务的文本集合（标准化后）
  const oldIncompleteTexts = new Set<string>();
  for (const task of oldTasks) {
    if (!task.isCompleted) {
      oldIncompleteTexts.add(normalizeTaskText(task.lineText));
    }
  }

  // 在新内容中找出已完成且在旧内容中是未完成状态的任务
  const newCompletions: ParsedTask[] = [];
  for (const task of newTasks) {
    if (task.isCompleted) {
      const normalized = normalizeTaskText(task.lineText);
      if (oldIncompleteTexts.has(normalized)) {
        newCompletions.push(task);
      }
    }
  }

  return newCompletions;
}

/**
 * 标准化任务行文本（去除状态标记，用于匹配对比）。
 * 将 `- [x]` / `- [ ]` / `* [X]` 等统一去除状态差异。
 */
function normalizeTaskText(lineText: string): string {
  // 去除前导空格、将 checkbox 状态统一为空
  return lineText.trim().replace(/^([-*]\s+\[)[ xX](\].*)$/, '$1$2');
}

/**
 * 生成任务行的简单哈希（用于去重缓存）。
 * 对行文本做标准化后使用 djb2 算法生成哈希。
 */
export function hashTaskLine(line: string): string {
  // 标准化：去除首尾空格，统一空格
  const normalized = line.trim().replace(/\s+/g, ' ');
  return djb2Hash(normalized);
}

/**
 * djb2 哈希算法 — 简单高效的字符串哈希。
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + charCode
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  // 转为无符号 hex
  return (hash >>> 0).toString(16);
}
