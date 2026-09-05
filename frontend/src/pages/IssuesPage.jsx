import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { projectsApi } from '../api/projects';
import { useProject } from '../context/ProjectContext';
import { DiffViewer } from '../components/CodeViewer';
import { Button, Card, EmptyState, ErrorState, LoadingState, Select, SeverityBadge } from '../components/ui';
import { errorMessage } from '../utils/format';

export function IssuesPage() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [issues, setIssues] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    Promise.all([projectsApi.issues(project.id), projectsApi.files(project.id)])
      .then(([i, f]) => {
        setIssues(i.issues || []);
        setFiles(f.files || []);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [project.id]);

  const fileMap = useMemo(() => Object.fromEntries(files.map((f) => [f.fileId, f.path])), [files]);
  const filtered = issues.filter((issue) => {
    if (severity !== 'all' && String(issue.severity).toLowerCase() !== severity) return false;
    if (status !== 'all' && String(issue.status).toLowerCase() !== status) return false;
    return true;
  });

  if (loading) return <LoadingState />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Issues</h1>
          <p className="muted">{issues.length} detected findings from analysis</p>
        </div>
        <div className="row">
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="all">All severities</option>
            {['critical', 'high', 'medium', 'low', 'info'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="open">open</option>
            <option value="resolved">resolved</option>
          </Select>
        </div>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {!filtered.length ? (
        <EmptyState title="No issues" body="No matching issues. Run analysis if the project has not been analyzed yet." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Title</th>
                <th>Category</th>
                <th>File</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((issue) => (
                <tr key={issue.issueId} className="clickable" onClick={() => navigate(`../issues/${issue.issueId}`)}>
                  <td><SeverityBadge severity={issue.severity} /></td>
                  <td>{issue.title}</td>
                  <td className="muted">{issue.issueType}</td>
                  <td className="muted">{issue.fileId ? fileMap[issue.fileId] || issue.fileId : '—'}</td>
                  <td>{issue.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function IssueDetailPage() {
  const { issueId } = useParams();
  const { project } = useProject();
  const [issue, setIssue] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [change, setChange] = useState(null);
  const [root, setRoot] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    projectsApi.issues(project.id).then((data) => {
      setIssue((data.issues || []).find((i) => String(i.issueId) === String(issueId)) || null);
      setLoaded(true);
    });
  }, [project.id, issueId]);

  async function diagnose() {
    setBusy('diagnose');
    setError('');
    try {
      const data = await projectsApi.diagnose(project.id, issueId);
      setDiagnosis(data.diagnosis);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function generateFix() {
    setBusy('fix');
    setError('');
    try {
      const data = await projectsApi.fix(project.id, issueId);
      setChange(data.change);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function loadRoot() {
    setBusy('root');
    setError('');
    try {
      setRoot(await projectsApi.rootCause(project.id, issueId, true));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function apply() {
    setBusy('apply');
    setError('');
    try {
      const data = await projectsApi.applyChange(project.id, change.id);
      setChange(data.change);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  async function reject() {
    setBusy('reject');
    setError('');
    try {
      const data = await projectsApi.rejectChange(project.id, change.id);
      setChange(data.change);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy('');
    }
  }

  if (!loaded) return <LoadingState />;
  if (!issue) return <ErrorState message="Issue was not found." />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{issue.title}</h1>
          <p className="muted">{issue.issueType} · file {issue.fileId || 'n/a'}</p>
        </div>
        <SeverityBadge severity={issue.severity} />
      </div>
      {error ? <ErrorState message={error} /> : null}
      <Card title="Description">
        <p>{issue.description || 'No description.'}</p>
        {issue.evidence ? (
          <pre className="code-viewer" style={{ maxHeight: 200 }}>
            {typeof issue.evidence === 'string' ? issue.evidence : JSON.stringify(issue.evidence, null, 2)}
          </pre>
        ) : null}
        {issue.rootCause ? <p className="muted">Stored root cause: {issue.rootCause}</p> : null}
      </Card>
      <div className="row" style={{ margin: '16px 0' }}>
        <Button onClick={diagnose} disabled={!!busy}>{busy === 'diagnose' ? 'Diagnosing…' : 'Diagnose'}</Button>
        <Button onClick={generateFix} disabled={!!busy}>{busy === 'fix' ? 'Generating fix…' : 'Fix It'}</Button>
        <Button onClick={loadRoot} disabled={!!busy}>{busy === 'root' ? 'Tracing…' : 'Root cause'}</Button>
      </div>
      {diagnosis ? (
        <Card title="AI diagnosis">
          <p><strong>Problem.</strong> {diagnosis.problem}</p>
          <p><strong>Root cause.</strong> {diagnosis.rootCause}</p>
          <p><strong>Suggested solution.</strong> {diagnosis.suggestedSolution}</p>
          <p className="muted">Confidence: {diagnosis.confidence ?? '—'}</p>
        </Card>
      ) : null}
      {change ? (
        <Card title={`Proposed change · ${change.status}`} style={{ marginTop: 12 }}>
          <p>{change.description}</p>
          <p className="muted">Changes are not applied until you confirm.</p>
          <DiffViewer diff={change.diff} />
          {change.status === 'proposed' ? (
            <div className="row" style={{ marginTop: 12 }}>
              <Button variant="success" onClick={apply} disabled={!!busy}>Apply</Button>
              <Button variant="danger" onClick={reject} disabled={!!busy}>Reject</Button>
            </div>
          ) : (
            <p className="muted">Status: {change.status}</p>
          )}
        </Card>
      ) : null}
      {root ? (
        <Card title="Root cause path" style={{ marginTop: 12 }}>
          <p>{root.explanation || root.likelyRootCause?.title || 'See related files.'}</p>
          <ul>
            {(root.relatedFiles || []).map((f) => (
              <li key={f.fileId || f.path}>{f.path} {f.relationshipType ? `· ${f.relationshipType}` : ''}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
