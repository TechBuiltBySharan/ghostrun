/**
 * Privacy Audit - Track and log all PII handling
 */

import type { Redaction } from './sanitizer';
import type { PlaceholderType } from './patterns';

export interface AuditEntry {
  id: string;
  timestamp: Date;
  operation: AuditOperation;
  source: string;
  dataType: string;
  redactions: Redaction[];
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export type AuditOperation =
  | 'sanitize_string'
  | 'sanitize_object'
  | 'sanitize_console_log'
  | 'sanitize_network_log'
  | 'sanitize_url'
  | 'pii_detected'
  | 'pii_blocked'
  | 'vault_access';

/**
 * In-memory audit log (for V1)
 * In production, this would write to a secure audit database
 */
class AuditLog {
  private entries: AuditEntry[] = [];
  private maxEntries = 10000;

  add(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const fullEntry: AuditEntry = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };
    
    this.entries.push(fullEntry);
    
    // Trim old entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    
    return fullEntry;
  }

  getAll(): AuditEntry[] {
    return [...this.entries];
  }

  query(filter: Partial<AuditEntry>): AuditEntry[] {
    return this.entries.filter(entry => {
      for (const [key, value] of Object.entries(filter)) {
        if (entry[key as keyof AuditEntry] !== value) {
          return false;
        }
      }
      return true;
    });
  }

  getByOperation(operation: AuditOperation): AuditEntry[] {
    return this.query({ operation });
  }

  getByDataType(dataType: string): AuditEntry[] {
    return this.query({ dataType });
  }

  clear(): void {
    this.entries = [];
  }
}

// Global audit log instance
export const auditLog = new AuditLog();

/**
 * Log a sanitization operation
 */
export function logSanitization(params: {
  operation: AuditOperation;
  source: string;
  dataType: string;
  redactions: Redaction[];
  userId?: string;
  sessionId?: string;
}): AuditEntry {
  return auditLog.add({
    operation: params.operation,
    source: params.source,
    dataType: params.dataType,
    redactions: params.redactions,
    userId: params.userId,
    sessionId: params.sessionId,
  });
}

/**
 * Log PII detection
 */
export function logPIIDetection(params: {
  source: string;
  dataType: string;
  types: PlaceholderType[];
  userId?: string;
}): AuditEntry {
  const redactions = params.types.map(type => ({
    type,
    start: -1,
    end: -1,
    original: '[DETECTED]',
  } as Redaction));

  return auditLog.add({
    operation: 'pii_detected',
    source: params.source,
    dataType: params.dataType,
    redactions,
    userId: params.userId,
  });
}

/**
 * Get audit summary
 */
export function getAuditSummary(): {
  totalEntries: number;
  byOperation: Record<AuditOperation, number>;
  byDataType: Record<string, number>;
  redactionCounts: Record<PlaceholderType, number>;
} {
  const byOperation: Record<AuditOperation, number> = {
    sanitize_string: 0,
    sanitize_object: 0,
    sanitize_console_log: 0,
    sanitize_network_log: 0,
    sanitize_url: 0,
    pii_detected: 0,
    pii_blocked: 0,
    vault_access: 0,
  };

  const byDataType: Record<string, number> = {};
  const redactionCounts: Record<string, number> = {};

  for (const entry of auditLog.getAll()) {
    byOperation[entry.operation]++;
    byDataType[entry.dataType] = (byDataType[entry.dataType] || 0) + 1;
    
    for (const redaction of entry.redactions) {
      redactionCounts[redaction.type] = (redactionCounts[redaction.type] || 0) + 1;
    }
  }

  return {
    totalEntries: auditLog.getAll().length,
    byOperation,
    byDataType,
    redactionCounts: redactionCounts as Record<PlaceholderType, number>,
  };
}

/**
 * Export audit log for compliance
 */
export function exportAuditLog(format: 'json' | 'csv' = 'json'): string {
  const entries = auditLog.getAll();
  
  if (format === 'json') {
    return JSON.stringify(entries, null, 2);
  }

  // CSV format
  const headers = ['id', 'timestamp', 'operation', 'source', 'dataType', 'redactionCount', 'userId'];
  const rows = entries.map(e => [
    e.id,
    e.timestamp.toISOString(),
    e.operation,
    e.source,
    e.dataType,
    e.redactions.length.toString(),
    e.userId || '',
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
