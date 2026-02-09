/**
 * Background Service Worker for SuperBar Chrome Extension
 * Handles extension initialization and event handling
 */
declare function isPathInFolder(bookmarkPath: string[], excludedPath: string[]): boolean;
declare function migrateConfig(config: any): any;
declare function searchBookmarks(query: string, callback: (results: any[]) => void): void;
declare function getBookmarkPaths(bookmarks: any[], callback: (bookmarks: any[]) => void): void;
declare function calculateRelevance(query: string, title: string): number;
declare function notifyAllTabs(config: any): void;
