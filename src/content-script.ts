/**
 * Content Script for SuperBar Chrome Extension
 * Handles keyboard shortcuts and bookmark search UI on web pages
 */

(() => {
  interface SuperBarConfig {
    shortcut: string;
    enabled: boolean;
    showBookmarkPath?: boolean;
    excludedFolders?: string[][];
    ignoredBookmarks?: string[];
  }

  interface BookmarkResult {
    title: string;
    url: string;
    relevance: number;
    path?: string;
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
    if (!document.body) {
      setTimeout(openSearchBar, 100);
      return;
    }

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

    injectStyles();

    currentResults = [];
    selectedIndex = -1;

    const input = document.getElementById('superbar-input') as HTMLInputElement;
    if (input) {
      input.focus();

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

    const overlay = document.getElementById('superbar-overlay');
    const closeBtn = document.getElementById('superbar-close');

    if (overlay) {
      overlay.addEventListener('click', closeSearch);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closeSearch);
    }
  }

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

  function renderResults() {
    const resultsContainer = document.getElementById('superbar-results');
    if (!resultsContainer) return;

    if (currentResults.length === 0) {
      resultsContainer.innerHTML =
        '<div class="superbar-no-results">No bookmarks found</div>';
      selectedIndex = -1;
      return;
    }

    if (selectedIndex === -1 && currentResults.length > 0) {
      selectedIndex = 0;
    }

    resultsContainer.innerHTML = currentResults
      .map((result, index) => {
        const isSelected = index === selectedIndex;
        const faviconUrl = `https://www.google.com/s2/favicons?sz=16&domain=${new URL(result.url).hostname}`;
        const showPath = config.showBookmarkPath !== false;
        const pathHtml = showPath && result.path ? `<div class="superbar-result-path">${escapeHtml(result.path)}</div>` : '';
        return `
          <div class="superbar-result ${isSelected ? 'selected' : ''}" data-index="${index}">
            <div class="superbar-result-content">
              <img src="${faviconUrl}" alt="" class="superbar-favicon" onerror="this.style.display='none'" />
              <div class="superbar-result-text">
                <div class="superbar-result-title">${escapeHtml(result.title)}</div>
                ${pathHtml}
                <div class="superbar-result-url">${escapeHtml(new URL(result.url).hostname)}</div>
              </div>
              <div class="superbar-result-actions">
                <button class="superbar-action-btn" data-index="${index}" title="More actions">⋮</button>
                <div class="superbar-action-menu" data-index="${index}" style="display: none;">
                  <button class="superbar-action-item" data-action="delete" data-index="${index}">🗑️ Delete</button>
                  <button class="superbar-action-item" data-action="ignore-folder" data-index="${index}">📁 Ignore Folder</button>
                  <button class="superbar-action-item" data-action="ignore-bookmark" data-index="${index}">🚫 Ignore Bookmark</button>
                </div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const resultElements = resultsContainer.querySelectorAll('.superbar-result');
    resultElements.forEach((elem, index) => {
      // Handle clicking on action menu button
      const actionBtn = elem.querySelector('.superbar-action-btn');
      if (actionBtn) {
        actionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = elem.querySelector('.superbar-action-menu') as HTMLElement;
          if (menu) {
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
          }
        });
      }

      // Handle action menu items
      const actionItems = elem.querySelectorAll('.superbar-action-item');
      actionItems.forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = (item as HTMLElement).getAttribute('data-action');
          const bookmarkIndex = parseInt((item as HTMLElement).getAttribute('data-index') || '0');
          handleAction(action, bookmarkIndex);
        });
      });

      // Handle clicking on result content to open bookmark
      const resultContent = elem.querySelector('.superbar-result-content') as HTMLElement;
      if (resultContent) {
        resultContent.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).closest('.superbar-result-actions')) {
            return; // Don't open bookmark if clicking actions
          }
          if (currentResults[index]) {
            openBookmark(currentResults[index].url);
            const container = document.getElementById('superbar-container');
            if (container) container.remove();
          }
        });
      }

      elem.addEventListener('mouseenter', () => {
        selectedIndex = index;
        highlightResult();
      });
    });

    highlightResult();
  }

  function highlightResult() {
    const resultElements = document.querySelectorAll('.superbar-result');
    resultElements.forEach((elem, index) => {
      if (index === selectedIndex) {
        elem.classList.add('selected');
        (elem as HTMLElement).scrollIntoView({ block: 'nearest' });
      } else {
        elem.classList.remove('selected');
      }
    });
  }

  function clearResults() {
    const resultsContainer = document.getElementById('superbar-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = '';
    }
    currentResults = [];
    selectedIndex = -1;
  }

  function openBookmark(url: string) {
    chrome.runtime.sendMessage({
      type: 'OPEN_BOOKMARK',
      payload: { url },
    });
  }

  function handleAction(action: string | null, bookmarkIndex: number) {
    const bookmark = currentResults[bookmarkIndex];
    if (!bookmark) return;

    switch (action) {
      case 'delete':
        if (confirm(`Delete bookmark: ${bookmark.title}?`)) {
          chrome.runtime.sendMessage({
            type: 'DELETE_BOOKMARK',
            payload: { url: bookmark.url },
          }, () => {
            console.log('[SuperBar] Bookmark deleted');
            const query = (document.getElementById('superbar-input') as HTMLInputElement)?.value || '';
            if (query) performSearch(query);
          });
        }
        break;

      case 'ignore-folder':
        if (bookmark.path) {
          const path = bookmark.path;
          if (confirm(`Add "${path}" to ignored folders?`)) {
            chrome.storage.local.get(['superbarConfig'], (result) => {
              const config = result.superbarConfig || {};
              const excludedFolders = (config.excludedFolders || []) as string[][];

              // Convert path to array: "Bookmarks//home/clim" → ["/home", "clim"]
              const pathWithoutPrefix = path.replace(/^Bookmarks\/?/, '');
              const parts = pathWithoutPrefix.split('/').filter((p) => p.length > 0);

              // Add leading / to first element if not already there
              const folderArray = parts.length > 0
                ? [parts[0].startsWith('/') ? parts[0] : '/' + parts[0], ...parts.slice(1)]
                : [];

              // Check if this folder path already exists
              const folderArrayStr = JSON.stringify(folderArray);
              const alreadyExists = excludedFolders.some((f) => JSON.stringify(f) === folderArrayStr);

              if (!alreadyExists && folderArray.length > 0) {
                excludedFolders.push(folderArray);
                config.excludedFolders = excludedFolders;
                chrome.storage.local.set({ superbarConfig: config }, () => {
                  console.log('[SuperBar] Folder added to ignored list:', folderArray);
                  const query = (document.getElementById('superbar-input') as HTMLInputElement)?.value || '';
                  if (query) performSearch(query);
                });
              }
            });
          }
        }
        break;

      case 'ignore-bookmark':
        if (confirm(`Ignore this bookmark in future searches?`)) {
          chrome.storage.local.get(['superbarConfig'], (result) => {
            const config = result.superbarConfig || {};
            const ignoredBookmarks = config.ignoredBookmarks || [];

            if (!ignoredBookmarks.includes(bookmark.url)) {
              ignoredBookmarks.push(bookmark.url);
              config.ignoredBookmarks = ignoredBookmarks;
              chrome.storage.local.set({ superbarConfig: config }, () => {
                console.log('[SuperBar] Bookmark added to ignored list');
                const query = (document.getElementById('superbar-input') as HTMLInputElement)?.value || '';
                if (query) performSearch(query);
              });
            }
          });
        }
        break;
    }
  }

  function deleteBookmark(url: string) {
    chrome.runtime.sendMessage({
      type: 'DELETE_BOOKMARK',
      payload: { url },
    }, () => {
      console.log('[SuperBar] Bookmark deleted');
      const query = (document.getElementById('superbar-input') as HTMLInputElement)?.value || '';
      if (query) performSearch(query);
    });
  }

  function addIgnoredFolder(folderPath: string) {
    chrome.runtime.sendMessage({
      type: 'ADD_IGNORED_FOLDER',
      payload: { folderPath },
    }, () => {
      console.log('[SuperBar] Folder added to ignored list');
      const query = (document.getElementById('superbar-input') as HTMLInputElement)?.value || '';
      if (query) performSearch(query);
    });
  }

  function addIgnoredBookmark(url: string) {
    chrome.runtime.sendMessage({
      type: 'ADD_IGNORED_BOOKMARK',
      payload: { url },
    }, () => {
      console.log('[SuperBar] Bookmark added to ignored list');
      const query = (document.getElementById('superbar-input') as HTMLInputElement)?.value || '';
      if (query) performSearch(query);
    });
  }

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

  function injectStyles() {
    if (document.getElementById('superbar-styles')) return;

    const style = document.createElement('style');
    style.id = 'superbar-styles';
    style.textContent = `
      #superbar-container * {
        box-sizing: border-box !important;
      }

      #superbar-overlay {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        background: rgba(0, 0, 0, 0.7) !important;
        z-index: 999998 !important;
      }

      #superbar-modal {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        background: #1f2937 !important;
        border-radius: 8px !important;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5) !important;
        width: 90% !important;
        max-width: 600px !important;
        z-index: 999999 !important;
        max-height: 80vh !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
      }

      #superbar-header {
        display: flex !important;
        align-items: center !important;
        padding: 16px !important;
        border-bottom: 1px solid #374151 !important;
        background: #1f2937 !important;
      }

      #superbar-input {
        flex: 1 !important;
        border: none !important;
        outline: none !important;
        font-size: 16px !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        background: #111827 !important;
        color: #f3f4f6 !important;
        padding: 8px 12px !important;
        border-radius: 4px !important;
      }

      #superbar-input::placeholder {
        color: #9ca3af !important;
      }

      #superbar-close {
        font-size: 24px !important;
        cursor: pointer !important;
        color: #9ca3af !important;
        margin-left: 12px !important;
        font-weight: bold !important;
        transition: color 0.2s !important;
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
      }

      #superbar-close:hover {
        color: #f3f4f6 !important;
      }

      #superbar-results {
        overflow-y: auto !important;
        max-height: calc(80vh - 60px) !important;
        background: #1f2937 !important;
      }

      .superbar-loading,
      .superbar-no-results {
        padding: 20px 16px !important;
        text-align: center !important;
        color: #9ca3af !important;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 14px !important;
        background: #1f2937 !important;
      }

      .superbar-result {
        padding: 12px 16px !important;
        border-bottom: 1px solid #374151 !important;
        cursor: pointer !important;
        transition: background 0.15s !important;
        display: flex !important;
        align-items: center !important;
        background: #1f2937 !important;
        color: #f3f4f6 !important;
      }

      .superbar-result:hover {
        background: #111827 !important;
      }

      .superbar-result.selected {
        background: #1e40af !important;
        border-left: 4px solid #3b82f6 !important;
        padding-left: 12px !important;
        box-shadow: inset 0 0 0 1px #1e3a8a !important;
      }

      .superbar-result-content {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        width: 100% !important;
      }

      .superbar-favicon {
        width: 16px !important;
        height: 16px !important;
        flex-shrink: 0 !important;
      }

      .superbar-result-text {
        flex: 1 !important;
        min-width: 0 !important;
      }

      .superbar-result-title {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 14px !important;
        color: #f3f4f6 !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      .superbar-result-path {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 11px !important;
        color: #4b5563 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        margin-top: 1px !important;
        margin-bottom: 2px !important;
      }

      .superbar-result-url {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
        font-size: 12px !important;
        color: #6b7280 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        margin-top: 2px !important;
      }
    `;

    document.head.appendChild(style);
  }

  console.log('[SuperBar] Content script loaded');
})();
