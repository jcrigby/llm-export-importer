/**
 * ChatGPT Export Parser for LLM Export Importer
 *
 * Handles OpenAI ChatGPT export format with its unique mapping structure.
 * ChatGPT exports use a UUID-based mapping system for message organization.
 */

import { BaseParser, ParseResult, ParserValidationResult } from './base.js';
import { ConversationData } from '../classification/pipeline.js';

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

    // Modern format: array of conversations
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

  parse(data: ChatGPTExport): ParseResult {
    let conversations: ConversationData[];

    if (data.conversations && Array.isArray(data.conversations)) {
      // Modern format: multiple conversations
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
        role: this.normalizeRole(msg.author.role),
        content: this.cleanContent(msg.content.parts),
        timestamp: this.normalizeTimestamp(msg.create_time),
      })),
      platform: 'chatgpt',
    };
  }

  private extractMessagesFromMapping(mapping: ChatGPTConversation['mapping']): ChatGPTMessage[] {
    const messages: ChatGPTMessage[] = [];

    // Extract all messages from the mapping
    for (const [_uuid, node] of Object.entries(mapping)) {
      if (node.message && node.message.content && node.message.content.parts.length > 0) {
        messages.push(node.message);
      }
    }

    // Sort by creation time
    return messages.sort((a, b) => a.create_time - b.create_time);
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

  private detectExportVersion(data: ChatGPTExport): string {
    if (data.conversations && Array.isArray(data.conversations)) {
      return '2024-06'; // Modern multi-conversation format
    }

    if (data.mapping && data.title) {
      return '2023-12'; // Legacy single conversation format
    }

    return 'unknown';
  }
}
