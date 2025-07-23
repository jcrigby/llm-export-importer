/**
 * Perplexity Export Parser for LLM Export Importer
 *
 * Handles Perplexity AI export format with its threads array structure.
 * Perplexity exports include search context and citations.
 */

import { BaseParser, ParseResult, ParserValidationResult, ConversationData } from './base.js';

interface PerplexityMessage {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  id?: string;
  citations?: string[];
  search_results?: any[];
}

interface PerplexityThread {
  title: string;
  created_at: string;
  updated_at?: string;
  messages: PerplexityMessage[];
  thread_id?: string;
  model?: string;
}

interface PerplexityExport {
  threads: PerplexityThread[];
  export_info?: {
    created_at: string;
    version: string;
    user_id?: string;
  };
}

export class PerplexityParser extends BaseParser {
  readonly platform = 'perplexity' as const;
  readonly supportedVersions = ['1.0', '2024-01'];

  validate(data: any): ParserValidationResult {
    const issues: string[] = [];

    if (!data || typeof data !== 'object') {
      return {
        isValid: false,
        platform: 'unknown',
        confidence: 0,
        issues: ['Invalid JSON data'],
      };
    }

    // Check for Perplexity-specific structure
    if (!data.threads || !Array.isArray(data.threads)) {
      return {
        isValid: false,
        platform: 'unknown',
        confidence: 0,
        issues: ['Missing or invalid threads array'],
      };
    }

    // Validate thread structure
    let validThreads = 0;
    const totalThreads = data.threads.length;

    for (const thread of data.threads) {
      if (this.isValidPerplexityThread(thread)) {
        validThreads++;
      } else {
        issues.push(`Invalid thread structure: ${thread.title || 'unknown title'}`);
      }
    }

    if (validThreads === 0) {
      return {
        isValid: false,
        platform: 'perplexity',
        confidence: 0.2,
        issues: ['No valid Perplexity threads found', ...issues],
      };
    }

    const confidence = validThreads / totalThreads;

    return {
      isValid: confidence > 0.5,
      platform: 'perplexity',
      confidence,
      issues: confidence < 1 ? issues : [],
    };
  }

  parse(data: PerplexityExport): ParseResult {
    if (!this.validate(data).isValid) {
      throw new Error('Invalid Perplexity export format');
    }

    const conversations = data.threads
      .filter(thread => this.isValidPerplexityThread(thread))
      .map(thread => this.parseThread(thread))
      .filter(conv => conv.messages.length > 0);

    // Calculate metadata
    const timestamps = conversations.flatMap(conv => conv.messages.map(msg => msg.timestamp));

    const sortedTimestamps = timestamps.sort();

    return {
      conversations,
      metadata: {
        totalConversations: conversations.length,
        dateRange: {
          earliest: sortedTimestamps[0] || new Date().toISOString(),
          latest: sortedTimestamps[sortedTimestamps.length - 1] || new Date().toISOString(),
        },
        platform: 'perplexity',
        exportVersion: data.export_info?.version || 'unknown',
      },
    };
  }

  private isValidPerplexityThread(thread: any): thread is PerplexityThread {
    return (
      thread &&
      typeof thread === 'object' &&
      typeof thread.title === 'string' &&
      typeof thread.created_at === 'string' &&
      Array.isArray(thread.messages) &&
      thread.messages.every((msg: any) => this.isValidPerplexityMessage(msg))
    );
  }

  private isValidPerplexityMessage(msg: any): msg is PerplexityMessage {
    return (
      msg &&
      typeof msg === 'object' &&
      (msg.role === 'user' || msg.role === 'assistant') &&
      typeof msg.content === 'string' &&
      typeof msg.created_at === 'string'
    );
  }

  private parseThread(thread: PerplexityThread): ConversationData {
    return {
      id: thread.thread_id || this.generateId(thread.title, thread.created_at),
      title: thread.title || 'Untitled Thread',
      messages: thread.messages.map(msg => ({
        role: this.normalizeRole(msg.role),
        content: this.cleanContent(this.processPerplexityContent(msg)),
        timestamp: this.normalizeTimestamp(msg.created_at),
      })),
      platform: 'perplexity',
    };
  }

  private normalizeRole(role: 'user' | 'assistant'): 'user' | 'assistant' | 'human' | 'model' {
    switch (role) {
      case 'user':
        return 'user';
      case 'assistant':
        return 'assistant';
      default:
        return 'user';
    }
  }

  private processPerplexityContent(msg: PerplexityMessage): string {
    let content = msg.content;

    // Append citations if available
    if (msg.citations && msg.citations.length > 0) {
      content +=
        '\n\nCitations:\n' +
        msg.citations.map((citation, index) => `[${index + 1}] ${citation}`).join('\n');
    }

    return content;
  }
}

// Export a simple parsing function for the CLI
export function parsePerplexityExport(data: any): ConversationData[] {
  const parser = new PerplexityParser();
  const result = parser.parse(data);
  return result.conversations;
}
