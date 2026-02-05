import { join } from 'path';
import { readFile, readdir } from 'node:fs/promises';
import type { PathFilter } from './pathfilter.js';
import type { SearchParams, SearchResult, FindNotesParams, FindNotesResult } from './types.js';
import { generateObsidianUri } from './uri.js';

export class SearchService {
  constructor(
    private vaultPath: string,
    private pathFilter: PathFilter
  ) {}

  async search(params: SearchParams): Promise<SearchResult[]> {
    const {
      query,
      limit = 20,
      searchContent = true,
      searchFrontmatter = false,
      caseSensitive = false,
      searchMode = 'all'  // Default to 'all' for better multi-word search
    } = params;

    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    const results: SearchResult[] = [];
    const maxLimit = Math.min(limit, 100);

    // Parse query into words for multi-word search modes
    const queryWords = this.parseQueryWords(query, caseSensitive);

    // Recursively find all .md files
    const markdownFiles = await this.findMarkdownFiles(this.vaultPath);

    for (const fullPath of markdownFiles) {
      // Convert absolute path back to relative path
      const relativePath = fullPath.substring(this.vaultPath.length + 1).replace(/\\/g, '/');

      if (!this.pathFilter.isAllowed(relativePath)) continue;
      if (results.length >= maxLimit) break;

      try {
        const content = await readFile(fullPath, 'utf-8');
        let searchableText = '';

        // Prepare search text based on options
        if (searchContent && searchFrontmatter) {
          searchableText = content;
        } else if (searchContent) {
          // Remove frontmatter from search
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
          searchableText = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;
        } else if (searchFrontmatter) {
          // Search only frontmatter
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
          searchableText = frontmatterMatch ? frontmatterMatch[1] || '' : '';
        }

        const searchIn = caseSensitive ? searchableText : searchableText.toLowerCase();

        const matchResult = this.findMatches(searchIn, searchableText, queryWords, searchMode, caseSensitive ? query : query.toLowerCase());

        if (matchResult.matches) {
          // Extract title from filename
          const title = relativePath.split('/').pop()?.replace(/\.md$/, '') || relativePath;

          results.push({
            p: relativePath,
            t: title,
            ex: matchResult.excerpt,
            mc: matchResult.matchCount,
            ln: matchResult.lineNumber,
            uri: generateObsidianUri(this.vaultPath, relativePath)
          });
        }
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    return results;
  }

  /**
   * Find notes containing query - returns only file paths (lightweight)
   * Allows higher limit since results are smaller
   */
  async findNotes(params: FindNotesParams): Promise<FindNotesResult> {
    const {
      query,
      limit = 20,
      searchContent = true,
      searchFrontmatter = false,
      caseSensitive = false,
      searchMode = 'all'
    } = params;

    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    const paths: string[] = [];
    const maxLimit = Math.min(limit, 100); // Allow up to 100 results for lightweight search

    const queryWords = this.parseQueryWords(query, caseSensitive);
    const markdownFiles = await this.findMarkdownFiles(this.vaultPath);

    for (const fullPath of markdownFiles) {
      const relativePath = fullPath.substring(this.vaultPath.length + 1).replace(/\\/g, '/');

      if (!this.pathFilter.isAllowed(relativePath)) continue;
      if (paths.length >= maxLimit) break;

      try {
        const content = await readFile(fullPath, 'utf-8');
        let searchableText = '';

        if (searchContent && searchFrontmatter) {
          searchableText = content;
        } else if (searchContent) {
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
          searchableText = frontmatterMatch ? content.slice(frontmatterMatch[0].length) : content;
        } else if (searchFrontmatter) {
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
          searchableText = frontmatterMatch ? frontmatterMatch[1] || '' : '';
        }

        const searchIn = caseSensitive ? searchableText : searchableText.toLowerCase();
        const matches = this.checkMatches(searchIn, queryWords, searchMode, caseSensitive ? query : query.toLowerCase());

        if (matches) {
          paths.push(relativePath);
        }
      } catch (error) {
        continue;
      }
    }

    return { paths, total: paths.length };
  }

  /**
   * Simple match check without extracting excerpt (for findNotes)
   */
  private checkMatches(
    searchIn: string,
    queryWords: string[],
    searchMode: 'exact' | 'all' | 'any',
    exactQuery: string
  ): boolean {
    if (searchMode === 'exact') {
      return searchIn.indexOf(exactQuery) !== -1;
    }

    let matchedWords = 0;
    for (const word of queryWords) {
      if (searchIn.indexOf(word) !== -1) {
        matchedWords++;
      }
    }

    if (searchMode === 'all') {
      return matchedWords === queryWords.length;
    } else {
      return matchedWords > 0;
    }
  }

  /**
   * Parse query string into individual words for multi-word search
   */
  private parseQueryWords(query: string, caseSensitive: boolean): string[] {
    const normalizedQuery = caseSensitive ? query : query.toLowerCase();
    // Split by whitespace and filter out empty strings
    return normalizedQuery.split(/\s+/).filter(word => word.length > 0);
  }

  /**
   * Find matches based on search mode
   */
  private findMatches(
    searchIn: string,
    originalText: string,
    queryWords: string[],
    searchMode: 'exact' | 'all' | 'any',
    exactQuery: string
  ): { matches: boolean; excerpt: string; matchCount: number; lineNumber: number } {
    if (searchMode === 'exact') {
      // Original exact phrase matching
      const index = searchIn.indexOf(exactQuery);
      if (index === -1) {
        return { matches: false, excerpt: '', matchCount: 0, lineNumber: 0 };
      }

      const excerptStart = Math.max(0, index - 21);
      const excerptEnd = Math.min(originalText.length, index + exactQuery.length + 21);
      let excerpt = originalText.slice(excerptStart, excerptEnd).trim();

      if (excerptStart > 0) excerpt = '...' + excerpt;
      if (excerptEnd < originalText.length) excerpt = excerpt + '...';

      // Count total matches
      let matchCount = 0;
      let searchIndex = 0;
      while ((searchIndex = searchIn.indexOf(exactQuery, searchIndex)) !== -1) {
        matchCount++;
        searchIndex += exactQuery.length;
      }

      const lines = originalText.slice(0, index).split('\n');
      return { matches: true, excerpt, matchCount, lineNumber: lines.length };
    }

    // Multi-word search (all or any mode)
    const wordMatches: Array<{ word: string; index: number; count: number }> = [];

    for (const word of queryWords) {
      const index = searchIn.indexOf(word);
      if (index !== -1) {
        // Count occurrences of this word
        let count = 0;
        let searchIndex = 0;
        while ((searchIndex = searchIn.indexOf(word, searchIndex)) !== -1) {
          count++;
          searchIndex += word.length;
        }
        wordMatches.push({ word, index, count });
      }
    }

    // Check if matches satisfy the search mode
    const matchedWords = wordMatches.length;
    const totalWords = queryWords.length;

    let matches = false;
    if (searchMode === 'all') {
      matches = matchedWords === totalWords; // All words must be present
    } else if (searchMode === 'any') {
      matches = matchedWords > 0; // At least one word must be present
    }

    if (!matches) {
      return { matches: false, excerpt: '', matchCount: 0, lineNumber: 0 };
    }

    // Use the first matched word for excerpt and line number
    const firstMatch = wordMatches.reduce((prev, curr) =>
      prev.index < curr.index ? prev : curr
    );

    const excerptStart = Math.max(0, firstMatch.index - 21);
    const excerptEnd = Math.min(originalText.length, firstMatch.index + firstMatch.word.length + 21);
    let excerpt = originalText.slice(excerptStart, excerptEnd).trim();

    if (excerptStart > 0) excerpt = '...' + excerpt;
    if (excerptEnd < originalText.length) excerpt = excerpt + '...';

    // Total match count is sum of all word matches
    const totalMatchCount = wordMatches.reduce((sum, wm) => sum + wm.count, 0);

    const lines = originalText.slice(0, firstMatch.index).split('\n');

    return { matches: true, excerpt, matchCount: totalMatchCount, lineNumber: lines.length };
  }

  private async findMarkdownFiles(dirPath: string): Promise<string[]> {
    const markdownFiles: string[] = [];

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively search subdirectories
          const subFiles = await this.findMarkdownFiles(fullPath);
          markdownFiles.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          markdownFiles.push(fullPath);
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }

    return markdownFiles;
  }
}