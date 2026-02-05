import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SearchService } from './search.js';
import { PathFilter } from './pathfilter.js';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SearchService', () => {
  let testVaultPath: string;
  let searchService: SearchService;
  let pathFilter: PathFilter;

  beforeEach(() => {
    // Create a temporary test vault
    testVaultPath = join(tmpdir(), `test-vault-${Date.now()}`);
    mkdirSync(testVaultPath, { recursive: true });

    pathFilter = new PathFilter();
    searchService = new SearchService(testVaultPath, pathFilter);
  });

  afterEach(() => {
    // Clean up test vault
    rmSync(testVaultPath, { recursive: true, force: true });
  });

  describe('searchMode: exact', () => {
    it('should find exact phrase match', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nThis note contains despertar idade in the same phrase.'
      );
      writeFileSync(
        join(testVaultPath, 'note2.md'),
        '# Test\n\nThis note has despertar in one place and idade in another.'
      );

      const results = await searchService.search({
        query: 'despertar idade',
        searchMode: 'exact'
      });

      expect(results.length).toBe(1);
      expect(results[0]!.p).toBe('note1.md');
    });

    it('should not find when words are separated', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nThe word despertar appears here. And idade appears here.'
      );

      const results = await searchService.search({
        query: 'despertar idade',
        searchMode: 'exact'
      });

      expect(results.length).toBe(0);
    });
  });

  describe('searchMode: all (AND logic)', () => {
    it('should find notes containing all words anywhere', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nThe word despertar appears here.\n\nAnd idade appears in another paragraph.'
      );
      writeFileSync(
        join(testVaultPath, 'note2.md'),
        '# Test\n\nOnly despertar appears in this note.'
      );
      writeFileSync(
        join(testVaultPath, 'note3.md'),
        '# Test\n\nOnly idade appears in this note.'
      );

      const results = await searchService.search({
        query: 'despertar idade',
        searchMode: 'all'
      });

      expect(results.length).toBe(1);
      expect(results[0]!.p).toBe('note1.md');
    });

    it('should be the default search mode', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nThe word despertar appears here.\n\nAnd idade appears later.'
      );

      // No searchMode specified, should default to 'all'
      const results = await searchService.search({
        query: 'despertar idade'
      });

      expect(results.length).toBe(1);
    });

    it('should work with three or more words', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Zeladores\n\nThis note mentions despertar and also discusses idade.'
      );
      writeFileSync(
        join(testVaultPath, 'note2.md'),
        '# Test\n\nOnly has Zeladores and despertar but not the third word.'
      );

      const results = await searchService.search({
        query: 'Zeladores despertar idade',
        searchMode: 'all'
      });

      expect(results.length).toBe(1);
      expect(results[0]!.p).toBe('note1.md');
    });
  });

  describe('searchMode: any (OR logic)', () => {
    it('should find notes containing any of the words', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nOnly despertar appears here.'
      );
      writeFileSync(
        join(testVaultPath, 'note2.md'),
        '# Test\n\nOnly idade appears here.'
      );
      writeFileSync(
        join(testVaultPath, 'note3.md'),
        '# Test\n\nNeither word appears here.'
      );

      const results = await searchService.search({
        query: 'despertar idade',
        searchMode: 'any',
        limit: 10
      });

      expect(results.length).toBe(2);
      const paths = results.map(r => r.p);
      expect(paths).toContain('note1.md');
      expect(paths).toContain('note2.md');
    });

    it('should count all matched words', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nThe word despertar despertar appears twice, and idade once.'
      );

      const results = await searchService.search({
        query: 'despertar idade',
        searchMode: 'any'
      });

      expect(results.length).toBe(1);
      expect(results[0]!.mc).toBe(3); // 2 + 1 matches
    });
  });

  describe('case sensitivity', () => {
    it('should be case insensitive by default', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nDESPERTAR and IDADE in uppercase.'
      );

      const results = await searchService.search({
        query: 'despertar idade',
        searchMode: 'all'
      });

      expect(results.length).toBe(1);
    });

    it('should respect case sensitivity when enabled', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nDESPERTAR and IDADE in uppercase.'
      );

      const results = await searchService.search({
        query: 'despertar idade',
        searchMode: 'all',
        caseSensitive: true
      });

      expect(results.length).toBe(0);
    });
  });

  describe('match count and excerpt', () => {
    it('should correctly count matches for multi-word search', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\ndespertar appears here. And despertar again. idade is here too.'
      );

      const results = await searchService.search({
        query: 'despertar idade',
        searchMode: 'all'
      });

      expect(results.length).toBe(1);
      expect(results[0]!.mc).toBe(3); // 2 "despertar" + 1 "idade"
    });

    it('should provide excerpt from first match', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nSome text before. The word despertar appears here. idade is later.'
      );

      const results = await searchService.search({
        query: 'despertar idade',
        searchMode: 'all'
      });

      expect(results.length).toBe(1);
      expect(results[0]!.ex).toContain('despertar');
    });
  });

  describe('findNotes (lightweight search)', () => {
    it('should return only paths without excerpts', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nThis contains keyword here.'
      );
      writeFileSync(
        join(testVaultPath, 'note2.md'),
        '# Test\n\nThis also has keyword.'
      );

      const result = await searchService.findNotes({
        query: 'keyword',
        limit: 10
      });

      expect(result.paths.length).toBe(2);
      expect(result.total).toBe(2);
      expect(result.paths).toContain('note1.md');
      expect(result.paths).toContain('note2.md');
    });

    it('should support multi-word search with all mode', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nHas despertar and idade both.'
      );
      writeFileSync(
        join(testVaultPath, 'note2.md'),
        '# Test\n\nOnly despertar here.'
      );

      const result = await searchService.findNotes({
        query: 'despertar idade',
        searchMode: 'all'
      });

      expect(result.paths.length).toBe(1);
      expect(result.paths[0]).toBe('note1.md');
    });

    it('should support multi-word search with any mode', async () => {
      writeFileSync(
        join(testVaultPath, 'note1.md'),
        '# Test\n\nHas despertar only.'
      );
      writeFileSync(
        join(testVaultPath, 'note2.md'),
        '# Test\n\nHas idade only.'
      );
      writeFileSync(
        join(testVaultPath, 'note3.md'),
        '# Test\n\nNo matches here.'
      );

      const result = await searchService.findNotes({
        query: 'despertar idade',
        searchMode: 'any',
        limit: 10
      });

      expect(result.paths.length).toBe(2);
      expect(result.paths).toContain('note1.md');
      expect(result.paths).toContain('note2.md');
    });

    it('should allow higher limit (up to 100)', async () => {
      // Create 30 files
      for (let i = 0; i < 30; i++) {
        writeFileSync(
          join(testVaultPath, `note${i}.md`),
          `# Note ${i}\n\nContains searchword.`
        );
      }

      const result = await searchService.findNotes({
        query: 'searchword',
        limit: 50
      });

      expect(result.paths.length).toBe(30);
      expect(result.total).toBe(30);
    });

    it('should respect max limit of 100', async () => {
      const result = await searchService.findNotes({
        query: 'test',
        limit: 200 // Should be capped at 100
      });

      // No files match, but limit should be capped internally
      expect(result.paths.length).toBe(0);
    });
  });
});
