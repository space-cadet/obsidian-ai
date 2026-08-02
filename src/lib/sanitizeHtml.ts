/**
 * Sanitizes text before passing to MarkdownRenderer.render().
 *
 * Obsidian's MarkdownRenderer can execute DataviewJS, <script> tags,
 * and other embedded code. Since LLM output is untrusted, we strip:
 * - <script> ... </script>
 * - javascript: URLs
 * - on* event handlers (onclick, onerror, etc.)
 * - data:text/html URLs
 *
 * This is a defense-in-depth measure. Obsidian's sandbox provides
 * some protection, but plugins often have elevated permissions.
 */
export function sanitizeHtmlForRenderer(text: string): string {
	if (!text) return text;

	return text
		// Remove <script> tags and contents
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		// Remove javascript: URLs (href/src)
		.replace(/(href|src)\s*=\s*["']?javascript:/gi, '$1="blocked:')
		// Remove on* event handlers
		.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
		// Remove data:text/html URLs
		.replace(/(href|src)\s*=\s*["']?data:text\/html/gi, '$1="blocked:')
		// Remove iframe/object/embed tags
		.replace(/<(iframe|object|embed)[\s\S]*?<\/\1>/gi, "")
		// Remove self-closing iframe/object/embed
		.replace(/<(iframe|object|embed)[^>]*\/>/gi, "");
}
