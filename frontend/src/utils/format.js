export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function healthClass(status) {
  const s = String(status || '').toLowerCase();
  if (['healthy', 'good', 'ok', 'none', 'passed', 'completed'].includes(s)) return 'healthy';
  if (['warning', 'warn', 'medium', 'uncertain'].includes(s)) return 'warning';
  if (['issue', 'unhealthy', 'critical', 'high', 'error', 'failed'].includes(s)) return 'issue';
  return '';
}

export function severityClass(severity) {
  const s = String(severity || 'info').toLowerCase();
  if (s === 'critical' || s === 'high' || s === 'error') return 'danger';
  if (s === 'medium' || s === 'warning') return 'warning';
  if (s === 'low') return 'info';
  return '';
}

export function errorMessage(err) {
  if (!err) return 'Something went wrong.';
  return err.message || 'Something went wrong.';
}

export function conversationKey(projectId, scope, fileId) {
  return `tb_conv_${projectId}_${scope}${fileId ? `_${fileId}` : ''}`;
}
