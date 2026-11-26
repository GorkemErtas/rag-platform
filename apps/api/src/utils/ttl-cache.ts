interface CacheOptions {
  maxEntries: number;
  maxBytes: number;
  ttlMs: number;
  now?: () => number;
}

// Lazy expiration only: no maintenance timers, sockets or background work.
export class TtlCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number; bytes: number }>();
  private pending = new Map<string, Promise<T>>();
  private storedBytes = 0;
  private generation = 0;
  private readonly now: () => number;

  constructor(private readonly options: CacheOptions) {
    if ([options.maxEntries, options.maxBytes, options.ttlMs].some((value) => !Number.isSafeInteger(value) || value < 1)) {
      throw new Error("Cache limits must be positive integers");
    }
    this.now = options.now ?? Date.now;
  }

  get size(): number { this.prune(); return this.entries.size; }
  get bytes(): number { this.prune(); return this.storedBytes; }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (entry) this.storedBytes -= entry.bytes;
    this.entries.delete(key);
  }

  private prune(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.remove(key);
  }

  get(key: string): T | undefined {
    this.prune();
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return structuredClone(entry.value);
  }

  set(key: string, value: T): void {
    this.prune();
    this.remove(key);
    const bytes = Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(value));
    if (bytes > this.options.maxBytes) return;
    while (this.entries.size >= this.options.maxEntries || this.storedBytes + bytes > this.options.maxBytes) {
      this.remove(this.entries.keys().next().value!);
    }
    this.entries.set(key, { value: structuredClone(value), expiresAt: this.now() + this.options.ttlMs, bytes });
    this.storedBytes += bytes;
  }

  clear(): void {
    this.generation += 1;
    this.entries.clear();
    this.pending.clear();
    this.storedBytes = 0;
  }

  async getOrLoad(key: string, load: () => Promise<T>, cacheable: (value: T) => boolean = () => true): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const existing = this.pending.get(key);
    if (existing) return structuredClone(await existing);
    if (this.pending.size >= this.options.maxEntries) return structuredClone(await load());
    const generation = this.generation;
    const pending = load().then((value) => {
      if (generation === this.generation && cacheable(value)) this.set(key, value);
      return value;
    });
    this.pending.set(key, pending);
    try { return structuredClone(await pending); }
    finally { if (this.pending.get(key) === pending) this.pending.delete(key); }
  }
}
