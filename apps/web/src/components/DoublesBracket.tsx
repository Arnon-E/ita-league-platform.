import type { CSSProperties } from 'react';

/** A knockout tree as the importer stores it: the leaves are the first-round pairs, an inner node holds the winner's name ('' until it is played). */
export interface BracketTree { n: string; c: BracketTree[] }

const LINE = '2px solid var(--line, #cfd6cc)';
const ARM = 16;

function Box({ node, leaf, root }: { node: BracketTree; leaf: boolean; root: boolean }) {
  const names = node.n ? node.n.split(' / ') : [];
  const style: CSSProperties = {
    border: '1px solid var(--line, #e1e5df)', borderRadius: 8, padding: '5px 9px', minWidth: 150, background: leaf ? 'var(--surface, #fff)' : 'var(--surface2, #f5f6f1)',
    fontSize: 14, lineHeight: 1.35, fontWeight: leaf ? 500 : 800, textAlign: 'start',
    ...(root && names.length ? { borderColor: 'var(--ok, #15803d)', background: 'var(--okbg, #dcfce7)' } : {}),
  };
  return (
    <div style={style} dir="auto">
      {names.length ? names.map((x) => <div key={x} style={{ whiteSpace: 'nowrap' }}>{x}</div>) : <span className="muted">—</span>}
    </div>
  );
}

/** One node with its two children on the left, joined by elbow lines (the tree always grows towards the final on the right). */
function Node({ node, root }: { node: BracketTree; root: boolean }) {
  if (!node.c.length) return <Box node={node} leaf root={false} />;
  return (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'space-around' }}>
        {node.c.map((k, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'stretch', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}><Node node={k} root={false} /></div>
            <div style={{ width: ARM, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, ...(i === 0 ? {} : { borderBottom: LINE, borderRight: LINE }) }} />
              <div style={{ flex: 1, ...(i === 0 ? { borderTop: LINE, borderRight: LINE } : {}) }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ width: ARM, alignSelf: 'center', borderTop: LINE }} />
      <div style={{ display: 'flex', alignItems: 'center' }}><Box node={node} leaf={false} root={root} /></div>
    </div>
  );
}

/** The knockout tree of a doubles category. Scrolls sideways on a narrow screen; the names keep their own direction inside the boxes. */
export function DoublesBracket({ tree }: { tree: BracketTree }) {
  return (
    <div dir="ltr" style={{ overflowX: 'auto', padding: '4px 2px 10px' }}>
      <Node node={tree} root />
    </div>
  );
}
