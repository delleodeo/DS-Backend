const util = require('util');

function timestamp() {
  return new Date().toISOString();
}

function formatMessage(level, msg, meta) {
  let base = `[${timestamp()}] [${level.toUpperCase()}] ${msg}`;
  if (meta) {
    try {
      base += ` ${typeof meta === 'string' ? meta : util.inspect(meta, { depth: 2 })}`;
    } catch (e) {
      base += ` ${String(meta)}`;
    }
  }
  return base;
}

module.exports = {
  debug: (msg, meta) => console.debug(formatMessage('debug', msg, meta)),
  info: (msg, meta) => console.log(formatMessage('info', msg, meta)),
  warn: (msg, meta) => console.warn(formatMessage('warn', msg, meta)),
  error: (msg, meta) => console.error(formatMessage('error', msg, meta)),
};