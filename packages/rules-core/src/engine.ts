import { EvaluateOptions, EvaluationResult, Rule, RuleContext, RuleError, RuleHit, RuleSource, Transaction, WindowKeys } from './types';
import { WindowStore } from './window-store';

export interface RulesEngineOptions {
  rules: Rule[] | RuleSource;
  windows: WindowStore;
  keyPrefix?: string;
}

export class RulesEngine {
  private readonly ctx: RuleContext;
  private readonly source: RuleSource;

  constructor(options: RulesEngineOptions) {
    const prefix = options.keyPrefix ?? 'sentinel';
    const keys: WindowKeys = {
      all: (customerId) => `${prefix}:tx:${customerId}`,
      byType: (customerId, type) => `${prefix}:${type}:${customerId}`,
    };
    this.ctx = { windows: options.windows, keys };
    const rules = options.rules;
    this.source = Array.isArray(rules) ? { current: () => rules } : rules;
  }

  rules(): Rule[] {
    return this.source.current();
  }

  async evaluate(tx: Transaction, options: EvaluateOptions = {}): Promise<EvaluationResult> {
    await this.record(tx);

    const rules = options.filter ? this.rules().filter(options.filter) : this.rules();
    const outcomes = await Promise.allSettled(rules.map((rule) => rule.evaluate(tx, this.ctx)));

    const hits: RuleHit[] = [];
    const errors: RuleError[] = [];
    outcomes.forEach((outcome, i) => {
      if (outcome.status === 'fulfilled') {
        if (outcome.value) hits.push(outcome.value);
      } else {
        const reason = outcome.reason;
        errors.push({ ruleId: rules[i]!.id, message: reason instanceof Error ? reason.message : String(reason) });
      }
    });

    return { transactionId: tx.id, hits, totalScore: hits.reduce((sum, h) => sum + h.score, 0), errors };
  }

  async record(tx: Transaction): Promise<void> {
    const entry = { txId: tx.id, amount: tx.amount, at: tx.occurredAt };
    await Promise.all([
      this.ctx.windows.record(this.ctx.keys.all(tx.customerId), entry),
      this.ctx.windows.record(this.ctx.keys.byType(tx.customerId, tx.type), entry),
    ]);
  }
}
