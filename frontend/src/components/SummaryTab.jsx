import React, { useState, useEffect } from 'react';
import { fetchSummary } from '../api';

const SEV_COLOR = {
  critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#06b6d4',
};

export default function SummaryTab({ sessionId, enabled, repoName, findings, apiDocs, elapsedSec }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!enabled || data || loading) return;
    setLoading(true);
    fetchSummary(sessionId)
      .then(d => setData(d))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--gm-surface)', border: '2px dashed var(--gm-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>📊</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gm-text-2)', marginBottom: 6 }}>Summary unlocks after analysis</div>
          <div style={{ fontSize: 13, color: 'var(--gm-text-3)' }}>Select a repo and run analysis to get an executive summary</div>
        </div>
      </div>
    );
  }

  const nCritical = findings.filter(f => f.severity?.toLowerCase() === 'critical').length;
  const nHigh     = findings.filter(f => f.severity?.toLowerCase() === 'high').length;
  const nMedium   = findings.filter(f => f.severity?.toLowerCase() === 'medium').length;
  const nLow      = findings.length - nCritical - nHigh - nMedium;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', paddingTop: 8 }}>

      {/* Summary card */}
      <div style={{ marginBottom: 20, padding: '20px 22px', borderRadius: 14, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gm-primary)', marginBottom: 12 }}>
          Executive Summary · {repoName}
        </div>
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--gm-text-3)', fontSize: 13 }}>
            <span style={{ display: 'flex', gap: 4 }}>
              {[0, 150, 300].map(d => (
                <span key={d} className="dot-bounce" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gm-primary)', display: 'inline-block', animationDelay: `${d}ms` }} />
              ))}
            </span>
            Generating summary…
          </div>
        )}
        {error && <div style={{ color: '#fca5a5', fontSize: 13 }}>⚠ {error}</div>}
        {data && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: 'var(--gm-text-1)' }}>
            {data.summary}
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Endpoints',  value: apiDocs.length || 0,           icon: '📋', color: '#8b5cf6' },
          { label: 'Findings',   value: findings.length || 0,          icon: '🛡', color: nCritical > 0 ? '#ef4444' : nHigh > 0 ? '#f97316' : '#10b981' },
          { label: 'Scan time',  value: elapsedSec > 0 ? `${elapsedSec}s` : '—', icon: '⚡', color: '#06b6d4' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ padding: 16, borderRadius: 12, background: 'var(--gm-surface)', border: '1px solid var(--gm-border)', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 2 }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--gm-text-3)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Severity breakdown */}
      {findings.length > 0 && (
        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--gm-surface)', border: '1px solid var(--gm-border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gm-text-3)', marginBottom: 10 }}>
            Security Breakdown
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[['critical', nCritical], ['high', nHigh], ['medium', nMedium], ['low', nLow]].map(([sev, count]) =>
              count > 0 ? (
                <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, background: `${SEV_COLOR[sev]}18`, border: `1px solid ${SEV_COLOR[sev]}40` }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: SEV_COLOR[sev], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: SEV_COLOR[sev], textTransform: 'capitalize' }}>{sev}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: SEV_COLOR[sev] }}>{count}</span>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  );
}
