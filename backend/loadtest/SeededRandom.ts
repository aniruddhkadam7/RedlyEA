export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // Force into uint32.
    this.state = seed >>> 0 || 0x12345678;
  }

  /** xorshift32 */
  private nextU32(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  nextFloat(): number {
    // [0, 1)
    return this.nextU32() / 0x1_0000_0000;
  }

  nextInt(maxExclusive: number): number {
    const m = Math.trunc(maxExclusive);
    if (!Number.isFinite(m) || m <= 0)
      throw new Error('nextInt(maxExclusive) requires maxExclusive > 0');
    return Math.floor(this.nextFloat() * m);
  }

  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error('pick(items) requires non-empty array');
    return items[this.nextInt(items.length)];
  }

  shuffleInPlace<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(i + 1);
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
  }
}
