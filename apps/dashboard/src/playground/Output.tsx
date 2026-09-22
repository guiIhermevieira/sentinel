import { formatClock, formatMoney, typeLabel } from '../format';
import { AlertIcon, CheckIcon, RepeatIcon } from '../icons';
import { PlaygroundResult } from './evaluate';
import { RULE_META } from './model';

const ruleName = (id: string) => RULE_META[id]?.name ?? id;

export function Output({ result, skipped }: { result: PlaygroundResult; skipped: number }) {
  const maxScore = Math.max(100, ...result.cases.map((c) => c.riskScore));
  const count = result.rows.length;
  const invalidRules = Object.keys(result.ruleErrors).length;

  return (
    <div className="output">
      <p className="status" role="status" aria-live="polite">
        <strong>
          {count} {count === 1 ? 'transaction' : 'transactions'} checked
        </strong>{' '}
        against {result.activeRules} {result.activeRules === 1 ? 'rule' : 'rules'}.{' '}
        {result.alertCount === 0 ? 'No alerts.' : `${result.alertCount} ${result.alertCount === 1 ? 'alert' : 'alerts'} in ${result.cases.length} ${result.cases.length === 1 ? 'case' : 'cases'}.`}
        {skipped > 0 && ` ${skipped} left out until fixed.`}
        {invalidRules > 0 && ` ${invalidRules} ${invalidRules === 1 ? 'rule needs' : 'rules need'} fixing.`}
      </p>

      <section aria-labelledby="cases-heading">
        <h3 id="cases-heading">Cases to review</h3>
        {result.cases.length === 0 ? (
          <div className="empty">
            <p>
              {invalidRules > 0
                ? 'No alerts from the rules currently running. Fix the highlighted rule settings to check with every rule.'
                : 'No customer needs review. Every transaction is clear.'}
            </p>
          </div>
        ) : (
          <ul className="case-list">
            {result.cases.map((c) => (
              <li className="case" key={c.customerId}>
                <div className="case-top">
                  <span className="case-name">{c.customerId}</span>
                  <span className="case-score">{c.riskScore} risk points</span>
                </div>
                <div className="case-meter" aria-hidden="true"><span style={{ width: `${(c.riskScore / maxScore) * 100}%` }} /></div>
                <span className="case-rules">
                  {c.alertCount} {c.alertCount === 1 ? 'alert' : 'alerts'}: {c.rules.map(ruleName).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ledger-heading">
        <h3 id="ledger-heading">Ledger</h3>
        {count === 0 ? (
          <div className="empty"><p>Add a transaction to see how each rule judges it.</p></div>
        ) : (
          <ol className="ledger">
            {result.rows.map((row) => {
              const outcome = row.retry ? 'retry' : row.newHits.length > 0 ? 'flagged' : 'clear';
              return (
                <li className="ledger-row" data-outcome={outcome} key={row.tx.key}>
                  <div className="ledger-main">
                    <span className="ledger-time">{formatClock(row.tx.minute)}</span>
                    <span className="ledger-what">
                      <span className="who">{row.tx.customerId}</span> {typeLabel(row.tx.type).toLowerCase()}
                    </span>
                    <span className="ledger-amount">{formatMoney(row.tx.amountCents)}</span>
                  </div>
                  <div className="ledger-outcome">
                    {outcome === 'clear' && <><CheckIcon /> Clear</>}
                    {outcome === 'flagged' && <><AlertIcon /> Flagged, {row.score} risk points</>}
                    {outcome === 'retry' && <><RepeatIcon /> Retry of {row.tx.id}. No new alerts.</>}
                  </div>
                  {row.hits.length > 0 && (
                    <ul className="hits">
                      {row.hits.map((hit) => (
                        <li className="hit" key={hit.ruleId}>
                          <span className="hit-score">{row.newHits.some((h) => h.ruleId === hit.ruleId) ? `+${hit.score}` : 'not added'}</span>
                          <strong>{ruleName(hit.ruleId)}.</strong> {describeHit(hit.ruleId, hit.reason)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {row.errors.length > 0 && (
                    <p className="inline-error">A rule failed on this transaction: {row.errors.map((e) => ruleName(e.ruleId)).join(', ')}.</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <details className="raw">
        <summary>Show raw engine output</summary>
        <pre>{JSON.stringify(result.rows.map((r) => ({ transactionId: r.tx.id, hits: r.hits, totalScore: r.score, errors: r.errors })), null, 2)}</pre>
      </details>
    </div>
  );
}

function describeHit(ruleId: string, reason: string): string {
  const money = (cents: string) => formatMoney(Number(cents));
  switch (ruleId) {
    case 'large-amount': {
      const m = reason.match(/threshold (\d+)/);
      return m ? `At or above ${money(m[1]!)}.` : reason;
    }
    case 'velocity': {
      const m = reason.match(/^(\d+) transactions in the last (\d+)s \(max (\d+)\)/);
      return m ? `${m[1]} transactions in ${Number(m[2]) / 60} minutes, more than the ${m[3]} allowed.` : reason;
    }
    case 'structuring': {
      const m = reason.match(/^(\d+) transactions just below the reporting threshold of (\d+)/);
      return m ? `${m[1]} amounts just under ${money(m[2]!)} within the window.` : reason;
    }
    case 'rapid-in-out': {
      const m = reason.match(/(\d+) min after a deposit of (\d+)/);
      return m ? `Withdrawn ${m[1]} minutes after a ${money(m[2]!)} deposit.` : reason;
    }
    case 'new-account-high-value': {
      const m = reason.match(/opened (\d+)h earlier/);
      return m ? `Account opened ${m[1]} hours earlier.` : reason;
    }
    default:
      return reason;
  }
}
