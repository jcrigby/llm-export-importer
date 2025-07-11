/**
 * Unit tests for file operations utility
 */

import { FileHandler } from '../../src/utils/file-handler.js';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('FileHandler Tests', () => {
  const testDir = './test-files';

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  test('should create directory if it does not exist', async () => {
    await FileHandler.ensureDirectory(testDir);
    
    const stats = await fs.stat(testDir);
    expect(stats.isDirectory()).toBe(true);
  });

  test('should write file with directory creation', async () => {
    const filePath = join(testDir, 'subdir', 'test.txt');
    const content = 'Hello, World!';

    await FileHandler.writeFile(filePath, content);

    const readContent = await fs.readFile(filePath, 'utf-8');
    expect(readContent).toBe(content);
  });

  test('should sanitize filenames correctly', () => {
    const tests = [
      { input: 'Hello World', expected: 'hello-world' },
      { input: 'File<>Name|Special?Chars*', expected: 'filenamespecialchars' },
      { input: 'Multiple   Spaces', expected: 'multiple-spaces' },
      { input: 'Already-Clean-Name', expected: 'already-clean-name' }
    ];

    tests.forEach(test => {
      const result = FileHandler.sanitizeFilename(test.input);
      expect(result).toBe(test.expected);
    });
  });

  test('should create unique filename when file exists', async () => {
    await FileHandler.ensureDirectory(testDir);
    
    // Create initial file
    const basePath = join(testDir, 'test');
    const extension = '.txt';
    await fs.writeFile(basePath + extension, 'content');

    // Get unique filename
    const uniqueName = await FileHandler.getUniqueFilename(basePath, extension);
    
    expect(uniqueName).toBe(join(testDir, 'test-1.txt'));
  });

  test('should create project structure correctly', async () => {
    const projectPath = await FileHandler.createProjectStructure(testDir, 'My Test Project');

    // Check main directory
    const stats = await fs.stat(projectPath);
    expect(stats.isDirectory()).toBe(true);

    // Check subdirectories
    const subdirs = ['conversations', 'extracted', 'metadata'];
    for (const subdir of subdirs) {
      const subdirStats = await fs.stat(join(projectPath, subdir));
      expect(subdirStats.isDirectory()).toBe(true);
    }
  });

  test('should write and read JSON files correctly', async () => {
    const testData = {
      name: 'Test Project',
      conversations: 5,
      metadata: {
        created: '2024-01-01',
        platform: 'claude'
      }
    };

    const filePath = join(testDir, 'test.json');
    
    await FileHandler.writeJsonFile(filePath, testData);
    
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    
    expect(parsed).toEqual(testData);
  });

  test('should analyze directory correctly', async () => {
    // Test non-existent directory
    let analysis = await FileHandler.analyzeDirectory(join(testDir, 'nonexistent'));
    expect(analysis.exists).toBe(false);

    // Create directory with files
    await FileHandler.ensureDirectory(testDir);
    await fs.writeFile(join(testDir, 'test1.txt'), 'content1');
    await fs.writeFile(join(testDir, 'test2.txt'), 'content2');

    analysis = await FileHandler.analyzeDirectory(testDir);
    expect(analysis.exists).toBe(true);
    expect(analysis.writable).toBe(true);
    expect(analysis.files).toHaveLength(2);
    expect(analysis.files).toContain('test1.txt');
    expect(analysis.files).toContain('test2.txt');
  });

  test('should validate output paths for safety', () => {
    const safePaths = ['./output', '/home/user/projects', './relative/path'];
    const unsafePaths = ['/bin/test', '/etc/config', '/usr/local/bin'];

    safePaths.forEach(path => {
      expect(() => FileHandler.validateOutputPath(path)).not.toThrow();
    });

    unsafePaths.forEach(path => {
      expect(() => FileHandler.validateOutputPath(path)).toThrow();
    });
  });

  test('should handle file write options correctly', async () => {
    const filePath = join(testDir, 'test.txt');
    const content1 = 'First content';
    const content2 = 'Second content';

    // Write initial file
    await FileHandler.writeFile(filePath, content1);

    // Try to overwrite without permission (should fail)
    await expect(
      FileHandler.writeFile(filePath, content2, { overwrite: false })
    ).rejects.toThrow();

    // Overwrite with permission
    await FileHandler.writeFile(filePath, content2, { overwrite: true });
    
    const readContent = await fs.readFile(filePath, 'utf-8');
    expect(readContent).toBe(content2);
  });

  test('should create backup when requested', async () => {
    const filePath = join(testDir, 'test.txt');
    const originalContent = 'Original content';
    const newContent = 'New content';

    await FileHandler.writeFile(filePath, originalContent);

    // Overwrite with backup
    await FileHandler.writeFile(filePath, newContent, { 
      overwrite: true, 
      backupExisting: true 
    });

    // Check new content
    const readContent = await fs.readFile(filePath, 'utf-8');
    expect(readContent).toBe(newContent);

    // Check backup exists
    const files = await fs.readdir(testDir);
    const backupFiles = files.filter(f => f.startsWith('test.backup-'));
    expect(backupFiles.length).toBe(1);
  });
});