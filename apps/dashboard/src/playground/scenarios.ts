import { newKey, PlaygroundTx, Scenario } from './model';

type Row = Omit<PlaygroundTx, 'key'>;
const rows = (list: Row[]): PlaygroundTx[] => list.map((r) => ({ ...r, key: newKey() }));
const reais = (value: number) => Math.round(value * 100);

export function buildScenario(id: string): Scenario {
  switch (id) {
    case 'overview':
      return {
        id,
        title: 'A mixed morning',
        transactions: rows([
          { id: 'tx-1001', customerId: 'ana', type: 'deposit', amountCents: reais(1_200), minute: 0 },
          { id: 'tx-1002', customerId: 'bruno', type: 'deposit', amountCents: reais(80_000), minute: 4 },
          { id: 'tx-1003', customerId: 'ana', type: 'bet', amountCents: reais(150), minute: 9 },
          { id: 'tx-1004', customerId: 'carla', type: 'deposit', amountCents: reais(4_000), minute: 15 },
          { id: 'tx-1005', customerId: 'carla', type: 'withdrawal', amountCents: reais(3_900), minute: 27 },
          { id: 'tx-1006', customerId: 'ana', type: 'payout', amountCents: reais(420), minute: 40 },
        ]),
      };
    case 'large-amount':
      return {
        id,
        title: 'One unusually large deposit',
        transactions: rows([
          { id: 'tx-2001', customerId: 'ana', type: 'deposit', amountCents: reais(800), minute: 0 },
          { id: 'tx-2002', customerId: 'bruno', type: 'deposit', amountCents: reais(72_000), minute: 6 },
          { id: 'tx-2003', customerId: 'ana', type: 'deposit', amountCents: reais(49_999.99), minute: 12 },
        ]),
      };
    case 'velocity':
      return {
        id,
        title: 'A burst of bets in four minutes',
        transactions: rows(
          Array.from({ length: 12 }, (_, i) => ({
            id: `tx-30${String(i + 1).padStart(2, '0')}`,
            customerId: 'diego',
            type: 'bet' as const,
            amountCents: reais(50),
            minute: Math.floor(i / 3),
          })),
        ),
      };
    case 'structuring':
      return {
        id,
        title: 'Deposits kept just under R$ 10.000',
        transactions: rows([
          { id: 'tx-4001', customerId: 'elena', type: 'deposit', amountCents: reais(9_500), minute: 0 },
          { id: 'tx-4002', customerId: 'elena', type: 'deposit', amountCents: reais(10_000), minute: 90 },
          { id: 'tx-4003', customerId: 'elena', type: 'deposit', amountCents: reais(9_800), minute: 240 },
          { id: 'tx-4004', customerId: 'elena', type: 'transfer', amountCents: reais(9_200), minute: 480 },
        ]),
      };
    case 'rapid-in-out':
      return {
        id,
        title: 'Money in, money straight back out',
        transactions: rows([
          { id: 'tx-5001', customerId: 'fabio', type: 'deposit', amountCents: reais(4_000), minute: 0 },
          { id: 'tx-5002', customerId: 'fabio', type: 'withdrawal', amountCents: reais(3_900), minute: 12 },
          { id: 'tx-5003', customerId: 'gabi', type: 'deposit', amountCents: reais(4_000), minute: 3 },
          { id: 'tx-5004', customerId: 'gabi', type: 'bet', amountCents: reais(600), minute: 10 },
          { id: 'tx-5005', customerId: 'gabi', type: 'withdrawal', amountCents: reais(1_000), minute: 20 },
        ]),
      };
    case 'new-account':
      return {
        id,
        title: 'Two accounts, one of them brand new',
        transactions: rows([
          { id: 'tx-6001', customerId: 'helio', type: 'deposit', amountCents: reais(15_000), minute: 0, accountAgeHours: 3 },
          { id: 'tx-6002', customerId: 'iris', type: 'deposit', amountCents: reais(15_000), minute: 5, accountAgeHours: 720 },
        ]),
      };
    case 'clean':
      return {
        id,
        title: 'An ordinary day with no alerts',
        transactions: rows([
          { id: 'tx-7001', customerId: 'joao', type: 'deposit', amountCents: reais(500), minute: 0 },
          { id: 'tx-7002', customerId: 'joao', type: 'bet', amountCents: reais(50), minute: 20 },
          { id: 'tx-7003', customerId: 'joao', type: 'bet', amountCents: reais(50), minute: 45 },
          { id: 'tx-7004', customerId: 'joao', type: 'payout', amountCents: reais(140), minute: 46 },
          { id: 'tx-7005', customerId: 'joao', type: 'withdrawal', amountCents: reais(300), minute: 300 },
        ]),
      };
    case 'cases':
      return {
        id,
        title: 'One customer, several patterns',
        transactions: rows([
          { id: 'tx-8001', customerId: 'kaique', type: 'deposit', amountCents: reais(12_000), minute: 0, accountAgeHours: 2 },
          { id: 'tx-8002', customerId: 'kaique', type: 'deposit', amountCents: reais(9_600), minute: 30 },
          { id: 'tx-8003', customerId: 'kaique', type: 'deposit', amountCents: reais(9_700), minute: 45 },
          { id: 'tx-8004', customerId: 'kaique', type: 'deposit', amountCents: reais(9_900), minute: 60 },
          { id: 'tx-8006', customerId: 'kaique', type: 'withdrawal', amountCents: reais(9_500), minute: 70 },
          { id: 'tx-8005', customerId: 'lara', type: 'deposit', amountCents: reais(60_000), minute: 15 },
        ]),
      };
    case 'retries':
      return {
        id,
        title: 'The same transaction sent twice',
        transactions: rows([
          { id: 'tx-9001', customerId: 'marina', type: 'deposit', amountCents: reais(55_000), minute: 0 },
          { id: 'tx-9001', customerId: 'marina', type: 'deposit', amountCents: reais(55_000), minute: 0 },
          { id: 'tx-9002', customerId: 'marina', type: 'bet', amountCents: reais(200), minute: 2 },
        ]),
      };
    default:
      return { id, title: 'Empty playground', transactions: [] };
  }
}
