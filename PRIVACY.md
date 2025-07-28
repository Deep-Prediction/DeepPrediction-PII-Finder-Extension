# Privacy Policy for PII Finder Chrome Extension

## Overview

PII Finder is committed to protecting your privacy. This document explains our privacy practices and why certain permissions are required.

## Data Collection

**We collect ZERO data.** 

- ❌ No analytics tracking
- ❌ No user behavior monitoring  
- ❌ No personal information collection
- ❌ No data sent to external servers
- ❌ No cookies or tracking pixels
- ❌ No usage statistics

## Permissions Explained

### Host Permissions: `<all_urls>`

We request access to all URLs for the following reasons:

1. **Universal Compatibility**: The extension needs to work on any website where you want to identify PII elements. Since we don't know in advance which websites you'll need to analyze, we request broad permissions.

2. **Local Operation Only**: Despite having access to all URLs, the extension operates entirely locally on your browser. No data from any website is ever transmitted outside your browser.

3. **User-Initiated Actions**: The extension only activates when you explicitly click on it and choose to scan for PII elements.

### Other Permissions

- **activeTab**: Only accesses the currently active tab when you interact with the extension
- **storage**: Saves your PII selectors locally in your browser (not on any external server)
- **scripting**: Injects the PII detection script only when you activate the extension
- **sidePanel**: Provides the user interface for managing PII selectors
- **clipboardWrite**: Allows you to copy CSS selectors to your clipboard for use in other tools

## Data Storage

All data is stored locally in your browser:
- PII selectors are saved per domain using Chrome's local storage API
- No data is synced to the cloud or any external servers
- Clearing your browser data will remove all saved selectors

## Third-Party Services

This extension does not communicate with any third-party services, APIs, or external servers.

## Open Source

This extension is open source. You can review the entire source code to verify our privacy practices.

## Updates

Any changes to this privacy policy will be reflected in the extension's version history and changelog.

## Contact

If you have privacy concerns or questions, please open an issue on our GitHub repository.

---

*Last updated: January 2025*
*Version: 0.1.0* 