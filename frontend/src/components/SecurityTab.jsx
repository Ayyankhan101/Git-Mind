import React, { useState, useMemo } from 'react';
import { ShieldAlert } from 'lucide-react';

const SEV_ORDER = ['critical', 'high', 'medium', 'low'];

function parseFix(fixText) {
  if (!fixText) return { explanation: '', patch: '' };
  const diffIdx = fixText.indexOf('```diff');
  if (diffIdx === -1) return { explanation: fixText.replace(/\*\*/g, '').trim(), patch: '' };
  const explanation = fixText.slice(0, diffIdx).replace(/\*\*/g, '').trim();
  const patchStart  = diffIdx + 7;
  const patchEnd    = fixText.indexOf('```', patchStart);
  const patch       = patchEnd === -1 ? fixText.slice(patchStart) : fixText.slice(patchStart, patchEnd);
  return { explanation, patch: patch.trim() };
}

function FindingRow({ finding, onCrisis, onFix, fixLoading, fixResult, onPickFile }) {
  const [expanded, setExpanded] = useState(false);
  const sev    = (finding.severity || 'low').toLowerCase();
  const cardId = finding.id ?? finding.rule;
  const isFixing = fixLoading === cardId;
  const myFix    = fixResult?.finding_id === cardId ? fixResult : null;
  const parsed   = myFix ? parseFix(myFix.fix) : null;
  const canCrisis = sev === 'critical' || sev === 'high';
  const filePath  = finding.file;
  const fileLine  = finding.line_start;

  return (
    <>
      <div className={`row ${sev}`} onClick={() => setExpanded(e => !e)}>
        <div className="row-line">
          <span className="row-sev">
            <span className="glyph" />
            {sev.toUpperCase()}
          </span>
          <div className="row-main">
            <span className="row-title">{finding.title || finding.rule || 'Finding'}</span>
            {finding.exploit_story && !expanded && (
              <span className="row-sub" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>
                {finding.exploit_story}
              </span>
            )}
          </div>
          {filePath && (
            <span
              className="row-path"
              onClick={e => { e.stopPropagation(); onPickFile?.({ path: filePath, line: fileLine }); }}
              title="Preview file"
            >
              {filePath}{fileLine ? `:${fileLine}` : ''}
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="row-expand" onClick={e => e.stopPropagation()}>
          {finding.exploit_story && (
            <div>
              <div className="label">EXPLOIT SCENARIO</div>
              <div className="scenario">{finding.exploit_story}</div>
            </div>
          )}
          <div className="refs">
            {filePath && <span>FILE <code>{filePath}{fileLine ? `:${fileLine}` : ''}</code></span>}
            {finding.id && <span>RULE <code>{finding.id || finding.rule}</code></span>}
          </div>
          {finding.blame && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-3)', marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ background: 'var(--surface-2)', borderRadius: 4, padding: '2px 6px', fontFamily: 'monospace' }}>
                {finding.blame.commit_hash}
              </span>
              {finding.blame.author && (
                <span>{finding.blame.author}</span>
              )}
              {finding.blame.date && (
                <span>· {finding.blame.date}</span>
              )}
              {finding.blame.commit_message && (
                <span style={{ fontStyle: 'italic', overflow: 'hidden', maxWidth: 280, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  "{finding.blame.commit_message}"
                </span>
              )}
            </div>
          )}
          <div className="actions">
            {canCrisis && (
              <button className="btn-text danger" onClick={() => onCrisis?.(finding)}>
                Simulate Crisis
              </button>
            )}
            {onFix && (
              <button
                className="btn-text primary"
                disabled={isFixing}
                onClick={() => onFix(finding)}
              >
                {isFixing ? 'Generating…' : 'Generate Fix'}
              </button>
            )}
          </div>

          {parsed && (
            <div>
              <div className="label" style={{ marginBottom: 8 }}>SUGGESTED FIX</div>
              {parsed.explanation && (
                <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 10 }}>
                  {parsed.explanation}
                </div>
              )}
              {parsed.patch && (
                <div className="diff">
                  {parsed.patch.split('\n').map((line, i) => {
                    const cls = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : 'ctx';
                    return <div key={i} className={`diff-line ${cls}`}>{line || ' '}</div>;
                  })}
                </div>
              )}
            </div>
          )}
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
              <span className="sk" style={{ height: 12, width: '85%' }} />
            </div>
            <span className="sk" style={{ height: 14, width: 160 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SecurityTab({ findings, isAnalyzing, analyzed, onCrisis, onFix, fixLoading, fixResult, onPickFile }) {
  const [filter, setFilter] = useState('all');

  const sorted = useMemo(() => {
    const list = findings?.length
      ? (filter === 'all' ? findings : findings.filter(f => (f.severity || '').toLowerCase() === filter))
      : [];
    return [...list].sort((a, b) => {
      const ai = SEV_ORDER.indexOf((a.severity || '').toLowerCase());
      const bi = SEV_ORDER.indexOf((b.severity || '').toLowerCase());
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [findings, filter]);

  if (!analyzed && !isAnalyzing) {
    return (
      <div className="empty">
        <ShieldAlert size={20} className="empty-icon" strokeWidth={1.5} />
        <div className="empty-title">Security not available</div>
        <div className="empty-sub">Analyze a repository to get started</div>
      </div>
    );
  }

  if (isAnalyzing && !findings?.length) return <SkeletonRows />;

  if (analyzed && !findings?.length) {
    return (
      <div className="empty">
        <ShieldAlert size={20} className="empty-icon" strokeWidth={1.5} />
        <div className="empty-title">No vulnerabilities detected</div>
        <div className="empty-sub">The security scanner found no issues in this repository.</div>
      </div>
    );
  }

  const countFor = s => s === 'all' ? (findings?.length || 0) : (findings?.filter(f => (f.severity || '').toLowerCase() === s).length || 0);

  return (
    <div>
      {/* Severity filter */}
      <div className="sev-filter">
        {['all', ...SEV_ORDER].map(key => {
          const count = countFor(key);
          if (key !== 'all' && !count) return null;
          const active = filter === key;
          return (
            <button
              key={key}
              className={`${active ? `active ${key}` : ''}`}
              onClick={() => setFilter(key)}
            >
              {key === 'all' ? 'All' : key.charAt(0).toUpperCase() + key.slice(1)}
              <span className="count">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="row-list">
        {sorted.map((f, i) => (
          <FindingRow
            key={f.id || i}
            finding={f}
            onCrisis={onCrisis}
            onFix={onFix}
            fixLoading={fixLoading}
            fixResult={fixResult}
            onPickFile={onPickFile}
          />
        ))}
      </div>
    </div>
  );
}
