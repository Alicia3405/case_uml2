import { randomUUID } from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value?: string | null): boolean {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

export function resolveDocId(entity?: { _id?: string; id?: string } | null): string {
  if (entity?._id) return String(entity._id);
  if (entity?.id) return String(entity.id);
  return randomUUID();
}

export function toPlainEntity<T extends { _id?: any; id?: string }>(doc: any): T | null {
  if (!doc) return null;
  const raw = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: true }) : { ...doc };
  if (raw._id !== undefined && raw._id !== null) {
    const idStr = String(raw._id);
    raw._id = idStr;
    raw.id = idStr;
  } else if (raw.id) {
    raw._id = String(raw.id);
  }
  return raw as T;
}

export function toPlainEntities<T extends { _id?: any; id?: string }>(docs: any[]): T[] {
  if (!Array.isArray(docs)) return [];
  return docs.map((d) => toPlainEntity<T>(d)).filter((d): d is T => d !== null);
}

export function pickDefined<T extends Record<string, any>>(
  source: Partial<T>,
  omitKeys: string[] = [],
): Record<string, any> {
  const omit = new Set(omitKeys);
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(source || {})) {
    if (!omit.has(key) && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function getUtcDateKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

