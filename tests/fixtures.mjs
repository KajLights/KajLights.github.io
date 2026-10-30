// Software test data only. Never imported by production source or the importer.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const sample = JSON.parse(
  readFileSync(
    new URL(
      "../.deps/lightvm/shared/device-core/contracts/candidate-cases.json",
      import.meta.url,
    ),
  ),
);
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export function fixture({ uf2 = false } = {}) {
  const artifact = structuredClone(sample.artifact),
    device = structuredClone(sample.device),
    payloads = new Map();
  device.limits.vm_heap_bytes = 65536;
  artifact.build.firmware.release_tag = "v0.1.0";
  if (uf2) {
    artifact.build.board = "pico";
    artifact.build.hardware = {
      ...artifact.build.hardware,
      chip: "RP2040",
      declared_flash_bytes: 2097152,
      target: "pico",
    };
    artifact.installation = {
      methods: ["uf2"],
      parts: [{ asset: "test.uf2", offset: 0x10000000, max_bytes: 1048576 }],
      flash_settings: null,
      partitions: [],
      uf2_family: 0xe48bff56,
      chip_revision: null,
    };
    artifact.assets[0].name = "test.uf2";
    const bytes = new Uint8Array(512),
      view = new DataView(bytes.buffer);
    [0x0a324655, 0x9e5d5157, 0x2000, 0x10000000, 256, 0, 1, 0xe48bff56].forEach(
      (v, i) => view.setUint32(i * 4, v, true),
    );
    view.setUint32(508, 0x0ab16f30, true);
    payloads.set("test.uf2", bytes);
  }
  for (const asset of artifact.assets) {
    const bytes =
      payloads.get(asset.name) ??
      new TextEncoder().encode("test bytes for " + asset.name);
    payloads.set(asset.name, bytes);
    asset.bytes = bytes.length;
    asset.sha256 = digest(bytes);
  }
  const entry = {
    id: artifact.build.firmware.build_id,
    repository: "KajLights/lightvm",
    release: {
      tag: "v0.1.0",
      version: "0.1.0",
      channel: "stable",
      source_revision: artifact.build.firmware.source_revision,
    },
    release_id: 1,
    published_at: "2026-10-30T12:00:00Z",
    release_url: "https://github.com/KajLights/lightvm/releases/tag/v0.1.0",
    manifest: "distribution/releases/test/release.json",
    manifest_sha256: "a".repeat(64),
    artifact,
    assets: Object.fromEntries(
      artifact.assets.map((a) => [
        a.name,
        `distribution/assets/${a.sha256}/${a.name}`,
      ]),
    ),
    policy: {
      withdrawn: false,
      reason: "",
      recommended: true,
      accepted_methods: [uf2 ? "uf2" : "usb-serial"],
    },
  };
  const catalogue = {
    schema: "kajlights.catalogue",
    format: 1,
    id: "sha256:" + "a".repeat(64),
    verified_at: "2026-10-30T12:00:00Z",
    implementation_revision: "b".repeat(40),
    lock: { path: "distribution/import-lock.json", sha256: "a".repeat(64) },
    sources: [],
    tool_contracts: [artifact.tools.contract],
    candidates: [entry],
  };
  const board = {
    id: artifact.build.board,
    chip: artifact.build.hardware.chip,
    flash_bytes: artifact.build.hardware.declared_flash_bytes,
    variant: null,
  };
  const probe = {
    id: "rom-test",
    controller_id: device.controller_id,
    chip: board.chip,
    flash_bytes: board.flash_bytes,
    chip_revision: 2,
  };
  const context = {
    product: "lightvm",
    board,
    confirmedModel: true,
    features: [],
    method: uf2 ? "uf2" : "usb-serial",
    device: uf2 ? null : device,
    probe: uf2 ? null : probe,
  };
  return { artifact, entry, catalogue, device, context, payloads };
}
