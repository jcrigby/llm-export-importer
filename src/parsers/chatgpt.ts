/**
 * ChatGPT Export Parser for LLM Export Importer
 *
 * Handles OpenAI ChatGPT export format with its unique mapping structure.
 * ChatGPT exports use a UUID-based mapping system for message organization.
 */

import { BaseParser, ParseResult, ParserValidationResult, ConversationData } from './base.js';

interface ChatGPTMessage {
  id: string;
  author: { role: 'user' | 'assistant' | 'system' };
  content: { parts: string[] };
  create_time: number;
  weight?: number;
}

interface ChatGPTConversation {
  title: string;
  create_time: number;
  update_time?: number;
  mapping: {
    [uuid: string]: {
      id: string;
      message?: ChatGPTMessage;
      parent?: string;
      children: string[];
    };
  };
  conversation_id?: string;
  current_node?: string;
}

interface ChatGPTExport {
  conversations?: ChatGPTConversation[];
  // Legacy format - single conversation
  title?: string;
  create_time?: number;
  mapping?: any;
}

export class ChatGPTParser extends BaseParser {
  readonly platform = 'chatgpt' as const;
  readonly supportedVersions = ['2023-12', '2024-01', '2024-06'];

  validate(data: any): ParserValidationResult {
    const issues: string[] = [];

    // Check for ChatGPT-specific structure
    if (!data || typeof data !== 'object') {
      return {
        isValid: false,
        platform: 'unknown',
        confidence: 0,
        issues: ['Invalid JSON data'],
      };
    }

    // Direct array format: array of conversations (newest format)
    if (Array.isArray(data)) {
      const hasValidConversations = data.some(
        (conv: any) => conv.mapping && typeof conv.mapping === 'object' && conv.title
      );

      if (hasValidConversations) {
        return {
          isValid: true,
          platform: 'chatgpt',
          confidence: 0.95,
          issues: [],
        };
      }

      issues.push('Array format found but no valid ChatGPT conversation structures');
    }

    // Modern format: object with conversations property
    if (data.conversations && Array.isArray(data.conversations)) {
      const hasValidConversations = data.conversations.some(
        (conv: any) => conv.mapping && typeof conv.mapping === 'object'
      );

      if (hasValidConversations) {
        return {
          isValid: true,
          platform: 'chatgpt',
          confidence: 0.95,
          issues: [],
        };
      }

      issues.push('Conversations array found but no valid mapping structures');
    }

    // Legacy format: single conversation with mapping
    if (data.mapping && typeof data.mapping === 'object') {
      return {
        isValid: true,
        platform: 'chatgpt',
        confidence: 0.9,
        issues: [],
      };
    }

    // Check for ChatGPT-like structure but with issues
    if (data.title || data.create_time) {
      issues.push('Some ChatGPT-like properties found but missing mapping structure');
      return {
        isValid: false,
        platform: 'chatgpt',
        confidence: 0.3,
        issues,
      };
    }

    return {
      isValid: false,
      platform: 'unknown',
      confidence: 0,
      issues: ['No ChatGPT format indicators found'],
    };
  }

  parse(data: ChatGPTExport | ChatGPTConversation[]): ParseResult {
    let conversations: ConversationData[];

    if (Array.isArray(data)) {
      // Direct array format: array of conversations (newest format)
      conversations = data.map(conv => this.parseConversation(conv));
    } else if (data.conversations && Array.isArray(data.conversations)) {
      // Modern format: object with conversations property
      conversations = data.conversations.map(conv => this.parseConversation(conv));
    } else if (data.mapping) {
      // Legacy format: single conversation
      const singleConv: ChatGPTConversation = {
        title: data.title || 'Untitled Conversation',
        create_time: data.create_time || Date.now() / 1000,
        mapping: data.mapping,
      };
      conversations = [this.parseConversation(singleConv)];
    } else {
      throw new Error('No valid ChatGPT conversation data found');
    }

    // Calculate metadata
    const timestamps = conversations.flatMap(conv => conv.messages.map(msg => msg.timestamp));

    const sortedTimestamps = timestamps.sort();

    return {
      conversations: conversations.filter(conv => conv.messages.length > 0),
      metadata: {
        totalConversations: conversations.length,
        dateRange: {
          earliest: sortedTimestamps[0] || new Date().toISOString(),
          latest: sortedTimestamps[sortedTimestamps.length - 1] || new Date().toISOString(),
        },
        platform: 'chatgpt',
        exportVersion: this.detectExportVersion(data),
      },
    };
  }

