/**
 * Background Service Worker for SuperBar Chrome Extension
 * Handles extension initialization and event handling
 */

import { getBookmarkUsage, incrementBookmarkUsage } from './utils';

console.log('[SuperBar] Background service worker starting up...');

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
      const options = message.payload?.options || { includeTabs: true, includeHistory: false };
      searchBookmarksWithTabs(message.payload.query, options, (results) => {
        sendResponse({ results });
      });
      break;

    case 'OPEN_BOOKMARK':
      if (message.payload?.url) {
        // Track bookmark usage
        trackBookmarkUsage(message.payload.url);

        // If it's a tab (has tabId), switch to it instead of opening new tab
        if (message.payload?.tabId) {
          chrome.tabs.update(message.payload.tabId, { active: true }, (tab) => {
            if (tab?.windowId) {
              chrome.windows.update(tab.windowId, { focused: true }, () => {
                sendResponse({ success: true });
              });
            }
          });
        } else {
          chrome.tabs.create({ url: message.payload.url }, () => {
            sendResponse({ success: true });
          });
        }
      } else {
        sendResponse({ success: false });
      }
      break;

    case 'DELETE_BOOKMARK':
      if (message.payload?.url && message.payload?.title) {
        // Search by title first (more reliable)
        chrome.bookmarks.search({ title: message.payload.title }, (results) => {
          // Find exact match by URL
          const exactMatch = results.find((b) => b.url === message.payload.url);
          const bookmarkToDelete = exactMatch || results[0];

          if (bookmarkToDelete) {
            chrome.bookmarks.remove(bookmarkToDelete.id, () => {
              console.log('[SuperBar] Bookmark deleted via message:', message.payload.title);
              sendResponse({ success: true });
            });
          } else {
            console.error('[SuperBar] Bookmark not found for deletion');
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
function searchBookmarksWithTabs(
  query: string,
  options: { includeTabs: boolean; includeHistory: boolean },
  callback: (results: any[]) => void
) {

  // Search bookmarks first
  searchBookmarks(query, (bookmarkResults) => {

    // If both tabs and history are disabled, return only bookmarks
    if (!options.includeTabs && !options.includeHistory) {
      callback(bookmarkResults);
      return;
    }

    // Prepare set of URLs to exclude duplicates
    const bookmarkUrls = new Set(bookmarkResults.map((r) => r.url));
    let allResults = [...bookmarkResults];

    // Handle tabs
    if (options.includeTabs) {
      chrome.tabs.query({}, (tabs) => {
        const urlToTabMap: { [url: string]: any } = {};

        // Create a map of URLs to tabs for quick lookup
        tabs.forEach((tab) => {
          if (tab.url && !tab.url.startsWith('chrome://')) {
            urlToTabMap[tab.url] = tab;
          }
        });

        // Find which bookmark results are already open tabs
        allResults = allResults.map((result) => {
          const tab = urlToTabMap[result.url];
          return {
            ...result,
            isOpenTab: !!tab,
            tabId: tab?.id,
            windowId: tab?.windowId,
          };
        });

        // Find open tabs that don't have a bookmark
        const openTabsNotInBookmarks = tabs
          .filter((tab) => tab.url && !tab.url.startsWith('chrome://') && !bookmarkUrls.has(tab.url))
          .map((tab) => {
            const titleRelevance = calculateRelevance(query, tab.title || '');
            const urlRelevance = calculateRelevance(query, tab.url || '');
            // Use the higher of the two relevances
            const relevance = Math.max(titleRelevance, urlRelevance);
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
          })
          .filter((tab) => tab.relevance > 0); // Only include tabs that match the search query

        allResults = [...allResults, ...openTabsNotInBookmarks];

        // Add open tabs to excluded URLs
        tabs.forEach((tab) => {
          if (tab.url && !tab.url.startsWith('chrome://')) {
            bookmarkUrls.add(tab.url);
          }
        });

        // Handle history
        if (options.includeHistory) {
          searchHistory(query, bookmarkUrls, (historyResults) => {
            allResults = [...allResults, ...historyResults];
            const finalResults = allResults.sort((a, b) => b.weight - a.weight);
            console.log('[SuperBar] Final results before sorting:', allResults.map(r => ({ title: r.title, weight: r.weight, relevance: r.relevance, usageCount: r.usageCount })));
            console.log('[SuperBar] Final results after sorting:', finalResults.map(r => ({ title: r.title, weight: r.weight, relevance: r.relevance, usageCount: r.usageCount })));
            callback(finalResults);
          });
        } else {
          const finalResults = allResults.sort((a, b) => b.weight - a.weight);
          console.log('[SuperBar] Final results before sorting:', allResults.map(r => ({ title: r.title, weight: r.weight, relevance: r.relevance, usageCount: r.usageCount })));
          console.log('[SuperBar] Final results after sorting:', finalResults.map(r => ({ title: r.title, weight: r.weight, relevance: r.relevance, usageCount: r.usageCount })));
          callback(finalResults);
        }
      });
    } else if (options.includeHistory) {
      // Only history (no tabs)
      searchHistory(query, bookmarkUrls, (historyResults) => {
        allResults = [...allResults, ...historyResults];
        const finalResults = allResults.sort((a, b) => b.weight - a.weight);
        callback(finalResults);
      });
    }
  });
}

// Search browser history
function searchHistory(query: string, excludeUrls: Set<string>, callback: (results: any[]) => void) {
  // Check if chrome.history API is available
  if (!chrome.history || !chrome.history.search) {
    console.error('[History] chrome.history API not available');
    callback([]);
    return;
  }

  // Don't search history with empty query - allow it to return all history
  if (!query || query.trim() === '') {
    // Search with empty string to get recent history
    searchHistoryItems('', excludeUrls, callback);
    return;
  }

  searchHistoryItems(query, excludeUrls, callback);
}

// Helper function to search history items
function searchHistoryItems(query: string, excludeUrls: Set<string>, callback: (results: any[]) => void) {
  let callbackCalled = false;

  // Set a timeout in case the API doesn't respond
  const timeout = setTimeout(() => {
    if (!callbackCalled) {
      console.warn('[History] History search timed out');
      callbackCalled = true;
      callback([]);
    }
  }, 5000);

  // chrome.history.search() searches in URL, not title
  // So we need to search with empty string to get all/recent items, then filter manually
  // startTime: 0 means from the beginning of time (defaults to 24 hours if not specified)
  chrome.history.search({ text: query, maxResults: 25, startTime: 0 }, (historyItems) => {
    if (callbackCalled) {
      return;
    }
    clearTimeout(timeout);
    callbackCalled = true;

    if (chrome.runtime.lastError) {
      console.error('[History] Search error:', chrome.runtime.lastError);
      callback([]);
      return;
    }


    if (!historyItems || historyItems.length === 0) {
      callback([]);
      return;
    }


    // Filter results by matching query against both title and URL
    let filteredItems = historyItems;
    if (query && query.trim() !== '') {
      const lowerQuery = query.toLowerCase();
      filteredItems = historyItems.filter((item) => {
        const titleMatch = (item.title || '').toLowerCase().includes(lowerQuery);
        const urlMatch = (item.url || '').toLowerCase().includes(lowerQuery);
        return titleMatch || urlMatch;
      });
    }

    // Map and filter history results
    const historyResults = filteredItems
      .filter((item) => {
        const isValid = item.url && !item.url.startsWith('chrome://') && !excludeUrls.has(item.url);
        return isValid;
      })
      .map((item) => {
        const titleRelevance = calculateRelevance(query, item.title || '');
        const urlRelevance = calculateRelevance(query, item.url || '');
        const relevance = Math.max(titleRelevance, urlRelevance);
        const weight = calculateBookmarkWeight({ relevance, usageCount: 0 });

        return {
          title: item.title || item.url || 'History',
          url: item.url!,
          isHistory: true,
          relevance,
          weight,
          path: undefined,
        };
      })
      .sort((a, b) => b.weight - a.weight);

    callback(historyResults);
  })
}

// Search through all bookmarks
function searchBookmarks(query: string, callback: (results: any[]) => void) {
  // Get current config to check excluded folders and ignored bookmarks
  chrome.storage.local.get(['superbarConfig'], (result) => {
    let config = result.superbarConfig || {};
    config = migrateConfig(config);
    const excludedFolders = (config.excludedFolders || []) as string[][];
    const ignoredBookmarks = (config.ignoredBookmarks || []) as string[];

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

        // Filter bookmarks based on excluded folders and ignored bookmarks
        const filteredBookmarks = searchResults
          .filter((bookmark) => {
            // Always filter out folders without URLs
            if (!bookmark.url) {
              return false;
            }

            // Check if this bookmark is in the ignored list
            if (ignoredBookmarks.includes(bookmark.url)) {
              return false;
            }

            // Get the full path for this bookmark
            const fullPath = bookmarkPathMap[bookmark.id] || [];

            // Check if the bookmark's path is within any excluded folder
            for (const excludedFolder of excludedFolders) {
              // Build the full excluded path with "Bookmarks" prefix
              const fullExcludedPath = ['Bookmarks', ...excludedFolder];

              // Check if bookmark is in the excluded folder or its subfolders
              if (isPathInFolder(fullPath, fullExcludedPath)) {
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
  } catch (error) {
    console.error('[SuperBar Background] Error tracking bookmark usage:', error);
  }
}

console.log('[SuperBar] Background service worker loaded');
