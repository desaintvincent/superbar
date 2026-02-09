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
}

export const DEFAULT_CONFIG: SuperBarConfig = {
  shortcut: 'Ctrl+Shift+K',
  enabled: true,
  searchEngines: ['google'],
  showBookmarkPath: true,
  excludedFolders: [],
  ignoredBookmarks: [],
};

export async function getConfig(): Promise<SuperBarConfig> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['superbarConfig'], (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('[SuperBar] Error getting config:', error);
        resolve(DEFAULT_CONFIG);
      } else {
        console.log('[SuperBar] Config loaded:', result.superbarConfig || DEFAULT_CONFIG);
        resolve(result.superbarConfig || DEFAULT_CONFIG);
      }
    });
  });
}

export async function saveConfig(config: SuperBarConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('[SuperBar] Saving config:', config);
    chrome.storage.local.set({ superbarConfig: config }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('[SuperBar] Error saving config:', error);
        reject(error);
      } else {
        console.log('[SuperBar] Config saved successfully');
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
 * Parse keyboard shortcut string (e.g., "Ctrl+Shift+K")
 */
export function parseShortcut(shortcut: string) {
  const keys = shortcut.split('+').map((k) => k.trim());
  return {
    ctrl: keys.includes('Ctrl'),
    shift: keys.includes('Shift'),
    alt: keys.includes('Alt'),
    meta: keys.includes('Meta'),
    key: keys[keys.length - 1],
  };
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
