import { describe, it, expect, vi } from 'vitest';
import {
  applyProfileAccount,
  resolveSelectedAccountKey,
  getEffectiveAuthForAccount,
  buildAccountFromSecrets,
  buildDefaultSaaSAccounts,
  listAccountIds,
  DEFAULT_SAAS_ACCOUNT_IDS,
} from '../../account-scope';

const resolveSecret = vi.fn(async (name?: string) => {
  if (name === 'STAGING_ADMIN_EMAIL') return 'admin@test.com';
  if (name === 'STAGING_ADMIN_PASSWORD') return 'admin-pass';
  if (name === 'STAGING_MANAGER_EMAIL') return 'manager@test.com';
  if (name === 'STAGING_MANAGER_PASSWORD') return 'manager-pass';
  return undefined;
});

describe('account-scope', () => {
  const profile = {
    name: 'staging',
    baseUrl: 'https://staging.example.com',
    defaultAccount: 'manager',
    auth: { strategy: 'form', loginFlow: 'login', usernameVar: 'testEmail' },
    accounts: buildDefaultSaaSAccounts('login', 'test.com'),
  };

  it('DEFAULT_SAAS_ACCOUNT_IDS lists product roles', () => {
    expect(DEFAULT_SAAS_ACCOUNT_IDS).toEqual(['superadmin', 'admin', 'manager', 'guest']);
  });

  it('buildDefaultSaaSAccounts creates all four roles', () => {
    const accounts = buildDefaultSaaSAccounts('login', 'acme.com');
    expect(Object.keys(accounts).sort()).toEqual(['admin', 'guest', 'manager', 'superadmin']);
    expect(accounts.manager.email).toBe('qa-manager@acme.com');
    expect(accounts.superadmin.passwordSecret).toBe('STAGING_SUPERADMIN_PASSWORD');
  });

  it('resolveSelectedAccountKey prefers --account flag', () => {
    expect(resolveSelectedAccountKey(profile, ['run', 'x', '--account', 'superadmin'])).toBe('superadmin');
  });

  it('resolveSelectedAccountKey falls back to defaultAccount', () => {
    expect(resolveSelectedAccountKey(profile, ['run', 'x'])).toBe('manager');
  });

  it('applyProfileAccount injects email and password vars', async () => {
    const vars: Record<string, string> = {};
    const adminOnly = {
      ...profile,
      accounts: {
        admin: buildAccountFromSecrets({
          id: 'admin',
          emailSecret: 'STAGING_ADMIN_EMAIL',
          passwordSecret: 'STAGING_ADMIN_PASSWORD',
        }),
      },
    };
    await applyProfileAccount(adminOnly, 'admin', vars, resolveSecret);
    expect(vars.testEmail).toBe('admin@test.com');
    expect(vars.adminEmail).toBe('admin@test.com');
    expect(vars.accountType).toBe('admin');
    expect(vars.STAGING_ADMIN_PASSWORD).toBe('admin-pass');
  });

  it('getEffectiveAuthForAccount overrides login secrets per account', () => {
    const auth = getEffectiveAuthForAccount(profile, 'guest');
    expect(auth?.passwordSecret).toBe('STAGING_GUEST_PASSWORD');
    expect(auth?.usernameVar).toBe('guestEmail');
  });

  it('listAccountIds returns sorted keys', () => {
    expect(listAccountIds(profile)).toEqual(['admin', 'guest', 'manager', 'superadmin']);
  });
});
