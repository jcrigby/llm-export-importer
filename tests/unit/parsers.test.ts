/**
 * Unit tests for platform-specific parsers
 */

import { ChatGPTParser } from '../../src/parsers/chatgpt.js';
import { ClaudeParser } from '../../src/parsers/claude.js';
import { detectPlatform, parseExport } from '../../src/parsers/index.js';

describe('Parser Tests', () => {
  describe('ChatGPT Parser', () => {
    const parser = new ChatGPTParser();

    test('should validate ChatGPT export format', () => {
      const validData = {
        mapping: {
          'uuid1': {
            id: 'uuid1',
            message: {
              id: 'msg1',
              author: { role: 'user' },
              content: { parts: ['Hello'] },
              create_time: 1640995200
            },
            children: []
          }
        },
        title: 'Test Conversation',
        create_time: 1640995200
      };

      const result = parser.validate(validData);
      expect(result.isValid).toBe(true);
      expect(result.platform).toBe('chatgpt');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should reject invalid format', () => {
      const invalidData = { invalid: 'data' };
      const result = parser.validate(invalidData);
      expect(result.isValid).toBe(false);
    });

    test('should parse valid ChatGPT export', () => {
      const validData = {
        mapping: {
          'uuid1': {
            id: 'uuid1',
            message: {
              id: 'msg1',
              author: { role: 'user' },
              content: { parts: ['Hello there'] },
              create_time: 1640995200
            },
            children: []
          }
        },
        title: 'Test Conversation',
        create_time: 1640995200
      };

      const result = parser.parse(validData);
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].platform).toBe('chatgpt');
      expect(result.conversations[0].messages).toHaveLength(1);
      expect(result.metadata.platform).toBe('chatgpt');
    });
  });

  describe('Claude Parser', () => {
    const parser = new ClaudeParser();

    test('should validate Claude export format', () => {
      const validData = {
        conversations: [{
          id: 'conv1',
          name: 'Test Conversation',
          created_at: '2024-01-01T00:00:00Z',
          messages: [{
            role: 'human' as const,
            content: 'Hello',
            timestamp: '2024-01-01T00:00:00Z'
          }]
        }]
      };

      const result = parser.validate(validData);
      expect(result.isValid).toBe(true);
      expect(result.platform).toBe('claude');
    });

    test('should parse valid Claude export', () => {
      const validData = {
        conversations: [{
          id: 'conv1',
          name: 'Test Conversation',
          created_at: '2024-01-01T00:00:00Z',
          messages: [{
            role: 'human' as const,
            content: 'Hello there',
            timestamp: '2024-01-01T00:00:00Z'
          }]
        }]
      };

      const result = parser.parse(validData);
      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].platform).toBe('claude');
      expect(result.conversations[0].messages).toHaveLength(1);
    });
  });

  describe('Platform Detection', () => {
    test('should detect ChatGPT format', () => {
      const chatgptData = {
        mapping: { 'uuid1': { id: 'uuid1', children: [] } },
        title: 'Test'
      };

      const result = detectPlatform(chatgptData);
      expect(result.platform).toBe('chatgpt');
    });

    test('should detect Claude format', () => {
      const claudeData = {
        conversations: [{
          id: 'conv1',
          name: 'Test',
          created_at: '2024-01-01T00:00:00Z',
          messages: []
        }]
      };

      const result = detectPlatform(claudeData);
      expect(result.platform).toBe('claude');
    });

    test('should detect unknown format', () => {
      const unknownData = { unknown: 'format' };
      const result = detectPlatform(unknownData);
      expect(result.platform).toBe('unknown');
      expect(result.isValid).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    test('should parse export using auto-detection', () => {
      const claudeData = {
        conversations: [{
          id: 'conv1',
          name: 'Test Conversation',
          created_at: '2024-01-01T00:00:00Z',
          messages: [{
            role: 'human' as const,
            content: 'Hello world',
            timestamp: '2024-01-01T00:00:00Z'
          }]
        }]
      };

      // Mock console.log to avoid output during tests
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = parseExport(claudeData);
      expect(result.conversations).toHaveLength(1);
      expect(result.metadata.platform).toBe('claude');

      consoleSpy.mockRestore();
    });
  });
});