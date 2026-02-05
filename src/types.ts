export interface ParsedNote {
  frontmatter: Record<string, any>;
  content: string;
  originalContent: string;
}

export interface NoteWriteParams {
  path: string;
  content: string;
  frontmatter?: Record<string, any>;
  mode?: 'overwrite' | 'append' | 'prepend';
}

export interface PatchNoteParams {
  path: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export interface PatchNoteResult {
  success: boolean;
  path: string;
  message: string;
  matchCount?: number;
}

export interface DeleteNoteParams {
  path: string;
  confirmPath: string;
}

export interface DeleteResult {
  success: boolean;
  path: string;
  message: string;
}

export interface DirectoryListing {
  files: string[];
  directories: string[];
}

export interface FrontmatterValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PathFilterConfig {
  ignoredPatterns: string[];
  allowedExtensions: string[];
}

// Search types
export interface SearchParams {
  query: string;
  limit?: number;
  searchContent?: boolean;
  searchFrontmatter?: boolean;
  caseSensitive?: boolean;
  /**
   * Search mode for multi-word queries:
   * - "exact": Match the exact phrase (original behavior)
   * - "all": All words must be present (AND logic) - DEFAULT
   * - "any": Any word can match (OR logic)
   */
  searchMode?: 'exact' | 'all' | 'any';
}

// Find notes params (lightweight search returning only paths)
export interface FindNotesParams {
  query: string;
  limit?: number;
  searchContent?: boolean;
  searchFrontmatter?: boolean;
  caseSensitive?: boolean;
  searchMode?: 'exact' | 'all' | 'any';
}

// Find notes result (lightweight)
export interface FindNotesResult {
  paths: string[];
  total: number;
}

export interface SearchResult {
  p: string;        // path
  t: string;        // title
  ex: string;       // excerpt
  mc: number;       // matchCount
  ln?: number;      // lineNumber
  uri?: string;     // obsidianUri
}

// Move types
export interface MoveNoteParams {
  oldPath: string;
  newPath: string;
  overwrite?: boolean;
}

export interface MoveResult {
  success: boolean;
  oldPath: string;
  newPath: string;
  message: string;
}

// Batch read types
export interface BatchReadParams {
  paths: string[];
  includeContent?: boolean;
  includeFrontmatter?: boolean;
}

export interface BatchReadResult {
  successful: Array<{
    path: string;
    frontmatter?: Record<string, any>;
    content?: string;
    obsidianUri?: string;
  }>;
  failed: Array<{
    path: string;
    error: string;
  }>;
}

// Update frontmatter types
export interface UpdateFrontmatterParams {
  path: string;
  frontmatter: Record<string, any>;
  merge?: boolean;
}

// Note info types
export interface NoteInfo {
  path: string;
  size: number;
  modified: number; // timestamp
  hasFrontmatter: boolean;
  obsidianUri?: string;
}

// Tag management types
export interface TagManagementParams {
  path: string;
  operation: 'add' | 'remove' | 'list';
  tags?: string[];
}

export interface TagManagementResult {
  path: string;
  operation: string;
  tags: string[];
  success: boolean;
  message?: string;
}

// Vault statistics types
export interface VaultStats {
  totalNotes: number;
  totalFolders: number;
  totalSize: number;  // bytes
  recentlyModified: Array<{
    path: string;
    modified: number;  // timestamp
  }>;
}

// ============================================
// Canvas Types (JSON Canvas spec 1.0)
// ============================================

export type CanvasNodeSide = 'top' | 'right' | 'bottom' | 'left';
export type CanvasEndpoint = 'none' | 'arrow';
export type CanvasNodeType = 'text' | 'file' | 'link' | 'group';
export type CanvasBackgroundStyle = 'cover' | 'ratio' | 'repeat';

// Canvas color can be hex (#RRGGBB) or preset number (1-6)
export type CanvasColor = string;

export interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: CanvasColor;
  // Type-specific properties
  text?: string;           // for type: 'text'
  file?: string;           // for type: 'file'
  subpath?: string;        // for type: 'file' (heading/block reference)
  url?: string;            // for type: 'link'
  label?: string;          // for type: 'group'
  background?: string;     // for type: 'group' (image path)
  backgroundStyle?: CanvasBackgroundStyle;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: CanvasNodeSide;
  toSide?: CanvasNodeSide;
  fromEnd?: CanvasEndpoint;
  toEnd?: CanvasEndpoint;
  color?: CanvasColor;
  label?: string;
}

export interface CanvasData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// Canvas operation params
export interface CreateCanvasParams {
  path: string;
  nodes?: Omit<CanvasNode, 'id'>[];
  edges?: Omit<CanvasEdge, 'id'>[];
}

export interface AddCanvasNodeParams {
  path: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color?: CanvasColor;
  // Type-specific
  text?: string;
  file?: string;
  subpath?: string;
  url?: string;
  label?: string;
  background?: string;
  backgroundStyle?: CanvasBackgroundStyle;
}

export interface UpdateCanvasNodeParams {
  path: string;
  nodeId: string;
  updates: Partial<Omit<CanvasNode, 'id'>>;
}

export interface RemoveCanvasNodeParams {
  path: string;
  nodeId: string;
}

export interface AddCanvasEdgeParams {
  path: string;
  fromNode: string;
  toNode: string;
  fromSide?: CanvasNodeSide;
  toSide?: CanvasNodeSide;
  fromEnd?: CanvasEndpoint;
  toEnd?: CanvasEndpoint;
  color?: CanvasColor;
  label?: string;
}

export interface RemoveCanvasEdgeParams {
  path: string;
  edgeId: string;
}

// Canvas operation results
export interface CanvasResult {
  success: boolean;
  path: string;
  message: string;
  canvas?: CanvasData;
  nodeId?: string;
  edgeId?: string;
}