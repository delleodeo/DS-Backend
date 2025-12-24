const sanitizeHtml = require("sanitize-html");

function sanitizeMongoInput(input) {
	if (input === null || input === undefined) return input;

	// Strip ALL HTML from strings
	if (typeof input === "string") {
		return sanitizeHtml(input, {
			allowedTags: [],
			allowedAttributes: {},
		}).trim()
	}
	

	// Handle arrays
	if (Array.isArray(input)) {
		return input.map(item => sanitizeMongoInput(item));
	}

	// Handle objects (NoSQL injection protection)
	if (typeof input === "object") {
		const sanitized = {};

		for (const key in input) {
			// Block MongoDB operators and dot-notation
			if (key.startsWith("$") || key.includes(".")) continue;

			sanitized[key] = sanitizeMongoInput(input[key]);
		}

		return sanitized;
	}

	// Numbers, booleans, dates
	return input;
}

module.exports = sanitizeMongoInput;