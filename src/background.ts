/**
 * Background Service Worker for SuperBar Chrome Extension
 * Handles extension initialization and event handling
 */

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default configuration
    const defaultConfig = {
      shortcut: 'Ctrl+Shift+K',
      enabled: true,
      searchEngines: ['google', 'wikipedia', 'github'],
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
  chrome.bookmarks.search(query, (results) => {
    // Filter to only bookmarks (not folders), and sort by relevance
    const bookmarks = results
      .filter((bookmark) => bookmark.url) // Only items with URLs (actual bookmarks, not folders)
      .map((bookmark) => ({
        title: bookmark.title || 'Untitled',
        url: bookmark.url,
        relevance: calculateRelevance(query, bookmark.title || ''),
      }))
      .sort((a, b) => b.relevance - a.relevance);

    callback(bookmarks);
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
