// Provider/SQL errors can contain URLs, keys, parameters and document text.
export function logFailure(context: string, _error?: unknown): void {
  console.error(context);
}
