## Config Persistence Debugging Guide

### What Was Fixed:

1. **Background Service Worker Default Config**
   - Now includes all properties: `showBookmarkPath`, `excludeFolders`, `excludedFolderNames`
   - Matches the full config structure

2. **Enhanced Error Handling**
   - `getConfig()` now catches storage errors with logging
   - `saveConfig()` now has error handling and logging
   - Settings page logs all operations to console

3. **Auto-Reload on Save**
   - Settings page now reloads after successful save
   - Ensures UI reflects saved settings

### How to Test Config Persistence:

#### Step 1: Check Extension Storage
1. Go to `brave://extensions/`
2. Find SuperBar → Click "Details"
3. Under "Inspect views", click "Service Worker"
4. Open DevTools console (F12)
5. Paste and run:
```javascript
chrome.storage.local.get(['superbarConfig'], (result) => {
  console.log('Current config:', result.superbarConfig);
});
```

#### Step 2: Test Saving from Settings
1. Go to SuperBar Settings page
2. Open DevTools console (F12)
3. Make a change (e.g., toggle "Show Bookmark Path")
4. Click "Save Settings"
5. Look for console logs:
   - `[SuperBar Settings] Save button clicked`
   - `[SuperBar Settings] Form values collected`
   - `[SuperBar Settings] Config object to save`
   - `[SuperBar] Saving config:`
   - `[SuperBar] Config saved successfully`

#### Step 3: Verify Persistence
1. Close the Settings tab
2. Come back to Settings page
3. Check if your changes are still there
4. Run the storage check command again

### Expected Console Output:

**On Settings Page (when saving):**
```
[SuperBar Settings] Save button clicked
[SuperBar Settings] Form values collected: {...}
[SuperBar Settings] Config object to save: {...}
[SuperBar] Saving config: {...}
[SuperBar] Config saved successfully
[SuperBar Settings] SUCCESS: Settings saved successfully!
```

**On Service Worker (when loading):**
```
[SuperBar] Config loaded: {...}
```

### If Persistence Still Isn't Working:

1. **Check Storage Quota**
   - ExtensionStorage uses `chrome.storage.local` which has 10MB limit
   - Our config is tiny, shouldn't be an issue

2. **Check Manifest Permissions**
   - Verify "storage" is in permissions
   - Verify it's in the correct position in manifest.json

3. **Check for Console Errors**
   - Look at both Settings page console and Service Worker console
   - Any `chrome.runtime.lastError` messages?

4. **Try Factory Reset**
   - In Settings, click "Reset to Defaults"
   - This will clear storage and reload

5. **Check Extension Context**
   - Is the extension properly enabled?
   - Is it running in the right context (not incognito without permission)?

### Storage Structure:

The config should be stored as:
```json
{
  "superbarConfig": {
    "shortcut": "Ctrl+Shift+K",
    "enabled": true,
    "searchEngines": ["google"],
    "showBookmarkPath": true,
    "excludeFolders": false,
    "excludedFolderNames": []
  }
}
```

### Testing Commands in Console:

**View current config:**
```javascript
chrome.storage.local.get(['superbarConfig'], (r) => console.log(r));
```

**Save a test config:**
```javascript
chrome.storage.local.set({
  superbarConfig: {
    shortcut: "Ctrl+Shift+K",
    enabled: true,
    searchEngines: ["google"],
    showBookmarkPath: true,
    excludeFolders: false,
    excludedFolderNames: []
  }
}, () => console.log('Saved'));
```

**Clear config:**
```javascript
chrome.storage.local.remove(['superbarConfig'], () => console.log('Cleared'));
```

### Key Changes Made:

1. ✅ Background service worker now sets complete default config
2. ✅ Error handling added to storage get/set
3. ✅ Comprehensive console logging added
4. ✅ Settings page auto-reloads after save
5. ✅ All config properties properly structured

Try these steps and report what you see in the console!
