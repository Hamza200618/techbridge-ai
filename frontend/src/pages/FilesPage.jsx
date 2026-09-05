import { useEffect, useState } from 'react';
import { projectsApi } from '../api/projects';
import { useProject } from '../context/ProjectContext';
import { FileTree } from '../components/FileTree';
import { CodeViewer } from '../components/CodeViewer';
import { Button, ErrorState, HealthBadge, LoadingState } from '../components/ui';
import { ChatMessage } from '../components/ChatMessage';
import { conversationKey, errorMessage, formatBytes } from '../utils/format';

export function FilesPage() {
  const { project } = useProject();
  const [tree, setTree] = useState([]);
  const [open, setOpen] = useState({});
  const [selected, setSelected] = useState(null);
  const [content, setContent] = useState('');
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fileError, setFileError] = useState('');
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    projectsApi
      .tree(project.id)
      .then((data) => setTree(data.tree || []))
      .catch((err) => setFileError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [project.id]);

  async function selectFile(node) {
    setSelected(node);
    setFileError('');
    setContent('');
    setChat([]);
    try {
      const [file, body] = await Promise.all([
        projectsApi.file(project.id, node.fileId),
        projectsApi.content(project.id, node.fileId).catch((err) => {
          setFileError(errorMessage(err));
          return { content: '' };
        }),
      ]);
      setMeta(file.file);
      setContent(body.content || '');
    } catch (err) {
      setFileError(errorMessage(err));
    }
  }

  async function sendFileChat(e) {
    e.preventDefault();
    if (!selected || !input.trim()) return;
    const message = input.trim();
    setInput('');
    setChat((c) => [...c, { role: 'user', content: message }]);
    setSending(true);
    try {
      const key = conversationKey(project.id, 'file', selected.fileId);
      const conversationId = Number(sessionStorage.getItem(key)) || undefined;
      const data = await projectsApi.fileChat(project.id, selected.fileId, { message, conversationId });
      sessionStorage.setItem(key, String(data.conversationId));
      setChat((c) => [...c, data.message]);
    } catch (err) {
      setChat((c) => [...c, { role: 'assistant', content: errorMessage(err) }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Files</h1>
          <p className="muted">Project explorer and file-level assistant</p>
        </div>
      </div>
      {loading ? <LoadingState /> : null}
      <div className="explorer">
        <div className="tree-pane">
          <FileTree
            tree={tree}
            selectedId={selected?.fileId}
            onSelect={selectFile}
            open={open}
            toggle={(id) =>
              setOpen((o) => ({
                ...o,
                [id]: Object.prototype.hasOwnProperty.call(o, id) ? !o[id] : false,
              }))
            }
          />
        </div>
        <div className="code-pane">
          {selected ? (
            <>
              <div className="row" style={{ padding: 12, borderBottom: '1px solid var(--border)', justifyContent: 'space-between' }}>
                <div>
                  <strong>{selected.path}</strong>
                  <div className="muted">
                    {meta?.language || selected.extension || 'file'} · {formatBytes(meta?.sizeBytes || selected.sizeBytes)}
                  </div>
                </div>
                <HealthBadge status={meta?.healthStatus || selected.healthStatus} score={meta?.healthScore} />
              </div>
              {fileError ? <ErrorState message={fileError} /> : <CodeViewer content={content} />}
              <form className="chat-input" onSubmit={sendFileChat}>
                <input
                  className="input"
                  placeholder={`Ask about ${selected.name}…`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <Button variant="primary" disabled={sending || !input.trim()}>
                  {sending ? '…' : 'Send'}
                </Button>
              </form>
              {chat.length ? (
                <div className="chat-log" style={{ maxHeight: 280 }}>
                  {chat.map((m, i) => (
                    <ChatMessage key={i} role={m.role} content={m.content} />
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ padding: 12 }}>
                  File AI uses the selected file, related issues, and analyzer context. It does not modify code.
                </p>
              )}
            </>
          ) : (
            <p className="muted" style={{ padding: 24 }}>Select a file to inspect its contents.</p>
          )}
        </div>
      </div>
    </div>
  );
}
