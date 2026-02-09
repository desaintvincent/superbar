/**
 * Content Script for SuperBar Chrome Extension
 * Handles keyboard shortcuts and bookmark search UI on web pages
 */
interface SuperBarConfig {
    shortcut: string;
    enabled: boolean;
}
interface BookmarkResult {
    title: string;
    url: string;
    relevance: number;
}
declare let config: SuperBarConfig;
declare let currentResults: BookmarkResult[];
declare let selectedIndex: number;
declare function parseShortcut(shortcut: string): {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
    key: string;
};
declare function openSearchBar(): void;
declare function handleInputKeydown(e: KeyboardEvent): void;
declare function performSearch(query: string): Promise<void>;
declare function renderResults(): void;
declare function highlightResult(): void;
declare function clearResults(): void;
declare function openBookmark(url: string): void;
declare function escapeHtml(text: string): string;
declare function injectStyles(): void;
