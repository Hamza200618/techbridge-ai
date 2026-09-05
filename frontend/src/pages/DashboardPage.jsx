import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '../api/projects';
import { Button, Card, EmptyState, ErrorState, HealthBadge, LoadingState, Modal, StatCard } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { errorMessage, formatDate } from '../utils/format';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await projectsApi.list();
      setProjects(data.projects || []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const analyzed = projects.filter((p) => ['analyzed', 'completed', 'modified'].includes(p.status) || p.healthScore > 0);
    const avg = projects.length
      ? Math.round(projects.reduce((sum, p) => sum + (Number(p.healthScore) || 0), 0) / projects.length)
      : 0;
    return { count: projects.length, analyzed: analyzed.length, avg };
  }, [projects]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Welcome back{user?.name ? `, ${user.name}` : ''}.</p>
        </div>
        <Button variant="primary" onClick={() => setUploadOpen(true)}>
          Upload project
        </Button>
      </div>
      <div className="grid-stats" style={{ marginBottom: 20 }}>
        <StatCard label="Projects" value={stats.count} />
        <StatCard label="With health data" value={stats.analyzed} />
        <StatCard label="Average health" value={stats.avg} />
        <StatCard label="Recent" value={Math.min(5, projects.length)} />
      </div>
      {loading ? <LoadingState label="Loading projects…" /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && !projects.length ? (
        <EmptyState
          title="No projects yet"
          body="Upload a ZIP of an existing codebase to start analysis."
          action={<Button variant="primary" onClick={() => setUploadOpen(true)}>Upload ZIP</Button>}
        />
      ) : null}
      {!loading && projects.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Health</th>
                <th>Language</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/app/projects/${p.id}/overview`)}>
                  <td>{p.name}</td>
                  <td><HealthBadge status={p.status} /></td>
                  <td>{Math.round(p.healthScore || 0)}</td>
                  <td className="muted">{p.primaryLanguage || '—'}</td>
                  <td className="muted">{formatDate(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {uploadOpen ? (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onDone={(project) => {
            setUploadOpen(false);
            navigate(`/app/projects/${project.id}/overview`);
          }}
        />
      ) : null}
    </div>
  );
}

export function ProjectsPage() {
  return <DashboardPage />;
}

export function UploadModal({ onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [stage, setStage] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function accept(f) {
    setError('');
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.zip')) {
      setError('Only ZIP archives are accepted.');
      return;
    }
    setFile(f);
  }

  async function start() {
    if (!file) return;
    setError('');
    setStage('uploading');
    setMessage('Uploading archive…');
    try {
      const data = await projectsApi.upload(file);
      const project = data.project;
      setStage('extracting');
      setMessage('Archive stored. Working copy is ready.');
      setProgress(20);
      setStage('analyzing');
      setMessage('Starting analysis…');
      try {
        await projectsApi.analyze(project.id);
      } catch (err) {
        if (err.code !== 'ANALYSIS_IN_PROGRESS') throw err;
      }
      let done = false;
      while (!done) {
        const analysis = await projectsApi.analysis(project.id);
        setProgress(Math.max(25, Number(analysis.progress) || 0));
        setMessage(`Analyzing — ${analysis.currentStage || analysis.status}`);
        if (['completed', 'failed', 'not_started'].includes(analysis.status)) {
          done = true;
          if (analysis.status === 'failed') {
            throw new Error(analysis.errorMessage || 'Analysis failed.');
          }
        } else {
          await new Promise((r) => setTimeout(r, 900));
        }
      }
      setStage('ready');
      setProgress(100);
      setMessage('Project is ready.');
      onDone(project);
    } catch (err) {
      setStage('error');
      setError(errorMessage(err));
    }
  }

  return (
    <Modal title="Upload project" onClose={onClose}>
      <div
        className={`dropzone ${drag ? 'active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          accept(e.dataTransfer.files[0]);
        }}
        onClick={() => document.getElementById('zip-input').click()}
      >
        <input id="zip-input" type="file" accept=".zip" hidden onChange={(e) => accept(e.target.files[0])} />
        <p>{file ? file.name : 'Drop a ZIP here, or click to choose a file.'}</p>
        <p className="dim">Original archive stays immutable. Analysis runs on a working copy.</p>
      </div>
      {stage !== 'idle' ? (
        <div className="stack" style={{ marginTop: 16 }}>
          <div className="progress">
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className="muted">{message}</p>
        </div>
      ) : null}
      {error ? <ErrorState message={error} /> : null}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!file || (stage !== 'idle' && stage !== 'error')} onClick={start}>
          Upload and analyze
        </Button>
      </div>
    </Modal>
  );
}
