// Popup script for Deep Prediction PII Finder

document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Display current site
  if (tab && tab.url) {
    try {
      const url = new URL(tab.url);
      document.getElementById('currentSite').textContent = url.hostname;
    } catch (error) {
      document.getElementById('currentSite').textContent = 'N/A';
    }
  } else {
    document.getElementById('currentSite').textContent = 'N/A';
  }
  
  // Handle open side panel button
  document.getElementById('openSidePanel').addEventListener('click', async () => {
    // Send message to background script to open side panel
    chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
      // Check for runtime errors
      if (chrome.runtime.lastError) {
        console.error('Error opening side panel:', chrome.runtime.lastError.message);
        alert('Failed to open side panel. Please try again.');
        return;
      }
      
      if (response && response.success) {
        window.close();
      } else {
        console.error('Failed to open side panel: No success response');
        alert('Failed to open side panel. Please ensure the extension has proper permissions.');
      }
    });
  });
}); 