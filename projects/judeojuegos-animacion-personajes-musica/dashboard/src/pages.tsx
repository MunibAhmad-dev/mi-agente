import { useEffect, useState, type FormEvent } from "react";
import {
  getJSON,
  postJSON,
  postRaw,
  request,
  type Asset,
  type ErrorRecord,
  type Job,
  type Project,
  type User,
} from "./api";

/* ---------------------------------------------------------- shared helpers */

function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setError(null);
    fn()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reload]);
  return { data, error, reload: () => setReload((r) => r + 1) };
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="error-box">{message}</div>;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadArtifact(id: string, name: string) {
  const res = await request(`/api/artifacts/${id}/content`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* -------------------------------------------------------------- login page */

export function LoginPage({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await postJSON<{ token: string; user: User }>("/api/auth/login", { username, password });
      onLogin(res.token, res.user);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>UCE</h1>
        <p>Universal Creative Engine</p>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoFocus />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          type="password"
        />
        <ErrorBox message={error} />
        <button disabled={busy || !username || !password}>{busy ? "Signing in…" : "Sign in"}</button>
        <small>CPU-only build — GPU integration disabled by design.</small>
      </form>
    </div>
  );
}

/* --------------------------------------------------------------- home page */

export function HomePage({ onUser }: { onUser: (u: User) => void }) {
  const health = useAsync(() => getJSON<Record<string, unknown>>("/health"));
  useEffect(() => {
    getJSON<User>("/api/auth/me").then(onUser).catch(() => undefined);
  }, [onUser]);

  return (
    <section>
      <h1>Home</h1>
      <ErrorBox message={health.error} />
      {health.data && (
        <div className="cards">
          <div className="card">
            <span>Kernel</span>
            <strong>{String(health.data.status)}</strong>
          </div>
          <div className="card">
            <span>Version</span>
            <strong>{String(health.data.version)}</strong>
          </div>
          <div className="card">
            <span>GPU</span>
            <strong>{String(health.data.gpu)}</strong>
          </div>
          <div className="card">
            <span>Jobs</span>
            <strong>{JSON.stringify(health.data.jobs)}</strong>
          </div>
        </div>
      )}
      <p className="muted">
        This dashboard is a functional client of the kernel API. Every action below performs a real
        operation — create projects, upload assets with version history, submit and inspect jobs.
      </p>
    </section>
  );
}

/* ----------------------------------------------------------- projects page */

export function ProjectsPage() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const projects = useAsync(() => getJSON<{ projects: Project[] }>("/api/projects"));

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setActionError(null);
    try {
      await postJSON("/api/projects", { name, description });
      setName("");
      setDescription("");
      projects.reload();
    } catch (err) {
      setActionError(String(err));
    }
  };

  const archive = async (id: string) => {
    try {
      await postJSON(`/api/projects/${id}/archive`, {});
      projects.reload();
    } catch (err) {
      setActionError(String(err));
    }
  };

  return (
    <section>
      <h1>Projects</h1>
      <ErrorBox message={projects.error} />
      <ErrorBox message={actionError} />
      <form className="inline-form" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" required />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        <button>Create project</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Status</th>
            <th>Assets</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(projects.data?.projects ?? []).map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td className="muted">{p.description || "—"}</td>
              <td>{p.status}</td>
              <td>{p.asset_count}</td>
              <td>
                {p.status === "ACTIVE" && (
                  <button className="ghost" onClick={() => archive(p.id)}>
                    Archive
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ------------------------------------------------------------- assets page */

export function AssetsPage() {
  const [projectId, setProjectId] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [versionsOf, setVersionsOf] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const projects = useAsync(() => getJSON<{ projects: Project[] }>("/api/projects"));
  const assets = useAsync(() => getJSON<{ assets: Asset[] }>(`/api/projects/${projectId}/assets`), [projectId]);
  const versions = useAsync(() => getJSON<{ versions: { id: string; version: number; sha256: string; size: number; note: string }[] }>(`/api/assets/${versionsOf}/versions`), [versionsOf]);

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    setActionError(null);
    if (!projectId || !assetName || !assetFile) return;
    try {
      await postRaw(`/api/projects/${projectId}/assets?name=${encodeURIComponent(assetName)}`, assetFile);
      setAssetName("");
      setAssetFile(null);
      assets.reload();
    } catch (err) {
      setActionError(String(err));
    }
  };

  const rollback = async (assetId: string, version: number) => {
    try {
      await postJSON(`/api/assets/${assetId}/rollback`, { version });
      assets.reload();
      if (versionsOf === assetId) versions.reload();
    } catch (err) {
      setActionError(String(err));
    }
  };

  return (
    <section>
      <h1>Assets</h1>
      <ErrorBox message={projects.error} />
      <ErrorBox message={assets.error} />
      <ErrorBox message={actionError} />
      <label className="field">
        Project
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Select a project…</option>
          {(projects.data?.projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {projectId && (
        <>
          <form className="inline-form" onSubmit={upload}>
            <input value={assetName} onChange={(e) => setAssetName(e.target.value)} placeholder="Asset name" required />
            <input type="file" onChange={(e) => setAssetFile(e.target.files?.[0] ?? null)} required />
            <button>Upload (new version)</button>
          </form>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Version</th>
                <th>Size</th>
                <th>SHA-256</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(assets.data?.assets ?? []).map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.kind}</td>
                  <td>v{a.version}</td>
                  <td>{fmtBytes(a.size)}</td>
                  <td className="hash">{a.sha256.slice(0, 16)}…</td>
                  <td>
                    <button className="ghost" onClick={() => setVersionsOf(versionsOf === a.id ? null : a.id)}>
                      {versionsOf === a.id ? "Hide versions" : "Versions"}
                    </button>
                    <button className="ghost" onClick={() => downloadArtifact(a.id, a.name)}>
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {versionsOf && (
            <div className="card">
              <h3>Version history</h3>
              <ErrorBox message={versions.error} />
              <table>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Size</th>
                    <th>Note</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(versions.data?.versions ?? []).map((v) => (
                    <tr key={v.id}>
                      <td>v{v.version}</td>
                      <td>{fmtBytes(v.size)}</td>
                      <td className="muted">{v.note || "—"}</td>
                      <td>
                        <button className="ghost" onClick={() => rollback(versionsOf, v.version)}>
                          Rollback to v{v.version}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- jobs page */

const ACTIVE = new Set(["QUEUED", "PLANNED", "RUNNING", "WAITING", "QA", "REPAIR"]);

export function JobsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const jobs = useAsync(() => getJSON<{ jobs: Job[] }>("/api/jobs"));
  const detail = useAsync(() => getJSON<Job>(`/api/jobs/${selected}`), [selected]);

  useEffect(() => {
    if (selected && detail.data && ACTIVE.has(detail.data.status)) {
      const t = setTimeout(() => detail.reload(), 1200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [selected, detail.data, detail]);

  const submitDemo = async () => {
    setActionError(null);
    try {
      await postJSON("/api/jobs", {
        name: "demo-concat",
        tasks: [
          { id: "a", kind: "core.write_text", params: { name: "a.txt", content: "hello" } },
          { id: "b", kind: "core.write_text", params: { name: "b.txt", content: "world" } },
          { id: "c", kind: "core.concat_text", params: { name: "out.txt" } },
        ],
        edges: [
          { task: "c", depends_on: "a" },
          { task: "c", depends_on: "b" },
        ],
      });
      jobs.reload();
    } catch (err) {
      setActionError(String(err));
    }
  };

  const resume = async (id: string) => {
    try {
      await postJSON(`/api/jobs/${id}/resume`, {});
      jobs.reload();
      if (selected === id) detail.reload();
    } catch (err) {
      setActionError(String(err));
    }
  };

  const cancel = async (id: string) => {
    try {
      await postJSON(`/api/jobs/${id}/cancel`, {});
      jobs.reload();
      if (selected === id) detail.reload();
    } catch (err) {
      setActionError(String(err));
    }
  };

  return (
    <section>
      <h1>Jobs</h1>
      <ErrorBox message={jobs.error} />
      <ErrorBox message={actionError} />
      <button onClick={submitDemo}>Run demo job (text concat DAG)</button>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Tasks</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(jobs.data?.jobs ?? []).map((j) => (
            <tr key={j.id}>
              <td>{j.name}</td>
              <td>{j.status}</td>
              <td>{j.tasks.length}</td>
              <td>
                <button className="ghost" onClick={() => setSelected(j.id)}>
                  Detail
                </button>
                {(j.status === "FAILED" || j.status === "CANCELLED") && (
                  <button className="ghost" onClick={() => resume(j.id)}>
                    Resume
                  </button>
                )}
                {ACTIVE.has(j.status) && (
                  <button className="ghost" onClick={() => cancel(j.id)}>
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && detail.data && (
        <div className="card">
          <h3>
            {detail.data.name} — <span className="status">{detail.data.status}</span>
          </h3>
          <ErrorBox message={detail.error} />
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Attempt</th>
                <th>Artifacts</th>
              </tr>
            </thead>
            <tbody>
              {detail.data.tasks.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td className="muted">{t.kind}</td>
                  <td>{t.status}</td>
                  <td>{t.attempt}</td>
                  <td>
                    {t.artifacts.map((a) => (
                      <button key={a.id} className="ghost" onClick={() => downloadArtifact(a.id, a.name)}>
                        {a.name}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------- errors page */

export function ErrorsPage() {
  const errors = useAsync(() => getJSON<{ errors: ErrorRecord[] }>("/api/errors"));
  return (
    <section>
      <h1>Errors</h1>
      <ErrorBox message={errors.error} />
      {(errors.data?.errors ?? []).length === 0 && <p className="muted">No recorded errors — nothing hidden (Master Prompt §71).</p>}
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Message</th>
            <th>Task kind</th>
            <th>Suggested fix</th>
          </tr>
        </thead>
        <tbody>
          {(errors.data?.errors ?? []).map((e) => (
            <tr key={e.id}>
              <td className="hash">{e.code}</td>
              <td>{e.message}</td>
              <td className="muted">{e.task_kind ?? "—"}</td>
              <td className="muted">{e.suggested_fix ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}