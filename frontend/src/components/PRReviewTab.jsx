import React, { useState } from 'react';
import { reviewPR } from '../api';

function Spinner() {
  return (
    <span style={{ display: 'inline-block', width: 13, height: 13 }}>
      <svg viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite', width: '100%', height: '100%' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          strokeDasharray="40" strokeDashoffset="15" />
      </svg>
    </span>
  );
}

const VERDICT_STYLE = {
  'APPROVE':           { color: '#6ee7b7', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', icon: '✅' },
  'REQUEST CHANGES':   { color: '#fca5a5', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.25)',  icon: '⚠️' },
  'NEEDS DISCUSSION':  { color: '#fcd34d', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', icon: '💬' },
};

const SEV_COLOR = {
  CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#06b6d4',
};

function parseReview(reviewText) {
  const sections = { summary: '', issues: [], verdict: '', verdictLine: '' };
  const lines = reviewText.split('\n');
  let current = null;
  for (const line of lines) {
    if (line.startsWith('## Summary')) { current = 'summary'; continue; }
    if (line.startsWith('## Issues'))  { current = 'issues';  continue; }
    if (line.startsWith('## Verdict')) { current = 'verdict'; continue; }
    if (current === 'summary') sections.summary += (sections.summary ? '\n' : '') + line;
    if (current === 'issues') {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === 'No significant issues found.') { sections.issues = []; current = null; continue; }
      // parse: path/file.ext:LINE — [SEVERITY] Title — explanation
      const m = trimmed.match(/^(.+?):(\d+)\s*[—–-]+\s*\[([A-Z]+)\]\s*(.+?)\s*[—–-]+\s*(.+)$/);
      if (m) {
        sections.issues.push({ file: m[1], line: m[2], severity: m[3], title: m[4], explanation: m[5] });
      } else {
        // fallback: treat as raw text
        sections.issues.push({ raw: trimmed });
      }
    }
    if (current === 'verdict') sections.verdictLine += (sections.verdictLine ? '\n' : '') + line;
  }
  // extract verdict keyword
  const vMatch = sections.verdictLine.match(/APPROVE|REQUEST CHANGES|NEEDS DISCUSSION/);
  sections.verdict = vMatch ? vMatch[0] : '';
  return sections;
}

function IssueRow({ issue }) {
  if (issue.raw) {
    return (
      <div style={{ padding: '9px 0', borderBottom: '1px solid rgba(30,45,74,0.5)', fontSize: 12, color: 'var(--gm-text-2)', lineHeight: 1.5 }}>
        {issue.raw}
      </div>
    );
  }
  const sevColor = SEV_COLOR[issue.severity] ?? '#94a3b8';
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(30,45,74,0.5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{
          padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          background: `${sevColor}18`, color: sevColor, border: `1px solid ${sevColor}35`,
        }}>
          {issue.severity}
        </span>
        <code style={{ fontSize: 11, color: '#818cf8', fontFamily: 'JetBrains Mono, monospace' }}>
          {issue.file}:{issue.line}
        </code>
        <span style={{ fontSize: 12, fontWeight: 600, color: sevColor }}>{issue.title}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--gm-text-3)', lineHeight: 1.6, paddingLeft: 4 }}>
        {issue.explanation}
      </div>
    </div>
  );
}

function ReviewCard({ result }) {
  const parsed = parseReview(result.review ?? '');
  const vStyle = VERDICT_STYLE[parsed.verdict] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', icon: '💬' };

  return (
    <div className="gm-card fade-up" style={{ padding: '20px 22px', marginTop: 20 }}>
      {/* PR meta header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
            <a href={result.pr_url} target="_blank" rel="noopener noreferrer"
              style={{ color: '#818cf8', textDecoration: 'none' }}>
              {result.repo}#{result.pr_num}
            </a>
            {' '}· {result.title}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--gm-text-3)' }}>
            <span>👤 {result.author}</span>
            <span style={{ color: '#6ee7b7' }}>+{result.additions}</span>
            <span style={{ color: '#fca5a5' }}>-{result.deletions}</span>
            <span>{result.changed_files} files</span>
          </div>
        </div>
        {/* Verdict pill */}
        <div style={{
          padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: vStyle.bg, color: vStyle.color, border: `1px solid ${vStyle.border}`,
          flexShrink: 0, whiteSpace: 'nowrap',
        }}>
          {vStyle.icon} {parsed.verdict || 'REVIEWED'}
        </div>
      </div>

      {/* Summary */}
      {parsed.summary.trim() && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gm-text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Summary
          </div>
          <div style={{ fontSize: 13, color: 'var(--gm-text-2)', lineHeight: 1.7, padding: '12px 14px', borderRadius: 8, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)' }}>
            {parsed.summary.trim()}
          </div>
        </div>
      )}

      {/* Issues */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gm-text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          Issues
          <span style={{
            padding: '1px 8px', borderRadius: 999, fontSize: 10,
            background: parsed.issues.length ? 'rgba(249,115,22,0.12)' : 'rgba(16,185,129,0.1)',
            color: parsed.issues.length ? '#f97316' : '#6ee7b7',
          }}>
            {parsed.issues.length || 'None'}
          </span>
        </div>
        {parsed.issues.length === 0
          ? <div style={{ fontSize: 12, color: '#6ee7b7', padding: '10px 0' }}>No significant issues found.</div>
          : parsed.issues.map((iss, i) => <IssueRow key={i} issue={iss} />)
        }
      </div>

      {/* Verdict detail */}
      {parsed.verdictLine.trim() && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: vStyle.bg, border: `1px solid ${vStyle.border}`,
          fontSize: 12, color: vStyle.color, lineHeight: 1.6,
        }}>
          {parsed.verdictLine.replace(/✅|⚠️|💬/g, '').trim()}
        </div>
      )}
    </div>
  );
}

export default function PRReviewTab() {
  const [prUrl,   setPrUrl]   = useState('');
  const [token,   setToken]   = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);

  const handleReview = async () => {
    const url = prUrl.trim();
    if (!url) { setError('Enter a GitHub PR URL.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await reviewPR(url, token.trim() || null);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Input card */}
      <div className="gm-card" style={{ padding: '20px 22px', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 14 }}>
          🔍 Pull Request Review
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            className="gm-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            placeholder="https://github.com/owner/repo/pull/123"
            value={prUrl}
            onChange={e => { setPrUrl(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter' && !loading) handleReview(); }}
            disabled={loading}
            aria-label="GitHub PR URL"
          />
          <input
            className="gm-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            placeholder="GitHub token (optional — raises rate limit to 5 000 req/hr)"
            value={token}
            onChange={e => setToken(e.target.value)}
            type="password"
            disabled={loading}
            aria-label="GitHub token"
          />
          <button
            className="gm-btn-primary"
            style={{ alignSelf: 'flex-start', gap: 8 }}
            onClick={handleReview}
            disabled={loading}
          >
            {loading ? <><Spinner /> Reviewing PR…</> : '🔍 Review PR'}
          </button>
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            fontSize: 12, color: '#fca5a5', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--gm-text-3)', lineHeight: 1.6 }}>
          Fetches the diff from GitHub's API and runs a senior-engineer-level review via LLM.
          Works on any public PR. Private repos require a token with <code style={{ fontSize: 10 }}>repo</code> scope.
        </div>
      </div>

      {result && <ReviewCard result={result} />}
    </div>
  );
}
