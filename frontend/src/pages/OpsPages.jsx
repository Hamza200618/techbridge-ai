import { useEffect, useState } from 'react';
import { projectsApi } from '../api/projects';
import { useProject } from '../context/ProjectContext';
import { DiffViewer } from '../components/CodeViewer';
import { Button, Card, EmptyState, ErrorState, LoadingState, SeverityBadge } from '../components/ui';
import { errorMessage } from '../utils/format';

export function SecurityPage() {
  const { project } = useProject();
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    projectsApi
      .security(project.id)
      .then(setData)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [project.id]);

  if (loading) return <LoadingState />;
  const findings = data?.findings || [];
  const summary = data?.summary || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Security</h1>
          <p className="muted">Findings from analyzer evidence. Sensitive values are masked.</p>
        </div>
      </div>
      {error ? <ErrorState message={error} /> : null}
      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <Card title="Total">{summary.total ?? findings.length}</Card>
        <Card title="Critical">{summary.critical ?? 0}</Card>
        <Card title="High">{summary.high ?? 0}</Card>
        <Card title="Medium">{summary.medium ?? 0}</Card>
      </div>
      {!findings.length ? (
        <EmptyState title="No security findings" body="Either analysis has not run, or no evidence-backed findings were stored." />
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
              {findings.map((f) => (
                <tr
                  key={f.findingId}
                  className="clickable"
                  onClick={async () => {
                    try {
                      setDetail(await projectsApi.securityFinding(project.id, f.findingId, true));
                    } catch (err) {
                      setError(errorMessage(err));
                    }
                  }}
                >
                  <td><SeverityBadge severity={f.severity} /></td>
                  <td>{f.title}</td>
                  <td className="muted">{f.category}</td>
                  <td className="muted">{f.filePath || f.fileId || '—'}</td>
                  <td>{f.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detail?.finding ? (
        <Card title={detail.finding.title} style={{ marginTop: 16 }}>
          <p>{detail.finding.description}</p>
          <p className="muted">{detail.finding.recommendation}</p>
          {detail.finding.evidence ? (
            <pre className="code-viewer">{typeof detail.finding.evidence === 'string' ? detail.finding.evidence : JSON.stringify(detail.finding.evidence, null, 2)}</pre>
          ) : null}
          {detail.explanation ? <p style={{ whiteSpace: 'pre-wrap' }}>{detail.explanation}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}

export function ValidationPage() {
  const { project } = useProject();
  const [runs, setRuns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [type, setType] = useState('full');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const data = await projectsApi.validation(project.id);
    setRuns(data.runs || []);
  }

  useEffect(() => {
    load().catch((err) => setError(errorMessage(err)));
  }, [project.id]);

  async function run() {
    setBusy(true);
    setError('');
    try {
      const started = await projectsApi.validate(project.id, type);
      const runId = started.validationRun?.id;
      if (!runId) throw new Error('Validation did not start.');
      let current = started.validationRun;
      while (['queued', 'running'].includes(current.status)) {
        await new Promise((r) => setTimeout(r, 1000));
        const data = await projectsApi.validationRun(project.id, runId);
        current = data.run;
        setSelected(current);
      }
      await load();
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
          <h1>Validation</h1>
          <p className="muted">Runs against the working copy. Results are not simulated.</p>
        </div>
        <div className="row">
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            {['full', 'syntax', 'lint', 'build', 'test'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <Button variant="primary" onClick={run} disabled={busy}>{busy ? 'Running…' : 'Test my project'}</Button>
        </div>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {!runs.length && !selected ? (
        <EmptyState title="No validation runs" body="Start a validation to see syntax, lint, build, or test output." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Exit</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => setSelected(r)}>
                  <td>{r.type}</td>
                  <td>{r.status}</td>
                  <td>{r.exitCode ?? '—'}</td>
                  <td className="muted">{r.durationMs ? `${r.durationMs} ms` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected ? (
        <Card title={`Run ${selected.id} · ${selected.status}`} style={{ marginTop: 16 }}>
          <pre className="code-viewer">{selected.output || selected.errorOutput || 'No output captured.'}</pre>
        </Card>
      ) : null}
    </div>
  );
}

export function VersionsPage() {
  const { project } = useProject();
  const [versions, setVersions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projectsApi
      .versions(project.id)
      .then((data) => setVersions(data.versions || []))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [project.id]);

  if (loading) return <LoadingState />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Version history</h1>
          <p className="muted">Created when proposed fixes are applied to the working copy.</p>
        </div>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {!versions.length ? (
        <EmptyState title="No versions" body="Apply an approved fix to create version history." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Version</th>
                <th>Label</th>
                <th>File</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.versionId} className="clickable" onClick={() => setSelected(v)}>
                  <td>{v.versionNumber}</td>
                  <td>{v.label}</td>
                  <td className="muted">{v.filePath || '—'}</td>
                  <td className="muted">{v.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected ? (
        <Card title={selected.label || `Version ${selected.versionNumber}`} style={{ marginTop: 16 }}>
          <p>{selected.description}</p>
          {selected.diff ? <DiffViewer diff={selected.diff} /> : <p className="muted">No diff stored for this version.</p>}
        </Card>
      ) : null}
    </div>
  );
}

export function ExportPage() {
  const { project } = useProject();
  const [exportsList, setExportsList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(null);

  async function load() {
    const data = await projectsApi.exports(project.id);
    setExportsList(data.exports || []);
  }

  useEffect(() => {
    load().catch((err) => setError(errorMessage(err)));
  }, [project.id]);

  async function runExport() {
    setBusy(true);
    setError('');
    try {
      const data = await projectsApi.exportProject(project.id);
      setCurrent(data.export);
      await load();
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
          <h1>Export</h1>
          <p className="muted">Download the working copy. The original upload is never rewritten.</p>
        </div>
        <Button variant="primary" onClick={runExport} disabled={busy}>{busy ? 'Exporting…' : 'Export project'}</Button>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {current ? <p className="muted">Latest export: {current.filename} · {current.status}</p> : null}
      {!exportsList.length ? (
        <EmptyState title="No exports yet" body="Generate an archive of the current working project." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>File</th>
                <th>Status</th>
                <th>Size</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {exportsList.map((item) => (
                <tr key={item.id}>
                  <td>{item.filename}</td>
                  <td>{item.status}</td>
                  <td className="muted">{item.sizeBytes ?? '—'}</td>
                  <td>
                    {item.status === 'completed' ? (
                      <Button
                        size="sm"
                        onClick={() => projectsApi.downloadExport(project.id, item.id, item.filename).catch((err) => setError(errorMessage(err)))}
                      >
                        Download
                      </Button>
                    ) : (
                      <span className="muted">{item.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
