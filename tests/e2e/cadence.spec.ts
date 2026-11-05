import { expect, test as base, type Page } from "@playwright/test";

// The browser clock is pinned to Thursday 29 Oct 2026, 10:00 in New York, so the seeded salon and the
// free times are the same on every run. Time still moves forward from there.
const NOW = new Date("2026-10-29T14:00:00Z");

// Every test also fails on uncaught errors in the page. WebKit reports Next.js prefetches cut short by
// page.goto as "due to access control checks"; those are not app errors.
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
const noHorizontalScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
const step = (page: Page, name: string) => page.getByRole("region", { name });
const slotButton = /^\d{1,2}:\d\d (AM|PM)$/;

async function fillDetails(page: Page, name = "Dana Whitfield", email = "dana@mail.example") {
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile phone").fill("(718) 555-0177");
}

async function nav(page: Page, name: string, heading = name) {
  if (isMobile(page)) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await noHorizontalScroll(page);
}

const toast = (page: Page) => page.getByRole("status").filter({ hasText: /\w/ }).last();

test("booking page opens on services with the soonest openings", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1, name: "Book an appointment" })).toBeVisible();
  await expect(page.getByText("Soonest openings")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Men's cut .*Today, 12:45 PM/ })).toBeVisible();
  await expect(step(page, "Choose a service").getByRole("button", { name: /^Balayage/ })).toBeVisible();
  await step(page, "Choose a service").getByRole("button", { name: "Barbering" }).click();
  await expect(step(page, "Choose a service").getByRole("button", { name: /^Balayage/ })).toHaveCount(0);
  await expect(step(page, "Choose a service").getByRole("button", { name: /^Skin fade/ })).toBeVisible();
  await noHorizontalScroll(page);
});

test("a client books, reschedules and cancels an appointment", async ({ page }) => {
  await page.goto("./");
  await step(page, "Choose a service").getByRole("button", { name: /^Men's cut/ }).click();
  const pros = step(page, "Choose a professional");
  // Only people who offer the service are listed, with their next free time.
  await expect(pros.getByRole("button", { name: /^Inès Calder/ })).toHaveCount(0);
  await pros.getByRole("button", { name: /^Theo Marsh/ }).click();

  const time = step(page, "Pick a time");
  await time.getByRole("button", { name: /^Mon, Nov 2, \d+ times free/ }).click();
  await time.getByRole("button", { name: slotButton }).first().click();

  await expect(page.getByLabel("Full name")).toBeVisible();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await fillDetails(page);
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "You're booked, Dana" })).toBeVisible();
  await expect(page.getByText(/HD-[2-9A-Z]{4}/)).toBeVisible();
  await expect(page.getByText("with Theo Marsh")).toBeVisible();
  await expect(page.getByText(/Monday, November 2, \d+:\d\d (AM|PM) – /)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Add to calendar" }).click();
  expect((await download).suggestedFilename()).toMatch(/^halden-hd-[a-z0-9]{4}\.ics$/);

  await page.getByRole("link", { name: "Reschedule or cancel" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your booking" })).toBeVisible();
  await page.getByRole("button", { name: "Reschedule" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Pick a new time" })).toBeVisible();
  await page.getByRole("button", { name: /^Tue, Nov 3, \d+ times free/ }).click();
  await page.getByRole("button", { name: slotButton }).first().click();
  await page.getByRole("button", { name: /^Move to / }).click();
  await expect(toast(page)).toContainText("Moved to Tuesday, November 3");
  await expect(page.getByRole("main").getByText(/Tuesday, November 3, /)).toBeVisible();

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("dialog", { name: "Cancel this booking?" }).getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("This booking was cancelled.")).toBeVisible();
});

test("a soonest opening books in two steps and assigns a professional", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: /^Cut & finish .*Today/ }).click();
  await expect(step(page, "Choose a professional")).toContainText("Any professional");
  await fillDetails(page, "Sam Ortega", "sam@mail.example");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're booked, Sam" })).toBeVisible();
  await expect(page.getByText("assigned for you")).toBeVisible();
});

