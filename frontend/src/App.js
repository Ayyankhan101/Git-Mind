import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Search, FolderOpen, Share2, Download, Command,
  Check, X, AlertTriangle, ChevronDown,
  GitBranch, FileCode2, ShieldAlert, Lock, MessageSquare,
  BarChart3, GitPullRequest,
} from 'lucide-react';

import Sidebar         from './components/Sidebar';
import DiagramTab      from './components/DiagramTab';
import DocsTab         from './components/DocsTab';
import SecurityTab     from './components/SecurityTab';
import ChatTab         from './components/ChatTab';
import SummaryTab      from './components/SummaryTab';
import CveTab          from './components/CveTab';
import PRReviewTab     from './components/PRReviewTab';
import CrisisChat      from './components/CrisisChat';
import Onboarding      from './components/Onboarding';
import KeyboardHelp    from './components/KeyboardHelp';
import FilePreviewDrawer from './components/FilePreviewDrawer';
import CommandPalette  from './components/CommandPalette';
import ToastSystem     from './components/ToastSystem';
import { WS_BASE, fetchRepos, loadSharedAnalysis, generateFix } from './api';
import { LANG_COLOR } from './constants';

const SESSION_ID = crypto.randomUUID();
const WS_URL     = `${WS_BASE}/ws/analyze`;
const TIMEOUT_MS = 180_000;

const INITIAL_STATUS = {
  scanner: 'waiting', architecture: 'waiting',
  api_docs: 'waiting', security: 'waiting', cve_scanner: 'waiting', chat: 'waiting',
};

const THEMES = [
  { id: 'obsidian', name: 'Obsidian', sub: 'Default dark', colors: ['#09090b', '#7c6fe0'] },
  { id: 'daylight', name: 'Daylight', sub: 'Light mode',   colors: ['#fafafa', '#6366f1'] },
  { id: 'amber',    name: 'Amber',    sub: 'Warm paper',   colors: ['#1a1612', '#f59e0b'] },
  { id: 'verdant',  name: 'Verdant',  sub: 'Forest dark',  colors: ['#0a100d', '#10b981'] },
  { id: 'glacier',  name: 'Glacier',  sub: 'Cool blue',    colors: ['#0b1220', '#38bdf8'] },
  { id: 'aurora',   name: 'Aurora',   sub: 'Glass violet', colors: ['#0a0a18', '#a78bfa'] },
  { id: 'mist',     name: 'Mist',     sub: 'Light glass',  colors: ['#eef1f8', '#6366f1'] },
];

