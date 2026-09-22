import { Rule, RuleHit, Transaction } from '../types';

export interface NewAccountHighValueConfig {
  accountAgeMs: number;
  threshold: number;
  weight: number;
}

export class NewAccountHighValueRule implements Rule {
  readonly id = 'new-account-high-value';

  constructor(private readonly cfg: NewAccountHighValueConfig) {}

  async evaluate(tx: Transaction): Promise<RuleHit | null> {
    if (!tx.accountCreatedAt || tx.amount < this.cfg.threshold) return null;
    const ageMs = tx.occurredAt.getTime() - tx.accountCreatedAt.getTime();
    if (ageMs < 0 || ageMs > this.cfg.accountAgeMs) return null;

    const hours = Math.round(ageMs / 3_600_000);
    return {
      ruleId: this.id,
      score: this.cfg.weight,
      reason: `Amount ${tx.amount} on an account opened ${hours}h earlier`,
    };
  }
}
