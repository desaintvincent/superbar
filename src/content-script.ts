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

let config: SuperBarConfig = {
  shortcut: 'Ctrl+Shift+K',
  enabled: true,
};

let currentResults: BookmarkResult[] = [];
let selectedIndex = -1;

// Load configuration from storage
chrome.storage.local.get(['superbarConfig'], (result) => {
  if (result.superbarConfig) {
    config = result.superbarConfig;
  }
});

// Listen for configuration changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.superbarConfig) {
    config = changes.superbarConfig.newValue;
  }
});

// Listen for messages from background (for command activation)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SEARCH') {
    openSearchBar();
    sendResponse({ success: true });
  }
  return true;
});

// Parse keyboard shortcut string to KeyboardEvent properties
function parseShortcut(shortcut: string) {
  const keys = shortcut.split('+').map((k) => k.trim());
  return {
    ctrl: keys.includes('Ctrl'),
    shift: keys.includes('Shift'),
    alt: keys.includes('Alt'),
    meta: keys.includes('Meta'),
    key: keys[keys.length - 1],
  };
}

// Handle keyboard events
document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (!config.enabled) return;

  const parsedShortcut = parseShortcut(config.shortcut);

  const matches =
    event.ctrlKey === parsedShortcut.ctrl &&
    event.shiftKey === parsedShortcut.shift &&
    event.altKey === parsedShortcut.alt &&
    event.metaKey === parsedShortcut.meta &&
    event.key.toLowerCase() === parsedShortcut.key.toLowerCase();

  if (matches) {
    event.preventDefault();
    openSearchBar();
  }
});

// Create and show search bar
function openSearchBar() {
  // Wait for body to exist
  if (!document.body) {
    // Try again after a short delay
    setTimeout(openSearchBar, 100);
    return;
  }

  // Check if search bar already exists
  const existingBar = document.getElementById('superbar-container');
  if (existingBar) {
    existingBar.remove();
    return;
  }

  const container = document.createElement('div');
  container.id = 'superbar-container';
  container.innerHTML = `
    <div id="superbar-overlay"></div>
    <div id="superbar-modal">
      <div id="superbar-header">
        <input
          type="text"
          id="superbar-input"
          placeholder="Search bookmarks..."
          autocomplete="off"
        />
        <span id="superbar-close">×</span>
      </div>
      <div id="superbar-results"></div>
    </div>
  `;

  document.body.appendChild(container);

  const closeSearch = () => {
    document.removeEventListener('keydown', handleInputKeydown, true);
    container.remove();
  };

  // Inject styles
  injectStyles();

  // Reset state
  currentResults = [];
  selectedIndex = -1;

  // Focus input
  const input = document.getElementById('superbar-input') as HTMLInputElement;
  if (input) {
    input.focus();

    // Handle search input
    input.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      if (query.trim()) {
        performSearch(query);
      } else {
        clearResults();
        selectedIndex = -1;
      }
    });
  }

  document.addEventListener('keydown', handleInputKeydown, true);

  // Close on overlay click or close button
  const overlay = document.getElementById('superbar-overlay');
  const closeBtn = document.getElementById('superbar-close');

  if (overlay) {
    overlay.addEventListener('click', closeSearch);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeSearch);
  }
}

// Handle keyboard navigation in search bar
function handleInputKeydown(e: KeyboardEvent) {
  const container = document.getElementById('superbar-container');
  if (!container) return;

  switch (e.key) {
    case 'Escape':
      e.preventDefault();
      container.remove();
      document.removeEventListener('keydown', handleInputKeydown, true);
      break;

    case 'ArrowDown':
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
      highlightResult();
      break;

    case 'ArrowUp':
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      highlightResult();
      break;

    case 'Enter':
      e.preventDefault();
      if (selectedIndex >= 0 && currentResults[selectedIndex]) {
        openBookmark(currentResults[selectedIndex].url);
        container.remove();
        document.removeEventListener('keydown', handleInputKeydown, true);
      }
      break;
  }
}

// Search bookmarks through background service worker
async function performSearch(query: string) {
  const resultsContainer = document.getElementById('superbar-results');
  if (!resultsContainer) return;

  resultsContainer.innerHTML = '<div class="superbar-loading">Searching...</div>';

  chrome.runtime.sendMessage(
    {
      type: 'SEARCH_BOOKMARKS',
      payload: { query },
    },
    (response) => {
      currentResults = response?.results || [];
      renderResults();
    }
  );
}

