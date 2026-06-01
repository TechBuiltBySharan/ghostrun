/**
 * Multi-account support for SaaS profiles (superadmin, admin, manager, guest, …)
 */

/** Default SaaS account types for this product */
export const DEFAULT_SAAS_ACCOUNT_IDS = ['superadmin', 'admin', 'manager', 'guest'] as const;

export function buildDefaultSaaSAccounts(
  loginFlow: string,
  emailDomain = 'yourapp.com',
): Record<string, ProfileAccount> {
  const accounts: Record<string, ProfileAccount> = {};
  for (const id of DEFAULT_SAAS_ACCOUNT_IDS) {
    const secrets = secretNamesForAccount(id);
    accounts[id] = buildAccountFromSecrets({
      id,
      label: id === 'superadmin' ? 'Super admin' : id.charAt(0).toUpperCase() + id.slice(1),
      email: `qa-${id}@${emailDomain}`,
      emailSecret: secrets.email,
      passwordSecret: secrets.password,
      loginFlow,
    });
  }
  return accounts;
}

export interface ProfileAccount {
  /** Human label, e.g. "Workspace admin" */
  label?: string;
  description?: string;
  /** Inline email (prefer emailSecret in shared setups) */
  email?: string;
  /** Flow variable for email, e.g. adminEmail — also exposed as testEmail when selected */
  emailVar?: string;
  /** Env var name for email, e.g. STAGING_ADMIN_EMAIL */
  emailSecret?: string;
  /** Env var name for password, e.g. STAGING_ADMIN_PASSWORD */
  passwordSecret: string;
  /** Override profile auth.loginFlow for this account type */
  loginFlow?: string;
  metadata?: Record<string, string>;
}

export interface ProfileAccountsConfig {
  defaultAccount?: string;
  accounts: Record<string, ProfileAccount>;
}

export interface GhostrunProfileAccounts {
  name: string;
  baseUrl?: string;
  variables?: Record<string, string>;
  auth?: {
    strategy?: string;
    loginFlow?: string;
    usernameVar?: string;
    usernameSecret?: string;
    passwordSecret?: string;
    tokenSecret?: string;
    otpSecret?: string;
    otpVar?: string;
    storageState?: string;
  };
  accounts?: Record<string, ProfileAccount>;
  defaultAccount?: string;
}

export type ResolveSecretFn = (name?: string) => Promise<string | undefined> | string | undefined;

const DEFAULT_EMAIL_VAR = 'testEmail';

export function normalizeAccountId(id: string): string {
  return id.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'default';
}

export function listAccountIds(profile: GhostrunProfileAccounts): string[] {
  return Object.keys(profile.accounts || {}).sort();
}

export function getProfileAccount(
  profile: GhostrunProfileAccounts,
  accountId: string,
): ProfileAccount | null {
  const key = normalizeAccountId(accountId);
  return profile.accounts?.[key] || profile.accounts?.[accountId] || null;
}

export function resolveSelectedAccountKey(
  profile: GhostrunProfileAccounts | null | undefined,
  argv: string[] = [],
): string | null {
  if (!profile?.accounts || Object.keys(profile.accounts).length === 0) return null;
  const flagIdx = argv.indexOf('--account');
  if (flagIdx !== -1 && argv[flagIdx + 1]) {
    return normalizeAccountId(argv[flagIdx + 1]);
  }
  if (process.env.GHOSTRUN_ACCOUNT) {
    return normalizeAccountId(process.env.GHOSTRUN_ACCOUNT);
  }
  if (profile.defaultAccount) {
    return normalizeAccountId(profile.defaultAccount);
  }
  return null;
}

export async function resolveAccountEmail(
  account: ProfileAccount,
  runVars: Record<string, string>,
  resolveSecret: ResolveSecretFn,
): Promise<string | undefined> {
  const emailVar = account.emailVar || DEFAULT_EMAIL_VAR;
  if (runVars[emailVar]) return runVars[emailVar];
  if (account.email) return account.email;
  if (account.emailSecret) {
    const fromSecret = await resolveSecret(account.emailSecret);
    if (fromSecret) return fromSecret;
  }
  if (runVars.testEmail) return runVars.testEmail;
  if (runVars.accountEmail) return runVars.accountEmail;
  return undefined;
}

/**
 * Merge account credentials into run variables before auth + flow execution.
 * Explicit --var values applied later by caller should win if merged after this.
 */
export async function applyProfileAccount(
  profile: GhostrunProfileAccounts,
  accountId: string,
  runVars: Record<string, string>,
  resolveSecret: ResolveSecretFn,
): Promise<{ accountId: string; account: ProfileAccount; email?: string }> {
  const account = getProfileAccount(profile, accountId);
  if (!account) {
    throw new Error(
      `Account "${accountId}" not found on profile "${profile.name}". ` +
      `Defined: ${listAccountIds(profile).join(', ') || '(none)'}. ` +
      `Use: ghostrun profile accounts list ${profile.name}`,
    );
  }
  if (!account.passwordSecret) {
    throw new Error(`Account "${accountId}" on profile "${profile.name}" requires passwordSecret`);
  }

  const emailVar = account.emailVar || DEFAULT_EMAIL_VAR;
  const email = await resolveAccountEmail(account, runVars, resolveSecret);

  runVars.accountType = accountId;
  runVars.accountLabel = account.label || accountId;
  if (email) {
    runVars.accountEmail = email;
    runVars[emailVar] = email;
    runVars.testEmail = email;
    runVars.PROFILE_AUTH_USERNAME = email;
    runVars.AUTH_USERNAME = email;
  }

  const password = await resolveSecret(account.passwordSecret);
  if (password) {
    runVars[account.passwordSecret] = password;
    runVars.PROFILE_AUTH_PASSWORD = password;
  }

  for (const [k, v] of Object.entries(account.metadata || {})) {
    if (!(k in runVars)) runVars[k] = v;
  }

  return { accountId, account, email };
}

export function getEffectiveAuthForAccount(
  profile: GhostrunProfileAccounts,
  accountId: string | null,
): GhostrunProfileAccounts['auth'] {
  const base = profile.auth || { strategy: 'none' };
  if (!accountId) return base;
  const account = getProfileAccount(profile, accountId);
  if (!account) return base;
  return {
    ...base,
    loginFlow: account.loginFlow || base.loginFlow,
    usernameVar: account.emailVar || base.usernameVar || DEFAULT_EMAIL_VAR,
    usernameSecret: account.emailSecret || base.usernameSecret,
    passwordSecret: account.passwordSecret || base.passwordSecret,
    otpSecret: base.otpSecret,
    otpVar: base.otpVar,
  };
}

export function buildAccountFromSecrets(opts: {
  id: string;
  label?: string;
  email?: string;
  emailSecret?: string;
  passwordSecret: string;
  loginFlow?: string;
}): ProfileAccount {
  const emailVar = `${normalizeAccountId(opts.id)}Email`;
  return {
    label: opts.label || opts.id,
    email: opts.email,
    emailVar,
    emailSecret: opts.emailSecret || `STAGING_${opts.id.replace(/-/g, '_').toUpperCase()}_EMAIL`,
    passwordSecret: opts.passwordSecret,
    loginFlow: opts.loginFlow,
  };
}

export function secretNamesForAccount(accountId: string): { email: string; password: string } {
  const slug = accountId.replace(/-/g, '_').toUpperCase();
  return {
    email: `STAGING_${slug}_EMAIL`,
    password: `STAGING_${slug}_PASSWORD`,
  };
}
