import { useMemo } from 'react';

export function CodeViewer({ content, highlight }) {
  const lines = useMemo(() => String(content ?? '').split('\n'), [content]);
  return (
    <pre className="code-viewer" tabIndex={0}>
      {lines.map((line, i) => (
        <div key={i} className={`code-line ${highlight === i + 1 ? 'diff-add' : ''}`}>
          <span className="code-ln">{i + 1}</span>
          <span className="code-tx">{line || ' '}</span>
        </div>
      ))}
    </pre>
  );
}

export function DiffViewer({ diff }) {
  const lines = String(diff || '').split('\n');
  if (!diff) {
    return <p className="muted">No diff available for this change.</p>;
  }
  return (
    <pre className="code-viewer">
      {lines.map((line, i) => {
        let cls = '';
        if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-add';
        else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-del';
        else if (line.startsWith('@@')) cls = 'diff-meta';
        return (
          <div key={i} className={`code-line ${cls}`}>
            <span className="code-ln">{i + 1}</span>
            <span className="code-tx">{line || ' '}</span>
          </div>
        );
      })}
    </pre>
  );
}
