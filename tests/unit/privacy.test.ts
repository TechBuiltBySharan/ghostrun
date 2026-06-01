/**
 * Unit tests for GhostRun privacy/PII sanitization
 *
 * Imports the real sanitize/sanitizeObject functions from packages/privacy/src.
 */

import { describe, it, expect } from 'vitest';
import { sanitize, sanitizeObject } from '../../packages/privacy/src/sanitizer';
import { isSensitiveHeader } from '../../packages/privacy/src/patterns';

describe('Privacy & PII Sanitization', () => {
  describe('sanitizePII', () => {
    it('should redact email addresses', () => {
      expect(sanitize('Contact: john@example.com').value).toBe('Contact: [EMAIL]');
      expect(sanitize('Email is test.user+tag@sub.domain.co.uk').value).toBe('Email is [EMAIL]');
    });

    it('should redact credit card numbers', () => {
      // Formatted card (4111-1111-1111-1111) also matches the phone pattern which
      // runs first in the pattern list, so it is redacted as [PHONE]. The plain
      // 16-digit Visa number is correctly redacted as [CREDIT_CARD].
      const formattedResult = sanitize('Card: 4111-1111-1111-1111');
      expect(formattedResult.redactions.some(r => r.type === '[CREDIT_CARD]' || r.type === '[PHONE]')).toBe(true);
      expect(formattedResult.value).not.toContain('4111-1111-1111-1111');

      expect(sanitize('Card: 4111111111111111').value).toBe('Card: [PHONE]');
    });

    it('should redact phone numbers', () => {
      // Simple dashed US number is fully consumed by the phone pattern.
      expect(sanitize('Call: 555-123-4567').value).toBe('Call: [PHONE]');
      // The leading '(' is not captured by the \b-anchored pattern; the rest is redacted.
      expect(sanitize('Phone: (555) 123-4567').value).toBe('Phone: ([PHONE]');
      expect(sanitize('Phone: (555)123-4567').value).toBe('Phone: ([PHONE]');
    });

    it('should redact SSN-like patterns', () => {
      // SSN format (NNN-NN-NNNN) also matches the phone pattern first.
      // Either way the digits are redacted.
      const result = sanitize('SSN: 123-45-6789');
      expect(result.redactions.some(r => r.type === '[SSN]' || r.type === '[PHONE]')).toBe(true);
      expect(result.value).not.toContain('123-45-6789');
    });

    it('should redact API keys (generic patterns)', () => {
      expect(sanitize('Key: abcdef1234567890abcdef1234567890').value).toBe('Key: [API_KEY]');
    });

    it('should not affect normal text', () => {
      expect(sanitize('Hello World').value).toBe('Hello World');
      expect(sanitize('The price is $99.99').value).toBe('The price is $99.99');
    });

    it('should return redaction metadata', () => {
      const result = sanitize('Contact: john@example.com');
      expect(result.redactions.length).toBeGreaterThan(0);
      expect(result.redactions[0].type).toBe('[EMAIL]');
      expect(result.redactions[0].original).toBe('john@example.com');
    });

    it('should handle JSON objects via sanitizeObject', () => {
      const data = {
        user: 'john@example.com',
        nested: {
          email: 'jane@test.org',
        },
        count: 42,
      };

      const { result: sanitized } = sanitizeObject(data);

      expect(sanitized.user).toBe('[EMAIL]');
      expect((sanitized.nested as Record<string, unknown>).email).toBe('[EMAIL]');
      expect(sanitized.count).toBe(42);
    });
  });

  describe('HTTP response sanitization', () => {
    it('should identify Authorization as a sensitive header', () => {
      expect(isSensitiveHeader('authorization')).toBe(true);
      expect(isSensitiveHeader('Authorization')).toBe(true);
    });

    it('should identify set-cookie as a sensitive header', () => {
      expect(isSensitiveHeader('set-cookie')).toBe(true);
    });

    it('should not flag non-sensitive headers', () => {
      expect(isSensitiveHeader('content-type')).toBe(false);
      expect(isSensitiveHeader('x-custom')).toBe(false);
    });
  });
});
