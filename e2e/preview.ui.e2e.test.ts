import { test, expect } from "@playwright/test";
import { createServer } from "http";
import { readFile } from "fs/promises";
import { join } from "path";

const PREVIEW_DIR = join(__dirname, "../preview-dist");

/**
 * Helper: serve preview-dist/ on an ephemeral port.
 */
async function servePreview(): Promise<{ url: string; stop: () => void }> {
	const server = createServer(async (req, res) => {
		try {
			const filePath = join(
				PREVIEW_DIR,
				req.url === "/" ? "index.html" : req.url!,
			);
			const data = await readFile(filePath);
			const ext = filePath.split(".").pop();
			const mime: Record<string, string> = {
				html: "text/html",
				css: "text/css",
				js: "application/javascript",
				map: "application/json",
			};
			res.writeHead(200, { "Content-Type": mime[ext!] || "text/plain" });
			res.end(data);
		} catch {
			res.writeHead(404);
			res.end("Not found");
		}
	});

	await new Promise<void>((resolve) =>
		server.listen(0, "127.0.0.1", resolve),
	);
	const addr = server.address();
	const port = typeof addr === "object" && addr ? addr.port : 0;
	const url = `http://127.0.0.1:${port}`;

	return {
		url,
		stop: () => server.close(),
	};
}

test.describe("Preview: mobile viewport", () => {
	let server: { url: string; stop: () => void };

	test.beforeAll(async () => {
		server = await servePreview();
	});

	test.afterAll(() => {
		server.stop();
	});

	test("loads without horizontal overflow at 375×667", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto(server.url);

		// Wait for React to mount
		await page.waitForSelector('[data-testid="chat-toolbar"]', {
			timeout: 5000,
		});

		// Verify no horizontal overflow
		const hasOverflow = await page.evaluate(() => {
			return document.documentElement.scrollWidth > window.innerWidth;
		});
		expect(hasOverflow).toBe(false);
	});

	test("transcript area is scrollable with many messages", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto(server.url);

		await page.waitForSelector('[data-testid="chat-transcript"]', {
			timeout: 5000,
		});

		const transcript = page.locator('[data-testid="chat-transcript"]');

		// Check that the transcript container has scrollable overflow
		const scrollHeight = await transcript.evaluate(
			(el: HTMLElement) => el.scrollHeight,
		);
		const clientHeight = await transcript.evaluate(
			(el: HTMLElement) => el.clientHeight,
		);

		// If there are enough messages to overflow, verify scrolling works
		if (scrollHeight > clientHeight) {
			await transcript.evaluate((el: HTMLElement) => {
				el.scrollTop = el.scrollHeight;
			});
			const scrollTop = await transcript.evaluate(
				(el: HTMLElement) => el.scrollTop,
			);
			expect(scrollTop).toBeGreaterThan(0);
		}
	});

	test("composer input is visible and usable at bottom", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto(server.url);

		await page.waitForSelector('[data-testid="chat-composer"]', {
			timeout: 5000,
		});

		const composer = page.locator('[data-testid="chat-composer"]');
		await expect(composer).toBeVisible();

		// Verify composer is in viewport (not pushed off-screen)
		const box = await composer.boundingBox();
		expect(box).not.toBeNull();
		expect(box!.y + box!.height).toBeLessThanOrEqual(667);
	});
});

test.describe("Preview: desktop viewport", () => {
	let server: { url: string; stop: () => void };

	test.beforeAll(async () => {
		server = await servePreview();
	});

	test.afterAll(() => {
		server.stop();
	});

	test("renders toolbar, transcript, and composer at 1280×720", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto(server.url);

		await page.waitForSelector('[data-testid="chat-toolbar"]', {
			timeout: 5000,
		});

		await expect(
			page.locator('[data-testid="chat-toolbar"]'),
		).toBeVisible();
		await expect(
			page.locator('[data-testid="chat-transcript"]'),
		).toBeVisible();
		await expect(
			page.locator('[data-testid="chat-composer"]'),
		).toBeVisible();
	});

	test("session picker modal opens and closes", async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto(server.url);

		await page.waitForSelector('[data-testid="chat-toolbar"]', {
			timeout: 5000,
		});

		// Click history button (🕐 icon in toolbar)
		await page.click('[data-testid="history-button"]');
		await expect(
			page.locator('[data-testid="session-picker-modal"]'),
		).toBeVisible();

		// Close modal by clicking the × button
		await page.click(".chat-modal-close");
		await expect(
			page.locator('[data-testid="session-picker-modal"]'),
		).not.toBeVisible();
	});
});
