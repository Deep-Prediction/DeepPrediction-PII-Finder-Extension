// Sidepanel script for Deep Prediction PII Finder

let currentTab = null;
let selectorMode = false;
let lastUrl = null;
let selectorStrategy = 'smart'; // Default strategy: 'smart', 'semantic', or 'structural'
let geminiApiKey = null;
let aiModel = 'gemini-1.5-flash';
let enableSmartAI = true;

// Check if tutorial has been shown before
async function hasShownTutorial() {
  const result = await chrome.storage.local.get('dpPiiFinderTutorialShown');
  return result.dpPiiFinderTutorialShown || false;
}

// Mark tutorial as shown
async function markTutorialShown() {
  await chrome.storage.local.set({ dpPiiFinderTutorialShown: true });
}

// Helper function to safely send messages to tabs
async function sendMessageToTab(tabId, message) {
  if (!tabId) {
    console.warn('No tab ID provided');
    return null;
  }
  
  try {
    // Check if tab exists and is valid
    const tab = await chrome.tabs.get(tabId);
    
    // Don't send messages to chrome:// or other special URLs
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
        tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
      console.log('Cannot inject content script into special page:', tab.url);
      return null;
    }
    
    // Try to send the message first
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (sendError) {
      // Content script might not be injected, try to inject it
      console.log('Content script not loaded, injecting now...');
      
      try {
        // Inject the required scripts (in order)
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['constants.js', 'finder-bundle.js', 'ai-selector.js', 'pii-selector.js']
        });
        
        // Inject the CSS
        await chrome.scripting.insertCSS({
          target: { tabId: tabId },
          files: ['pii-selector.css']
        });
        
        // Wait a bit for scripts to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Try sending the message again
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
      } catch (injectError) {
        console.error('Failed to inject content scripts:', injectError);
        return null;
      }
    }
  } catch (error) {
    console.log('Message sending failed:', error.message);
    
    // Log more details for debugging
    if (error.message && error.message.includes('Could not establish connection')) {
      console.debug('Content script not loaded on this page, which is expected for special pages');
    } else {
      console.error('Unexpected error sending message to tab:', error);
    }
    
    return null;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await refreshCurrentTab();
  
  // Load saved preferences
  chrome.storage.local.get(['preferredStrategy', 'geminiApiKey', 'aiModel', 'enableSmartAI'], (result) => {
    // Load strategy preference
    if (result.preferredStrategy) {
      selectorStrategy = result.preferredStrategy;
      // Update UI to reflect saved preference
      document.querySelectorAll('.strategy-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.strategy === selectorStrategy);
      });
      console.log('Loaded saved strategy preference:', selectorStrategy);
    }
    
    // Load API settings
    if (result.geminiApiKey) {
      geminiApiKey = result.geminiApiKey;
    }
    if (result.aiModel) {
      aiModel = result.aiModel;
    }
    if (result.enableSmartAI !== undefined) {
      enableSmartAI = result.enableSmartAI;
    }
  });
  
  // Set up event listeners
  setupEventListeners();
  
  // Set up auto-refresh on navigation
  setupAutoRefresh();
});

// Set up auto-refresh when navigating to new pages
function setupAutoRefresh() {
  // Check for URL changes periodically
  setInterval(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url !== lastUrl) {
      lastUrl = tab.url;
      await refreshCurrentTab();
    }
  }, 500); // Check every 500ms
}

