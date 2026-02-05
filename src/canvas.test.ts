import { test, expect, beforeEach, afterEach } from "vitest";
import { CanvasService } from "./canvas.js";
import { PathFilter } from "./pathfilter.js";
import { writeFile, mkdtemp, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

let testVaultPath: string;
let canvasService: CanvasService;
let pathFilter: PathFilter;

beforeEach(async () => {
  testVaultPath = await mkdtemp(join(tmpdir(), "mcp-obsidian-canvas-test-"));
  pathFilter = new PathFilter();
  canvasService = new CanvasService(testVaultPath, pathFilter);
});

afterEach(async () => {
  try {
    await rm(testVaultPath, { recursive: true });
  } catch {
    // Ignore cleanup errors
  }
});

// ============================================================================
// CREATE CANVAS TESTS
// ============================================================================

test("create empty canvas", async () => {
  const result = await canvasService.createCanvas({
    path: "test.canvas"
  });

  expect(result.success).toBe(true);
  expect(result.canvas).toBeDefined();
  expect(result.canvas!.nodes).toEqual([]);
  expect(result.canvas!.edges).toEqual([]);
  expect(result.message).toContain("0 node(s)");
});

test("create canvas with nodes", async () => {
  const result = await canvasService.createCanvas({
    path: "test.canvas",
    nodes: [
      { type: "text", x: 0, y: 0, width: 400, height: 200, text: "Hello" },
      { type: "file", x: 500, y: 0, width: 400, height: 300, file: "notes/test.md" }
    ]
  });

  expect(result.success).toBe(true);
  expect(result.canvas!.nodes.length).toBe(2);
  expect(result.canvas!.nodes[0].id).toBeDefined();
  expect(result.canvas!.nodes[0].type).toBe("text");
  expect(result.canvas!.nodes[0].text).toBe("Hello");
  expect(result.canvas!.nodes[1].type).toBe("file");
});

test("create canvas adds .canvas extension if missing", async () => {
  const result = await canvasService.createCanvas({
    path: "test"
  });

  expect(result.success).toBe(true);
  expect(result.path).toBe("test.canvas");
});

test("create canvas with edges referencing nodes by index", async () => {
  const result = await canvasService.createCanvas({
    path: "test.canvas",
    nodes: [
      { type: "text", x: 0, y: 0, width: 300, height: 100, text: "Node 0" },
      { type: "text", x: 400, y: 0, width: 300, height: 100, text: "Node 1" },
      { type: "text", x: 200, y: 200, width: 300, height: 100, text: "Node 2" }
    ],
    edges: [
      { fromNode: "0", toNode: "1", fromSide: "right", toSide: "left" },
      { fromNode: "0", toNode: "2", fromSide: "bottom", toSide: "top" },
      { fromNode: "1", toNode: "2", fromSide: "bottom", toSide: "top", toEnd: "arrow" }
    ]
  });

  expect(result.success).toBe(true);
  expect(result.canvas!.nodes.length).toBe(3);
  expect(result.canvas!.edges.length).toBe(3);

  // Verify edges reference actual node IDs, not indices
  const node0Id = result.canvas!.nodes[0].id;
  const node1Id = result.canvas!.nodes[1].id;
  const node2Id = result.canvas!.nodes[2].id;

  expect(result.canvas!.edges[0].fromNode).toBe(node0Id);
  expect(result.canvas!.edges[0].toNode).toBe(node1Id);
  expect(result.canvas!.edges[1].fromNode).toBe(node0Id);
  expect(result.canvas!.edges[1].toNode).toBe(node2Id);
  expect(result.canvas!.edges[2].fromNode).toBe(node1Id);
  expect(result.canvas!.edges[2].toNode).toBe(node2Id);
  expect(result.canvas!.edges[2].toEnd).toBe("arrow");
});

test("create canvas with edges using node-N pattern", async () => {
  const result = await canvasService.createCanvas({
    path: "test.canvas",
    nodes: [
      { type: "text", x: 0, y: 0, width: 300, height: 100, text: "Node 0" },
      { type: "text", x: 400, y: 0, width: 300, height: 100, text: "Node 1" }
    ],
    edges: [
      { fromNode: "node-0", toNode: "node-1", toEnd: "arrow" }
    ]
  });

  expect(result.success).toBe(true);
  const node0Id = result.canvas!.nodes[0].id;
  const node1Id = result.canvas!.nodes[1].id;

  // Edge should reference actual IDs, not "node-0"/"node-1"
  expect(result.canvas!.edges[0].fromNode).toBe(node0Id);
  expect(result.canvas!.edges[0].toNode).toBe(node1Id);
});

test("create canvas fails if already exists", async () => {
  await canvasService.createCanvas({ path: "test.canvas" });

  const result = await canvasService.createCanvas({ path: "test.canvas" });

  expect(result.success).toBe(false);
  expect(result.message).toContain("already exists");
});

test("create canvas in subdirectory", async () => {
  const result = await canvasService.createCanvas({
    path: "subdir/nested/test.canvas"
  });

  expect(result.success).toBe(true);

  // Verify file was created
  const content = await readFile(join(testVaultPath, "subdir/nested/test.canvas"), "utf-8");
  const data = JSON.parse(content);
  expect(data.nodes).toEqual([]);
  expect(data.edges).toEqual([]);
});

// ============================================================================
// READ CANVAS TESTS
// ============================================================================

test("read canvas", async () => {
  // Create a canvas first
  await canvasService.createCanvas({
    path: "test.canvas",
    nodes: [{ type: "text", x: 0, y: 0, width: 400, height: 200, text: "Test" }]
  });

  const canvas = await canvasService.readCanvas("test.canvas");

  expect(canvas.nodes.length).toBe(1);
  expect(canvas.nodes[0].text).toBe("Test");
  expect(canvas.edges).toEqual([]);
});

test("read canvas adds .canvas extension", async () => {
  await canvasService.createCanvas({ path: "test.canvas" });

  const canvas = await canvasService.readCanvas("test");

  expect(canvas.nodes).toEqual([]);
});

test("read canvas throws for non-existent file", async () => {
  await expect(canvasService.readCanvas("nonexistent.canvas"))
    .rejects.toThrow("Canvas not found");
});

test("read canvas throws for invalid JSON", async () => {
  await writeFile(join(testVaultPath, "invalid.canvas"), "not json");

  await expect(canvasService.readCanvas("invalid.canvas"))
    .rejects.toThrow();
});

test("read canvas throws for invalid canvas structure", async () => {
  await writeFile(join(testVaultPath, "invalid.canvas"), JSON.stringify({ foo: "bar" }));

  await expect(canvasService.readCanvas("invalid.canvas"))
    .rejects.toThrow("Invalid canvas format");
});

// ============================================================================
// ADD NODE TESTS
// ============================================================================

test("add text node", async () => {
  await canvasService.createCanvas({ path: "test.canvas" });

  const result = await canvasService.addNode({
    path: "test.canvas",
    type: "text",
    x: 100,
    y: 100,
    text: "New node"
  });

  expect(result.success).toBe(true);
  expect(result.nodeId).toBeDefined();
  expect(result.canvas!.nodes.length).toBe(1);
  expect(result.canvas!.nodes[0].type).toBe("text");
  expect(result.canvas!.nodes[0].text).toBe("New node");
  expect(result.canvas!.nodes[0].x).toBe(100);
});

test("add file node", async () => {
  await canvasService.createCanvas({ path: "test.canvas" });

  const result = await canvasService.addNode({
    path: "test.canvas",
    type: "file",
    x: 0,
    y: 0,
    file: "notes/my-note.md",
    subpath: "#heading"
  });

  expect(result.success).toBe(true);
  expect(result.canvas!.nodes[0].type).toBe("file");
  expect(result.canvas!.nodes[0].file).toBe("notes/my-note.md");
  expect(result.canvas!.nodes[0].subpath).toBe("#heading");
});

test("add link node", async () => {
  await canvasService.createCanvas({ path: "test.canvas" });

  const result = await canvasService.addNode({
    path: "test.canvas",
    type: "link",
    x: 0,
    y: 0,
    url: "https://example.com"
  });

  expect(result.success).toBe(true);
  expect(result.canvas!.nodes[0].type).toBe("link");
  expect(result.canvas!.nodes[0].url).toBe("https://example.com");
});

test("add group node", async () => {
  await canvasService.createCanvas({ path: "test.canvas" });

  const result = await canvasService.addNode({
    path: "test.canvas",
    type: "group",
    x: -50,
    y: -50,
    width: 800,
    height: 600,
    label: "My Group",
    color: "5"
  });

  expect(result.success).toBe(true);
  expect(result.canvas!.nodes[0].type).toBe("group");
  expect(result.canvas!.nodes[0].label).toBe("My Group");
  expect(result.canvas!.nodes[0].color).toBe("5");
});

test("add node uses default dimensions", async () => {
  await canvasService.createCanvas({ path: "test.canvas" });

  const result = await canvasService.addNode({
    path: "test.canvas",
    type: "text",
    x: 0,
    y: 0
  });

  expect(result.success).toBe(true);
  expect(result.canvas!.nodes[0].width).toBe(400);
  expect(result.canvas!.nodes[0].height).toBe(200);
});

test("add node fails for non-existent canvas", async () => {
  const result = await canvasService.addNode({
    path: "nonexistent.canvas",
    type: "text",
    x: 0,
    y: 0
  });

  expect(result.success).toBe(false);
  expect(result.message).toContain("Canvas not found");
});

// ============================================================================
// UPDATE NODE TESTS
// ============================================================================

test("update node properties", async () => {
  const createResult = await canvasService.createCanvas({
    path: "test.canvas",
    nodes: [{ type: "text", x: 0, y: 0, width: 400, height: 200, text: "Original" }]
  });

  const nodeId = createResult.canvas!.nodes[0].id;

  const result = await canvasService.updateNode({
    path: "test.canvas",
    nodeId,
    updates: {
      text: "Updated",
      x: 100,
      color: "1"
    }
  });

  expect(result.success).toBe(true);
  expect(result.canvas!.nodes[0].text).toBe("Updated");
  expect(result.canvas!.nodes[0].x).toBe(100);
  expect(result.canvas!.nodes[0].color).toBe("1");
  expect(result.canvas!.nodes[0].id).toBe(nodeId); // ID should not change
});

test("update node fails for non-existent node", async () => {
  await canvasService.createCanvas({ path: "test.canvas" });

  const result = await canvasService.updateNode({
    path: "test.canvas",
    nodeId: "nonexistent",
    updates: { text: "Test" }
  });

  expect(result.success).toBe(false);
  expect(result.message).toContain("Node not found");
});

// ============================================================================
// REMOVE NODE TESTS
// ============================================================================

test("remove node", async () => {
  const createResult = await canvasService.createCanvas({
    path: "test.canvas",
    nodes: [
      { type: "text", x: 0, y: 0, width: 400, height: 200, text: "Node 1" },
      { type: "text", x: 500, y: 0, width: 400, height: 200, text: "Node 2" }
    ]
  });

  const nodeId = createResult.canvas!.nodes[0].id;

  const result = await canvasService.removeNode({
    path: "test.canvas",
    nodeId
  });

  expect(result.success).toBe(true);
  expect(result.canvas!.nodes.length).toBe(1);
  expect(result.canvas!.nodes[0].text).toBe("Node 2");
});

test("remove node also removes connected edges", async () => {
  const createResult = await canvasService.createCanvas({
    path: "test.canvas",
    nodes: [
      { type: "text", x: 0, y: 0, width: 400, height: 200, text: "Node 1" },
      { type: "text", x: 500, y: 0, width: 400, height: 200, text: "Node 2" },
      { type: "text", x: 1000, y: 0, width: 400, height: 200, text: "Node 3" }
    ]
  });

  const node1Id = createResult.canvas!.nodes[0].id;
  const node2Id = createResult.canvas!.nodes[1].id;
  const node3Id = createResult.canvas!.nodes[2].id;

  // Add edges: node1 -> node2 -> node3
  await canvasService.addEdge({
    path: "test.canvas",
    fromNode: node1Id,
    toNode: node2Id
  });

  await canvasService.addEdge({
    path: "test.canvas",
    fromNode: node2Id,
    toNode: node3Id
  });

  // Remove node2 - should remove both edges
  const result = await canvasService.removeNode({
    path: "test.canvas",
    nodeId: node2Id
  });

  expect(result.success).toBe(true);
  expect(result.message).toContain("2 connected edge(s)");
  expect(result.canvas!.nodes.length).toBe(2);
  expect(result.canvas!.edges.length).toBe(0);
});

test("remove node fails for non-existent node", async () => {
  await canvasService.createCanvas({ path: "test.canvas" });

  const result = await canvasService.removeNode({
    path: "test.canvas",
    nodeId: "nonexistent"
  });

  expect(result.success).toBe(false);
  expect(result.message).toContain("Node not found");
});

// ============================================================================
// ADD EDGE TESTS
// ============================================================================

test("add edge between nodes", async () => {
  const createResult = await canvasService.createCanvas({
    path: "test.canvas",
    nodes: [
      { type: "text", x: 0, y: 0, width: 400, height: 200, text: "Node 1" },
      { type: "text", x: 500, y: 0, width: 400, height: 200, text: "Node 2" }
    ]
  });

  const node1Id = createResult.canvas!.nodes[0].id;
  const node2Id = createResult.canvas!.nodes[1].id;

  const result = await canvasService.addEdge({
    path: "test.canvas",
    fromNode: node1Id,
    toNode: node2Id,
    fromSide: "right",
    toSide: "left",
    toEnd: "arrow",
    label: "connects to"
  });

  expect(result.success).toBe(true);
  expect(result.edgeId).toBeDefined();
  expect(result.canvas!.edges.length).toBe(1);
  expect(result.canvas!.edges[0].fromNode).toBe(node1Id);
  expect(result.canvas!.edges[0].toNode).toBe(node2Id);
  expect(result.canvas!.edges[0].fromSide).toBe("right");
  expect(result.canvas!.edges[0].toEnd).toBe("arrow");
  expect(result.canvas!.edges[0].label).toBe("connects to");
});

test("add edge fails for non-existent source node", async () => {
  const createResult = await canvasService.createCanvas({
    path: "test.canvas",
    nodes: [{ type: "text", x: 0, y: 0, width: 400, height: 200, text: "Node 1" }]
  });

  const nodeId = createResult.canvas!.nodes[0].id;

  const result = await canvasService.addEdge({
    path: "test.canvas",
    fromNode: "nonexistent",
    toNode: nodeId
  });

  expect(result.success).toBe(false);
  expect(result.message).toContain("Source node not found");
});

test("add edge fails for non-existent target node", async () => {
  const createResult = await canvasService.createCanvas({
    path: "test.canvas",
    nodes: [{ type: "text", x: 0, y: 0, width: 400, height: 200, text: "Node 1" }]
  });

  const nodeId = createResult.canvas!.nodes[0].id;

  const result = await canvasService.addEdge({
    path: "test.canvas",
    fromNode: nodeId,
    toNode: "nonexistent"
  });

  expect(result.success).toBe(false);
  expect(result.message).toContain("Target node not found");
});

// ============================================================================
// REMOVE EDGE TESTS
// ============================================================================

test("remove edge", async () => {
  const createResult = await canvasService.createCanvas({
    path: "test.canvas",
    nodes: [
      { type: "text", x: 0, y: 0, width: 400, height: 200, text: "Node 1" },
      { type: "text", x: 500, y: 0, width: 400, height: 200, text: "Node 2" }
    ]
  });

  const node1Id = createResult.canvas!.nodes[0].id;
  const node2Id = createResult.canvas!.nodes[1].id;

  const edgeResult = await canvasService.addEdge({
    path: "test.canvas",
    fromNode: node1Id,
    toNode: node2Id
  });

  const edgeId = edgeResult.edgeId!;

  const result = await canvasService.removeEdge({
    path: "test.canvas",
    edgeId
  });

  expect(result.success).toBe(true);
  expect(result.canvas!.edges.length).toBe(0);
});

test("remove edge fails for non-existent edge", async () => {
  await canvasService.createCanvas({ path: "test.canvas" });

  const result = await canvasService.removeEdge({
    path: "test.canvas",
    edgeId: "nonexistent"
  });

  expect(result.success).toBe(false);
  expect(result.message).toContain("Edge not found");
});

// ============================================================================
// SECURITY TESTS
// ============================================================================

test("path traversal is blocked", async () => {
  await expect(canvasService.readCanvas("../outside.canvas"))
    .rejects.toThrow("Path traversal not allowed");
});

test("access to .obsidian directory is blocked", async () => {
  const result = await canvasService.createCanvas({
    path: ".obsidian/test.canvas"
  });

  expect(result.success).toBe(false);
  expect(result.message).toContain("Access denied");
});

test("access to .git directory is blocked", async () => {
  const result = await canvasService.createCanvas({
    path: ".git/test.canvas"
  });

  expect(result.success).toBe(false);
  expect(result.message).toContain("Access denied");
});
