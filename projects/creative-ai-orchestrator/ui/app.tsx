import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import WorkflowEditor from "./workflow-editor.js";

const API = "/api";
const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...opts });
  return res.json();
};

// Sidebar
function Sidebar() {
  const loc = useLocation();
  const links = [
    ["/", "🏠 Dashboard"],
    ["/projects", "📁 Projects"],
    ["/discovery", "🔍 Discovery"],
    ["/workflows", "⚡ Workflows"],
    ["/models", "🧠 Models"],
    ["/experiments", "🧪 Experiments"],
    ["/vision", "👁 Vision"],
    ["/settings", "⚙ Settings"],
  ];
  return (
    <div className="sidebar">
      <h1>🎨 Creative AI</h1>
      {links.map(([path, label]) => (
        <Link key={path} to={path} className={loc.pathname === path ? "active" : ""}>{label}</Link>
      ))}
    </div>
  );
}

// Dashboard
function Dashboard() {
  const [health, setHealth] = React.useState<any>(null);
  const [projects, setProjects] = React.useState<any[]>([]);
  React.useEffect(() => {
    api("/health").then(d => setHealth(d.data));
    api("/projects").then(d => setProjects(d.data || []));
  }, []);
  const hw = health?.hardware;
  return (
    <div>
      <h2>Dashboard</h2>
      <div className="grid">
        <div className="card">
          <h3>System Status</h3>
          <p><span className="badge badge-green">{health?.status || "loading..."}</span></p>
          <p style={{marginTop:8}}>Version: {health?.version}</p>
          <p>Uptime: {health?.uptime ? Math.round(health.uptime) + "s" : "-"}</p>
        </div>
        <div className="card">
          <h3>Hardware</h3>
          <p>OS: {hw?.os || "-"}</p>
          <p>CPU: {hw?.cpu || "-"}</p>
          <p>RAM: {hw?.ram || "-"}</p>
          <p>GPU: {hw?.gpus?.length ? hw.gpus.map((g:any)=>g.name).join(", ") : "None detected"}</p>
          <p>Disk: {hw?.disk || "-"}</p>
        </div>
        <div className="card">
          <h3>Projects</h3>
          <p>{projects.length} project(s)</p>
          {projects.slice(0,3).map((p:any) => <p key={p.id}>• {p.name}</p>)}
        </div>
        <div className="card" style={{ gridColumn: "span 2" }}>
          <h3>🤖 Creative Agent</h3>
          <p>Describe what you want to create — the agent will discover tools, build workflows, and execute them:</p>
          <AgentChat />
        </div>
      </div>
    </div>
  );
}