// Refresh current tab information
async function refreshCurrentTab() {
  try {
    // Reset state
    selectorMode = false;
    stopSelectorMode();
    
    // Clear any existing previews
    if (currentTab && currentTab.id) {
      await sendMessageToTab(currentTab.id, {
        action: 'clearPreview'
      });
    }
    
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    lastUrl = tab?.url;
  
    // Enable all UI elements first (in case they were disabled)
    document.querySelectorAll('button').forEach(button => {
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
    });
  
    document.querySelectorAll('input, select').forEach(input => {
      input.disabled = false;
      input.style.opacity = '1';
    });
  
    // Reset info section
    const info = document.querySelector('.info');
    info.innerHTML = '<strong>How to use:</strong><br>' +
                     '1. Click "Start Visual Selection"<br>' +
                     '2. Hover over PII elements on the page<br>' +
                     '3. Click to save them to your blocklist<br>' +
                     '4. All saved elements will be automatically blocked';
    info.style.background = '#f3f4f6';
    info.style.color = '#6b7280';
    
    // Display current site
    try {
      if (tab && tab.url) {
        const url = new URL(tab.url);
        document.getElementById('currentSite').textContent = url.hostname;
        
        // Check if this is a special page where we can't inject scripts
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
            tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
          showSpecialPageWarning();
        } else {
          // Load saved selectors
          loadSavedSelectors();
        }
      } else {
        document.getElementById('currentSite').textContent = 'N/A';
      }
    } catch (error) {
      // Handle special pages like chrome:// URLs
      document.getElementById('currentSite').textContent = 'Special Page';
      showSpecialPageWarning();
      console.log('Cannot access URL:', error);
    }
  } catch (error) {
    console.error('Error refreshing tab:', error);
  }
}

// Show warning for special pages
function showSpecialPageWarning() {
  const info = document.querySelector('.info');
  info.innerHTML = '<strong>⚠️ Cannot use PII Finder on this page</strong><br>' +
                   'This extension cannot run on Chrome system pages, extension pages, or local files.<br>' +
                   'Please navigate to a regular website to use the PII Finder.';
  info.style.background = '#fee2e2';
  info.style.color = '#dc2626';
  
  // Disable all buttons except the accordion header
  document.querySelectorAll('button:not(#manualAccordionHeader)').forEach(button => {
    button.disabled = true;
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';
  });
  
  document.querySelectorAll('input, select').forEach(input => {
    input.disabled = true;
    input.style.opacity = '0.5';
  });
}

