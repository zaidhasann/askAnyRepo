"use client";

import { FormEvent, useState } from "react";

type Snapshot = { url: string; commit: string; files: { path: string; bytes: number }[]; ignored: number; truncated: boolean };

export default function Home() {
  const [url, setUrl] = useState("");
  const [fileCap, setFileCap] = useState("500");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsLoading(true); setError(""); setSnapshot(null);
    try {
      const response = await fetch("/api/inspect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, fileCap: Number(fileCap) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Inspection failed.");
      setSnapshot(payload);
    } catch (inspectionError) { setError(inspectionError instanceof Error ? inspectionError.message : "Inspection failed."); }
    finally { setIsLoading(false); }
  }

  return (
    <main className="shell">
      <div className="topline"><span className="mark">AR</span><span>ASK ANY REPO</span><span className="status"><i /> local workspace</span></div>
      <section className="hero"><p className="eyebrow">Repository intelligence / 01</p><h1>Bring a codebase<br /><em>into focus.</em></h1><p className="lede">Start with a clean, shallow snapshot. We&apos;ll map the repository before the questions begin.</p></section>
      <section className="workspace-grid">
        <form className="inspect-panel" onSubmit={inspect}>
          <div className="panel-heading"><span>01</span><h2>Source repository</h2></div>
          <label htmlFor="repo-url">GitHub URL</label><div className="url-field"><span>https://</span><input id="repo-url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="github.com/owner/repository" required /></div>
          <div className="field-row"><div><label htmlFor="file-cap">File cap</label><input id="file-cap" type="number" min="1" max="10000" value={fileCap} onChange={(event) => setFileCap(event.target.value)} /></div><p className="field-note">A shallow clone, walked locally.<br />Images, locks, builds, and dependencies are skipped.</p></div>
          <button type="submit" disabled={isLoading}>{isLoading ? "Mapping repository..." : "Map repository"}<span>↗</span></button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
        <aside className="protocol-panel"><div className="panel-heading"><span>02</span><h2>Protocol</h2></div><ol><li><strong>Clone</strong><span>Depth one, no tags</span></li><li><strong>Filter</strong><span>Focused file surface</span></li><li><strong>Count</strong><span>Hard cap enforced</span></li></ol><div className="vector-note"><span className="vector-icon">∿</span><div><strong>pgvector ready</strong><span>Semantic retrieval is configured in Supabase.</span></div></div></aside>
      </section>
      {snapshot && <section className="results" aria-live="polite"><div className="results-heading"><div><p className="eyebrow">Snapshot complete</p><h2>Repository surface</h2></div><span className="commit">{snapshot.commit.slice(0, 8)}</span></div><div className="stats"><div><strong>{snapshot.files.length}</strong><span>files mapped</span></div><div><strong>{snapshot.ignored}</strong><span>entries filtered</span></div><div><strong>{snapshot.truncated ? "CAP" : "FULL"}</strong><span>{snapshot.truncated ? "limit reached" : "tree visited"}</span></div></div><ul className="file-list">{snapshot.files.map((file) => <li key={file.path}><span>{file.path}</span><small>{file.bytes.toLocaleString()} B</small></li>)}</ul></section>}
      <footer><span>temporary clone / discarded after inspection</span><span>supabase + pgvector / eval harness</span></footer>
    </main>
  );
}