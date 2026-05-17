import React, { useState, useMemo } from 'react';

const SEV = {
  critical: { label: 'Critical', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.25)',  icon: '🔴' },
  high:     { label: 'High',     color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.25)', icon: '🟠' },
  medium:   { label: 'Medium',   color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', icon: '🟡' },
  low:      { label: 'Low',      color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',  border: 'rgba(6,182,212,0.25)',  icon: '🔵' },
};
const SEV_ORDER = ['critical', 'high', 'medium', 'low'];

function SeverityBadge({ severity }) {
  const s = SEV[severity?.toLowerCase()] ?? SEV.low;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`, flexShrink: 0,
    }}>
      {s.icon} {s.label}
    </span>
  );
}

function EcoBadge({ ecosystem }) {
  const colors = { PyPI: '#3572A5', npm: '#cc3534', 'crates.io': '#dea584', Go: '#00ADD8' };
  const bg = colors[ecosystem] ?? '#64748b';
  return (
    <span style={{
      padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
      background: `${bg}22`, color: bg, border: `1px solid ${bg}44`, flexShrink: 0,
    }}>
      {ecosystem}
    </span>
  );
}

function VulnRow({ vuln }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0',
      borderBottom: '1px solid rgba(30,45,74,0.5)',
    }}>
      <SeverityBadge severity={vuln.severity} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <a
            href={vuln.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#818cf8', fontWeight: 700, textDecoration: 'none' }}
            onClick={e => e.stopPropagation()}
          >
            {vuln.id}
          </a>
          {vuln.fixed_in && (
            <span style={{
              fontSize: 10, padding: '1px 7px', borderRadius: 4,
              background: 'rgba(16,185,129,0.1)', color: '#6ee7b7',
              border: '1px solid rgba(16,185,129,0.2)',
            }}>
              Fix: {vuln.fixed_in}
            </span>
          )}
        </div>
        {vuln.summary && (
          <div style={{ fontSize: 12, color: 'var(--gm-text-3)', marginTop: 3, lineHeight: 1.5 }}>
            {vuln.summary}
          </div>
        )}
      </div>
    </div>
  );
}

function PackageCard({ pkg, idx }) {
  const [expanded, setExpanded] = useState(false);
  const sev    = pkg.worst_severity?.toLowerCase() ?? 'low';
  const sevInfo = SEV[sev] ?? SEV.low;

  return (
    <div
      className={`gm-card severity-${sev} fade-up stagger-${Math.min(idx + 1, 10)}`}
      style={{ padding: '13px 16px', cursor: 'pointer', transition: 'background 0.2s' }}
      onClick={() => setExpanded(e => !e)}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--gm-surface-2)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--gm-surface)'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <SeverityBadge severity={pkg.worst_severity} />
        <EcoBadge ecosystem={pkg.ecosystem} />
        <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: '#f1f5f9', fontWeight: 700 }}>
          {pkg.package}
        </code>
        <span style={{ fontSize: 11, color: 'var(--gm-text-3)' }}>@{pkg.version}</span>
        <span style={{
          marginLeft: 'auto', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700,
          background: `${sevInfo.color}15`, color: sevInfo.color, border: `1px solid ${sevInfo.color}30`,
        }}>
          {pkg.vuln_count} {pkg.vuln_count === 1 ? 'vuln' : 'vulns'}
        </span>
        <span style={{
          color: 'var(--gm-text-3)', fontSize: 11, flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s',
        }}>▼</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--gm-text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Known Vulnerabilities
          </div>
          {pkg.vulns.map(v => <VulnRow key={v.id} vuln={v} />)}
        </div>
      )}
    </div>
  );
}

function SummaryBar({ findings }) {
  const counts = SEV_ORDER.reduce((acc, s) => {
    acc[s] = findings.filter(f => f.worst_severity?.toLowerCase() === s).length;
    return acc;
  }, {});
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
      {SEV_ORDER.map(s => {
        if (!counts[s]) return null;
        const info = SEV[s];
        return (
          <div key={s} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999,
            background: info.bg, border: `1px solid ${info.border}`,
            fontSize: 12, fontWeight: 700, color: info.color,
          }}>
            {info.icon} {counts[s]} {info.label}
          </div>
        );
      })}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map(i => (
        <div key={i} className="gm-card" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="skeleton" style={{ width: 72, height: 20, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: 40, height: 20, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: 120, height: 16, borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CveTab({ findings, isAnalyzing, analyzed }) {
  const [filter, setFilter] = useState('all');

  const sorted = useMemo(() => {
    const list = findings?.length
      ? (filter === 'all' ? findings : findings.filter(f => f.worst_severity?.toLowerCase() === filter))
      : [];
    return [...list].sort((a, b) => {
      const ai = SEV_ORDER.indexOf(a.worst_severity?.toLowerCase());
      const bi = SEV_ORDER.indexOf(b.worst_severity?.toLowerCase());
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [findings, filter]);

  if (!analyzed && !isAnalyzing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <div style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--gm-surface)', border: '2px dashed var(--gm-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🔒</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gm-text-2)', marginBottom: 6 }}>No CVE data yet</div>
          <div style={{ fontSize: 13, color: 'var(--gm-text-3)' }}>Analyze a repository to scan dependencies against OSV.dev</div>
        </div>
      </div>
    );
  }

  if (isAnalyzing && !findings?.length) {
    return (
      <div>
        <div style={{ fontSize: 13, color: '#fcd34d', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ animation: 'gm-glow-pulse 1.5s ease-in-out infinite', display: 'inline-block' }}>🔒</span>
          CVE Scanner is querying OSV.dev for known vulnerabilities…
        </div>
        <Skeleton />
      </div>
    );
  }

  if (analyzed && !findings?.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12 }}>
        <div style={{ fontSize: 48 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#6ee7b7' }}>No known CVEs found</div>
        <div style={{ fontSize: 13, color: 'var(--gm-text-3)' }}>All scanned dependencies are clean in OSV.dev.</div>
        <div style={{ fontSize: 11, color: 'var(--gm-text-3)', marginTop: 4 }}>Scans: requirements.txt · package-lock.json · Cargo.lock · go.sum</div>
      </div>
    );
  }

  const totalVulns = findings?.reduce((s, f) => s + f.vuln_count, 0) ?? 0;
  const countFor = s => s === 'all' ? (findings?.length ?? 0) : (findings?.filter(f => f.worst_severity?.toLowerCase() === s).length ?? 0);

  return (
    <div>
      <SummaryBar findings={findings ?? []} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['all', 'All Packages'], ...SEV_ORDER.map(s => [s, SEV[s].label])].map(([key, label]) => {
            const count  = countFor(key);
            if (key !== 'all' && !count) return null;
            const active = filter === key;
            const info   = SEV[key];
            return (
              <button key={key} onClick={() => setFilter(key)} style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                background: active ? (info?.bg || 'var(--gm-primary-20)') : 'rgba(255,255,255,0.04)',
                color:      active ? (info?.color || 'var(--gm-primary)') : 'var(--gm-text-3)',
                border: `1px solid ${active ? (info?.border || 'var(--gm-primary-30)') : 'var(--gm-border)'}`,
                transition: 'all 0.15s',
              }}>
                {label} · {count}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--gm-text-3)' }}>
          {totalVulns} total {totalVulns === 1 ? 'vulnerability' : 'vulnerabilities'} · powered by{' '}
          <a href="https://osv.dev" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gm-primary)' }}>OSV.dev</a>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--gm-text-3)', marginBottom: 12 }}>
        💡 Click any package to see individual CVEs and suggested fix versions
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.map((pkg, i) => (
          <PackageCard key={`${pkg.package}-${pkg.version}`} pkg={pkg} idx={i} />
        ))}
      </div>
    </div>
  );
}
