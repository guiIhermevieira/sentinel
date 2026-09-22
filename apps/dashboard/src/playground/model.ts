import type { TransactionType } from '@sentinel-aml/rules-core';

export interface PlaygroundTx {
  key: string;
  id: string;
  customerId: string;
  type: TransactionType;
  amountCents: number;
  minute: number;
  accountAgeHours?: number;
}

export interface RuleState {
  ruleId: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  title: string;
  transactions: PlaygroundTx[];
  rules?: Partial<Record<string, Record<string, unknown>>>;
}

export const TRANSACTION_TYPES: TransactionType[] = ['deposit', 'withdrawal', 'bet', 'payout', 'transfer'];

export const DEFAULT_RULES: RuleState[] = [
  { ruleId: 'large-amount', enabled: true, config: { threshold: 5_000_000, weight: 30 } },
  { ruleId: 'velocity', enabled: true, config: { windowMs: 300_000, maxCount: 10, weight: 20 } },
  {
    ruleId: 'structuring',
    enabled: true,
    config: { reportingThreshold: 1_000_000, margin: 0.1, windowMs: 86_400_000, minCount: 3, types: ['deposit', 'transfer'], weight: 40 },
  },
  { ruleId: 'rapid-in-out', enabled: true, config: { windowMs: 1_800_000, minRatio: 0.9, minAmount: 100_000, weight: 35 } },
  { ruleId: 'new-account-high-value', enabled: true, config: { accountAgeMs: 604_800_000, threshold: 1_000_000, weight: 25 } },
];

export type FieldUnit = 'money' | 'minutes' | 'hours' | 'percent' | 'count' | 'points' | 'types';

export interface FieldMeta {
  label: string;
  unit: FieldUnit;
  help: string;
}

export const RULE_META: Record<string, { name: string; summary: string; fields: Record<string, FieldMeta> }> = {
  'large-amount': {
    name: 'Large amount',
    summary: 'A single transaction at or above a threshold.',
    fields: {
      threshold: { label: 'Threshold', unit: 'money', help: 'Transactions at or above this amount are flagged.' },
      weight: { label: 'Risk points', unit: 'points', help: 'Added to the risk score when the rule matches.' },
    },
  },
  velocity: {
    name: 'Velocity',
    summary: 'Too many transactions in a short time.',
    fields: {
      windowMs: { label: 'Time window', unit: 'minutes', help: 'How far back to count transactions.' },
      maxCount: { label: 'Maximum transactions', unit: 'count', help: 'More than this many in the window is flagged.' },
      weight: { label: 'Risk points', unit: 'points', help: 'Added to the risk score when the rule matches.' },
    },
  },
  structuring: {
    name: 'Structuring',
    summary: 'Several amounts just below a reporting threshold.',
    fields: {
      reportingThreshold: { label: 'Reporting threshold', unit: 'money', help: 'The limit people try to stay under.' },
      margin: { label: 'Just below means within', unit: 'percent', help: 'How close to the threshold an amount must be.' },
      windowMs: { label: 'Time window', unit: 'hours', help: 'How far back to look for the pattern.' },
      minCount: { label: 'Minimum transactions', unit: 'count', help: 'How many just-below amounts form the pattern.' },
      types: { label: 'Transaction types', unit: 'types', help: 'Which kinds of transactions to watch.' },
      weight: { label: 'Risk points', unit: 'points', help: 'Added to the risk score when the rule matches.' },
    },
  },
  'rapid-in-out': {
    name: 'Rapid in and out',
    summary: 'A withdrawal right after a similar deposit.',
    fields: {
      windowMs: { label: 'Time window', unit: 'minutes', help: 'How soon after the deposit a withdrawal is suspicious.' },
      minRatio: { label: 'Withdrawal is at least', unit: 'percent', help: 'Share of the deposit being taken back out.' },
      minAmount: { label: 'Ignore amounts below', unit: 'money', help: 'Small amounts are not worth flagging.' },
      weight: { label: 'Risk points', unit: 'points', help: 'Added to the risk score when the rule matches.' },
    },
  },
  'new-account-high-value': {
    name: 'New account, high value',
    summary: 'Large activity soon after an account is opened.',
    fields: {
      accountAgeMs: { label: 'Account counts as new for', unit: 'hours', help: 'Time since the account was opened.' },
      threshold: { label: 'Threshold', unit: 'money', help: 'Amounts at or above this are flagged on new accounts.' },
      weight: { label: 'Risk points', unit: 'points', help: 'Added to the risk score when the rule matches.' },
    },
  },
};

export function cloneRules(rules: RuleState[]): RuleState[] {
  return rules.map((r) => ({ ...r, config: structuredClone(r.config) }));
}

let counter = 0;
export const newKey = () => `row-${++counter}`;
export const newTxId = () => `tx-${Math.random().toString(36).slice(2, 8)}`;
