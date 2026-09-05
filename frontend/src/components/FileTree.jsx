import { healthClass } from '../utils/format';

function Node({ node, depth, selectedId, onSelect, open, toggle }) {
  const isDir = node.fileType === 'directory';
  const expanded = Object.prototype.hasOwnProperty.call(open, node.fileId) ? open[node.fileId] : depth < 1;
  return (
    <div>
      <button
        type="button"
        className={`tree-node ${selectedId === node.fileId ? 'selected' : ''}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => {
          if (isDir) toggle(node.fileId);
          else onSelect(node);
        }}
      >
        <span className={`health-dot ${healthClass(node.healthStatus)}`} />
        <span>{isDir ? (expanded ? '▾' : '▸') : '·'}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      </button>
      {isDir && expanded
        ? (node.children || []).map((child) => (
            <Node
              key={child.fileId}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              open={open}
              toggle={toggle}
            />
          ))
        : null}
    </div>
  );
}

export function FileTree({ tree, selectedId, onSelect, open, toggle }) {
  if (!tree?.length) {
    return <p className="muted" style={{ padding: 8 }}>No files yet. Run analysis to discover the project tree.</p>;
  }
  return tree.map((node) => (
    <Node
      key={node.fileId}
      node={node}
      depth={0}
      selectedId={selectedId}
      onSelect={onSelect}
      open={open}
      toggle={toggle}
    />
  ));
}