// Set up all event listeners
function setupEventListeners() {
  // Strategy selector buttons
  document.querySelectorAll('.strategy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Update active state visually
      document.querySelectorAll('.strategy-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      
      // Store the selected strategy
      selectorStrategy = e.target.dataset.strategy;
      console.log('Strategy selected:', selectorStrategy);
      
      // Save preference to storage for persistence
      chrome.storage.local.set({ preferredStrategy: selectorStrategy });
      
      // TODO: Implement strategy functionality in finder-bundle.js
      // For now, just visual feedback and storage
    });
  });
  
  // Info icon tooltip (optional enhancement)
  const infoIcon = document.querySelector('.info-icon');
  if (infoIcon) {
    infoIcon.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Selector Strategies:\n\n' +
            '• Smart: Automatically chooses the best approach\n' +
            '• Semantic: Uses classes and attributes (flexible)\n' +
            '• Structural: Uses precise DOM position (exact)');
    });
  }
  
  // Accordion functionality
  const accordionHeader = document.getElementById('manualAccordionHeader');
  const accordionContent = document.getElementById('manualAccordionContent');
  
  accordionHeader.addEventListener('click', () => {
    accordionHeader.classList.toggle('active');
    accordionContent.classList.toggle('active');
  });
  
  // Manual selector input
  document.getElementById('testManualSelector').addEventListener('click', testManualSelector);
  document.getElementById('saveManualSelector').addEventListener('click', saveManualSelector);
  
  // Visual selector buttons
  document.getElementById('startSelector').addEventListener('click', startSelectorMode);
  document.getElementById('stopSelector').addEventListener('click', stopSelectorMode);
  
  // Clear all selectors
  document.getElementById('clearAllSelectors').addEventListener('click', clearAllSelectors);
  
  // Copy all selectors button (raw format for testing)
  document.getElementById('copyAllSelectors').addEventListener('click', copyAllSelectors);
  
  // Copy all selectors for database button (with proper escaping)
  document.getElementById('copyDbSelectors').addEventListener('click', copyAllSelectorsForDatabase);
  
  // Tutorial Got It button
  document.getElementById('tutorialGotIt').addEventListener('click', () => {
    document.getElementById('tutorialOverlay').style.display = 'none';
  });
  
  // Handle ESC key to close tutorial or cancel selection
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const tutorialOverlay = document.getElementById('tutorialOverlay');
      if (tutorialOverlay.style.display === 'flex') {
        // Close tutorial if it's open
        tutorialOverlay.style.display = 'none';
      } else if (selectorMode) {
        // Cancel selection mode if it's active
        stopSelectorMode();
      }
    }
  });
  
  // Close tutorial when clicking outside of it
  document.getElementById('tutorialOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      document.getElementById('tutorialOverlay').style.display = 'none';
    }
  });
  
  // Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle model upgrade recommendations
  if (request.action === 'modelUpgradeRecommended') {
    // Show a notification to the user
    const showUpgradeNotification = () => {
      const info = document.querySelector('.info');
      const notification = document.createElement('div');
      notification.className = 'model-upgrade-notice';
      notification.innerHTML = `
        <strong>💡 Model Upgrade Suggested</strong><br>
        ${request.reason} detected. Consider using <strong>${request.suggestedModel}</strong> for better results.<br>
        <button onclick="this.parentElement.remove()" style="margin-top: 8px; padding: 4px 8px; background: #8b5cf6; color: white; border: none; border-radius: 4px; cursor: pointer;">Dismiss</button>
      `;
      notification.style.cssText = 'background: #fef3c7; border: 1px solid #f59e0b; padding: 12px; border-radius: 8px; margin-bottom: 12px;';
      info.parentElement.insertBefore(notification, info);
      
      // Auto-dismiss after 10 seconds
      setTimeout(() => {
        notification.remove();
      }, 10000);
    };
    
    // Show the notification
    showUpgradeNotification();
    
    return true;
  }
  
      // Handle AI selector status updates
  if (request.action === 'aiSelectorStatus') {
    const showAIStatus = () => {
      // Remove any existing status notification first
      const existingStatus = document.querySelector('.ai-status-notification');
      if (existingStatus) existingStatus.remove();
      
      const statusDiv = document.createElement('div');
      statusDiv.className = 'ai-status-notification';
      
      if (request.status === 'calling') {
        statusDiv.innerHTML = `
          <span style="display: inline-block;">🤖</span> ${request.message || 'Calling Gemini AI...'}
        `;
        statusDiv.style.cssText = 'background: #e0e7ff; border: 1px solid #6366f1; color: #312e81;';
      } else if (request.status === 'success') {
        const duration = request.duration ? ` (${request.duration}ms)` : '';
        statusDiv.innerHTML = `
          <span style="color: #10b981;">✓</span> AI selector generated${duration}
          <span style="font-size: 11px; opacity: 0.8;"> - confidence: ${Math.round((request.confidence || 0.8) * 100)}%</span>
        `;
        statusDiv.style.cssText = 'background: #d1fae5; border: 1px solid #10b981; color: #065f46;';
      } else if (request.status === 'error') {
        const errorMessage = request.error.includes('Token limit') ? 'Context too large' :
                           request.error.includes('API key') ? 'Invalid API key' :
                           request.error.includes('Rate limit') ? 'Rate limit hit' :
                           'AI unavailable';
        
        statusDiv.innerHTML = `
          <span style="color: #f59e0b;">⚠</span> ${errorMessage} - using smart heuristics instead
        `;
        statusDiv.style.cssText = 'background: #fef3c7; border: 1px solid #f59e0b; color: #92400e;';
      }
      
      statusDiv.style.cssText += 'padding: 8px 12px; border-radius: 6px; margin: 8px 16px; font-size: 13px; animation: slideIn 0.3s ease;';
      
      // Add to the UI (try multiple locations)
      const strategySection = document.querySelector('.selector-strategy');
      const infoSection = document.querySelector('.info');
      const container = document.querySelector('.container');
      
      const targetElement = strategySection || infoSection || container;
      
      if (targetElement) {
        // Remove any existing status
        const existingStatus = document.querySelector('.ai-status-notification');
        if (existingStatus) existingStatus.remove();
        
        if (strategySection) {
          strategySection.insertAdjacentElement('afterend', statusDiv);
        } else if (infoSection) {
          infoSection.insertAdjacentElement('beforebegin', statusDiv);
        } else {
          targetElement.insertAdjacentElement('afterbegin', statusDiv);
        }
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
          statusDiv.style.animation = 'fadeOut 0.3s ease';
          setTimeout(() => statusDiv.remove(), 300);
        }, 5000);
      } else {
        console.error('Could not find element to attach AI status notification');
      }
    };
    
    showAIStatus();
    return true;
  }
  
  if (request.action === 'selectorChosen') {
    handleSelectorChosen(request.selector, request.alternatives);
  } else if (request.action === 'selectionCancelled') {
    stopSelectorMode();
  }
  });
  
  // Listen for tab changes
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    // Auto-refresh when tab changes
    await refreshCurrentTab();
  });
  
  // Settings modal event listeners
  setupSettingsModal();
}

