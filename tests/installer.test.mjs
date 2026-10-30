import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessment,
  compareVersions,
  orderedCandidates,
  candidateChanges,
  contextKey,
  verifyRunningBuild,
} from "../src/lib/catalogue.mjs";
import { preparePlan, executePlan } from "../src/lib/plans.mjs";
import {
  nicknameValue,
  rememberDevice,
  sameSession,
} from "../src/lib/sessions.mjs";
import { fixture } from "./fixtures.mjs";

test("version order includes prerelease identifiers and same-version profiles", () => {
  for (const [a, b] of [
    ["0.10.0", "0.9.9"],
    ["0.1.0", "0.1.0-rc.10"],
    ["0.1.0-rc.10", "0.1.0-rc.2"],
    ["0.1.0-rc.a", "0.1.0-rc.999"],
  ])
    assert.equal(compareVersions(a, b), 1);
  assert.equal(compareVersions("0.1.0+one", "0.1.0+two"), 0);
  const { entry, catalogue, device } = fixture();
  device.firmware.build_id = "sha256:" + "f".repeat(64);
  assert.equal(
    candidateChanges(entry, device).direction,
    "Change firmware profile",
  );
  const old = structuredClone(entry);
  old.release.version = "0.0.9";
  old.id = "older";
  catalogue.candidates.push(old);
  assert.deepEqual(
    orderedCandidates(catalogue).map((e) => e.id),
    [entry.id, "older"],
  );
  assert.equal(candidateChanges(old, device).direction, "Downgrade");
});
test("policy, feature, geometry, identity and tooling checks fail closed", () => {
  const { catalogue, entry, context } = fixture();
  assert.equal(
    assessment(catalogue, entry, context).state,
    "clean_local_install",
  );
  const variants = [
    ["audio requirement", (c) => (c.features = ["audio_subscriptions"])],
    ["reported variant", (c) => (c.device.hardware.variant = "unregistered")],
    ["wrong model", (c) => (c.board.id = "pico")],
    ["unconfirmed", (c) => (c.confirmedModel = false)],
    ["wrong port", (c) => (c.probe.controller_id = "esp32-123456789abc")],
    ["wrong flash", (c) => (c.probe.flash_bytes /= 2)],
    ["missing probe", (c) => (c.probe = null)],
    ["required feature", (c) => (c.features = ["mqtt"])],
    ["bad chip revision", (c) => (c.probe.chip_revision = 100)],
  ];
  for (const [label, mutate] of variants) {
    const c = structuredClone(context);
    mutate(c);
    assert.notEqual(
      assessment(catalogue, entry, c).state,
      "clean_local_install",
      label,
    );
  }
  entry.policy.accepted_methods = [];
  assert.equal(
    assessment(catalogue, entry, context).state,
    "acceptance_required",
  );
  entry.policy.accepted_methods = ["usb-serial"];
  catalogue.tool_contracts = [];
  assert.equal(
    assessment(catalogue, entry, context).state,
    "matching_tools_required",
  );
  entry.policy.withdrawn = true;
  assert.equal(assessment(catalogue, entry, context).state, "incompatible");
});
async function prepared(f) {
  let current = contextKey(f.catalogue, f.entry, f.context, 0);
  return {
    plan: await preparePlan({
      ...f,
      epoch: 0,
      currentKey: () => current,
      refresh: async () => f.catalogue,
      url: (p) => "https://site.test/" + p,
      download: async (url, asset) => f.payloads.get(asset.name),
    }),
    key: () => current,
    invalidate: () => {
      current = "changed";
    },
  };
}
test("all parts are verified before any device write; stale review cannot write", async () => {
  const f = fixture(),
    p = await prepared(f);
  let verifies = 0,
    writes = 0;
  const driver = {
    id: f.context.probe.id,
    verify: async () => verifies++,
    write: async (parts) => {
      writes++;
      assert.equal(parts.length, 3);
    },
  };
  p.invalidate();
  await assert.rejects(
    executePlan(p.plan, {
      currentKey: p.key,
      refresh: async () => f.catalogue,
      driver,
    }),
    /stale/,
  );
  assert.equal(writes, 0);
  assert.equal(verifies, 0);
  const q = await prepared(f);
  await executePlan(q.plan, {
    currentKey: q.key,
    refresh: async () => f.catalogue,
    driver,
  });
  assert.equal(writes, 1);
  assert.equal(verifies, 1);
});
test("catalogue changes, device switches and a failed repeated probe prevent writes", async () => {
  for (const mode of ["catalogue", "identity", "during probe"]) {
    const f = fixture(),
      p = await prepared(f);
    let writes = 0;
    const driver = {
      id: f.context.probe.id,
      verify: async () => {
        if (mode === "identity") throw Error("changed port");
        if (mode === "during probe") p.invalidate();
      },
      write: async () => writes++,
    };
    await assert.rejects(
      executePlan(p.plan, {
        currentKey: p.key,
        refresh: async () =>
          mode === "catalogue" ? { id: "changed" } : f.catalogue,
        driver,
      }),
    );
    assert.equal(writes, 0);
  }
});
test("download failure or a changed context never produces a reviewed plan", async () => {
  const f = fixture();
  let key = contextKey(f.catalogue, f.entry, f.context, 0);
  await assert.rejects(
    preparePlan({
      ...f,
      epoch: 0,
      currentKey: () => key,
      refresh: async () => f.catalogue,
      url: (x) => x,
      download: async () => {
        throw Error("checksum failed");
      },
    }),
    /checksum/,
  );
  await assert.rejects(
    preparePlan({
      ...f,
      epoch: 0,
      currentKey: () => key,
      refresh: async () => f.catalogue,
      url: (x) => x,
      download: async (_, asset) => {
        key = "another boot";
        return f.payloads.get(asset.name);
      },
    }),
    /changed/,
  );
});
test("UF2 stays a download until an actual matching running description is read", async () => {
  const f = fixture({ uf2: true }),
    p = await prepared(f);
  assert.equal(
    assessment(f.catalogue, f.entry, f.context).state,
    "download_only",
  );
  const outcome = await executePlan(p.plan, {
    currentKey: p.key,
    refresh: async () => f.catalogue,
    driver: {
      write() {
        assert.fail("UF2 must not claim direct writing");
      },
    },
  });
  assert.equal(outcome.kind, "download");
  const running = {
    ...f.device,
    board: "pico",
    firmware: f.artifact.build.firmware,
  };
  assert.equal(verifyRunningBuild(running, outcome.expected), true);
  assert.throws(
    () => verifyRunningBuild({ ...running, board: "pico_w" }, outcome.expected),
    /not confirmed/,
  );
});
test("reconnect checks build, features, identity and a new boot", async () => {
  const f = fixture(),
    p = await prepared(f),
    running = {
      ...f.device,
      boot_id: "new-boot",
      firmware: f.artifact.build.firmware,
    };
  assert.equal(verifyRunningBuild(running, p.plan.expected), true);
  for (const override of [
    { controller_id: "another" },
    { boot_id: f.device.boot_id },
    { firmware: f.device.firmware },
    {
      firmware: {
        ...running.firmware,
        features_hash: "sha256:" + "f".repeat(64),
      },
    },
  ])
    assert.throws(() =>
      verifyRunningBuild({ ...running, ...override }, p.plan.expected),
    );
});
test("nicknames use UTF-8 byte limits and inventory uses hardware identity", () => {
  assert.equal(nicknameValue("  Desk  "), "Desk");
  assert.equal(nicknameValue("   "), null);
  assert.equal(nicknameValue("灯".repeat(21)).length, 21);
  assert.throws(() => nicknameValue("灯".repeat(22)));
  assert.throws(() => nicknameValue("a\n"));
  assert.throws(() => nicknameValue("\ud800"));
  const { device } = fixture();
  let rows = rememberDevice([], device);
  rows = rememberDevice(rows, { ...device, nickname: "New name" });
  assert.equal(rows.length, 1);
  rows = rememberDevice(rows, { ...device, controller_id: "another" });
  assert.equal(rows.length, 2);
  assert.equal(sameSession(device, { ...device, boot_id: "reboot" }), false);
  assert.equal(
    sameSession(
      device,
      { ...device, metadata_revision: 2 },
      { revision: true },
    ),
    false,
  );
});
