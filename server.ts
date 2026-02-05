#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { FileSystemService } from "./src/filesystem.js";
import { FrontmatterHandler } from "./src/frontmatter.js";
import { PathFilter } from "./src/pathfilter.js";
import { SearchService } from "./src/search.js";
import { CanvasService } from "./src/canvas.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get package.json version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
);
const VERSION = packageJson.version;

// Handle --version and --help flags
const arg = process.argv[2];
if (arg === "--version" || arg === "-v") {
  console.log(VERSION);
  process.exit(0);
}

if (arg === "--help" || arg === "-h") {
  console.log(`
@mauricio.wolff/mcp-obsidian v${VERSION}

Universal AI bridge for Obsidian vaults - connect any MCP-compatible assistant

Usage:
  npx @mauricio.wolff/mcp-obsidian <vault-path>

Arguments:
  <vault-path>    Path to your Obsidian vault directory

Options:
  --version, -v   Show version number
  --help, -h      Show this help message

Examples:
  npx @mauricio.wolff/mcp-obsidian ~/Documents/MyVault
  npx @mauricio.wolff/mcp-obsidian /path/to/obsidian/vault
`);
  process.exit(0);
}

const vaultPath = arg;
if (!vaultPath) {
  console.error("Usage: npx @mauricio.wolff/mcp-obsidian /path/to/vault");
  console.error("Run 'npx @mauricio.wolff/mcp-obsidian --help' for more information");
  process.exit(1);
}

// Initialize services
const pathFilter = new PathFilter();
const frontmatterHandler = new FrontmatterHandler();
const fileSystem = new FileSystemService(vaultPath, pathFilter, frontmatterHandler);
const searchService = new SearchService(vaultPath, pathFilter);
const canvasService = new CanvasService(vaultPath, pathFilter);

