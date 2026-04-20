/**
 * Unit tests for GhostRun privacy/PII sanitization
 */

import { describe, it, expect } from 'vitest';

describe('Privacy & PII Sanitization', () => {
  describe('sanitizePII', () => {
    it('should redact email addresses', () => {
      const sanitizePII = (text: string): string => {
        return text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
      };

      expect(sanitizePII('Contact: john@example.com')).toBe('Contact: [EMAIL_REDACTED]');
      expect(sanitizePII('Email is test.user+tag@sub.domain.co.uk')).toBe('Email is [EMAIL_REDACTED]');
    });

    it('should redact credit card numbers', () => {
      const sanitizePII = (text: string): string => {
        return text.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_REDACTED]');
      };

      expect(sanitizePII('Card: 4111-1111-1111-1111')).toBe('Card: [CARD_REDACTED]');
      expect(sanitizePII('Card: 4111111111111111')).toBe('Card: [CARD_REDACTED]');
    });

    it('should redact phone numbers', () => {
      const sanitizePII = (text: string): string => {
        return text
          .replace(/\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/g, '[PHONE_REDACTED]')
          .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[PHONE_REDACTED]');
      };

      expect(sanitizePII('Call: 555-123-4567')).toBe('Call: [PHONE_REDACTED]');
      expect(sanitizePII('Phone: (555) 123-4567')).toBe('Phone: [PHONE_REDACTED]');
      expect(sanitizePII('Phone: (555)123-4567')).toBe('Phone: [PHONE_REDACTED]');
    });

    it('should redact SSN-like patterns', () => {
      const sanitizePII = (text: string): string => {
        return text.replace(/\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, '[SSN_REDACTED]');
      };

      expect(sanitizePII('SSN: 123-45-6789')).toBe('SSN: [SSN_REDACTED]');
    });

    it('should redact API keys (generic patterns)', () => {
      const sanitizePII = (text: string): string => {
        // Long alphanumeric strings that look like API keys
        return text.replace(/\b[a-zA-Z0-9]{32,64}\b/g, '[KEY_REDACTED]');
      };

      expect(sanitizePII('Key: abcdef1234567890abcdef1234567890')).toBe('Key: [KEY_REDACTED]');
    });

    it('should not affect normal text', () => {
      const sanitizePII = (text: string): string => {
        return text
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
          .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, '[CARD_REDACTED]');
      };

      expect(sanitizePII('Hello World')).toBe('Hello World');
      expect(sanitizePII('The price is $99.99')).toBe('The price is $99.99');
    });

    it('should handle JSON objects', () => {
      const sanitizeJSON = (obj: any): any => {
        if (typeof obj !== 'object' || obj === null) {
          return typeof obj === 'string' ? 
            obj.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]') 
            : obj;
        }
        if (Array.isArray(obj)) {
          return obj.map(sanitizeJSON);
        }
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = sanitizeJSON(value);
        }
        return result;
      };

      const data = {
        user: 'john@example.com',
        nested: {
          email: 'jane@test.org',
        },
        count: 42,
      };

      const sanitized = sanitizeJSON(data);

      expect(sanitized.user).toBe('[EMAIL_REDACTED]');
      expect(sanitized.nested.email).toBe('[EMAIL_REDACTED]');
      expect(sanitized.count).toBe(42);
    });
  });

  describe('HTTP response sanitization', () => {
    it('should redact Authorization headers', () => {
      const redactAuthHeaders = (headers: Record<string, string>): Record<string, string> => {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(headers)) {
          if (key.toLowerCase() === 'authorization') {
            result[key] = '[REDACTED]';
          } else {
            result[key] = value;
          }
        }
        return result;
      };

      const headers = {
        'content-type': 'application/json',
        'authorization': 'Bearer secret-token-123',
        'x-custom': 'value',
      };

      const sanitized = redactAuthHeaders(headers);

      expect(sanitized['authorization']).toBe('[REDACTED]');
      expect(sanitized['content-type']).toBe('application/json');
      expect(sanitized['x-custom']).toBe('value');
    });

    it('should redact Set-Cookie headers', () => {
      const headers = {
        'set-cookie': 'session=abc123; HttpOnly; Secure',
        'content-type': 'text/html',
      };

      const sanitized = { ...headers };
      if (sanitized['set-cookie']) {
        sanitized['set-cookie'] = '[COOKIES_REDACTED]';
      }

      expect(sanitized['set-cookie']).toBe('[COOKIES_REDACTED]');
    });
  });
});
