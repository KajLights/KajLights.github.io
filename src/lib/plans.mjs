import {
  verifiedPayload,
  decodeUf2,
} from "../../.deps/lightvm/shared/device-core/web/firmware.mjs";
import { assessment, contextKey } from "./catalogue.mjs";
export async function preparePlan({
  catalogue,
  entry,
  context,
  epoch,
  currentKey,
  refresh,
  url,
  download = (url, asset) =>
    verifiedPayload(url, asset, (resource, options) =>
      fetch(resource, { ...options, signal: AbortSignal.timeout(60000) }),
    ),
}) {
  const key = contextKey(catalogue, entry, context, epoch);
  const fresh = await refresh();
  if (fresh.id !== catalogue.id)
    throw Error("The catalogue changed. Review the new release information.");
  const result = assessment(fresh, entry, context);
  if (
    !["installed", "clean_local_install", "download_only"].includes(
      result.state,
    )
  )
    throw Error(
      "This build is not ready for installation: " + result.reasons.join(", "),
    );
  const parts = [];
  for (const part of entry.artifact.installation.parts) {
    const record = entry.artifact.assets.find((a) => a.name === part.asset);
    if (!record) throw Error("A required payload is missing.");
    const bytes = await download(url(entry.assets[record.name]), record);
    if (entry.artifact.installation.uf2_family !== null)
      decodeUf2(
        bytes,
        part.offset + part.max_bytes,
        entry.artifact.installation.uf2_family,
      );
    else if (bytes.length > part.max_bytes)
      throw Error("Payload exceeds its installation region.");
    parts.push({ address: part.offset, bytes });
  }
  if (currentKey() !== key)
    throw Error(
      "The device or selection changed while preparing. Review it again.",
    );
  return {
    key,
    catalogueId: catalogue.id,
    entry,
    parts,
    probe: context.probe,
    method: context.method,
    expected: {
      controller_id:
        context.device?.controller_id ?? context.probe?.controller_id ?? null,
      product: entry.artifact.build.product,
      board: entry.artifact.build.board,
      build_id: entry.id,
      features_hash: entry.artifact.build.firmware.features_hash,
      previous_boot_id: context.device?.boot_id ?? null,
    },
  };
}
export async function executePlan(
  plan,
  { currentKey, refresh, driver, progress, onBeforeWrite = () => {} },
) {
  if (currentKey() !== plan.key)
    throw Error("The reviewed installation is stale. Prepare it again.");
  if ((await refresh()).id !== plan.catalogueId)
    throw Error("The catalogue changed after review. Prepare again.");
  if (currentKey() !== plan.key)
    throw Error("The selected device changed after review.");
  if (plan.method === "uf2")
    return {
      kind: "download",
      bytes: plan.parts[0].bytes,
      expected: plan.expected,
    };
  if (!driver || driver.id !== plan.probe?.id)
    throw Error("The checked USB device is no longer selected.");
  await driver.verify(plan.probe);
  if (currentKey() !== plan.key)
    throw Error("The reviewed device changed before writing.");
  onBeforeWrite();
  await driver.write(plan.parts, progress);
  return { kind: "written", expected: plan.expected };
}
