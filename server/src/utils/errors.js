export class HttpError extends Error {
  /**
   * @param {number} status HTTP status code
   * @param {string} message Message shown to the person
   * @param {Record<string, string>} [errors] Per-field messages, keyed by field name
   */
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
