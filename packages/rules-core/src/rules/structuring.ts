import { Rule, RuleContext, RuleHit, Transaction, TransactionType } from '../types';

export interface StructuringConfig {
  reportingThreshold: number;
  margin: number;
  windowMs: number;
  minCount: number;
  types: TransactionType[];
  weight: number;
}

export class StructuringRule implements Rule {
  readonly id = 'structuring';
  readonly stateful = true;

  constructor(private readonly cfg: StructuringConfig) {}

  async evaluate(tx: Transaction, ctx: RuleContext): Promise<RuleHit | null> {
    if (!this.cfg.types.includes(tx.type) || !this.isJustBelow(tx.amount)) return null;

    const since = new Date(tx.occurredAt.getTime() - this.cfg.windowMs);
    const perType = await Promise.all(
      this.cfg.types.map((type) => ctx.windows.entries(ctx.keys.byType(tx.customerId, type), since, tx.occurredAt)),
    );
    const justBelow = new Set(perType.flat().filter((e) => this.isJustBelow(e.amount)).map((e) => e.txId));
    justBelow.add(tx.id);

    if (justBelow.size < this.cfg.minCount) return null;
    return {
      ruleId: this.id,
      score: this.cfg.weight,
      reason: `${justBelow.size} transactions just below the reporting threshold of ${this.cfg.reportingThreshold} within the window`,
    };
  }

  private isJustBelow(amount: number): boolean {
    const floor = this.cfg.reportingThreshold * (1 - this.cfg.margin);
    return amount >= floor && amount < this.cfg.reportingThreshold;
  }
}
