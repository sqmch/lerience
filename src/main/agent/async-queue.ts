/** A single-consumer async queue used at both sides of the SDK stream. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly buffered: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private closed = false;

  push(value: T): boolean {
    if (this.closed) return false;

    const waiter = this.waiters.shift();
    if (waiter === undefined) this.buffered.push(value);
    else waiter({ done: false, value });
    return true;
  }

  end(): void {
    if (this.closed) return;
    this.closed = true;

    for (const waiter of this.waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.buffered.shift();
        if (value !== undefined) return Promise.resolve({ done: false, value });
        if (this.closed) return Promise.resolve({ done: true, value: undefined });

        return new Promise<IteratorResult<T>>((resolve) => this.waiters.push(resolve));
      },
    };
  }
}
