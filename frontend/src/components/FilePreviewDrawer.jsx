import React, { useEffect, useMemo, useState } from 'react';
import { FileText, ExternalLink, Copy, X } from 'lucide-react';

const LANG_EXT = { py: 'Python', js: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', jsx: 'JavaScript', go: 'Go', rb: 'Ruby', rs: 'Rust', java: 'Java', cs: 'C#', cpp: 'C++', c: 'C' };

const CODE_SNIPPETS = {
  'app/routes/user.py': {
    language: 'Python',
    lines: [
      { n: 38, text: 'def get_user(user_id: str, db: Session = Depends(get_db)):' },
      { n: 39, text: '    """Return user by ID."""' },
      { n: 40, text: '    query = f"SELECT * FROM users WHERE id = {user_id}"' },
      { n: 41, text: '    # TODO: use parameterised query' },
      { n: 42, text: '    result = db.execute(query)', hl: true },
      { n: 43, text: '    return result.fetchone()' },
      { n: 44, text: '' },
      { n: 45, text: 'def list_users(db: Session = Depends(get_db)):' },
    ],
  },
  'src/auth.py': {
    language: 'Python',
    lines: [
      { n: 38, text: 'import hashlib, os' },
      { n: 39, text: '' },
      { n: 40, text: 'SECRET_KEY = "hardcoded-secret-abc123"', hl: true },
      { n: 41, text: 'ALGORITHM = "HS256"' },
      { n: 42, text: '' },
      { n: 43, text: 'def create_token(user_id: str) -> str:' },
      { n: 44, text: '    payload = {"sub": user_id, "exp": time() + 3600}' },
      { n: 45, text: '    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)' },
    ],
  },
};

export default function FilePreviewDrawer({ path, line, repoUrl, onClose }) {
  const [codeLines, setCodeLines] = useState(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [lang, setLang] = useState('');

  useEffect(() => {
    if (!path) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [path, onClose]);

  useEffect(() => {
    if (!path) { setCodeLines(null); setFetchError(null); return; }

    const stub = CODE_SNIPPETS[path];
    const ext = path.split('.').pop().toLowerCase();

    if (repoUrl) {
      const ghMatch = repoUrl.match(/github\.com\/([^/?#]+\/[^/?#]+)/);
      if (!ghMatch) {
        if (stub) { setCodeLines(stub.lines); setLang(stub.language); }
        return;
      }
      const ownerRepo = ghMatch[1].replace(/\.git$/, '');
      setFetchLoading(true);
      setFetchError(null);
      setCodeLines(null);
      setLang(LANG_EXT[ext] || ext.toUpperCase());

      const controller = new AbortController();
      fetch(`https://api.github.com/repos/${ownerRepo}/contents/${path}`, {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: controller.signal,
      })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(data => {
          if (!data.content) throw new Error('empty');
          const raw = atob(data.content.replace(/\n/g, ''));
          const allLines = raw.split('\n');
          const targetLine = line ? parseInt(line, 10) : 1;
          const start = Math.max(0, targetLine - 6);
          const end = Math.min(allLines.length, targetLine + 5);
          setCodeLines(allLines.slice(start, end).map((text, i) => ({
            n: start + i + 1,
            text,
            hl: (start + i + 1) === targetLine,
          })));
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          setFetchError(err.message);
          if (stub) { setCodeLines(stub.lines); setLang(stub.language); }
        })
        .finally(() => setFetchLoading(false));
      return () => controller.abort();
    } else if (stub) {
      setCodeLines(stub.lines);
      setLang(stub.language);
    }
  }, [path, repoUrl, line]);

  const ghUrl = useMemo(() => {
    if (!repoUrl || !path) return null;
    const m = repoUrl.match(/github\.com\/([^/?#]+\/[^/?#]+)/);
    if (!m) return null;
    return `https://github.com/${m[1].replace(/\.git$/, '')}/blob/main/${path}${line ? `#L${line}` : ''}`;
  }, [repoUrl, path, line]);

  if (!path) return null;

  const firstLine = codeLines?.[0]?.n ?? '?';
  const lastLine  = codeLines?.[codeLines.length - 1]?.n ?? '?';

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-header">
          <span className="drawer-icon"><FileText size={14} strokeWidth={1.5} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="drawer-title">{path}{line ? `:${line}` : ''}</div>
            <div className="drawer-sub">
              {fetchLoading
                ? 'Fetching from GitHub…'
                : lang && codeLines
                ? `${lang} · lines ${firstLine}–${lastLine}`
                : 'snippet not available'}
            </div>
          </div>
          {ghUrl && (
            <a href={ghUrl} target="_blank" rel="noopener noreferrer" className="btn-icon" title="Open on GitHub">
              <ExternalLink size={13} strokeWidth={1.5} />
            </a>
          )}
          <button
            className="btn-icon"
            title="Copy path"
            onClick={() => navigator.clipboard.writeText(path).catch(() => {})}
          >
            <Copy size={13} strokeWidth={1.5} />
          </button>
          <button className="btn-icon" onClick={onClose}><X size={13} strokeWidth={1.5} /></button>
        </div>

        <div className="drawer-body">
          {fetchLoading ? (
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                  <span className="sk" style={{ width: 28, height: 13, flexShrink: 0 }} />
                  <span className="sk" style={{ height: 13, width: `${45 + (i * 19 + 7) % 45}%` }} />
                </div>
              ))}
            </div>
          ) : codeLines ? (
            <div className="code-block">
              {codeLines.map((l, i) => (
                <div key={i} className={`code-line${l.hl ? ' hl' : ''}`}>
                  <span className="lineno">{l.n}</span>
                  <span className="src">{l.text || ' '}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty" style={{ padding: '48px 32px' }}>
              <FileText size={20} className="empty-icon" strokeWidth={1.5} />
              <div className="empty-title">Preview not available</div>
              <div className="empty-sub">
                {fetchError ? `Fetch failed (${fetchError}). ` : ''}
                {ghUrl
                  ? <a href={ghUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Open on GitHub ↗</a>
                  : 'Analyze a repository to preview files.'}
              </div>
            </div>
          )}
        </div>

        <div className="drawer-footer">
          <span>Press <span className="kbd">Esc</span> to close</span>
          <span>{codeLines ? `${codeLines.length} lines shown` : ''}</span>
        </div>
      </div>
    </>
  );
}
