import React, { useState, useEffect } from 'react';
import { GitPullRequest, ChevronDown, Check, AlertTriangle, MessageSquare } from 'lucide-react';
import { reviewPR } from '../api';

const VERDICT_CLASS = {
  'APPROVE':          'approve',
  'REQUEST CHANGES':  'changes',
  'NEEDS DISCUSSION': 'discuss',
};

function parseReview(text) {
  const sections = { summary: '', issues: [], verdict: '', verdictLine: '' };
  const lines = text.split('\n');
  let current = null;
  for (const line of lines) {
    if (line.startsWith('## Summary')) { current = 'summary'; continue; }
    if (line.startsWith('## Issues'))  { current = 'issues'; continue; }
    if (line.startsWith('## Verdict')) { current = 'verdict'; continue; }
    if (current === 'summary') sections.summary += (sections.summary ? '\n' : '') + line;
    if (current === 'issues') {
      const t = line.trim();
      if (!t) continue;
      if (t === 'No significant issues found.') { sections.issues = []; current = null; continue; }
      const m = t.match(/^(.+?):(\d+)\s*[—–-]+\s*\[([A-Z]+)\]\s*(.+?)\s*[—–-]+\s*(.+)$/);
      if (m) sections.issues.push({ file: m[1], line: m[2], severity: m[3], title: m[4], explanation: m[5] });
      else sections.issues.push({ raw: t });
    }
    if (current === 'verdict') sections.verdictLine += (sections.verdictLine ? '\n' : '') + line;
  }
  const vMatch = sections.verdictLine.match(/APPROVE|REQUEST CHANGES|NEEDS DISCUSSION/);
  sections.verdict = vMatch ? vMatch[0] : '';
  return sections;
}

function IssueRow({ issue }) {
  const sev = issue.severity || '';
  const sevClass = sev.toLowerCase();
  if (issue.raw) {
    return (
      <div className={`row ${sevClass || 'low'}`} style={{ cursor: 'default' }}>
        <div className="row-line">
          <div className="row-main">
            <span className="row-sub">{issue.raw}</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`row ${sevClass || 'low'}`} style={{ cursor: 'default' }}>
      <div className="row-line">
        <span className="row-sev">
          <span className="glyph" />
          {sev || 'INFO'}
        </span>
        <div className="row-main">
          <span className="row-title">{issue.title}</span>
          {issue.explanation && <span className="row-sub">{issue.explanation}</span>}
        </div>
        {issue.file && (
          <span className="row-path">{issue.file}:{issue.line}</span>
        )}
      </div>
    </div>
  );
}

