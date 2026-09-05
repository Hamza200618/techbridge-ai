import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '../api/projects';
import { useProject } from '../context/ProjectContext';
import { Button, Card, ErrorState, HealthBadge, StatCard } from '../components/ui';
import { errorMessage, formatDate } from '../utils/format';

export function OverviewPage() {
  const { project, refresh } = useProject();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState(null);
  const [issues, setIssues] = useState([]);
  const [security, setSecurity] = useState(null);
  const [validation, setValidation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadSide() {
    const [a, i, s, v] = await Promise.allSettled([
      projectsApi.analysis(project.id),
      projectsApi.issues(project.id),
      projectsApi.security(project.id),
      projectsApi.validation(project.id),
    ]);
    if (a.status === 'fulfilled') setAnalysis(a.value);
    if (i.status === 'fulfilled') setIssues(i.value.issues || []);
    if (s.status === 'fulfilled') setSecurity(s.value);
    if (v.status === 'fulfilled') setValidation(v.value);
  }

  useEffect(() => {
    loadSide().catch(() => {});
  }, [project.id]);

  async function runAnalysis() {
    setBusy(true);
    setError('');
    try {
      try {
        await projectsApi.analyze(project.id);
      } catch (err) {
        if (err.code !== 'ANALYSIS_IN_PROGRESS') throw err;
      }
      let status = 'running';
      while (status === 'running' || status === 'queued') {
        const a = await projectsApi.analysis(project.id);
        setAnalysis(a);
        status = a.status;
        if (status === 'failed') throw new Error(a.errorMessage || 'Analysis failed.');
        if (status !== 'completed') await new Promise((r) => setTimeout(r, 900));
      }
      await refresh();
      await loadSide();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const latestRun = validation?.runs?.[0];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{project.name}</h1>
          <p className="muted">{project.originalFilename} · {project.framework || project.projectType || 'Project'}</p>
        </div>
        <div className="row">
          <HealthBadge status={project.status} score={project.healthScore} />
          <Button onClick={runAnalysis} disabled={busy}>
            {busy ? 'Analyzing…' : 'Run analysis'}
          </Button>
        </div>
      </div>
      {error ? <ErrorState message={error} /> : null}
      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatCard label="Health score" value={Math.round(project.healthScore || 0)} />
        <StatCard label="Files" value={project.totalFiles || 0} />
        <StatCard label="Issues" value={issues.length} />
        <StatCard label="Security findings" value={security?.summary?.total ?? '—'} />
      </div>
      <div className="grid-stats">
        <Card title="Analysis">
          <p>{analysis?.status || 'not started'}</p>
          <p className="muted">Stage: {analysis?.currentStage || '—'} · {analysis?.progress ?? 0}%</p>
          {analysis?.status === 'running' || analysis?.status === 'queued' ? (
            <div className="progress" style={{ marginTop: 8 }}>
              <span style={{ width: `${analysis.progress || 0}%` }} />
            </div>
          ) : null}
        </Card>
        <Card title="Language">
          <p>{project.primaryLanguage || 'Unknown'}</p>
          <p className="muted">{project.totalLines || 0} lines</p>
        </Card>
        <Card title="Validation">
          <p>{latestRun ? latestRun.status : 'No runs yet'}</p>
          <p className="muted">{latestRun ? latestRun.type : 'Run tests from Validation'}</p>
        </Card>
        <Card title="Last activity">
          <p>{formatDate(project.updatedAt)}</p>
          <p className="muted">Created {formatDate(project.createdAt)}</p>
        </Card>
      </div>
      <div className="row" style={{ marginTop: 20 }}>
        <Button onClick={() => navigate('../files')}>Open files</Button>
        <Button onClick={() => navigate('../issues')}>Review issues</Button>
        <Button onClick={() => navigate('../ai')}>Ask AI</Button>
      </div>
    </div>
  );
}
