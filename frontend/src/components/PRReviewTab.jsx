import React, { useState, useEffect } from 'react';
import { GitPullRequest, ChevronDown, Check, AlertTriangle, MessageSquare, TrendingUp, TrendingDown, Minus, ShieldAlert, Package } from 'lucide-react';
import { reviewPR, prImpact } from '../api';

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

function ImpactPanel({ impact, loading, error }) {
  if (loading) return (
    <div style={{ marginTop: 16 }}>
      {[0,1,2].map(i => (
        <div key={i} className="sk-row"><div className="sk-row-line">
          <span className="sk" style={{ height: 14, width: 60 }} />
          <span className="sk" style={{ height: 14, width: '50%' }} />
        </div></div>
      ))}
    </div>
  );
  if (error) return (
    <div className="error-banner" style={{ marginTop: 12, borderRadius: 6 }}>
      <AlertTriangle size={13} strokeWidth={1.5} /><span>{error}</span>
    </div>
  );
  if (!impact) return null;

  const delta = impact.health_delta ?? 0;
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const deltaColor = delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text-3)';

  return (
    <div style={{ marginTop: 20, padding: '16px 20px', background: 'var(--surface-1)', borderRadius: 10, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <TrendingUp size={11} strokeWidth={1.5} />
        IMPACT PREVIEW · {impact.head_ref} ({impact.head_sha})
      </div>

      {/* Health score delta */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 120, padding: '10px 14px', background: 'var(--surface-0)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>BASE SCORE</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{impact.base_score}<span style={{ fontSize: 13, color: 'var(--text-3)' }}> ({impact.base_grade})</span></div>
        </div>
        <div style={{ flex: 1, minWidth: 120, padding: '10px 14px', background: 'var(--surface-0)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>PR SCORE</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{impact.pr_score}<span style={{ fontSize: 13, color: 'var(--text-3)' }}> ({impact.pr_grade})</span></div>
        </div>
        <div style={{ flex: 1, minWidth: 120, padding: '10px 14px', background: 'var(--surface-0)', borderRadius: 8, border: `1px solid ${deltaColor}40` }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>DELTA</div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: deltaColor, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DeltaIcon size={18} strokeWidth={2} />
            {delta > 0 ? `+${delta}` : delta}
          </div>
        </div>
      </div>

      {/* Findings delta */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        {impact.new_findings?.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--danger)', padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
            <ShieldAlert size={11} strokeWidth={1.5} />
            +{impact.new_findings.length} new finding{impact.new_findings.length !== 1 ? 's' : ''}
          </div>
        )}
        {impact.fixed_findings?.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--success)', padding: '6px 10px', background: 'rgba(34,197,94,0.08)', borderRadius: 6 }}>
            <Check size={11} strokeWidth={2} />
            {impact.fixed_findings.length} finding{impact.fixed_findings.length !== 1 ? 's' : ''} fixed
          </div>
        )}
        {impact.new_cves?.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--warning)', padding: '6px 10px', background: 'rgba(234,179,8,0.08)', borderRadius: 6 }}>
            <Package size={11} strokeWidth={1.5} />
            +{impact.new_cves.length} new CVE{impact.new_cves.length !== 1 ? 's' : ''}
          </div>
        )}
        {impact.fixed_cves?.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--success)', padding: '6px 10px', background: 'rgba(34,197,94,0.08)', borderRadius: 6 }}>
            <Check size={11} strokeWidth={2} />
            {impact.fixed_cves.length} CVE{impact.fixed_cves.length !== 1 ? 's' : ''} resolved
          </div>
        )}
        {!impact.new_findings?.length && !impact.fixed_findings?.length && !impact.new_cves?.length && !impact.fixed_cves?.length && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 10px' }}>No security changes detected in this PR</div>
        )}
      </div>

      {/* Per-dimension breakdown */}
      {impact.breakdown_delta && Object.values(impact.breakdown_delta).some(v => v !== 0) && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8 }}>SCORE BREAKDOWN</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(impact.breakdown_delta).map(([k, v]) => (
              v !== 0 && (
                <div key={k} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: v > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: v > 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {k.replace(/_/g, ' ')}: {v > 0 ? `+${v}` : v}
                </div>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PRReviewTab({ prAutoUrl, onAutoUrlUsed, sessionId, analyzed }) {
  const [prUrl,       setPrUrl]       = useState('');
  const [token,       setToken]       = useState(() => sessionStorage.getItem('gm-gh-token') || '');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [result,      setResult]      = useState(null);
  const [impact,      setImpact]      = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError,   setImpactError]   = useState(null);

  // Auto-fill + trigger review when a PR URL is pasted anywhere
  useEffect(() => {
    if (!prAutoUrl) return;
    setPrUrl(prAutoUrl);
    onAutoUrlUsed?.();
    const t = setTimeout(() => {
      setError(null);
      setLoading(true);
      setResult(null);
      reviewPR(prAutoUrl, token || undefined)
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
    setImpact(null);
    setImpactError(null);
    try {
      const data = await reviewPR(url, token || undefined);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImpact = async () => {
    const url = prUrl.trim();
    if (!url) { setImpactError('Enter a GitHub PR URL first.'); return; }
    if (!sessionId || !analyzed) { setImpactError('Analyze a repository first to use as the base.'); return; }
    setImpactError(null);
    setImpact(null);
    setImpactLoading(true);
    try {
      const data = await prImpact(url, sessionId, token || null);
      setImpact(data);
    } catch (err) {
      setImpactError(err.message);
    } finally {
      setImpactLoading(false);
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
        {analyzed && (
          <button className="btn btn-ghost" onClick={handleImpact} disabled={impactLoading || !prUrl.trim()} title="Compare PR head branch against current analysis">
            {impactLoading ? <><span className="spinner" /> Predicting…</> : <><TrendingUp size={13} strokeWidth={1.5} /> Predict Impact</>}
          </button>
        )}
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
          onChange={e => { setToken(e.target.value); sessionStorage.setItem('gm-gh-token', e.target.value); }}
        />
      )}

      {error && (
        <div className="error-banner" style={{ marginBottom: 16, marginTop: 8, borderRadius: 6 }}>
          <AlertTriangle size={13} strokeWidth={1.5} />
          <span>{error}</span>
        </div>
      )}

      {/* Impact panel */}
      <ImpactPanel impact={impact} loading={impactLoading} error={impactError} />

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
