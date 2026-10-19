import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
export default function DecisionGraph({ trace }: { trace: any[] }) {
  return (
    <div className="trace-graph">
      <ReactFlow
        nodes={trace.map((s, i) => ({
          id: String(i),
          position: { x: i * 195, y: 20 },
          data: { label: `${s.stage}\n${s.state} · ${s.durationMs} ms` },
          style: {
            background: s.state === "blocked" ? "#e5e5e5" : "#fff",
            border: "1px solid #aaa",
            fontSize: 12,
          },
        }))}
        edges={trace
          .slice(1)
          .map((_, i) => ({
            id: "e" + i,
            source: String(i),
            target: String(i + 1),
            animated: false,
          }))}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background color="#ddd" gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
