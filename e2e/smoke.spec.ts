import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "owner@example.com";
const password = process.env.E2E_PASSWORD ?? "preview-password-123";
/** A month far enough ahead that the run doesn't disturb a real one. */
const month = process.env.E2E_MONTH ?? "2027-03";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/schedule\//);
}

test("signed out, the app sends you to sign in; member links don't", async ({ page }) => {
  await page.goto("/members");
  await expect(page).toHaveURL(/\/login/);
  const response = await page.goto("/m/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("This link doesn't work")).toBeVisible();
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
});

test("sign in → generate → lock → publish → print → copy the weekend message", async ({ page }) => {
  await signIn(page);
  await page.goto(`/schedule/${month}`);

  // A month left published by an earlier run goes back to draft first.
  const back = page.getByRole("button", { name: "Back to draft" });
  if (await back.isVisible()) {
    await back.click();
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
  }

  const regenerate = page.getByRole("button", { name: "Regenerate unlocked" });
  if (await regenerate.isVisible()) {
    await regenerate.click();
    await page.getByRole("dialog").getByRole("button", { name: "Regenerate unlocked" }).click();
  } else {
    await page.getByRole("button", { name: "Generate" }).click();
  }
  await expect(page.getByText(/built in \d+ ms/)).toBeVisible();

  // Lock the first filled session.
  await page.locator("table button[draggable=true]").first().click();
  const lock = page.locator("#cell-lock");
  if ((await lock.getAttribute("aria-checked")) !== "true") await lock.click();
  await expect(lock).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/published/i).first()).toBeVisible();

  // The printout.
  await page.goto(`/print/${month}`);
  await expect(page.getByText("PUBLIC WITNESSING SCHEDULE", { exact: false })).toBeVisible();
  await expect(page.locator("table").first()).toBeVisible();

  // The weekend message for the first weekend of that month.
  const first = new Date(`${month}-01T00:00:00Z`);
  const friday = new Date(first.getTime() + ((5 - first.getUTCDay() + 7) % 7) * 86_400_000).toISOString().slice(0, 10);
  await page.goto(`/messages?tab=weekend&friday=${friday}`);
  await page.getByRole("button", { name: /^Copy the .+ message$/ }).first().click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Good (Morning|Afternoon|Evening) @all\nPlease find below the public witnessing schedule from \*Friday to Sunday\*/);
  expect(copied).toContain("*Partners:*");
});

test("a member's own page shows their sessions and nothing private", async ({ page }) => {
  await signIn(page);
  await page.goto("/members");
  await page.locator("main li button").first().click();
  const show = page.getByRole("button", { name: "Show link" });
  if (await show.isVisible()) await show.click();
  else await page.getByRole("button", { name: /Make link|Make a new link/ }).click();
  const url = await page.getByLabel("Private link").inputValue();
  expect(url).toMatch(/\/m\/[A-Za-z0-9_-]{43}$/);

  const member = await page.context().browser()!.newContext();
  const visit = await member.newPage();
  await visit.goto(new URL(url).pathname);
  await expect(visit.getByText("Your upcoming sessions.")).toBeVisible();
  const body = await visit.locator("body").innerText();
  expect(body).not.toMatch(/\+233|0\d{2} \d{3} \d{4}/);
  await visit.goto(`${new URL(url).pathname}/availability`);
  await expect(visit.getByText("How should we schedule you?")).toBeVisible();
  await member.close();
});
