// Background script for Deep Prediction PII Finder

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Deep Prediction PII Finder installed');
  
  // Set default panel behavior
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
});

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openSidePanel") {
    // Open side panel for the current tab
    chrome.sidePanel.open({ windowId: sender.tab?.windowId }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.action === "getSavedSelectors" && sender.tab) {
    // Get saved selectors for the current site
    const hostname = new URL(sender.tab.url).hostname;
    const key = `selectors_${hostname}`;
    
    chrome.storage.local.get(key).then(result => {
      const selectors = result[key] || [];
      // Send selectors back to content script
      chrome.tabs.sendMessage(sender.tab.id, {
        action: 'applySelectors',
        selectors: selectors
      });
    });
    return true;
  }
});

// Auto-apply selectors when a tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if this is a regular website
    if (!tab.url.startsWith('chrome://') && 
        !tab.url.startsWith('chrome-extension://') && 
        !tab.url.startsWith('about:') && 
        !tab.url.startsWith('edge://')) {
      
      try {
        const hostname = new URL(tab.url).hostname;
        const key = `selectors_${hostname}`;
        
        // Get saved selectors and apply them
        chrome.storage.local.get(key).then(result => {
          const selectors = result[key] || [];
          if (selectors.length > 0) {
            // Use a more reliable method to wait for content script to be ready
            const tryApplySelectors = (retries = 5) => {
              chrome.tabs.sendMessage(tabId, {
                action: 'applySelectors',
                selectors: selectors
              }).catch((error) => {
                if (retries > 0 && error.message?.includes('Could not establish connection')) {
                  // Content script might not be ready yet, retry
                  setTimeout(() => tryApplySelectors(retries - 1), 200);
                } else {
                  // Either max retries reached or different error - log it
                  console.debug('Could not apply selectors:', error.message);
                }
              });
            };
            
            // Start trying to apply selectors with exponential backoff
            setTimeout(() => tryApplySelectors(), 100);
          }
        });
      } catch (error) {
        console.error('Error applying selectors:', error);
      }
    }
  }
});