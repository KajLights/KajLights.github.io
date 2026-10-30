import { bytesLabel, shortId } from "../lib/catalogue.mjs";
export const featureNames: Record<string, string> = {
  mqtt: "MQTT",
  home_assistant: "Home Assistant",
  audio_subscriptions: "Receive sound measurements (UDP)",
  audio_gateway: "Receive sound measurements over USB or HTTP",
  wifi: "Wi-Fi",
  http_api: "Network control (HTTP)",
  websocket_management: "WebSocket management",
  usb_management: "USB control",
  device_metadata: "Device names",
  light_output: "Light output",
  program_storage: "Program storage",
  live_inputs: "Live inputs",
  presets: "Presets",
  compositions: "Compositions",
  transitions: "Transitions",
  boot_sequence: "Boot sequence",
  power_recovery: "Power recovery",
  configuration: "Configuration",
  audio_analysis: "Audio analysis",
  audio_publisher: "Send sound measurements",
  pdm_microphone: "Sense microphone",
  synthetic_audio: "Synthetic input",
};
export default function ReleaseCard({
  entry,
  onSelect,
  selected = false,
  disabled = false,
}: {
  entry: any;
  onSelect?: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const build = entry.artifact.build;
  return (
    <article className={"release-card" + (selected ? " review" : "")}>
      <div className="release-top">
        <div>
          <p className="eyebrow">
            {build.board.replaceAll("_", " ")} · {build.product}
          </p>
          <h3>
            {entry.release.version}{" "}
            <span className="muted">
              /{" "}
              {build.firmware.profile === "mqtt"
                ? "MQTT & Home Assistant"
                : build.firmware.profile}
            </span>
          </h3>
        </div>
        {onSelect ? (
          <button
            className="secondary"
            disabled={disabled || entry.policy.withdrawn}
            onClick={onSelect}
          >
            {selected ? "Selected" : "Select this build"}
          </button>
        ) : (
          <a
            className="button light small"
            href={`${import.meta.env.BASE_URL}studio/#/firmware?build=${encodeURIComponent(entry.id)}`}
          >
            Review firmware →
          </a>
        )}
      </div>
      <div className="badges">
        {entry.policy.recommended && (
          <span className="badge yellow">Recommended for this profile</span>
        )}
        {entry.release.channel === "prerelease" && (
          <span className="badge yellow">Prerelease</span>
        )}
        {entry.policy.withdrawn && <span className="badge red">Withdrawn</span>}
        <span className="badge">
          {build.features.includes("mqtt") ? "MQTT included" : "No MQTT"}
        </span>
        <span className="badge">
          {build.features.includes("audio_subscriptions")
            ? "UDP audio included"
            : "No UDP audio"}
        </span>
        <span className="badge">Install over USB</span>
      </div>
      <dl className="facts">
        <div>
          <dt>Firmware size</dt>
          <dd>{bytesLabel(entry.artifact.capacity.firmware_bytes)}</dd>
        </div>
        <div>
          <dt>Space for saved work</dt>
          <dd>{bytesLabel(entry.artifact.capacity.storage_bytes)}</dd>
        </div>
        <div>
          <dt>Memory for running animations</dt>
          <dd>{bytesLabel(entry.artifact.limits.vm_heap_bytes)}</dd>
        </div>
      </dl>
      {entry.policy.withdrawn ? (
        <p className="error">
          {entry.policy.reason ||
            "This build has been withdrawn and cannot be installed here."}
        </p>
      ) : (
        entry.policy.accepted_methods.length === 0 && (
          <p className="small muted">
            Installation is not yet approved for this build.
          </p>
        )
      )}
      <details>
        <summary>Features and build details · …{shortId(entry.id)}</summary>
        <ul className="feature-list">
          {build.features.map((f: string) => (
            <li key={f}>{featureNames[f] || f}</li>
          ))}
        </ul>
        <p>
          Target: {build.hardware.chip} ·{" "}
          {bytesLabel(build.hardware.declared_flash_bytes)} declared flash
        </p>
        <p>
          Installation methods: {entry.artifact.installation.methods.join(", ")}
        </p>
        <p className="code">Build: {entry.id}</p>
        <p className="code">Source: {entry.release.source_revision}</p>
        <p className="small">
          <a href={entry.release_url} target="_blank" rel="noreferrer">
            Published release ↗
          </a>
        </p>
      </details>
    </article>
  );
}
