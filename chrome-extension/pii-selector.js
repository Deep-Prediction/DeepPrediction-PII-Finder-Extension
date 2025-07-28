// PII Selector Content Script for Deep Prediction Chrome Extension
(function() {
  let isSelecting = false;
  let selectedElement = null;
  let previewElements = new Set();
  let hoveredElement = null;
  
  // Check if finder is available
  if (!window.cssFinder || !window.cssFinder.finder) {
    console.error('Deep Prediction PII Finder: CSS Finder library not loaded');
    return;
  }
  
  const { finder } = window.cssFinder;
  
  // Generate a unique CSS selector using @medv/finder
  function generateSelector(element) {
    try {
      return finder(element);
    } catch (e) {
      console.error('Error generating selector:', e);
      // Fallback to basic selector
      return element.tagName.toLowerCase();
    }
  }
  
  // Generate alternative selectors for an element
  function generateAlternativeSelectors(element) {
    const alternatives = [];
    
    try {
      // Try different finder configurations
      // 1. Default selector
      alternatives.push(finder(element));
      
      // 2. Without IDs
      alternatives.push(finder(element, {
        idName: () => false
      }));
      
      // 3. Without classes
      alternatives.push(finder(element, {
        className: () => false
      }));
      
      // 4. With minimum length optimization
      alternatives.push(finder(element, {
        optimizedMinLength: 1
      }));
      
    } catch (e) {
      console.error('Error generating alternative selectors:', e);
    }
    
    // Remove duplicates
    return [...new Set(alternatives)].filter(Boolean);
  }
  
  // Preview what elements would be affected
  function previewSelector(selector, type) {
    clearPreview();
    
    try {
      // Validate selector syntax first
      if (!selector || typeof selector !== 'string') {
        console.error('Invalid selector: not a string');
        return -1;
      }
      
      // Try to parse the selector to catch syntax errors
      const elements = document.querySelectorAll(selector);
      const count = elements.length;
      
      elements.forEach(el => {
        previewElements.add(el);
        // Always use block preview since we're only blocking now
        el.classList.add('dp-pii-preview-block');
      });
      
      return count;
    } catch (e) {
      console.error('Invalid selector:', selector, 'Error:', e.message);
      return -1;
    }
  }
  
  // Clear preview highlighting
  function clearPreview() {
    previewElements.forEach(el => {
      el.classList.remove('dp-pii-preview-block', 'dp-pii-preview-mask', 'dp-pii-preview-ignore');
    });
    previewElements.clear();
  }
  
  // Clear all applied selectors from the page
  function clearAllSelectors() {
    // Remove all DP-PII classes
    document.querySelectorAll('[class*="dp-pii-"]').forEach(el => {
      el.classList.forEach(className => {
        if (className.startsWith('dp-pii-')) {
          el.classList.remove(className);
        }
      });
    });
    
    clearPreview();
    if (selectedElement) {
      selectedElement.classList.remove('dp-pii-selected');
      selectedElement = null;
    }
  }
  
  // Apply saved selectors to the page
  function applySelectors(selectors) {
    clearAllSelectors();
    
    selectors.forEach(({ selector, type }) => {
      try {
        // Validate selector before applying
        if (!selector || typeof selector !== 'string') {
          console.warn('Skipping invalid selector:', selector);
          return;
        }
        
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          // Always apply block style since we're only blocking now
          el.classList.add('dp-pii-preview-block');
        });
      } catch (e) {
        console.error('Error applying selector:', selector, 'Error:', e.message);
        
        // Continue with other selectors even if one fails
        console.info('Continuing with remaining selectors...');
      }
    });
  }
  
  function handleMouseOver(e) {
    if (!isSelecting) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    // Remove previous hover
    if (hoveredElement && hoveredElement !== e.target) {
      hoveredElement.classList.remove('dp-pii-hover');
    }
    
    hoveredElement = e.target;
    hoveredElement.classList.add('dp-pii-hover');
  }
  
  function handleMouseOut(e) {
    if (!isSelecting) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    if (e.target === hoveredElement) {
      hoveredElement.classList.remove('dp-pii-hover');
      hoveredElement = null;
    }
  }
  
  function handleClick(e) {
    if (!isSelecting) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    selectedElement = e.target;
    stopSelection();
    
    // Generate selector and alternatives
    const selector = generateSelector(selectedElement);
    const alternatives = generateAlternativeSelectors(selectedElement);
    
    // Highlight selected element
    selectedElement.classList.add('dp-pii-selected');
    
    // Send message to sidepanel with selected element info
    chrome.runtime.sendMessage({
      action: 'selectorChosen',
      selector: selector,
      alternatives: alternatives,
      type: 'block' // Always block
    });
  }
  
  // Handle escape key to cancel selection
  function handleEscape(e) {
    if (e.key === 'Escape' && isSelecting) {
      stopSelection();
      chrome.runtime.sendMessage({ action: 'selectionCancelled' });
    }
  }
  
  // Start selection mode
  function startSelection(type = 'block') {
    isSelecting = true;
    document.body.classList.add('dp-pii-selecting');
    
    // Add event listeners with capture to handle before page scripts
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleEscape, true);
  }
  
  function stopSelection() {
    isSelecting = false;
    document.body.classList.remove('dp-pii-selecting');
    
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleEscape, true);
    
    if (hoveredElement) {
      hoveredElement.classList.remove('dp-pii-hover');
      hoveredElement = null;
    }
  }
  
  // Clean up on page unload to prevent memory leaks
  window.addEventListener('beforeunload', () => {
    clearAllSelectors();
    previewElements.clear();
    if (isSelecting) {
      stopSelection();
    }
  });
  
  // Clean up when extension context is invalidated
  window.addEventListener('pagehide', () => {
    clearAllSelectors();
    previewElements.clear();
  });
  
  // Listen for messages from extension
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch(request.action) {
      case 'startSelectorMode':
        startSelection('block'); // Always use block
        sendResponse({ success: true });
        break;
        
      case 'stopSelectorMode':
        stopSelection();
        sendResponse({ success: true });
        break;
        
      case 'testSelector':
        const count = previewSelector(request.selector, 'block'); // Always use block
        sendResponse({ count: count });
        break;
        
      case 'clearSelectors':
        clearAllSelectors();
        sendResponse({ success: true });
        break;
        
      case 'applySelectors':
        applySelectors(request.selectors);
        sendResponse({ success: true });
        break;
        
      case 'clearPreview':
        clearPreview();
        if (selectedElement) {
          selectedElement.classList.remove('dp-pii-selected');
          selectedElement = null;
        }
        sendResponse({ success: true });
        break;
    }
    return true; // Keep message channel open for async response
  });
  
  // Context menu handler for quick selection
  document.addEventListener('contextmenu', (e) => {
    if (e.shiftKey) {
      // Shift + right-click to quickly select element
      e.preventDefault();
      selectedElement = e.target;
      
      // Generate selector and alternatives
      const selector = generateSelector(selectedElement);
      const alternatives = generateAlternativeSelectors(selectedElement);
      
      // Highlight selected element
      selectedElement.classList.add('dp-pii-selected');
      
      // Send message to extension with selected element info
      chrome.runtime.sendMessage({
        action: 'selectorChosen',
        selector: selector,
        alternatives: alternatives,
        type: 'block' // Always block
      });
    }
  });
  
  // Auto-apply selectors on page load
  window.addEventListener('load', () => {
    // Request saved selectors for this site
    chrome.runtime.sendMessage({ action: 'getSavedSelectors' });
  });
})(); 