test("times inside the notice period or taken in another tab can't be booked", async ({ page, context }) => {
  await page.goto("./");
  await step(page, "Choose a service").getByRole("button", { name: /^Skin fade/ }).click();
  await step(page, "Choose a professional").getByRole("button", { name: /^Theo Marsh/ }).click();
  const time = step(page, "Pick a time");
  // It's 10:00 with two hours' notice: nothing before noon today.
  await time.getByRole("button", { name: /^Thu, Oct 29/ }).click();
  const first = await time.getByRole("button", { name: slotButton }).first().textContent();
  const [h, rest] = first!.split(":");
  expect(Number(h) % 12 + (rest.endsWith("PM") ? 12 : 0)).toBeGreaterThanOrEqual(12);
  await time.getByRole("button", { name: slotButton }).first().click();

  // Someone else grabs the same time in another tab.
  const other = await context.newPage();
  await other.clock.install({ time: NOW });
  await other.goto("./");
  await step(other, "Choose a service").getByRole("button", { name: /^Skin fade/ }).click();
  await step(other, "Choose a professional").getByRole("button", { name: /^Theo Marsh/ }).click();
  await step(other, "Pick a time").getByRole("button", { name: /^Thu, Oct 29/ }).click();
  await step(other, "Pick a time").getByRole("button", { name: first! }).click();
  await fillDetails(other, "Kim Adler", "kim@mail.example");
  await other.getByRole("button", { name: "Confirm booking" }).click();
  await expect(other.getByRole("heading", { level: 1, name: "You're booked, Kim" })).toBeVisible();
  await other.close();

  await expect(page.getByText("That time was just booked by someone else.").first()).toBeVisible();
});

