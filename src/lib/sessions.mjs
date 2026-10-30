export function sameSession(a, b, { revision = false } = {}) {
  return Boolean(
    a &&
    b &&
    a.controller_id === b.controller_id &&
    a.boot_id === b.boot_id &&
    (!revision || a.metadata_revision === b.metadata_revision),
  );
}
export function nicknameValue(value) {
  if (
    typeof value !== "string" ||
    !value.isWellFormed() ||
    /[\u0000-\u001f\u007f]/u.test(value)
  )
    throw Error("Use a name without control characters.");
  const name = value.replace(/^ +| +$/g, "");
  if (new TextEncoder().encode(name).length > 63)
    throw Error("Device names can contain up to 63 UTF-8 bytes.");
  return name || null;
}
export function rememberDevice(
  inventory,
  description,
  now = new Date().toISOString(),
) {
  const record = {
    controller_id: description.controller_id,
    nickname: description.nickname,
    product: description.product,
    board: description.board,
    version: description.version,
    last_seen: now,
  };
  return [
    record,
    ...inventory.filter((d) => d.controller_id !== record.controller_id),
  ].slice(0, 50);
}
