import { test } from "node:test";
import assert from "node:assert/strict";
import { probeEsp } from "../src/studio/esp.ts";
function sdk() {
  const state = {
    mac: "aa:bb:cc:dd:ee:ff",
    size: "8MB",
    secure: false,
    writes: 0,
    closes: 0,
  };
  class Transport {
    async disconnect() {
      state.closes++;
    }
  }
  class ESPLoader {
    chip = {
      CHIP_NAME: "ESP32-S3",
      readMac: async () => state.mac,
      getMajorChipVersion: async () => 0,
      getMinorChipVersion: async () => 2,
    };
    async main() {}
    async getSecurityInfo() {
      return {
        flashCryptCnt: 0,
        parsedFlags: {
          SECURE_BOOT_EN: state.secure,
          SECURE_DOWNLOAD_ENABLE: false,
        },
      };
    }
    async detectFlashSize() {
      return state.size;
    }
    async writeFlash(options) {
      state.writes++;
      assert.equal(options.eraseAll, true);
      assert.equal(
        options.calculateMD5Hash(new Uint8Array([1, 2, 3])),
        "5289df737df57326fcdd22597afb1fac",
      );
      assert.ok(options.fileArray[0].data instanceof Uint8Array);
    }
    async after() {}
  }
  return { state, library: async () => ({ Transport, ESPLoader }) };
}
test("SDK uses measured geometry, repeated identity and byte-oriented write/readback options", async () => {
  const { state, library } = sdk(),
    driver = await probeEsp({}, { library });
  assert.equal(driver.probe.flash_bytes, 8388608);
  assert.equal(driver.probe.controller_id, "esp32-aabbccddeeff");
  state.mac = "11:22:33:44:55:66";
  await assert.rejects(driver.verify(driver.probe), /changed/);
  assert.equal(state.writes, 0);
  state.mac = "aa:bb:cc:dd:ee:ff";
  await driver.verify(driver.probe);
  await driver.write(
    [{ address: 0, bytes: new Uint8Array([1, 2, 3]) }],
    () => {},
  );
  assert.equal(state.writes, 1);
  assert.equal(state.closes, 1);
  await assert.rejects(driver.verify(driver.probe), /expired/);
});
test("unknown geometry, security and out-of-flash parts never write", async () => {
  for (const kind of ["size", "secure"]) {
    const { state, library } = sdk();
    if (kind === "size") state.size = "unknown";
    else state.secure = true;
    await assert.rejects(probeEsp({}, { library }));
    assert.equal(state.writes, 0);
    assert.equal(state.closes, 1);
  }
  const { state, library } = sdk(),
    driver = await probeEsp({}, { library });
  await assert.rejects(
    driver.write([{ address: 8388608, bytes: new Uint8Array([1]) }], () => {}),
    /exceeds/,
  );
  assert.equal(state.writes, 0);
  await driver.close();
});
