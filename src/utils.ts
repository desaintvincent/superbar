/**
 * Configuration management utilities
 */

export interface SuperBarConfig {
  shortcut: string;
  enabled: boolean;
  searchEngines: string[];
  showBookmarkPath?: boolean;
  excludedFolders?: string[][];
  ignoredBookmarks?: string[];
  bookmarkUsage?: { [url: string]: number };
  jiraBaseUrl?: string;
  jiraProjectKeys?: string[];
}

export const DEFAULT_CONFIG: SuperBarConfig = {
  shortcut: 'Ctrl+Shift+K',
  enabled: true,
  searchEngines: ['google'],
  showBookmarkPath: true,
  excludedFolders: [],
  ignoredBookmarks: [],
  bookmarkUsage: {},
  jiraBaseUrl: '',
  jiraProjectKeys: [],
};

export async function getConfig(): Promise<SuperBarConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['superbarConfig'], (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('[SuperBar] Error getting config:', error);
        resolve(DEFAULT_CONFIG);
      } else {
        resolve(result.superbarConfig || DEFAULT_CONFIG);
      }
    });
  });
}

export async function saveConfig(config: SuperBarConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ superbarConfig: config }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('[SuperBar] Error saving config:', error);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export async function sendMessageToBackground(message: any): Promise<any> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}

/**
 * IndexedDB operations for bookmark usage tracking
 */
const DB_NAME = 'SuperBarDB';
const DB_VERSION = 1;
const STORE_NAME = 'bookmarkUsage';

function initializeDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function getBookmarkUsage(url: string): Promise<number> {
  try {
    const db = await initializeDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? 0);
    });
  } catch (error) {
    console.error('[SuperBar] Error getting bookmark usage:', error);
    return 0;
  }
}

export async function incrementBookmarkUsage(url: string): Promise<void> {
  try {
    const db = await initializeDB();
    const currentCount = await getBookmarkUsage(url);
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const newCount = currentCount + 1;
        const request = store.put(newCount, url);

        request.onerror = () => {
          console.error('[SuperBar] Error incrementing bookmark usage:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log('[SuperBar] Incremented usage for', url, 'to', newCount);
          resolve();
        };

        transaction.onerror = () => {
          console.error('[SuperBar] Transaction error in incrementBookmarkUsage:', transaction.error);
          reject(transaction.error);
        };
      } catch (error) {
        console.error('[SuperBar] Error in incrementBookmarkUsage:', error);
        reject(error);
      }
    });
  } catch (error) {
    console.error('[SuperBar] Error incrementing bookmark usage:', error);
  }
}

export async function getAllBookmarkUsage(): Promise<{ [url: string]: number }> {
  try {
    const db = await initializeDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const result: { [url: string]: number } = {};

        const keysRequest = (store.getAllKeys() as IDBRequest<IDBValidKey[]>);
        keysRequest.onsuccess = () => {
          const allKeys = keysRequest.result as (string | number)[];
          let processed = 0;

          if (allKeys.length === 0) {
            resolve(result);
            return;
          }

          allKeys.forEach((key: string | number) => {
            const getRequest = store.get(key);
            getRequest.onsuccess = () => {
              result[String(key)] = getRequest.result ?? 0;
              processed++;
              if (processed === allKeys.length) {
                resolve(result);
              }
            };
            getRequest.onerror = () => {
              console.error('[SuperBar] Error getting key:', key, getRequest.error);
              reject(getRequest.error);
            };
          });
        };
        keysRequest.onerror = () => {
          console.error('[SuperBar] Error getting all keys:', keysRequest.error);
          reject(keysRequest.error);
        };

        transaction.onerror = () => {
          console.error('[SuperBar] Transaction error in getAllBookmarkUsage:', transaction.error);
          reject(transaction.error);
        };
      } catch (error) {
        console.error('[SuperBar] Error in getAllBookmarkUsage:', error);
        reject(error);
      }
    });
  } catch (error) {
    console.error('[SuperBar] Error getting all bookmark usage:', error);
    return {};
  }
}
/**
 * Calculate weight for sorting bookmarks
 * Can accept multiple parameters for future expansion
 */
export function calculateBookmarkWeight(params: {
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

/**
 * Get the operating system
 */
export function getOS(): string {
  if (navigator.userAgent.includes('Windows')) return 'windows';
  if (navigator.userAgent.includes('Mac')) return 'mac';
  if (navigator.userAgent.includes('Linux')) return 'linux';
  return 'unknown';
}
