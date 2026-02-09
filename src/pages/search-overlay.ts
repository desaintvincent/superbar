/**
 * Search Overlay Script - runs in a standalone context
 * Works on restricted pages like chrome://, new tabs, etc.
 */

(() => {
  interface BookmarkResult {
    title: string;
    url: string;
    relevance: number;
    path?: string;
  }

  let currentResults: BookmarkResult[] = [];
  let selectedIndex = -1;

  document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('superbar-input') as HTMLInputElement;
    const closeBtn = document.getElementById('superbar-close');
    const overlay = document.getElementById('superbar-overlay');

    if (input) {
      input.focus();
      input.addEventListener('input', handleSearch);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        closeSearch();
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        closeSearch();
      });
    }

    document.addEventListener('keydown', handleKeydown);
  });

  function handleSearch(e: Event) {
    const query = (e.target as HTMLInputElement).value;
    if (query.trim()) {
      performSearch(query);
    } else {
      clearResults();
      selectedIndex = -1;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeSearch();
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
          closeSearch();
        }
        break;
    }
  }

  function performSearch(query: string) {
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
        const pathHtml = result.path ? `<div class="superbar-result-path">${escapeHtml(result.path)}</div>` : '';
        const usageCount = (result as any).usageCount || 0;
        const usageHtml = usageCount > 0 ? `<div class="superbar-result-usage">${usageCount}×</div>` : '';
        return `
          <div class="superbar-result ${isSelected ? 'selected' : ''}" data-index="${index}">
            <div class="superbar-result-content">
              <img src="${faviconUrl}" alt="" class="superbar-favicon" onerror="this.style.display='none'" />
              <div class="superbar-result-text">
                <div class="superbar-result-title">${escapeHtml(result.title)}</div>
                ${pathHtml}
                <div class="superbar-result-url">${escapeHtml(new URL(result.url).hostname)}</div>
              </div>
              ${usageHtml}
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
            closeSearch();
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

  function handleAction(action: string | null, bookmarkIndex: number) {
    const bookmark = currentResults[bookmarkIndex];
    if (!bookmark) return;

    switch (action) {
      case 'delete':
        if (confirm(`Delete bookmark: ${bookmark.title}?`)) {
          chrome.bookmarks.search({ url: bookmark.url }, (results) => {
            if (results.length > 0) {
              chrome.bookmarks.remove(results[0].id, () => {
                console.log('[SuperBar] Bookmark deleted');
                performSearch((document.getElementById('superbar-input') as HTMLInputElement).value);
              });
            }
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
                  performSearch((document.getElementById('superbar-input') as HTMLInputElement).value);
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
                performSearch((document.getElementById('superbar-input') as HTMLInputElement).value);
              });
            }
          });
        }
        break;
    }
  }

  function closeSearch() {
    window.close();
  }

  console.log('[SuperBar] Search overlay loaded');
})();