// Set up settings modal functionality
function setupSettingsModal() {
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const settingsClose = document.getElementById('settingsClose');
  const settingsCancel = document.getElementById('settingsCancel');
  const settingsSave = document.getElementById('settingsSave');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const aiModelSelect = document.getElementById('aiModel');
  const enableSmartAICheckbox = document.getElementById('enableSmartAI');
  const apiStatus = document.getElementById('apiStatus');
  
  // Open settings modal
  settingsBtn?.addEventListener('click', () => {
    settingsModal.classList.add('active');
    
    // Load current settings into the form
    geminiApiKeyInput.value = geminiApiKey || '';
    aiModelSelect.value = aiModel;
    enableSmartAICheckbox.checked = enableSmartAI;
    
    // Show API key status if we have a key
    if (geminiApiKey) {
      apiStatus.style.display = 'inline-block';
      apiStatus.textContent = 'Configured';
      apiStatus.className = 'api-status valid';
    } else {
      apiStatus.style.display = 'none';
    }
  });
  
  // Close settings modal
  const closeSettings = () => {
    settingsModal.classList.remove('active');
  };
  
  settingsClose?.addEventListener('click', closeSettings);
  settingsCancel?.addEventListener('click', closeSettings);
  
  // Click outside to close
  settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettings();
    }
  });
  
  // Save settings
  settingsSave?.addEventListener('click', async () => {
    const newApiKey = geminiApiKeyInput.value.trim();
    const newAiModel = aiModelSelect.value;
    const newEnableSmartAI = enableSmartAICheckbox.checked;
    
    // Validate API key if provided
    if (newApiKey) {
      // Show checking status
      apiStatus.style.display = 'inline-block';
      apiStatus.textContent = 'Validating...';
      apiStatus.className = 'api-status checking';
      
      // Test the API key with a simple request
      const isValid = await validateGeminiApiKey(newApiKey);
      
      if (!isValid) {
        apiStatus.textContent = 'Invalid API Key';
        apiStatus.className = 'api-status invalid';
        return;
      }
      
      apiStatus.textContent = 'Valid';
      apiStatus.className = 'api-status valid';
    }
    
    // Save settings
    geminiApiKey = newApiKey;
    aiModel = newAiModel;
    enableSmartAI = newEnableSmartAI;
    
    await chrome.storage.local.set({
      geminiApiKey: geminiApiKey,
      aiModel: aiModel,
      enableSmartAI: enableSmartAI
    });
    
    console.log('Settings saved:', { 
      hasApiKey: !!geminiApiKey, 
      aiModel, 
      enableSmartAI 
    });
    
    // Close modal after successful save
    setTimeout(closeSettings, 500);
  });
  
  // Show/hide password toggle (optional enhancement)
  geminiApiKeyInput?.addEventListener('focus', function() {
    this.type = 'text';
  });
  
  geminiApiKeyInput?.addEventListener('blur', function() {
    this.type = 'password';
  });
}

// Validate Gemini API key
async function validateGeminiApiKey(apiKey) {
  try {
    // Test the API key with a simple request to Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    return response.ok;
  } catch (error) {
    console.error('Error validating API key:', error);
    return false;
  }
}

