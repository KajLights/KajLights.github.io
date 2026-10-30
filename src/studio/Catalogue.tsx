import { useEffect, useState } from "react";
import boards from "../data/boards.json";
import { orderedCandidates } from "../lib/catalogue.mjs";
import { loadCatalogue } from "../lib/validation";
import ReleaseCard from "./ReleaseCard";
export default function Catalogue() {
  const [catalogue, setCatalogue] = useState<any>(null),
    [error, setError] = useState(""),
    [board, setBoard] = useState(""),
    [pre, setPre] = useState(false),
    [withdrawn, setWithdrawn] = useState(false),
    [mqtt, setMqtt] = useState(false),
    [audio, setAudio] = useState(false);
  async function refresh() {
    try {
      setCatalogue(await loadCatalogue());
      setError("");
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const entries = catalogue
    ? orderedCandidates(catalogue, {
        board,
        prereleases: pre,
        withdrawn,
        features: [
          ...(mqtt ? ["mqtt", "home_assistant"] : []),
          ...(audio ? ["audio_subscriptions"] : []),
        ],
      })
    : [];
  return (
    <div>
      {error && (
        <p className="error" role="alert">
          {error}{" "}
          <button className="link" onClick={() => void refresh()}>
            Try again
          </button>
        </p>
      )}
      {!catalogue && !error && <p role="status">Loading firmware releases…</p>}
      {catalogue && (
        <>
          <div className="filters">
            <div className="field">
              <label htmlFor="release-board">Board model</label>
              <select
                id="release-board"
                value={board}
                onChange={(e) => setBoard(e.target.value)}
              >
                <option value="">All boards</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={mqtt}
                onChange={(e) => setMqtt(e.target.checked)}
              />
              MQTT & Home Assistant
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={audio}
                onChange={(e) => setAudio(e.target.checked)}
              />
              Receive sound measurements (UDP)
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={pre}
                onChange={(e) => setPre(e.target.checked)}
              />
              Include prereleases
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={withdrawn}
                onChange={(e) => setWithdrawn(e.target.checked)}
              />
              Show withdrawn builds
            </label>
          </div>
          {catalogue.candidates.length === 0 ? (
            <div className="empty">
              <p className="eyebrow">NOTHING RELEASED YET</p>
              <h2>No published firmware yet.</h2>
              <p>
                There are no firmware downloads here yet. Setting up a new board
                currently needs the developer build instructions linked from the
                build guide. You can connect a board that already runs KajLights
                to read its features and give it a name.
              </p>
              <div className="actions">
                <a
                  className="button dark"
                  href={`${import.meta.env.BASE_URL}studio/#/devices`}
                >
                  Open My devices →
                </a>
              </div>
            </div>
          ) : entries.length === 0 ? (
            <div className="empty">
              <h2>No matching releases.</h2>
              <p>
                No published build matches these choices. Check the board model
                and the features you selected.
              </p>
            </div>
          ) : (
            <div className="releases">
              {entries.map((entry: any) => (
                <ReleaseCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
          <p className="snapshot">
            Catalogue last checked{" "}
            {new Date(catalogue.verified_at).toLocaleString()}. Files are
            supplied from the website’s checked copy of published releases.
          </p>
          <aside className="notice">
            <strong>About kaj-fi</strong>
            <p>
              kaj-fi firmware downloads are not available yet. If you already
              have a running device, connect in My devices to read its details
              or give it a name.
            </p>
          </aside>
        </>
      )}
    </div>
  );
}