test("a booking can be found by reference and email", async ({ page }) => {
  await page.goto("./manage/");
  // The page seeds the demo on its first render; wait for it before reading it.
  await page.waitForFunction(() => localStorage.getItem("cadence:state") !== null);
  const { ref, email } = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("cadence:state")!);
    const b = s.bookings.find((x: { status: string; date: string }) => x.status === "confirmed" && x.date > "2026-11-01");
    return { ref: b.ref, email: s.clients.find((c: { id: string }) => c.id === b.clientId).email };
  });
  await page.getByLabel("Booking reference").fill(ref);
  await page.getByLabel("Email").fill("wrong@mail.example");
  await page.getByRole("button", { name: "Find booking" }).click();
  await expect(page.getByText("We couldn't find a booking")).toBeVisible();
  await page.getByLabel("Email").fill(email.toUpperCase());
  await page.getByRole("button", { name: "Find booking" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your booking" })).toBeVisible();
  await expect(page.getByText(ref)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reschedule" })).toBeEnabled();
});

test("the salon calendar shows the team and opens appointments", async ({ page }) => {
  await page.goto("./admin/");
  await expect(page.getByRole("heading", { level: 1, name: "Thursday, October 29" })).toBeVisible();
  for (const name of ["Maya", "Theo", "Inès", "Ravi", "June"]) await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText("Day off")).toBeVisible(); // June doesn't work Thursdays
  await noHorizontalScroll(page);
  await page.locator("[data-booking]").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Service")).toBeVisible();
  await expect(dialog.getByText(/@mail\.example/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Friday, October 30" })).toBeVisible();
  await page.getByRole("button", { name: "Week" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "October 26 – November 1" })).toBeVisible();
  await page.getByLabel("Staff").selectOption({ label: "Theo Marsh" });
  await expect(page.getByRole("button", { name: /^Thu 29/ })).toBeVisible();
  await page.getByRole("button", { name: /^Thu 29/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Thursday, October 29" })).toBeVisible();
});

test("an online booking arrives live in the salon calendar", async ({ page, context }) => {
  await page.goto("./admin/");
  await expect(page.getByRole("heading", { level: 1, name: "Thursday, October 29" })).toBeVisible();

  const client = await context.newPage();
  await client.clock.install({ time: NOW });
  await client.goto("./");
  await client.getByRole("button", { name: /^Men's cut .*Today/ }).click();
  await fillDetails(client, "Lena Brooks", "lena@mail.example");
  await client.getByRole("button", { name: "Confirm booking" }).click();
  await expect(client.getByRole("heading", { level: 1, name: "You're booked, Lena" })).toBeVisible();

  await expect(toast(page)).toContainText("New online booking: Lena Brooks, Men's cut");
  await expect(page.locator("[data-booking]").filter({ hasText: "Lena Brooks" })).toBeVisible();
});

test("the salon adds a phone booking and reschedules it", async ({ page }) => {
  await page.goto("./admin/");
  await page.getByRole("button", { name: "New booking" }).click();
  const dialog = page.getByRole("dialog", { name: "New booking" });
  await dialog.getByLabel("Client").fill("Pat Example");
  await dialog.getByLabel("Email").fill("pat@mail.example");
  await dialog.getByLabel("Phone").fill("(718) 555-0190");
  await dialog.getByLabel("Service").selectOption({ label: "Skin fade · 45 min · $50" });
  await dialog.getByLabel("Date").fill("2026-10-30");
  const first = await dialog.getByLabel("Start time").locator("option:not([disabled])").first().getAttribute("value");
  await dialog.getByLabel("Start time").selectOption(first!);
  await dialog.getByRole("button", { name: "Create booking" }).click();
  await expect(toast(page)).toContainText("Booked Skin fade for Pat");

  await page.getByRole("button", { name: "Next day" }).click();
  await page.locator("[data-booking]").filter({ hasText: "Pat Example" }).click();
  const details = page.getByRole("dialog", { name: "Pat Example" });
  await details.getByRole("button", { name: "Reschedule" }).click();
  const options = details.getByLabel("Start time").locator("option:not([disabled])");
  await details.getByLabel("Start time").selectOption((await options.last().getAttribute("value"))!);
  await details.getByRole("button", { name: "Save new time" }).click();
  await expect(toast(page)).toContainText("Moved to");
});

test("dragging an appointment shows where it lands", async ({ page }) => {
  test.skip(isMobile(page), "Drag to move is a pointer feature; phones use Reschedule.");
  await page.goto("./admin/");
  await page.getByRole("button", { name: "Next day" }).click();
  const block = page.locator("[data-booking]").first();
  await block.scrollIntoViewIfNeeded();
  const box = (await block.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 60, { steps: 6 });
  await expect(page.locator(".border-dashed.border-2")).toBeVisible();
  await page.mouse.up();
  await expect(toast(page)).toContainText(/Moved to|already has|break|isn't working|off at that time/);
});

test("dashboard, clients, services, team and settings", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("./admin/");
  await nav(page, "Dashboard");
  await expect(page.getByText("Revenue per day")).toBeVisible();
  await expect(page.getByText("Team load")).toBeVisible();
  await expect(page.getByText("No-show rate")).toBeVisible();

  await nav(page, "Clients");
  await page.getByLabel("Search clients").fill("upton");
  await expect(page.getByRole("row").filter({ hasText: /Upton/ }).first()).toBeVisible();
  await page.getByRole("row").filter({ hasText: /Upton/ }).first().click();
  await expect(page.getByRole("dialog").getByText("History")).toBeVisible();
  await page.keyboard.press("Escape");

  await nav(page, "Services");
  await page.getByRole("button", { name: "Edit Men's cut" }).click();
  await page.getByRole("dialog").getByLabel("Price (USD)").fill("52");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(toast(page)).toContainText("Service updated");

  await nav(page, "Team");
  await page.getByRole("button", { name: "Time off" }).nth(1).click();
  const off = page.getByRole("dialog", { name: "Time off for Theo" });
  await off.getByLabel("Reason").fill("Barber expo");
  await off.getByRole("button", { name: "Add time off" }).click();
  await expect(page.getByText("Barber expo")).toBeVisible();

  await nav(page, "Settings");
  await page.getByLabel("Minimum notice").selectOption({ label: "1 day" });
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(toast(page)).toContainText("Booking rules saved");

  // The public page picks up the new price and notice period.
  await page.goto("./");
  await expect(step(page, "Choose a service").getByRole("button", { name: /^Men's cut/ })).toContainText("$52");
  await expect(page.getByRole("button", { name: /^Men's cut 45 min/ })).not.toContainText("Today");
});

test("theme toggle and demo reset", async ({ page }) => {
  await page.goto("./admin/");
  const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(!dark);
  await page.getByRole("button", { name: "Reset demo data" }).first().click();
  await page.getByRole("dialog", { name: "Reset demo data?" }).getByRole("button", { name: "Reset" }).click();
  await expect(toast(page)).toContainText("Demo data was reset.");
  await noHorizontalScroll(page);
});

test("a visit can take a second service and a full day takes a waitlist entry", async ({ page }) => {
  await page.goto("./");
  await step(page, "Choose a service").getByRole("button", { name: /^All-over color/ }).click();
  const pros = step(page, "Choose a professional");
  await pros.getByRole("group", { name: "Add a service to this visit" }).getByRole("button", { name: /^Cut & finish/ }).click();
  // Another color service is not offered as an add-on to a color.
  await expect(pros.getByRole("group", { name: "Add a service to this visit" }).getByRole("button", { name: /^Root touch-up/ })).toHaveCount(0);
  await expect(step(page, "Choose a service").getByText("All-over color + Cut & finish · 3 h · $245")).toBeVisible();
  // Only people who do both are left.
  await expect(pros.getByRole("button", { name: /^Inès Calder/ })).toHaveCount(0);
  await pros.getByRole("button", { name: /^Any professional/ }).click();

  const time = step(page, "Pick a time");
  await time.getByRole("button", { name: /waitlist open/ }).first().click();
  await time.getByRole("button", { name: "Join the waitlist" }).click();
  const dialog = page.getByRole("dialog", { name: /^Waitlist for / });
  await dialog.getByText("Afternoon (12–5)").click();
  await dialog.getByLabel("Full name").fill("Wren Abbott");
  await dialog.getByLabel("Email").fill("wren@mail.example");
  await dialog.getByLabel("Mobile phone").fill("(718) 555-0188");
  await dialog.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're on the waitlist" })).toBeVisible();
  await expect(page.getByText(/All-over color \+ Cut & finish on .*, afternoon/)).toBeVisible();

  await page.getByRole("button", { name: "Pick another day" }).click();
  await time.getByRole("button", { name: /times free/ }).first().click();
  await time.getByRole("button", { name: slotButton }).first().click();
  await fillDetails(page);
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "You're booked, Dana" })).toBeVisible();
  await expect(page.getByText("All-over color + Cut & finish", { exact: true })).toBeVisible();
  await expect(page.getByText("$245")).toBeVisible();

  await page.goto("./admin/waitlist/");
  await expect(page.getByRole("heading", { level: 1, name: "Waitlist" })).toBeVisible();
  await expect(page.getByText("Wren Abbott")).toBeVisible();
  await noHorizontalScroll(page);
  await page.goto("./admin/messages/");
  await expect(page.getByText(/You're on the waitlist: All-over color \+ Cut & finish/)).toBeVisible();
  await expect(page.getByText(/Booked: All-over color \+ Cut & finish/)).toBeVisible();
  await page.getByRole("tab", { name: /^Scheduled reminders/ }).click();
  await expect(page.getByText(/reminder of your/).first()).toBeVisible();
  await noHorizontalScroll(page);
});

test("the salon books a waitlisted client and a repeating series", async ({ page }) => {
  await page.goto("./admin/waitlist/");
  const row = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Book" }) }).first();
  await row.getByRole("button", { name: "Book" }).click();
  await expect(toast(page)).toContainText("A confirmation is in Messages.");

  await page.goto("./admin/");
  await page.getByRole("button", { name: "New booking" }).click();
  const dialog = page.getByRole("dialog", { name: "New booking" });
  await dialog.getByLabel("Client").fill("Rook Tester");
  await dialog.getByLabel("Email").fill("rook@mail.example");
  await dialog.getByLabel("Phone").fill("(718) 555-0190");
  await dialog.getByLabel("Date").fill("2026-11-04");
  await dialog.getByLabel("Start time").selectOption({ index: 1 });
  await dialog.getByLabel("Repeat").selectOption("4");
  await dialog.getByLabel("Appointments in all").selectOption("4");
  await expect(dialog.getByRole("list", { name: "Series preview" }).getByRole("listitem")).toHaveCount(4);
  await dialog.getByRole("button", { name: "Create booking" }).click();
  await expect(toast(page)).toContainText(/Booked \d appointments for Rook, every 4 weeks/);
});

test("calendar keyboard shortcuts and CSV exports", async ({ page }) => {
  test.skip(isMobile(page), "Keyboard shortcuts are for desktop.");
  await page.goto("./admin/");
  await expect(page.getByRole("heading", { level: 1, name: "Thursday, October 29" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("heading", { level: 1, name: "Friday, October 30" })).toBeVisible();
  await page.keyboard.press("t");
  await expect(page.getByRole("heading", { level: 1, name: "Thursday, October 29" })).toBeVisible();
  await page.keyboard.press("w");
  await expect(page.getByRole("button", { name: "week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("./admin/clients/");
  const clients = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await clients;
  expect(file.suggestedFilename()).toBe("halden-clients-2026-10-29.csv");
  const text = await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  expect(text.split("\r\n")[0]).toBe("﻿Name,Email,Phone,Visits,No-shows,Last visit,Client since,Notes");

  await page.goto("./admin/dashboard/");
  const bookings = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export bookings" }).click();
  expect((await bookings).suggestedFilename()).toBe("halden-bookings-2026-09-30-to-2026-11-28.csv");
});
