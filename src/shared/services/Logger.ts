type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogPayload = Record<string, unknown>;

const enabledLevels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

const shouldLog = (level: LogLevel): boolean => {
  return enabledLevels[level] >= enabledLevels[currentLevel];
};

const write = (level: LogLevel, message: string, payload?: LogPayload) => {
  if (!shouldLog(level)) {
    return;
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(payload ?? {}),
  };

  const serialized = JSON.stringify(logEntry);

  if (level === 'error') {
    console.error(serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
};

export const logger = {
  debug: (message: string, payload?: LogPayload) =>
    write('debug', message, payload),
  info: (message: string, payload?: LogPayload) =>
    write('info', message, payload),
  warn: (message: string, payload?: LogPayload) =>
    write('warn', message, payload),
  error: (message: string, payload?: LogPayload) =>
    write('error', message, payload),
};