// Test manual selector
async function testManualSelector() {
  const selector = document.getElementById('manualSelectorInput').value.trim();
  if (!selector) {
    alert('Please enter a CSS selector');
    return;
  }
  
  if (!currentTab || !currentTab.id) {
    alert('Cannot test selectors on this page');
    return;
  }
  
  // Send message to content script to test selector (always use 'block' type)
  const response = await sendMessageToTab(currentTab.id, {
    action: 'testSelector',
    selector: selector,
    type: 'block'
  });
  
  if (response && response.count >= 0) {
    if (response.count === 0) {
      alert('No elements found with this selector');
    } else {
      alert(`Found ${response.count} element${response.count !== 1 ? 's' : ''}`);
    }
  } else {
    alert('Cannot test selectors on this page. Make sure you\'re on a regular website.');
  }
}

// Save manual selector
async function saveManualSelector() {
  const selector = document.getElementById('manualSelectorInput').value.trim();
  if (!selector) {
    alert('Please enter a CSS selector');
    return;
  }
  
  // Test it first
  if (currentTab && currentTab.id) {
    const response = await sendMessageToTab(currentTab.id, {
      action: 'testSelector',
      selector: selector,
      type: 'block'
    });
    
    if (!response || response.count === -1) {
      alert('Invalid selector or cannot access this page');
      return;
    }
    
    if (response.count === 0) {
      const proceed = confirm('No elements found with this selector. Save anyway?');
      if (!proceed) return;
    }
  }
  
  // Save the selector (always as 'block' type)
  await saveSelector(selector, 'block');
  
  // Clear input
  document.getElementById('manualSelectorInput').value = '';
  
  // Reload saved selectors
  await loadSavedSelectors();
}

// Start selector mode
async function startSelectorMode() {
  if (!currentTab || !currentTab.id) {
    alert('Cannot start selector mode on this page');
    return;
  }
  
  // Show tutorial if first time
  const tutorialShown = await hasShownTutorial();
  if (!tutorialShown) {
    document.getElementById('tutorialOverlay').style.display = 'flex';
    await markTutorialShown();
  }
  
  selectorMode = true;
  document.getElementById('selectorMode').style.display = 'block';
  document.getElementById('selectorMode').classList.add('active');
  document.getElementById('startSelector').style.display = 'none';
  document.getElementById('stopSelector').style.display = 'block';
  
  // Send message to content script with selected strategy
  const response = await sendMessageToTab(currentTab.id, {
    action: 'startSelectorMode',
    type: 'block',
    strategy: selectorStrategy  // Pass the selected strategy
  });
  
  if (!response) {
    // Failed to start selector mode
    alert('Cannot use visual selection on this page. Try manual input instead.');
    stopSelectorMode();
  }
}

// Stop selector mode
async function stopSelectorMode() {
  selectorMode = false;
  
  const selectorModeEl = document.getElementById('selectorMode');
  const startSelectorBtn = document.getElementById('startSelector');
  const stopSelectorBtn = document.getElementById('stopSelector');
  
  if (selectorModeEl) {
    selectorModeEl.style.display = 'none';
    selectorModeEl.classList.remove('active');
  }
  
  if (startSelectorBtn) {
    startSelectorBtn.style.display = 'block';
  }
  
  if (stopSelectorBtn) {
    stopSelectorBtn.style.display = 'none';
  }
  
  // Send message to content script
  if (currentTab && currentTab.id) {
    await sendMessageToTab(currentTab.id, {
      action: 'stopSelectorMode'
    });
  }
}

// Handle selector chosen from content script
async function handleSelectorChosen(selector, alternatives) {
  stopSelectorMode();
  
  // Save the selector automatically (always as 'block' type)
  await saveSelector(selector, 'block');
  
  // Reload saved selectors immediately
  await loadSavedSelectors();
  
  // Show brief confirmation
  const selectorList = document.getElementById('selectorList');
  const tempMessage = document.createElement('div');
  tempMessage.style.cssText = 'padding: 8px; background: #d1fae5; color: #059669; border-radius: 6px; margin-bottom: 8px; text-align: center; font-size: 13px;';
  tempMessage.textContent = '✓ PII selector added successfully!';
  selectorList.parentElement.insertBefore(tempMessage, selectorList);
  
  setTimeout(() => {
    tempMessage.remove();
  }, 2000);
}

