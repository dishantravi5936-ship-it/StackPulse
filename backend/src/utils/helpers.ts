import { randomUUID } from 'crypto';

export const generateId = (): string => randomUUID();

export const nowISO = (): string => new Date().toISOString();

/**
 * Convert Gatus nanosecond duration to milliseconds
 */
export const nsToMs = (ns: number): number => Math.round(ns / 1_000_000);

/**
 * Generate a Gatus-style endpoint key from group and name
 * Mirrors Gatus key generation: lowercased, special chars → '-'
 */
export const toGatusKey = (group: string, name: string): string => {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${normalize(group)}_${normalize(name)}`;
};

