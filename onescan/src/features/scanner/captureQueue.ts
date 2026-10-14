/**
 * Serial background queue for captured pages: the camera keeps running while pages are
 * enhanced one at a time, so only one full-resolution image is ever decoded at once
 * (10–20 page scans must not run out of memory).
 */
export class CaptureQueue {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;
  private listeners = new Set<(pending: number) => void>();

  get size() {
    return this.pending;
  }

  /** Runs `job` after every earlier job; a failing job never blocks later ones. */
  enqueue(job: () => Promise<void>): Promise<void> {
    this.pending++;
    this.emit();
    const run = this.tail.then(job).finally(() => {
      this.pending--;
      this.emit();
    });
    this.tail = run.catch(() => {});
    return run;
  }

  /** Resolves once every queued job has finished. */
  idle(): Promise<void> {
    return this.tail;
  }

  subscribe(fn: (pending: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.pending);
  }
}