// Save selector to storage
async function saveSelector(selector, type) {
  if (!currentTab || !currentTab.url) return;
  
  try {
    const url = new URL(currentTab.url);
    const hostname = url.hostname;
    const key = `selectors_${hostname}`;
    
    // Get existing selectors
    const result = await chrome.storage.local.get(key);
    const selectors = result[key] || [];
    
    // Check if selector already exists
    const exists = selectors.some(s => s.selector === selector);
    if (!exists) {
      selectors.push({ selector, type: 'block' }); // Always save as 'block'
      await chrome.storage.local.set({ [key]: selectors });
      
      // Apply the new selector immediately
      if (currentTab.id) {
        await sendMessageToTab(currentTab.id, {
          action: 'applySelectors',
          selectors: selectors
        });
      }
    }
  } catch (error) {
    console.error('Error saving selector:', error);
    
    // Provide user feedback
    alert('Failed to save selector. Error: ' + error.message);
    
    // Log additional context for debugging
    console.error('Selector that failed to save:', selector);
    console.error('Current URL:', currentTab?.url);
  }
}

// Load saved selectors
async function loadSavedSelectors() {
  if (!currentTab || !currentTab.url) return;
  
  try {
    const url = new URL(currentTab.url);
    const hostname = url.hostname;
    const key = `selectors_${hostname}`;
    
    const result = await chrome.storage.local.get(key);
    const selectors = result[key] || [];
    
    // Display selectors
    const selectorList = document.getElementById('selectorList');
    selectorList.innerHTML = '';
    
    selectors.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'selector-item';
      
      const selectorSpan = document.createElement('span');
      selectorSpan.textContent = item.selector;
      selectorSpan.style.flex = '1';
      selectorSpan.style.overflow = 'hidden';
      selectorSpan.style.textOverflow = 'ellipsis';
      selectorSpan.style.whiteSpace = 'nowrap';
      selectorSpan.title = item.selector; // Show full selector on hover
      
      const actionsDiv = document.createElement('div');
      actionsDiv.style.display = 'flex';
      actionsDiv.style.alignItems = 'center';
      
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-button';
      copyBtn.textContent = 'Copy';
      copyBtn.title = 'Copy selector';
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        copySingleSelector(item.selector, copyBtn);
      };
      
      const removeBtn = document.createElement('span');
      removeBtn.className = 'remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove selector';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeSelector(index);
      };
      
      actionsDiv.appendChild(copyBtn);
      actionsDiv.appendChild(removeBtn);
      
      div.appendChild(selectorSpan);
      div.appendChild(actionsDiv);
      selectorList.appendChild(div);
    });
    
    // Apply selectors to the page
    if (currentTab.id && selectors.length > 0) {
      await sendMessageToTab(currentTab.id, {
        action: 'applySelectors',
        selectors: selectors
      });
    }
  } catch (error) {
    console.error('Error loading selectors:', error);
  }
}

// Remove a selector
async function removeSelector(index) {
  if (!currentTab || !currentTab.url) return;
  
  try {
    const url = new URL(currentTab.url);
    const hostname = url.hostname;
    const key = `selectors_${hostname}`;
    
    const result = await chrome.storage.local.get(key);
    const selectors = result[key] || [];
    
    selectors.splice(index, 1);
    await chrome.storage.local.set({ [key]: selectors });
    
    // Clear current highlights first
    if (currentTab.id) {
      await sendMessageToTab(currentTab.id, {
        action: 'clearSelectors'
      });
    }
    
    // Reload display and reapply the remaining selectors
    await loadSavedSelectors();
  } catch (error) {
    console.error('Error removing selector:', error);
  }
}

// Clear all selectors
async function clearAllSelectors() {
  if (!confirm('Clear all PII selectors for this site?')) return;
  
  if (!currentTab || !currentTab.url) return;
  
  try {
    const url = new URL(currentTab.url);
    const hostname = url.hostname;
    const key = `selectors_${hostname}`;
    
    // First, clear from storage
    await chrome.storage.local.remove(key);
    
    // Clear from page - send message multiple times to ensure it's received
    if (currentTab.id) {
      // Send clear message
      await sendMessageToTab(currentTab.id, {
        action: 'clearSelectors'
      });
      
      // Send empty selectors to override any pending applies
      setTimeout(async () => {
        await sendMessageToTab(currentTab.id, {
          action: 'applySelectors',
          selectors: []
        });
      }, 100);
    }
    
    // Clear the selector list display immediately
    const selectorList = document.getElementById('selectorList');
    if (selectorList) {
      selectorList.innerHTML = '';
    }
    
    // Reload display (which should now show empty)
    await loadSavedSelectors();
  } catch (error) {
    console.error('Error clearing selectors:', error);
  }
}

