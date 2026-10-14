export function cancellationError() {
  return new DOMException("Document processing was cancelled.", "AbortError");
}

export function throwIfCancelled(signal) {
  if (signal?.aborted) throw cancellationError();
}

// Settles with the work's result, or rejects as soon as the signal aborts, whichever comes first.
export function untilCancelled(work, signal) {
  if (!signal) return work;
  throwIfCancelled(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(cancellationError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}
