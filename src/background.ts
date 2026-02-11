/**
 * Background Service Worker for SuperBar Chrome Extension
 * Handles extension initialization and event handling
 */

import { getBookmarkUsage, incrementBookmarkUsage } from './utils';

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default configuration with all required properties
    const defaultConfig = {
      enabled: true,
      searchEngines: ['google'],
      showBookmarkPath: true,
      excludedFolderNames: [],
    };

    chrome.storage.local.set({ superbarConfig: defaultConfig }, () => {
      // Open settings page on first install
      chrome.runtime.openOptionsPage();
    });
  }
});

// Handle command (keyboard shortcut)
chrome.commands.onCommand.addListener((command) => {
  if (command === '_execute_action') {
    // Open search in a command palette popup window
    chrome.windows.create({
      url: chrome.runtime.getURL('search-overlay.html'),
      type: 'popup',
      width: 600,
      height: 500,
    });
  }
});

// Handle action button click
chrome.action.onClicked.addListener(() => {
  // Always open search in a command palette popup window
  chrome.windows.create({
    url: chrome.runtime.getURL('search-overlay.html'),
    type: 'popup',
    width: 600,
    height: 500,
  });
});

// ...existing code...

// Listen for messages from content scripts and settings pages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_CONFIG':
      chrome.storage.local.get(['superbarConfig'], (result) => {
        sendResponse(result.superbarConfig);
      });
      break;

    case 'SAVE_CONFIG':
      chrome.storage.local.set({ superbarConfig: message.payload }, () => {
        sendResponse({ success: true });
      });
      break;

    case 'SEARCH_BOOKMARKS':
      searchBookmarksWithTabs(message.payload.query, (results) => {
        sendResponse({ results });
      });
      break;

    case 'OPEN_BOOKMARK':
      if (message.payload?.url) {
        console.log('[SuperBar Background] OPEN_BOOKMARK received for:', message.payload.url);
        // Track bookmark usage
        trackBookmarkUsage(message.payload.url);

        // If it's a tab (has tabId), switch to it instead of opening new tab
        if (message.payload?.tabId) {
          chrome.tabs.update(message.payload.tabId, { active: true }, (tab) => {
            if (tab?.windowId) {
              chrome.windows.update(tab.windowId, { focused: true }, () => {
                console.log('[SuperBar Background] Switched to tab:', message.payload.tabId);
                sendResponse({ success: true });
              });
            }
          });
        } else {
          chrome.tabs.create({ url: message.payload.url }, () => {
            console.log('[SuperBar Background] Tab created for:', message.payload.url);
            sendResponse({ success: true });
          });
        }
      } else {
        sendResponse({ success: false });
      }
      break;

    case 'DELETE_BOOKMARK':
      if (message.payload?.url) {
        chrome.bookmarks.search({ url: message.payload.url }, (results) => {
          if (results.length > 0) {
            chrome.bookmarks.remove(results[0].id, () => {
              console.log('[SuperBar] Bookmark deleted:', results[0].id);
              sendResponse({ success: true });
            });
          } else {
            console.log('[SuperBar] Bookmark not found:', message.payload.url);
            sendResponse({ success: false });
          }
        });
        return true;
      } else {
        sendResponse({ success: false });
      }
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  // Return true to indicate we will send response asynchronously
  return true;
});

// Helper function to check if a bookmark path is within an excluded folder
function isPathInFolder(bookmarkPath: string[], excludedPath: string[]): boolean {
  // If excluded path is longer than bookmark path, it can't contain it
  if (excludedPath.length > bookmarkPath.length) {
    return false;
  }

  // Check if all elements of excludedPath match the start of bookmarkPath
  for (let i = 0; i < excludedPath.length; i++) {
    if (bookmarkPath[i] !== excludedPath[i]) {
      return false;
    }
  }

  return true;
}

// Calculate weight for sorting bookmarks
function calculateBookmarkWeight(params: {
  relevance: number;
  usageCount?: number;
}): number {
  const { relevance, usageCount = 0 } = params;

  // Relevance: 0-1000 scale (search match quality)
  // Usage count: logarithmic scale to avoid dominance (log2 for diminishing returns)
  const usageWeight = usageCount > 0 ? Math.log2(usageCount + 1) * 100 : 0;

  // Combined weight: 70% relevance, 30% usage
  return relevance * 0.7 + usageWeight * 0.3;
}

