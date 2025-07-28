// CSS Selector Generator for Chrome Extension
// A simplified but effective selector generator that works in all browsers
(function(window) {
  'use strict';
  
  // Helper function to escape CSS strings
  function cssEscape(str) {
    if (!str) return '';
    
    // Handle special cases first
    if (typeof str !== 'string') {
      str = String(str);
    }
    
    // More comprehensive escaping for CSS identifiers
    // Based on CSS specification: https://drafts.csswg.org/cssom/#serialize-an-identifier
    return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1')
              .replace(/^(\d)/, '\\3$1 ')  // Escape leading digits
              .replace(/[\x00-\x1f\x7f]/g, function(ch) {  // Escape control characters
                return '\\' + ch.charCodeAt(0).toString(16) + ' ';
              });
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
      const idSelector = '#' + cssEscape(element.id);
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
        .map(cls => '.' + cssEscape(cls));
      
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
        const attrSelector = `${tagName}[${attr}="${cssEscape(value)}"]`;
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
      return getUniqueSelector(element, options);
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
