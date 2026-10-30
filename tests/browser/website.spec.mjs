import { test, expect } from "@playwright/test";
import { fixture } from "../fixtures.mjs";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const base = process.env.BASE_PATH || "/";
const relative = (path) => path.replace(/^\//, "");
const errors = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
});
test.afterEach(() => expect(errors).toEqual([]));
test("public pages and honest empty catalogue work on desktop and mobile", async ({
  page,
}) => {
  await page.route("**/catalogue.json", (route) =>
    route.fulfill({ json: { ...fixture().catalogue, candidates: [] } }),
  );
  await page.goto("");
  await expect(
    page.getByRole("heading", { name: "Small lights. Big ideas." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Releases", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "No published firmware yet." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open My devices" }).click();
  await expect(
    page.getByRole("heading", { name: "Your devices." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("");
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const route of ["hardware/", "install/", "about/"]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
test("malformed catalogue disables installation and never falls back to artifacts", async ({
  page,
}) => {
  await page.route("**/catalogue.json", (route) =>
    route.fulfill({ json: { format: 999 } }),
  );
  await page.goto("studio/#/firmware");
  await expect(page.getByRole("alert")).toContainText("catalogue is invalid");
  await expect(
    page.getByRole("button", { name: "Erase and install" }),
  ).toHaveCount(0);
});
test("UF2 requires board confirmation, review and actual matching reconnect", async ({
  page,
}) => {
  const f = fixture({ uf2: true });
  await page.route("**/catalogue.json", (route) =>
    route.fulfill({ json: f.catalogue }),
  );
  for (const asset of f.artifact.assets) {
    await page.route("**/" + relative(f.entry.assets[asset.name]), (route) =>
      route.fulfill({ body: Buffer.from(f.payloads.get(asset.name)) }),
    );
  }
  await page.goto("studio/#/firmware");
  await page.getByLabel("Board model", { exact: true }).selectOption("pico");
  await page.getByRole("button", { name: "Select this build" }).click();
  const prepare = page.getByRole("button", {
    name: "Download and check firmware files",
  });
  await expect(prepare).toBeDisabled();
  await page.getByLabel("I checked the physical board model:").check();
  await expect(prepare).toBeEnabled();
  await prepare.click();
  const install = page.getByRole("button", { name: "Download verified UF2" });
  await expect(install).toBeDisabled();
  await page.getByLabel("I understand this is a clean installation.").check();
  const downloading = page.waitForEvent("download");
  await install.click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toBe("test.uf2");
  await expect(
    page.getByText("Installation awaiting confirmation", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".success[role=status]")).toContainText(
    "File downloaded",
  );
  await expect(
    page.getByText("Running build confirmed", { exact: false }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/uf2-awaiting-reconnect.png",
    fullPage: true,
  });
});
test("catalogue changes invalidate a reviewed installation", async ({
  page,
}) => {
  const f = fixture({ uf2: true });
  let snapshot = f.catalogue;
  await page.route("**/catalogue.json", (route) =>
    route.fulfill({ json: snapshot }),
  );
  for (const a of f.artifact.assets)
    await page.route("**/" + f.entry.assets[a.name], (route) =>
      route.fulfill({ body: Buffer.from(f.payloads.get(a.name)) }),
    );
  await page.goto("studio/#/firmware");
  await page.getByLabel("Board model", { exact: true }).selectOption("pico");
  await page.getByLabel("I checked the physical board model:").check();
  await page.getByRole("button", { name: "Select this build" }).click();
  await page
    .getByRole("button", { name: "Download and check firmware files" })
    .click();
  await page.getByLabel("I understand this is a clean installation.").check();
  snapshot = { ...f.catalogue, id: "sha256:" + "c".repeat(64) };
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.getByRole("button", { name: "Download verified UF2" }).click();
  await expect(page.getByRole("alert")).toContainText("catalogue changed");
  expect(downloads).toBe(0);
  await expect(
    page.getByText("Installation awaiting confirmation", { exact: true }),
  ).toHaveCount(0);
});
test("ESP review calls only the checked driver after an explicit erase acknowledgement", async ({
  page,
}) => {
  const f = fixture();
  await page.addInitScript(() => {
    const serial = new EventTarget();
    serial.requestPort = async () => ({});
    Object.defineProperty(navigator, "serial", { value: serial });
    window.testWrites = 0;
    window.testVerifies = 0;
  });
  await page.route("**/catalogue.json", (route) =>
    route.fulfill({ json: f.catalogue }),
  );
  for (const a of f.artifact.assets)
    await page.route("**/" + f.entry.assets[a.name], (route) =>
      route.fulfill({ body: Buffer.from(f.payloads.get(a.name)) }),
    );
  // Replace the lazy adapter module only in this test. Production has no hook.
  await page.route(/\/_astro\/esp\.[^/]+\.js$/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `export async function probeEsp(){const probe=${JSON.stringify(f.context.probe)};return{id:probe.id,probe,verify:async()=>{window.testVerifies++},write:async()=>{window.testWrites++},close:async()=>{}}}`,
    }),
  );
  await page.goto("studio/#/firmware");
  await page
    .getByLabel("Board model", { exact: true })
    .selectOption("xiao_esp32s3");
  await page.getByLabel("I checked the physical board model:").check();
  await page.getByRole("button", { name: "Select this build" }).click();
  const prepare = page.getByRole("button", {
    name: "Download and check firmware files",
  });
  await expect(prepare).toBeDisabled();
  await page
    .getByRole("button", { name: "Check USB hardware", exact: true })
    .click();
  await expect(prepare).toBeEnabled();
  await prepare.click();
  const erase = page.getByRole("button", {
    name: "Erase and install on checked USB device",
  });
  await expect(erase).toBeDisabled();
  expect(await page.evaluate(() => window.testWrites)).toBe(0);
  await page.getByLabel("I understand this is a clean installation.").check();
  await erase.click();
  await expect(page.locator(".success[role=status]")).toContainText(
    "Reconnect to confirm",
  );
  expect(
    await page.evaluate(() => [window.testWrites, window.testVerifies]),
  ).toEqual([1, 1]);
  await expect(
    page.getByText("Installation awaiting confirmation", { exact: true }),
  ).toBeVisible();
});
test.describe("real shared device protocol", () => {
  let device, directory, url;
  test.beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), "kajlights-device-"));
    device = spawn(
      process.env.LIGHTVM_RECEIVER || "build/test-device/lightvm",
      ["--http", "0", "--storage", path.join(directory, "store.bin")],
    );
    url = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(Error(output || "Device did not start")),
        10000,
      );
      device.once("error", reject);
      device.stderr.on("data", (bytes) => {
        output += bytes;
        const match = /http:\/\/\S+/.exec(output);
        if (match) {
          clearTimeout(timer);
          resolve(match[0]);
        }
      });
    });
  });
  test.afterAll(() => {
    device?.kill();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });
  async function connect(page, browser) {
    const cdp = await browser.newBrowserCDPSession(),
      session = await page.context().newCDPSession(page),
      { targetInfo } = await session.send("Target.getTargetInfo");
    await session.detach();
    await cdp.send("Browser.grantPermissions", {
      origin: "http://127.0.0.1:4322",
      browserContextId: targetInfo.browserContextId,
      permissions: ["localNetwork", "loopbackNetwork", "localNetworkAccess"],
    });
    await cdp.detach();
    await page.goto("studio/#/devices");
    await page
      .getByText("Connect over the local network", { exact: true })
      .click();
    await page.getByLabel("Device HTTP origin").fill(url);
    await page.getByRole("button", { name: "Connect over network" }).click();
    await expect(page.getByLabel("Nickname", { exact: true })).toBeEnabled();
  }
  test("connects, preserves drafts between views, renames and exports from actual firmware", async ({
    page,
    browser,
  }) => {
    await connect(page, browser);
    await page.getByLabel("Nickname", { exact: true }).fill("Kitchen lights");
    await page.getByRole("link", { name: "Firmware", exact: true }).click();
    await page
      .getByRole("link", { name: "My devices", exact: true })
      .last()
      .click();
    await expect(page.getByLabel("Nickname", { exact: true })).toHaveValue(
      "Kitchen lights",
    );
    await page.getByRole("button", { name: "Save nickname" }).click();
    await expect(page.locator(".success[role=status]")).toContainText(
      "Nickname saved",
    );
    await expect(page.locator(".device-banner")).toContainText(
      "Kitchen lights",
    );
    const exporting = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export settings" }).click();
    expect((await exporting).suggestedFilename()).toMatch(/settings.json$/);
    await page.screenshot({
      path: "test-results/connected-device.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await expect(page.locator(".device-banner")).toContainText("Disconnected");
    await expect(
      page.getByRole("button", { name: "Save nickname" }),
    ).toBeDisabled();
    await page.reload();
    await expect(page.locator(".inventory")).toContainText("Kitchen lights");
  });
  test("concurrent metadata changes reject an old nickname revision", async ({
    page,
    browser,
  }) => {
    await connect(page, browser);
    await page.getByLabel("Nickname", { exact: true }).fill("Stale edit");
    execFileSync(process.env.LIGHTVM_PYTHON || "python3", [
      "-c",
      "import sys;sys.path.insert(0,'.deps/lightvm/tools');from client import Client,HttpTransport;c=Client(HttpTransport(sys.argv[1]));c.set_device_nickname('Changed elsewhere');c.close()",
      url,
    ]);
    await page.getByRole("button", { name: "Save nickname" }).click();
    await expect(page.getByRole("alert")).toContainText("revision changed");
    await expect(page.getByLabel("Nickname", { exact: true })).toHaveValue(
      "Stale edit",
    );
    await page.getByRole("button", { name: "Discard edit" }).click();
  });
});
