const sanitizeHtml = require("sanitize-html");

function sanitizeMongoInput(input) {
	if (input === null || input === undefined) return input;

	// Strip ALL HTML from strings but preserve script/style inner text
	if (typeof input === "string") {
		// Preserve inner text from <script> and <style> tags (test expectations rely on this)
		let preprocessed = input.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, '$1');
		preprocessed = preprocessed.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, '$1');
		return sanitizeHtml(preprocessed, {
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