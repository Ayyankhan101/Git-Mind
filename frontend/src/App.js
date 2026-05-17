import React, { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import AgentProgress from './components/AgentProgress';
import RepoList      from './components/RepoList';
import DiagramTab    from './components/DiagramTab';
import DocsTab       from './components/DocsTab';
import SecurityTab   from './components/SecurityTab';
import ChatTab       from './components/ChatTab';
import SummaryTab    from './components/SummaryTab';
import CrisisChat    from './components/CrisisChat';
import { WS_BASE, fetchRepos } from './api';

const LANG_COLOR = {
  JavaScript: '#f7df1e', TypeScript: '#3178c6', Python: '#3572A5',
  Java: '#b07219', Go: '#00ADD8', Ruby: '#701516', Rust: '#dea584',
  'C++': '#f34b7d', C: '#555555', 'C#': '#178600', Shell: '#89e051',
};

// ── Constants ──────────────────────────────────────────────────────────────────
const SESSION_ID  = uuidv4();
const WS_URL      = `${WS_BASE}/ws/analyze`;
const TIMEOUT_MS  = 180_000;

const INITIAL_STATUS = {
  scanner: 'waiting', architecture: 'waiting',
  api_docs: 'waiting', security: 'waiting', chat: 'waiting',
};


// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <span style={{ display: 'inline-block', width: 14, height: 14 }}>
      <svg viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite', width: '100%', height: '100%' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          strokeDasharray="40" strokeDashoffset="15" />
      </svg>
    </span>
  );
}

