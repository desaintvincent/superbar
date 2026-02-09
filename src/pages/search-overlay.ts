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
        return `
          <div class="superbar-result ${isSelected ? 'selected' : ''}" data-index="${index}">
            <div class="superbar-result-content">
              <img src="${faviconUrl}" alt="" class="superbar-favicon" onerror="this.style.display='none'" />
              <div class="superbar-result-text">
                <div class="superbar-result-title">${escapeHtml(result.title)}</div>
                ${pathHtml}
                <div class="superbar-result-url">${escapeHtml(new URL(result.url).hostname)}</div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');

    const resultElements = resultsContainer.querySelectorAll('.superbar-result');
    resultElements.forEach((elem, index) => {
      elem.addEventListener('click', () => {
        if (currentResults[index]) {
          openBookmark(currentResults[index].url);
          closeSearch();
        }
      });

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

  function closeSearch() {
    window.close();
  }

  console.log('[SuperBar] Search overlay loaded');
})();
