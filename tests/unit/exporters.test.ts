/**
 * Unit tests for content exporters
 */

import { MarkdownExporter } from '../../src/exporters/markdown.js';
import { ConversationData, ClassificationResult } from '../../src/classification/pipeline.js';
import { promises as fs } from 'fs';
import { join } from 'path';

// Test data
const mockConversations: ConversationData[] = [
  {
    id: 'conv1',
    title: 'Novel Character Development',
    platform: 'claude',
    messages: [
      {
        role: 'human',
        content: 'I need help developing my main character for a fantasy novel.',
        timestamp: '2024-01-01T10:00:00Z'
      },
      {
        role: 'assistant',
        content: 'I\'d be happy to help with character development. What kind of character are you working on?',
        timestamp: '2024-01-01T10:01:00Z'
      }
    ]
  },
  {
    id: 'conv2',
    title: 'Screenplay Dialogue Help',
    platform: 'chatgpt',
    messages: [
      {
        role: 'user',
        content: 'Can you help me write more natural dialogue for my screenplay?',
        timestamp: '2024-01-02T14:00:00Z'
      },
      {
        role: 'assistant',
        content: 'Absolutely! Natural dialogue is key to good screenwriting. What scene are you working on?',
        timestamp: '2024-01-02T14:01:00Z'
      }
    ]
  }
];

const mockClassifications: ClassificationResult[] = [
  {
    id: 'conv1',
    isWriting: true,
    confidence: 0.95,
    category: 'fiction',
    quality: 'substantial',
    reasoning: 'Character development for novel'
  },
  {
    id: 'conv2',
    isWriting: true,
    confidence: 0.90,
    category: 'screenplay',
    quality: 'draft',
    reasoning: 'Screenplay dialogue assistance'
  }
];

describe('Markdown Exporter Tests', () => {
  const testOutputDir = './test-exports';

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  test('should export conversations to markdown with project organization', async () => {
    const options = {
      outputDir: testOutputDir,
      organizeByProject: true,
      includeMetadata: true,
      createIndex: true
    };

    const summary = await MarkdownExporter.export(mockConversations, mockClassifications, options);

    // Check summary
    expect(summary.totalConversations).toBe(2);
    expect(summary.writingConversations).toBe(2);
    expect(summary.projects.length).toBeGreaterThan(0);

    // Check that index file was created
    const indexExists = await fs.access(join(testOutputDir, 'INDEX.md')).then(() => true).catch(() => false);
    expect(indexExists).toBe(true);

    // Check that project directories were created
    const projects = summary.projects;
    for (const project of projects) {
      const projectExists = await fs.access(project.path).then(() => true).catch(() => false);
      expect(projectExists).toBe(true);
    }
  });

  test('should export conversations with category organization', async () => {
    const options = {
      outputDir: testOutputDir,
      organizeByCategory: true,
      includeMetadata: true
    };

    const summary = await MarkdownExporter.export(mockConversations, mockClassifications, options);

    expect(summary.projects.length).toBe(2); // One for each category
    expect(summary.categoryCounts.fiction).toBe(1);
    expect(summary.categoryCounts.screenplay).toBe(1);
  });

  test('should export conversations in flat structure', async () => {
    const options = {
      outputDir: testOutputDir,
      organizeByProject: false,
      organizeByCategory: false,
      includeMetadata: false
    };

    const summary = await MarkdownExporter.export(mockConversations, mockClassifications, options);

    expect(summary.projects.length).toBe(1); // All in one project
    expect(summary.projects[0].name).toBe('All Writing Conversations');
  });

  test('should include timestamps when requested', async () => {
    const options = {
      outputDir: testOutputDir,
      includeTimestamps: true,
      organizeByProject: false
    };

    await MarkdownExporter.export(mockConversations, mockClassifications, options);

    // Read one of the generated files and check for timestamp
    const files = await fs.readdir(testOutputDir);
    const markdownFiles = files.filter(f => f.endsWith('.md'));
    expect(markdownFiles.length).toBeGreaterThan(0);

    const content = await fs.readFile(join(testOutputDir, markdownFiles[0]), 'utf-8');
    expect(content).toContain('*('); // Timestamp format indicator
  });

  test('should create summary file when includeMetadata is true', async () => {
    const options = {
      outputDir: testOutputDir,
      includeMetadata: true
    };

    await MarkdownExporter.export(mockConversations, mockClassifications, options);

    const summaryExists = await fs.access(join(testOutputDir, 'export-summary.json')).then(() => true).catch(() => false);
    expect(summaryExists).toBe(true);

    const summaryContent = await fs.readFile(join(testOutputDir, 'export-summary.json'), 'utf-8');
    const summary = JSON.parse(summaryContent);
    expect(summary.totalConversations).toBe(2);
    expect(summary.writingConversations).toBe(2);
  });

  test('should handle empty conversation list', async () => {
    const options = {
      outputDir: testOutputDir
    };

    const summary = await MarkdownExporter.export([], [], options);

    expect(summary.totalConversations).toBe(0);
    expect(summary.writingConversations).toBe(0);
    expect(summary.projects.length).toBe(0);
  });

  test('should filter non-writing conversations', async () => {
    const mixedClassifications = [
      ...mockClassifications,
      {
        id: 'conv3',
        isWriting: false,
        confidence: 0.95,
        category: 'casual' as const,
        quality: 'fragment' as const,
        reasoning: 'Not writing related'
      }
    ];

    const mixedConversations = [
      ...mockConversations,
      {
        id: 'conv3',
        title: 'Math Help',
        platform: 'chatgpt' as const,
        messages: [
          {
            role: 'user' as const,
            content: 'What is 2+2?',
            timestamp: '2024-01-03T10:00:00Z'
          }
        ]
      }
    ];

    const options = {
      outputDir: testOutputDir
    };

    const summary = await MarkdownExporter.export(mixedConversations, mixedClassifications, options);

    expect(summary.totalConversations).toBe(3);
    expect(summary.writingConversations).toBe(2); // Only writing conversations exported
  });
});