// Render search results
function renderResults() {
  const resultsContainer = document.getElementById('superbar-results');
  if (!resultsContainer) return;

  if (currentResults.length === 0) {
    resultsContainer.innerHTML =
      '<div class="superbar-no-results">No bookmarks found</div>';
    selectedIndex = -1;
    return;
  }

  // Select first result by default
  if (selectedIndex === -1 && currentResults.length > 0) {
    selectedIndex = 0;
  }

  resultsContainer.innerHTML = currentResults
    .map((result, index) => {
      const isSelected = index === selectedIndex;
      const faviconUrl = `https://www.google.com/s2/favicons?sz=16&domain=${new URL(result.url).hostname}`;
      return `
        <div class="superbar-result ${isSelected ? 'selected' : ''}" data-index="${index}">
          <div class="superbar-result-content">
            <img src="${faviconUrl}" alt="" class="superbar-favicon" onerror="this.style.display='none'" />
            <div class="superbar-result-text">
              <div class="superbar-result-title">${escapeHtml(result.title)}</div>
              <div class="superbar-result-url">${escapeHtml(new URL(result.url).hostname)}</div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  // Add click handlers
  const resultElements = resultsContainer.querySelectorAll('.superbar-result');
  resultElements.forEach((elem, index) => {
    elem.addEventListener('click', () => {
      if (currentResults[index]) {
        openBookmark(currentResults[index].url);
        const container = document.getElementById('superbar-container');
        if (container) container.remove();
      }
    });

    elem.addEventListener('mouseenter', () => {
      selectedIndex = index;
      highlightResult();
    });
  });

  highlightResult();
}

// Highlight the currently selected result
function highlightResult() {
  const resultElements = document.querySelectorAll('.superbar-result');
  resultElements.forEach((elem, index) => {
    if (index === selectedIndex) {
      elem.classList.add('selected');
      // Scroll into view if needed
      (elem as HTMLElement).scrollIntoView({ block: 'nearest' });
    } else {
      elem.classList.remove('selected');
    }
  });
}

// Clear results
function clearResults() {
  const resultsContainer = document.getElementById('superbar-results');
  if (resultsContainer) {
    resultsContainer.innerHTML = '';
  }
  currentResults = [];
  selectedIndex = -1;
}

// Open bookmark in new tab
function openBookmark(url: string) {
  chrome.runtime.sendMessage({
    type: 'OPEN_BOOKMARK',
    payload: { url },
  });
}

// Escape HTML special characters
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

// Inject CSS styles
function injectStyles() {
  if (document.getElementById('superbar-styles')) return;

  const style = document.createElement('style');
  style.id = 'superbar-styles';
  style.textContent = `
    #superbar-container * {
      box-sizing: border-box;
    }

    #superbar-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999998;
    }

    #superbar-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border-radius: 8px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      width: 90%;
      max-width: 600px;
      z-index: 999999;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    #superbar-header {
      display: flex;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
    }

    #superbar-input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #superbar-close {
      font-size: 24px;
      cursor: pointer;
      color: #6b7280;
      margin-left: 12px;
      font-weight: bold;
      transition: color 0.2s;
    }

    #superbar-close:hover {
      color: #111827;
    }

    #superbar-results {
      overflow-y: auto;
      max-height: calc(80vh - 60px);
    }

    .superbar-loading,
    .superbar-no-results {
      padding: 20px 16px;
      text-align: center;
      color: #6b7280;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
    }

    .superbar-result {
      padding: 12px 16px;
      border-bottom: 1px solid #f3f4f6;
      cursor: pointer;
      transition: background 0.15s;
      display: flex;
      align-items: center;
    }

    .superbar-result:hover {
      background: #f9fafb;
    }

    .superbar-result.selected {
      background: #dbeafe;
      border-left: 4px solid #2563eb;
      padding-left: 12px;
      box-shadow: inset 0 0 0 1px #93c5fd;
    }

    .superbar-result-content {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }

    .superbar-favicon {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }

    .superbar-result-text {
      flex: 1;
      min-width: 0;
    }

    .superbar-result-title {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      color: #1f2937;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .superbar-result-url {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      color: #9ca3af;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }
  `;

  document.head.appendChild(style);
}

console.log('[SuperBar] Content script loaded');
