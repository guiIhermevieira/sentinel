import { formatClock } from '../format';
import { PlusIcon, RemoveIcon, RepeatIcon } from '../icons';
import { newKey, newTxId, PlaygroundTx, TRANSACTION_TYPES } from './model';

interface Props {
  transactions: PlaygroundTx[];
  onChange: (next: PlaygroundTx[]) => void;
  showAccountAge: boolean;
  onShowAccountAge: (show: boolean) => void;
}

export const isValidTx = (tx: PlaygroundTx) =>
  Number.isFinite(tx.amountCents) && tx.amountCents > 0 && Number.isFinite(tx.minute) && tx.minute >= 0 && tx.customerId.trim() !== '';

export function TransactionsEditor({ transactions, onChange, showAccountAge, onShowAccountAge }: Props) {
  const update = (key: string, patch: Partial<PlaygroundTx>) => onChange(transactions.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const remove = (key: string) => onChange(transactions.filter((t) => t.key !== key));
  const sendAgain = (tx: PlaygroundTx) => {
    const index = transactions.findIndex((t) => t.key === tx.key);
    const copy = { ...tx, key: newKey() };
    onChange([...transactions.slice(0, index + 1), copy, ...transactions.slice(index + 1)]);
  };
  const add = () => {
    const last = transactions[transactions.length - 1];
    onChange([
      ...transactions,
      {
        key: newKey(),
        id: newTxId(),
        customerId: last?.customerId ?? 'ana',
        type: 'deposit',
        amountCents: 100_000,
        minute: last ? last.minute + 1 : 0,
        ...(showAccountAge && { accountAgeHours: 24 }),
      },
    ]);
  };

  const w = showAccountAge
    ? { minute: 52, type: 126, amount: 84, age: 48, actions: 62 }
    : { minute: 64, type: 126, amount: 100, age: 0, actions: 62 };
  const seen = new Set<string>();
  const invalid = transactions.filter((t) => !isValidTx(t)).length;

  return (
    <div>
      {transactions.length === 0 ? (
        <div className="empty">
          <p>No transactions yet. Add one to see how the rules respond.</p>
        </div>
      ) : (
        <div className="tx-scroll">
        <table className="tx-table">
          <thead>
            <tr>
              <th scope="col" style={{ width: w.minute }}>Minute</th>
              <th scope="col">Customer</th>
              <th scope="col" style={{ width: w.type }}>Type</th>
              <th scope="col" style={{ width: w.amount }}>
                <abbr title="Amount, in reais">Amount</abbr>
              </th>
              {showAccountAge && (
                <th scope="col" style={{ width: w.age }}>
                  <abbr title="Account age, in hours">Age (h)</abbr>
                </th>
              )}
              <th scope="col" style={{ width: w.actions }}><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, i) => {
              const retry = seen.has(tx.id);
              seen.add(tx.id);
              const label = `transaction ${i + 1}`;
              return (
                <tr key={tx.key}>
                  <td>
                    <input
                      type="number" min={0} step={1} value={Number.isFinite(tx.minute) ? tx.minute : ''}
                      aria-label={`Minutes after 09:00, ${label}`} aria-invalid={!(tx.minute >= 0)}
                      onChange={(e) => update(tx.key, { minute: e.target.valueAsNumber })}
                    />
                    <span className="tx-clock">{Number.isFinite(tx.minute) && tx.minute >= 0 ? formatClock(tx.minute) : 'Invalid'}</span>
                  </td>
                  <td>
                    <input
                      value={tx.customerId} aria-label={`Customer, ${label}`} aria-invalid={tx.customerId.trim() === ''}
                      onChange={(e) => update(tx.key, { customerId: e.target.value })}
                    />
                    {retry && <span className="retry-tag">Retry of {tx.id}</span>}
                  </td>
                  <td>
                    <select value={tx.type} aria-label={`Type, ${label}`} onChange={(e) => update(tx.key, { type: e.target.value as PlaygroundTx['type'] })}>
                      {TRANSACTION_TYPES.map((t) => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number" min={0.01} step={0.01} inputMode="decimal"
                      value={Number.isFinite(tx.amountCents) ? tx.amountCents / 100 : ''}
                      aria-label={`Amount in reais, ${label}`} aria-invalid={!(tx.amountCents > 0)}
                      onChange={(e) => update(tx.key, { amountCents: Math.round(e.target.valueAsNumber * 100) })}
                    />
                  </td>
                  {showAccountAge && (
                    <td>
                      <input
                        type="number" min={0} step={1} value={tx.accountAgeHours ?? ''} placeholder="?"
                        aria-label={`Account age in hours, ${label}`}
                        onChange={(e) => update(tx.key, { accountAgeHours: Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : undefined })}
                      />
                    </td>
                  )}
                  <td className="tx-actions">
                    <button className="icon-button" onClick={() => sendAgain(tx)} aria-label={`Send ${label} again`} title="Send again (retry)">
                      <RepeatIcon />
                    </button>
                    <button className="icon-button" onClick={() => remove(tx.key)} aria-label={`Remove ${label}`} title="Remove">
                      <RemoveIcon />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      {invalid > 0 && (
        <p className="inline-error" role="alert">
          {invalid === 1 ? '1 transaction is' : `${invalid} transactions are`} left out: amounts must be above zero, minutes can't be negative, and
          every transaction needs a customer.
        </p>
      )}
      <div className="editor-footer">
        <button className="button" onClick={add}>
          <PlusIcon /> Add transaction
        </button>
        <label className="checkbox">
          <input type="checkbox" checked={showAccountAge} onChange={(e) => onShowAccountAge(e.target.checked)} />
          Show account age
        </label>
      </div>
    </div>
  );
}
