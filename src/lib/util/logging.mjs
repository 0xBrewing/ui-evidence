export function normalizeLogOptions(options = {}) {
  return {
    quiet: Boolean(options.quiet),
    summary: Boolean(options.summary),
    showServerLogOnFail: Boolean(options.showServerLogOnFail),
  };
}

export function createLogger(options = {}) {
  const normalized = normalizeLogOptions(options);

  return {
    options: normalized,
    detail(message) {
      if (!normalized.quiet && !normalized.summary) {
        console.log(message);
      }
    },
    info(message) {
      if (!normalized.quiet) {
        console.log(message);
      }
    },
    error(message) {
      console.error(message);
    },
    summary(message) {
      console.log(message);
    },
  };
}
