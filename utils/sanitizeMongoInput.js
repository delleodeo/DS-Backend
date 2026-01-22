const sanitizeHtml = require("sanitize-html");

const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isPlainObject(v) {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function sanitizeMongoInput(input, opts = {}) {
  const {
    maxDepth = 30,
    maxKeys = 10_000,
    maxStringLength = 200_000,
    stripHtml = true,
  } = opts;

  let keyCount = 0;

  function walk(value, depth) {
    if (value === null || value === undefined) return value;
    if (depth > maxDepth) return value; // or throw new Error("Payload too deep")

    // Strings
    if (typeof value === "string") {
      let s = value;
      if (s.length > maxStringLength) s = s.slice(0, maxStringLength);

      if (!stripHtml) return s;

      // Keep script/style inner text as plain text (your requirement)
      s = s.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "$1");
      s = s.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "$1");

      // Strip all tags/attrs
      return sanitizeHtml(s, { allowedTags: [], allowedAttributes: {} }).trim();
    }

    // Arrays
    if (Array.isArray(value)) {
      return value.map((item) => walk(item, depth + 1));
    }

    // Preserve special objects
    if (value instanceof Date) return value;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof RegExp) return value;

    // Plain objects only
    if (isPlainObject(value)) {
      const out = {};
      const keys = Object.keys(value);

      for (const key of keys) {
        keyCount++;
        if (keyCount > maxKeys) break; // or throw new Error("Too many keys")

        if (BLOCKED_KEYS.has(key)) continue;
        if (key[0] === "$") continue;
        if (key.includes(".")) continue;

        out[key] = walk(value[key], depth + 1);
      }

      return out;
    }

    // Numbers, booleans, etc + non-plain objects
    return value;
  }

  return walk(input, 0);
}

module.exports = sanitizeMongoInput;
