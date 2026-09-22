import { LargeAmountRule } from './rules/large-amount';
import { NewAccountHighValueRule } from './rules/new-account-high-value';
import { RapidInOutRule } from './rules/rapid-in-out';
import { StructuringRule } from './rules/structuring';
import { VelocityRule } from './rules/velocity';
import { Rule, TransactionType } from './types';

type FieldSpec =
  | { kind: 'int'; min: number; max?: number }
  | { kind: 'fraction'; inclusiveMax?: boolean }
  | { kind: 'types' };

interface CatalogEntry {
  stateful: boolean;
  fields: Record<string, FieldSpec>;
  create(config: Record<string, unknown>): Rule;
}

const TRANSACTION_TYPES: TransactionType[] = ['deposit', 'withdrawal', 'bet', 'payout', 'transfer'];
const weight: FieldSpec = { kind: 'int', min: 0, max: 1000 };
const duration: FieldSpec = { kind: 'int', min: 1 };

export const RULE_CATALOG: Record<string, CatalogEntry> = {
  'large-amount': {
    stateful: false,
    fields: { threshold: { kind: 'int', min: 1 }, weight },
    create: (c) => new LargeAmountRule(c as never),
  },
  velocity: {
    stateful: true,
    fields: { windowMs: duration, maxCount: { kind: 'int', min: 1 }, weight },
    create: (c) => new VelocityRule(c as never),
  },
  structuring: {
    stateful: true,
    fields: {
      reportingThreshold: { kind: 'int', min: 1 },
      margin: { kind: 'fraction' },
      windowMs: duration,
      minCount: { kind: 'int', min: 2 },
      types: { kind: 'types' },
      weight,
    },
    create: (c) => new StructuringRule(c as never),
  },
  'rapid-in-out': {
    stateful: true,
    fields: { windowMs: duration, minRatio: { kind: 'fraction', inclusiveMax: true }, minAmount: { kind: 'int', min: 0 }, weight },
    create: (c) => new RapidInOutRule(c as never),
  },
  'new-account-high-value': {
    stateful: false,
    fields: { accountAgeMs: duration, threshold: { kind: 'int', min: 1 }, weight },
    create: (c) => new NewAccountHighValueRule(c as never),
  },
};

export interface RuleConfigValidationOptions {
  maxWindowMs?: number;
}

export function validateRuleConfig(ruleId: string, config: unknown, options: RuleConfigValidationOptions = {}): string[] {
  const entry = RULE_CATALOG[ruleId];
  if (!entry) return [`Unknown rule "${ruleId}"`];
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return ['Config must be an object'];

  const values = config as Record<string, unknown>;
  const errors: string[] = [];

  for (const key of Object.keys(values)) {
    if (!(key in entry.fields)) errors.push(`Unknown field "${key}"`);
  }

  for (const [name, spec] of Object.entries(entry.fields)) {
    const value = values[name];
    if (value === undefined) {
      errors.push(`"${name}" is required`);
      continue;
    }
    const error = checkField(name, spec, value);
    if (error) errors.push(error);
  }

  const windowMs = values.windowMs;
  if (options.maxWindowMs !== undefined && typeof windowMs === 'number' && windowMs > options.maxWindowMs) {
    errors.push(`"windowMs" must not exceed the window store retention of ${options.maxWindowMs}ms`);
  }

  return errors;
}

export function createRule(ruleId: string, config: unknown, options: RuleConfigValidationOptions = {}): Rule {
  const errors = validateRuleConfig(ruleId, config, options);
  if (errors.length > 0) throw new Error(`Invalid config for rule "${ruleId}": ${errors.join('; ')}`);
  return RULE_CATALOG[ruleId]!.create(config as Record<string, unknown>);
}

function checkField(name: string, spec: FieldSpec, value: unknown): string | null {
  switch (spec.kind) {
    case 'int':
      if (!Number.isInteger(value)) return `"${name}" must be an integer`;
      if ((value as number) < spec.min) return `"${name}" must be at least ${spec.min}`;
      if (spec.max !== undefined && (value as number) > spec.max) return `"${name}" must be at most ${spec.max}`;
      return null;
    case 'fraction': {
      if (typeof value !== 'number' || Number.isNaN(value)) return `"${name}" must be a number`;
      const withinMax = spec.inclusiveMax ? value <= 1 : value < 1;
      return value > 0 && withinMax ? null : `"${name}" must be greater than 0 and ${spec.inclusiveMax ? 'at most' : 'less than'} 1`;
    }
    case 'types':
      if (!Array.isArray(value) || value.length === 0) return `"${name}" must be a non-empty array`;
      return value.every((t) => TRANSACTION_TYPES.includes(t)) ? null : `"${name}" may only contain ${TRANSACTION_TYPES.join(', ')}`;
  }
}
