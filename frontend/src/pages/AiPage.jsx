import { useState } from 'react';
import { projectsApi } from '../api/projects';
import { useProject } from '../context/ProjectContext';
import { ChatMessage } from '../components/ChatMessage';
import { Button, EmptyState } from '../components/ui';
import { conversationKey, errorMessage } from '../utils/format';

export function AiPage() {
  const { project } = useProject();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  async function send(e) {
    e.preventDefault();
    if (!input.trim()) return;
    const message = input.trim();
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setSending(true);
    try {
      const key = conversationKey(project.id, 'project');
      const conversationId = Number(sessionStorage.getItem(key)) || undefined;
      const data = await projectsApi.projectChat(project.id, { message, conversationId });
      sessionStorage.setItem(key, String(data.conversationId));
      setMessages((m) => [...m, data.message]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: errorMessage(err) }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>AI Assistant</h1>
          <p className="muted">Project-scoped engineering assistant. Code is never modified from this chat.</p>
        </div>
      </div>
      <div className="chat-wrap">
        <div className="chat-log">
          {!messages.length ? (
            <EmptyState
              title="Ask about this project"
              body="Architecture, risks, files, and analyzer findings. Suggestions here are explanations only."
            />
          ) : (
            messages.map((m, i) => <ChatMessage key={i} role={m.role} content={m.content} />)
          )}
          {sending ? <p className="muted">Thinking…</p> : null}
        </div>
        <form className="chat-input" onSubmit={send}>
          <input
            className="input"
            placeholder="Ask about your project…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Message"
          />
          <Button variant="primary" disabled={sending || !input.trim()}>Send</Button>
        </form>
      </div>
    </div>
  );
}
