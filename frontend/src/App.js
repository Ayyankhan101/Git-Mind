import React, { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import AgentProgress from './components/AgentProgress';
import DiagramTab    from './components/DiagramTab';
import DocsTab       from './components/DocsTab';
import SecurityTab   from './components/SecurityTab';
import ChatTab       from './components/ChatTab';
import CrisisChat    from './components/CrisisChat';
import { WS_BASE }   from './api';

// ── Constants ──────────────────────────────────────────────────────────────────
const SESSION_ID  = uuidv4();
const WS_URL      = `${WS_BASE}/ws/analyze`;
const TIMEOUT_MS  = 180_000;

const INITIAL_STATUS = {
  scanner: 'waiting', architecture: 'waiting',
  api_docs: 'waiting', security: 'waiting', chat: 'waiting',
};


// ── Helpers ────────────────────────────────────────────────────────────────────
function isValidGitHubUrl(url) {
  try {
    const u = new URL(url.trim());
    const parts = u.pathname.split('/').filter(Boolean);
    return u.hostname === 'github.com' && parts.length >= 2;
  } catch { return false; }
}

function extractRepoName(url) {
  try {
    const parts = new URL(url.trim()).pathname.split('/').filter(Boolean);
    return parts[1] || 'repository';
  } catch { return 'repository'; }
}

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
  const [repoUrl,       setRepoUrl]       = useState('https://github.com/OWASP/NodeGoat');
  const [urlError,      setUrlError]      = useState('');
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

  // ── Analyze ────────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(() => {
    const url = repoUrl.trim();

    // client-side validation
    if (!url) {
      setUrlError('Please enter a GitHub repository URL.');
      return;
    }
    if (!isValidGitHubUrl(url)) {
      setUrlError('Enter a valid GitHub URL — e.g. https://github.com/owner/repo');
      return;
    }

    // reset everything
    cleanup();
    setUrlError('');
    setGlobalError(null);
    setAgentWarnings([]);
    setDiagram(null);
    setApiDocs([]);
    setFindings([]);
    setAnalyzed(false);
    setElapsedSec(0);
    setAgentStatus(INITIAL_STATUS);
    setRepoName(extractRepoName(url));
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
  }, [repoUrl, cleanup]);

  // ── Tab meta ───────────────────────────────────────────────────────────────
  const hasCritical = findings.some(f => f.severity === 'critical');
  const tabs = [
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

        {/* URL Input */}
        <div style={{ position: 'relative', flex: 1, zIndex: 1 }}
             className={isAnalyzing ? 'scan-sweep' : ''}>
          <input
            className="gm-input"
            style={{ paddingRight: urlError ? 42 : 16 }}
            placeholder="https://github.com/owner/repository"
            value={repoUrl}
            onChange={e => { setRepoUrl(e.target.value); if (urlError) setUrlError(''); }}
            onKeyDown={e => { if (e.key === 'Enter' && !isAnalyzing) handleAnalyze(); }}
            disabled={isAnalyzing}
            aria-label="GitHub repository URL"
            aria-describedby={urlError ? 'url-error' : undefined}
          />
          {urlError && (
            <span style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--gm-danger)', fontSize: 16, cursor: 'default',
            }} title={urlError}>⚠</span>
          )}
        </div>

        {/* URL validation error tooltip */}
        {urlError && (
          <div id="url-error" role="alert" style={{
            position: 'absolute', top: 66, left: 180,
            background: '#2d0f0f', border: '1px solid #ef4444',
            borderRadius: 8, padding: '8px 14px',
            fontSize: 12, color: '#fca5a5', zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            ⚠ {urlError}
          </div>
        )}

        {/* Analyze button */}
        <button
          className="gm-btn-primary"
          style={{ position: 'relative', zIndex: 1 }}
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          aria-label={isAnalyzing ? 'Analysis in progress' : 'Start analysis'}
        >
          {isAnalyzing ? <><Spinner /> Analyzing…</> : '⚡ Analyze'}
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
          <AgentProgress
            status={agentStatus}
            isAnalyzing={isAnalyzing}
            analyzed={analyzed}
            elapsedSec={elapsedSec}
            repoName={repoName}
          />
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
                    marginBottom: -1, // overlap border
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
          </nav>

          {/* Tab content */}
          <div role="tabpanel" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
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
