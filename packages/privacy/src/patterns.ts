/**
 * PII detection patterns for privacy sanitization
 */

export type PlaceholderType =
  | '[EMAIL]'
  | '[TOKEN]'
  | '[PASSWORD]'
  | '[PHONE]'
  | '[SSN]'
  | '[CREDIT_CARD]'
  | '[UUID]'
  | '[IP_ADDRESS]'
  | '[NAME]'
  | '[ADDRESS]'
  | '[DATE_OF_BIRTH]'
  | '[URL]'
  | '[API_KEY]'
  | '[SECRET]';

/**
 * PII pattern definition
 */
export interface PIIPattern {
  type: PlaceholderType;
  pattern: RegExp;
  description: string;
  confidence: number; // 0-1
}

/**
 * All PII detection patterns
 */
export const PII_PATTERNS: PIIPattern[] = [
  // Email addresses
  {
    type: '[EMAIL]',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    description: 'Email address',
    confidence: 0.95,
  },
  
  // Bearer tokens
  {
    type: '[TOKEN]',
    pattern: /\b(Bearer|Token|ApiKey)\s+[A-Za-z0-9\-_\.]+\b/gi,
    description: 'Bearer token',
    confidence: 0.95,
  },
  {
    type: '[TOKEN]',
    pattern: /\btoken["\s:=]+["']?([A-Za-z0-9\-_\.]{20,})["']?/gi,
    description: 'Token in JSON',
    confidence: 0.85,
  },
  {
    type: '[TOKEN]',
    pattern: /\beyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/g,
    description: 'JWT token',
    confidence: 0.99,
  },
  
  // API Keys
  {
    type: '[API_KEY]',
    pattern: /\b[A-Za-z0-9]{32,64}\b/g,
    description: 'Potential API key (generic)',
    confidence: 0.4,
  },
  
  // Passwords (in context)
  {
    type: '[PASSWORD]',
    pattern: /("password"|'password'|password)["\s:=]+["']?([^\s"'&]{4,})["']?/gi,
    description: 'Password field',
    confidence: 0.9,
  },
  {
    type: '[PASSWORD]',
    pattern: /(pwd|passwd|pass)["\s:=]+["']?([^\s"'&]{4,})["']?/gi,
    description: 'Password field (abbreviated)',
    confidence: 0.8,
  },
  
  // Phone numbers
  {
    type: '[PHONE]',
    pattern: /\b(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    description: 'US phone number',
    confidence: 0.85,
  },
  {
    type: '[PHONE]',
    pattern: /\b\+?[0-9]{1,4}[-.\s]?[0-9]{2,4}[-.\s]?[0-9]{2,4}[-.\s]?[0-9]{2,4}\b/g,
    description: 'International phone number',
    confidence: 0.7,
  },
  
  // Social Security Numbers
  {
    type: '[SSN]',
    pattern: /\b[0-9]{3}[-]?[0-9]{2}[-]?[0-9]{4}\b/g,
    description: 'SSN',
    confidence: 0.8,
  },
  
  // Credit Card numbers
  {
    type: '[CREDIT_CARD]',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    description: 'Credit card number',
    confidence: 0.95,
  },
  {
    type: '[CREDIT_CARD]',
    pattern: /\b[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}[-\s]?[0-9]{4}\b/g,
    description: 'Formatted credit card number',
    confidence: 0.9,
  },
  
  // UUIDs
  {
    type: '[UUID]',
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    description: 'UUID',
    confidence: 0.99,
  },
  
  // IP Addresses
  {
    type: '[IP_ADDRESS]',
    pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
    description: 'IPv4 address',
    confidence: 0.7,
  },
  
  // Names (in common contexts)
  {
    type: '[NAME]',
    pattern: /("firstName"|'firstName'|"lastName"|'lastName'|"fullName"|'fullName')["\s:=]+["']?([A-Z][a-z]+)["']?/g,
    description: 'Name field',
    confidence: 0.8,
  },
  
  // Dates of birth
  {
    type: '[DATE_OF_BIRTH]',
    pattern: /("dob"|"dateOfBirth"|'dob'|'dateOfBirth')["\s:=]+["']?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})["']?/gi,
    description: 'Date of birth',
    confidence: 0.85,
  },
  
  // Secret keys
  {
    type: '[SECRET]',
    pattern: /(secret|privateKey|private_key)["\s:=]+["']?([A-Za-z0-9+/=]{20,})["']?/gi,
    description: 'Secret key',
    confidence: 0.9,
  },
];

/**
 * Headers commonly containing sensitive data
 */
export const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'x-session-id',
  'proxy-authorization',
  'sec-websocket-key',
]);

/**
 * Check if a header is sensitive
 */
export function isSensitiveHeader(header: string): boolean {
  return SENSITIVE_HEADERS.has(header.toLowerCase());
}

/**
 * Get placeholder for a specific PII type
 */
export function getPlaceholder(type: PlaceholderType): string {
  return type;
}

/**
 * Get all placeholder types
 */
export function getAllPlaceholderTypes(): PlaceholderType[] {
  return [
    '[EMAIL]',
    '[TOKEN]',
    '[PASSWORD]',
    '[PHONE]',
    '[SSN]',
    '[CREDIT_CARD]',
    '[UUID]',
    '[IP_ADDRESS]',
    '[NAME]',
    '[ADDRESS]',
    '[DATE_OF_BIRTH]',
    '[URL]',
    '[API_KEY]',
    '[SECRET]',
  ];
}
