/**
 * PII Sanitizer - Removes sensitive data before AI calls
 */

import { PII_PATTERNS, type PlaceholderType, type PIIPattern } from './patterns';

export interface ConsoleLog {
  timestamp: number;
  type: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  location?: string;
  args?: unknown[];
  stack?: string;
}

export interface NetworkLog {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status?: number;
  statusText?: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

export interface SanitizeOptions {
  /** Replace with placeholders (default: true) */
  replace?: boolean;
  /** Remove entirely (default: false) */
  remove?: boolean;
  /** Custom patterns to use */
  customPatterns?: PIIPattern[];
  /** Fields to skip entirely */
  skipFields?: string[];
  /** Redaction string (default: [REDACTED]) */
  redaction?: string;
}

export interface SanitizeResult {
  value: string;
  redactions: Redaction[];
  warnings: string[];
}

export interface Redaction {
  type: PlaceholderType;
  start: number;
  end: number;
  original: string;
}

/**
 * Default sanitizer options
 */
const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  replace: true,
  remove: false,
  customPatterns: [],
  skipFields: [],
  redaction: '[REDACTED]',
};

/**
 * Sanitize a string value
 */
export function sanitize(value: string, options: SanitizeOptions = {}): SanitizeResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const redactions: Redaction[] = [];
  const warnings: string[] = [];
  let sanitized = value;

  const patterns = [...PII_PATTERNS, ...opts.customPatterns];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
    
    while ((match = regex.exec(value)) !== null) {
      const placeholder = pattern.type;
      
      redactions.push({
        type: placeholder,
        start: match.index,
        end: match.index + match[0].length,
        original: match[0],
      });

      if (opts.replace) {
        sanitized = sanitized.replace(match[0], placeholder);
      } else if (opts.remove) {
        sanitized = sanitized.replace(match[0], opts.redaction);
      }

      // Prevent infinite loops on patterns with no advance
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  }

  return { value: sanitized, redactions, warnings };
}

/**
 * Sanitize an object (deep scan)
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  options: SanitizeOptions = {}
): { result: T; redactions: Redaction[] } {
  const redactions: Redaction[] = [];
  const opts = { ...DEFAULT_OPTIONS, ...options };

  function sanitizeValue(value: unknown, path: string): unknown {
    // Skip certain fields
    if (opts.skipFields.some(field => path.toLowerCase().includes(field.toLowerCase()))) {
      return value;
    }

    if (typeof value === 'string') {
      const result = sanitize(value, opts);
      redactions.push(...result.redactions);
      return result.value;
    }

    if (Array.isArray(value)) {
      return value.map((item, index) => sanitizeValue(item, `${path}[${index}]`));
    }

    if (typeof value === 'object' && value !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = sanitizeValue(val, `${path}.${key}`);
      }
      return result;
    }

    return value;
  }

  const result = sanitizeValue(obj, '') as T;
  return { result, redactions };
}

/**
 * Sanitize console log entries
 */
export function sanitizeConsoleLog(log: ConsoleLog): ConsoleLog {
  const sanitizedMessage = sanitize(log.message).value;
  
  return {
    ...log,
    message: sanitizedMessage,
  };
}

/**
 * Sanitize network logs (headers, bodies)
 */
export function sanitizeNetworkLog(log: NetworkLog): NetworkLog {
  const sanitized: NetworkLog = { ...log };

  // Sanitize headers
  sanitized.requestHeaders = { ...log.requestHeaders };
  for (const header of Object.keys(sanitized.requestHeaders)) {
    if (isSensitiveHeader(header)) {
      sanitized.requestHeaders[header] = '[SENSITIVE]';
    } else {
      sanitized.requestHeaders[header] = sanitize(log.requestHeaders[header]).value;
    }
  }

  // Sanitize URL (remove tokens from query params)
  sanitized.url = sanitizeUrl(log.url);

  // Sanitize request body
  if (log.requestBody) {
    sanitized.requestBody = sanitize(log.requestBody).value;
  }

  // Sanitize response body (only for error responses)
  if (log.responseBody && log.status && log.status >= 400) {
    sanitized.responseBody = sanitize(log.responseBody).value;
  }

  return sanitized;
}

/**
 * Sanitize URL by removing sensitive query parameters
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    
    // Remove common sensitive query params
    const sensitiveParams = ['token', 'api_key', 'apikey', 'key', 'secret', 'auth', 'session', 'sid'];
    
    for (const param of sensitiveParams) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.set(param, '[REDACTED]');
      }
    }

    // Sanitize the pathname (remove UUIDs)
    const sanitizedPath = sanitize(parsed.pathname).value;
    parsed.pathname = sanitizedPath;

    return parsed.toString();
  } catch {
    // If URL parsing fails, just sanitize as a string
    return sanitize(url).value;
  }
}

/**
 * Check if a string contains potential PII
 */
export function containsPII(value: string): boolean {
  return sanitize(value).redactions.length > 0;
}

/**
 * Get PII types found in a string
 */
export function getPIITypes(value: string): PlaceholderType[] {
  const redactions = sanitize(value).redactions;
  return [...new Set(redactions.map(r => r.type))];
}

/**
 * Helper: Check if header is sensitive
 */
function isSensitiveHeader(header: string): boolean {
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'x-csrf-token',
    'x-session-id',
    'proxy-authorization',
  ];
  return sensitiveHeaders.includes(header.toLowerCase());
}
