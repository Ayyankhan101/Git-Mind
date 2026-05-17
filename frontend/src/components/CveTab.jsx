import React, { useState, useMemo } from 'react';
import { Lock, ExternalLink } from 'lucide-react';

const SEV_ORDER = ['critical', 'high', 'medium', 'low'];

function PkgRow({ pkg }) {
  const [expanded, setExpanded] = useState(false);
  const sev = (pkg.worst_severity || 'low').toLowerCase();
  const vulnCount = pkg.vulnerabilities?.length || 0;

  return (
    <>
      <div className={`row ${sev}`} onClick={() => setExpanded(e => !e)}>
        <div className="row-line">
          <span className="row-sev">
            <span className="glyph" />
            {sev.toUpperCase()}
          </span>
          <div className="row-main">
            <span className="row-title">{pkg.package}@{pkg.version}</span>
            <span className="row-sub">{pkg.ecosystem} · {vulnCount} vuln{vulnCount !== 1 ? 's' : ''}</span>
          </div>
          <span className="row-path">{pkg.ecosystem}</span>
        </div>
      </div>

      {expanded && (
        <div className="row-expand">
          {pkg.vulnerabilities?.map((v, i) => (
            <div key={i} style={{ borderBottom: i < pkg.vulnerabilities.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: i < pkg.vulnerabilities.length - 1 ? 14 : 0, marginBottom: i < pkg.vulnerabilities.length - 1 ? 14 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span className="label">{v.id}</span>
                {v.fix_version && (
                  <span style={{ fontSize: 12, color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                    → {v.fix_version}
                  </span>
                )}
                {v.url && (
                  <a href={v.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                    <ExternalLink size={11} strokeWidth={1.5} /> OSV
                  </a>
                )}
              </div>
              {v.summary && <div className="scenario" style={{ fontStyle: 'normal' }}>{v.summary}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SkeletonRows() {
  return (
    <div className="row-list">
      {[0, 1, 2].map(i => (
        <div key={i} className="sk-row">
          <div className="sk-row-line">
            <span className="sk" style={{ height: 14, width: 78 }} />
            <div className="sk-stack">
              <span className="sk" style={{ height: 14, width: '60%' }} />
              <span className="sk" style={{ height: 12, width: '40%' }} />
            </div>
            <span className="sk" style={{ height: 14, width: 60 }} />
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
      ? (filter === 'all' ? findings : findings.filter(f => (f.worst_severity || '').toLowerCase() === filter))
      : [];
    return [...list].sort((a, b) => {
      const ai = SEV_ORDER.indexOf((a.worst_severity || '').toLowerCase());
      const bi = SEV_ORDER.indexOf((b.worst_severity || '').toLowerCase());
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [findings, filter]);

  if (!analyzed && !isAnalyzing) {
    return (
      <div className="empty">
        <Lock size={20} className="empty-icon" strokeWidth={1.5} />
        <div className="empty-title">CVE Scanner not available</div>
        <div className="empty-sub">Analyze a repository to get started</div>
      </div>
    );
  }

  if (isAnalyzing && !findings?.length) return <SkeletonRows />;

  if (analyzed && !findings?.length) {
    return (
      <div className="empty">
        <Lock size={20} className="empty-icon" strokeWidth={1.5} />
        <div className="empty-title">No vulnerable dependencies</div>
        <div className="empty-sub">No known CVEs found in this repository's dependencies.</div>
      </div>
    );
  }

  const countFor = s => s === 'all' ? (findings?.length || 0) : (findings?.filter(f => (f.worst_severity || '').toLowerCase() === s).length || 0);

  return (
    <div>
      {/* Tab header */}
      <div className="tab-header">
        <div className="tab-header-main">
          <span className="tab-header-icon"><Lock size={15} strokeWidth={1.5} /></span>
          <div className="tab-header-text">
            <div className="tab-header-title">CVE Scanner</div>
            <div className="tab-header-sub">{findings?.length || 0} vulnerable packages</div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="sev-filter">
        {['all', ...SEV_ORDER].map(key => {
          const count = countFor(key);
          if (key !== 'all' && !count) return null;
          return (
            <button
              key={key}
              className={filter === key ? `active ${key}` : ''}
              onClick={() => setFilter(key)}
            >
              {key === 'all' ? 'All' : key.charAt(0).toUpperCase() + key.slice(1)}
              <span className="count">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="row-list">
        {sorted.map((pkg, i) => (
          <PkgRow key={`${pkg.package}-${pkg.version}-${i}`} pkg={pkg} />
        ))}
      </div>
    </div>
  );
}
