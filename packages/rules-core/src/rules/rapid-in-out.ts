import { Rule, RuleContext, RuleHit, Transaction } from '../types';

export interface RapidInOutConfig {
  windowMs: number;
  minRatio: number;
  minAmount: number;
  weight: number;
}

export class RapidInOutRule implements Rule {
  readonly id = 'rapid-in-out';
  readonly stateful = true;

  constructor(private readonly cfg: RapidInOutConfig) {}

  async evaluate(tx: Transaction, ctx: RuleContext): Promise<RuleHit | null> {
    if (tx.type !== 'withdrawal' || tx.amount < this.cfg.minAmount) return null;

    const since = new Date(tx.occurredAt.getTime() - this.cfg.windowMs);
    const deposits = await ctx.windows.entries(ctx.keys.byType(tx.customerId, 'deposit'), since, tx.occurredAt);
    const match = deposits.find((d) => d.amount >= this.cfg.minAmount && tx.amount >= d.amount * this.cfg.minRatio);
    if (!match) return null;

    const minutes = Math.round((tx.occurredAt.getTime() - match.at.getTime()) / 60_000);
    return {
      ruleId: this.id,
      score: this.cfg.weight,
      reason: `Withdrawal of ${tx.amount} ${minutes} min after a deposit of ${match.amount}`,
    };
  }
}
