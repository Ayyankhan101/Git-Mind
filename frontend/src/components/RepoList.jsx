import React from 'react';

const LANG_COLOR = {
  JavaScript: '#f7df1e', TypeScript: '#3178c6', Python: '#3572A5',
  Java: '#b07219', Go: '#00ADD8', Ruby: '#701516', PHP: '#4F5D95',
  Rust: '#dea584', 'C++': '#f34b7d', C: '#555555', 'C#': '#178600',
  HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051',
};

function LanguageDot({ lang }) {
  if (!lang) return null;
  const color = LANG_COLOR[lang] || '#64748b';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#94a3b8' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {lang}
    </span>
  );
}

function RepoCard({ repo, selected, onSelect, disabled }) {
  const isSelected = selected === repo.url;
  return (
    <button
      onClick={() => !disabled && onSelect(repo.url)}
      disabled={disabled}
      style={{
        width: '100%', textAlign: 'left', padding: '9px 11px',
        borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
        background: isSelected ? 'rgba(99,102,241,0.12)' : 'rgba(15,22,41,0.5)',
        border: `1px solid ${isSelected ? 'rgba(99,102,241,0.5)' : 'var(--gm-border)'}`,
        boxShadow: isSelected ? '0 0 0 1px rgba(99,102,241,0.3)' : 'none',
        transition: 'all 0.15s',
        marginBottom: 6,
        display: 'block',
      }}
      onMouseEnter={e => { if (!disabled && !isSelected) { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; e.currentTarget.style.background = 'rgba(99,102,241,0.06)'; } }}
      onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = 'var(--gm-border)'; e.currentTarget.style.background = 'rgba(15,22,41,0.5)'; } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: isSelected ? 'var(--gm-primary)' : '#e2e8f0',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {repo.name}
        </span>
        {repo.fork && (
          <span style={{ fontSize: 9, color: '#64748b', background: 'rgba(100,116,139,0.15)', border: '1px solid rgba(100,116,139,0.2)', borderRadius: 4, padding: '1px 5px', flexShrink: 0 }}>fork</span>
        )}
      </div>
      {repo.description && (
        <div style={{
          fontSize: 10, color: '#64748b', lineHeight: 1.45, marginBottom: 5,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {repo.description}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <LanguageDot lang={repo.language} />
        {repo.stars > 0 && (
          <span style={{ fontSize: 10, color: '#64748b' }}>⭐ {repo.stars.toLocaleString()}</span>
        )}
      </div>
    </button>
  );
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[80, 60, 75].map((w, i) => (
        <div key={i} style={{ padding: '9px 11px', borderRadius: 10, border: '1px solid var(--gm-border)', background: 'rgba(15,22,41,0.5)' }}>
          <div className="skeleton" style={{ width: `${w}%`, height: 11, borderRadius: 4, marginBottom: 6 }} />
          <div className="skeleton" style={{ width: '90%', height: 9, borderRadius: 3, marginBottom: 3 }} />
          <div className="skeleton" style={{ width: '60%', height: 9, borderRadius: 3 }} />
        </div>
      ))}
    </div>
  );
}

export default function RepoList({ repos, onSelect, selectedUrl, loading, error }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '10px 10px 6px',
        borderBottom: '1px solid var(--gm-border)',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gm-text-3)' }}>
          Repositories {repos.length > 0 && <span style={{ color: 'var(--gm-text-3)', fontWeight: 400 }}>· {repos.length}</span>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 0' }}>
        {loading && <Skeleton />}

        {error && !loading && (
          <div style={{
            margin: '8px 2px', padding: '10px 12px', borderRadius: 8,
            background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
            fontSize: 11, color: '#fca5a5',
          }}>
            {error}
          </div>
        )}

        {!loading && !error && repos.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '28px 12px', gap: 8, textAlign: 'center',
          }}>
            <div style={{ fontSize: 24 }}>📂</div>
            <div style={{ fontSize: 11, color: 'var(--gm-text-3)', lineHeight: 1.5 }}>
              Enter a GitHub username above and click <strong style={{ color: 'var(--gm-text-2)' }}>Load</strong> to browse repos.
            </div>
          </div>
        )}

        {!loading && repos.map(repo => (
          <RepoCard
            key={repo.full_name}
            repo={repo}
            selected={selectedUrl}
            onSelect={onSelect}
            disabled={false}
          />
        ))}
      </div>
    </div>
  );
}
