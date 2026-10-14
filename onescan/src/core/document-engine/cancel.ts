/** Set by the caller to stop a long operation between pages. */
export interface CancelSignal {
  readonly cancelled: boolean;
}

/** The user cancelled: nothing was saved and every file written so far was removed. */
export class OperationCancelled extends Error {
  constructor() {
    super('cancelled');
  }
}

export function throwIfCancelled(signal?: CancelSignal) {
  if (signal?.cancelled) throw new OperationCancelled();
}
