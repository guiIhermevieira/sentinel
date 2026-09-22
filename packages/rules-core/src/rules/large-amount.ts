import { Rule, RuleHit, Transaction } from '../types';

export interface LargeAmountConfig {
  threshold: number;
  weight: number;
}

export class LargeAmountRule implements Rule {
  readonly id = 'large-amount';

  constructor(private readonly cfg: LargeAmountConfig) {}

  async evaluate(tx: Transaction): Promise<RuleHit | null> {
    if (tx.amount < this.cfg.threshold) return null;
    return {
      ruleId: this.id,
      score: this.cfg.weight,
      reason: `Amount ${tx.amount} is at or above threshold ${this.cfg.threshold}`,
    };
  }
}
