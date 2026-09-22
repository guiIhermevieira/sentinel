import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ResetIcon } from '../icons';
import { evaluatePlayground, PlaygroundResult } from './evaluate';
import { PlaygroundTx, RuleState } from './model';
import { Output } from './Output';
import { RulesEditor } from './RulesEditor';
import { isValidTx, TransactionsEditor } from './TransactionsEditor';

type Tab = 'transactions' | 'rules';

interface Props {
  scenarioTitle: string;
  modified: boolean;
  transactions: PlaygroundTx[];
  rules: RuleState[];
  focusRule?: string;
  preferredTab: Tab;
  onTransactions: (next: PlaygroundTx[]) => void;
  onRules: (next: RuleState[]) => void;
  onReset: () => void;
}

const EMPTY: PlaygroundResult = { rows: [], cases: [], ruleErrors: {}, activeRules: 0, alertCount: 0 };

export function Playground(props: Props) {
  const { transactions, rules } = props;
  const [tab, setTab] = useState<Tab>(props.preferredTab);
  const [result, setResult] = useState<PlaygroundResult>(EMPTY);
  const [showAccountAge, setShowAccountAge] = useState(false);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ transactions: null, rules: null });

  useEffect(() => setTab(props.preferredTab), [props.preferredTab, props.scenarioTitle]);
  useEffect(() => setShowAccountAge(transactions.some((t) => t.accountAgeHours !== undefined)), [props.scenarioTitle]);

  const valid = useMemo(() => transactions.filter(isValidTx), [transactions]);
  useEffect(() => {
    let cancelled = false;
    evaluatePlayground(valid, rules).then((r) => !cancelled && setResult(r));
    return () => {
      cancelled = true;
    };
  }, [valid, rules]);

  const enabled = rules.filter((r) => r.enabled).length;
  const tabs: { id: Tab; label: string; count: string }[] = [
    { id: 'transactions', label: 'Transactions', count: String(transactions.length) },
    { id: 'rules', label: 'Rules', count: `${enabled} of ${rules.length} on` },
  ];

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next: Tab = tab === 'transactions' ? 'rules' : 'transactions';
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <aside className="playground" aria-labelledby="playground-heading">
      <div className="pg-header">
        <div>
          <h2 id="playground-heading">Playground</h2>
          <p className="pg-scenario">
            {props.scenarioTitle}
            {props.modified && <span className="edited-badge">Edited</span>}
          </p>
        </div>
        <button className="button button-quiet" onClick={props.onReset} disabled={!props.modified}>
          <ResetIcon /> Reset example
        </button>
      </div>
      <div className="pg-body">
        <div className="tabs" role="tablist" aria-label="Playground inputs" onKeyDown={onTabKey}>
          {tabs.map((t) => (
            <button
              key={t.id} ref={(el) => { tabRefs.current[t.id] = el; }} role="tab" className="tab" id={`tab-${t.id}`}
              aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}
            >
              {t.label} <span className="tab-count">({t.count})</span>
            </button>
          ))}
        </div>
        <div className="tab-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'transactions' ? (
            <TransactionsEditor
              transactions={transactions} onChange={props.onTransactions}
              showAccountAge={showAccountAge} onShowAccountAge={setShowAccountAge}
            />
          ) : (
            <RulesEditor rules={rules} errors={result.ruleErrors} focusRule={props.focusRule} onChange={props.onRules} />
          )}
        </div>
        <div className="output-scroll">
          <Output result={result} skipped={transactions.length - valid.length} />
        </div>
      </div>
    </aside>
  );
}
