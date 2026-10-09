import { useState } from "react";
import { getToken, setToken, type User } from "./api";
import { AssetsPage, ErrorsPage, HomePage, JobsPage, LoginPage, ProjectsPage } from "./pages";
import { CharactersPage, MemoryPage, ModelsPage, QAPage, SystemPage } from "./modules";

type Tab = "home" | "projects" | "assets" | "characters" | "memory" | "models" | "jobs" | "qa" | "errors" | "system";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "projects", label: "Projects" },
  { id: "assets", label: "Assets" },
  { id: "characters", label: "Characters" },
  { id: "memory", label: "Memory" },
  { id: "models", label: "Models" },
  { id: "jobs", label: "Jobs" },
  { id: "qa", label: "QA" },
  { id: "errors", label: "Errors" },
  { id: "system", label: "System" },
];

export function App() {
  const [token, setTokenState] = useState<string | null>(getToken());
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("home");

  if (!token) {
    return (
      <LoginPage
        onLogin={(t, u) => {
          setToken(t);
          setTokenState(t);
          setUser(u);
        }}
      />
    );
  }

  const logout = () => {
    setToken(null);
    setTokenState(null);
    setUser(null);
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">UCE<span>Universal Creative Engine</span></div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="user">
          <div>
            <strong>{user?.username}</strong>
            <span>{user?.role}</span>
          </div>
          <button className="ghost" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>
      <main className="content">
        {tab === "home" && <HomePage onUser={setUser} />}
        {tab === "projects" && <ProjectsPage />}
        {tab === "assets" && <AssetsPage />}
        {tab === "characters" && <CharactersPage />}
        {tab === "memory" && <MemoryPage />}
        {tab === "models" && <ModelsPage />}
        {tab === "jobs" && <JobsPage />}
        {tab === "qa" && <QAPage />}
        {tab === "errors" && <ErrorsPage />}
        {tab === "system" && <SystemPage />}
      </main>
    </div>
  );
}