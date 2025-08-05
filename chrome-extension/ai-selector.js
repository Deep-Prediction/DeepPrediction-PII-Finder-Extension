// AI-powered selector generation using Gemini
(function(window) {
  'use strict';
  
  // Extract page context for AI analysis (maximize useful context for 2M token limit)
  function extractPageContext(element, maxDepth = 10) { // Increased depth
    const context = {
      target: extractElementInfo(element, { isTarget: true, includeFullText: true }),
      siblings: [],
      ancestors: [],
      similarElements: [],
      children: [],
      pageStructure: extractPageStructure(),
      nearbyContext: [],
      fullHierarchy: [],
      rawDOMContext: null
    };
    
    // Get immediate children of target (crucial for understanding what PII we're selecting)
    if (element.children.length > 0) {
      context.children = Array.from(element.children)
        .slice(0, 50) // Get many more children
        .map(child => extractElementInfo(child, { maxTextLength: 300 }));
    }
    
    // Get ALL siblings (they often contain similar PII)
    if (element.parentElement) {
      const siblings = Array.from(element.parentElement.children);
      context.siblings = siblings
        .filter(el => el !== element)
        .map((sib, index) => {
          const info = extractElementInfo(sib, { maxTextLength: 300 });
          info.position = index;
          return info;
        });
    }
    
    // Get FULL ancestor chain with detailed info
    let current = element.parentElement;
    let depth = 0;
    const fullPath = [];
    while (current && depth < maxDepth) {
      const ancestorInfo = extractElementInfo(current, { 
        maxTextLength: depth < 3 ? 1000 : 300, // Much more text for close ancestors
        includeFullText: depth < 2 
      });
      
      // Try to get a selector for this ancestor for reference
      try {
        const classes = current.className.split(/\s+/)
          .filter(cls => cls && !cls.startsWith('dp-pii-') && !cls.match(/^_[a-z0-9]{5,}$/i));
        if (classes.length > 0) {
          ancestorInfo.semanticClasses = classes;
        }
        if (current.id) {
          ancestorInfo.id = current.id;
        }
      } catch (e) {}
      
      context.ancestors.push(ancestorInfo);
      fullPath.push(current.tagName.toLowerCase());
      current = current.parentElement;
      depth++;
    }
    context.fullHierarchy = fullPath.reverse();
    
    // Get nearby context (cousins - parent's siblings' children)
    if (element.parentElement && element.parentElement.parentElement) {
      const parentSiblings = Array.from(element.parentElement.parentElement.children);
      parentSiblings.forEach(parentSibling => {
        if (parentSibling !== element.parentElement) {
          Array.from(parentSibling.children).slice(0, 5).forEach(cousin => {
            const cousinInfo = extractElementInfo(cousin, { maxTextLength: 200 });
            if (looksLikePII(cousin.textContent)) {
              context.nearbyContext.push(cousinInfo);
            }
          });
        }
      });
    }
    
    // Find similar elements more intelligently
    const tagName = element.tagName.toLowerCase();
    const elementClasses = element.className.split(/\s+/).filter(c => !c.startsWith('dp-pii-'));
    
    // Build smart queries for finding similar elements
    const queries = [];
    
    // Same tag with similar classes
    if (elementClasses.length > 0) {
      elementClasses.forEach(cls => {
        if (cls && !cls.match(/^[a-f0-9]{8,}$/i)) { // Skip hash-like classes
          queries.push(`${tagName}.${cls}`);
        }
      });
    }
    
    // Same tag in similar containers
    if (element.parentElement) {
      const parentClasses = element.parentElement.className.split(/\s+/)
        .filter(c => !c.startsWith('dp-pii-') && c.length > 2);
      parentClasses.forEach(cls => {
        queries.push(`.${cls} > ${tagName}`);
      });
    }
    
    // Collect candidates
    const candidates = new Set();
    queries.forEach(query => {
      try {
        document.querySelectorAll(query).forEach(el => candidates.add(el));
      } catch (e) {
        // Skip invalid queries
      }
    });
    
    // Also add same tag elements
    document.querySelectorAll(tagName).forEach(el => candidates.add(el));
    
    // Get MANY more similar elements for better pattern detection
    for (const candidate of candidates) {
      if (candidate !== element && context.similarElements.length < 100) { // 100+ similar elements
        const candidateText = candidate.textContent?.trim();
        if (looksLikePII(candidateText) || hasSimilarStructure(element, candidate)) {
          context.similarElements.push(extractElementInfo(candidate, { maxTextLength: 250 }));
        }
      }
    }
    
    // Get raw DOM context - the actual HTML around the element
    try {
      // Try to get a large chunk of DOM for better context
      let contextElement = element;
      let levelsUp = 0;
      
      // Go up the tree until we find a substantial container or hit body
      while (contextElement.parentElement && levelsUp < 5) {
        contextElement = contextElement.parentElement;
        levelsUp++;
        
        // Stop if we hit a major container
        if (contextElement.tagName === 'BODY' || 
            contextElement.tagName === 'MAIN' ||
            contextElement.tagName === 'ARTICLE' ||
            contextElement.tagName === 'SECTION') {
          break;
        }
      }
      
      // Clone and clean the element to avoid our extension's classes
      const clone = contextElement.cloneNode(true);
      
      // Remove dp-pii classes and style attributes from the clone
      clone.querySelectorAll('[class*="dp-pii"]').forEach(el => {
        el.className = el.className.split(' ').filter(c => !c.startsWith('dp-pii')).join(' ');
      });
      clone.querySelectorAll('[style]').forEach(el => {
        el.removeAttribute('style');
      });
      
      // Get outer HTML
      const outerHTML = clone.outerHTML;
      console.log(`📄 Extracted DOM context: ${outerHTML.length} characters from ${levelsUp} levels up`);
      
      // Store based on size
      if (outerHTML.length < 100000) { // Up to 100KB
        context.rawDOMContext = outerHTML;
      } else if (outerHTML.length < 200000) { // 100-200KB - truncate
        context.rawDOMContext = outerHTML.substring(0, 100000);
        console.log('Truncated large DOM to 100KB');
      } else {
        // Too large, try just parent
        const parentClone = element.parentElement.cloneNode(true);
        parentClone.querySelectorAll('[class*="dp-pii"]').forEach(el => {
          el.className = el.className.split(' ').filter(c => !c.startsWith('dp-pii')).join(' ');
        });
        parentClone.querySelectorAll('[style]').forEach(el => {
          el.removeAttribute('style');
        });
        context.rawDOMContext = parentClone.outerHTML.substring(0, 50000);
        console.log('Using parent DOM only due to size');
      }
    } catch (e) {
      console.error('Could not extract raw DOM context:', e);
    }
    
    // Debug: Log what we collected
    console.log('📊 Context Summary:', {
      targetElement: context.target?.tag || 'unknown',
      ancestorsCount: context.ancestors.length,
      siblingsCount: context.siblings.length,
      childrenCount: context.children.length,
      similarElementsCount: context.similarElements.length,
      nearbyContextCount: context.nearbyContext.length,
      rawDOMLength: context.rawDOMContext ? context.rawDOMContext.length : 0,
      hierarchyDepth: context.fullHierarchy.length
    });
    
    return context;
  }
  
  // Extract essential info from an element (preserve important context)
  function extractElementInfo(element, options = {}) {
    if (!element) return null;
    
    const { 
      includeFullText = false,  // Include full text for target element
      maxTextLength = 200,      // Text length for context elements
      isTarget = false          // Is this the element user selected?
    } = options;
    
    const info = {
      tag: element.tagName.toLowerCase(),
      text: element.textContent?.trim().substring(0, isTarget || includeFullText ? 1000 : maxTextLength),
      attributes: {},
      classes: [],
      hasChildren: element.children.length > 0,
      childCount: element.children.length
    };
    
    // Only include meaningful attributes (avoiding test-specific ones)
    const meaningfulAttrs = [
      'id', 'name', 'type', 'role', 'aria-label', 'placeholder',
      'data-field', 'data-type', 'data-name', 'data-pii',
      'autocomplete', 'for', 'value'
    ];
    
    for (const attr of meaningfulAttrs) {
      const value = element.getAttribute(attr);
      if (value && value.length < 100) { // Skip very long values
        info.attributes[attr] = value;
      }
    }
    
    // Include semantic classes only (excluding our extension's classes and framework-generated ones)
    if (element.className) {
      const classes = element.className.split(/\s+/);
      info.classes = classes.filter(cls => {
        if (!cls || cls.length < 2 || cls.length > 50) return false;
        
        // Skip our extension's classes
        if (cls.startsWith('dp-pii-')) return false;
        
        // Skip framework-generated classes
        // Shopify/CSS modules: _17o99wp0, _abc123
        if (cls.match(/^_[a-z0-9]{5,}$/i)) return false;
        
        // CSS modules: css-1x2y3z
        if (cls.match(/^css-[a-z0-9]+$/i)) return false;
        
        // Styled components: sc-bdfBwQ
        if (cls.match(/^sc-[a-zA-Z]+$/)) return false;
        
        // Hash-like classes
        if (cls.match(/^[a-f0-9]{8,}$/i)) return false;
        
        // Emotion CSS: css-in-js-xxxxx
        if (cls.match(/^css-in-js-/)) return false;
        
        // Other common patterns
        if (cls.match(/^[a-z]{1,3}-[a-f0-9]{6,}$/i)) return false; // e.g., s-a1b2c3
        
        return true;
      }).slice(0, 10); // Keep more classes for better context
    }
    
    return info;
  }
  
  // Extract overall page structure (very condensed)
  function extractPageStructure() {
    const structure = {
      forms: [],
      inputs: [],
      tables: [],
      lists: []
    };
    
    // Find forms
    const forms = document.querySelectorAll('form');
    structure.forms = Array.from(forms).slice(0, 3).map(form => ({
      id: form.id,
      class: form.className?.split(/\s+/)[0],
      action: form.action,
      fieldCount: form.querySelectorAll('input, select, textarea').length
    }));
    
    // Find input patterns
    const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]');
    structure.inputs = Array.from(inputs).slice(0, 10).map(input => ({
      type: input.type,
      name: input.name,
      placeholder: input.placeholder,
      id: input.id
    }));
    
    return structure;
  }
  
  // Check if text looks like PII
  function looksLikePII(text) {
    if (!text) return false;
    
    const patterns = [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // Email
      /^[\d\s\-\(\)\+]{10,}$/, // Phone
      /^\d{3}-\d{2}-\d{4}$/, // SSN
      /^[A-Z][a-z]+ [A-Z][a-z]+$/, // Name
      /^\d+\s+[A-Za-z\s]+$/ // Address
    ];
    
    return patterns.some(pattern => pattern.test(text));
  }
  
  // Check if two elements have similar structure
  function hasSimilarStructure(el1, el2) {
    if (el1.tagName !== el2.tagName) return false;
    
    // Check if they have similar classes
    const classes1 = new Set(el1.className?.split(/\s+/) || []);
    const classes2 = new Set(el2.className?.split(/\s+/) || []);
    
    const intersection = new Set([...classes1].filter(x => classes2.has(x)));
    return intersection.size > 0;
  }
  
  // Estimate token count (rough approximation)
  function estimateTokens(obj) {
    const str = JSON.stringify(obj);
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(str.length / 4);
  }
  
  // Generate prompt for Gemini
function generatePrompt(context) {
  // Include full page structure if we have it
  const pageStructureInfo = context.pageStructure ? 
    `\nPage Structure:\n${JSON.stringify(context.pageStructure, null, 2)}` : '';
  
  // Include similar elements if we have them
  const similarElementsInfo = context.similarElements && context.similarElements.length > 0 ?
    `\nSimilar PII Elements (${context.similarElements.length} found):\n${JSON.stringify(context.similarElements.slice(0, 5), null, 2)}` : '';
  
  // Include siblings for better context understanding
  const siblingsInfo = context.siblings && context.siblings.length > 0 ?
    `\nSibling Elements:\n${JSON.stringify(context.siblings.slice(0, 5), null, 2)}` : '';
  
  // Include nearby context if available
  const nearbyInfo = context.nearbyContext && context.nearbyContext.length > 0 ?
    `\nNearby PII Elements (cousins):\n${JSON.stringify(context.nearbyContext, null, 2)}` : '';
  
  // Include hierarchy path
  const hierarchyInfo = context.fullHierarchy && context.fullHierarchy.length > 0 ?
    `\nFull DOM Path: ${context.fullHierarchy.join(' > ')}` : '';
  
  // Include raw DOM if available (this gives the most accurate context)
  const rawDOMInfo = context.rawDOMContext ?
    `\nRaw HTML Context (actual DOM around element):\n${'```'}html\n${context.rawDOMContext}\n${'```'}` : '';
  
  // Log raw DOM size for debugging
  if (context.rawDOMContext) {
    console.log(`📝 Including ${context.rawDOMContext.length} chars of raw DOM in prompt`);
  } else {
    console.log('⚠️ No raw DOM context available');
  }

  return `You are a CSS selector expert helping identify PII (Personally Identifiable Information) on web pages for blocking in session replay tools.

CRITICAL RULES FOR SELECTOR GENERATION:

1. **AVOID FRAMEWORK-GENERATED CLASSES** (these change on every build):
   - Classes like: _17o99wp0, _15b7gxl0, css-1x2y3z, sc-bdfBwQ
   - Pattern: underscore + random alphanumeric (e.g., _abc123)
   - Pattern: css- followed by random characters
   - Pattern: styled-components classes (sc-xxxxx)
   - These are generated by Shopify, React, styled-components, CSS modules, etc.
   - NEVER use these as they will break when the site rebuilds

2. **PREFER SEMANTIC IDENTIFIERS** (stable across builds):
   - Meaningful class names: .customer-address, .billing-info, .user-email
   - Data attributes with purpose: [data-field="email"], [data-pii="name"]
   - Form field names/IDs: [name="email"], #billing_address
   - ARIA labels: [aria-label="Customer name"]
   - Component classes: .recharge-component, .checkout-section

3. **FIND THE RIGHT BALANCE** - Not too generic, not too specific:
   - TOO GENERIC: .recharge-heading (catches all headings everywhere)
   - TOO SPECIFIC: div > div > div > span:nth-child(3) (breaks with any change)
   - JUST RIGHT: .recharge-component-schedule-item .recharge-heading (specific context + semantic class)
   - JUST RIGHT: .customer-billing-address > p:last-child (semantic parent + structural child)

4. **USE HIERARCHICAL CONTEXT**:
   - Look at the full ancestor chain to understand the component structure
   - Find the nearest semantic parent that provides context
   - Example: If in a .recharge-component-schedule-item, use that as the anchor
   - Build selectors that reflect the logical structure of the page

5. **PATTERN RECOGNITION**:
   - If you see multiple similar PII elements, find the common semantic parent
   - BUT don't be TOO broad - .recharge-heading alone is too generic
   - Consider: Will this selector accidentally catch non-PII elements?
   - Balance: Catch all relevant PII while avoiding false positives

6. **AVOID**:
   - data-testid (unless it's the only option)
   - style attributes
   - Deep positional chains without semantic anchors
   - IDs that look like: :r1u:, ember123, react-id-5
   - Overly generic single-class selectors when more context is available

CONTEXT:
Target Element: ${JSON.stringify(context.target, null, 2)}${hierarchyInfo}
Parent Chain (with semantic classes): ${JSON.stringify(context.ancestors.slice(0, 5), null, 2)}${siblingsInfo}${nearbyInfo}${similarElementsInfo}${pageStructureInfo}${rawDOMInfo}

TARGET ELEMENT'S ACTUAL CONTENT: "${context.target.text || ''}"

IMPORTANT: The user clicked on the element with content "${context.target.text || '[no text]'}". Make sure your selector would actually select this specific element or its container that holds this PII.

ANALYZE THE CONTEXT AND PROVIDE:
{
  "selector": "The best CSS selector (raw format, no escaping)",
  "confidence": 0.0-1.0,
  "reasoning": "Explain why this selector is reliable and what pattern you identified",
  "alternates": ["backup selector 1", "backup selector 2"],
  "pattern_detected": "e.g., 'customer information section', 'subscription details', 'billing address'"
}

Examples of GOOD selectors:
- .recharge-component-schedule-item .recharge-heading
- .customer_billing_address p:last-child
- [data-field="email"]
- .checkout-form input[name="email"]
- #billing-section .address-line-2

Examples of BAD selectors:
- ._17o99wp0 (framework-generated class)
- div > div > div > span (no semantic anchor)
- [data-testid="field-123"] (test-specific)
- .css-1x2y3z (CSS modules generated)

Respond ONLY with valid JSON.`;
}
  
  // Call Gemini API
  async function callGeminiAPI(apiKey, model, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.2, // Low temperature for consistent results
            topK: 1,
            topP: 0.8,
            maxOutputTokens: 2000, // More room for detailed explanations
            responseMimeType: "application/json"
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        
        // Check for specific error types
        if (response.status === 400 && errorData.includes('token')) {
          throw new Error('Token limit exceeded. Context too large for AI processing.');
        } else if (response.status === 403) {
          throw new Error('Invalid API key or quota exceeded.');
        } else if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else {
          throw new Error(`Gemini API error: ${response.status} - ${errorData.substring(0, 100)}`);
        }
      }
      
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!content) {
        throw new Error('No content in Gemini response');
      }
      
      return JSON.parse(content);
    } catch (error) {
      console.error('Gemini API call failed:', error);
      throw error;
    }
  }
  
  // Model capabilities configuration
  const MODEL_CONFIGS = {
    'gemini-1.5-flash': {
      contextLimit: 1000000,  // 1M tokens
      recommendedMax: 100000,  // 10% of limit for safety
      speed: 'fast',
      quality: 'good'
    },
    'gemini-1.5-pro': {
      contextLimit: 2000000,  // 2M tokens
      recommendedMax: 200000,  // 10% of limit
      speed: 'moderate',
      quality: 'excellent'
    },
    'gemini-2.0-flash-exp': {
      contextLimit: 1000000,  // 1M tokens (assumed)
      recommendedMax: 100000,
      speed: 'very-fast',
      quality: 'good-plus'
    }
  };
  
  // Main function to generate AI-powered selector
  async function generateAISelector(element, options) {
    let { apiKey, model = 'gemini-1.5-flash' } = options;
    
    if (!apiKey) {
      throw new Error('Gemini API key is required for AI selector generation');
    }
    
    // Get model configuration
    const modelConfig = MODEL_CONFIGS[model] || MODEL_CONFIGS['gemini-1.5-flash'];
    
    // Check if we should recommend a better model
    const checkModelSuitability = () => {
      // Complexity indicators
      const hasDeepNesting = element.parentElement?.parentElement?.parentElement?.parentElement?.parentElement;
      const hasManyClasses = element.className.split(/\s+/).length > 10;
      const hasComplexStructure = element.children.length > 50;
      const isInShadowDOM = element.getRootNode() !== document;
      const hasAmbiguousPII = !element.id && !element.name && element.tagName === 'DIV';
      
      const isComplex = (hasDeepNesting && hasManyClasses) || 
                        hasComplexStructure || 
                        isInShadowDOM || 
                        hasAmbiguousPII;
      
      // Check token usage vs model limits
      const estimatedTokens = estimateTokens(extractPageContext(element));
      const tokenPressure = estimatedTokens / modelConfig.contextLimit;
      
      return {
        isComplex,
        tokenPressure,
        shouldUpgrade: isComplex && model === 'gemini-1.5-flash',
        reason: isComplex ? 
          (isInShadowDOM ? 'Shadow DOM detected' :
           hasComplexStructure ? 'Complex nested structure' :
           hasAmbiguousPII ? 'Ambiguous PII element' :
           'Deep nesting with many classes') : null
      };
    };
    
    const suitability = checkModelSuitability();
    
    // If model upgrade is recommended, notify and potentially prompt user
    if (suitability.shouldUpgrade) {
      console.warn(`Complex structure detected: ${suitability.reason}`);
      
      // Send message to background/sidepanel to potentially prompt user
      chrome.runtime.sendMessage({
        action: 'modelUpgradeRecommended',
        currentModel: model,
        suggestedModel: 'gemini-1.5-pro',
        reason: suitability.reason,
        canContinue: true
      });
      
      // For now, continue with current model but log the recommendation
      // In future, could wait for user response
      console.log('Continuing with', model, 'but Gemini Pro may provide better results');
    }
    
    // Extract FULL context initially
    let context = extractPageContext(element);
    
    // Check initial token estimate
    let tokenEstimate = estimateTokens(context);
    console.log(`📊 Initial context size: ${tokenEstimate} tokens (Model: ${model}, Limit: ${modelConfig.contextLimit})`);
    
    // Progressive trimming based on model limits
    const safeLimit = modelConfig.contextLimit * 0.7; // 70% of limit for safety
    
    // Level 1: Check if we can send everything
    if (tokenEstimate <= safeLimit) {
      console.log(`✅ Sending FULL context: ${tokenEstimate} tokens (${Math.round(tokenEstimate/modelConfig.contextLimit*100)}% of limit)`);
    } else {
      console.log(`⚠️ Context too large (${tokenEstimate} tokens), applying progressive trimming...`);
      
      // Level 2: Light trim - reduce similar elements and nearby context
      if (context.similarElements.length > 50) {
        context.similarElements = context.similarElements.slice(0, 50);
      }
      if (context.nearbyContext.length > 10) {
        context.nearbyContext = context.nearbyContext.slice(0, 10);
      }
      
      tokenEstimate = estimateTokens(context);
      console.log(`After light trim: ${tokenEstimate} tokens`);
      
      if (tokenEstimate > safeLimit) {
        // Level 3: Moderate trim - reduce raw DOM and more similar elements
        if (context.rawDOMContext && context.rawDOMContext.length > 20000) {
          context.rawDOMContext = context.rawDOMContext.substring(0, 20000);
        }
        context.similarElements = context.similarElements.slice(0, 25);
        context.children = context.children.slice(0, 25);
        
        tokenEstimate = estimateTokens(context);
        console.log(`After moderate trim: ${tokenEstimate} tokens`);
        
        if (tokenEstimate > safeLimit) {
          // Level 4: Aggressive trim - keep only essentials
          console.warn(`Applying aggressive trim for ${model}`);
          context.rawDOMContext = context.rawDOMContext ? context.rawDOMContext.substring(0, 10000) : null;
          context.similarElements = context.similarElements.slice(0, 10);
          context.children = context.children.slice(0, 10);
          context.siblings = context.siblings.slice(0, 10);
          context.nearbyContext = [];
          context.pageStructure = { forms: [], inputs: [] };
          
          tokenEstimate = estimateTokens(context);
          console.log(`After aggressive trim: ${tokenEstimate} tokens`);
          
          if (tokenEstimate > modelConfig.contextLimit * 0.9) {
            // Emergency: Remove raw DOM entirely
            console.error(`Emergency: Removing raw DOM to fit in context`);
            context.rawDOMContext = null;
            tokenEstimate = estimateTokens(context);
            console.log(`Final size: ${tokenEstimate} tokens`);
          }
        }
      }
    }
    
    // Generate prompt
    const prompt = generatePrompt(context);
    
    try {
      // Call Gemini API
      const result = await callGeminiAPI(apiKey, model, prompt);
      
      console.log('Gemini selector result:', result);
      
      // Validate and return the selector
      if (result.selector) {
        // Test if the selector is valid
        try {
          // Remove escaping temporarily to test
          const testSelector = result.selector.replace(/\\/g, '');
          document.querySelector(testSelector);
          
          return {
            selector: result.selector,
            confidence: result.confidence || 0.8,
            reasoning: result.reasoning || 'AI-generated selector',
            alternates: result.alternates || []
          };
        } catch (e) {
          console.error('Invalid selector from AI:', e);
          // Fall back to first alternate if available
          if (result.alternates && result.alternates.length > 0) {
            return {
              selector: result.alternates[0],
              confidence: 0.6,
              reasoning: 'Using alternate selector due to primary validation failure'
            };
          }
        }
      }
      
      throw new Error('No valid selector in AI response');
    } catch (error) {
      console.error('AI selector generation failed:', error);
      // Return null to trigger fallback to heuristic
      return null;
    }
  }
  
  // Export for use in extension
  window.aiSelector = {
    generateAISelector,
    extractPageContext,
    estimateTokens
  };
  
})(window);