export default function PRReviewTab({ prAutoUrl, onAutoUrlUsed }) {
  const [prUrl,       setPrUrl]       = useState('');
  const [token,       setToken]       = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [result,      setResult]      = useState(null);

  // Auto-fill + trigger review when a PR URL is pasted anywhere
  useEffect(() => {
    if (!prAutoUrl) return;
    setPrUrl(prAutoUrl);
    onAutoUrlUsed?.();
    const t = setTimeout(() => {
      setError(null);
      setLoading(true);
      setResult(null);
      reviewPR(prAutoUrl, undefined)
        .then(data => setResult(data))
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }, 120);
    return () => clearTimeout(t);
  }, [prAutoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReview = async () => {
    const url = prUrl.trim();
    if (!url) { setError('Enter a GitHub PR URL.'); return; }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const data = await reviewPR(url, token || undefined);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const parsed = result?.review ? parseReview(result.review) : null;
  const verdictClass = parsed?.verdict ? VERDICT_CLASS[parsed.verdict] : '';

  return (
    <div className="pr-tab">
      {/* Tab header */}
      <div className="tab-header" style={{ position: 'static', marginBottom: 28 }}>
        <div className="tab-header-main">
          <span className="tab-header-icon"><GitPullRequest size={15} strokeWidth={1.5} /></span>
          <div className="tab-header-text">
            <div className="tab-header-title">PR Review</div>
            <div className="tab-header-sub">AI-powered pull request analysis</div>
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="pr-input">
        <input
          className="pr-url"
          placeholder="https://github.com/owner/repo/pull/123"
          value={prUrl}
          onChange={e => { setPrUrl(e.target.value); setError(null); }}
          onKeyDown={e => e.key === 'Enter' && handleReview()}
        />
        <button className="btn btn-primary" onClick={handleReview} disabled={loading || !prUrl.trim()}>
          {loading ? <><span className="spinner" /> Reviewing…</> : 'Review PR'}
        </button>
      </div>

      {/* Advanced toggle */}
      <button className="pr-advanced" onClick={() => setShowAdvanced(o => !o)}>
        <ChevronDown size={12} strokeWidth={1.5} style={{ transform: showAdvanced ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
        Advanced
      </button>

      {showAdvanced && (
        <input
          className="pr-token"
          type="password"
          placeholder="GitHub personal access token (optional)"
          value={token}
          onChange={e => setToken(e.target.value)}
        />
      )}

      {error && (
        <div className="error-banner" style={{ marginBottom: 16, marginTop: 8, borderRadius: 6 }}>
          <AlertTriangle size={13} strokeWidth={1.5} />
          <span>{error}</span>
        </div>
      )}

      {/* Result */}
      {parsed && result && (
        <>
          <div className="pr-result">
            {/* PR Meta */}
            <div className="pr-meta">
              <div>
                <div className="key">REPOSITORY</div>
                <div className="val">{result.repo || '—'}</div>
              </div>
              <div>
                <div className="key">PR NUMBER</div>
                <div className="val mono">#{result.pr_num || '—'}</div>
              </div>
              {(result.additions != null || result.deletions != null) && (
                <div>
                  <div className="key">CHANGES</div>
                  <div className="val mono">
                    <span style={{ color: 'var(--success)' }}>+{result.additions || 0}</span>
                    {' / '}
                    <span style={{ color: 'var(--danger)' }}>-{result.deletions || 0}</span>
                  </div>
                </div>
              )}
              {result.changed_files != null && (
                <div>
                  <div className="key">FILES</div>
                  <div className="val">{result.changed_files} changed</div>
                </div>
              )}
            </div>

            {/* Summary + Verdict */}
            <div className="pr-summary">
              {parsed.summary && (
                <p>{parsed.summary}</p>
              )}

              {parsed.verdict && (
                <div className={`pr-verdict ${verdictClass}`}>
                  <div className="pr-issues-header" style={{ margin: '0 0 8px' }}>
                    <span className="t-label">VERDICT</span>
                  </div>
                  <div className="verdict-line">
                    {verdictClass === 'approve' && <Check size={24} strokeWidth={2} />}
                    {verdictClass === 'changes' && <AlertTriangle size={24} strokeWidth={2} />}
                    {verdictClass === 'discuss' && <MessageSquare size={24} strokeWidth={2} />}
                    {parsed.verdict}
                  </div>
                  {parsed.verdictLine && parsed.verdictLine !== parsed.verdict && (
                    <div className="verdict-just">
                      {parsed.verdictLine.replace(parsed.verdict, '').replace(/[—–:]/g, '').trim()}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Issues */}
          {parsed.issues.length > 0 && (
            <>
              <div className="pr-issues-header">
                <span className="t-label">ISSUES ({parsed.issues.length})</span>
              </div>
              <div className="row-list">
                {parsed.issues.map((issue, i) => (
                  <IssueRow key={i} issue={issue} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ marginTop: 24 }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="sk-row">
              <div className="sk-row-line">
                <span className="sk" style={{ height: 14, width: 78 }} />
                <div className="sk-stack">
                  <span className="sk" style={{ height: 14, width: '60%' }} />
                  <span className="sk" style={{ height: 12, width: '80%' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