// ── App ────────────────────────────────────────────────────────────────────────
export default function App() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [githubUser,    setGithubUser]    = useState('');
  const [repos,         setRepos]         = useState([]);
  const [reposLoading,  setReposLoading]  = useState(false);
  const [reposError,    setReposError]    = useState(null);
  const [selectedRepoUrl, setSelectedRepoUrl] = useState(null);
  const [activeTab,     setActiveTab]     = useState('diagram');
  const [agentStatus,   setAgentStatus]   = useState(INITIAL_STATUS);
  const [diagram,       setDiagram]       = useState(null);
  const [apiDocs,       setApiDocs]       = useState([]);
  const [findings,      setFindings]      = useState([]);
  const [isAnalyzing,   setIsAnalyzing]   = useState(false);
  const [analyzed,      setAnalyzed]      = useState(false);
  const [globalError,   setGlobalError]   = useState(null);
  const [agentWarnings, setAgentWarnings] = useState([]);
  const [elapsedSec,    setElapsedSec]    = useState(0);
  const [repoName,      setRepoName]      = useState('');
  const [crisisFinding, setCrisisFinding] = useState(null);
  const [repoHistory,   setRepoHistory]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('gitmind_history') || '[]'); }
    catch { return []; }
  });

  // ── Refs ───────────────────────────────────────────────────────────────────
  const wsRef         = useRef(null);
  const timerRef      = useRef(null);
  const timeoutRef    = useRef(null);
  const startRef      = useRef(null);
  const analyzingRef  = useRef(false); // shadow for ws.onclose closure

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    clearInterval(timerRef.current);
    timerRef.current = null;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    analyzingRef.current = false;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // Request notification permission once on first visit
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // On analysis complete: fire browser notification + save to history
  useEffect(() => {
    if (!analyzed) return;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('GitMind', { body: `${repoName} analysis complete`, icon: '/logo.jpeg' });
    }
    if (!selectedRepoUrl || !repoName) return;
    const entry = { url: selectedRepoUrl, name: repoName, ts: Date.now() };
    setRepoHistory(prev => {
      const next = [entry, ...prev.filter(h => h.url !== selectedRepoUrl)].slice(0, 5);
      try { localStorage.setItem('gitmind_history', JSON.stringify(next)); } catch {}
      return next;
    });
  }, [analyzed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load repos ─────────────────────────────────────────────────────────────
  const handleLoadRepos = useCallback(async () => {
    const user = githubUser.trim();
    if (!user) { setReposError('Enter a GitHub username.'); return; }
    setReposError(null);
    setReposLoading(true);
    setRepos([]);
    try {
      const list = await fetchRepos(user);
      setRepos(list);
      if (list.length === 0) setReposError('No public repositories found for this user.');
    } catch (err) {
      setReposError(err.message);
    } finally {
      setReposLoading(false);
    }
  }, [githubUser]);

  // ── Select + analyze ───────────────────────────────────────────────────────
  const handleSelectRepo = useCallback((url) => {
    setSelectedRepoUrl(url);
    handleAnalyze(url);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Analyze ────────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback((url) => {
    // reset everything
    cleanup();
    setGlobalError(null);
    setAgentWarnings([]);
    setDiagram(null);
    setApiDocs([]);
    setFindings([]);
    setAnalyzed(false);
    setElapsedSec(0);
    setAgentStatus(INITIAL_STATUS);
    setRepoName(url.split('/').slice(-1)[0] || 'repository');
    setIsAnalyzing(true);
    analyzingRef.current = true;

    // elapsed timer
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    // open WebSocket
    let ws;
    try {
      ws = new WebSocket(WS_URL);
    } catch {
      setGlobalError('WebSocket is not supported or the backend URL is misconfigured.');
      setIsAnalyzing(false);
      cleanup();
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ repo_url: url, session_id: SESSION_ID }));

      // analysis timeout guard
      timeoutRef.current = setTimeout(() => {
        setGlobalError('Analysis timed out after 3 minutes. The repository may be too large or the backend stalled.');
        setIsAnalyzing(false);
        analyzingRef.current = false;
        clearInterval(timerRef.current);
        ws.close();
      }, TIMEOUT_MS);
    };

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); }
      catch { console.warn('[WS] Non-JSON message received:', event.data); return; }

      // Handle backend event-style messages: {type:"event", agent:"scanner", message:"..."}
      if (data.type === 'event' && data.agent) {
        const agentKey = data.agent === 'api_doc' ? 'api_docs' : data.agent;
        setAgentStatus(prev => ({ ...prev, [agentKey]: 'done' }));
      }
      if (data.type === 'status') {
        setAgentStatus(prev => ({ ...prev, scanner: 'running' }));
      }

      // Handle both legacy agent_status dict and new type-based protocol
      if (data.agent_status)         setAgentStatus(prev => ({ ...prev, ...data.agent_status }));
      if (data.architecture_diagram) setDiagram(data.architecture_diagram);
      // api_docs (frontend key) OR api_endpoints (backend key)
      if (data.api_docs?.length)     setApiDocs(data.api_docs);
      if (data.api_endpoints?.length) setApiDocs(data.api_endpoints);
      if (data.security_findings)    setFindings(data.security_findings);
      if (data.repo_name)            setRepoName(data.repo_name);
      if (data.agent_error) {
        const ev = data.agent_error;
        setAgentWarnings(prev => [...prev, `${ev.agent} agent failed: ${ev.detail || 'check backend logs'}`]);
      }

      // done: true (legacy) OR type:"result" (new backend protocol)
      if (data.done || data.type === 'result') {
        if (data.type === 'result') {
          if (data.architecture_diagram) setDiagram(data.architecture_diagram);
          if (data.api_endpoints?.length) setApiDocs(data.api_endpoints);
          if (data.security_findings)    setFindings(data.security_findings);
        }
        clearInterval(timerRef.current);
        clearTimeout(timeoutRef.current);
        setIsAnalyzing(false);
        setAnalyzed(true);
        analyzingRef.current = false;
        ws.close();
      }

      if (data.error || data.type === 'error') {
        setGlobalError(`Backend error: ${data.error || data.message}`);
        clearInterval(timerRef.current);
        setIsAnalyzing(false);
        analyzingRef.current = false;
        ws.close();
      }
    };

    ws.onerror = () => {
      if (!analyzingRef.current) return;
      clearInterval(timerRef.current);
      setIsAnalyzing(false);
      analyzingRef.current = false;
      setGlobalError(
        'Cannot reach the backend on port 8001. Start it with:\n  cd backend && uvicorn main:app --port 8001 --reload'
      );
    };

    ws.onclose = (evt) => {
      // Ignore intentional closes; surface unexpected ones
      if (!evt.wasClean && analyzingRef.current) {
        clearInterval(timerRef.current);
        setIsAnalyzing(false);
        analyzingRef.current = false;
        setGlobalError('Connection dropped unexpectedly. Check the backend terminal for errors.');
      }
    };
  }, [cleanup]);

  // ── Export report ──────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!analyzed) return;
    const lines = [
      `# GitMind Analysis: ${repoName}`,
      `> Generated ${new Date().toLocaleString()}`,
      '',
      '## Architecture',
      '```mermaid',
      diagram || '(no diagram)',
      '```',
      '',
      '## API Endpoints',
      '',
      ...(apiDocs.length
        ? apiDocs.map(e => `- **${e.method || ''}** \`${e.route || ''}\` — ${e.description || ''}`)
        : ['No endpoints detected.']),
      '',
      '## Security Findings',
      '',
      ...(findings.length
        ? findings.map(f =>
            `### [${(f.severity || 'info').toUpperCase()}] ${f.rule || f.check || 'Finding'}\n${f.description || f.message || ''}\n${f.file ? `File: ${f.file}${f.line ? `:${f.line}` : ''}` : ''}`
          )
        : ['No findings.']),
      '',
      '---',
      `_Scanned in ${elapsedSec}s by GitMind_`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `gitmind-${repoName}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [analyzed, repoName, diagram, apiDocs, findings, elapsedSec]);

  // ── Tab meta ───────────────────────────────────────────────────────────────
  const selectedRepo  = repos.find(r => r.url === selectedRepoUrl) ?? null;
  const hasCritical   = findings.some(f => f.severity === 'critical');
  const tabs = [
    { key: 'summary',  icon: '📊', label: 'Summary' },
    { key: 'diagram',  icon: '🏗',  label: 'Architecture' },
    { key: 'docs',     icon: '📋',  label: 'API Docs',  count: apiDocs.length  || null },
    { key: 'security', icon: '🛡',  label: 'Security',  count: findings.length || null, alert: hasCritical },
    { key: 'chat',     icon: '💬',  label: 'Chat' },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="header-glow" style={{
        position: 'relative', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '0 28px', height: 64,
        background: 'rgba(8,11,20,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #1e2d4a',
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <img
            src="/logo.jpeg"
            alt="GitMind"
            style={{
              width: 32, height: 32, borderRadius: 8,
              objectFit: 'cover',
              boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
            }}
          />
          <span style={{
            fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg,#818cf8,#c084fc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>GitMind</span>
        </div>

        {/* Username input */}
        <div style={{ position: 'relative', flex: 1, zIndex: 1, maxWidth: 340 }}
             className={isAnalyzing ? 'scan-sweep' : ''}>
          <input
            className="gm-input"
            placeholder="GitHub username — e.g. torvalds"
            value={githubUser}
            onChange={e => { setGithubUser(e.target.value); setReposError(null); }}
            onKeyDown={e => { if (e.key === 'Enter' && !reposLoading && !isAnalyzing) handleLoadRepos(); }}
            disabled={isAnalyzing}
            aria-label="GitHub username"
          />
        </div>

        {/* Load repos button */}
        <button
          className="gm-btn-primary"
          style={{ position: 'relative', zIndex: 1 }}
          onClick={handleLoadRepos}
          disabled={reposLoading || isAnalyzing}
          aria-label={reposLoading ? 'Loading repositories…' : 'Load repositories'}
        >
          {reposLoading ? <><Spinner /> Loading…</> : isAnalyzing ? <><Spinner /> Analyzing…</> : '📂 Load Repos'}
        </button>

        {/* Backend status dot */}
        <div title={analyzed ? 'Analysis complete' : isAnalyzing ? 'Analyzing…' : 'Ready'} style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: analyzed ? 'var(--gm-success)' : isAnalyzing ? 'var(--gm-warning)' : '#475569',
          boxShadow: analyzed ? '0 0 8px var(--gm-success)' : isAnalyzing ? '0 0 8px var(--gm-warning)' : 'none',
          transition: 'all 0.3s',
        }} />
      </header>

      {/* ── Global error banner ──────────────────────────────────────────────── */}
      {globalError && (
        <div role="alert" style={{
          flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 28px',
          background: 'rgba(239,68,68,0.08)',
          borderBottom: '1px solid rgba(239,68,68,0.25)',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>🔴</span>
          <pre style={{
            margin: 0, fontSize: 13, color: '#fca5a5',
            fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'pre-wrap',
          }}>{globalError}</pre>
          <button onClick={() => setGlobalError(null)} style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: '#94a3b8', cursor: 'pointer', fontSize: 18, flexShrink: 0,
          }} aria-label="Dismiss error">×</button>
        </div>
      )}

      {/* ── Agent warning banners (non-fatal — analysis continues) ──────────── */}
      {agentWarnings.map((w, i) => (
        <div key={i} role="status" style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 28px',
          background: 'rgba(245,158,11,0.07)',
          borderBottom: '1px solid rgba(245,158,11,0.2)',
        }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
          <span style={{ fontSize: 12, color: '#fcd34d', flex: 1 }}>{w}</span>
          <button onClick={() => setAgentWarnings(prev => prev.filter((_, j) => j !== i))} style={{
            background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, flexShrink: 0,
          }} aria-label="Dismiss warning">×</button>
        </div>
      ))}

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <aside style={{
          width: 300, flexShrink: 0,
          background: 'rgba(15,22,41,0.6)',
          borderRight: '1px solid var(--gm-border)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Repo list — scrollable top section */}
          <RepoList
            repos={repos}
            onSelect={handleSelectRepo}
            selectedUrl={selectedRepoUrl}
            loading={reposLoading}
            error={reposError}
            history={repoHistory}
            onHistorySelect={url => { setSelectedRepoUrl(url); handleAnalyze(url); }}
          />

          {/* Agent progress — fixed-height bottom section */}
          <div style={{ height: 268, flexShrink: 0, borderTop: '1px solid var(--gm-border)' }}>
            <AgentProgress
              status={agentStatus}
              isAnalyzing={isAnalyzing}
              analyzed={analyzed}
              elapsedSec={elapsedSec}
              repoName={repoName}
            />
          </div>
        </aside>

        {/* ── Main panel ──────────────────────────────────────────────────── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Tab bar */}
          <nav style={{
            flexShrink: 0, display: 'flex', alignItems: 'center',
            padding: '0 24px',
            borderBottom: '1px solid var(--gm-border)',
            background: 'rgba(15,22,41,0.4)',
          }} role="tablist">
            {tabs.map(tab => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '14px 16px',
                    background: 'none', border: 'none',
                    borderBottom: active ? '2px solid var(--gm-primary)' : '2px solid transparent',
                    color: active ? 'var(--gm-primary)' : 'var(--gm-text-2)',
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                    marginBottom: -1,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--gm-text-1)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--gm-text-2)'; }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.count > 0 && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: 18, height: 18, padding: '0 5px',
                      borderRadius: 999, fontSize: 10, fontWeight: 700,
                      background: tab.alert ? 'rgba(239,68,68,0.2)' : 'var(--gm-primary-20)',
                      color: tab.alert ? '#fca5a5' : 'var(--gm-primary)',
                    }}>{tab.count}</span>
                  )}
                </button>
              );
            })}

            {/* Export button — right-aligned */}
            <button
              onClick={handleExport}
              disabled={!analyzed}
              title="Download analysis as Markdown"
              style={{
                marginLeft: 'auto', padding: '6px 14px', borderRadius: 8,
                background: analyzed ? 'rgba(99,102,241,0.1)' : 'transparent',
                border: `1px solid ${analyzed ? 'rgba(99,102,241,0.3)' : 'transparent'}`,
                color: analyzed ? 'var(--gm-primary)' : '#475569',
                fontSize: 12, fontWeight: 500, cursor: analyzed ? 'pointer' : 'default',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              ↓ Export
            </button>
          </nav>

          {/* Repo stats strip */}
          {selectedRepo && analyzed && (
            <div style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
              padding: '5px 24px', borderBottom: '1px solid var(--gm-border)',
              background: 'rgba(99,102,241,0.03)', fontSize: 11, color: 'var(--gm-text-3)',
            }}>
              <a href={selectedRepo.url} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--gm-primary)', fontWeight: 600, fontSize: 12, textDecoration: 'none' }}>
                {selectedRepo.full_name}
              </a>
              {selectedRepo.language && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: LANG_COLOR[selectedRepo.language] || '#64748b' }} />
                  {selectedRepo.language}
                </span>
              )}
              {selectedRepo.stars > 0 && <span>⭐ {selectedRepo.stars.toLocaleString()}</span>}
              {selectedRepo.fork && <span style={{ color: '#64748b' }}>fork</span>}
              <span style={{ marginLeft: 'auto' }}>
                Updated {new Date(selectedRepo.updated_at).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* Tab content */}
          <div role="tabpanel" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            {activeTab === 'summary'  && <SummaryTab  sessionId={SESSION_ID} enabled={analyzed} repoName={repoName} findings={findings} apiDocs={apiDocs} elapsedSec={elapsedSec} />}
            {activeTab === 'diagram'  && <DiagramTab  diagram={diagram}   isAnalyzing={isAnalyzing} analyzed={analyzed} />}
            {activeTab === 'docs'     && <DocsTab     docs={apiDocs}      isAnalyzing={isAnalyzing} analyzed={analyzed} />}
            {activeTab === 'security' && <SecurityTab findings={findings} isAnalyzing={isAnalyzing} analyzed={analyzed} sessionId={SESSION_ID} onCrisis={setCrisisFinding} />}
            {activeTab === 'chat'     && <ChatTab     sessionId={SESSION_ID} enabled={analyzed} repoName={repoName} />}
          </div>
        </main>
      </div>

      {/* Crisis Room overlay */}
      {crisisFinding && (
        <CrisisChat finding={crisisFinding} sessionId={SESSION_ID} onClose={() => setCrisisFinding(null)} />
      )}
    </div>
  );
}
