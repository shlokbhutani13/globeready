export class DocumentExtractionError extends Error {
  constructor(code, safeMessage, { retryable = false, status = 422 } = {}) {
    super(safeMessage);
    this.name = "DocumentExtractionError";
    this.code = code;
    this.safeMessage = safeMessage;
    this.retryable = retryable;
    this.status = status;
  }
}