  private parseConversation(conversation: ChatGPTConversation): ConversationData {
    const messages = this.extractMessagesFromMapping(conversation.mapping);

    return {
      id:
        conversation.conversation_id ||
        this.generateId(conversation.title, conversation.create_time.toString()),
      title: conversation.title || 'Untitled Conversation',
      messages: messages.map(msg => ({
        role: this.normalizeRole(msg.author?.role || 'user'),
        content: this.cleanContentParts(msg.content?.parts || []),
        timestamp: this.normalizeTimestamp(msg.create_time || Date.now() / 1000),
      })),
      platform: 'chatgpt',
    };
  }

  private extractMessagesFromMapping(mapping: ChatGPTConversation['mapping']): ChatGPTMessage[] {
    const messages: ChatGPTMessage[] = [];

    // Extract all messages from the mapping
    for (const [_uuid, node] of Object.entries(mapping)) {
      if (node?.message && 
          node.message.content && 
          node.message.content.parts && 
          Array.isArray(node.message.content.parts) &&
          node.message.content.parts.length > 0 &&
          node.message.author) {
        // Only add messages with actual content
        const hasContent = node.message.content.parts.some((part: any) => {
          if (typeof part === 'string') {
            return part.trim().length > 0;
          } else if (typeof part === 'object' && part !== null) {
            // Handle object parts (canvas, audio, etc.)
            if (part.text) return part.text.trim().length > 0;
            if (part.content) return typeof part.content === 'string' ? part.content.trim().length > 0 : true;
            return true; // Keep objects that might have content
          }
          return false;
        });
        if (hasContent) {
          messages.push(node.message);
        }
      }
    }

    // Sort by creation time (handle missing create_time)
    return messages.sort((a, b) => (a.create_time || 0) - (b.create_time || 0));
  }

  private cleanContentParts(parts: any[]): string {
    const contentParts: string[] = [];

    for (const part of parts) {
      if (typeof part === 'string') {
        contentParts.push(part);
      } else if (typeof part === 'object' && part !== null) {
        // Handle different object types
        if (part.text) {
          contentParts.push(part.text);
        } else if (part.content) {
          if (typeof part.content === 'string') {
            contentParts.push(part.content);
          } else if (typeof part.content === 'object') {
            // Canvas/document content - try to extract text
            contentParts.push(`[Document: ${part.name || 'Untitled'}]`);
          }
        } else if (part.content_type === 'audio_transcription') {
          contentParts.push(`[Audio: ${part.text || 'Audio message'}]`);
        } else if (part.content_type && part.content_type.includes('audio')) {
          contentParts.push('[Audio message]');
        } else if (part.content_type && part.content_type.includes('video')) {
          contentParts.push('[Video message]');
        } else if (part.content_type && part.content_type.includes('image')) {
          contentParts.push('[Image]');
        } else {
          // Generic object content
          contentParts.push(`[${part.content_type || 'Attachment'}]`);
        }
      }
    }

    return contentParts.join('\n').trim();
  }

  private normalizeRole(role: string): 'user' | 'assistant' | 'human' | 'model' {
    switch (role.toLowerCase()) {
      case 'user':
        return 'user';
      case 'assistant':
        return 'assistant';
      case 'system':
        return 'assistant'; // Treat system messages as assistant
      default:
        return 'user';
    }
  }

  private detectExportVersion(data: ChatGPTExport | ChatGPTConversation[]): string {
    if (Array.isArray(data)) {
      return '2025-01'; // Newest direct array format
    }

    if (data.conversations && Array.isArray(data.conversations)) {
      return '2024-06'; // Modern multi-conversation format
    }

    if (data.mapping && data.title) {
      return '2023-12'; // Legacy single conversation format
    }

    return 'unknown';
  }
}

// Export a simple parsing function for the CLI
export function parseChatGPTExport(data: any): ConversationData[] {
  const parser = new ChatGPTParser();
  const result = parser.parse(data);
  return result.conversations;
}
