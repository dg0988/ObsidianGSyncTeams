// tweetnacl falls back to Node's crypto only when the browser's crypto is missing.
// Obsidian always has browser crypto (and GSync only verifies signatures), so this is never used.
module.exports = {};
