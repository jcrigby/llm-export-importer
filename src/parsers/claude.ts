/**
 * Claude.ai Export Parser for LLM Export Importer
 *
 * Handles Anthropic Claude.ai export format with its conversations array structure.
 * Claude exports are generally cleaner and more straightforward than other platforms.
 */

import { BaseParser, ParseResult, ParserValidationResult, ConversationData } from './base.js';

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

// New format (2025)
interface NewClaudeMessage {
  uuid: string;
  text: string;
  content: Array<{
    type: string;
    text: string;
    start_timestamp?: string;
    stop_timestamp?: string;
    citations?: any[];
  }>;
  sender: 'human' | 'assistant';
  created_at: string;
  updated_at: string;
  attachments?: any[];
  files?: any[];
}

interface NewClaudeConversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  account: { uuid: string };
  chat_messages: NewClaudeMessage[];
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

    // Check for new format (direct array of conversations)
    if (Array.isArray(data)) {
      const hasValidNewFormat = data.some(
        (conv: any) => conv.uuid && conv.name && conv.chat_messages && Array.isArray(conv.chat_messages)
      );

      if (hasValidNewFormat) {
        return {
          isValid: true,
          platform: 'claude',
          confidence: 0.95,
          issues: [],
        };
      }

      issues.push('Array format found but no valid Claude conversation structures');
    }

    // Check for legacy format (object with conversations property)
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

  parse(data: ClaudeExport | NewClaudeConversation[]): ParseResult {
    if (!this.validate(data).isValid) {
      throw new Error('Invalid Claude export format');
    }

    let conversations: ConversationData[];

    if (Array.isArray(data)) {
      // New format: direct array of conversations
      conversations = data
        .filter(conv => this.isValidNewClaudeConversation(conv))
        .map(conv => this.parseNewConversation(conv))
        .filter(conv => conv.messages.length > 0);
    } else {
      // Legacy format: object with conversations property
      conversations = data.conversations
        .filter(conv => this.isValidClaudeConversation(conv))
        .map(conv => this.parseConversation(conv))
        .filter(conv => conv.messages.length > 0);
    }

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
        exportVersion: Array.isArray(data) ? '2025-01' : (data.export_info?.version || 'unknown'),
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

  private isValidNewClaudeConversation(conv: any): conv is NewClaudeConversation {
    return (
      conv &&
      typeof conv === 'object' &&
      typeof conv.uuid === 'string' &&
      typeof conv.name === 'string' &&
      typeof conv.created_at === 'string' &&
      Array.isArray(conv.chat_messages) &&
      conv.chat_messages.every((msg: any) => this.isValidNewClaudeMessage(msg))
    );
  }

  private isValidNewClaudeMessage(msg: any): msg is NewClaudeMessage {
    return (
      msg &&
      typeof msg === 'object' &&
      typeof msg.uuid === 'string' &&
      (msg.sender === 'human' || msg.sender === 'assistant') &&
      typeof msg.text === 'string' &&
      Array.isArray(msg.content) &&
      typeof msg.created_at === 'string'
    );
  }

  private parseNewConversation(conversation: NewClaudeConversation): ConversationData {
    return {
      id: conversation.uuid,
      title: conversation.name || 'Untitled Conversation',
      messages: conversation.chat_messages.map(msg => ({
        role: this.normalizeRole(msg.sender),
        content: this.extractNewMessageContent(msg),
        timestamp: this.normalizeTimestamp(msg.created_at),
      })),
      platform: 'claude',
    };
  }

  private extractNewMessageContent(msg: NewClaudeMessage): string {
    // Use the text field as primary content, fallback to content array
    if (msg.text && msg.text.trim().length > 0) {
      return this.cleanContent(msg.text);
    }

    // Extract text from content array
    const textParts = msg.content
      .filter(item => item.type === 'text' && item.text)
      .map(item => item.text);

    return this.cleanContent(textParts.join('\n'));
  }
}

// Export a simple parsing function for the CLI
export function parseClaudeExport(data: any): ConversationData[] {
  const parser = new ClaudeParser();
  const result = parser.parse(data);
  return result.conversations;
}
