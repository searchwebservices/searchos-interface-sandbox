// The shared canvas engine of the app pages: xyflow pan and zoom (as on #/lan) around tiles placed by canvas/layout.
// It knows nothing about estates or clients: a page hands it a layout and a tile renderer. Imported lazily by the pages
// so @xyflow/react stays out of the main chunk.
import '@xyflow/react/dist/style.css'
import '@/lan/lan.css'
import { memo, useEffect, useMemo } from 'react'
import { Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Node, type Edge as RfEdge, type NodeProps } from '@xyflow/react'
import type { ReactNode } from 'react'
import type { Layout } from './layout'

interface TileData extends Record<string, unknown> {
  content: ReactNode
  flow: Flow
}
export type Flow = 'h' | 'v' | 'radial'

const Tile = memo(function Tile({ data }: NodeProps<Node<TileData, 'tile'>>) {
  const f = data.flow
  const centre = f === 'radial' ? { left: '50%', top: '50%' } : undefined
  return (
    <div className="h-full w-full">
      {f === 'v' ? (
        <>
          <Handle id="t" type="target" position={Position.Top} isConnectable={false} />
          <Handle id="lt" type="target" position={Position.Left} isConnectable={false} />
          <Handle id="b" type="source" position={Position.Bottom} isConnectable={false} />
          <Handle id="ls" type="source" position={Position.Left} isConnectable={false} />
        </>
      ) : (
        <>
          <Handle type="target" position={f === 'radial' ? Position.Top : Position.Left} isConnectable={false} style={centre} />
          <Handle type="source" position={f === 'radial' ? Position.Top : Position.Right} isConnectable={false} style={centre} />
        </>
      )}
      {data.content}
    </div>
  )
})
const nodeTypes = { tile: Tile }

function Inner<T extends { id: string }>({ layout, render, onSelect, fitIds, flow = 'h', label, minimap }: Props<T>) {
  const flow_ = useReactFlow()
  const nodes = useMemo<Node<TileData>[]>(
    () => layout.nodes.map((p) => ({ id: p.id, type: 'tile', position: { x: p.x, y: p.y }, width: p.w, height: p.h, draggable: false, selectable: false, focusable: true, data: { content: render(p.node, p.depth), flow } })),
    [layout, render, flow],
  )
  const edges = useMemo<RfEdge[]>(() => layout.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, type: flow === 'radial' ? 'straight' : 'smoothstep',
      ...(flow === 'v' ? (e.kind === 'bracket' ? { sourceHandle: 'ls', targetHandle: 'lt' } : { sourceHandle: 'b', targetHandle: 't' }) : {}),
    })), [layout, flow])
  // Fit once, on first load (the fitView prop below, plus this pass once xyflow has the nodes). After that the viewport is the
  // person's: opening or closing a branch grows the layout but never moves or zooms the view. The Controls fit button refits.
  useEffect(() => {
    const t = setTimeout(() => void flow_.fitView({ ...(fitIds?.length ? { nodes: fitIds.map((id) => ({ id })) } : {}), duration: 0, padding: 0.12, minZoom: 0.05, maxZoom: 1 }), 40)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => onSelect(n.id)}
      nodesConnectable={false}
      elementsSelectable={false}
      nodesDraggable={false}
      onlyRenderVisibleElements
      fitView
      fitViewOptions={{ padding: 0.12, duration: 0, minZoom: 0.05, maxZoom: 1 }}
      minZoom={0.05}
      maxZoom={1.6}
      preventScrolling
      panOnDrag
      zoomOnPinch
      aria-label={label}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
      <Controls showInteractive={false} position="bottom-left" />
      {minimap && <MiniMap pannable zoomable position="bottom-right" nodeStrokeWidth={0} nodeColor="var(--muted-foreground)" />}
    </ReactFlow>
  )
}

interface Props<T extends { id: string }> {
  layout: Layout<T>
  render: (node: T, depth: number) => ReactNode
  onSelect: (id: string) => void
  flow?: Flow
  // Fit these tiles on load instead of the whole drawing (the Controls fit button still fits everything).
  fitIds?: string[]
  label: string
  minimap?: boolean
}

export default function TreeCanvas<T extends { id: string }>(props: Omit<Props<T>, 'flow'> & { flow?: Flow }) {
  return (
    <div className="lan-flow relative min-h-[240px] min-w-0 flex-1 touch-none [&_.react-flow__minimap]:hidden md:[&_.react-flow__minimap]:block" data-testid="tree-canvas" data-tiles={props.layout.nodes.length}>
      <ReactFlowProvider>
        <Inner {...props} flow={props.flow ?? 'h'} />
      </ReactFlowProvider>
    </div>
  )
}
