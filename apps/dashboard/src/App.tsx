import { useCallback, useEffect, useRef, useState } from 'react';
import { findPage } from './content/pages';
import { MenuIcon, ShieldIcon } from './icons';
import { cloneRules, DEFAULT_RULES, PlaygroundTx, RuleState } from './playground/model';
import { Playground } from './playground/Playground';
import { buildScenario } from './playground/scenarios';
import { Sidebar } from './Sidebar';

interface PlaygroundState {
  scenarioId: string;
  title: string;
  transactions: PlaygroundTx[];
  rules: RuleState[];
  modified: boolean;
}

const routeFromHash = () => findPage(window.location.hash.replace(/^#\/?/, '') || 'overview').id;

function loadScenario(id: string): PlaygroundState {
  const scenario = buildScenario(id);
  const rules = cloneRules(DEFAULT_RULES).map((r) => {
    const override = scenario.rules?.[r.ruleId];
    return override ? { ...r, config: { ...r.config, ...override } } : r;
  });
  return { scenarioId: id, title: scenario.title, transactions: scenario.transactions, rules, modified: false };
}

export function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const page = findPage(route);
  const [pg, setPg] = useState<PlaygroundState>(() => loadScenario(page.scenario ?? 'overview'));
  const titleRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    document.querySelector<HTMLButtonElement>('.sidebar-close')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.title = `${page.title === 'Sentinel' ? 'Overview' : page.title} | Sentinel developer console`;
    if (page.scenario && page.scenario !== pg.scenarioId && !pg.modified) setPg(loadScenario(page.scenario));
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    contentRef.current?.scrollTo({ top: 0 });
    titleRef.current?.focus();
  }, [route]);

  const edit = useCallback((patch: Partial<PlaygroundState>) => setPg((s) => ({ ...s, ...patch, modified: true })), []);
  const showingThisExample = page.scenario === pg.scenarioId;

  return (
    <div className="layout">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <a className="brand" href="#/overview">
          <ShieldIcon className="brand-mark" />
          <span className="brand-name">Sentinel</span>
        </a>
        <button className="button" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen} aria-controls="sidebar">
          <MenuIcon /> Menu
        </button>
      </header>
      <Sidebar current={route} open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="main-column">
        <main className="content" id="main" ref={contentRef}>
          <article className="article">
            <h1 ref={titleRef} tabIndex={-1}>{page.title}</h1>
            <p className="lead">{page.lead}</p>
            {page.scenario && (
              <div className="example-note">
                {showingThisExample ? (
                  <p>
                    The playground is showing this page's example: <strong>{pg.title}</strong>.
                    {pg.modified ? ' You have edited it.' : ' Edit anything to explore.'}
                  </p>
                ) : (
                  <>
                    <p>Your playground has your own changes, so this page's example hasn't replaced them.</p>
                    <button className="button button-primary" onClick={() => setPg(loadScenario(page.scenario!))}>
                      Load this example
                    </button>
                  </>
                )}
              </div>
            )}
            {page.body}
          </article>
        </main>
        <Playground
          scenarioTitle={pg.title}
          modified={pg.modified}
          transactions={pg.transactions}
          rules={pg.rules}
          focusRule={page.focusRule}
          preferredTab={page.id === 'tuning' ? 'rules' : 'transactions'}
          onTransactions={(transactions) => edit({ transactions })}
          onRules={(rules) => edit({ rules })}
          onReset={() => setPg(loadScenario(pg.scenarioId))}
        />
      </div>
    </div>
  );
}
