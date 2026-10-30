import { assessCandidate } from "../../.deps/lightvm/shared/device-core/web/firmware.mjs";

export const reasonText = {
  wrong_product: "This firmware is for another product.",
  wrong_board: "This firmware is for another board model.",
  wrong_variant: "The hardware variant does not match.",
  wrong_chip: "The processor does not match.",
  missing_features:
    "This build does not include all the features you selected.",
  unsupported_method: "This installation method is unavailable for this build.",
  device_identity_required: "Connect or identify the device first.",
  physical_flash_probe_required:
    "Check the physical chip and flash size over USB first.",
  wrong_flash_geometry: "The measured flash size does not match this build.",
  chip_revision_probe_required: "The chip revision needs a USB check.",
  wrong_chip_revision:
    "This chip revision is outside the firmware’s supported range.",
  tool_contract_unavailable:
    "Matching product tools have not been approved for this website.",
  export_and_clean_install_required:
    "Export what you need first. Installation erases saved programs, settings and the nickname.",
  withdrawn: "This build has been withdrawn.",
  acceptance_required:
    "This build has not yet been accepted for this installation method.",
  identify_model: "Confirm the exact model printed on your board.",
  catalogue_changed: "The release catalogue changed. Review this choice again.",
};
export function compareVersions(a, b) {
  const parse = (v) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?(?:\+.+)?$/.exec(v);
    if (!match) throw Error("Invalid release version");
    return { core: match.slice(1, 4).map(BigInt), pre: match[4]?.split(".") };
  };
  const left = parse(a),
    right = parse(b);
  for (let i = 0; i < 3; i++)
    if (left.core[i] !== right.core[i])
      return left.core[i] > right.core[i] ? 1 : -1;
  if (!left.pre || !right.pre) return left.pre ? -1 : right.pre ? 1 : 0;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i],
      y = right.pre[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x),
      ny = /^\d+$/.test(y);
    if (nx && ny) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (nx !== ny) return nx ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}
/** @param {any} catalogue @param {{product?:string,board?:string,prereleases?:boolean,withdrawn?:boolean,features?:string[]}} options */
export function orderedCandidates(
  catalogue,
  {
    product,
    board,
    prereleases = false,
    withdrawn = false,
    features = [],
  } = {},
) {
  return catalogue.candidates
    .filter(
      (entry) =>
        (!product || entry.artifact.build.product === product) &&
        (!board || entry.artifact.build.board === board) &&
        (prereleases || entry.release.channel === "stable") &&
        (withdrawn || !entry.policy.withdrawn) &&
        features.every((f) => entry.artifact.build.features.includes(f)),
    )
    .sort(
      (a, b) =>
        compareVersions(b.release.version, a.release.version) ||
        (a.artifact.build.firmware.profile === "standard" ? -1 : 1) -
          (b.artifact.build.firmware.profile === "standard" ? -1 : 1) ||
        a.id.localeCompare(b.id),
    );
}
export function assessment(catalogue, entry, context) {
  if (entry.policy.withdrawn)
    return { state: "incompatible", reasons: ["withdrawn"] };
  const artifact = entry.artifact,
    build = artifact.build,
    board = context.board;
  if (!board || !context.confirmedModel)
    return { state: "cannot_assess", reasons: ["identify_model"] };
  const reasons = [];
  if (build.product !== context.product) reasons.push("wrong_product");
  if (build.board !== board.id) reasons.push("wrong_board");
  if ((build.hardware.variant ?? null) !== (board.variant ?? null))
    reasons.push("wrong_variant");
  if (
    context.device &&
    (context.device.hardware.variant ?? null) !==
      (build.hardware.variant ?? null)
  )
    reasons.push("wrong_variant");
  if (!context.features.every((f) => build.features.includes(f)))
    reasons.push("missing_features");
  if (!artifact.installation.methods.includes(context.method))
    reasons.push("unsupported_method");
  if (reasons.length) return { state: "incompatible", reasons };
  if (!entry.policy.accepted_methods.includes(context.method))
    return { state: "acceptance_required", reasons: ["acceptance_required"] };
  if (!catalogue.tool_contracts.includes(artifact.tools.contract))
    return {
      state: "matching_tools_required",
      reasons: ["tool_contract_unavailable"],
    };
  if (context.method === "uf2") {
    if (
      build.hardware.chip !== board.chip ||
      build.hardware.declared_flash_bytes !== board.flash_bytes
    )
      return { state: "incompatible", reasons: ["wrong_flash_geometry"] };
    if (
      context.device &&
      (context.device.product !== build.product ||
        context.device.board !== board.id)
    )
      return { state: "incompatible", reasons: ["wrong_board"] };
    return {
      state: "download_only",
      reasons: ["export_and_clean_install_required"],
    };
  }
  if (!context.probe)
    return {
      state: "cannot_assess",
      reasons: ["physical_flash_probe_required"],
    };
  if (
    context.device &&
    context.probe.controller_id !== context.device.controller_id
  )
    return { state: "incompatible", reasons: ["device_identity_required"] };
  const device = {
    ...(context.device ?? {}),
    product: context.product,
    board: board.id,
    controller_id: context.probe.controller_id,
    boot_id: context.probe.id,
    hardware: {
      variant: board.variant ?? null,
      chip: context.probe.chip,
      flash_verified: true,
      flash_bytes: context.probe.flash_bytes,
      chip_revision: context.probe.chip_revision,
    },
  };
  return assessCandidate(
    device,
    artifact,
    context.features,
    context.method,
    catalogue.tool_contracts,
  );
}
export function candidateChanges(entry, device) {
  if (!device)
    return {
      direction: "New installation",
      removed: [],
      added: entry.artifact.build.features,
    };
  const compared = compareVersions(entry.release.version, device.version);
  return {
    direction:
      entry.id === device.firmware.build_id
        ? "Reinstall"
        : compared < 0
          ? "Downgrade"
          : compared > 0
            ? "Upgrade"
            : "Change firmware profile",
    removed: device.features.filter(
      (f) => !entry.artifact.build.features.includes(f),
    ),
    added: entry.artifact.build.features.filter(
      (f) => !device.features.includes(f),
    ),
  };
}
export function contextKey(catalogue, entry, context, epoch) {
  return JSON.stringify([
    catalogue.id,
    entry.id,
    epoch,
    context.product,
    context.board?.id,
    context.method,
    [...context.features].sort(),
    context.confirmedModel,
    context.device?.controller_id,
    context.device?.boot_id,
    context.device?.metadata_revision,
    context.probe?.id,
    context.probe?.controller_id,
    context.probe?.flash_bytes,
  ]);
}
export function verifyRunningBuild(description, expected) {
  if (
    (expected.controller_id &&
      description.controller_id !== expected.controller_id) ||
    description.product !== expected.product ||
    description.board !== expected.board ||
    description.firmware.build_id !== expected.build_id ||
    description.firmware.features_hash !== expected.features_hash ||
    (expected.previous_boot_id &&
      description.boot_id === expected.previous_boot_id)
  )
    throw Error(
      "The connected device does not match the selected running build. Installation is not confirmed.",
    );
  return true;
}
export const shortId = (id) => id?.slice(-8) ?? "unknown";
export const deviceLabel = (d) =>
  `${d.nickname || d.product} · ${d.board} · …${shortId(d.controller_id)}`;
export const bytesLabel = (n) =>
  n === null || n === undefined
    ? "Measured when running"
    : n >= 1048576
      ? `${(n / 1048576).toFixed(2)} MiB`
      : `${Math.round(n / 1024)} KiB`;
