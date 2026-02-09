/**
 * Background Service Worker for SuperBar Chrome Extension
 * Handles extension initialization and event handling
 */

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default configuration with all required properties
    const defaultConfig = {
      shortcut: 'Ctrl+Shift+K',
      enabled: true,
      searchEngines: ['google'],
      showBookmarkPath: true,
      excludedFolderNames: [],
    };

    chrome.storage.local.set({ superbarConfig: defaultConfig }, () => {
      console.log('[SuperBar Background] Default config set on install');
      // Open settings page on first install
      chrome.runtime.openOptionsPage();
    });
  }
});

// Handle command (keyboard shortcut)
chrome.commands.onCommand.addListener((command) => {
  if (command === '_execute_action') {
    // Get the active tab and trigger search
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        const tabUrl = tabs[0].url || '';

        // Check if it's a restricted page
        const isRestricted = tabUrl.startsWith('chrome://') ||
                            tabUrl.startsWith('edge://') ||
                            tabUrl.startsWith('file://');

        if (isRestricted) {
          // Open search in a new window for restricted pages
          chrome.windows.create({
            url: chrome.runtime.getURL('search-overlay.html'),
            type: 'popup',
            width: 700,
            height: 400,
          });
        } else {
          // Try to send message to content script for normal pages
          chrome.tabs.sendMessage(tabs[0].id, { type: 'OPEN_SEARCH' }).catch(() => {
            // Fallback to window for pages where content script can't run
            chrome.windows.create({
              url: chrome.runtime.getURL('search-overlay.html'),
              type: 'popup',
              width: 700,
              height: 400,
            });
          });
        }
      }
    });
  }
});

// Handle action button click
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    const tabUrl = tab.url || '';

    // Check if it's a restricted page
    const isRestricted = tabUrl.startsWith('chrome://') ||
                        tabUrl.startsWith('edge://') ||
                        tabUrl.startsWith('file://');

    if (isRestricted) {
      chrome.windows.create({
        url: chrome.runtime.getURL('search-overlay.html'),
        type: 'popup',
        width: 700,
        height: 400,
      });
    } else {
      chrome.tabs.sendMessage(tab.id, { type: 'OPEN_SEARCH' }).catch(() => {
        chrome.windows.create({
          url: chrome.runtime.getURL('search-overlay.html'),
          type: 'popup',
          width: 700,
          height: 400,
        });
      });
    }
  }
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
        // Notify all tabs about the config change
        notifyAllTabs(message.payload);
      });
      break;

    case 'SEARCH_BOOKMARKS':
      searchBookmarks(message.payload.query, (results) => {
        sendResponse({ results });
      });
      break;

    case 'OPEN_BOOKMARK':
      if (message.payload?.url) {
        chrome.tabs.create({ url: message.payload.url }, () => {
          sendResponse({ success: true });
        });
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

// Search through all bookmarks
function searchBookmarks(query: string, callback: (results: any[]) => void) {
  // Get current config to check excluded folders list
  chrome.storage.local.get(['superbarConfig'], (result) => {
    const config = result.superbarConfig || {};
    const excludedFolderNames = (config.excludedFolderNames || []) as string[];
    const hasExcludedFolders = excludedFolderNames.length > 0;

    console.log('[SuperBar Background] Search config:', { excludedFolderNames, hasExcludedFolders });

    chrome.bookmarks.search(query, (searchResults) => {
      // First, build the complete path map for all bookmarks
      chrome.bookmarks.getTree((bookmarkTreeNodes) => {
        const bookmarkPathMap: { [key: string]: string[] } = {}; // Maps bookmark ID to full folder path array

        function buildPathMap(nodes: any[], currentPath: string[] = []) {
          nodes.forEach((node) => {
            const nodePath = [...currentPath, node.title || ''];

            // Store path for all items (folders and bookmarks)
            bookmarkPathMap[node.id] = nodePath;

            if (node.children) {
              buildPathMap(node.children, nodePath);
            }
          });
        }

        buildPathMap(bookmarkTreeNodes);

        console.log('[SuperBar Background] Bookmark path map keys:', Object.keys(bookmarkPathMap).length);

        // Filter bookmarks based on excluded folders
        const bookmarks = searchResults
          .filter((bookmark) => {
            // Always filter out folders without URLs
            if (!bookmark.url) {
              return false;
            }

            // Get the full path for this bookmark
            const fullPath = bookmarkPathMap[bookmark.id] || [];
            console.log('[SuperBar Background] Checking bookmark:', bookmark.title, 'Path:', fullPath);

            // Check if ANY folder in the path is in the excluded list
            for (const pathFolder of fullPath) {
              if (excludedFolderNames.includes(pathFolder)) {
                console.log('[SuperBar Background] Excluding bookmark:', bookmark.title, 'because folder', pathFolder, 'is excluded');
                return false;
              }
            }

            // Always include bookmarks with URLs
            return true;
          })
          .map((bookmark) => ({
            title: bookmark.title || 'Untitled',
            url: bookmark.url,
            id: bookmark.id,
            parentId: bookmark.parentId,
            relevance: calculateRelevance(query, bookmark.title || ''),
          }))
          .sort((a, b) => b.relevance - a.relevance);

        console.log('[SuperBar Background] Filtered results count:', bookmarks.length);

        // Get paths for bookmarks
        getBookmarkPaths(bookmarks, (bookmarksWithPaths) => {
          callback(bookmarksWithPaths);
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

// Helper function to notify all tabs about configuration changes
function notifyAllTabs(config: any) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CONFIG_UPDATED',
          payload: config,
        }).catch(() => {
          // Tab might not have content script loaded, ignore error
        });
      }
    });
  });
}

console.log('[SuperBar] Background service worker loaded');