const server = new Server({
  name: "mcp-obsidian",
  version: VERSION
}, {
  capabilities: {
    tools: {},
  },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_note",
        description: "Read a note from the Obsidian vault",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the note relative to vault root"
            },
            prettyPrint: {
              type: "boolean",
              description: "Format JSON response with indentation (default: false)",
              default: false
            }
          },
          required: ["path"]
        }
      },
      {
        name: "write_note",
        description: "Write a note to the Obsidian vault",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the note relative to vault root"
            },
            content: {
              type: "string",
              description: "Content of the note"
            },
            frontmatter: {
              type: "object",
              description: "Frontmatter object (optional)"
            },
            mode: {
              type: "string",
              enum: ["overwrite", "append", "prepend"],
              description: "Write mode: 'overwrite' (default), 'append', or 'prepend'",
              default: "overwrite"
            }
          },
          required: ["path", "content"]
        }
      },
      {
        name: "patch_note",
        description: "Efficiently update part of a note by replacing a specific string. This is more efficient than rewriting the entire note for small changes.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the note relative to vault root"
            },
            oldString: {
              type: "string",
              description: "The exact string to replace. Must match exactly including whitespace and line breaks."
            },
            newString: {
              type: "string",
              description: "The new string to insert in place of oldString"
            },
            replaceAll: {
              type: "boolean",
              description: "If true, replace all occurrences. If false (default), the operation will fail if multiple matches are found to prevent unintended replacements.",
              default: false
            }
          },
          required: ["path", "oldString", "newString"]
        }
      },
      {
        name: "list_directory",
        description: "List files and directories in the vault",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path relative to vault root (default: '/')",
              default: "/"
            },
            prettyPrint: {
              type: "boolean",
              description: "Format JSON response with indentation (default: false)",
              default: false
            }
          }
        }
      },
      {
        name: "delete_note",
        description: "Delete a note from the Obsidian vault (requires confirmation)",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the note relative to vault root"
            },
            confirmPath: {
              type: "string",
              description: "Confirmation: must exactly match the path parameter to proceed with deletion"
            }
          },
          required: ["path", "confirmPath"]
        }
      },
      {
        name: "search_notes",
        description: "Search for notes in the vault by content or frontmatter. Supports multi-word search with AND/OR logic.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query text. For multi-word queries, behavior depends on searchMode."
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default: 20, max: 100)",
              default: 20
            },
            searchContent: {
              type: "boolean",
              description: "Search in note content (default: true)",
              default: true
            },
            searchFrontmatter: {
              type: "boolean",
              description: "Search in frontmatter (default: false)",
              default: false
            },
            caseSensitive: {
              type: "boolean",
              description: "Case sensitive search (default: false)",
              default: false
            },
            searchMode: {
              type: "string",
              enum: ["exact", "all", "any"],
              description: "Search mode: 'exact' matches the exact phrase, 'all' requires all words to be present (AND logic, default), 'any' matches if any word is present (OR logic)",
              default: "all"
            },
            prettyPrint: {
              type: "boolean",
              description: "Format JSON response with indentation (default: false)",
              default: false
            }
          },
          required: ["query"]
        }
      },
      {
        name: "move_note",
        description: "Move or rename a note in the vault",
        inputSchema: {
          type: "object",
          properties: {
            oldPath: {
              type: "string",
              description: "Current path of the note"
            },
            newPath: {
              type: "string",
              description: "New path for the note"
            },
            overwrite: {
              type: "boolean",
              description: "Allow overwriting existing file (default: false)",
              default: false
            }
          },
          required: ["oldPath", "newPath"]
        }
      },
      {
        name: "read_multiple_notes",
        description: "Read multiple notes in a batch (max 10 files)",
        inputSchema: {
          type: "object",
          properties: {
            paths: {
              type: "array",
              items: { type: "string" },
              description: "Array of note paths to read",
              maxItems: 10
            },
            includeContent: {
              type: "boolean",
              description: "Include note content (default: true)",
              default: true
            },
            includeFrontmatter: {
              type: "boolean",
              description: "Include frontmatter (default: true)",
              default: true
            },
            prettyPrint: {
              type: "boolean",
              description: "Format JSON response with indentation (default: false)",
              default: false
            }
          },
          required: ["paths"]
        }
      },
      {
        name: "update_frontmatter",
        description: "Update frontmatter of a note without changing content",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the note"
            },
            frontmatter: {
              type: "object",
              description: "Frontmatter object to update"
            },
            merge: {
              type: "boolean",
              description: "Merge with existing frontmatter (default: true)",
              default: true
            }
          },
          required: ["path", "frontmatter"]
        }
      },
      {
        name: "get_notes_info",
        description: "Get metadata for notes without reading full content",
        inputSchema: {
          type: "object",
          properties: {
            paths: {
              type: "array",
              items: { type: "string" },
              description: "Array of note paths to get info for"
            },
            prettyPrint: {
              type: "boolean",
              description: "Format JSON response with indentation (default: false)",
              default: false
            }
          },
          required: ["paths"]
        }
      },
      {
        name: "get_frontmatter",
        description: "Extract frontmatter from a note without reading the content",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the note relative to vault root"
            },
            prettyPrint: {
              type: "boolean",
              description: "Format JSON response with indentation (default: false)",
              default: false
            }
          },
          required: ["path"]
        }
      },
      {
        name: "manage_tags",
        description: "Add, remove, or list tags in a note",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the note relative to vault root"
            },
            operation: {
              type: "string",
              enum: ["add", "remove", "list"],
              description: "Operation to perform: 'add', 'remove', or 'list'"
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Array of tags (required for 'add' and 'remove' operations)"
            }
          },
          required: ["path", "operation"]
        }
      },
      {
        name: "get_vault_stats",
        description: "Get vault statistics including total notes, folders, size, and recently modified files. Useful for understanding vault scope before batch operations.",
        inputSchema: {
          type: "object",
          properties: {
            recentCount: {
              type: "number",
              description: "Number of recently modified files to return (default: 5, max: 20)",
              default: 5
            },
            prettyPrint: {
              type: "boolean",
              description: "Format JSON response with indentation (default: false)",
              default: false
            }
          }
        }
      },
      {
        name: "find_notes",
        description: "Find notes containing query words - returns only file paths (lightweight). Use this when you need a list of matching files without excerpts. Supports multi-word search with AND/OR logic.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query text. For multi-word queries, behavior depends on searchMode."
            },
            limit: {
              type: "number",
              description: "Maximum number of results (default: 20, max: 100)",
              default: 20
            },
            searchContent: {
              type: "boolean",
              description: "Search in note content (default: true)",
              default: true
            },
            searchFrontmatter: {
              type: "boolean",
              description: "Search in frontmatter (default: false)",
              default: false
            },
            caseSensitive: {
              type: "boolean",
              description: "Case sensitive search (default: false)",
              default: false
            },
            searchMode: {
              type: "string",
              enum: ["exact", "all", "any"],
              description: "Search mode: 'exact' matches the exact phrase, 'all' requires all words to be present (AND logic, default), 'any' matches if any word is present (OR logic)",
              default: "all"
            }
          },
          required: ["query"]
        }
      },
      // Canvas tools
      {
        name: "create_canvas",
        description: "Create a new Obsidian canvas file. Canvas files are visual diagrams with nodes (text, files, links, groups) and edges (connections).",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path for the canvas file (relative to vault root). .canvas extension added automatically if missing."
            },
            nodes: {
              type: "array",
              description: "Initial nodes to create (optional)",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["text", "file", "link", "group"] },
                  x: { type: "number" },
                  y: { type: "number" },
                  width: { type: "number" },
                  height: { type: "number" },
                  text: { type: "string", description: "For text nodes" },
                  file: { type: "string", description: "For file nodes - path to note" },
                  url: { type: "string", description: "For link nodes" },
                  label: { type: "string", description: "For group nodes" },
                  color: { type: "string", description: "Color: hex (#RRGGBB) or preset (1-6)" }
                },
                required: ["type", "x", "y"]
              }
            },
            edges: {
              type: "array",
              description: "Initial edges to create (optional)",
              items: {
                type: "object",
                properties: {
                  fromNode: { type: "string", description: "Source node ID" },
                  toNode: { type: "string", description: "Target node ID" },
                  fromSide: { type: "string", enum: ["top", "right", "bottom", "left"] },
                  toSide: { type: "string", enum: ["top", "right", "bottom", "left"] },
                  toEnd: { type: "string", enum: ["none", "arrow"] },
                  label: { type: "string" }
                },
                required: ["fromNode", "toNode"]
              }
            }
          },
          required: ["path"]
        }
      },
      {
        name: "read_canvas",
        description: "Read an Obsidian canvas file and return its structure (nodes and edges).",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the canvas file (relative to vault root)"
            },
            prettyPrint: {
              type: "boolean",
              description: "Format JSON response with indentation (default: false)",
              default: false
            }
          },
          required: ["path"]
        }
      },
      {
        name: "add_canvas_node",
        description: "Add a node to an existing canvas. Node types: text (markdown content), file (embed a note), link (web URL), group (visual container).",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the canvas file"
            },
            type: {
              type: "string",
              enum: ["text", "file", "link", "group"],
              description: "Type of node to add"
            },
            x: { type: "number", description: "X position in pixels" },
            y: { type: "number", description: "Y position in pixels" },
            width: { type: "number", description: "Width in pixels (default: 400)" },
            height: { type: "number", description: "Height in pixels (default: 200)" },
            text: { type: "string", description: "Content for text nodes (markdown supported)" },
            file: { type: "string", description: "Path to note for file nodes" },
            subpath: { type: "string", description: "Heading/block reference for file nodes (e.g., #heading)" },
            url: { type: "string", description: "URL for link nodes" },
            label: { type: "string", description: "Label for group nodes" },
            color: { type: "string", description: "Color: hex (#RRGGBB) or preset number (1=red, 2=orange, 3=yellow, 4=green, 5=cyan, 6=purple)" }
          },
          required: ["path", "type", "x", "y"]
        }
      },
      {
        name: "update_canvas_node",
        description: "Update properties of an existing canvas node.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the canvas file"
            },
            nodeId: {
              type: "string",
              description: "ID of the node to update"
            },
            updates: {
              type: "object",
              description: "Properties to update (x, y, width, height, text, color, etc.)"
            }
          },
          required: ["path", "nodeId", "updates"]
        }
      },
      {
        name: "remove_canvas_node",
        description: "Remove a node from the canvas. Also removes all edges connected to this node.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the canvas file"
            },
            nodeId: {
              type: "string",
              description: "ID of the node to remove"
            }
          },
          required: ["path", "nodeId"]
        }
      },
      {
        name: "add_canvas_edge",
        description: "Add an edge (connection) between two nodes in a canvas.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the canvas file"
            },
            fromNode: {
              type: "string",
              description: "ID of the source node"
            },
            toNode: {
              type: "string",
              description: "ID of the target node"
            },
            fromSide: {
              type: "string",
              enum: ["top", "right", "bottom", "left"],
              description: "Side of source node where edge starts"
            },
            toSide: {
              type: "string",
              enum: ["top", "right", "bottom", "left"],
              description: "Side of target node where edge ends"
            },
            fromEnd: {
              type: "string",
              enum: ["none", "arrow"],
              description: "Shape at start of edge (default: none)"
            },
            toEnd: {
              type: "string",
              enum: ["none", "arrow"],
              description: "Shape at end of edge (default: none)"
            },
            color: {
              type: "string",
              description: "Edge color: hex or preset (1-6)"
            },
            label: {
              type: "string",
              description: "Text label for the edge"
            }
          },
          required: ["path", "fromNode", "toNode"]
        }
      },
      {
        name: "remove_canvas_edge",
        description: "Remove an edge (connection) from a canvas.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the canvas file"
            },
            edgeId: {
              type: "string",
              description: "ID of the edge to remove"
            }
          },
          required: ["path", "edgeId"]
        }
      }
    ]
  };
});