// Projects
function Projects() {
  const [projects, setProjects] = React.useState<any[]>([]);
  const [name, setName] = React.useState("");
  React.useEffect(() => { api("/projects").then(d => setProjects(d.data || [])); }, []);
  const create = async () => {
    if (!name) return;
    await api("/projects", { method: "POST", body: JSON.stringify({ name }) });
    setName("");
    api("/projects").then(d => setProjects(d.data || []));
  };
  return (
    <div>
      <h2>Projects</h2>
      <div style={{display:"flex", gap:8, marginBottom:16}}>
        <input className="input" placeholder="Project name" value={name} onChange={e=>setName(e.target.value)} style={{maxWidth:300}} />
        <button className="btn btn-primary" onClick={create}>Create Project</button>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Workflows</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>
          {projects.map((p:any) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.workflowIds?.length || 0}</td>
              <td>{new Date(p.createdAt).toLocaleDateString()}</td>
              <td><button className="btn btn-secondary">Open</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {projects.length === 0 && <p style={{color:"#64748b",marginTop:16}}>No projects yet. Create one above.</p>}
    </div>
  );
}

// Discovery
function Discovery() {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const search = async (provider: string) => {
    if (!query) return;
    setLoading(true);
    const d = await api(`/discovery/${provider}?q=${encodeURIComponent(query)}&limit=10`);
    setResults({ provider, ...d.data });
    setLoading(false);
  };
  return (
    <div>
      <h2>Discovery</h2>
      <div style={{display:"flex", gap:8, marginBottom:16}}>
        <input className="input" placeholder="Search for tools, models, workflows..." value={query} onChange={e=>setQuery(e.target.value)} style={{maxWidth:400}} onKeyDown={e=>e.key==='Enter'&&search('github')} />
        <button className="btn btn-primary" onClick={()=>search("github")}>GitHub</button>
        <button className="btn btn-primary" onClick={()=>search("huggingface")}>HuggingFace</button>
        <button className="btn btn-primary" onClick={()=>search("civitai")}>Civitai</button>
      </div>
      {loading && <p style={{color:"#64748b"}}>Searching...</p>}
      {results?.results && (
        <div>
          <p style={{marginBottom:12,color:"#64748b"}}>{results.totalResults || results.results.length} results from {results.provider}</p>
          {results.results.map((r:any) => (
            <div className="card" key={r.id}>
              <h3><a href={r.url} target="_blank" style={{color:"#60a5fa",textDecoration:"none"}}>{r.name}</a></h3>
              <p>{r.description?.slice(0,150)}</p>
              <p style={{marginTop:4}}>
                {r.stars && <span className="badge badge-blue">⭐ {r.stars}</span>}
                {r.downloads && <span className="badge badge-blue" style={{marginLeft:4}}>📥 {r.downloads}</span>}
                <span className="badge badge-green" style={{marginLeft:4}}>{r.license?.name || "Unknown"}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Workflows
function Workflows() {
  const [workflows, setWorkflows] = React.useState<any[]>([]);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorWorkflow, setEditorWorkflow] = React.useState<Record<string,unknown>|null>(null);
  const [editorName, setEditorName] = React.useState("new-workflow");
  React.useEffect(() => { api("/workflows").then(d => setWorkflows(d.data || [])); }, []);

  const openEditor = (wf?: any) => {
    if (wf?.definition) {
      setEditorWorkflow(typeof wf.definition === 'string' ? JSON.parse(wf.definition) : wf.definition);
      setEditorName(wf.name);
    } else {
      // Default empty workflow
      setEditorWorkflow({
        "1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "" } },
        "2": { class_type: "CLIPTextEncode", inputs: { text: "" } },
        "3": { class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
        "4": { class_type: "KSampler", inputs: { seed: 0, steps: 20, cfg: 7.0, sampler_name: "euler", scheduler: "normal", denoise: 1.0 } },
        "5": { class_type: "VAEDecode", inputs: {} },
        "6": { class_type: "SaveImage", inputs: { filename_prefix: "output" } },
      });
      setEditorName("new-workflow");
    }
    setEditorOpen(true);
  };

  const saveEditor = async (wf: Record<string,unknown>) => {
    try {
      await fetch(API+"/workflows", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name: editorName, definition: JSON.stringify(wf) }) });
      setEditorOpen(false);
      api("/workflows").then(d => setWorkflows(d.data || []));
    } catch(e) { console.error(e); }
  };

  const executeEditor = async (wf: Record<string,unknown>) => {
    try {
      const res = await fetch(API+"/workflows/execute", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ definition: JSON.stringify(wf) }) });
      const data = await res.json();
      alert(data.success ? "Workflow executed!" : "Error: "+JSON.stringify(data.error));
    } catch(e) { alert("Error: "+String(e)); }
  };

  if (editorOpen) {
    return (
      <div style={{height: "calc(100vh - 60px)"}}>
        <div style={{display:"flex",gap:8,padding:"8px 12px",background:"#181825"}}>
          <button className="btn" onClick={()=>setEditorOpen(false)}>← Back</button>
          <input className="input" value={editorName} onChange={e=>setEditorName(e.target.value)} style={{maxWidth:300}} />
        </div>
        <React.Suspense fallback={<div style={{padding:20,color:"#cdd6f4"}}>Loading editor...</div>}>
          <WorkflowEditor workflow={editorWorkflow} onSave={saveEditor} onExecute={executeEditor} />
        </React.Suspense>
      </div>
    );
  }

  return (
    <div>
      <h2>Workflows</h2>
      <button className="btn btn-primary" onClick={()=>openEditor()}>+ New Visual Workflow</button>
      <table style={{marginTop:16}}>
        <thead><tr><th>Name</th><th>Version</th><th>Nodes</th><th>Actions</th></tr></thead>
        <tbody>
          {workflows.map((w:any) => (
            <tr key={w.id}>
              <td>{w.name}</td>
              <td>{w.version}</td>
              <td>{w.nodes?.length || 0}</td>
              <td>
                <button className="btn btn-secondary" style={{marginRight:4}} onClick={()=>openEditor(w)}>Visual Edit</button>
                <button className="btn btn-secondary">Execute</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {workflows.length === 0 && <p style={{color:"#64748b",marginTop:16}}>No workflows yet. Click "New Visual Workflow" to start.</p>}
    </div>
  );
}

// Models
function Models() {
  const [models, setModels] = React.useState<any[]>([]);
  React.useEffect(() => { api("/models").then(d => setModels(d.data || [])); }, []);
  return (
    <div>
      <h2>Models</h2>
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>Size</th><th>Installed</th><th>License</th></tr></thead>
        <tbody>
          {models.map((m:any) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td><span className="badge badge-blue">{m.type}</span></td>
              <td>{m.sizeBytes ? (m.sizeBytes/1024/1024).toFixed(1)+"MB" : "-"}</td>
              <td>{m.installed ? <span className="badge badge-green">Yes</span> : <span className="badge badge-yellow">No</span>}</td>
              <td>{m.license?.name || "Unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {models.length === 0 && <p style={{color:"#64748b",marginTop:16}}>No models registered.</p>}
    </div>
  );
}

// Experiments
function Experiments() {
  const [experiments, setExperiments] = React.useState<any[]>([]);
  const [projectId, setProjectId] = React.useState("");
  React.useEffect(() => { api("/experiments" + (projectId ? `?projectId=${projectId}` : "")).then(d => setExperiments(d.data || [])); }, [projectId]);
  return (
    <div>
      <h2>Experiments</h2>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <input className="input" placeholder="Filter by project ID" value={projectId} onChange={e=>setProjectId(e.target.value)} style={{maxWidth:300}} />
      </div>
      <table>
        <thead><tr><th>Name</th><th>Status</th><th>Created</th><th>Completed</th></tr></thead>
        <tbody>
          {experiments.map((e:any) => (
            <tr key={e.id}>
              <td>{e.name}</td>
              <td><span className={`badge badge-${e.status==='completed'?'green':e.status==='running'?'blue':'yellow'}`}>{e.status}</span></td>
              <td>{new Date(e.createdAt).toLocaleDateString()}</td>
              <td>{e.completedAt ? new Date(e.completedAt).toLocaleDateString() : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {experiments.length === 0 && <p style={{color:"#64748b",marginTop:16}}>No experiments yet.</p>}
    </div>
  );
}

// Vision
function Vision() {
  const [imgPath, setImgPath] = React.useState("");
  const [analysis, setAnalysis] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const analyze = async () => {
    if (!imgPath) return;
    setLoading(true);
    const d = await api("/vision/analyze", { method: "POST", body: JSON.stringify({ path: imgPath }) });
    setAnalysis(d.data);
    setLoading(false);
  };
  return (
    <div>
      <h2>Vision</h2>
      <div className="grid">
        <div className="card" style={{flex:1,minWidth:300}}>
          <h3>Image Analysis</h3>
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <input className="input" placeholder="Path to image..." value={imgPath} onChange={e=>setImgPath(e.target.value)} style={{flex:1}} onKeyDown={e=>e.key==='Enter'&&analyze()} />
            <button className="btn btn-primary" onClick={analyze} disabled={loading}>{loading?"Analyzing...":"Analyze"}</button>
          </div>
          {analysis && (
            <div style={{marginTop:16}}>
              <p><b>Sharpness:</b> {analysis.sharpness?.toFixed(1)}</p>
              <p><b>Noise:</b> {analysis.noise?.toFixed(1)}</p>
              <p><b>Blur:</b> {analysis.blur?.toFixed(1)}</p>
              <p><b>Contrast:</b> {analysis.contrast?.toFixed(1)}</p>
              <p><b>Brightness:</b> {analysis.brightness?.toFixed(1)}</p>
              <p><b>Overall Quality:</b> {analysis.overallQuality?.toFixed(1)}</p>
            </div>
          )}
        </div>
        <div className="card" style={{flex:1,minWidth:300}}>
          <h3>Video Analysis</h3>
          <p style={{color:"#64748b",marginTop:8}}>POST /api/vision/video/analyze with video path. Requires ffprobe.</p>
        </div>
      </div>
    </div>
  );
}

// Settings
function Settings() {
  const [openai, setOpenai] = React.useState("");
  const [anthropic, setAnthropic] = React.useState("");
  const [localUrl, setLocalUrl] = React.useState("http://127.0.0.1:11434");
  const [ghToken, setGhToken] = React.useState("");
  const [hfToken, setHfToken] = React.useState("");
  const [autonomy, setAutonomy] = React.useState("assisted");
  const [saved, setSaved] = React.useState(false);
  const [providers, setProviders] = React.useState<any[]>([]);

  React.useEffect(() => {
    api("/health").then(d => {
      if (d.data?.llmProviders) setProviders(d.data.llmProviders);
    });
  }, []);

  const save = async () => {
    // Send to server as env overrides
    await api("/system/config", { method: "POST", body: JSON.stringify({
      openaiApiKey: openai || undefined,
      anthropicApiKey: anthropic || undefined,
      localLlmUrl: localUrl || undefined,
      githubToken: ghToken || undefined,
      huggingfaceToken: hfToken || undefined,
      autonomyLevel: autonomy,
    })});
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div>
      <h2>Settings</h2>
      <div className="card" style={{maxWidth:600}}>
        <h3>LLM Providers</h3>
        {providers.length > 0 && (
          <div style={{marginBottom:12}}>
            {providers.map((p: any) => (
              <span key={p.id} className={`badge badge-${p.available ? 'green' : 'yellow'}`} style={{marginRight:8}}>
                {p.name}: {p.available ? 'Connected' : 'Unavailable'}
              </span>
            ))}
          </div>
        )}
        <div style={{marginTop:12}}>
          <label style={{fontSize:12,color:"#64748b"}}>OpenAI API Key</label>
          <input className="input" type="password" placeholder="sk-..." value={openai} onChange={e=>setOpenai(e.target.value)} style={{marginTop:4}} />
        </div>
        <div style={{marginTop:12}}>
          <label style={{fontSize:12,color:"#64748b"}}>Anthropic API Key</label>
          <input className="input" type="password" placeholder="sk-ant-..." value={anthropic} onChange={e=>setAnthropic(e.target.value)} style={{marginTop:4}} />
        </div>
        <div style={{marginTop:12}}>
          <label style={{fontSize:12,color:"#64748b"}}>Local LLM URL (Ollama)</label>
          <input className="input" placeholder="http://127.0.0.1:11434" value={localUrl} onChange={e=>setLocalUrl(e.target.value)} style={{marginTop:4}} />
        </div>
      </div>
      <div className="card" style={{maxWidth:600,marginTop:12}}>
        <h3>Discovery Tokens</h3>
        <div style={{marginTop:12}}>
          <label style={{fontSize:12,color:"#64748b"}}>GitHub Token</label>
          <input className="input" type="password" placeholder="ghp_..." value={ghToken} onChange={e=>setGhToken(e.target.value)} style={{marginTop:4}} />
        </div>
        <div style={{marginTop:12}}>
          <label style={{fontSize:12,color:"#64748b"}}>HuggingFace Token</label>
          <input className="input" type="password" placeholder="hf_..." value={hfToken} onChange={e=>setHfToken(e.target.value)} style={{marginTop:4}} />
        </div>
      </div>
      <div className="card" style={{maxWidth:600,marginTop:12}}>
        <h3>Autonomy Level</h3>
        <select className="input" style={{marginTop:8}} value={autonomy} onChange={e=>setAutonomy(e.target.value)}>
          <option value="manual">Manual — Agent proposes, user executes</option>
          <option value="assisted">Assisted — Safe ops auto, privileged asks</option>
          <option value="automatic">Automatic — Authorized ops auto</option>
          <option value="autonomous">Autonomous — Full auto within limits</option>
        </select>
      </div>
      <button className="btn btn-primary" style={{marginTop:16}} onClick={save}>
        {saved ? '✓ Saved' : 'Save Settings'}
      </button>
    </div>
  );
}

// Agent Chat
function AgentChat() {
  const [intent, setIntent] = React.useState("");
  const [messages, setMessages] = React.useState<Array<{role: string; content: string; timestamp?: string}>>([]);
  const [loading, setLoading] = React.useState(false);

  const send = async () => {
    if (!intent.trim() || loading) return;
    const userMsg = { role: "user", content: intent, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIntent("");
    setLoading(true);

    try {
      const d = await api("/agent/process", { method: "POST", body: JSON.stringify({ intent: userMsg.content }) });
      const result = d.data;
      const agentMsg = {
        role: "agent",
        content: result?.plan?.goal
          ? `✅ Plan: ${result.plan.goal}\nSteps: ${result.completedSteps?.length || 0}/${result.plan.steps?.length || 0}\nOutputs: ${result.outputs?.length || 0}\nQuality: ${result.qualityScore || 'N/A'}\nErrors: ${result.errors?.length || 0}`
          : d.error?.message || "Agent processed your request.",
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, agentMsg]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: "error", content: `Error: ${err.message}` }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ marginTop: 8 }}>
      {messages.length > 0 && (
        <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 8, padding: 8, background: '#0f172a', borderRadius: 6, fontSize: 13 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 6, color: m.role === 'user' ? '#60a5fa' : m.role === 'error' ? '#f87171' : '#4ade80' }}>
              <b>{m.role === 'user' ? 'You' : m.role === 'error' ? 'Error' : 'Agent'}:</b> {m.content}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          placeholder="I want to create a photorealistic portrait of..."
          value={intent}
          onChange={e => setIntent(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          style={{ flex: 1 }}
          disabled={loading}
        />
        <button className="btn btn-primary" onClick={send} disabled={loading}>
          {loading ? '⏳ Thinking...' : '🚀 Create'}
        </button>
      </div>
    </div>
  );
}

// App
function App() {
  return (
    <BrowserRouter>
      <div style={{display:"flex",height:"100vh"}}>
        <Sidebar />
        <div className="main" style={{flex:1}}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/discovery" element={<Discovery />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/models" element={<Models />} />
            <Route path="/experiments" element={<Experiments />} />
            <Route path="/vision" element={<Vision />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
