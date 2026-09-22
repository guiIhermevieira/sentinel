import { ChevronIcon } from '../icons';
import { DEFAULT_RULES, FieldMeta, RULE_META, RuleState, TRANSACTION_TYPES } from './model';

interface Props {
  rules: RuleState[];
  errors: Record<string, string[]>;
  focusRule?: string;
  onChange: (next: RuleState[]) => void;
}

const toDisplay = (unit: FieldMeta['unit'], raw: unknown): number => {
  const n = Number(raw);
  switch (unit) {
    case 'money': return n / 100;
    case 'minutes': return n / 60_000;
    case 'hours': return n / 3_600_000;
    case 'percent': return Math.round(n * 1000) / 10;
    default: return n;
  }
};

const fromDisplay = (unit: FieldMeta['unit'], value: number): number => {
  switch (unit) {
    case 'money': return Math.round(value * 100);
    case 'minutes': return Math.round(value * 60_000);
    case 'hours': return Math.round(value * 3_600_000);
    case 'percent': return value / 100;
    default: return value;
  }
};

const UNIT_SUFFIX: Record<string, string> = { money: 'R$', minutes: 'minutes', hours: 'hours', percent: '%', count: 'transactions', points: 'points' };

export function RulesEditor({ rules, errors, focusRule, onChange }: Props) {
  const update = (ruleId: string, patch: Partial<RuleState>) => onChange(rules.map((r) => (r.ruleId === ruleId ? { ...r, ...patch } : r)));
  const setField = (rule: RuleState, name: string, value: unknown) => update(rule.ruleId, { config: { ...rule.config, [name]: value } });
  const isDefault = JSON.stringify(rules) === JSON.stringify(DEFAULT_RULES);

  return (
    <div>
      {rules.map((rule) => {
        const meta = RULE_META[rule.ruleId]!;
        const ruleErrors = errors[rule.ruleId] ?? [];
        const id = `rule-${rule.ruleId}`;
        const fieldErrors = (label: string) => ruleErrors.filter((e) => e.startsWith(label));
        const otherErrors = ruleErrors.filter((e) => !Object.values(meta.fields).some((f) => e.startsWith(f.label)));
        return (
          <details className="rule" key={rule.ruleId} open={rule.ruleId === focusRule || ruleErrors.length > 0}>
            <summary>
              <ChevronIcon className="icon rule-chevron" />
              <span className="rule-title">
                <strong>{meta.name}</strong>
                <span>{meta.summary}</span>
              </span>
              <span className="rule-state" data-on={rule.enabled} data-invalid={ruleErrors.length > 0}>
                {ruleErrors.length > 0 ? 'Needs fixing' : rule.enabled ? 'On' : 'Off'}
              </span>
            </summary>
            <div className="rule-body">
              <label className="checkbox">
                <input type="checkbox" checked={rule.enabled} onChange={(e) => update(rule.ruleId, { enabled: e.target.checked })} />
                Use this rule
              </label>
              {Object.entries(meta.fields).map(([name, field]) => {
                const fieldId = `${id}-${name}`;
                if (field.unit === 'types') {
                  const selected = (rule.config[name] as string[]) ?? [];
                  return (
                    <fieldset className="field" key={name}>
                      <legend>{field.label}</legend>
                      <div className="type-options">
                        {TRANSACTION_TYPES.map((t) => (
                          <label className="checkbox" key={t}>
                            <input
                              type="checkbox" checked={selected.includes(t)}
                              onChange={(e) => setField(rule, name, e.target.checked ? [...selected, t] : selected.filter((s) => s !== t))}
                            />
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </label>
                        ))}
                      </div>
                      <span className="help">{field.help}</span>
                    </fieldset>
                  );
                }
                const value = toDisplay(field.unit, rule.config[name]);
                const problems = fieldErrors(field.label);
                return (
                  <div className="field" key={name}>
                    <label htmlFor={fieldId}>{field.label}</label>
                    <div className="input-unit">
                      {field.unit === 'money' && <span>R$</span>}
                      <input
                        id={fieldId} type="number" step={field.unit === 'money' ? 0.01 : field.unit === 'percent' ? 0.5 : 1}
                        value={Number.isFinite(value) ? value : ''} aria-invalid={problems.length > 0}
                        aria-describedby={`${fieldId}-help${problems.length > 0 ? ` ${fieldId}-error` : ''}`}
                        onChange={(e) => setField(rule, name, fromDisplay(field.unit, e.target.valueAsNumber))}
                      />
                      {field.unit !== 'money' && <span>{UNIT_SUFFIX[field.unit]}</span>}
                    </div>
                    {problems.length > 0 && (
                      <span className="field-error" id={`${fieldId}-error`} role="alert">{problems.join(' ')}</span>
                    )}
                    <span className="help" id={`${fieldId}-help`}>{field.help}</span>
                  </div>
                );
              })}
              {otherErrors.length > 0 && (
                <ul className="rule-errors" role="alert">
                  {otherErrors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              )}
            </div>
          </details>
        );
      })}
      <div className="editor-footer">
        <span className="help">{isDefault ? 'Using the default settings.' : 'Settings changed from the defaults.'}</span>
        <button className="button" disabled={isDefault} onClick={() => onChange(structuredClone(DEFAULT_RULES))}>
          Restore default rules
        </button>
      </div>
    </div>
  );
}
