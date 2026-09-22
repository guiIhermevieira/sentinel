export type TransactionType = 'deposit' | 'withdrawal' | 'bet' | 'payout' | 'transfer';

export interface Transaction {
  id: string;
  customerId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  occurredAt: Date;
  accountCreatedAt?: Date;
}

export interface RuleHit {
  ruleId: string;
  score: number;
  reason: string;
}

export interface RuleContext {
  windows: import('./window-store').WindowStore;
  keys: WindowKeys;
}

export interface WindowKeys {
  all(customerId: string): string;
  byType(customerId: string, type: TransactionType): string;
}

export interface Rule {
  readonly id: string;
  readonly stateful?: boolean;
  evaluate(tx: Transaction, ctx: RuleContext): Promise<RuleHit | null>;
}

export interface RuleError {
  ruleId: string;
  message: string;
}

export interface RuleSource {
  current(): Rule[];
}

export interface EvaluateOptions {
  filter?: (rule: Rule) => boolean;
}

export interface EvaluationResult {
  transactionId: string;
  hits: RuleHit[];
  totalScore: number;
  errors: RuleError[];
}
