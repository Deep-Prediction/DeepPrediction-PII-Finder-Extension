// PII Selector Content Script for Deep Prediction Chrome Extension
(function() {
  let isSelecting = false;
  let selectedElement = null;
  let previewElements = new Set();
  let hoveredElement = null;
  let currentStrategy = 'smart'; // Default strategy
  
  // Check if finder is available
  if (!window.cssFinder || !window.cssFinder.finder) {
    console.error('Deep Prediction PII Finder: CSS Finder library not loaded');
    return;
  }
  
  const { finder } = window.cssFinder;
  
  // Generate a unique CSS selector based on the selected strategy
  async function generateSelector(element) {
    try {
      // Check if we should use AI for smart strategy
      if (currentStrategy === 'smart') {
        // Request API key and settings from background
        const settings = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'getAISettings' }, resolve);
        });
        
        console.log('AI Settings received:', { 
          hasApiKey: !!settings?.apiKey, 
          enableAI: settings?.enableAI,
          model: settings?.model,
          hasAiSelector: !!window.aiSelector 
        });
        
        if (settings && settings.apiKey && settings.enableAI && window.aiSelector) {
          console.log('🤖 CALLING GEMINI AI - Starting API request...');
          
          // Send immediate notification that AI is being called
          chrome.runtime.sendMessage({
            action: 'aiSelectorStatus',
            status: 'calling',
            message: 'Calling Gemini AI...'
          });
          
          // Try AI-powered selector first
          try {
            const startTime = Date.now();
            const aiResult = await window.aiSelector.generateAISelector(element, {
              apiKey: settings.apiKey,
              model: settings.model
            });
            const duration = Date.now() - startTime;
            
            console.log(`✅ AI RESPONSE RECEIVED in ${duration}ms:`, aiResult);
            
            if (aiResult && aiResult.selector) {
              // Send success message to sidepanel
              chrome.runtime.sendMessage({
                action: 'aiSelectorStatus',
                status: 'success',
                confidence: aiResult.confidence,
                duration: duration
              });
              return aiResult.selector;
            }
          } catch (aiError) {
            console.warn('AI selector error:', aiError);
            // Send error status to sidepanel
            chrome.runtime.sendMessage({
              action: 'aiSelectorStatus',
              status: 'error',
              error: aiError.message,
              fallback: 'heuristic'
            });
          }
          
          console.log('AI selector failed, falling back to heuristics');
        } else {
          console.log('❌ AI NOT USED - Reasons:', {
            hasApiKey: !!settings?.apiKey,
            enableAI: settings?.enableAI,
            hasAiSelector: !!window.aiSelector,
            strategy: currentStrategy
          });
        }
      }
      
      console.log(`📊 Using ${currentStrategy} strategy with heuristic finder`);
      // Use regular finder (heuristic-based)
      return finder(element, { strategy: currentStrategy });
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
  
  // Define our extension's classes as constants
  const DP_PII_CLASSES = [
    'dp-pii-preview-block',
    'dp-pii-preview-mask', 
    'dp-pii-preview-ignore',
    'dp-pii-selected',
    'dp-pii-hover',
    'dp-pii-selecting',
    'dp-pii-loading'
  ];
  const DP_PII_PREFIX = 'dp-pii-';
  
  // Clear all applied selectors from the page
  function clearAllSelectors() {
    
    // Remove all known dp-pii classes
    DP_PII_CLASSES.forEach(className => {
      document.querySelectorAll('.' + className).forEach(el => {
        el.classList.remove(className);
      });
    });
    
    // Also remove any other dp-pii- prefixed classes we might have missed
    document.querySelectorAll('[class*="' + DP_PII_PREFIX + '"]').forEach(el => {
      const classesToRemove = [];
      el.classList.forEach(className => {
        if (className.startsWith(DP_PII_PREFIX)) {
          classesToRemove.push(className);
        }
      });
      classesToRemove.forEach(cls => el.classList.remove(cls));
    });
    
    // Clear body class
    document.body.classList.remove('dp-pii-selecting');
    
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
  
  async function handleClick(e) {
    if (!isSelecting) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    selectedElement = e.target;
    stopSelection();
    
    // CRITICAL: Don't modify the element AT ALL before selector generation
    // Otherwise heuristics will pick up our temporary styles/classes
    
    // Store original styles (if any) for restoration
    const originalStyles = {
      outline: selectedElement.style.outline,
      opacity: selectedElement.style.opacity,
      cursor: selectedElement.style.cursor,
      boxShadow: selectedElement.style.boxShadow
    };
    
    // Add a floating indicator (this is safe, it's not on the selected element)
    const loadingIndicator = document.createElement('div');
    loadingIndicator.innerHTML = '🤖 Processing...';
    loadingIndicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #8b5cf6;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      animation: pulse 1.5s ease-in-out infinite;
    `;
    document.body.appendChild(loadingIndicator);
    
    // Create a visual overlay to show selection (without modifying the element)
    const overlay = document.createElement('div');
    const rect = selectedElement.getBoundingClientRect();
    overlay.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      outline: 3px solid #8b5cf6;
      outline-offset: 2px;
      background: rgba(139, 92, 246, 0.1);
      pointer-events: none;
      z-index: 999998;
    `;
    document.body.appendChild(overlay);
    
    try {
      // Generate selector with CLEAN element (no modifications)
      const selector = await generateSelector(selectedElement);
      const alternatives = generateAlternativeSelectors(selectedElement);
      
      // NOW we can add our tracking class
      selectedElement.classList.add('dp-pii-selected');
      
      // Send message to sidepanel with selected element info
      chrome.runtime.sendMessage({
        action: 'selectorChosen',
        selector: selector,
        alternatives: alternatives,
        type: 'block' // Always block
      });
    } catch (error) {
      console.error('Error generating selector:', error);
      
      // Send error message
      chrome.runtime.sendMessage({
        action: 'selectorError',
        error: error.message
      });
    } finally {
      // Remove loading indicator and overlay
      if (loadingIndicator && loadingIndicator.parentNode) {
        loadingIndicator.remove();
      }
      if (overlay && overlay.parentNode) {
        overlay.remove();
      }
      
      // Restore original styles (though we didn't change them)
      selectedElement.style.outline = originalStyles.outline || '';
      selectedElement.style.opacity = originalStyles.opacity || '';
      selectedElement.style.cursor = originalStyles.cursor || '';
      selectedElement.style.boxShadow = originalStyles.boxShadow || '';
    }
  }
  
  // Handle escape key to cancel selection
  function handleEscape(e) {
    if (e.key === 'Escape' && isSelecting) {
      stopSelection();
      chrome.runtime.sendMessage({ action: 'selectionCancelled' });
    }
  }
  
  // Start selection mode
  function startSelection(type = 'block', strategy = 'smart') {
    isSelecting = true;
    currentStrategy = strategy; // Store the strategy for this session
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
        startSelection('block', request.strategy || 'smart'); // Pass the strategy
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