// Helper function to trim path arguments
function trimPaths(args: any): any {
  const trimmed = { ...args };

  // Trim single path properties
  if (trimmed.path && typeof trimmed.path === 'string') {
    trimmed.path = trimmed.path.trim();
  }
  if (trimmed.oldPath && typeof trimmed.oldPath === 'string') {
    trimmed.oldPath = trimmed.oldPath.trim();
  }
  if (trimmed.newPath && typeof trimmed.newPath === 'string') {
    trimmed.newPath = trimmed.newPath.trim();
  }
  if (trimmed.confirmPath && typeof trimmed.confirmPath === 'string') {
    trimmed.confirmPath = trimmed.confirmPath.trim();
  }

  // Trim path arrays
  if (trimmed.paths && Array.isArray(trimmed.paths)) {
    trimmed.paths = trimmed.paths.map((p: any) =>
      typeof p === 'string' ? p.trim() : p
    );
  }

  return trimmed;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const trimmedArgs = trimPaths(args);

  try {
    switch (name) {
      case "read_note": {
        const note = await fileSystem.readNote(trimmedArgs.path);
        const indent = trimmedArgs.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                fm: note.frontmatter,
                content: note.content
              }, null, indent)
            }
          ]
        };
      }

      case "write_note": {
        await fileSystem.writeNote({
          path: trimmedArgs.path,
          content: trimmedArgs.content,
          frontmatter: trimmedArgs.frontmatter,
          mode: trimmedArgs.mode || 'overwrite'
        });
        return {
          content: [
            {
              type: "text",
              text: `Successfully wrote note: ${trimmedArgs.path} (mode: ${trimmedArgs.mode || 'overwrite'})`
            }
          ]
        };
      }

      case "patch_note": {
        const result = await fileSystem.patchNote({
          path: trimmedArgs.path,
          oldString: trimmedArgs.oldString,
          newString: trimmedArgs.newString,
          replaceAll: trimmedArgs.replaceAll
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !result.success
        };
      }

      case "list_directory": {
        const listing = await fileSystem.listDirectory(trimmedArgs.path || '');
        const indent = trimmedArgs.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                dirs: listing.directories,
                files: listing.files
              }, null, indent)
            }
          ]
        };
      }

      case "delete_note": {
        const result = await fileSystem.deleteNote({
          path: trimmedArgs.path,
          confirmPath: trimmedArgs.confirmPath
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !result.success
        };
      }

      case "search_notes": {
        const results = await searchService.search({
          query: trimmedArgs.query,
          limit: trimmedArgs.limit,
          searchContent: trimmedArgs.searchContent,
          searchFrontmatter: trimmedArgs.searchFrontmatter,
          caseSensitive: trimmedArgs.caseSensitive,
          searchMode: trimmedArgs.searchMode
        });
        const indent = trimmedArgs.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, indent)
            }
          ]
        };
      }

      case "move_note": {
        const result = await fileSystem.moveNote({
          oldPath: trimmedArgs.oldPath,
          newPath: trimmedArgs.newPath,
          overwrite: trimmedArgs.overwrite
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !result.success
        };
      }

      case "read_multiple_notes": {
        const result = await fileSystem.readMultipleNotes({
          paths: trimmedArgs.paths,
          includeContent: trimmedArgs.includeContent,
          includeFrontmatter: trimmedArgs.includeFrontmatter
        });
        const indent = trimmedArgs.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: result.successful,
                err: result.failed
              }, null, indent)
            }
          ]
        };
      }

      case "update_frontmatter": {
        await fileSystem.updateFrontmatter({
          path: trimmedArgs.path,
          frontmatter: trimmedArgs.frontmatter,
          merge: trimmedArgs.merge
        });
        return {
          content: [
            {
              type: "text",
              text: `Successfully updated frontmatter for: ${trimmedArgs.path}`
            }
          ]
        };
      }

      case "get_notes_info": {
        const result = await fileSystem.getNotesInfo(trimmedArgs.paths);
        const indent = trimmedArgs.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, indent)
            }
          ]
        };
      }

      case "get_frontmatter": {
        const note = await fileSystem.readNote(trimmedArgs.path);
        const indent = trimmedArgs.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(note.frontmatter, null, indent)
            }
          ]
        };
      }

      case "manage_tags": {
        const result = await fileSystem.manageTags({
          path: trimmedArgs.path,
          operation: trimmedArgs.operation,
          tags: trimmedArgs.tags
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !result.success
        };
      }

      case "get_vault_stats": {
        const recentCount = Math.min(trimmedArgs.recentCount || 5, 20);
        const stats = await fileSystem.getVaultStats(recentCount);
        const indent = trimmedArgs.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                notes: stats.totalNotes,
                folders: stats.totalFolders,
                size: stats.totalSize,
                recent: stats.recentlyModified
              }, null, indent)
            }
          ]
        };
      }

      case "find_notes": {
        const result = await searchService.findNotes({
          query: trimmedArgs.query,
          limit: trimmedArgs.limit,
          searchContent: trimmedArgs.searchContent,
          searchFrontmatter: trimmedArgs.searchFrontmatter,
          caseSensitive: trimmedArgs.caseSensitive,
          searchMode: trimmedArgs.searchMode
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };
      }

      // Canvas tool handlers
      case "create_canvas": {
        const result = await canvasService.createCanvas({
          path: trimmedArgs.path,
          nodes: trimmedArgs.nodes,
          edges: trimmedArgs.edges
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !result.success
        };
      }

      case "read_canvas": {
        const canvas = await canvasService.readCanvas(trimmedArgs.path);
        const indent = trimmedArgs.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(canvas, null, indent)
            }
          ]
        };
      }

      case "add_canvas_node": {
        const result = await canvasService.addNode({
          path: trimmedArgs.path,
          type: trimmedArgs.type,
          x: trimmedArgs.x,
          y: trimmedArgs.y,
          width: trimmedArgs.width,
          height: trimmedArgs.height,
          text: trimmedArgs.text,
          file: trimmedArgs.file,
          subpath: trimmedArgs.subpath,
          url: trimmedArgs.url,
          label: trimmedArgs.label,
          color: trimmedArgs.color
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !result.success
        };
      }

      case "update_canvas_node": {
        const result = await canvasService.updateNode({
          path: trimmedArgs.path,
          nodeId: trimmedArgs.nodeId,
          updates: trimmedArgs.updates
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !result.success
        };
      }

      case "remove_canvas_node": {
        const result = await canvasService.removeNode({
          path: trimmedArgs.path,
          nodeId: trimmedArgs.nodeId
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !result.success
        };
      }

      case "add_canvas_edge": {
        const result = await canvasService.addEdge({
          path: trimmedArgs.path,
          fromNode: trimmedArgs.fromNode,
          toNode: trimmedArgs.toNode,
          fromSide: trimmedArgs.fromSide,
          toSide: trimmedArgs.toSide,
          fromEnd: trimmedArgs.fromEnd,
          toEnd: trimmedArgs.toEnd,
          color: trimmedArgs.color,
          label: trimmedArgs.label
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !result.success
        };
      }

      case "remove_canvas_edge": {
        const result = await canvasService.removeEdge({
          path: trimmedArgs.path,
          edgeId: trimmedArgs.edgeId
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !result.success
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      ],
      isError: true
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);