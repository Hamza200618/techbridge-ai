export function Button({ variant = 'default', size, children, ...props }) {
  const cls = ['btn'];
  if (variant === 'primary') cls.push('btn-primary');
  if (variant === 'danger') cls.push('btn-danger');
  if (variant === 'success') cls.push('btn-success');
  if (variant === 'ghost') cls.push('btn-ghost');
  if (size === 'sm') cls.push('btn-sm');
  return (
    <button className={cls.join(' ')} {...props}>
      {children}
    </button>
  );
}

export function Input({ label, error, ...props }) {
  return (
    <div className="field">
      {label ? <label>{label}</label> : null}
      <input className="input" {...props} />
      {error ? <span className="dim" style={{ color: 'var(--danger)' }}>{error}</span> : null}
    </div>
  );
}

export function Select({ label, children, ...props }) {
  return (
    <div className="field">
      {label ? <label>{label}</label> : null}
      <select className="select" {...props}>
        {children}
      </select>
    </div>
  );
}

export function Card({ title, children, style }) {
  return (
    <section className="card" style={style}>
      {title ? <h3>{title}</h3> : null}
      {children}
    </section>
  );
}

export function Badge({ children, tone }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{children}</span>;
}

export function HealthBadge({ status, score }) {
  const s = String(status || '').toLowerCase();
  const tone = s.includes('warn') ? 'warning' : s.includes('issue') || s.includes('unhealthy') || s.includes('critical') ? 'danger' : s.includes('health') || s === 'good' || s === 'ok' ? 'success' : '';
  return (
    <span className={`badge ${tone ? `badge-${tone}` : ''}`}>
      {status || 'unknown'}
      {typeof score === 'number' ? ` · ${Math.round(score)}` : ''}
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const s = String(severity || 'info').toLowerCase();
  const tone = s === 'critical' || s === 'high' ? 'danger' : s === 'medium' ? 'warning' : s === 'low' ? 'info' : '';
  return <span className={`badge badge-${tone || s}`}>{s}</span>;
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="loading-box">
      <span className="spinner" style={{ display: 'inline-block', marginBottom: 8 }} />
      <div>{label}</div>
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {body ? <p className="muted">{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message }) {
  return <div className="error-box">{message || 'Something went wrong.'}</div>;
}

export function Modal({ title, children, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatCard({ label, value }) {
  return (
    <Card title={label}>
      <div className="stat-value">{value}</div>
    </Card>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab ${value === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
