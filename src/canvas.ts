import { readFile, writeFile, mkdir } from "fs/promises";
import { join, resolve, relative, dirname } from "path";
import { randomUUID } from "crypto";
import { PathFilter } from "./pathfilter.js";
import type {
  CanvasData,
  CanvasNode,
  CanvasEdge,
  CanvasResult,
  CreateCanvasParams,
  AddCanvasNodeParams,
  UpdateCanvasNodeParams,
  RemoveCanvasNodeParams,
  AddCanvasEdgeParams,
  RemoveCanvasEdgeParams,
} from "./types.js";

export class CanvasService {
  private vaultPath: string;
  private pathFilter: PathFilter;

  constructor(vaultPath: string, pathFilter: PathFilter) {
    this.vaultPath = vaultPath;
    this.pathFilter = pathFilter;
  }

  private resolvePath(relativePath: string): string {
    relativePath = relativePath.trim();
    const normalizedPath = relativePath.startsWith('/')
      ? relativePath.slice(1)
      : relativePath;

    const fullPath = resolve(join(this.vaultPath, normalizedPath));
    const relativeToVault = relative(this.vaultPath, fullPath);

    if (relativeToVault.startsWith('..') || relativeToVault.startsWith('..\\')) {
      throw new Error(`Path traversal not allowed: ${relativePath}`);
    }

    return fullPath;
  }

  private ensureCanvasExtension(path: string): string {
    if (!path.toLowerCase().endsWith('.canvas')) {
      return path + '.canvas';
    }
    return path;
  }

  private generateId(): string {
    return randomUUID().replace(/-/g, '').substring(0, 16);
  }

  private validateCanvasData(data: any): data is CanvasData {
    if (typeof data !== 'object' || data === null) {
      return false;
    }
    if (!Array.isArray(data.nodes)) {
      return false;
    }
    if (!Array.isArray(data.edges)) {
      return false;
    }
    return true;
  }


