import type { App } from 'obsidian';
import type { Character, PillRecord } from '../../types';
import type { VaultDataManager } from '../vault/vault-data-manager';
import { INVESTMENT_EFFECTS, CHARACTER_LEVEL_TABLE } from '../../constants';

/**
 * CharacterManager — 角色 CRUD 及投注经验/等级管理。
 *
 * 角色投注 = 消耗丹药 → 获得 XP → 累加到角色 → 重新计算等级。
 */
export class CharacterManager {
	constructor(
		private app: App,
		private vaultDataManager: VaultDataManager,
	) {}

	// ================================================================
	// CRUD
	// ================================================================

	async getAll(): Promise<Character[]> {
		try {
			return await this.vaultDataManager.getCharacters();
		} catch (err) {
			console.error('[CharacterManager] getAll 失败:', err);
			return [];
		}
	}

	async getById(id: string): Promise<Character | undefined> {
		try {
			const all = await this.getAll();
			return all.find((c) => c.id === id);
		} catch (err) {
			console.error('[CharacterManager] getById 失败:', err);
			return undefined;
		}
	}

	async create(name: string): Promise<Character> {
		const character: Character = {
			id: this.generateId(),
			name,
			xp: 0,
			level: 1,
		};

		try {
			await this.vaultDataManager.saveCharacter(character);
		} catch (err) {
			console.error('[CharacterManager] create 失败:', err);
		}
		return character;
	}

	async update(character: Character): Promise<void> {
		try {
			await this.vaultDataManager.saveCharacter(character);
		} catch (err) {
			console.error('[CharacterManager] update 失败:', err);
		}
	}

	async remove(id: string): Promise<void> {
		try {
			await this.vaultDataManager.removeCharacter(id);
		} catch (err) {
			console.error('[CharacterManager] remove 失败:', err);
		}
	}

	// ================================================================
	// 投注逻辑
	// ================================================================

	/**
	 * 消耗丹药 → 计算 XP → 累加到角色 xp → 重新计算 level → 保存。
	 */
	async investPill(characterId: string, pill: PillRecord): Promise<void> {
		try {
			const character = await this.getById(characterId);
			if (!character) {
				console.error(
					'[CharacterManager] investPill: 角色不存在',
					characterId,
				);
				return;
			}

			const xpGain = this.calculateXpGain(pill);
			character.xp += xpGain;
			character.level = this.calculateLevel(character.xp);
			await this.vaultDataManager.saveCharacter(character);
		} catch (err) {
			console.error('[CharacterManager] investPill 失败:', err);
		}
	}

	/**
	 * 计算丹药投注带来的 XP 增量。
	 * 公式: xpWeightByGrade[品级] * 纯度
	 */
	calculateXpGain(pill: PillRecord): number {
		const weight =
			INVESTMENT_EFFECTS.character.xpWeightByGrade[pill.品级] ?? 10;
		return weight * pill.纯度;
	}

	/**
	 * 根据累计 XP 计算当前等级。
	 * 遍历 CHARACTER_LEVEL_TABLE 找到 xp >= xpRequired 的最高等级。
	 */
	calculateLevel(xp: number): number {
		let level = 1;
		for (const entry of CHARACTER_LEVEL_TABLE) {
			if (xp >= entry.xpRequired) {
				level = entry.level;
			} else {
				break;
			}
		}
		return level;
	}

	// ================================================================
	// 工具
	// ================================================================

	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
	}
}
