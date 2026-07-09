export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function sanitizeError(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replace(/(https?:\/\/)[^/@\s]+@/g, "$1[redacted]@")
    .replace(/([?&][^=&\s]*(?:token|key|password|secret)[^=&\s]*=)[^&\s]+/gi, "$1[redacted]");
}
