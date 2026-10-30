import MD5 from "crypto-js/md5.js";
import WordArray from "crypto-js/lib-typedarrays.js";
export type Probe = {
  id: string;
  controller_id: string;
  chip: string;
  flash_bytes: number;
  chip_revision: number;
};
export async function probeEsp(
  port: any,
  { library = () => import("esptool-js") } = {},
) {
  const { ESPLoader, Transport } = await library();
  const transport = new Transport(port, false),
    loader: any = new ESPLoader({
      transport,
      baudrate: 115200,
      terminal: { clean() {}, writeLine() {}, write() {} },
    });
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await transport.disconnect().catch(() => {});
    }
  };
  async function read() {
    const chip = loader.chip?.CHIP_NAME;
    if (!["ESP32-C3", "ESP32-S3", "ESP32-C6"].includes(chip))
      throw Error(
        "This processor is not supported by the KajLights installer.",
      );
    // detectChip reads these immutable fuses in ROM. Reuse that per-port result
    // after the SDK starts its RAM stub; recheck MAC/geometry before every write.
    const security = await loader.getSecurityInfo();
    if (
      !security?.parsedFlags ||
      security.parsedFlags.SECURE_BOOT_EN !== false ||
      security.parsedFlags.SECURE_DOWNLOAD_ENABLE !== false ||
      security.flashCryptCnt !== 0
    )
      throw Error(
        "Secured or encrypted devices need their own maintenance tools. Nothing was written.",
      );
    const size = await loader.detectFlashSize(),
      match = /^(\d+)MB$/.exec(size ?? "");
    if (!match) throw Error("The physical flash size could not be verified.");
    const mac = (await loader.chip.readMac(loader))
      .replaceAll(":", "")
      .toLowerCase();
    if (!/^[0-9a-f]{12}$/.test(mac))
      throw Error("The hardware identity could not be read.");
    if (
      typeof loader.chip.getMajorChipVersion !== "function" ||
      typeof loader.chip.getMinorChipVersion !== "function"
    )
      throw Error("The chip revision could not be verified.");
    const major = await loader.chip.getMajorChipVersion(loader),
      minor = await loader.chip.getMinorChipVersion(loader);
    if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor))
      throw Error("Invalid chip revision.");
    return {
      controller_id: "esp32-" + mac,
      chip,
      flash_bytes: Number(match[1]) * 1048576,
      chip_revision: major * 100 + minor,
    };
  }
  try {
    await loader.main();
    const measured = await read(),
      id = "rom-" + crypto.randomUUID();
    const probe: Probe = { ...measured, id };
    return {
      id,
      probe,
      async verify(expected: Probe) {
        if (closed) throw Error("The USB check expired.");
        const current = await read();
        for (const key of [
          "controller_id",
          "chip",
          "flash_bytes",
          "chip_revision",
        ] as const)
          if (current[key] !== expected[key])
            throw Error("The checked USB device changed. Nothing was written.");
      },
      async write(
        parts: { address: number; bytes: Uint8Array }[],
        progress: (text: string) => void,
      ) {
        if (closed) throw Error("The checked USB device was disconnected.");
        for (const part of parts)
          if (
            !Number.isSafeInteger(part.address) ||
            part.address < 0 ||
            part.address + part.bytes.length > probe.flash_bytes
          )
            throw Error("A payload exceeds the measured flash.");
        progress("Erasing and writing the selected device…");
        await loader.writeFlash({
          fileArray: parts.map((p) => ({ address: p.address, data: p.bytes })),
          flashSize: "keep",
          flashMode: "keep",
          flashFreq: "keep",
          eraseAll: true,
          compress: true,
          calculateMD5Hash: (bytes: Uint8Array) =>
            MD5(WordArray.create(bytes as any)).toString(),
          reportProgress: (index: number, written: number, total: number) =>
            progress(
              `Writing part ${index + 1}/${parts.length} · ${Math.round((written / total) * 100)}%`,
            ),
        });
        progress("Written bytes verified. Restarting the device…");
        await loader.after("hard_reset");
        await close();
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
