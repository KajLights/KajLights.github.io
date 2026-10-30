import Ajv2020 from "ajv/dist/2020.js";
import build from "@device-contracts/build.schema.json";
import firmware from "@device-contracts/firmware.schema.json";
import release from "@device-contracts/release.schema.json";
import device from "@device-contracts/device.schema.json";
import catalogueSchema from "../../release-policy/catalogue.schema.json";
const ajv = new Ajv2020({ allErrors: true, strict: false });
for (const schema of [build, firmware, release]) ajv.addSchema(schema);
const validateCatalogue = ajv.compile<any>(catalogueSchema),
  validateDevice = ajv.compile<any>(device);
export function checkedDevice(value: any): any {
  if (!validateDevice(value))
    throw Error(
      "This device returned an unsupported or incomplete description.",
    );
  return value;
}
export function checkedCatalogue(value: any): any {
  if (
    !validateCatalogue(value) ||
    !Number.isFinite(Date.parse(value.verified_at))
  )
    throw Error("The release catalogue is invalid. Installation is disabled.");
  const ids = new Set();
  for (const entry of value.candidates) {
    if (
      ids.has(entry.id) ||
      entry.id !== entry.artifact.build.firmware.build_id ||
      entry.release.tag !== "v" + entry.release.version
    )
      throw Error("Conflicting catalogue identity.");
    ids.add(entry.id);
    for (const asset of entry.artifact.assets) {
      const expected = `distribution/assets/${asset.sha256}/${asset.name}`;
      if (entry.assets[asset.name] !== expected)
        throw Error("Unsafe catalogue asset path.");
    }
  }
  return value;
}
export function siteURL(path: string) {
  return new URL(
    import.meta.env.BASE_URL + path.replace(/^\/+/, ""),
    location.origin,
  ).href;
}
export async function loadCatalogue() {
  const response = await fetch(siteURL("catalogue.json"), {
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error(
      "The release catalogue could not be refreshed. Try again before installing.",
    );
  const text = await response.text();
  if (text.length > 16 * 1024 * 1024)
    throw Error("The release catalogue is too large.");
  return checkedCatalogue(JSON.parse(text));
}
