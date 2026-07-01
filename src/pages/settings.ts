/**
 * Settings Page for SuperBar Chrome Extension
 */
import { getConfig, saveConfig, DEFAULT_CONFIG, getOS } from '../utils';
let isRecording = false;
let recordedKeys: string[] = [];
// Load settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  const config = await getConfig();
  console.log('[SuperBar Settings] Loading config into form:', config);

  // Set form values
  const enabledCheckbox = document.getElementById('enabled') as HTMLInputElement;
  // No #shortcut element exists in settings.html (the real Chrome shortcut is
  // managed via chrome://extensions/shortcuts, this field is just a stored label)
  const shortcutInput = document.getElementById('shortcut') as HTMLInputElement | null;
  const showPathCheckbox = document.getElementById('show-path') as HTMLInputElement;
  const excludedFoldersTextarea = document.getElementById('excluded-folders-list') as HTMLTextAreaElement;
  const ignoredBookmarksTextarea = document.getElementById('ignored-bookmarks-list') as HTMLTextAreaElement;
  const jiraBaseUrlInput = document.getElementById('jira-base-url') as HTMLInputElement;
  const jiraProjectKeysTextarea = document.getElementById('jira-project-keys') as HTMLTextAreaElement;

  enabledCheckbox.checked = config.enabled;
  if (shortcutInput) shortcutInput.value = config.shortcut;
  showPathCheckbox.checked = config.showBookmarkPath !== false;

  // Display excluded folders as compact JSON (don't reformat)
  const excludedFolders = config.excludedFolders || [];
  const excludedFoldersText = excludedFolders.length > 0
    ? JSON.stringify(excludedFolders)
    : '[]';
  excludedFoldersTextarea.value = excludedFoldersText;

  ignoredBookmarksTextarea.value = (config.ignoredBookmarks || []).join('\n');

  jiraBaseUrlInput.value = config.jiraBaseUrl || '';
  jiraProjectKeysTextarea.value = (config.jiraProjectKeys || []).join('\n');

  console.log('[SuperBar Settings] Form loaded with:', {
    enabled: enabledCheckbox.checked,
    shortcut: shortcutInput?.value,
    showPath: showPathCheckbox.checked,
    excludedFolders: excludedFoldersTextarea.value,
    ignoredBookmarks: ignoredBookmarksTextarea.value,
    jiraBaseUrl: jiraBaseUrlInput.value,
    jiraProjectKeys: jiraProjectKeysTextarea.value,
  });

  // Setup event listeners
  setupEventListeners();
});
function setupEventListeners() {
  const form = document.getElementById('settings-form') as HTMLFormElement;
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  form?.addEventListener('submit', handleSave);
  resetBtn?.addEventListener('click', resetToDefaults);
}
async function handleSave(e: Event) {
  e.preventDefault();
  console.log('[SuperBar Settings] Save button clicked');

  const enabledCheckbox = document.getElementById('enabled') as HTMLInputElement;
  const shortcutInput = document.getElementById('shortcut') as HTMLInputElement | null;
  const showPathCheckbox = document.getElementById('show-path') as HTMLInputElement;
  const excludedFoldersTextarea = document.getElementById('excluded-folders-list') as HTMLTextAreaElement;
  const ignoredBookmarksTextarea = document.getElementById('ignored-bookmarks-list') as HTMLTextAreaElement;
  const jiraBaseUrlInput = document.getElementById('jira-base-url') as HTMLInputElement;
  const jiraProjectKeysTextarea = document.getElementById('jira-project-keys') as HTMLTextAreaElement;

  // Parse excluded folders - read as full JSON array, ignore newlines
  let excludedFolders: string[][] = [];
  const folderText = excludedFoldersTextarea.value.trim();
  if (folderText) {
    try {
      // Replace newlines and extra whitespace, keep the JSON structure intact
      const cleanedText = folderText.replace(/\n/g, '').replace(/\s+/g, ' ');
      const parsed = JSON.parse(cleanedText);
      if (Array.isArray(parsed)) {
        excludedFolders = parsed.filter((item) => Array.isArray(item));
      }
    } catch (error) {
      console.error('[SuperBar Settings] Invalid JSON in excluded folders:', error);
      showStatus('Invalid JSON in excluded folders field', 'error');
      return;
    }
  }

  // Parse ignored bookmarks - split by newlines and trim whitespace
  const ignoredBookmarks = ignoredBookmarksTextarea.value
    .split('\n')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  // Parse Jira project keys - split by newlines, trim, uppercase, dedupe
  const jiraProjectKeys = Array.from(new Set(
    jiraProjectKeysTextarea.value
      .split('\n')
      .map((key) => key.trim().toUpperCase())
      .filter((key) => key.length > 0)
  ));

  // Strip trailing slash so URL building never double-slashes, default to https:// if no protocol given
  let jiraBaseUrl = jiraBaseUrlInput.value.trim().replace(/\/+$/, '');
  if (jiraBaseUrl && !/^https?:\/\//i.test(jiraBaseUrl)) {
    jiraBaseUrl = `https://${jiraBaseUrl}`;
  }

  console.log('[SuperBar Settings] Form values collected:', {
    enabled: enabledCheckbox.checked,
    shortcut: shortcutInput?.value,
    showPath: showPathCheckbox.checked,
    excludedFolders,
    ignoredBookmarks,
    jiraBaseUrl,
    jiraProjectKeys,
  });

  const config = {
    shortcut: shortcutInput?.value || DEFAULT_CONFIG.shortcut,
    enabled: enabledCheckbox.checked,
    searchEngines: ['google'],
    showBookmarkPath: showPathCheckbox.checked,
    excludedFolders,
    ignoredBookmarks,
    jiraBaseUrl,
    jiraProjectKeys,
  };

  console.log('[SuperBar Settings] Config object to save:', config);

  try {
    await saveConfig(config);
    console.log('[SuperBar Settings] Config saved, reloading...');
    showStatus('Settings saved successfully!', 'success');
    // Reload page to reflect changes
    setTimeout(() => {
      window.location.reload();
    }, 500);
  } catch (error) {
    showStatus('Failed to save settings: ' + error, 'error');
  }
}

async function resetToDefaults() {
  if (confirm('Are you sure you want to reset all settings to defaults?')) {
    const enabledCheckbox = document.getElementById('enabled') as HTMLInputElement;
    const searchEngineCheckboxes = document.querySelectorAll(
      'input[name="searchEngine"]'
    ) as NodeListOf<HTMLInputElement>;
    enabledCheckbox.checked = DEFAULT_CONFIG.enabled;
    searchEngineCheckboxes.forEach((checkbox) => {
      checkbox.checked = DEFAULT_CONFIG.searchEngines.includes(checkbox.value);
    });
    await saveConfig(DEFAULT_CONFIG);
    showStatus('Settings reset to defaults', 'success');
  }
}

function showStatus(message: string, type: 'success' | 'error') {
  const statusElement = document.getElementById('status-message') as HTMLElement;
  statusElement.textContent = message;
  statusElement.className = `status-message ${type}`;
  statusElement.style.display = 'block';
  setTimeout(() => {
    statusElement.style.display = 'none';
  }, 3000);
}