function ThemeSwitcher({ theme, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  const current = THEMES.find(t => t.id === theme) || THEMES[0];
  return (
    <div className="theme-switcher" ref={ref}>
      <button className="theme-btn" onClick={() => setOpen(o => !o)} title="Change theme">
        <span className="swatch" style={{ background: `linear-gradient(135deg, ${current.colors[0]} 50%, ${current.colors[1]} 50%)` }} />
        {current.name}
        <ChevronDown size={11} style={{ opacity: 0.6 }} />
      </button>
      {open && (
        <div className="theme-pop">
          {THEMES.map(t => (
            <div key={t.id} className={`theme-opt${t.id === theme ? ' active' : ''}`}
              onClick={() => { onChange(t.id); setOpen(false); }}>
              <div className="theme-opt-swatch">
                <span style={{ background: t.colors[0] }} />
                <span style={{ background: t.colors[1] }} />
              </div>
              <div>
                <div className="theme-opt-name">{t.name}</div>
                <div className="theme-opt-sub">{t.sub}</div>
              </div>
              {t.id === theme && <Check size={13} className="theme-opt-check" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  // ── Theme & density ──────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => localStorage.getItem('gm-theme') || 'obsidian');
  const [density, setDensity] = useState(() => localStorage.getItem('gm-density') || 'comfortable');

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'obsidian') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    localStorage.setItem('gm-theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (density === 'comfortable') root.removeAttribute('data-density');
    else root.setAttribute('data-density', density);
    localStorage.setItem('gm-density', density);
  }, [density]);

  // ── Core state ───────────────────────────────────────────────────────────────
  const [githubUser,    setGithubUser]    = useState('');
  const [repos,         setRepos]         = useState([]);
  const [reposLoading,  setReposLoading]  = useState(false);
  const [reposError,    setReposError]    = useState(null);
  const [selectedRepoUrl, setSelectedRepoUrl] = useState(null);
  const [activeTab,     setActiveTab]     = useState('summary');
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
  const [cveFindings,   setCveFindings]   = useState([]);
  const [fixLoading,    setFixLoading]    = useState(null);
  const [fixResult,     setFixResult]     = useState(null);
  const [repoHistory,   setRepoHistory]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('gitmind_history') || '[]'); }
    catch { return []; }
  });

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [showKbHelp,     setShowKbHelp]     = useState(false);
  const [showPalette,    setShowPalette]    = useState(false);
  const [filePreview,    setFilePreview]    = useState(null); // { path, line }
  const [toasts,         setToasts]         = useState([]);
  const [recents,        setRecents]        = useState(() => {
    try { return JSON.parse(localStorage.getItem('gm-recents') || '[]'); }
    catch { return []; }
  });
  const [shareCopied,   setShareCopied]   = useState(false);
  const [prAutoUrl,     setPrAutoUrl]     = useState(null);
  const [loadedUsers,   setLoadedUsers]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('gm-users') || '[]'); }
    catch { return []; }
  });

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const wsRef         = useRef(null);
  const timerRef      = useRef(null);
  const timeoutRef    = useRef(null);
  const startRef      = useRef(null);
  const analyzingRef  = useRef(false);
  const usernameRef   = useRef(null);
  const toastTimers   = useRef({});

  // ── Toast helpers ─────────────────────────────────────────────────────────────
  const addToast = useCallback((toast) => {
    setToasts(arr => {
      const key = `${toast.kind || 'info'}::${toast.title}`;
      const existing = arr.find(x => x.key === key);
      if (existing) {
        return arr.map(x => x.id === existing.id ? { ...x, count: (x.count || 1) + 1 } : x);
      }
      const id = Date.now() + Math.random();
      const newToast = { ...toast, id, key };
      toastTimers.current[id] = setTimeout(() => {
        setToasts(a => a.filter(t => t.id !== id));
        delete toastTimers.current[id];
      }, toast.duration || 4000);
      return [...arr, newToast];
    });
  }, []);

  const dismissToast = useCallback((id) => {
    clearTimeout(toastTimers.current[id]);
    delete toastTimers.current[id];
    setToasts(arr => arr.filter(t => t.id !== id));
  }, []);

  // ── Recent commands ────────────────────────────────────────────────────────────
  const addRecent = useCallback((cmd) => {
    setRecents(prev => {
      const next = [cmd, ...prev.filter(r => r.id !== cmd.id)].slice(0, 5);
      try { localStorage.setItem('gm-recents', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────────
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

  // ── Load shared analysis ───────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (!shareId) return;
    loadSharedAnalysis(shareId).then(data => {
      if (data.architecture_diagram) setDiagram(data.architecture_diagram);
      if (data.api_docs?.length)     setApiDocs(data.api_docs);
      if (data.security_findings)    setFindings(data.security_findings);
      if (data.cve_findings)         setCveFindings(data.cve_findings);
      if (data.repo_name)            setRepoName(data.repo_name);
      setAnalyzed(true);
      setShowOnboarding(false);
      setActiveTab('summary');
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notification permission ───────────────────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ── Global paste → PR auto-load ──────────────────────────────────────────────
  useEffect(() => {
    const onPaste = (e) => {
      const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
      const prMatch = text.match(/https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/);
      if (prMatch) {
        setPrAutoUrl(prMatch[0]);
        setActiveTab('pr');
        setShowOnboarding(false);
        addToast({ kind: 'info', title: 'PR URL detected', sub: 'Opened PR Review tab' });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addToast]);

  // ── Analysis complete side-effects ────────────────────────────────────────────
  useEffect(() => {
    if (!analyzed) return;
    addToast({ kind: 'success', title: 'Analysis complete', sub: `${repoName} · ${elapsedSec}s` });
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('GitMind', { body: `${repoName} analysis complete` });
    }
    if (!selectedRepoUrl || !repoName) return;
    const entry = { url: selectedRepoUrl, name: repoName, ts: Date.now() };
    setRepoHistory(prev => {
      const next = [entry, ...prev.filter(h => h.url !== selectedRepoUrl)].slice(0, 5);
      try { localStorage.setItem('gitmind_history', JSON.stringify(next)); } catch {}
      return next;
    });
  }, [analyzed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const isMac = /Mac/.test(navigator.platform);
    const onKey = (e) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (showPalette) return; // palette handles its own keys

      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); setShowKbHelp(h => !h);
      }
      if (mod && e.key === 'k') { e.preventDefault(); setShowPalette(true); }
      if (e.key === 'Escape') {
        setShowKbHelp(false);
        setFilePreview(null);
        setGlobalError(null);
      }
      if (mod && e.key === '1') { e.preventDefault(); setActiveTab('summary'); }
      if (mod && e.key === '2') { e.preventDefault(); setActiveTab('diagram'); }
      if (mod && e.key === '3') { e.preventDefault(); setActiveTab('docs'); }
      if (mod && e.key === '4') { e.preventDefault(); setActiveTab('security'); }
      if (mod && e.key === '5') { e.preventDefault(); setActiveTab('cve'); }
      if (mod && e.key === '6') { e.preventDefault(); setActiveTab('pr'); }
      if (mod && e.key === '7') { e.preventDefault(); setActiveTab('chat'); }
      if (mod && e.key === 'r' && analyzed) { e.preventDefault(); handleAnalyze(selectedRepoUrl); }
      if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); usernameRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPalette, analyzed, selectedRepoUrl, handleAnalyze]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load repos ────────────────────────────────────────────────────────────────
  const handleLoadRepos = useCallback(async (user) => {
    const u = (user || githubUser).trim();
    if (!u) { setReposError('Enter a GitHub username.'); return; }
    setReposError(null);
    setReposLoading(true);
    setRepos([]);
    setShowOnboarding(false);
    addRecent({ id: `user:${u}`, label: u, sub: 'GitHub user', icon: 'user' });
    try {
      const list = await fetchRepos(u);
      setRepos(list);
      if (list.length === 0) setReposError('No public repositories found.');
      else {
        addToast({ kind: 'info', title: `Loaded ${list.length} repos`, sub: u });
        setLoadedUsers(prev => {
          const next = [u, ...prev.filter(x => x !== u)].slice(0, 6);
          try { localStorage.setItem('gm-users', JSON.stringify(next)); } catch {}
          return next;
        });
      }
    } catch (err) {
      setReposError(err.message);
      addToast({ kind: 'danger', title: 'Failed to load repos', sub: err.message });
    } finally {
      setReposLoading(false);
    }
  }, [githubUser, addToast, addRecent]);

  // ── Analyze ───────────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback((url) => {
    if (!url) return;
    cleanup();
    setGlobalError(null);
    setAgentWarnings([]);
    setDiagram(null);
    setApiDocs([]);
    setFindings([]);
    setCveFindings([]);
    setFixResult(null);
    setFixLoading(null);
    setAnalyzed(false);
    setElapsedSec(0);
    setAgentStatus(INITIAL_STATUS);
    setRepoName(url.split('/').slice(-1)[0] || 'repository');
    setIsAnalyzing(true);
    analyzingRef.current = true;
    setShowOnboarding(false);
    setActiveTab('summary');

    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    let ws;
    try { ws = new WebSocket(WS_URL); }
    catch {
      setGlobalError('WebSocket is not supported or the backend URL is misconfigured.');
      setIsAnalyzing(false); cleanup(); return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ repo_url: url, session_id: SESSION_ID }));
      timeoutRef.current = setTimeout(() => {
        setGlobalError('Analysis timed out after 3 minutes.');
        setIsAnalyzing(false); analyzingRef.current = false;
        clearInterval(timerRef.current); ws.close();
      }, TIMEOUT_MS);
    };

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); }
      catch { return; }

      if (data.agent_status)         setAgentStatus(prev => ({ ...prev, ...data.agent_status }));
      if (data.architecture_diagram) setDiagram(data.architecture_diagram);
      if (data.api_docs?.length)     setApiDocs(data.api_docs);
      if (data.security_findings)    setFindings(data.security_findings);
      if (data.cve_findings)         setCveFindings(data.cve_findings);
      if (data.agent_error) {
        const ev = data.agent_error;
        setAgentWarnings(prev => [...prev, `${ev.agent} agent failed: ${ev.detail || 'check backend logs'}`]);
      }

      if (data.done) {
        clearInterval(timerRef.current); clearTimeout(timeoutRef.current);
        setIsAnalyzing(false); setAnalyzed(true); analyzingRef.current = false;
        ws.close();
      }
      if (data.error) {
        setGlobalError(`Backend error: ${data.error}`);
        clearInterval(timerRef.current); setIsAnalyzing(false);
        analyzingRef.current = false; ws.close();
      }
    };

    ws.onerror = () => {
      if (!analyzingRef.current) return;
      clearInterval(timerRef.current); setIsAnalyzing(false); analyzingRef.current = false;
      setGlobalError('Cannot reach the backend on port 8002. Start it with:\n  cd backend && uvicorn main:app --port 8002 --reload');
    };

    ws.onclose = (evt) => {
      if (!evt.wasClean && analyzingRef.current) {
        clearInterval(timerRef.current); setIsAnalyzing(false); analyzingRef.current = false;
        setGlobalError('Connection dropped unexpectedly. Check the backend terminal for errors.');
      }
    };
  }, [cleanup]);

  // ── Select + analyze ──────────────────────────────────────────────────────────
  const handleSelectRepo = useCallback((url) => {
    setSelectedRepoUrl(url);
    handleAnalyze(url);
  }, [handleAnalyze]);

  // ── Export ────────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (!analyzed) return;
    const lines = [
      `# GitMind Analysis: ${repoName}`,
      `> Generated ${new Date().toLocaleString()}`, '',
      '## Architecture', '```mermaid', diagram || '(no diagram)', '```', '',
      '## API Endpoints', '',
      ...(apiDocs.length ? apiDocs.map(e => `- **${e.method||''}** \`${e.route||''}\` — ${e.description||''}`) : ['No endpoints detected.']),
      '', '## Security Findings', '',
      ...(findings.length ? findings.map(f => `### [${(f.severity||'info').toUpperCase()}] ${f.rule||f.check||'Finding'}\n${f.description||f.message||''}\n${f.file ? `File: ${f.file}${f.line ? `:${f.line}` : ''}` : ''}`) : ['No findings.']),
      '', '---', `_Scanned in ${elapsedSec}s by GitMind_`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `gitmind-${repoName}-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
    addToast({ kind: 'success', title: 'Report exported', sub: `${repoName}.md` });
    addRecent({ id: 'action:export', label: 'Export report', sub: 'Action', icon: 'download' });
  }, [analyzed, repoName, diagram, apiDocs, findings, elapsedSec, addToast, addRecent]);

  // ── Generate fix ──────────────────────────────────────────────────────────────
  const handleFix = useCallback(async (finding) => {
    setFixLoading(finding.id ?? finding.rule);
    setFixResult(null);
    try {
      const data = await generateFix(SESSION_ID, finding);
      setFixResult({ ...data, finding_id: finding.id ?? finding.rule });
      addToast({ kind: 'success', title: 'Fix generated', sub: finding.rule || finding.id });
    } catch (err) {
      addToast({ kind: 'danger', title: 'Fix generation failed', sub: err.message });
    } finally {
      setFixLoading(null);
    }
  }, [addToast]);

  // ── Share ─────────────────────────────────────────────────────────────────────
  const handleShare = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?share=${SESSION_ID}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
      addToast({ kind: 'success', title: 'Link copied', sub: 'Share URL in clipboard' });
      addRecent({ id: 'action:share', label: 'Share analysis', sub: 'Action', icon: 'share' });
    }).catch(() => { window.prompt('Copy this link:', url); });
  }, [addToast, addRecent]);

  const clearPrAutoUrl = useCallback(() => setPrAutoUrl(null), []);

  // ── Palette action handler ─────────────────────────────────────────────────────
  const handlePaletteAction = useCallback((action) => {
    setShowPalette(false);
    if (action.tab)     { setActiveTab(action.tab); addRecent(action); }
    if (action.density) { setDensity(action.density); addRecent(action); }
    if (action.theme)   { setTheme(action.theme); addRecent(action); }
    if (action.id === 'action:share')  handleShare();
    if (action.id === 'action:export') handleExport();
    if (action.repo)    { handleSelectRepo(action.repo.url); addRecent(action); }
    if (action.id === 'action:kbhelp') setShowKbHelp(true);
  }, [addRecent, handleShare, handleExport, handleSelectRepo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab metadata ──────────────────────────────────────────────────────────────
  const hasCritical    = findings.some(f => f.severity === 'critical');
  const hasCveCritical = cveFindings.some(f => f.worst_severity === 'critical');
  const selectedRepo   = repos.find(r => r.url === selectedRepoUrl) ?? null;

  const tabs = [
    { key: 'summary',  Icon: BarChart3,      label: 'Summary' },
    { key: 'diagram',  Icon: GitBranch,       label: 'Architecture' },
    { key: 'docs',     Icon: FileCode2,       label: 'API Docs',    count: apiDocs.length    || null },
    { key: 'security', Icon: ShieldAlert,     label: 'Security',    count: findings.length   || null, alert: hasCritical },
    { key: 'cve',      Icon: Lock,            label: 'CVE',         count: cveFindings.length|| null, alert: hasCveCritical },
    { key: 'pr',       Icon: GitPullRequest,  label: 'PR Review' },
    { key: 'chat',     Icon: MessageSquare,   label: 'Chat' },
  ];

  // ── Status text ───────────────────────────────────────────────────────────────
  const statusClass = analyzed ? 'done' : isAnalyzing ? 'running' : '';
  const statusText  = analyzed
    ? `Done · ${elapsedSec}s`
    : isAnalyzing
    ? `Analyzing · ${elapsedSec}s`
    : 'Ready';

  const isMac = /Mac/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="app">
      {/* ── Command Bar ──────────────────────────────────────────────────────── */}
      <div className="command-bar">
        {/* Username input */}
        <div className="cb-input">
          <Search size={14} />
          <input
            ref={usernameRef}
            placeholder="github username"
            value={githubUser}
            onChange={e => { setGithubUser(e.target.value); setReposError(null); }}
            onKeyDown={e => { if (e.key === 'Enter' && !reposLoading && !isAnalyzing) handleLoadRepos(); }}
            disabled={isAnalyzing}
          />
        </div>

        {/* Load button */}
        <button
          className="btn btn-ghost"
          onClick={() => handleLoadRepos()}
          disabled={reposLoading || isAnalyzing || !githubUser.trim()}
        >
          <FolderOpen size={13} />
          {reposLoading ? 'Loading…' : 'Load Repos'}
        </button>

        {/* Command palette button */}
        <button className="btn-icon" title={`${mod}+K`} onClick={() => setShowPalette(true)}>
          <Command size={14} />
        </button>

        <span style={{ flex: 1 }} />

        {/* Status */}
        <span className={`cb-status ${statusClass}`}>{statusText}</span>

        {/* Share */}
        <button
          className="btn-icon"
          onClick={handleShare}
          disabled={!analyzed}
          title="Share analysis"
        >
          {shareCopied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Share2 size={14} />}
        </button>

        {/* Export */}
        <button
          className="btn-icon"
          onClick={handleExport}
          disabled={!analyzed}
          title="Export report"
        >
          <Download size={14} />
        </button>

        {/* Theme switcher */}
        <ThemeSwitcher theme={theme} onChange={setTheme} />

        {/* Wordmark */}
        <span className="cb-wordmark">GitMind</span>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="body" style={{ gridTemplateColumns: `auto 1fr` }}>

        {/* Sidebar */}
        <Sidebar
          repos={repos}
          onSelect={handleSelectRepo}
          selectedUrl={selectedRepoUrl}
          loading={reposLoading}
          error={reposError}
          history={repoHistory}
          onHistorySelect={url => { setSelectedRepoUrl(url); handleAnalyze(url); }}
          agentStatus={agentStatus}
          isAnalyzing={isAnalyzing}
          analyzed={analyzed}
          elapsedSec={elapsedSec}
          repoName={repoName}
          onLoadUser={handleLoadRepos}
          currentUser={githubUser || loadedUsers[0] || ''}
          loadedUsers={loadedUsers}
        />

        {/* Main panel */}
        <div className="main">

          {/* Tab rail */}
          <div className="tab-rail" role="tablist">
            {tabs.map(({ key, Icon, label, count, alert }) => (
              <button
                key={key}
                className={`tab${activeTab === key ? ' active' : ''}`}
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setActiveTab(key)}
              >
                <Icon size={13} strokeWidth={1.5} />
                {label}
                {count > 0 && (
                  <span className={`tab-badge${alert ? ' danger' : ''}`}>{count}</span>
                )}
              </button>
            ))}
            <div className="tab-rail-right">
              <button className="btn-icon" onClick={handleShare} disabled={!analyzed} title="Share">
                {shareCopied ? <Check size={13} style={{ color: 'var(--success)' }} /> : <Share2 size={13} />}
              </button>
              <button className="btn-icon" onClick={handleExport} disabled={!analyzed} title="Export">
                <Download size={13} />
              </button>
            </div>
          </div>

          {/* Error banners */}
          {globalError && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{globalError}</span>
              <button className="btn-icon" onClick={() => setGlobalError(null)}><X size={12} /></button>
            </div>
          )}
          {agentWarnings.map((w, i) => (
            <div key={i} className="error-banner" role="status" style={{ borderColor: 'rgba(234,179,8,0.2)', background: 'rgba(234,179,8,0.06)', color: '#fcd34d' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{w}</span>
              <button className="btn-icon" onClick={() => setAgentWarnings(p => p.filter((_, j) => j !== i))}><X size={12} /></button>
            </div>
          ))}

          {/* Repo meta strip */}
          {selectedRepo && analyzed && (
            <div className="meta-strip">
              <a href={selectedRepo.url} target="_blank" rel="noopener noreferrer">
                {selectedRepo.full_name}
              </a>
              <span className="meta-sep">·</span>
              {selectedRepo.language && (
                <>
                  <span className="lang-dot" style={{ background: LANG_COLOR[selectedRepo.language] || '#64748b', width: 8, height: 8 }} />
                  {selectedRepo.language}
                  <span className="meta-sep">·</span>
                </>
              )}
              {selectedRepo.stars > 0 && <><span>★ {selectedRepo.stars.toLocaleString()}</span><span className="meta-sep">·</span></>}
              {selectedRepo.fork && <><span>fork</span><span className="meta-sep">·</span></>}
              <span>Updated {new Date(selectedRepo.updated_at).toLocaleDateString()}</span>
            </div>
          )}

          {/* Tab content */}
          <div className="tab-content" role="tabpanel">
            {showOnboarding && !repos.length ? (
              <Onboarding onLoad={handleLoadRepos} onAnalyzeUrl={handleSelectRepo} />
            ) : (
              <>
                {activeTab === 'summary'  && <SummaryTab  sessionId={SESSION_ID} enabled={analyzed} repoName={repoName} findings={findings} apiDocs={apiDocs} elapsedSec={elapsedSec} isAnalyzing={isAnalyzing} />}
                {activeTab === 'diagram'  && <DiagramTab  diagram={diagram}   isAnalyzing={isAnalyzing} analyzed={analyzed} />}
                {activeTab === 'docs'     && <DocsTab     docs={apiDocs}      isAnalyzing={isAnalyzing} analyzed={analyzed} onPickFile={setFilePreview} />}
                {activeTab === 'security' && <SecurityTab findings={findings} isAnalyzing={isAnalyzing} analyzed={analyzed} onCrisis={setCrisisFinding} onFix={handleFix} fixLoading={fixLoading} fixResult={fixResult} onPickFile={setFilePreview} />}
                {activeTab === 'cve'      && <CveTab      findings={cveFindings} isAnalyzing={isAnalyzing} analyzed={analyzed} />}
                {activeTab === 'pr'       && <PRReviewTab prAutoUrl={prAutoUrl} onAutoUrlUsed={clearPrAutoUrl} />}
                {activeTab === 'chat'     && <ChatTab     sessionId={SESSION_ID} enabled={analyzed} repoName={repoName} />}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Status Bar ───────────────────────────────────────────────────────── */}
      <div className="status-bar">
        {selectedRepo && (
          <>
            <span className="status-item">
              <GitBranch size={11} />
              {selectedRepo.full_name}
            </span>
            <span className="status-sep">·</span>
          </>
        )}
        {analyzed && (
          <>
            <span className="status-item green">
              <Check size={11} />
              {Object.values(agentStatus).filter(s => s === 'done').length}/6 agents
            </span>
            {hasCritical && (
              <><span className="status-sep">·</span>
              <span className="status-item danger">
                <AlertTriangle size={11} />
                {findings.filter(f => f.severity === 'critical').length} critical
              </span></>
            )}
          </>
        )}
        {isAnalyzing && (
          <span className="status-item warn">
            <span className="spinner" style={{ width: 10, height: 10 }} />
            Analyzing…
          </span>
        )}
        <span className="status-spacer" />
        <button
          className="status-item button"
          onClick={() => setShowPalette(true)}
          title={`${mod}+K`}
        >
          <span className="status-kbd">
            <span className="k">{mod}</span>
            <span className="k">K</span>
          </span>
          palette
        </button>
        <span className="status-sep">·</span>
        <button
          className="status-item button"
          onClick={() => setShowKbHelp(true)}
          title="Keyboard shortcuts"
        >
          <span className="status-kbd"><span className="k">?</span></span>
          shortcuts
        </button>
      </div>

      {/* ── Overlays ──────────────────────────────────────────────────────────── */}
      {crisisFinding && (
        <CrisisChat finding={crisisFinding} sessionId={SESSION_ID} onClose={() => setCrisisFinding(null)} />
      )}
      <KeyboardHelp open={showKbHelp} onClose={() => setShowKbHelp(false)} />
      <FilePreviewDrawer path={filePreview?.path} line={filePreview?.line} repoUrl={selectedRepoUrl} onClose={() => setFilePreview(null)} />
      <CommandPalette
        open={showPalette}
        onClose={() => setShowPalette(false)}
        onAction={handlePaletteAction}
        repos={repos}
        recents={recents}
        theme={theme}
        density={density}
      />
      <ToastSystem toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
