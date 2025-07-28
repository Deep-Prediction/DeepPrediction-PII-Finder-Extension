# PII Finder Chrome Extension

A Chrome extension designed to help privacy teams easily identify and block Personally Identifiable Information (PII) from session replays using CSS selectors.

## Why Do You Need This?

Session replay tools capture all data on a web page, including sensitive information like:
- Email addresses
- Phone numbers  
- Credit card information
- Social security numbers
- Personal names and addresses

**This extension makes it super easy to identify PII elements and generate the CSS selectors needed to block them from being captured by your session replay tool.**

## How It Works

This extension provides two methods for PII detection:

1. **Visual Selection**: Point and click on any element on your webpage to automatically generate its CSS selector
2. **Manual CSS Selector Input**: Manually enter CSS selectors for elements you want to block

The tool then provides you with the exact CSS query parameters to paste into your session replay product configuration, ensuring sensitive data is never captured.

## Compatible Session Replay Tools

Works with any session replay product that supports CSS selector blocking, including:
- **[DeepPrediction](https://deepprediction.com)** - *Get unlimited session replays for free!*
- **PostHog**
- **FullStory** 
- **Microsoft Clarity**

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the `chrome-extension` folder
5. The PII Finder extension will now appear in your browser toolbar

## How to Get Started

1. **Navigate to your website** that you want to analyze for PII
2. **Click the PII Finder extension icon** in your Chrome toolbar
3. **Select PII elements** using one of two methods:
   - Click the visual selector tool and click on elements containing PII
   - Manually enter CSS selectors in the input field
4. **Copy the generated CSS selectors** from the extension
5. **Paste these selectors** into your session replay tool's PII blocking configuration

## File Structure

```
chrome-extension/
├── manifest.json          # Extension configuration
├── background.js          # Background service worker
├── popup.html            # Extension popup UI
├── popup.js              # Popup functionality
├── sidepanel.html        # Side panel interface
├── sidepanel.js          # Side panel logic
├── pii-selector.js       # PII selection functionality
├── pii-selector.css      # Styling for PII selector
├── finder-bundle.js      # Bundled finder utilities
└── icons/                # Extension icons (16px, 48px, 128px)
```

## Learn More

For unlimited session replays and advanced privacy features, check out [**DeepPrediction**](https://deepprediction.com?ref=github_ext) - the session replay tool built with privacy-first principles.

---

**Protect your users' privacy while gaining valuable insights from session replays.** 