export type LogMeta = Record<string, unknown>;

function format(
  tag: string,
  level: string,
  message: string,
  meta?: LogMeta,
): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level}] [${tag}] ${message}${metaStr}`;
}

export const logger = {
  error: (tag: string, message: string, meta?: LogMeta) =>
    console.error(format(tag, "ERROR", message, meta)),
  warn: (tag: string, message: string, meta?: LogMeta) =>
    console.warn(format(tag, "WARN", message, meta)),
  info: (tag: string, message: string, meta?: LogMeta) =>
    console.info(format(tag, "INFO", message, meta)),
};
