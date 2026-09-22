import { Rule, RuleContext, RuleHit, Transaction } from '../types';

export interface VelocityConfig {
  windowMs: number;
  maxCount: number;
  weight: number;
}

export class VelocityRule implements Rule {
  readonly id = 'velocity';
  readonly stateful = true;

  constructor(private readonly cfg: VelocityConfig) {}

  async evaluate(tx: Transaction, ctx: RuleContext): Promise<RuleHit | null> {
    const since = new Date(tx.occurredAt.getTime() - this.cfg.windowMs);
    const count = await ctx.windows.count(ctx.keys.all(tx.customerId), since, tx.occurredAt);
    if (count <= this.cfg.maxCount) return null;
    return {
      ruleId: this.id,
      score: this.cfg.weight,
      reason: `${count} transactions in the last ${this.cfg.windowMs / 1000}s (max ${this.cfg.maxCount})`,
    };
  }
}
