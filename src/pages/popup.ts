/**
 * Popup script for SuperBar Chrome Extension
 */
// Load current shortcut
document.addEventListener('DOMContentLoaded', async () => {
  loadShortcut();
  setupEventListeners();
});
// Load and display current shortcut
function loadShortcut() {
  chrome.storage.local.get(['superbarConfig'], (result) => {
    const shortcutElement = document.getElementById('current-shortcut');
    if (!shortcutElement) return;
    if (result.superbarConfig && result.superbarConfig.shortcut) {
      shortcutElement.textContent = result.superbarConfig.shortcut;
    } else {
      shortcutElement.textContent = 'Ctrl+Shift+K';
    }
  });
}
// Setup event listeners
function setupEventListeners() {
  const reloadBtn = document.getElementById('reload-btn');
  const settingsBtn = document.getElementById('settings-btn');
  if (!reloadBtn || !settingsBtn) return;
  reloadBtn.addEventListener('click', handleReload);
  settingsBtn.addEventListener('click', handleSettings);
}
// Handle reload button click
function handleReload() {
  const reloadBtn = document.getElementById('reload-btn') as HTMLButtonElement;
  const statusElement = document.getElementById('status');
  if (!reloadBtn || !statusElement) return;
  // Disable button
  reloadBtn.disabled = true;
  // Show status
  statusElement.textContent = 'Reloading...';
  // Reload the extension
  chrome.runtime.reload();
}
// Handle settings button click
function handleSettings() {
  chrome.runtime.openOptionsPage();
  window.close();
}
