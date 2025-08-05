// CSS Selector Generator for Chrome Extension
// A simplified but effective selector generator that works in all browsers
(function(window) {
  'use strict';
  
  // IMPORTANT: Selectors generated here are RAW and work directly with document.querySelector()
  // Database escaping ONLY happens in sidepanel.js "Copy for DB" button
  
  // For attribute values in selectors, we need to escape quotes for valid syntax
  // Example: [data-name="John's Value"] needs to become [data-name="John\"s Value"]
  function escapeQuotesForAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '\\"');
  }
  
  // Check if a string is "word-like" (alphanumeric with dashes/underscores)
  function isWordLike(str) {
    return /^[a-zA-Z0-9_-]+$/.test(str);
  }
  
  // Get a unique selector for an element
  function getUniqueSelector(element, options) {
    options = options || {};
    const maxDepth = options.maxDepth || 5;
    const root = options.root || document.body;
    
    // Build path from element up to root
    const path = [];
    let current = element;
    let depth = 0;
    
    while (current && current !== root && depth < maxDepth) {
      const selector = getSelectorForElement(current, root);
      
      if (selector.unique) {
        path.unshift(selector.value);
        
        // Check if this gives us a unique match
        const fullSelector = path.join(' > ');
        const matches = root.querySelectorAll(fullSelector);
        
        if (matches.length === 1 && matches[0] === element) {
          return fullSelector;
        }
      } else {
        path.unshift(selector.value);
      }
      
      current = current.parentElement;
      depth++;
    }
    
    // If we couldn't find a unique selector, use the full path
    return path.join(' > ');
  }
  
  // Get the best selector for a single element
  function getSelectorForElement(element, root) {
    const selectors = [];
    
    // Try ID first (most specific)
    if (element.id && isWordLike(element.id)) {
      const idSelector = '#' + element.id;
      // Check if ID is unique in the root
      if (root.querySelectorAll(idSelector).length === 1) {
        return { value: idSelector, unique: true };
      }
    }
    
    // Build base selector with tag name
    const tagName = element.tagName.toLowerCase();
    let baseSelector = tagName;
    
    // Add classes if available
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/)
        .filter(cls => cls && isWordLike(cls))
        .map(cls => '.' + cls);
      
      if (classes.length > 0) {
        // Try tag + all classes
        const fullClassSelector = tagName + classes.join('');
        if (root.querySelectorAll(fullClassSelector).length === 1) {
          return { value: fullClassSelector, unique: true };
        }
        
        // Try each class individually
        for (const cls of classes) {
          const singleClassSelector = tagName + cls;
          if (root.querySelectorAll(singleClassSelector).length === 1) {
            return { value: singleClassSelector, unique: true };
          }
        }
        
        // Use most specific class combination
        baseSelector = fullClassSelector;
      }
    }
    
    // Try attributes
    const attributes = ['role', 'name', 'type', 'aria-label', 'data-testid'];
    for (const attr of attributes) {
      const value = element.getAttribute(attr);
      if (value && isWordLike(value)) {
        const attrSelector = `${tagName}[${attr}="${escapeQuotesForAttr(value)}"]`;
        if (root.querySelectorAll(attrSelector).length === 1) {
          return { value: attrSelector, unique: true };
        }
      }
    }
    
    // Add nth-child as fallback
    if (element.parentElement) {
      const siblings = Array.from(element.parentElement.children);
      const index = siblings.indexOf(element) + 1;
      
      // Try nth-of-type first
      const sameTypeSiblings = siblings.filter(el => el.tagName === element.tagName);
      if (sameTypeSiblings.length > 1) {
        const typeIndex = sameTypeSiblings.indexOf(element) + 1;
        baseSelector += `:nth-of-type(${typeIndex})`;
      } else if (siblings.length > 1) {
        // Use nth-child if needed
        baseSelector += `:nth-child(${index})`;
      }
    }
    
    return { value: baseSelector, unique: false };
  }
  
  // Generate semantic selector - prioritizes meaningful attributes over position
  function getSemanticSelector(element, options) {
    const root = options?.root || document.body;
    const path = [];
    let current = element;
    let depth = 0;
    const maxDepth = options?.maxDepth || 3; // Shorter paths for semantic selectors
    
    while (current && current !== root && depth < maxDepth) {
      const selector = getSemanticSelectorForElement(current, root);
      
      if (selector.unique) {
        path.unshift(selector.value);
        
        // Check if this gives us a unique match
        const fullSelector = path.join(' ');
        const matches = root.querySelectorAll(fullSelector);
        
        if (matches.length === 1 && matches[0] === element) {
          return fullSelector;
        }
      } else {
        // Avoid adding purely structural selectors unless necessary
        const isStructural = selector.value.includes(':first-child') || 
                           selector.value.includes(':nth-child') ||
                           selector.value.includes(':first-of-type') ||
                           selector.value.match(/^[a-z]+$/); // Just a tag name
        
        if (!isStructural || path.length === 0) {
          path.unshift(selector.value);
        }
      }
      
      current = current.parentElement;
      depth++;
    }
    
    // If we ended up with a purely structural selector, try to improve it
    if (path.every(s => s.includes(':') || s.match(/^[a-z]+$/))) {
      // Find the nearest parent with a meaningful class
      let parent = element.parentElement;
      while (parent && parent !== root) {
        if (parent.className) {
          const classes = parent.className.split(/\s+/)
            .filter(c => c && !c.startsWith('dp-pii-') && !c.match(/^[a-f0-9]{8,}$/));
          if (classes.length > 0) {
            const tagName = element.tagName.toLowerCase();
            // Return a simple parent > child selector
            return `.${classes[0]} ${tagName}`;
          }
        }
        parent = parent.parentElement;
      }
    }
    
    // Return the most semantic path we could build
    return path.join(' > '); // Use direct child for more precision
  }
  
  // Get semantic selector for a single element
  function getSemanticSelectorForElement(element, root) {
    const tagName = element.tagName.toLowerCase();
    
    // Priority 1: ID (if meaningful)
    if (element.id && isWordLike(element.id) && !element.id.match(/^[a-f0-9-]{36}$/i)) { // Exclude UUIDs
      const idSelector = '#' + element.id;
      if (root.querySelectorAll(idSelector).length === 1) {
        return { value: idSelector, unique: true };
      }
    }
    
    // Priority 2: Data attributes (especially semantic ones)
    const semanticDataAttrs = [
      'data-id', 'data-name', 'data-role', 'data-pii',
      'data-field', 'data-type', 'data-component', 'data-element'
    ];
    
    for (const attr of semanticDataAttrs) {
      const value = element.getAttribute(attr);
      if (value && !value.match(/^[a-f0-9-]{36}$/i)) { // Exclude UUIDs
        const attrSelector = `[${attr}="${escapeQuotesForAttr(value)}"]`;
        if (root.querySelectorAll(attrSelector).length === 1) {
          return { value: attrSelector, unique: true };
        }
        // Even if not unique, prefer this with tag name
        const tagAttrSelector = `${tagName}[${attr}="${escapeQuotesForAttr(value)}"]`;
        if (root.querySelectorAll(tagAttrSelector).length === 1) {
          return { value: tagAttrSelector, unique: true };
        }
      }
    }
    
    // Priority 3: ARIA and semantic HTML attributes
    const semanticAttrs = [
      'role', 'aria-label', 'aria-labelledby', 'name', 
      'type', 'placeholder', 'for', 'autocomplete'
    ];
    
    for (const attr of semanticAttrs) {
      const value = element.getAttribute(attr);
      if (value && isWordLike(value)) {
        const attrSelector = `[${attr}="${escapeQuotesForAttr(value)}"]`;
        if (root.querySelectorAll(attrSelector).length === 1) {
          return { value: attrSelector, unique: true };
        }
        // Try with tag name for more specificity
        const tagAttrSelector = `${tagName}[${attr}="${escapeQuotesForAttr(value)}"]`;
        if (root.querySelectorAll(tagAttrSelector).length === 1) {
          return { value: tagAttrSelector, unique: true };
        }
      }
    }
    
    // Priority 4: Meaningful classes (filter out utility and framework-generated classes)
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/)
        .filter(cls => {
          // Filter out common utility classes and generated classes
          if (!cls || cls.length <= 2) return false;
          if (!isWordLike(cls)) return false;
          
          // Skip framework-generated classes
          if (cls.match(/^_[a-z0-9]{5,}$/i)) return false; // Shopify: _17o99wp0
          if (cls.match(/^css-[a-z0-9]+$/i)) return false; // CSS modules
          if (cls.match(/^sc-[a-zA-Z]+$/)) return false; // Styled components
          if (cls.match(/^[a-f0-9]{8,}$/i)) return false; // Hash-like classes
          if (cls.match(/^css-in-js-/)) return false; // Emotion CSS
          if (cls.match(/^[a-z]{1,3}-[a-f0-9]{6,}$/i)) return false; // e.g., s-a1b2c3
          
          // Skip utility classes
          if (cls.match(/^(col|row|btn|text|bg|border|p|m|mt|mb|ml|mr|px|py|mx|my)-/)) return false;
          
          // Skip our extension's classes
          if (cls.startsWith('dp-pii-')) return false;
          
          return true;
        });
      
      // Look for semantic class names
      const semanticClasses = classes.filter(cls => 
        /^(customer|user|billing|shipping|payment|address|email|phone|name|field|input|form|card|account|profile|contact|personal)/i.test(cls)
      );
      
      if (semanticClasses.length > 0) {
        // Try the most semantic class first
        const bestClass = '.' + semanticClasses[0];
        const classSelector = tagName + bestClass;
        if (root.querySelectorAll(classSelector).length === 1) {
          return { value: classSelector, unique: true };
        }
        // Return it even if not unique - it's semantic
        return { value: classSelector, unique: false };
      }
      
      // Try any meaningful class
      if (classes.length > 0) {
        const classSelector = tagName + '.' + classes[0];
        if (root.querySelectorAll(classSelector).length === 1) {
          return { value: classSelector, unique: true };
        }
      }
    }
    
    // Priority 5: Position-based but prefer semantic pseudo-classes
    if (element.parentElement) {
      const siblings = Array.from(element.parentElement.children);
      const sameTypeSiblings = siblings.filter(el => el.tagName === element.tagName);
      const index = siblings.indexOf(element);
      const typeIndex = sameTypeSiblings.indexOf(element);
      
      // Prefer first/last over nth
      if (index === 0) {
        return { value: `${tagName}:first-child`, unique: false };
      }
      if (index === siblings.length - 1) {
        return { value: `${tagName}:last-child`, unique: false };
      }
      if (typeIndex === 0 && sameTypeSiblings.length > 1) {
        return { value: `${tagName}:first-of-type`, unique: false };
      }
      if (typeIndex === sameTypeSiblings.length - 1 && sameTypeSiblings.length > 1) {
        return { value: `${tagName}:last-of-type`, unique: false };
      }
      
      // Only use nth as last resort for semantic
      if (siblings.length > 1) {
        return { value: `${tagName}:nth-child(${index + 1})`, unique: false };
      }
    }
    
    // Fallback to just tag name
    return { value: tagName, unique: false };
  }
  
  // Smart selector generation - AI-powered or advanced heuristics
  function getSmartSelector(element, options) {
    // Check if AI is available and enabled
    const useAI = options?.useAI && options?.apiKey;
    
    if (useAI) {
      // AI-powered selector generation (async)
      // This will be called from the content script with proper async handling
      return getAISmartSelector(element, options);
    } else {
      // Fallback to advanced heuristics
      return getHeuristicSmartSelector(element, options);
    }
  }
  
  // Heuristic-based smart selector (no AI)
  function getHeuristicSmartSelector(element, options) {
    const root = options?.root || document.body;
    
    // Analyze the element and its context
    const analysis = analyzeElementContext(element);
    
    // Generate multiple candidate selectors
    const candidates = [];
    
    // 1. Check for PII-indicating patterns
    if (analysis.likelyPII) {
      // Look for similar PII elements on the page
      const similarElements = findSimilarPIIElements(element, analysis);
      
      if (similarElements.length > 1) {
        // Generate a selector that would match all similar PII
        const commonSelector = generateCommonSelector(element, similarElements);
        if (commonSelector) {
          candidates.push({
            selector: commonSelector,
            score: 0.9,
            type: 'pii-pattern'
          });
        }
      }
    }
    
    // 2. Try to find semantic identifiers first
    // Check for meaningful IDs
    if (element.id && !element.id.match(/^[a-f0-9-]{36}$/i) && !isDynamicAttribute('id', element.id)) {
      candidates.push({
        selector: '#' + element.id,
        score: 0.95,
        type: 'semantic-id'
      });
    }
    
    // 2. Check for stable, semantic attributes
    const stableAttrs = analysis.attributes.filter(attr => 
      !isDynamicAttribute(attr.name, attr.value)
    );
    
    for (const attr of stableAttrs) {
      const selector = `[${attr.name}="${escapeQuotesForAttr(attr.value)}"]`;
      if (isUniqueEnough(selector, root, element)) {
        candidates.push({
          selector: selector,
          score: 0.8,
          type: 'stable-attribute'
        });
      }
    }
    
    // 3. Check for semantic class combinations
    if (analysis.classes.length > 0) {
      const semanticClasses = analysis.classes.filter(cls => 
        isSemanticClass(cls) && !isDynamicClass(cls)
      );
      
      if (semanticClasses.length > 0) {
        const classSelector = '.' + semanticClasses.join('.');
        if (isUniqueEnough(classSelector, root, element)) {
          candidates.push({
            selector: classSelector,
            score: 0.7,
            type: 'semantic-classes'
          });
        }
      }
    }
    
    // 4. Context-aware selector (parent + child relationship)
    if (element.parentElement) {
      const parentAnalysis = analyzeElementContext(element.parentElement);
      if (parentAnalysis.semanticRole) {
        const contextSelector = generateContextualSelector(element, parentAnalysis);
        if (contextSelector) {
          candidates.push({
            selector: contextSelector,
            score: 0.6,
            type: 'contextual'
          });
        }
      }
    }
    
    // Select the best candidate
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      // Return raw selector - don't escape here as it breaks querySelectorAll in the extension
      // Escaping should only be done when copying for database export
      return candidates[0].selector;
    }
    
    // Smart fallback: Try to build a better selector than pure structural
    // Look for the nearest semantic parent
    let current = element;
    let depth = 0;
    const maxDepth = 3;
    
    while (current && depth < maxDepth) {
      const parent = current.parentElement;
      if (!parent) break;
      
      // Check if parent has semantic identifiers
      const parentClasses = parent.className ? parent.className.split(/\s+/)
        .filter(cls => cls && !cls.startsWith('dp-pii-') && isSemanticClass(cls)) : [];
      
      if (parentClasses.length > 0) {
        // Build selector from semantic parent
        const parentSelector = '.' + parentClasses[0];
        const childTag = element.tagName.toLowerCase();
        
        // Try to identify element within parent context
        const siblings = Array.from(parent.querySelectorAll(childTag));
        if (siblings.length === 1) {
          return `${parentSelector} ${childTag}`;
        }
        
        // Use text content or other identifying features
        if (analysis.text && analysis.text.length > 3) {
          return `${parentSelector} ${childTag}`; // Still better than pure structural
        }
      }
      
      current = parent;
      depth++;
    }
    
    // Last resort: Use semantic selector but try to avoid deep structural chains
    const semanticResult = getSemanticSelectorForElement(element, root);
    if (semanticResult.value && !semanticResult.value.includes(':nth-child') && 
        !semanticResult.value.includes(':first-child')) {
      return semanticResult.value;
    }
    
    // Absolute last resort: Just use tag name with minimal structure
    const tagName = element.tagName.toLowerCase();
    const parent = element.parentElement;
    if (parent && parent.className) {
      const parentClass = parent.className.split(/\s+/)[0];
      if (parentClass && !parentClass.startsWith('dp-pii-')) {
        return `.${parentClass} ${tagName}`;
      }
    }
    
    return tagName; // Better than complex structural selector
  }
  
  // Analyze element context for smart selection
  function analyzeElementContext(element) {
    const text = element.textContent?.trim() || '';
    const tagName = element.tagName.toLowerCase();
    
    // Get all attributes (excluding style which is too volatile)
    const attributes = [];
    for (const attr of element.attributes) {
      // Skip style attribute as it's not reliable for selectors
      if (attr.name === 'style') continue;
      
      attributes.push({
        name: attr.name,
        value: attr.value
      });
    }
    
    // Get classes (excluding our extension's dp-pii- classes and framework-generated ones)
    const classes = element.className ? 
      element.className.split(/\s+/)
        .filter(cls => {
          if (!cls || !cls.trim()) return false;
          
          // Skip our extension's classes
          if (cls.startsWith('dp-pii-')) return false;
          
          // Skip framework-generated classes
          if (cls.match(/^_[a-z0-9]{5,}$/i)) return false; // Shopify: _17o99wp0
          if (cls.match(/^css-[a-z0-9]+$/i)) return false; // CSS modules: css-1x2y3z
          if (cls.match(/^sc-[a-zA-Z]+$/)) return false; // Styled components: sc-bdfBwQ
          if (cls.match(/^[a-f0-9]{8,}$/i)) return false; // Hash-like classes
          if (cls.match(/^css-in-js-/)) return false; // Emotion CSS
          if (cls.match(/^[a-z]{1,3}-[a-f0-9]{6,}$/i)) return false; // e.g., s-a1b2c3
          
          return true;
        }) : [];
    
    // Detect if this looks like PII
    const piiPatterns = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      phone: /^[\d\s\-\(\)\+]+$/,
      ssn: /^\d{3}-\d{2}-\d{4}$/,
      creditCard: /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/,
      name: /^[A-Z][a-z]+ [A-Z][a-z]+$/,
      address: /^\d+\s+[A-Za-z\s]+$/
    };
    
    let likelyPII = false;
    let piiType = null;
    
    for (const [type, pattern] of Object.entries(piiPatterns)) {
      if (pattern.test(text)) {
        likelyPII = true;
        piiType = type;
        break;
      }
    }
    
    // Check semantic indicators in attributes/classes
    const semanticIndicators = [
      'email', 'phone', 'address', 'name', 'ssn', 'card',
      'billing', 'shipping', 'customer', 'user', 'personal'
    ];
    
    const semanticRole = semanticIndicators.find(indicator => {
      return attributes.some(attr => 
        attr.value.toLowerCase().includes(indicator)
      ) || classes.some(cls => 
        cls.toLowerCase().includes(indicator)
      );
    });
    
    return {
      tagName,
      text,
      attributes,
      classes,
      likelyPII,
      piiType,
      semanticRole
    };
  }
  
  // Check if an attribute looks dynamic (generated IDs, test IDs, etc)
  function isDynamicAttribute(name, value) {
    // Check for common dynamic patterns
    const dynamicPatterns = [
      /^[a-f0-9]{8,}$/i,  // Hash-like
      /^[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}$/i, // UUID
      /test[-_]?id[-_]?\d+/i,  // Test IDs with numbers
      /^:r[0-9a-z]+:$/,  // React internal IDs
      /^ember\d+$/,  // Ember IDs
      /^ng-[a-z0-9]+$/,  // Angular IDs
      /^v-[a-f0-9]+$/,  // Vue IDs
      /_\d{10,}$/,  // Timestamp suffixes
      /temp[-_]/i,  // Temporary
      /random/i  // Random
    ];
    
    return dynamicPatterns.some(pattern => pattern.test(value));
  }
  
  // Check if a class looks dynamic
  function isDynamicClass(className) {
    return isDynamicAttribute('class', className);
  }
  
  // Check if a class is semantic (meaningful for selection)
  function isSemanticClass(className) {
    // Avoid utility classes and generated classes
    const utilityPrefixes = [
      'col-', 'row-', 'btn-', 'text-', 'bg-', 'border-',
      'p-', 'm-', 'mt-', 'mb-', 'ml-', 'mr-', 'px-', 'py-',
      'w-', 'h-', 'flex-', 'grid-', 'justify-', 'items-',
      'is-', 'has-', 'u-'
    ];
    
    if (utilityPrefixes.some(prefix => className.startsWith(prefix))) {
      return false;
    }
    
    // Must be meaningful length
    if (className.length < 3) {
      return false;
    }
    
    // Should contain semantic words
    const semanticWords = [
      'customer', 'user', 'billing', 'shipping', 'payment',
      'address', 'email', 'phone', 'name', 'field', 'input',
      'form', 'card', 'account', 'profile', 'contact', 'personal',
      'data', 'info', 'detail', 'content', 'value', 'text'
    ];
    
    return semanticWords.some(word => 
      className.toLowerCase().includes(word)
    );
  }
  
  // Find similar PII elements on the page
  function findSimilarPIIElements(element, analysis) {
    if (!analysis.likelyPII) return [];
    
    const similar = [];
    const allElements = document.querySelectorAll(element.tagName);
    
    for (const el of allElements) {
      const elAnalysis = analyzeElementContext(el);
      if (elAnalysis.likelyPII && elAnalysis.piiType === analysis.piiType) {
        similar.push(el);
      }
    }
    
    return similar;
  }
  
  // Generate a selector that matches multiple similar elements
  function generateCommonSelector(element, similarElements) {
    // Find common attributes/classes among all similar elements
    const firstAnalysis = analyzeElementContext(element);
    let commonSelector = element.tagName.toLowerCase();
    
    // Check for common classes
    const commonClasses = firstAnalysis.classes.filter(cls => {
      return similarElements.every(el => 
        el.classList.contains(cls)
      );
    });
    
    if (commonClasses.length > 0 && isSemanticClass(commonClasses[0])) {
      return commonSelector + '.' + commonClasses[0];
    }
    
    // Check for common parent context
    const parentClass = element.parentElement?.className?.split(/\s+/)[0];
    if (parentClass && isSemanticClass(parentClass)) {
      return '.' + parentClass + ' ' + commonSelector;
    }
    
    return null;
  }
  
  // Generate contextual selector based on parent
  function generateContextualSelector(element, parentAnalysis) {
    if (!parentAnalysis.semanticRole) return null;
    
    const parentSelector = parentAnalysis.classes.length > 0 ?
              '.' + parentAnalysis.classes[0] :
      parentAnalysis.tagName;
    
    const childPosition = Array.from(element.parentElement.children)
      .filter(el => el.tagName === element.tagName)
      .indexOf(element);
    
    if (childPosition === 0) {
      return parentSelector + ' > ' + element.tagName.toLowerCase() + ':first-of-type';
    } else if (childPosition === element.parentElement.children.length - 1) {
      return parentSelector + ' > ' + element.tagName.toLowerCase() + ':last-of-type';
    }
    
    return parentSelector + ' > ' + element.tagName.toLowerCase();
  }
  
  // Check if selector is unique enough
  function isUniqueEnough(selector, root, targetElement) {
    try {
      const matches = root.querySelectorAll(selector);
      // Allow up to 3 matches for PII (might want to block multiple)
      return matches.length > 0 && matches.length <= 3 && 
             Array.from(matches).includes(targetElement);
    } catch (e) {
      return false;
    }
  }
  
  // AI-powered smart selector (placeholder - will be implemented in content script)
  function getAISmartSelector(element, options) {
    // This will be handled by the content script which can make async calls
    // For now, fall back to heuristic
    console.log('AI selector requested but will be handled by content script');
    return getHeuristicSmartSelector(element, options);
  }
  
  // Main finder function
  function finder(element, options) {
    if (!element || element.nodeType !== 1) {
      throw new Error('Invalid element provided');
    }
    
    if (element.tagName.toLowerCase() === 'html') {
      return 'html';
    }
    
    if (element.tagName.toLowerCase() === 'body') {
      return 'body';
    }
    
    try {
      const strategy = options?.strategy || 'smart';
      
      // Route to different strategies
      switch(strategy) {
        case 'structural':
          // Use existing structural logic
          return getUniqueSelector(element, options);
          
        case 'semantic':
          // Use semantic selector generation
          console.log('Semantic strategy selected');
          return getSemanticSelector(element, options);
          
        case 'smart':
        default:
          // Use smart selector generation (AI-powered or heuristic-based)
          console.log('Smart strategy selected');
          return getSmartSelector(element, options);
      }
    } catch (error) {
      console.error('Error generating selector:', error);
      // Fallback to simple selector
      return element.tagName.toLowerCase();
    }
  }
  
  // Stub functions for compatibility
  function className(name) {
    return isWordLike(name);
  }
  
  function tagName(name) {
    return true;
  }
  
  function attr(name, value) {
    return isWordLike(name) && isWordLike(value);
  }
  
  function idName(name) {
    return isWordLike(name);
  }
  
  // Export for Chrome extension
  window.cssFinder = {
    finder: finder,
    className: className,
    tagName: tagName,
    attr: attr,
    idName: idName
  };
  
})(window);
