/**
 * Base Parser Interface for LLM Export Importer
 * 
 * Defines the contract for all platform-specific export parsers.
 * Each parser handles the unique export format of a specific AI platform.
 */

import { ConversationData } from '../classification/pipeline.js';

export interface ParseResult {
  conversations: ConversationData[];
  metadata: {
    totalConversations: number;
    dateRange: {
      earliest: string;
      latest: string;
    };
    platform: string;
    exportVersion?: string;
  };
}

export interface ParserValidationResult {
  isValid: boolean;
  platform: 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'unknown';
  confidence: number;
  issues: string[];
}

/**
 * Abstract base class for all export parsers
 */
export abstract class BaseParser {
  abstract readonly platform: 'chatgpt' | 'claude' | 'gemini' | 'perplexity';
  abstract readonly supportedVersions: string[];

  /**
   * Validates if the provided data matches this parser's expected format
   */
  abstract validate(data: any): ParserValidationResult;

  /**
   * Parses the export data into normalized conversation format
   */
  abstract parse(data: any): ParseResult;

  /**
   * Auto-detects the platform from export data structure
   */
  static detectPlatform(data: any): ParserValidationResult {
    // This will be implemented by checking known format signatures
    if (data.mapping && typeof data.mapping === 'object') {
      return {
        isValid: true,
        platform: 'chatgpt',
        confidence: 0.9,
        issues: []
      };
    }
    
    if (data.conversations && Array.isArray(data.conversations)) {
      return {
        isValid: true,
        platform: 'claude',
        confidence: 0.9,
        issues: []
      };
    }
    
    if (data.chats && Array.isArray(data.chats)) {
      return {
        isValid: true,
        platform: 'gemini',
        confidence: 0.9,
        issues: []
      };
    }
    
    if (data.threads && Array.isArray(data.threads)) {
      return {
        isValid: true,
        platform: 'perplexity',
        confidence: 0.9,
        issues: []
      };
    }

    return {
      isValid: false,
      platform: 'unknown',
      confidence: 0,
      issues: ['Unknown export format - no recognizable structure found']
    };
  }

  /**
   * Utility to extract timestamp from various formats
   */
  protected normalizeTimestamp(timestamp: string | number): string {
    if (typeof timestamp === 'number') {
      return new Date(timestamp * 1000).toISOString();
    }
    
    try {
      return new Date(timestamp).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Utility to clean and normalize message content
   */
  protected cleanContent(content: string | string[]): string {
    if (Array.isArray(content)) {
      return content.join('\n').trim();
    }
    
    return content?.trim() || '';
  }

  /**
   * Utility to generate conversation ID if not present
   */
  protected generateId(title: string, timestamp: string): string {
    const hash = Buffer.from(`${title}-${timestamp}`).toString('base64');
    return hash.substring(0, 12);
  }
}