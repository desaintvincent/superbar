/**
 * Background Service Worker for SuperBar Chrome Extension
 * Handles extension initialization and event handling
 */
declare function searchBookmarks(query: string, callback: (results: any[]) => void): void;
declare function calculateRelevance(query: string, title: string): number;
declare function notifyAllTabs(config: any): void;
