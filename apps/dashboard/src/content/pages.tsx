import type { ReactNode } from 'react';

export interface Page {
  id: string;
  group: string;
  title: string;
  lead: string;
  scenario?: string;
  focusRule?: string;
  body: ReactNode;
}

const Facts = ({ rows }: { rows: [string, ReactNode][] }) => (
  <table className="fact-table">
    <tbody>
      {rows.map(([label, value]) => (
        <tr key={label}>
          <th scope="row">{label}</th>
          <td>{value}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const PAGES: Page[] = [
  {
    id: 'overview',
    group: 'Get started',
    title: 'Sentinel',
    lead: 'Sentinel watches financial transactions for signs of money laundering and turns suspicious patterns into cases an analyst can review.',
    scenario: 'overview',
    body: (
      <>
        <p>
          Payment platforms, wallets and betting sites are required to monitor what their customers do with money. Sentinel receives every
          transaction, checks it against rules based on well-known laundering patterns, and groups anything suspicious by customer, so
          analysts investigate people, not a flood of individual alerts.
        </p>
        <h2>Try it now</h2>
        <p>
          The playground on the right is running the real Sentinel rules engine in your browser. It already holds a morning of activity from
          three customers. Two of them triggered alerts: one made an unusually large deposit, and another withdrew almost everything right
          after depositing it.
        </p>
        <p>Change an amount or a time, and the results update immediately.</p>
        <h2>Where to go next</h2>
        <ul>
          <li>
            <a href="#/how-it-works">How it works</a> explains the path from a transaction to a case.
          </li>
          <li>
            The <strong>use cases</strong> in the menu each walk through one laundering pattern with a ready-made example.
          </li>
          <li>
            <a href="#/install">Install the library</a> shows how to run the same engine in your own service.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'how-it-works',
    group: 'Get started',
    title: 'How it works',
    lead: 'Every transaction takes the same path, from the moment it arrives to the moment an analyst decides what to do about it.',
    scenario: 'overview',
    body: (
      <>
        <ol className="steps">
          <li>
            <strong>A transaction arrives.</strong> Your system sends it to Sentinel with a unique key. Sending the same transaction twice is
            safe: it is stored and evaluated only once.
          </li>
          <li>
            <strong>Every active rule checks it.</strong> Some rules look only at the transaction itself, such as its amount. Others look at the
            customer's recent history, such as how many transactions they made in the last five minutes.
          </li>
          <li>
            <strong>Matches become alerts.</strong> Each rule that matches raises an alert and adds risk points to the transaction's score.
          </li>
          <li>
            <strong>Alerts are grouped into cases.</strong> All open alerts for a customer go into a single case, whose risk score is the sum of
            its alerts. The most urgent cases rise to the top.
          </li>
          <li>
            <strong>An analyst decides.</strong> They review the case, then escalate it to compliance or dismiss it with a reason. Every decision
            is recorded permanently, with who made it.
          </li>
        </ol>
        <p>
          The playground shows steps two to four: the ledger lists each transaction and the rules it matched, and the cases section groups the
          alerts by customer.
        </p>
      </>
    ),
  },
  {
    id: 'large-amount',
    group: 'Use cases',
    title: 'Large amounts',
    lead: 'A single transaction far above what customers normally move is the simplest signal that something needs a closer look.',
    scenario: 'large-amount',
    focusRule: 'large-amount',
    body: (
      <>
        <h2>What it looks for</h2>
        <p>Any single transaction at or above a threshold, R$ 50.000 by default, regardless of the customer's history.</p>
        <h2>Why it matters</h2>
        <p>
          Large sums are where the most money can be laundered in one step, and many regulators require unusually large transactions to be
          reviewed or reported.
        </p>
        <h2>In the example</h2>
        <Facts
          rows={[
            ['R$ 72.000 deposit by bruno', 'Flagged. It is above the threshold.'],
            ['R$ 49.999,99 deposit by ana', 'Not flagged. It is below the threshold, by one centavo.'],
          ]}
        />
        <p>
          Try lowering the threshold in the playground's <strong>Rules</strong> tab to R$ 40.000, and ana's deposit is flagged too.
        </p>
      </>
    ),
  },
  {
    id: 'velocity',
    group: 'Use cases',
    title: 'Bursts of activity',
    lead: 'Many transactions in a few minutes can mean automated abuse, a stolen account, or money being cycled through the platform.',
    scenario: 'velocity',
    focusRule: 'velocity',
    body: (
      <>
        <h2>What it looks for</h2>
        <p>More than a set number of transactions by the same customer within a time window. The default is more than 10 in 5 minutes.</p>
        <h2>Why it matters</h2>
        <p>
          People rarely act that fast by hand. Bursts often come from scripts, from someone testing stolen cards, or from funds being moved
          through many small transactions to blur where they came from.
        </p>
        <h2>In the example</h2>
        <p>
          diego places 12 bets of R$ 50 in four minutes. The first 10 are within the limit. The 11th and 12th are flagged, because only then
          does the count in the window exceed 10.
        </p>
        <p>
          Each transaction is judged by what happened up to its own time, never by what came after. That is why the first bets stay clear even
          though the burst continues.
        </p>
      </>
    ),
  },
  {
    id: 'structuring',
    group: 'Use cases',
    title: 'Structuring',
    lead: 'Splitting money into amounts just under a reporting limit, so no single transaction draws attention, is one of the oldest laundering techniques.',
    scenario: 'structuring',
    focusRule: 'structuring',
    body: (
      <>
        <h2>What it looks for</h2>
        <p>
          Several deposits or transfers that each land just below a reporting threshold within a time window. By default, three or more amounts
          within 10% under R$ 10.000, within 24 hours.
        </p>
        <h2>Why it matters</h2>
        <p>
          Many countries require banks to report transactions above a fixed amount. Deliberately staying under that line, again and again, is
          itself a signal, and in many jurisdictions it is a crime.
        </p>
        <h2>In the example</h2>
        <Facts
          rows={[
            ['R$ 9.500 at 09:00', 'Just below. First in the pattern.'],
            ['R$ 10.000 at 10:30', 'At the threshold, so it would be reported normally. Not part of the pattern.'],
            ['R$ 9.800 at 13:00', 'Just below. Second in the pattern.'],
            ['R$ 9.200 transfer at 17:00', 'Just below. Third, so the pattern is complete and this one is flagged.'],
          ]}
        />
        <p>
          Try raising the margin in the <strong>Rules</strong> tab. At 15%, amounts down to R$ 8.500 count as just below.
        </p>
      </>
    ),
  },
  {
    id: 'rapid-in-out',
    group: 'Use cases',
    title: 'Rapid in and out',
    lead: 'Money that comes in and leaves almost immediately, with little real activity in between, is often passing through rather than being used.',
    scenario: 'rapid-in-out',
    focusRule: 'rapid-in-out',
    body: (
      <>
        <h2>What it looks for</h2>
        <p>
          A withdrawal of most of a recent deposit shortly after it arrived. By default, a withdrawal of at least 90% of a deposit made in the
          last 30 minutes.
        </p>
        <h2>Why it matters</h2>
        <p>
          A platform used as a pass-through lets money change hands while looking like ordinary activity. The short gap and the similar amount
          are what give it away.
        </p>
        <h2>In the example</h2>
        <Facts
          rows={[
            ['fabio deposits R$ 4.000, withdraws R$ 3.900 twelve minutes later', 'Flagged. He took out 97% of the deposit.'],
            ['gabi deposits R$ 4.000, bets, then withdraws R$ 1.000', 'Not flagged. She withdrew only a quarter, after real activity.'],
          ]}
        />
      </>
    ),
  },
  {
    id: 'new-account',
    group: 'Use cases',
    title: 'New accounts',
    lead: 'Accounts opened only to move money tend to do something big right away, before anyone has reason to look at them.',
    scenario: 'new-account',
    focusRule: 'new-account-high-value',
    body: (
      <>
        <h2>What it looks for</h2>
        <p>A high-value transaction shortly after an account is opened. By default, R$ 10.000 or more within the first 7 days.</p>
        <h2>Why it matters</h2>
        <p>
          Established customers build a history. Mule accounts, opened with borrowed or stolen identities, are used fast and then abandoned.
        </p>
        <h2>In the example</h2>
        <p>
          helio and iris each deposit R$ 15.000. helio's account is three hours old, so he is flagged. iris has had hers for a month, so the
          same deposit is fine.
        </p>
        <p>This rule needs to know when the account was opened, so it only runs when your system includes that information.</p>
      </>
    ),
  },
  {
    id: 'clean',
    group: 'Use cases',
    title: 'Ordinary activity',
    lead: 'A monitoring system is only useful if it stays quiet when nothing is wrong. Every false alert costs an analyst time.',
    scenario: 'clean',
    body: (
      <>
        <p>
          joao deposits R$ 500, places a couple of bets, collects a payout and withdraws later in the day. Nothing here resembles laundering, and
          no rule matches.
        </p>
        <h2>Keeping false alerts down</h2>
        <ul>
          <li>Tune thresholds to your customers. A limit that suits a small wallet would flood a high-value platform with alerts.</li>
          <li>Give each rule a weight that reflects how serious its signal is, so cases are ranked by real risk.</li>
          <li>Review dismissed cases regularly. A rule that is dismissed most of the time needs adjusting.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'cases',
    group: 'Concepts',
    title: 'Risk scores and cases',
    lead: 'Analysts review customers, not alerts. Sentinel groups everything suspicious about a customer into one case, ranked by risk.',
    scenario: 'cases',
    body: (
      <>
        <h2>Scores</h2>
        <p>
          Each rule has a weight, in risk points. When it matches, those points are added to the transaction's score and to the customer's case.
          A structuring pattern is worth 40 points by default, a large amount 30.
        </p>
        <h2>Cases</h2>
        <p>
          A customer has at most one open case at a time. New alerts join it, so its score grows as the evidence does. Once an analyst closes
          it, by escalating or dismissing it, the next alert opens a fresh case, so a closed investigation is never quietly changed.
        </p>
        <h2>In the example</h2>
        <p>
          kaique opens an account and deposits R$ 12.000, makes three deposits just under R$ 10.000, and then withdraws nearly all of the last
          one. Three different rules match, and they all end up in one case. lara's single large deposit is a separate, lower-risk case.
        </p>
      </>
    ),
  },
  {
    id: 'retries',
    group: 'Concepts',
    title: 'Retries and duplicates',
    lead: 'Networks fail and systems retry. Sentinel makes sure a transaction sent twice is only ever counted once.',
    scenario: 'retries',
    body: (
      <>
        <p>
          When your system doesn't get a response in time, it sends the transaction again. If both copies were counted, the customer would look
          twice as active and alerts would be doubled.
        </p>
        <h2>How Sentinel handles it</h2>
        <ul>
          <li>Each request carries a unique key. A repeated key returns the original result instead of creating a new transaction.</li>
          <li>Each transaction appears in a customer's history once, however many times it is evaluated.</li>
          <li>A rule can raise at most one alert per transaction, so a retry never adds to a case.</li>
        </ul>
        <h2>In the example</h2>
        <p>
          marina's R$ 55.000 deposit arrives twice. The second copy is marked as a retry: the rule still matches, but no new alert is raised and
          her case score stays the same.
        </p>
        <p>
          Use the <strong>Send again</strong> button on any transaction in the playground to try it yourself.
        </p>
      </>
    ),
  },
  {
    id: 'tuning',
    group: 'Concepts',
    title: 'Tuning rules',
    lead: 'Every rule has settings you can adjust to fit your customers, and changes apply within seconds, without redeploying anything.',
    scenario: 'structuring',
    focusRule: 'structuring',
    body: (
      <>
        <p>
          Open the <strong>Rules</strong> tab in the playground. Each rule can be turned off, and each setting is shown in the units you would
          use to talk about it: reais, minutes, percentages.
        </p>
        <h2>Safe changes</h2>
        <p>
          Settings are checked before they are saved, and every problem is reported at once. For example, a rule can't look further back than
          the history Sentinel keeps, which is 24 hours.
        </p>
        <p>In a real deployment, only administrators can change rules, and every change is recorded with its previous and new values.</p>
        <h2>Try it</h2>
        <p>
          Set the structuring rule's minimum to 2 transactions, and the pattern is flagged earlier. Then set its time window to 48 hours to see
          how an invalid setting is reported.
        </p>
      </>
    ),
  },
  {
    id: 'install',
    group: 'Integrate',
    title: 'Install the library',
    lead: 'The rules engine in this playground is published on npm. It has no dependencies and runs anywhere JavaScript does.',
    body: (
      <>
        <pre>
          <code>npm install @sentinel-aml/rules-core</code>
        </pre>
        <h2>Evaluate a transaction</h2>
        <pre>
          <code>{`import { createRule, InMemoryWindowStore, RulesEngine } from '@sentinel-aml/rules-core';

const engine = new RulesEngine({
  windows: new InMemoryWindowStore(24 * 60 * 60 * 1000),
  rules: [
    createRule('large-amount', { threshold: 5_000_000, weight: 30 }),
    createRule('velocity', { windowMs: 300_000, maxCount: 10, weight: 20 }),
  ],
});

const result = await engine.evaluate({
  id: 'tx-1',
  customerId: 'cust-42',
  type: 'deposit',
  amount: 7_500_000,
  currency: 'BRL',
  occurredAt: new Date(),
});`}</code>
        </pre>
        <p>Amounts are whole numbers in centavos, so R$ 75.000 is written as 7500000. This avoids rounding errors with money.</p>
        <h2>In production</h2>
        <p>
          The in-memory history is for trying things out. For a real service, keep history in Redis with{' '}
          <a href="https://www.npmjs.com/package/@sentinel-aml/store-redis">@sentinel-aml/store-redis</a>, and in a NestJS app, use{' '}
          <a href="https://www.npmjs.com/package/@sentinel-aml/nestjs">@sentinel-aml/nestjs</a>.
        </p>
      </>
    ),
  },
  {
    id: 'api',
    group: 'Integrate',
    title: 'Use the service',
    lead: 'The Sentinel service adds everything around the engine: a queue, cases, analyst workflows, an audit log and access control.',
    body: (
      <>
        <h2>Send transactions</h2>
        <pre>
          <code>{`curl -X POST https://your-sentinel/transactions \\
  -H "Authorization: Bearer $PRODUCER_KEY" \\
  -H "Idempotency-Key: 7f3c9a1e-2b4d-4e8f-9a6c-1d2e3f4a5b6c" \\
  -H "Content-Type: application/json" \\
  -d '{"externalId":"ext-001","customerId":"cust-42","type":"deposit",
       "amount":150000,"currency":"BRL","occurredAt":"2026-09-22T12:00:00Z"}'`}</code>
        </pre>
        <p>
          The response comes back immediately with the status <code>received</code>. Evaluation happens in the background.
        </p>
        <h2>Review cases</h2>
        <pre>
          <code>{`query {
  cases(status: open, limit: 10) {
    customerId riskScore alertCount
    alerts { ruleId reason transaction { amount occurredAt } }
  }
}`}</code>
        </pre>
        <p>
          Analysts use the GraphQL API to list cases by risk, see the evidence behind them, and escalate or dismiss them. Setup instructions
          are in the <a href="https://github.com/guiIhermevieira/sentinel">repository</a>.
        </p>
      </>
    ),
  },
];

export const PAGE_GROUPS = [...new Set(PAGES.map((p) => p.group))];
export const findPage = (id: string) => PAGES.find((p) => p.id === id) ?? PAGES[0]!;
