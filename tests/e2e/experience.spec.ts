import { expect, test as base, type Page } from "@playwright/test";

const NOW = new Date("2026-10-29T14:00:00Z");

const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => {
        if (!e.message.endsWith("due to access control checks.")) errors.push(e.message);
      });
      await page.clock.install({ time: NOW });
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;
const misses = (page: Page) => page.evaluate(() => [...((window as unknown as { __i18nMisses?: Set<string> }).__i18nMisses ?? [])]);

async function nav(page: Page, name: string) {
  if (isMobile(page)) await page.getByRole("button", { name: "Menüyü aç" }).click();
  await page.getByRole("navigation", { name: "Ana menü" }).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("the salon console works in Turkish", async ({ page }) => {
  await page.goto("./admin/?lang=tr");
  await expect(page.getByRole("button", { name: "Bugün" })).toBeVisible();
  await expect(page.getByText("Beklenen gelir")).toBeVisible();
  // An appointment opens with its Turkish details.
  await page.locator("[data-booking]").first().click();
  await expect(page.getByRole("dialog")).toContainText("Hizmet");
  await page.keyboard.press("Escape");
  for (const name of ["Panel", "Müşteriler", "Bekleme listesi", "Mesajlar", "Hizmetler", "Ekip", "Ayarlar"]) await nav(page, name);
  await nav(page, "Müşteriler");
  await page.getByRole("table").getByRole("button").first().click();
  await expect(page.getByText("Geçmiş")).toBeVisible();
  expect(await misses(page)).toEqual([]);
});

test("the command palette opens a client", async ({ page }) => {
  await page.goto("./admin/");
  await expect(page.getByRole("button", { name: "Today" })).toBeVisible();
  await page.getByRole("button", { name: "Search and commands" }).click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  const first = (await palette.getByRole("option").filter({ hasText: /\d{3}/ }).first().getByRole("button").textContent()) ?? "";
  const name = first.replace(/\(.*$/, "").trim();
  await palette.getByRole("combobox").fill(name);
  await palette.getByRole("combobox").press("Enter");
  await expect(page).toHaveURL(/\/admin\/clients\/\?c=/);
  await expect(page.getByText("History")).toBeVisible();
});

test("the booking site stays in English when the console is Turkish", async ({ page }) => {
  await page.goto("./admin/?lang=tr");
  await expect(page.getByRole("button", { name: "Bugün" })).toBeVisible();
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  await expect(page.getByText(/\d{1,2}:\d\d (AM|PM)/).first()).toBeVisible();
});
