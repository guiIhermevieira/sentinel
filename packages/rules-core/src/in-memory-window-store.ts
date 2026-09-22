import { WindowEntry, WindowStore } from './window-store';

export class InMemoryWindowStore implements WindowStore {
  private readonly data = new Map<string, Map<string, WindowEntry>>();

  constructor(
    private readonly retentionMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async record(key: string, entry: WindowEntry): Promise<void> {
    const window = this.data.get(key) ?? new Map<string, WindowEntry>();
    window.set(entry.txId, entry);
    const cutoff = this.now() - this.retentionMs;
    for (const [id, e] of window) {
      if (e.at.getTime() < cutoff) window.delete(id);
    }
    this.data.set(key, window);
  }

  async count(key: string, since: Date, until: Date): Promise<number> {
    return (await this.entries(key, since, until)).length;
  }

  async entries(key: string, since: Date, until: Date): Promise<WindowEntry[]> {
    const window = this.data.get(key);
    if (!window) return [];
    return [...window.values()]
      .filter((e) => e.at.getTime() >= since.getTime() && e.at.getTime() <= until.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }
}