  async readCanvas(path: string): Promise<CanvasData> {
    path = this.ensureCanvasExtension(path);

    if (!this.pathFilter.isAllowed(path)) {
      throw new Error(`Access denied: ${path}. Canvas files must have .canvas extension and not be in restricted directories.`);
    }

    const fullPath = this.resolvePath(path);

    try {
      const content = await readFile(fullPath, 'utf-8');
      const data = JSON.parse(content);

      if (!this.validateCanvasData(data)) {
        throw new Error(`Invalid canvas format in ${path}`);
      }

      return data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Canvas not found: ${path}. Use create_canvas to create a new canvas.`);
      }
      throw error;
    }
  }

  private async writeCanvas(path: string, data: CanvasData): Promise<void> {
    path = this.ensureCanvasExtension(path);

    if (!this.pathFilter.isAllowed(path)) {
      throw new Error(`Access denied: ${path}. Canvas files must have .canvas extension and not be in restricted directories.`);
    }

    const fullPath = this.resolvePath(path);

    // Ensure parent directory exists
    const parentDir = dirname(fullPath);
    await mkdir(parentDir, { recursive: true });

    const content = JSON.stringify(data, null, '\t');
    await writeFile(fullPath, content, 'utf-8');
  }

  async createCanvas(params: CreateCanvasParams): Promise<CanvasResult> {
    const { path, nodes = [], edges = [] } = params;
    const canvasPath = this.ensureCanvasExtension(path);

    if (!this.pathFilter.isAllowed(canvasPath)) {
      return {
        success: false,
        path: canvasPath,
        message: `Access denied: ${canvasPath}. Canvas files must have .canvas extension and not be in restricted directories.`
      };
    }

    // Check if file already exists
    const fullPath = this.resolvePath(canvasPath);
    try {
      await readFile(fullPath);
      return {
        success: false,
        path: canvasPath,
        message: `Canvas already exists: ${canvasPath}. Use read_canvas to read it or delete it first.`
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Create nodes with generated IDs first
    const createdNodes: CanvasNode[] = nodes.map(node => ({
      ...node,
      id: this.generateId(),
      width: node.width ?? 400,
      height: node.height ?? 200
    } as CanvasNode));

    // Create index-to-ID mapping for edge references
    // This allows edges to reference nodes by index ("0", "1", "node-0", "node-1", etc.) during creation
    const indexToId: Record<string, string> = {};
    createdNodes.forEach((node, index) => {
      indexToId[String(index)] = node.id;
    });

    // Helper to resolve node reference to actual ID
    const resolveNodeRef = (ref: string): string => {
      // Direct index match: "0", "1", "2"
      if (indexToId[ref]) {
        return indexToId[ref];
      }
      // Pattern match: "node-0", "node-1", "n0", "n1", etc.
      const match = ref.match(/(\d+)$/);
      if (match && match[1] !== undefined) {
        const index = match[1];
        if (indexToId[index]) {
          return indexToId[index];
        }
      }
      // Return original if no match (might be an actual ID)
      return ref;
    };

    // Create edges, resolving index references to actual node IDs
    const createdEdges: CanvasEdge[] = edges.map(edge => {
      const fromNode = resolveNodeRef(edge.fromNode);
      const toNode = resolveNodeRef(edge.toNode);
      return {
        ...edge,
        id: this.generateId(),
        fromNode,
        toNode
      } as CanvasEdge;
    });

    const canvas: CanvasData = {
      nodes: createdNodes,
      edges: createdEdges
    };

    await this.writeCanvas(canvasPath, canvas);

    return {
      success: true,
      path: canvasPath,
      message: `Canvas created successfully with ${canvas.nodes.length} node(s) and ${canvas.edges.length} edge(s).`,
      canvas
    };
  }

  async addNode(params: AddCanvasNodeParams): Promise<CanvasResult> {
    const { path, type, x, y, width = 400, height = 200, ...nodeProps } = params;
    const canvasPath = this.ensureCanvasExtension(path);

    try {
      const canvas = await this.readCanvas(canvasPath);

      const newNode: CanvasNode = {
        id: this.generateId(),
        type,
        x,
        y,
        width,
        height,
        ...nodeProps
      };

      // Add type-specific required properties
      if (type === 'text' && !newNode.text) {
        newNode.text = '';
      }

      canvas.nodes.push(newNode);
      await this.writeCanvas(canvasPath, canvas);

      return {
        success: true,
        path: canvasPath,
        message: `Added ${type} node to canvas.`,
        canvas,
        nodeId: newNode.id
      };
    } catch (error) {
      return {
        success: false,
        path: canvasPath,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async updateNode(params: UpdateCanvasNodeParams): Promise<CanvasResult> {
    const { path, nodeId, updates } = params;
    const canvasPath = this.ensureCanvasExtension(path);

    try {
      const canvas = await this.readCanvas(canvasPath);

      const nodeIndex = canvas.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex === -1) {
        return {
          success: false,
          path: canvasPath,
          message: `Node not found: ${nodeId}`
        };
      }

      // Update node properties (excluding id and undefined values)
      const currentNode = canvas.nodes[nodeIndex];
      const filteredUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, v]) => v !== undefined)
      );
      canvas.nodes[nodeIndex] = {
        ...currentNode,
        ...filteredUpdates,
        id: nodeId // Ensure ID is not changed
      } as CanvasNode;

      await this.writeCanvas(canvasPath, canvas);

      return {
        success: true,
        path: canvasPath,
        message: `Updated node ${nodeId}.`,
        canvas,
        nodeId
      };
    } catch (error) {
      return {
        success: false,
        path: canvasPath,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async removeNode(params: RemoveCanvasNodeParams): Promise<CanvasResult> {
    const { path, nodeId } = params;
    const canvasPath = this.ensureCanvasExtension(path);

    try {
      const canvas = await this.readCanvas(canvasPath);

      const nodeIndex = canvas.nodes.findIndex(n => n.id === nodeId);
      if (nodeIndex === -1) {
        return {
          success: false,
          path: canvasPath,
          message: `Node not found: ${nodeId}`
        };
      }

      // Remove node
      canvas.nodes.splice(nodeIndex, 1);

      // Remove all edges connected to this node
      const removedEdges = canvas.edges.filter(
        e => e.fromNode === nodeId || e.toNode === nodeId
      );
      canvas.edges = canvas.edges.filter(
        e => e.fromNode !== nodeId && e.toNode !== nodeId
      );

      await this.writeCanvas(canvasPath, canvas);

      return {
        success: true,
        path: canvasPath,
        message: `Removed node ${nodeId} and ${removedEdges.length} connected edge(s).`,
        canvas,
        nodeId
      };
    } catch (error) {
      return {
        success: false,
        path: canvasPath,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async addEdge(params: AddCanvasEdgeParams): Promise<CanvasResult> {
    const { path, fromNode, toNode, ...edgeProps } = params;
    const canvasPath = this.ensureCanvasExtension(path);

    try {
      const canvas = await this.readCanvas(canvasPath);

      // Validate that both nodes exist
      const fromExists = canvas.nodes.some(n => n.id === fromNode);
      const toExists = canvas.nodes.some(n => n.id === toNode);

      if (!fromExists) {
        return {
          success: false,
          path: canvasPath,
          message: `Source node not found: ${fromNode}`
        };
      }

      if (!toExists) {
        return {
          success: false,
          path: canvasPath,
          message: `Target node not found: ${toNode}`
        };
      }

      const newEdge: CanvasEdge = {
        id: this.generateId(),
        fromNode,
        toNode,
        ...edgeProps
      };

      canvas.edges.push(newEdge);
      await this.writeCanvas(canvasPath, canvas);

      return {
        success: true,
        path: canvasPath,
        message: `Added edge from ${fromNode} to ${toNode}.`,
        canvas,
        edgeId: newEdge.id
      };
    } catch (error) {
      return {
        success: false,
        path: canvasPath,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async removeEdge(params: RemoveCanvasEdgeParams): Promise<CanvasResult> {
    const { path, edgeId } = params;
    const canvasPath = this.ensureCanvasExtension(path);

    try {
      const canvas = await this.readCanvas(canvasPath);

      const edgeIndex = canvas.edges.findIndex(e => e.id === edgeId);
      if (edgeIndex === -1) {
        return {
          success: false,
          path: canvasPath,
          message: `Edge not found: ${edgeId}`
        };
      }

      canvas.edges.splice(edgeIndex, 1);
      await this.writeCanvas(canvasPath, canvas);

      return {
        success: true,
        path: canvasPath,
        message: `Removed edge ${edgeId}.`,
        canvas,
        edgeId
      };
    } catch (error) {
      return {
        success: false,
        path: canvasPath,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