// Migrate old config format to new format
function migrateConfig(config: any): any {
  // If old format exists, convert to new format
  if (config.excludedFolderNames && !config.excludedFolders) {
    config.excludedFolders = (config.excludedFolderNames as string[]).map((folder: string) => {
      // Convert "/home/clim" → ["/home", "clim"]
      // or "/dev" → ["/dev"]
      const cleaned = folder.startsWith('/') ? folder.substring(1) : folder;
      return cleaned.split('/').map((part) => part.length > 0 ? (part.startsWith('/') ? part : '/' + part) : '').filter((p) => p);
    });
    delete config.excludedFolderNames;
    chrome.storage.local.set({ superbarConfig: config });
  }
  return config;
}

// Search through bookmarks and open tabs, merging results with duplicates removed
function searchBookmarksWithTabs(query: string, callback: (results: any[]) => void) {
  // First get all open tabs
  chrome.tabs.query({}, (tabs) => {
    // Search bookmarks
    searchBookmarks(query, (bookmarkResults) => {
      const urlToTabMap: { [url: string]: any } = {};

      // Create a map of URLs to tabs for quick lookup
      tabs.forEach((tab) => {
        if (tab.url && !tab.url.startsWith('chrome://')) {
          urlToTabMap[tab.url] = tab;
        }
      });

      // Find which bookmark results are already open tabs
      const bookmarksWithTabInfo = bookmarkResults.map((result) => {
        const tab = urlToTabMap[result.url];
        return {
          ...result,
          isOpenTab: !!tab,
          tabId: tab?.id,
          windowId: tab?.windowId,
        };
      });

      // Find open tabs that don't have a bookmark
      const bookmarkUrls = new Set(bookmarkResults.map((r) => r.url));
      const openTabsNotInBookmarks = tabs
        .filter((tab) => tab.url && !tab.url.startsWith('chrome://') && !bookmarkUrls.has(tab.url))
        .map((tab) => {
          const relevance = calculateRelevance(query, tab.title || '');
          const weight = calculateBookmarkWeight({ relevance, usageCount: 0 });
          return {
            title: tab.title || 'Untitled Tab',
            url: tab.url,
            tabId: tab.id,
            windowId: tab.windowId,
            isOpenTab: true,
            relevance,
            weight,
            path: undefined,
          };
        });

      // Merge results: bookmarks with tab info + tabs not in bookmarks
      const mergedResults = [...bookmarksWithTabInfo, ...openTabsNotInBookmarks];

      // Sort by weight (relevance + usage)
      const sortedResults = mergedResults.sort((a, b) => b.weight - a.weight);

      callback(sortedResults);
    });
  });
}

