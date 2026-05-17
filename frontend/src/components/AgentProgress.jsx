import React, { useState, useEffect, useRef } from 'react';

const AGENTS = [
  { key: 'scanner',      icon: '🔍', name: 'Repo Scanner',       desc: 'Cloning & indexing files',           color: '#06b6d4' },
  { key: 'architecture', icon: '🏗',  name: 'Architecture Agent', desc: 'Mapping codebase structure',         color: '#6366f1' },
  { key: 'api_docs',     icon: '📋',  name: 'API Doc Agent',      desc: 'Finding all endpoints',              color: '#8b5cf6' },
  { key: 'security',     icon: '🛡',  name: 'Security Auditor',   desc: 'Scanning for vulnerabilities',       color: '#f59e0b' },
  { key: 'cve_scanner',  icon: '🔒',  name: 'CVE Scanner',        desc: 'Checking dependency vulnerabilities', color: '#f97316' },
  { key: 'chat',         icon: '💬',  name: 'Knowledge Agent',    desc: 'Building searchable brain',          color: '#10b981' },
];

function useAgentTimers(status) {
  const startTimes = useRef({});
  const finalTimes = useRef({});
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    AGENTS.forEach(({ key }) => {
      if (status[key] === 'running' && !startTimes.current[key]) {
        startTimes.current[key] = Date.now();
        delete finalTimes.current[key];
      }
      if (status[key] === 'done' && startTimes.current[key] && finalTimes.current[key] == null) {
        finalTimes.current[key] = Math.floor((Date.now() - startTimes.current[key]) / 1000);
      }
      if (status[key] === 'waiting') {
        delete startTimes.current[key];
        delete finalTimes.current[key];
      }
    });
  });

  return (key) => {
    if (status[key] === 'done'    && finalTimes.current[key] != null) return `${finalTimes.current[key]}s`;
    if (status[key] === 'running' && startTimes.current[key])
      return `${Math.floor((Date.now() - startTimes.current[key]) / 1000)}s`;
    return null;
  };
}

function AgentCard({ agent, statusVal, elapsed, isLast }) {
  const { icon, name, desc, color } = agent;
  const isDone    = statusVal === 'done';
  const isRunning = statusVal === 'running';

  return (
    <div>
      <div
        className={isRunning ? 'agent-running-border agent-glow' : ''}
        style={{
          display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 12,
          background: isDone ? 'rgba(16,185,129,0.04)' : isRunning ? 'rgba(15,22,41,0.95)' : 'rgba(15,22,41,0.55)',
          border: isRunning ? undefined : isDone ? '1px solid rgba(16,185,129,0.2)' : '1px solid var(--gm-border)',
          transition: 'background 0.4s, border-color 0.4s',
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          background: isDone ? 'rgba(16,185,129,0.15)' : isRunning ? `${color}20` : 'rgba(255,255,255,0.03)',
          border: `1px solid ${isDone ? 'rgba(16,185,129,0.3)' : isRunning ? `${color}45` : 'var(--gm-border)'}`,
          transition: 'all 0.4s',
        }}>
          {isDone
            ? <span className="check-pop" style={{ color: '#6ee7b7', fontWeight: 700, fontSize: 14 }}>✓</span>
            : icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: isDone ? '#a7f3d0' : isRunning ? '#f1f5f9' : '#64748b',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.3s',
          }}>{name}</div>
          <div style={{ fontSize: 10, color: 'var(--gm-text-3)', marginTop: 1 }}>{desc}</div>
        </div>
        <div style={{
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
          background: isDone ? 'rgba(16,185,129,0.12)' : isRunning ? 'rgba(245,158,11,0.12)' : 'rgba(71,85,105,0.2)',
          color:      isDone ? '#6ee7b7'                : isRunning ? '#fcd34d'                : '#475569',
          border: `1px solid ${isDone ? 'rgba(16,185,129,0.2)' : isRunning ? 'rgba(245,158,11,0.2)' : 'transparent'}`,
        }}>
          {isRunning && <span style={{ width: 5, height: 5, borderRadius: '50%', flexShrink: 0, background: '#fcd34d', boxShadow: '0 0 6px #fcd34d', animation: 'gm-glow-pulse 1s ease-in-out infinite' }} />}
          {isDone ? `Done${elapsed ? ` · ${elapsed}` : ''}` : isRunning ? (elapsed || '0s') : 'Waiting'}
        </div>
      </div>
      {!isLast && (
        <div style={{ marginLeft: 28, width: 1, height: 7, background: isDone ? 'linear-gradient(to bottom,rgba(16,185,129,0.4),rgba(16,185,129,0.08))' : 'rgba(30,45,74,0.7)', transition: 'background 0.5s' }} />
      )}
    </div>
  );
}

export default function AgentProgress({ status, isAnalyzing, analyzed, elapsedSec, repoName }) {
  const getElapsed = useAgentTimers(status);
  const doneCount  = AGENTS.filter(a => status[a.key] === 'done').length;
  const pct        = Math.round((doneCount / AGENTS.length) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '18px 14px 12px', borderBottom: '1px solid var(--gm-border)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gm-text-3)', marginBottom: 10 }}>Agent Activity</div>
        <div style={{ height: 3, background: 'rgba(30,45,74,0.8)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, background: pct === 100 ? 'var(--gm-success)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)', width: `${pct}%`, transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1),background 0.5s', boxShadow: pct > 0 ? (pct === 100 ? '0 0 8px rgba(16,185,129,0.5)' : '0 0 8px rgba(99,102,241,0.45)') : 'none' }} />
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--gm-text-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{doneCount}/{AGENTS.length} complete</span>
          {isAnalyzing && elapsedSec > 0 && <span style={{ color: 'var(--gm-warning)', fontFamily: 'JetBrains Mono,monospace', fontSize: 10 }}>⏱ {elapsedSec}s</span>}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 10px 0' }}>
        {AGENTS.map((a, i) => (
          <AgentCard key={a.key} agent={a} statusVal={status[a.key] || 'waiting'} elapsed={getElapsed(a.key)} isLast={i === AGENTS.length - 1} />
        ))}
      </div>
      <div style={{ padding: '12px 10px', flexShrink: 0 }}>
        {analyzed ? (
          <div className="fade-up" style={{ padding: '11px 13px', borderRadius: 10, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6ee7b7', marginBottom: 3 }}>✓ Analysis complete</div>
            <div style={{ fontSize: 11, color: 'var(--gm-text-3)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {repoName && <span>📦 {repoName}</span>}
              {elapsedSec > 0 && <span>⚡ {elapsedSec}s</span>}
            </div>
          </div>
        ) : (
          <div style={{ padding: '11px 13px', borderRadius: 10, background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.1)' }}>
            <div style={{ fontSize: 11, color: 'var(--gm-text-3)', lineHeight: 1.65 }}>
              {isAnalyzing ? 'Four agents run in parallel after Scanner finishes.' : <>Paste a GitHub URL and click <strong style={{ color: 'var(--gm-primary)' }}>⚡ Analyze</strong>.</>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
