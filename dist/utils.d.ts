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
 * Get the operating system
 */
export declare function getOS(): string;
