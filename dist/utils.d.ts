/**
 * Configuration management utilities
 */
export interface SuperBarConfig {
    shortcut: string;
    enabled: boolean;
    searchEngines: string[];
    showBookmarkPath?: boolean;
    excludedFolders?: string[][];
    ignoredBookmarks?: string[];
    bookmarkUsage?: {
        [url: string]: number;
    };
}
export declare const DEFAULT_CONFIG: SuperBarConfig;
export declare function getConfig(): Promise<SuperBarConfig>;
export declare function saveConfig(config: SuperBarConfig): Promise<void>;
export declare function sendMessageToBackground(message: any): Promise<any>;
/**
 * Parse keyboard shortcut string (e.g., "Ctrl+Shift+K")
 */
export declare function parseShortcut(shortcut: string): {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
    key: string;
};
/**
 * Calculate weight for sorting bookmarks
 * Can accept multiple parameters for future expansion
 */
export declare function calculateBookmarkWeight(params: {
    relevance: number;
    usageCount?: number;
}): number;
/**
 * Get the operating system
 */
export declare function getOS(): string;
