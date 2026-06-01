import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import {
  extractFirstUrl,
  extractOtpCode,
  matchEmailMessage,
  matchWebhookCapture,
  isEmailBridgeEnabled,
  isWebhookBridgeEnabled,
  assertWebhookPayload,
  verifyWebhookSignature,
  resolveWebhookCapture,
  type MailpitMessage,
  type WebhookCapture,
} from '../../service-bridge';

describe('service-bridge', () => {
  it('extractFirstUrl finds magic links', () => {
    const body = 'Click here: https://app.example.com/auth/verify?token=abc123 to continue.';
    expect(extractFirstUrl(body)).toBe('https://app.example.com/auth/verify?token=abc123');
  });

  it('extractOtpCode finds 6-digit codes', () => {
    expect(extractOtpCode('Your code is 482910. Do not share.')).toBe('482910');
  });

  it('matchEmailMessage filters by recipient and subject', () => {
    const messages: MailpitMessage[] = [{
      ID: '1',
      Subject: 'Sign in to Acme',
      From: { Address: 'noreply@acme.com', Name: 'Acme' },
      To: [{ Address: 'qa@test.com', Name: '' }],
      Snippet: '',
      Created: new Date().toISOString(),
    }];
    expect(matchEmailMessage(messages, { to: 'qa@test.com', subjectContains: 'sign in' })?.ID).toBe('1');
    expect(matchEmailMessage(messages, { to: 'other@test.com' })).toBeNull();
  });

  it('matchWebhookCapture finds path', () => {
    const captures: WebhookCapture[] = [{
      id: '1',
      path: '/webhooks/stripe',
      method: 'POST',
      headers: {},
      body: '{}',
      receivedAt: new Date().toISOString(),
    }];
    expect(matchWebhookCapture(captures, '/webhooks/stripe')?.id).toBe('1');
    expect(matchWebhookCapture(captures, 'stripe')?.id).toBe('1');
  });

  it('isEmailBridgeEnabled is false without profile email config', () => {
    expect(isEmailBridgeEnabled(undefined)).toBe(false);
    expect(isEmailBridgeEnabled({})).toBe(false);
    expect(isEmailBridgeEnabled({ email: { provider: 'none' } })).toBe(false);
    expect(isEmailBridgeEnabled({ email: { provider: 'mailpit' } })).toBe(true);
  });

  it('isWebhookBridgeEnabled requires explicit webhook config', () => {
    expect(isWebhookBridgeEnabled(undefined)).toBe(false);
    expect(isWebhookBridgeEnabled({ webhook: { provider: 'local' } })).toBe(true);
  });

  it('assertWebhookPayload validates JSON fields', () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: { amount: 50000 } });
    expect(() => assertWebhookPayload(body, [{ path: 'event', expected: 'payment.captured' }])).not.toThrow();
    expect(() => assertWebhookPayload(body, [{ path: 'event', expected: 'refund' }])).toThrow(/expected "refund"/);
  });

  it('verifyWebhookSignature validates HMAC sha256', () => {
    const secret = 'whsec_test';
    const body = '{"id":"pay_123"}';
    const sig = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    const capture: WebhookCapture = {
      id: '1',
      path: '/webhooks/razorpay',
      method: 'POST',
      headers: { 'X-Razorpay-Signature': sig },
      body,
      receivedAt: new Date().toISOString(),
    };
    expect(() => verifyWebhookSignature(capture, { secret, headerName: 'X-Razorpay-Signature' })).not.toThrow();
    expect(() => verifyWebhookSignature(capture, { secret: 'wrong', headerName: 'X-Razorpay-Signature' })).toThrow(/mismatch/);
  });

  it('verifyWebhookSignature strips sha256= prefix', () => {
    const secret = 'meta_secret';
    const body = '{"entry":[]}';
    const sig = crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    const capture: WebhookCapture = {
      id: '2',
      path: '/webhooks/meta',
      method: 'POST',
      headers: { 'X-Hub-Signature-256': `sha256=${sig}` },
      body,
      receivedAt: new Date().toISOString(),
    };
    expect(() => verifyWebhookSignature(capture, {
      secret,
      headerName: 'X-Hub-Signature-256',
      prefix: 'sha256=',
    })).not.toThrow();
  });

  it('resolveWebhookCapture uses inline body variable', () => {
    const cap = resolveWebhookCapture([], { body: '{"ok":true}' });
    expect(cap.body).toBe('{"ok":true}');
  });
});
