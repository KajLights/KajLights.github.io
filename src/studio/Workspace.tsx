import { useEffect, useRef, useState } from "react";
import { LightVMClient } from "@device-client";
import { HttpTransport, SerialTransport } from "@device-transports";
import boards from "../data/boards.json";
import {
  assessment,
  bytesLabel,
  candidateChanges,
  contextKey,
  deviceLabel,
  orderedCandidates,
  reasonText,
  shortId,
  verifyRunningBuild,
} from "../lib/catalogue.mjs";
import {
  nicknameValue,
  rememberDevice,
  sameSession,
} from "../lib/sessions.mjs";
import { preparePlan, executePlan } from "../lib/plans.mjs";
import { checkedDevice, loadCatalogue, siteURL } from "../lib/validation";
import ReleaseCard, { featureNames } from "./ReleaseCard";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const storeKey = "kajlights.devices.v1",
  pendingKey = "kajlights.installation.v1";
function readStorage(
  storage: "localStorage" | "sessionStorage",
  key: string,
  fallback: any,
) {
  try {
    return JSON.parse(window[storage].getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function download(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Workspace() {
  const [page, setPage] = useState("devices"),
    [catalogue, setCatalogue] = useState<any>(null),
    [catalogueOK, setCatalogueOK] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(""),
    [description, setDescription] = useState<any>(null),
    [live, setLive] = useState(false);
  const [inventory, setInventory] = useState<any[]>(() =>
      readStorage("localStorage", storeKey, []),
    ),
    [address, setAddress] = useState("http://192.168.1.20");
  const [name, setName] = useState(""),
    [nameBase, setNameBase] = useState<any>(null);
  const [boardId, setBoardId] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [features, setFeatures] = useState<string[]>([]),
    [pre, setPre] = useState(false),
    [selected, setSelected] = useState("");
  const [probe, setProbe] = useState<any>(null),
    [plan, setPlan] = useState<any>(null),
    [ack, setAck] = useState(false),
    [progress, setProgress] = useState("");
  const [pending, setPending] = useState<any>(() =>
    readStorage("sessionStorage", pendingKey, null),
  );
  const client = useRef<LightVMClient | null>(null),
    driver = useRef<any>(null),
    desc = useRef<any>(null),
    catalogueRef = useRef<any>(null),
    epoch = useRef(0),
    key = useRef(""),
    mounted = useRef(true),
    dirtyRef = useRef(false),
    working = useRef(false),
    writing = useRef(false);
  const board = boards.find((b) => b.id === boardId),
    dirty = name !== (nameBase?.nickname ?? "");
  dirtyRef.current = dirty;
  const entries = catalogue
    ? orderedCandidates(catalogue, {
        product: description?.product ?? "lightvm",
        board: boardId || undefined,
        features,
        prereleases: pre,
      })
    : [];
  const entry = entries.find((e: any) => e.id === selected);
  const context = {
    product: description?.product ?? "lightvm",
    board,
    confirmedModel: confirmed,
    features,
    method: board?.method,
    device: description,
    probe,
  };
  key.current =
    catalogue && entry
      ? contextKey(catalogue, entry, context, epoch.current)
      : "";
  const result = entry ? assessment(catalogue, entry, context) : null;
  const canPrepare =
    catalogueOK &&
    entry &&
    ["installed", "clean_local_install", "download_only"].includes(
      result?.state ?? "",
    );
  function invalidate() {
    epoch.current++;
    key.current = "";
    setPlan(null);
    setAck(false);
  }
  function change(action: () => void) {
    invalidate();
    action();
  }
  async function closeDriver() {
    const old = driver.current;
    driver.current = null;
    setProbe(null);
    if (old) await old.close();
  }
  async function closeClient() {
    const old = client.current;
    client.current = null;
    setLive(false);
    if (old) await old.close();
  }
  function remember(d: any) {
    setInventory((previous) => {
      const next = rememberDevice(previous, d);
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  function acceptDescription(d: any) {
    const previous = desc.current;
    if (!sameSession(previous, d, { revision: true })) invalidate();
    desc.current = d;
    setDescription(d);
    remember(d);
    if (!dirtyRef.current) {
      setName(d.nickname ?? "");
      setNameBase(d);
    }
    if (!previous || previous.controller_id !== d.controller_id) {
      setBoardId(d.board);
      setConfirmed(false);
      setSelected("");
    }
  }
  async function refreshCatalogue() {
    try {
      const next = await loadCatalogue();
      if (!mounted.current) return next;
      if (catalogueRef.current && catalogueRef.current.id !== next.id)
        invalidate();
      catalogueRef.current = next;
      setCatalogue(next);
      setCatalogueOK(true);
      return next;
    } catch (e) {
      if (mounted.current) {
        setCatalogueOK(false);
        setError(message(e));
      }
      throw e;
    }
  }
  async function run(label: string, action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      working.current = false;
      if (mounted.current) setBusy("");
    }
  }
  useEffect(() => {
    mounted.current = true;
    const route = () => {
      if (location.hash && !location.hash.startsWith("#/")) return;
      setPage(location.hash.startsWith("#/firmware") ? "firmware" : "devices");
      const id = new URLSearchParams(location.hash.split("?")[1]).get("build");
      if (id && !working.current) change(() => setSelected(id));
    };
    route();
    window.addEventListener("hashchange", route);
    const catalogueTimer = setInterval(() => {
      if (!working.current) void refreshCatalogue().catch(() => {});
    }, 60000);
    void refreshCatalogue().catch(() => {});
    const deviceTimer = setInterval(() => {
      const c = client.current;
      if (c && !working.current)
        void run("Refreshing device", async () => {
          const d = checkedDevice(await c.describe());
          if (client.current === c) acceptDescription(d);
        });
    }, 15000);
    const leave = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || writing.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    const disconnected = (event: any) => {
      if (driver.current && event.target === driver.current.port) {
        invalidate();
        void closeDriver();
        setError(
          "The checked USB device disconnected. Prepare the installation again.",
        );
      }
    };
    (navigator as any).serial?.addEventListener("disconnect", disconnected);
    return () => {
      mounted.current = false;
      epoch.current++;
      key.current = "";
      clearInterval(catalogueTimer);
      clearInterval(deviceTimer);
      window.removeEventListener("hashchange", route);
      window.removeEventListener("beforeunload", leave);
      (navigator as any).serial?.removeEventListener(
        "disconnect",
        disconnected,
      );
      void client.current?.close();
      void driver.current?.close();
    };
  }, []);
  async function connect(kind: "usb" | "http") {
    // Start the chooser within the click gesture. SerialTransport owns its port.
    const transport =
      kind === "usb" ? new SerialTransport() : new HttpTransport(address);
    const opening = transport.open();
    await run("Connecting", async () => {
      invalidate();
      await closeDriver();
      await closeClient();
      let c: LightVMClient | null = null;
      try {
        await opening;
        c = new LightVMClient(transport, {
          onDisconnect: (e: Error) => {
            if (client.current === c) {
              client.current = null;
              setLive(false);
              invalidate();
              setError(message(e));
            }
          },
        });
        const d = checkedDevice(await c.describe());
        if (
          kind === "http" &&
          !sameSession(d, (transport as HttpTransport).identity)
        )
          throw Error(
            "The HTTP session belongs to another device or boot. Reconnect.",
          );
        client.current = c;
        setLive(true);
        acceptDescription(d);
        setName(d.nickname ?? "");
        setNameBase(d);
        const expected = readStorage("sessionStorage", pendingKey, null);
        if (expected) {
          try {
            verifyRunningBuild(d, expected);
            setNotice("Running build confirmed on " + deviceLabel(d) + ".");
            sessionStorage.removeItem(pendingKey);
            setPending(null);
          } catch (e) {
            setError(message(e));
          }
        } else setNotice("Connected directly to " + deviceLabel(d) + ".");
      } catch (e) {
        if (c) await c.close();
        else await transport.close();
        throw e;
      }
    });
  }
  async function saveName() {
    await run("Saving nickname", async () => {
      const c = client.current,
        base = nameBase;
      if (!c || !base) throw Error("Reconnect before saving a nickname.");
      const value = nicknameValue(name);
      const before = checkedDevice(await c.describe());
      if (
        client.current !== c ||
        !sameSession(base, before, { revision: true })
      )
        throw Error(
          "The device, boot or nickname revision changed. Reconnect to read the current name before editing it.",
        );
      await c.setDeviceNickname(value, base);
      const after = checkedDevice(await c.describe());
      if (client.current !== c || !sameSession(before, after))
        throw Error(
          "The device changed while saving. Reconnect to check its nickname.",
        );
      setName(after.nickname ?? "");
      setNameBase(after);
      acceptDescription(after);
      setNotice("Nickname saved on this device.");
    });
  }
  async function exportSettings() {
    await run("Exporting settings", async () => {
      const c = client.current,
        base = desc.current;
      if (!c || !base) throw Error("Connect the device before exporting.");
      const before = checkedDevice(await c.describe());
      if (!sameSession(base, before, { revision: true }))
        throw Error("The device changed. Refresh before exporting.");
      const config =
        before.product === "lightvm" ? await c.json("config_get") : null;
      const network = before.features.includes("wifi")
        ? await c.json("network_get")
        : null;
      const after = checkedDevice(await c.describe());
      if (
        client.current !== c ||
        !sameSession(before, after, { revision: true })
      )
        throw Error("The device changed while exporting. Try again.");
      download(
        JSON.stringify(
          {
            schema: "kajlights.settings_export",
            format: 1,
            exported_at: new Date().toISOString(),
            device: before,
            configuration: config,
            network,
          },
          null,
          2,
        ),
        `kajlights-${shortId(before.controller_id)}-settings.json`,
        "application/json",
      );
      setNotice(
        "Settings exported. Keep your animation source files separately; this file is not a complete device backup.",
      );
    });
  }
  function newBoard() {
    change(() => {
      void closeClient();
      void closeDriver();
      desc.current = null;
      setDescription(null);
      setBoardId("");
      setConfirmed(false);
      setSelected("");
      setName("");
      setNameBase(null);
      setNotice(
        "Choose the exact physical board model for a new installation.",
      );
    });
  }
  function checkUSB() {
    const serial = (navigator as any).serial;
    if (!serial) {
      setError(
        "USB installation needs desktop Chrome or Edge in a secure context.",
      );
      return;
    }
    const choosing = serial.requestPort({ filters: [{ usbVendorId: 0x303a }] });
    void run("Checking USB hardware", async () => {
      invalidate();
      const port = await choosing;
      await closeClient();
      await closeDriver();
      const { probeEsp } = await import("./esp");
      const checked = await probeEsp(port);
      driver.current = { ...checked, port };
      setProbe(checked.probe);
      setNotice(
        "USB chip, flash size and hardware identity checked. Review the selected build next.",
      );
    });
  }
  async function prepare() {
    await run("Checking firmware files", async () => {
      setProgress("Downloading and verifying every firmware part…");
      const prepared = await preparePlan({
        catalogue,
        entry,
        context,
        epoch: epoch.current,
        currentKey: () => key.current,
        refresh: refreshCatalogue,
        url: siteURL,
      });
      setPlan(prepared);
      setAck(false);
      setProgress("Firmware files verified. Review the installation below.");
    });
  }
  async function install() {
    await run("Installing firmware", async () => {
      if (!plan || !ack)
        throw Error("Review and acknowledge the installation first.");
      // A failed/partial flash must remain pending until the running build is checked.
      const rememberPending = () => {
        sessionStorage.setItem(pendingKey, JSON.stringify(plan.expected));
        setPending(plan.expected);
      };
      try {
        const outcome = await executePlan(plan, {
          currentKey: () => key.current,
          refresh: refreshCatalogue,
          driver: driver.current,
          progress: setProgress,
          onBeforeWrite: () => {
            rememberPending();
            writing.current = true;
          },
        });
        if (outcome.kind === "download") {
          rememberPending();
          download(
            outcome.bytes,
            entry.artifact.installation.parts[0].asset,
            "application/octet-stream",
          );
          setNotice(
            `File downloaded. Hold BOOTSEL while connecting the ${board?.name}, then copy it to ${board?.drive}. Reconnect here to confirm the running build.`,
          );
        } else {
          driver.current = null;
          setProbe(null);
          setNotice(
            "Writing and byte verification finished. Reconnect to confirm the running firmware.",
          );
        }
      } finally {
        writing.current = false;
        invalidate();
        setProgress("");
        if (plan.method === "usb-serial") await closeDriver();
      }
    });
  }
  const changes = entry ? candidateChanges(entry, description) : null;
  return (
    <>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">KAJLIGHTS WORKSPACE</p>
          <h1>{page === "firmware" ? "Install firmware." : "Your devices."}</h1>
        </div>
        <a href={`${import.meta.env.BASE_URL}install/`} className="text-link">
          Installation guide ↗
        </a>
      </div>
      <div className="workspace">
        <nav className="workspace-nav" aria-label="Workspace">
          <a
            href="#/devices"
            aria-current={page === "devices" ? "page" : undefined}
          >
            My devices
          </a>
          <a
            href="#/firmware"
            aria-current={page === "firmware" ? "page" : undefined}
          >
            Firmware
          </a>
          <p>
            Device connections and unsaved names stay open as you move between
            these views.
          </p>
        </nav>
        <div className="workspace-content">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          {busy && (
            <p className="progress" role="status">
              {busy}… {progress}
            </p>
          )}
          {pending && (
            <aside className="notice">
              <strong>Installation awaiting confirmation</strong>
              <p>
                Connect the selected device below. A downloaded file or
                completed write does not confirm which firmware is running.
              </p>
              <button
                className="link"
                disabled={!!busy}
                onClick={() => {
                  sessionStorage.removeItem(pendingKey);
                  setPending(null);
                }}
              >
                Dismiss pending check
              </button>
            </aside>
          )}
          {description && (
            <div className="device-banner">
              <div>
                <strong>{deviceLabel(description)}</strong>
                <small>
                  {live ? "Connected" : "Disconnected · last read"} ·{" "}
                  {description.version} · {description.firmware.profile}
                </small>
              </div>
              <button
                className="secondary"
                disabled={!!busy || dirty}
                onClick={() =>
                  void run("Disconnecting", async () => {
                    invalidate();
                    await closeClient();
                    await closeDriver();
                  })
                }
              >
                Disconnect
              </button>
            </div>
          )}
          <section className="panel">
            <h2>Connect a device</h2>
            <p>
              Use a USB data cable, or enter its address on your local network.
              Browser permissions apply to the device you choose.
            </p>
            <div className="actions">
              <button
                className="primary"
                disabled={!!busy || dirty || live || !!probe}
                onClick={() => void connect("usb")}
              >
                Connect over USB
              </button>
              {!(navigator as any).serial && (
                <span className="small muted">
                  USB needs desktop Chrome or Edge.
                </span>
              )}
            </div>
            <details>
              <summary>Connect over the local network</summary>
              <div className="connection-form">
                <label className="field">
                  Device HTTP origin
                  <input
                    type="url"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="http://192.168.1.20"
                    disabled={!!busy || live}
                  />
                </label>
                <button
                  className="secondary"
                  disabled={!!busy || dirty || live}
                  onClick={() => void connect("http")}
                >
                  Connect over network
                </button>
              </div>
              <p className="small muted">
                You may need to allow local-network access in your browser. The
                address is not saved in your browser inventory.
              </p>
            </details>
          </section>
          {page === "devices" ? (
            <>
              {description && (
                <section className="panel">
                  <h2>Device nickname</h2>
                  <p>
                    Give this device a name you will recognise. Its hardware ID
                    continues to identify it, even when names are shared.
                  </p>
                  <div className="settings-name">
                    <label className="field">
                      Nickname
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={!live || !!busy}
                        placeholder="e.g. Kitchen lights"
                        maxLength={63}
                      />
                    </label>
                    <button
                      className="primary"
                      disabled={
                        !live ||
                        !!busy ||
                        !dirty ||
                        !description.features.includes("device_metadata")
                      }
                      onClick={() => void saveName()}
                    >
                      Save nickname
                    </button>
                    {dirty && (
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={() => {
                          setName(description.nickname ?? "");
                          setNameBase(description);
                        }}
                      >
                        Discard edit
                      </button>
                    )}
                  </div>
                  <p className="small muted">
                    Up to 63 UTF-8 bytes. Clear the field to remove the
                    nickname. A clean firmware installation erases it.
                  </p>
                  {description.metadata_error && (
                    <p className="error">{description.metadata_error}</p>
                  )}
                </section>
              )}
              {description && (
                <section className="panel">
                  <h2>Installed features</h2>
                  <ul className="feature-list">
                    {description.features.map((f: string) => (
                      <li key={f}>{featureNames[f] || f}</li>
                    ))}
                  </ul>
                  <dl className="facts">
                    <div>
                      <dt>Physical flash</dt>
                      <dd>
                        {description.hardware.flash_verified
                          ? bytesLabel(description.hardware.flash_bytes)
                          : "Not verified"}
                      </dd>
                    </div>
                    <div>
                      <dt>VM memory</dt>
                      <dd>{bytesLabel(description.limits.vm_heap_bytes)}</dd>
                    </div>
                    <div>
                      <dt>Build</dt>
                      <dd>…{shortId(description.firmware.build_id)}</dd>
                    </div>
                  </dl>
                  <div className="actions">
                    <a className="button dark" href="#/firmware">
                      Review firmware →
                    </a>
                    <button
                      className="secondary"
                      disabled={!live || !!busy || dirty}
                      onClick={() => void exportSettings()}
                    >
                      Export settings
                    </button>
                  </div>
                  <p className="small muted">
                    The settings export includes the nickname, active LightVM
                    configuration and non-secret network settings. Keep
                    animation source files separately. Automatic restore is not
                    available.
                  </p>
                  <details>
                    <summary>Device description</summary>
                    <pre>{JSON.stringify(description, null, 2)}</pre>
                  </details>
                </section>
              )}
              <section className="panel">
                <h2>Remembered in this browser</h2>
                <p className="small muted">
                  Names and hardware IDs stay on this browser. Devices are not
                  contacted automatically.
                </p>
                {inventory.length ? (
                  <ul className="inventory">
                    {inventory.map((d) => (
                      <li key={d.controller_id}>
                        <div>
                          <strong>{deviceLabel(d)}</strong>
                          <br />
                          <time>
                            Last seen {new Date(d.last_seen).toLocaleString()}
                          </time>
                        </div>
                        <button
                          className="link"
                          onClick={() =>
                            setInventory((old) => {
                              const next = old.filter(
                                (x) => x.controller_id !== d.controller_id,
                              );
                              try {
                                localStorage.setItem(
                                  storeKey,
                                  JSON.stringify(next),
                                );
                              } catch {}
                              return next;
                            })
                          }
                        >
                          Forget
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">
                    Connect your first device to remember it here.
                  </p>
                )}
              </section>
            </>
          ) : (
            <>
              <section className="panel">
                <h2>
                  <span className="stage-number">1</span>Identify the board
                </h2>
                <p>
                  {description
                    ? "Firmware choices are bound to the hardware ID above."
                    : "Choose the exact board model printed on the hardware."}
                </p>
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={!!busy || dirty}
                    onClick={newBoard}
                  >
                    Set up a new board
                  </button>
                </div>
                <div className="stack">
                  <label className="field">
                    Board model
                    <select
                      aria-label="Board model"
                      value={boardId}
                      disabled={!!busy || !!description}
                      onChange={(e) =>
                        change(() => {
                          void closeDriver();
                          setBoardId(e.target.value);
                          setConfirmed(false);
                          setSelected("");
                        })
                      }
                    >
                      <option value="">Choose a board</option>
                      {boards.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {description && !board && (
                    <p className="notice">
                      This product or board has no public installation route
                      yet. Identity and nickname tools remain available in My
                      devices.
                    </p>
                  )}
                  {board && (
                    <>
                      <p className="small">{board.hint}</p>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          disabled={!!busy}
                          onChange={(e) =>
                            change(() => setConfirmed(e.target.checked))
                          }
                        />
                        I checked the physical board model: {board.name}.
                      </label>
                      {board.method === "usb-serial" && (
                        <div>
                          <button
                            className="secondary"
                            disabled={!!busy || !confirmed || dirty}
                            onClick={checkUSB}
                          >
                            Check USB hardware
                          </button>
                          {probe && (
                            <div>
                              <p className="small">
                                Checked {probe.chip} ·{" "}
                                {bytesLabel(probe.flash_bytes)} · …
                                {shortId(probe.controller_id)}
                              </p>
                              <button
                                className="link"
                                disabled={!!busy}
                                onClick={() =>
                                  void run("Ending USB check", async () => {
                                    invalidate();
                                    await closeDriver();
                                  })
                                }
                              >
                                End USB check
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {board.method === "uf2" && (
                        <p className="notice">
                          This route downloads a verified UF2 for the model you
                          confirm. The bootloader drive does not prove the board
                          model or unique device identity. Copy the file
                          yourself, then reconnect to check the running build.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </section>
              <section className="panel">
                <h2>
                  <span className="stage-number">2</span>Choose a released build
                </h2>
                <p>
                  Standard firmware keeps optional integrations out. Compare
                  each build’s actual storage and features before changing
                  profiles.
                </p>
                <div className="filters">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={features.includes("mqtt")}
                      disabled={!!busy}
                      onChange={(e) =>
                        change(() => {
                          setFeatures(e.target.checked ? ["mqtt"] : []);
                          setSelected("");
                        })
                      }
                    />
                    Require MQTT & Home Assistant
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={pre}
                      disabled={!!busy}
                      onChange={(e) =>
                        change(() => {
                          setPre(e.target.checked);
                          setSelected("");
                        })
                      }
                    />
                    Include prereleases
                  </label>
                </div>
                {!catalogueOK && (
                  <p className="error">
                    A fresh verified catalogue is required.{" "}
                    <button
                      className="link"
                      onClick={() => void refreshCatalogue().catch(() => {})}
                    >
                      Refresh catalogue
                    </button>
                  </p>
                )}
                {catalogue && catalogue.candidates.length === 0 ? (
                  <div className="empty">
                    <h3>No published firmware yet.</h3>
                    <p>
                      Development artifacts and draft releases are not install
                      candidates. Connect an existing device to use its identity
                      and nickname tools.
                    </p>
                  </div>
                ) : !board ? (
                  <p className="muted">
                    Choose a board to see matching releases.
                  </p>
                ) : entries.length === 0 ? (
                  <p className="muted">
                    No releases match this board and feature selection.
                  </p>
                ) : (
                  <div className="releases">
                    {entries.map((e: any) => (
                      <ReleaseCard
                        key={e.id}
                        entry={e}
                        selected={e.id === selected}
                        disabled={!!busy}
                        onSelect={() => change(() => setSelected(e.id))}
                      />
                    ))}
                  </div>
                )}
              </section>
              {entry && (
                <section className="panel">
                  <h2>
                    <span className="stage-number">3</span>Prepare and review
                  </h2>
                  {changes && (
                    <>
                      <p>
                        <strong>{changes.direction}</strong> ·{" "}
                        {entry.release.version} /{" "}
                        {entry.artifact.build.firmware.profile}
                      </p>
                      {changes.removed.length > 0 && (
                        <p className="notice">
                          Features removed:{" "}
                          {changes.removed
                            .map((f: string) => featureNames[f] || f)
                            .join(", ")}
                          . Connected services using these features will stop
                          working.
                        </p>
                      )}
                    </>
                  )}
                  {result?.reasons.map((r: string) => (
                    <p
                      className={
                        r === "export_and_clean_install_required"
                          ? "notice"
                          : "error"
                      }
                      key={r}
                    >
                      {(reasonText as Record<string, string>)[r] || r}
                    </p>
                  ))}
                  <button
                    className="primary"
                    disabled={!!busy || !canPrepare || dirty}
                    onClick={() => void prepare()}
                  >
                    Download and check firmware files
                  </button>
                  {plan && (
                    <div className="panel review">
                      <h3>
                        Review{" "}
                        {board?.method === "uf2"
                          ? "UF2 download"
                          : "clean installation"}
                      </h3>
                      <p>
                        {board?.name} · {entry.release.version} ·{" "}
                        {entry.artifact.build.firmware.profile}
                      </p>
                      <p className="small code">
                        Device:{" "}
                        {plan.expected.controller_id ||
                          "Model confirmed; unique device checked after installation"}
                      </p>
                      <p className="small">
                        {plan.parts.length} verified file(s) ·{" "}
                        {bytesLabel(
                          plan.parts.reduce(
                            (n: number, p: any) => n + p.bytes.length,
                            0,
                          ),
                        )}{" "}
                        to transfer
                      </p>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={ack}
                          onChange={(e) => setAck(e.target.checked)}
                          disabled={!!busy}
                        />
                        I understand this is a clean installation. Saved
                        programs, settings and the nickname will be erased. I
                        have exported what I need and kept my source files.
                      </label>
                      <button
                        className="primary danger-button"
                        disabled={!!busy || !ack || !catalogueOK}
                        onClick={() => void install()}
                      >
                        {board?.method === "uf2"
                          ? "Download verified UF2"
                          : "Erase and install on checked USB device"}
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
