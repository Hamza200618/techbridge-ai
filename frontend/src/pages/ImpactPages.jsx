import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { projectsApi } from '../api/projects';
import { useProject } from '../context/ProjectContext';
import { Button, Card, EmptyState, ErrorState, LoadingState, Select } from '../components/ui';
import { errorMessage } from '../utils/format';

export function ImpactPage() {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const [files, setFiles] = useState([]);
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileId = params.get('fileId') || '';

  useEffect(() => {
    projectsApi
      .files(project.id)
      .then((data) => setFiles((data.files || []).filter((f) => f.fileType !== 'directory')))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [project.id]);

  useEffect(() => {
    if (!fileId) {
      setImpact(null);
      return;
    }
    setBusy(true);
    projectsApi
      .impact(project.id, fileId, true)
      .then(setImpact)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  }, [project.id, fileId]);

  const selected = useMemo(() => files.find((f) => String(f.fileId) === String(fileId)), [files, fileId]);

  if (loading) return <LoadingState />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Impact analysis</h1>
          <p className="muted">Uses stored analyzer relationships only. AI may explain, not invent edges.</p>
        </div>
      </div>
      <Select label="File" value={fileId} onChange={(e) => setParams({ fileId: e.target.value })}>
        <option value="">Select a file</option>
        {files.map((f) => (
          <option key={f.fileId} value={f.fileId}>{f.path}</option>
        ))}
      </Select>
      {error ? <ErrorState message={error} /> : null}
      {!fileId ? <EmptyState title="Choose a file" body="Impact is computed from project_relationships for the selected file." /> : null}
      {busy ? <LoadingState label="Tracing impact…" /> : null}
      {impact && selected ? (
        <div className="stack" style={{ marginTop: 16 }}>
          <div className="grid-stats">
            <Card title="Depends on">{impact.summary?.directDependenciesCount ?? 0}</Card>
            <Card title="Used by">{impact.summary?.directDependentsCount ?? 0}</Card>
            <Card title="Affected files">{impact.summary?.totalAffectedFilesCount ?? 0}</Card>
            <Card title="Affected APIs">{impact.summary?.affectedApisCount ?? 0}</Card>
          </div>
          <Card title="Direct dependencies">
            <RelList items={impact.dependsOn} empty="No outbound dependencies recorded." />
          </Card>
          <Card title="Dependent files">
            <RelList items={impact.usedBy} empty="No inbound dependents recorded." />
          </Card>
          {impact.explanation ? (
            <Card title="Explanation">
              <p style={{ whiteSpace: 'pre-wrap' }}>{impact.explanation}</p>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RelList({ items, empty }) {
  if (!items?.length) return <p className="muted">{empty}</p>;
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>
          {item.path || item.fileId} {item.relationshipType ? `· ${item.relationshipType}` : ''} {item.symbol ? `· ${item.symbol}` : ''}
        </li>
      ))}
    </ul>
  );
}

export function RootCausePage() {
  const { project } = useProject();
  const [issues, setIssues] = useState([]);
  const [issueId, setIssueId] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    projectsApi.issues(project.id).then((data) => setIssues(data.issues || []));
  }, [project.id]);

  async function run() {
    if (!issueId) return;
    setBusy(true);
    setError('');
    try {
      setResult(await projectsApi.rootCause(project.id, issueId, true));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Root cause</h1>
          <p className="muted">Trace an issue through stored file relationships.</p>
        </div>
      </div>
      <div className="row" style={{ alignItems: 'flex-end', marginBottom: 16 }}>
        <Select label="Issue" value={issueId} onChange={(e) => setIssueId(e.target.value)}>
          <option value="">Select an issue</option>
          {issues.map((i) => (
            <option key={i.issueId} value={i.issueId}>{i.title}</option>
          ))}
        </Select>
        <Button variant="primary" onClick={run} disabled={!issueId || busy}>{busy ? 'Tracing…' : 'Trace'}</Button>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {!result && !busy ? <EmptyState title="No trace yet" body="Select an issue and run a root-cause trace." /> : null}
      {result ? (
        <div className="stack">
          <Card title="Likely source">
            <p>{result.likelyRootCause?.title || result.affectedFile?.path || 'See related files.'}</p>
            {result.explanation ? <p style={{ whiteSpace: 'pre-wrap' }}>{result.explanation}</p> : null}
          </Card>
          <Card title="Path">
            {(result.dependencyChain || []).length ? (
              <ol>
                {(result.dependencyChain || []).map((step, i) => (
                  <li key={i}>{step.path || step.filePath || JSON.stringify(step)}</li>
                ))}
              </ol>
            ) : (
              <RelList items={result.relatedFiles} empty="No related files recorded." />
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
