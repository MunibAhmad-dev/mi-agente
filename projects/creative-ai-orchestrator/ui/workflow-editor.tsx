import React, { useState, useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnNodesChange,
  type OnEdgesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ============================================================================
// ComfyUI Node Types for ReactFlow
// ============================================================================

interface ComfyNodeData {
  label: string;
  nodeType: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

const COMFY_NODE_COLORS: Record<string, string> = {
  KSampler: "#4a90d9",
  CheckpointLoaderSimple: "#6c5ce7",
  CLIPTextEncode: "#00b894",
  VAEDecode: "#e17055",
  SaveImage: "#fdcb6e",
  LoadImage: "#fd79a8",
  EmptyLatentImage: "#a29bfe",
  ImageUpscaleWithModel: "#00cec9",
  ImageScale: "#55a3f5",
  LoRALoader: "#ff7675",
  ControlNetLoader: "#fab1a0",
  VAELoader: "#74b9ff",
  ConditioningCombine: "#81ecec",
  Prompt: "#ffeaa7",
  Note: "#dfe6e9",
  Unknown: "#636e72",
};

// Generic ComfyUI node component
function ComfyUINode({ data, selected }: { data: ComfyNodeData; selected?: boolean }) {
  const color = COMFY_NODE_COLORS[data.nodeType] || COMFY_NODE_COLORS.Unknown;
  const inputKeys = Object.keys(data.inputs || {});
  const outputKeys = Object.keys(data.outputs || {});

  return (
    <div
      style={{
        background: "#1e1e2e",
        border: `2px solid ${selected ? "#fff" : color}`,
        borderRadius: 8,
        padding: "8px 12px",
        minWidth: 180,
        fontSize: 12,
        color: "#cdd6f4",
        boxShadow: selected ? `0 0 12px ${color}88` : "none",
      }}
    >
      <div style={{ color, fontWeight: 700, marginBottom: 4 }}>{data.nodeType}</div>
      {inputKeys.map((key, i) => (
        <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Handle
            type="target"
            position={Position.Left}
            id={`in-${key}`}
            style={{ background: color, width: 8, height: 8, top: 28 + i * 18 }}
          />
          <span style={{ fontSize: 11, opacity: 0.8 }}>{key}: {String(data.inputs[key]).slice(0, 20)}</span>
        </div>
      ))}
      {outputKeys.map((key, i) => (
        <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
          <span style={{ fontSize: 11, opacity: 0.8 }}>{key}</span>
          <Handle
            type="source"
            position={Position.Right}
            id={`out-${key}`}
            style={{ background: color, width: 8, height: 8, top: 28 + i * 18 }}
          />
        </div>
      ))}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  comfyNode: ComfyUINode,
};

// ============================================================================
// Convert ComfyUI workflow JSON to ReactFlow nodes/edges
// ============================================================================

function comfyWorkflowToReactFlow(workflow: Record<string, unknown> | null) {
  if (!workflow) return { nodes: [], edges: [] };

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // ComfyUI format: { "1": { "class_type": "KSampler", "inputs": {...} }, ... }
  for (const [id, node] of Object.entries(workflow)) {
    if (typeof node !== "object" || node === null) continue;
    const n = node as Record<string, unknown>;
    const classType = (n.class_type as string) || "Unknown";
    const inputs = (n.inputs as Record<string, unknown>) || {};

    nodes.push({
      id: id,
      type: "comfyNode",
      position: { x: Math.random() * 600, y: Math.random() * 400 },
      data: {
        label: classType,
        nodeType: classType,
        inputs,
        outputs: {},
      },
    });

    // Parse connections: inputs like ["5", 0] mean "connected to node 5, output 0"
    for (const [key, value] of Object.entries(inputs)) {
      if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string") {
        edges.push({
          id: `${value[0]}-${id}-${key}`,
          source: value[0],
          target: id,
          sourceHandle: `out-${value[1] || "output"}`,
          targetHandle: `in-${key}`,
          style: { stroke: "#636e72", strokeWidth: 2 },
        });
      }
    }
  }

  // Auto-layout: simple grid layout
  nodes.forEach((node, i) => {
    node.position = { x: (i % 4) * 250, y: Math.floor(i / 4) * 200 };
  });

  return { nodes, edges };
}

function reactFlowToComfyWorkflow(nodes: Node[], edges: Edge[]) {
  const workflow: Record<string, unknown> = {};

  for (const node of nodes) {
    const d = node.data as ComfyNodeData;
    const inputs: Record<string, unknown> = { ...d.inputs };

    // Resolve edges into ComfyUI format
    for (const edge of edges) {
      if (edge.target === node.id) {
        const targetKey = edge.targetHandle?.replace("in-", "") || "";
        inputs[targetKey] = [edge.source, parseInt(edge.sourceHandle?.replace("out-", "") || "0")];
      }
    }

    workflow[node.id] = {
      class_type: d.nodeType,
      inputs,
    };
  }

  return workflow;
}

// ============================================================================
// Main Workflow Editor Component
// ============================================================================

interface WorkflowEditorProps {
  workflow: Record<string, unknown> | null;
  onSave?: (workflow: Record<string, unknown>) => void;
  onExecute?: (workflow: Record<string, unknown>) => void;
}

export default function WorkflowEditor({ workflow, onSave, onExecute }: WorkflowEditorProps) {
  const initial = useMemo(() => comfyWorkflowToReactFlow(workflow), [workflow]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, style: { stroke: "#636e72", strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  const handleSave = () => {
    const comfyWorkflow = reactFlowToComfyWorkflow(nodes, edges);
    onSave?.(comfyWorkflow);
  };

  const handleExecute = () => {
    const comfyWorkflow = reactFlowToComfyWorkflow(nodes, edges);
    onExecute?.(comfyWorkflow);
  };

  const handleAddNode = (nodeType: string) => {
    const id = String(Date.now());
    const newNode: Node = {
      id,
      type: "comfyNode",
      position: { x: Math.random() * 600, y: Math.random() * 400 },
      data: {
        label: nodeType,
        nodeType,
        inputs: getDefaultInputs(nodeType),
        outputs: getDefaultOutputs(nodeType),
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleDeleteSelected = () => {
    if (selectedNode) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
      setSelectedNode(null);
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", background: "#181825", borderBottom: "1px solid #313244", flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={handleSave} style={{ fontSize: 12, padding: "4px 12px" }}>💾 Save</button>
        <button className="btn btn-primary" onClick={handleExecute} style={{ fontSize: 12, padding: "4px 12px" }}>▶️ Execute</button>
        <button className="btn" onClick={handleDeleteSelected} style={{ fontSize: 12, padding: "4px 12px" }}>🗑️ Delete</button>
        <span style={{ color: "#6c7086", alignSelf: "center", fontSize: 11 }}>|</span>
        {["KSampler", "CheckpointLoaderSimple", "CLIPTextEncode", "VAEDecode", "SaveImage", "LoadImage", "EmptyLatentImage", "LoRALoader"].map((type) => (
          <button key={type} className="btn" onClick={() => handleAddNode(type)} style={{ fontSize: 11, padding: "3px 8px" }}>+ {type}</button>
        ))}
      </div>

      {/* ReactFlow Canvas */}
      <div style={{ flex: 1 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange as OnNodesChange}
          onEdgesChange={onEdgesChange as OnEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => setSelectedNode(node)}
          nodeTypes={nodeTypes}
          fitView
          style={{ background: "#11111b" }}
        >
          <Background color="#313244" gap={16} />
          <Controls style={{ background: "#1e1e2e", borderColor: "#313244" }} />
          <MiniMap
            nodeColor={(node) => {
              const d = node.data as ComfyNodeData;
              return COMFY_NODE_COLORS[d?.nodeType] || "#636e72";
            }}
            style={{ background: "#181825" }}
          />
        </ReactFlow>
      </div>

      {/* Node Inspector */}
      {selectedNode && (
        <div style={{ padding: "8px 12px", background: "#181825", borderTop: "1px solid #313244", fontSize: 12, color: "#cdd6f4" }}>
          <strong>{(selectedNode.data as ComfyNodeData).nodeType}</strong>
          <span style={{ marginLeft: 12, opacity: 0.6 }}>ID: {selectedNode.id}</span>
          <span style={{ marginLeft: 12, opacity: 0.6 }}>
            Inputs: {Object.keys((selectedNode.data as ComfyNodeData).inputs || {}).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}

function getDefaultInputs(nodeType: string): Record<string, unknown> {
  switch (nodeType) {
    case "KSampler": return { seed: 0, steps: 20, cfg: 7.0, sampler_name: "euler", scheduler: "normal", denoise: 1.0 };
    case "CheckpointLoaderSimple": return { ckpt_name: "" };
    case "CLIPTextEncode": return { text: "" };
    case "VAEDecode": return {};
    case "SaveImage": return { filename_prefix: "output" };
    case "LoadImage": return { image: "" };
    case "EmptyLatentImage": return { width: 512, height: 512, batch_size: 1 };
    case "LoRALoader": return { lora_name: "", strength_model: 1.0, strength_clip: 1.0 };
    default: return {};
  }
}

function getDefaultOutputs(nodeType: string): Record<string, unknown> {
  switch (nodeType) {
    case "KSampler": return { LATENT: "latent" };
    case "CheckpointLoaderSimple": return { MODEL: "model", CLIP: "clip", VAE: "vae" };
    case "CLIPTextEncode": return { CONDITIONING: "conditioning" };
    case "VAEDecode": return { IMAGE: "image" };
    case "SaveImage": return {};
    case "LoadImage": return { IMAGE: "image", MASK: "mask" };
    case "EmptyLatentImage": return { LATENT: "latent" };
    case "LoRALoader": return { MODEL: "model", CLIP: "clip" };
    default: return {};
  }
}
