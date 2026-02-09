/**
 * Settings Page for SuperBar Chrome Extension
 */
import { getConfig, saveConfig, DEFAULT_CONFIG, getOS } from '../utils';
let isRecording = false;
let recordedKeys: string[] = [];
// Load settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  const config = await getConfig();
  // Set form values
  const enabledCheckbox = document.getElementById('enabled') as HTMLInputElement;
  const shortcutInput = document.getElementById('shortcut') as HTMLInputElement;
  const searchEngineCheckboxes = document.querySelectorAll(
    'input[name="searchEngine"]'
  ) as NodeListOf<HTMLInputElement>;
  enabledCheckbox.checked = config.enabled;
  shortcutInput.value = config.shortcut;
  searchEngineCheckboxes.forEach((checkbox) => {
    checkbox.checked = config.searchEngines.includes(checkbox.value);
  });
  // Setup event listeners
  setupEventListeners();
});
function setupEventListeners() {
  const form = document.getElementById('settings-form') as HTMLFormElement;
  const recordBtn = document.getElementById('record-shortcut') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
  form?.addEventListener('submit', handleSave);
  recordBtn?.addEventListener('click', startRecordingShortcut);
  resetBtn?.addEventListener('click', resetToDefaults);
}
async function handleSave(e: Event) {
  e.preventDefault();
  const enabledCheckbox = document.getElementById('enabled') as HTMLInputElement;
  const shortcutInput = document.getElementById('shortcut') as HTMLInputElement;
  const searchEngineCheckboxes = document.querySelectorAll(
    'input[name="searchEngine"]:checked'
  ) as NodeListOf<HTMLInputElement>;
  const searchEngines = Array.from(searchEngineCheckboxes).map((cb) => cb.value);
  if (searchEngines.length === 0) {
    showStatus('Please select at least one search engine', 'error');
    return;
  }
  const config = {
    shortcut: shortcutInput.value,
    enabled: enabledCheckbox.checked,
    searchEngines,
  };
  try {
    await saveConfig(config);
    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    showStatus('Failed to save settings', 'error');
  }
}
function startRecordingShortcut() {
  isRecording = true;
  recordedKeys = [];
  const recordBtn = document.getElementById('record-shortcut') as HTMLButtonElement;
  const hint = document.getElementById('recording-hint') as HTMLElement;
  const shortcutInput = document.getElementById('shortcut') as HTMLInputElement;
  recordBtn.disabled = true;
  recordBtn.textContent = 'Recording...';
  hint.style.display = 'block';
  shortcutInput.value = 'Press keys...';
  document.addEventListener('keydown', handleKeyPress);
  document.addEventListener('keyup', handleKeyUp);
}
function handleKeyPress(e: KeyboardEvent) {
  if (!isRecording) return;
  e.preventDefault();
  recordedKeys = [];
  if (e.ctrlKey) recordedKeys.push('Ctrl');
  if (e.altKey) recordedKeys.push('Alt');
  if (e.shiftKey) recordedKeys.push('Shift');
  if (e.metaKey) recordedKeys.push('Meta');
  if (e.key === 'Escape') {
    stopRecording();
    return;
  }
  // Map key names for display
  let keyName = e.key;
  if (e.key === ' ') keyName = 'Space';
  else if (e.key === 'ArrowUp') keyName = 'ArrowUp';
  else if (e.key === 'ArrowDown') keyName = 'ArrowDown';
  else if (e.key === 'ArrowLeft') keyName = 'ArrowLeft';
  else if (e.key === 'ArrowRight') keyName = 'ArrowRight';
  else if (e.key.length === 1) keyName = e.key.toUpperCase();
  recordedKeys.push(keyName);
  const shortcutInput = document.getElementById('shortcut') as HTMLInputElement;
  shortcutInput.value = recordedKeys.join('+');
}
function handleKeyUp(e: KeyboardEvent) {
  if (!isRecording || recordedKeys.length === 0) return;
  const lastKey = recordedKeys[recordedKeys.length - 1];
  // Only stop if the key released is the last recorded key (the actual key, not modifier)
  if (lastKey === e.key.toUpperCase() || lastKey === e.key) {
    stopRecording();
  }
}
function stopRecording() {
  isRecording = false;
  const recordBtn = document.getElementById('record-shortcut') as HTMLButtonElement;
  const hint = document.getElementById('recording-hint') as HTMLElement;
  document.removeEventListener('keydown', handleKeyPress);
  document.removeEventListener('keyup', handleKeyUp);
  recordBtn.disabled = false;
  recordBtn.textContent = 'Record Shortcut';
  hint.style.display = 'none';
}
async function resetToDefaults() {
  if (confirm('Are you sure you want to reset all settings to defaults?')) {
    const enabledCheckbox = document.getElementById('enabled') as HTMLInputElement;
    const shortcutInput = document.getElementById('shortcut') as HTMLInputElement;
    const searchEngineCheckboxes = document.querySelectorAll(
      'input[name="searchEngine"]'
    ) as NodeListOf<HTMLInputElement>;
    enabledCheckbox.checked = DEFAULT_CONFIG.enabled;
    shortcutInput.value = DEFAULT_CONFIG.shortcut;
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
