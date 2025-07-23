/**
 * Gemini Export Parser for LLM Export Importer
 *
 * Handles Google Gemini export format with its chats array structure.
 * Note: Gemini export format may vary as the platform evolves.
 */

import { BaseParser, ParseResult, ParserValidationResult, ConversationData } from './base.js';

interface GeminiMessage {
  author: 'user' | 'model';
  text: string;
  timestamp: string;
  id?: string;
}

interface GeminiChat {
  title: string;
  create_time: string;
  update_time?: string;
  messages: GeminiMessage[];
  chat_id?: string;
}

interface GeminiExport {
  chats: GeminiChat[];
  export_metadata?: {
    created_at: string;
    version: string;
  };
}

export class GeminiParser extends BaseParser {
  readonly platform = 'gemini' as const;
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

    // Check for Gemini-specific structure
    if (!data.chats || !Array.isArray(data.chats)) {
      return {
        isValid: false,
        platform: 'unknown',
        confidence: 0,
        issues: ['Missing or invalid chats array'],
      };
    }

    // Validate chat structure
    let validChats = 0;
    const totalChats = data.chats.length;

    for (const chat of data.chats) {
      if (this.isValidGeminiChat(chat)) {
        validChats++;
      } else {
        issues.push(`Invalid chat structure: ${chat.title || 'unknown title'}`);
      }
    }

    if (validChats === 0) {
      return {
        isValid: false,
        platform: 'gemini',
        confidence: 0.2,
        issues: ['No valid Gemini chats found', ...issues],
      };
    }

    const confidence = validChats / totalChats;

    return {
      isValid: confidence > 0.5,
      platform: 'gemini',
      confidence,
      issues: confidence < 1 ? issues : [],
    };
  }

  parse(data: GeminiExport): ParseResult {
    if (!this.validate(data).isValid) {
      throw new Error('Invalid Gemini export format');
    }

    const conversations = data.chats
      .filter(chat => this.isValidGeminiChat(chat))
      .map(chat => this.parseChat(chat))
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
        platform: 'gemini',
        exportVersion: data.export_metadata?.version || 'unknown',
      },
    };
  }

  private isValidGeminiChat(chat: any): chat is GeminiChat {
    return (
      chat &&
      typeof chat === 'object' &&
      typeof chat.title === 'string' &&
      typeof chat.create_time === 'string' &&
      Array.isArray(chat.messages) &&
      chat.messages.every((msg: any) => this.isValidGeminiMessage(msg))
    );
  }

  private isValidGeminiMessage(msg: any): msg is GeminiMessage {
    return (
      msg &&
      typeof msg === 'object' &&
      (msg.author === 'user' || msg.author === 'model') &&
      typeof msg.text === 'string' &&
      typeof msg.timestamp === 'string'
    );
  }

  private parseChat(chat: GeminiChat): ConversationData {
    return {
      id: chat.chat_id || this.generateId(chat.title, chat.create_time),
      title: chat.title || 'Untitled Chat',
      messages: chat.messages.map(msg => ({
        role: this.normalizeRole(msg.author),
        content: this.cleanContent(msg.text),
        timestamp: this.normalizeTimestamp(msg.timestamp),
      })),
      platform: 'gemini',
    };
  }

  private normalizeRole(author: 'user' | 'model'): 'user' | 'assistant' | 'human' | 'model' {
    switch (author) {
      case 'user':
        return 'user';
      case 'model':
        return 'model';
      default:
        return 'user';
    }
  }
}

// Export a simple parsing function for the CLI
export function parseGeminiExport(data: any): ConversationData[] {
  const parser = new GeminiParser();
  const result = parser.parse(data);
  return result.conversations;
}
