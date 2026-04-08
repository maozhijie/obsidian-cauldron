export interface TabDefinition {
	id: string;
	label: string;
	icon?: string;
}

export function renderTabBar(
	container: HTMLElement,
	tabs: TabDefinition[],
	activeTab: string,
	onTabChange: (tabId: string) => void,
): void {
	const bar = container.createDiv({ cls: 'dandao-tab-bar' });

	for (const tab of tabs) {
		const cls = tab.id === activeTab
			? 'dandao-tab-item active'
			: 'dandao-tab-item';

		const item = bar.createDiv({ cls, text: tab.label });
		item.dataset.tabId = tab.id;
		item.addEventListener('click', () => {
			if (tab.id !== activeTab) {
				onTabChange(tab.id);
			}
		});
	}
}
