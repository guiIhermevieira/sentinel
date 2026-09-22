export interface WindowEntry {
  txId: string;
  amount: number;
  at: Date;
}

export interface WindowStore {
  record(key: string, entry: WindowEntry): Promise<void>;
  count(key: string, since: Date, until: Date): Promise<number>;
  entries(key: string, since: Date, until: Date): Promise<WindowEntry[]>;
}
