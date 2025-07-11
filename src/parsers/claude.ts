/**
 * Claude.ai Export Parser for LLM Export Importer
 *
 * Handles Anthropic Claude.ai export format with its conversations array structure.
 * Claude exports are generally cleaner and more straightforward than other platforms.
 */

import { BaseParser, ParseResult, ParserValidationResult } from './base.js';
import { ConversationData } from '../classification/pipeline.js';

interface ClaudeMessage {
  role: 'human' | 'assistant';
  content: string;
  timestamp: string;
  id?: string;
}

interface ClaudeConversation {
  id: string;
  name: string;
  created_at: string;
  updated_at?: string;
  messages: ClaudeMessage[];
  model?: string;
}

interface ClaudeExport {
  conversations: ClaudeConversation[];
  export_info?: {
    created_at: string;
    version: string;
    user_id?: string;
  };
}

export class ClaudeParser extends BaseParser {
  readonly platform = 'claude' as const;
  readonly supportedVersions = ['1.0', '1.1', '2.0'];

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

    // Check for Claude-specific structure
    if (!data.conversations || !Array.isArray(data.conversations)) {
      return {
        isValid: false,
        platform: 'unknown',
        confidence: 0,
        issues: ['Missing or invalid conversations array'],
      };
    }

    // Validate conversation structure
    let validConversations = 0;
    const totalConversations = data.conversations.length;

    for (const conv of data.conversations) {
      if (this.isValidClaudeConversation(conv)) {
        validConversations++;
      } else {
        issues.push(`Invalid conversation structure: ${conv.id || 'unknown ID'}`);
      }
    }

    if (validConversations === 0) {
      return {
        isValid: false,
        platform: 'claude',
        confidence: 0.2,
        issues: ['No valid Claude conversations found', ...issues],
      };
    }

    const confidence = validConversations / totalConversations;

    return {
      isValid: confidence > 0.5,
      platform: 'claude',
      confidence,
      issues: confidence < 1 ? issues : [],
    };
  }

  parse(data: ClaudeExport): ParseResult {
    if (!this.validate(data).isValid) {
      throw new Error('Invalid Claude export format');
    }

    const conversations = data.conversations
      .filter(conv => this.isValidClaudeConversation(conv))
      .map(conv => this.parseConversation(conv))
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
        platform: 'claude',
        exportVersion: data.export_info?.version || 'unknown',
      },
    };
  }

  private isValidClaudeConversation(conv: any): conv is ClaudeConversation {
    return (
      conv &&
      typeof conv === 'object' &&
      typeof conv.id === 'string' &&
      typeof conv.name === 'string' &&
      typeof conv.created_at === 'string' &&
      Array.isArray(conv.messages) &&
      conv.messages.every((msg: any) => this.isValidClaudeMessage(msg))
    );
  }

  private isValidClaudeMessage(msg: any): msg is ClaudeMessage {
    return (
      msg &&
      typeof msg === 'object' &&
      (msg.role === 'human' || msg.role === 'assistant') &&
      typeof msg.content === 'string' &&
      typeof msg.timestamp === 'string'
    );
  }

  private parseConversation(conversation: ClaudeConversation): ConversationData {
    return {
      id: conversation.id,
      title: conversation.name || 'Untitled Conversation',
      messages: conversation.messages.map(msg => ({
        role: this.normalizeRole(msg.role),
        content: this.cleanContent(msg.content),
        timestamp: this.normalizeTimestamp(msg.timestamp),
      })),
      platform: 'claude',
    };
  }

  private normalizeRole(role: 'human' | 'assistant'): 'user' | 'assistant' | 'human' | 'model' {
    switch (role) {
      case 'human':
        return 'human';
      case 'assistant':
        return 'assistant';
      default:
        return 'user';
    }
  }
}
