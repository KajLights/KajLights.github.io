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
    [mqtt, setMqtt] = useState(false);
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
        features: mqtt ? ["mqtt"] : [],
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
      {!catalogue && !error && (
        <p role="status">Reading the verified release catalogue…</p>
      )}
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
                Release workflows are ready, but development builds and draft
                releases are not offered here. You can still connect an existing
                device to read its features and save a nickname.
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
                Try another board or feature selection. Unpublished combinations
                are never substituted.
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
            Catalogue verified{" "}
            {new Date(catalogue.verified_at).toLocaleString()}. Only published
            releases are imported; your browser does not query GitHub.
          </p>
          <aside className="notice">
            <strong>About kaj-fi</strong>
            <p>
              Public firmware distribution is not enabled yet. Existing kaj-fi
              devices can use My devices for identity and nicknames.
            </p>
          </aside>
        </>
      )}
    </div>
  );
}