// Search through all bookmarks
function searchBookmarks(query: string, callback: (results: any[]) => void) {
  // Get current config to check excluded folders and ignored bookmarks
  chrome.storage.local.get(['superbarConfig'], (result) => {
    let config = result.superbarConfig || {};
    config = migrateConfig(config);
    const excludedFolders = (config.excludedFolders || []) as string[][];
    const ignoredBookmarks = (config.ignoredBookmarks || []) as string[];

    console.log('[SuperBar Background] Search config:', { excludedFolders, ignoredBookmarks });

    chrome.bookmarks.search(query, (searchResults) => {
      // First, build the complete path map for all bookmarks
      chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        const bookmarkPathMap: { [key: string]: string[] } = {}; // Maps bookmark ID to full folder path array

        function buildPathMap(nodes: any[], currentPath: string[] = []) {
          nodes.forEach((node) => {
            const nodeTitle = node.title || '';
            // Only add to path if title is not empty
            const nodePath = nodeTitle ? [...currentPath, nodeTitle] : currentPath;

            // Store path for all items (folders and bookmarks)
            bookmarkPathMap[node.id] = nodePath;

            if (node.children) {
              buildPathMap(node.children, nodePath);
            }
          });
        }

        buildPathMap(bookmarkTreeNodes);

        console.log('[SuperBar Background] Bookmark path map keys:', Object.keys(bookmarkPathMap).length);

        // Filter bookmarks based on excluded folders and ignored bookmarks
        const filteredBookmarks = searchResults
          .filter((bookmark) => {
            // Always filter out folders without URLs
            if (!bookmark.url) {
              return false;
            }

            // Check if this bookmark is in the ignored list
            if (ignoredBookmarks.includes(bookmark.url)) {
              console.log('[SuperBar Background] Skipping ignored bookmark:', bookmark.title);
              return false;
            }

            // Get the full path for this bookmark
            const fullPath = bookmarkPathMap[bookmark.id] || [];
            console.log('[SuperBar Background] Checking bookmark:', bookmark.title, 'Path:', fullPath);

            // Check if the bookmark's path is within any excluded folder
            for (const excludedFolder of excludedFolders) {
              // Build the full excluded path with "Bookmarks" prefix
              const fullExcludedPath = ['Bookmarks', ...excludedFolder];

              console.log('[SuperBar Background] Comparing path array', fullPath, 'with excluded', fullExcludedPath);
              console.log('[SuperBar Background] isPathInFolder result:', isPathInFolder(fullPath, fullExcludedPath));

              // Check if bookmark is in the excluded folder or its subfolders
              if (isPathInFolder(fullPath, fullExcludedPath)) {
                console.log('[SuperBar Background] Excluding bookmark:', bookmark.title, 'because path', fullPath, 'is in excluded folder', fullExcludedPath);
                return false;
              }
            }

            // Always include bookmarks with URLs
            return true;
          });

        // Process bookmarks asynchronously to fetch usage counts
        Promise.all(
          filteredBookmarks.map(async (bookmark) => {
            const relevance = calculateRelevance(query, bookmark.title || '');
            const usageCount = bookmark.url ? (await getBookmarkUsage(bookmark.url)) : 0;
            const weight = calculateBookmarkWeight({ relevance, usageCount });

            return {
              title: bookmark.title || 'Untitled',
              url: bookmark.url,
              id: bookmark.id,
              parentId: bookmark.parentId,
              relevance,
              usageCount,
              weight,
            };
          })
        ).then((bookmarks) => {
          const sortedBookmarks = bookmarks.sort((a, b) => b.weight - a.weight);

          // Get paths for bookmarks
          getBookmarkPaths(sortedBookmarks, (bookmarksWithPaths) => {
            callback(bookmarksWithPaths);
          });
        });
      });
    });
  });
}

// Get folder paths for bookmarks
function getBookmarkPaths(bookmarks: any[], callback: (bookmarks: any[]) => void) {
  const pathMap: { [key: string]: string } = {};

  // Get all bookmark tree to build path map
  chrome.bookmarks.getTree((bookmarkTreeNodes) => {
    // Build a map of ID -> path
    function buildPathMap(nodes: any[], currentPath: string = '') {
      nodes.forEach((node) => {
        const nodePath = currentPath ? `${currentPath}/${node.title}` : node.title;
        pathMap[node.id] = nodePath;

        if (node.children) {
          buildPathMap(node.children, nodePath);
        }
      });
    }

    buildPathMap(bookmarkTreeNodes);

    // Add path to each bookmark
    const bookmarksWithPaths = bookmarks.map((bookmark) => ({
      ...bookmark,
      path: pathMap[bookmark.parentId] || '',
    }));

    callback(bookmarksWithPaths);
  });
}

// Calculate relevance score for search results
function calculateRelevance(query: string, title: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerTitle = title.toLowerCase();

  // Exact match gets highest score
  if (lowerTitle === lowerQuery) return 1000;

  // Starts with query gets high score
  if (lowerTitle.startsWith(lowerQuery)) return 500;

  // Contains query consecutively gets medium score
  if (lowerTitle.includes(lowerQuery)) return 250;

  // Word-by-word matching gets lower score
  const queryWords = lowerQuery.split(/\s+/);
  const titleWords = lowerTitle.split(/\s+/);
  const matchedWords = queryWords.filter((word) =>
    titleWords.some((tw) => tw.includes(word) || word.includes(tw))
  );

  return matchedWords.length > 0 ? (matchedWords.length / queryWords.length) * 100 : 0;
}

// Track bookmark usage
async function trackBookmarkUsage(url: string) {
  try {
    await incrementBookmarkUsage(url);
    console.log('[SuperBar Background] Bookmark usage incremented for:', url);
  } catch (error) {
    console.error('[SuperBar Background] Error tracking bookmark usage:', error);
  }
}

console.log('[SuperBar] Background service worker loaded');
