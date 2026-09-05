import { useState } from 'react';
import { Button } from './ui';

function renderInline(text) {
  return text;
}

export function ChatMessage({ role, content }) {
  const [copied, setCopied] = useState(false);
  const parts = String(content || '').split(/```/);

  async function copy() {
    await navigator.clipboard.writeText(content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <article className={`msg ${role}`}>
      <div className="msg-role">{role === 'user' ? 'You' : 'Assistant'}</div>
      <div className="msg-body">
        {parts.map((part, i) => {
          if (i % 2 === 1) {
            const nl = part.indexOf('\n');
            const code = nl >= 0 ? part.slice(nl + 1) : part;
            return (
              <pre key={i} className="code-viewer" style={{ margin: '8px 0', border: '1px solid var(--border)' }}>
                {code}
              </pre>
            );
          }
          return <span key={i}>{renderInline(part)}</span>;
        })}
        {role === 'assistant' ? (
          <div style={{ marginTop: 8 }}>
            <Button size="sm" variant="ghost" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
