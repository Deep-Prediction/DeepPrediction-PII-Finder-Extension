// Constants for the PII Finder Extension

// Classes added by our extension that should be stripped/ignored
export const DP_PII_CLASSES = [
  'dp-pii-preview-block',
  'dp-pii-preview-mask',
  'dp-pii-preview-ignore',
  'dp-pii-selected',
  'dp-pii-hover',
  'dp-pii-selecting',
  'dp-pii-loading'
];

// Prefix for all our extension classes
export const DP_PII_PREFIX = 'dp-pii-';

// PII patterns for detection
export const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  phone: /(\+\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/,
  ssn: /\d{3}-\d{2}-\d{4}/,
  creditCard: /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/,
  name: /^[A-Z][a-z]+ [A-Z][a-z]+$/,
  address: /\d+\s+[A-Za-z\s]+\s+(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Plaza|Pl)/i,
  zipCode: /\b\d{5}(-\d{4})?\b/,
  dateOfBirth: /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/
};

// Dynamic patterns to avoid in selectors
export const DYNAMIC_PATTERNS = [
  /^test[-_]/i,
  /[-_]test$/i,
  /^temp[-_]/i,
  /[-_]temp$/i,
  /^tmp[-_]/i,
  /[-_]tmp$/i,
  /^ember\d+$/,
  /^react[-_]/,
  /^ng[-_]/,
  /^vue[-_]/,
  /^svelte[-_]/,
  /^:r[0-9a-z]+:$/,  // React internal IDs
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,  // UUIDs
  /^[a-f0-9]{32}$/i,  // MD5 hashes
  /^[a-f0-9]{40}$/i,  // SHA1 hashes
  /^[a-f0-9]{64}$/i   // SHA256 hashes
];

// Semantic class/attribute patterns that indicate PII
export const SEMANTIC_PII_INDICATORS = [
  // Attributes
  'data-field',
  'data-name',
  'data-type',
  'data-pii',
  'data-sensitive',
  'aria-label',
  'placeholder',
  'name',
  'id',
  
  // Common PII-related class/id patterns
  /email/i,
  /e-mail/i,
  /phone/i,
  /tel/i,
  /mobile/i,
  /address/i,
  /billing/i,
  /shipping/i,
  /customer/i,
  /user/i,
  /account/i,
  /profile/i,
  /personal/i,
  /private/i,
  /sensitive/i,
  /ssn/i,
  /social/i,
  /credit/i,
  /card/i,
  /payment/i,
  /name/i,
  /first[-_]?name/i,
  /last[-_]?name/i,
  /full[-_]?name/i,
  /birth/i,
  /dob/i,
  /age/i,
  /gender/i,
  /zip/i,
  /postal/i,
  /city/i,
  /state/i,
  /country/i
];