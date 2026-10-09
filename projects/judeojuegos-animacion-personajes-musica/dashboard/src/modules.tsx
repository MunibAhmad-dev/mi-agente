import { useEffect, useState, type FormEvent } from "react";
import { getJSON, postJSON, type Project } from "./api";

/* Shared bits (mirrors pages.tsx conventions) */

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="error-box">{message}</div>;
}

function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string>("");
  const load = () => {
    getJSON<{ projects: Project[] }>("/api/projects")
      .then((d) => {
        setProjects(d.projects);
        setProjectId((prev) => prev || d.projects[0]?.id || "");
      })
      .catch(() => undefined);
  };
  useEffect(load, []);
  return { projects, projectId, setProjectId };
}

/* -------------------------------------------------------------- models page */

interface ModelRecord {
  id: string;
  name: string;
  modality: string;
  quality: number;
  speed: number;
  vram_gb: number;
  cpu_ok: boolean;
  license_name: string;
  availability: string;
  availability_detail: string;
  active: boolean;
}

interface RouterPreview {
  selected: string | null;
  reasons: string[];
  candidates: { name: string; score: number; eligible: boolean; reasons: string[] }[];
}

export function ModelsPage() {
  const models = useAsyncList<ModelRecord[]>("/api/models", "models");
  const [modality, setModality] = useState("llm");
  const [mode, setMode] = useState("BALANCED");
  const [preview, setPreview] = useState<RouterPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runPreview = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const q = new URLSearchParams({ modality, mode });
      setPreview(await getJSON<RouterPreview>(`/api/models/router/preview?${q}`));
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <section>
      <h1>Models &amp; Router</h1>
      <ErrorBox message={models.error ?? error} />
      <form className="row-form" onSubmit={runPreview}>
        <select value={modality} onChange={(e) => setModality(e.target.value)}>
          {["llm", "image", "video", "audio", "music", "embedding", "3d"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          {["FAST", "BALANCED", "QUALITY", "MAX_QUALITY"].map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <button>Preview routing</button>
      </form>
      {preview && (
        <div className="panel">
          <h3>{preview.selected ? `Selected: ${preview.selected}` : "No model available"}</h3>
          {!preview.selected && preview.reasons.length > 0 && (
            <ul className="muted-list">{preview.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          )}
          {preview.candidates.map((c) => (
            <div key={c.name} className="candidate">
              <strong>{c.name}</strong> · score {c.score} ·{" "}
              {c.eligible ? "eligible" : `rejected: ${c.reasons.join("; ")}`}
            </div>
          ))}
        </div>
      )}
      <table>
        <thead>
          <tr><th>Name</th><th>Modality</th><th>Q/S</th><th>VRAM</th><th>License</th><th>Availability</th></tr>
        </thead>
        <tbody>
          {(models.data ?? []).map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{m.modality}</td>
              <td>{m.quality.toFixed(2)}/{m.speed.toFixed(2)}</td>
              <td>{m.vram_gb ? `${m.vram_gb} GB` : "CPU"}</td>
              <td>{m.license_name || "—"}</td>
              <td>{m.availability === "available" ? "available" : m.availability_detail || "unavailable"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* -------------------------------------------------------------- memory page */

interface MemoryEntry {
  id: string;
  category: string;
  key: string;
  text: string;
  score?: number;
  matched_by?: string[];
}

export function MemoryPage() {
  const { projects, projectId, setProjectId } = useProjects();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [results, setResults] = useState<MemoryEntry[] | null>(null);
  const [category, setCategory] = useState("world");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("keyword");
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    if (!projectId) return;
    getJSON<{ memories: MemoryEntry[] }>(`/api/projects/${projectId}/memory`)
      .then((d) => setEntries(d.memories))
      .catch((e) => setError(String(e)));
  };
  useEffect(reload, [projectId]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await postJSON(`/api/projects/${projectId}/memory`, { category, text });
      setText("");
      reload();
    } catch (err) {
      setError(String(err));
    }
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const d = await postJSON<{ results: MemoryEntry[] }>(
        `/api/projects/${projectId}/memory/search`,
        { query, mode, limit: 10 },
      );
      setResults(d.results);
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <section>
      <h1>Project Memory</h1>
      <ErrorBox message={error} />
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <form className="row-form" onSubmit={add}>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {["project", "character", "world", "visual", "asset", "voice", "music", "conversation", "technical"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="remember…" />
        <button disabled={!text || !projectId}>Add</button>
      </form>
      <form className="row-form" onSubmit={search}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search memory…" />
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="keyword">keyword</option>
          <option value="semantic">semantic</option>
          <option value="both">both</option>
        </select>
        <button disabled={!query || !projectId}>Search</button>
      </form>
      {results !== null && (
        <div className="panel">
          <h3>Search results</h3>
          {results.length === 0 && <p className="muted">no matches</p>}
          {results.map((r) => (
            <div key={r.id} className="candidate">
              [{r.category}] {r.text} <span className="muted">(score {r.score})</span>
            </div>
          ))}
        </div>
      )}
      <h3>All entries ({entries.length})</h3>
      {entries.map((m) => (
        <div key={m.id} className="candidate">[{m.category}] {m.key && <strong>{m.key}: </strong>}{m.text}</div>
      ))}
    </section>
  );
}

/* ---------------------------------------------------------- characters page */

interface CharacterRecord {
  id: string;
  name: string;
  lore: string;
  slots: Record<string, string>;
}

interface Consistency {
  complete: boolean;
  present: string[];
  missing: string[];
}

export function CharactersPage() {
  const { projects, projectId, setProjectId } = useProjects();
  const [chars, setChars] = useState<CharacterRecord[]>([]);
  const [name, setName] = useState("");
  const [consistency, setConsistency] = useState<Consistency | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    if (!projectId) return;
    getJSON<{ characters: CharacterRecord[] }>(`/api/projects/${projectId}/characters`)
      .then((d) => setChars(d.characters))
      .catch((e) => setError(String(e)));
  };
  useEffect(reload, [projectId]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await postJSON(`/api/projects/${projectId}/characters`, { name });
      setName("");
      reload();
    } catch (err) {
      setError(String(err));
    }
  };

  const check = async (id: string) => {
    setError(null);
    try {
      setConsistency(await getJSON<Consistency>(`/api/characters/${id}/consistency`));
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <section>
      <h1>Characters</h1>
      <ErrorBox message={error} />
      <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <form className="row-form" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="character name" />
        <button disabled={!name || !projectId}>Create</button>
      </form>
      {consistency && (
        <div className="panel">
          <h3>Consistency</h3>
          <p>{consistency.complete ? "All slots filled." : `Missing: ${consistency.missing.join(", ")}`}</p>
        </div>
      )}
      {chars.map((c) => (
        <div key={c.id} className="candidate">
          <strong>{c.name}</strong> · {Object.keys(c.slots).length} slots filled ·{" "}
          <button className="ghost" onClick={() => check(c.id)}>check consistency</button>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ qa page */

interface QAReport {
  id: string;
  kind: string;
  passed: boolean;
  score: number;
  checks: { name: string; passed: boolean; severity: string; details: string }[];
}

export function QAPage() {
  const [reports, setReports] = useState<QAReport[]>([]);
  const [kind, setKind] = useState("text");
  const [assetId, setAssetId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    getJSON<{ reports: QAReport[] }>("/api/qa/reports")
      .then((d) => setReports(d.reports))
      .catch(() => undefined);
  };
  useEffect(reload, []);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await postJSON("/api/qa/run", { kind, subject_kind: "asset", subject_id: assetId });
      reload();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <section>
      <h1>QA</h1>
      <ErrorBox message={error} />
      <form className="row-form" onSubmit={run}>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {["text", "image", "audio", "model3d"].map((k) => <option key={k}>{k}</option>)}
        </select>
        <input value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder="asset id" />
        <button disabled={!assetId}>Run checks</button>
      </form>
      {reports.map((r) => (
        <div key={r.id} className={`panel ${r.passed ? "ok-panel" : "fail-panel"}`}>
          <h3>{r.kind} · {r.passed ? "PASSED" : "FAILED"} · score {r.score}</h3>
          {r.checks.map((c) => (
            <div key={c.name} className="candidate">
              {c.passed ? "✓" : "✗"} {c.name} ({c.severity}) {c.details && <span className="muted">{c.details}</span>}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

/* --------------------------------------------------------------- system page */

interface Probe { available: boolean; detail: string }

export function SystemPage() {
  const resources = useAsyncList<Record<string, unknown>>("/api/resources", null);
  const adapters = useAsyncList<Record<string, Probe>>("/api/adapters", "adapters");
  const licenses = useAsyncList<{ name: string; verdict: string; code_license: string; weights_license: string; commercial_use: boolean }[]>("/api/licenses", "licenses");

  return (
    <section>
      <h1>System</h1>
      <ErrorBox message={resources.error ?? adapters.error ?? licenses.error} />
      <div className="cards">
        {resources.data &&
          Object.entries(resources.data).map(([k, v]) => (
            <div className="card" key={k}><span>{k}</span><strong>{String(v)}</strong></div>
          ))}
      </div>
      <h3>Adapters</h3>
      {(adapters.data ? Object.entries(adapters.data) : []).map(([name, probe]) => (
        <div key={name} className="candidate">
          <strong>{name}</strong>: {probe.available ? "available" : "unavailable"} — <span className="muted">{probe.detail}</span>
        </div>
      ))}
      <h3>Licensing firewall</h3>
      <table>
        <thead>
          <tr><th>Component</th><th>Code</th><th>Weights</th><th>Commercial</th><th>Verdict</th></tr>
        </thead>
        <tbody>
          {(licenses.data ?? []).map((l) => (
            <tr key={l.name}>
              <td>{l.name}</td>
              <td>{l.code_license}</td>
              <td>{l.weights_license}</td>
              <td>{l.commercial_use ? "yes" : "no"}</td>
              <td>{l.verdict}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ------------------------------------------------------------- small helper */

function useAsyncList<T>(url: string, key: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    getJSON<Record<string, unknown>>(url)
      .then((d) => {
        if (alive) setData((key ? (d[key] as T) : (d as unknown as T)));
      })
      .catch((e: unknown) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [url, key]);
  return { data, error };
}
