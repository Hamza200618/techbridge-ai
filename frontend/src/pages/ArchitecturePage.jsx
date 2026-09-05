import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { projectsApi } from '../api/projects';
import { useProject } from '../context/ProjectContext';
import { Button, Card, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { errorMessage, healthClass } from '../utils/format';

function areaOf(path) {
  if (!path) return 'root';
  const parts = String(path).replace(/\\/g, '/').split('/');
  if (parts.length === 1) return 'root';
  return parts[0];
}

export function ArchitecturePage() {
  const navigate = useNavigate();
  const { project } = useProject();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [impact, setImpact] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    projectsApi
      .files(project.id)
      .then((data) => {
        const list = (data.files || []).filter((f) => f.fileType !== 'directory');
        setFiles(list);
        const grouped = {};
        list.forEach((f) => {
          const a = areaOf(f.path);
          grouped[a] = grouped[a] || [];
          grouped[a].push(f);
        });
        const nextNodes = [];
        let col = 0;
        Object.entries(grouped).forEach(([area, items]) => {
          items.slice(0, 80).forEach((f, row) => {
            const hc = healthClass(f.healthStatus);
            const color = hc === 'healthy' ? '#3dcc8a' : hc === 'warning' ? '#b183bd' : hc === 'issue' ? '#f3a6c1' : '#00d1f9';
            nextNodes.push({
              id: String(f.fileId),
              position: { x: col * 280, y: row * 56 },
              data: { label: f.path },
              style: {
                background: '#0a1218',
                color: '#e8f7fb',
                border: `1px solid ${color}`,
                borderRadius: 12,
                fontSize: 11,
                width: 240,
                boxShadow: '0 0 16px rgba(0, 209, 249, 0.08)',
              },
            });
          });
          col += 1;
        });
        setNodes(nextNodes);
        setEdges([]);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [project.id, setNodes, setEdges]);

  const onNodeClick = useCallback(
    async (_e, node) => {
      const file = files.find((f) => String(f.fileId) === node.id);
      setSelected(file);
      setImpact(null);
      try {
        const data = await projectsApi.impact(project.id, node.id, false);
        setImpact(data);
        const nextEdges = [];
        (data.dependsOn || []).forEach((rel, i) => {
          if (!rel.fileId) return;
          nextEdges.push({
            id: `out-${rel.fileId}-${i}`,
            source: node.id,
            target: String(rel.fileId),
            label: rel.relationshipType || 'depends',
            style: { stroke: '#00d1f9' },
            labelStyle: { fill: '#89efff', fontSize: 10 },
          });
        });
        (data.usedBy || []).forEach((rel, i) => {
          if (!rel.fileId) return;
          nextEdges.push({
            id: `in-${rel.fileId}-${i}`,
            source: String(rel.fileId),
            target: node.id,
            label: rel.relationshipType || 'used by',
            style: { stroke: '#b183bd' },
            labelStyle: { fill: '#ceb2d6', fontSize: 10 },
          });
        });
        const nodeIds = new Set(files.map((f) => String(f.fileId)));
        setEdges(nextEdges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)));
      } catch (err) {
        setError(errorMessage(err));
      }
    },
    [files, project.id, setEdges],
  );

  const legend = useMemo(
    () => [
      { c: '#00d1f9', t: 'Unknown' },
      { c: '#3dcc8a', t: 'Healthy' },
      { c: '#b183bd', t: 'Warning' },
      { c: '#f3a6c1', t: 'Issue' },
    ],
    [],
  );

  if (loading) return <LoadingState label="Loading architecture…" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Architecture</h1>
          <p className="muted">Nodes are discovered files. Edges appear only from analyzer relationships on the selected file.</p>
        </div>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {!files.length ? (
        <EmptyState title="No architecture data" body="Run project analysis to discover files and relationships." />
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            {legend.map((l) => (
              <span key={l.t} className="muted">
                <span className="health-dot" style={{ background: l.c, display: 'inline-block', marginRight: 6 }} />
                {l.t}
              </span>
            ))}
          </div>
          <div className="graph-wrap">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              fitView
              colorMode="dark"
            >
              <Background color="rgba(0, 209, 249, 0.18)" gap={20} />
              <Controls />
              <MiniMap pannable zoomable style={{ background: '#070b10' }} />
            </ReactFlow>
          </div>
          {selected ? (
            <Card title={`Selected · ${selected.path}`} style={{ marginTop: 12 }}>
              <p className="muted">
                Direct dependencies: {impact?.summary?.directDependenciesCount ?? '…'} · Used by:{' '}
                {impact?.summary?.directDependentsCount ?? '…'}
              </p>
              <Button size="sm" onClick={() => navigate(`../impact?fileId=${selected.fileId}`)}>
                Open impact analysis
              </Button>
            </Card>
          ) : (
            <p className="muted" style={{ marginTop: 12 }}>Select a file node to load verified relationship edges.</p>
          )}
        </>
      )}
    </div>
  );
}