// Helper function to escape selectors for database/rrweb usage
function escapeForDatabase(selector) {
  // Characters that need escaping when used in identifiers (not as CSS syntax)
  const specialChars = /[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g;
  
  // Handle ID escaping (everything after #)
  selector = selector.replace(/#([^.\s\[>+~]+)/g, function(match, id) {
    // Check if ID starts with a digit (needs special handling)
    if (/^\d/.test(id)) {
      // Escape the first digit using unicode escape
      const firstChar = id.charCodeAt(0).toString(16);
      const rest = id.slice(1).replace(specialChars, '\\$&');
      return '#\\' + firstChar + ' ' + rest;
    }
    // Escape special characters in the ID
    return '#' + id.replace(specialChars, '\\$&');
  });
  
  // Handle class name escaping (everything after .)
  selector = selector.replace(/\.([^.\s\[>+~:#]+)/g, function(match, className) {
    // Check if class starts with a digit
    if (/^\d/.test(className)) {
      const firstChar = className.charCodeAt(0).toString(16);
      const rest = className.slice(1).replace(specialChars, '\\$&');
      return '.\\' + firstChar + ' ' + rest;
    }
    // Escape special characters in the class name
    return '.' + className.replace(specialChars, '\\$&');
  });
  
  return selector;
}

// Copy all selectors to clipboard (raw format for DevTools testing)
async function copyAllSelectors() {
  if (!currentTab || !currentTab.url) return;
  
  try {
    const url = new URL(currentTab.url);
    const hostname = url.hostname;
    const key = `selectors_${hostname}`;
    
    const result = await chrome.storage.local.get(key);
    const selectors = result[key] || [];
    
    if (selectors.length === 0) {
      alert('No selectors to copy');
      return;
    }
    
    // Format selectors as JSON array for easier integration
    const selectorsArray = selectors.map(item => item.selector);
    const text = JSON.stringify(selectorsArray, null, 2);
    
    // Copy to clipboard
    await navigator.clipboard.writeText(text);
    
    // Visual feedback
    const copyBtn = document.getElementById('copyAllSelectors');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    copyBtn.style.background = '#10b981';
    
    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.style.background = '';
    }, 2000);
    
  } catch (error) {
    console.error('Error copying selectors:', error);
    alert('Failed to copy selectors');
  }
}

// Copy all selectors for database (with proper escaping for rrweb)
async function copyAllSelectorsForDatabase() {
  if (!currentTab || !currentTab.url) return;
  
  try {
    const url = new URL(currentTab.url);
    const hostname = url.hostname;
    const key = `selectors_${hostname}`;
    
    const result = await chrome.storage.local.get(key);
    const selectors = result[key] || [];
    
    if (selectors.length === 0) {
      alert('No selectors to copy');
      return;
    }
    
    // Format selectors with escaping for database/rrweb usage
    const escapedSelectors = selectors.map(item => escapeForDatabase(item.selector));
    const text = JSON.stringify(escapedSelectors, null, 2);
    
    // Copy to clipboard
    await navigator.clipboard.writeText(text);
    
    // Visual feedback
    const copyBtn = document.getElementById('copyDbSelectors');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    copyBtn.style.background = '#10b981';
    
    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.style.background = '';
    }, 2000);
    
  } catch (error) {
    console.error('Error copying selectors for database:', error);
    alert('Failed to copy selectors for database');
  }
}

// Copy single selector to clipboard
async function copySingleSelector(selector, button) {
  try {
    await navigator.clipboard.writeText(selector);
    
    // Visual feedback
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.classList.add('copied');
    
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 1500);
    
  } catch (error) {
    console.error('Error copying selector:', error);
    alert('Failed to copy selector');
  }
} 