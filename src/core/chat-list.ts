/**
 * Simple chat list viewer for LLM exports
 * Shows all chats in date order like the web interface
 */

import { ConversationData } from '../parsers/base.js';

export interface ChatSummary {
  id: string;
  title: string;
  date: Date;
  messageCount: number;
  firstMessage: string;
  lastMessage: string;
  platform: string;
}

/**
 * Generate a list of all chats sorted by date
 */
export function generateChatList(conversations: ConversationData[], platform: string): ChatSummary[] {
  const summaries: ChatSummary[] = conversations.map(conv => {
    const firstMsg = conv.messages[0];
    const lastMsg = conv.messages[conv.messages.length - 1];
    
    return {
      id: conv.id,
      title: conv.title || 'Untitled Chat',
      date: new Date(firstMsg?.timestamp || Date.now()),
      messageCount: conv.messages.length,
      firstMessage: firstMsg?.content.slice(0, 100) + '...' || '',
      lastMessage: lastMsg?.content.slice(0, 100) + '...' || '',
      platform
    };
  });

  // Sort by date, most recent first
  return summaries.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/**
 * Format chat list for display
 */
export function formatChatList(summaries: ChatSummary[]): string {
  const lines: string[] = [];
  
  lines.push('# Chat Export Summary\n');
  lines.push(`Total conversations: ${summaries.length}\n`);
  
  // Group by month
  const byMonth = new Map<string, ChatSummary[]>();
  
  summaries.forEach(summary => {
    const monthKey = summary.date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    if (!byMonth.has(monthKey)) {
      byMonth.set(monthKey, []);
    }
    byMonth.get(monthKey)!.push(summary);
  });
  
  // Display by month
  for (const [month, chats] of byMonth) {
    lines.push(`\n## ${month}`);
    lines.push('');
    
    chats.forEach(chat => {
      const dateStr = chat.date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      lines.push(`### ${dateStr} - ${chat.title}`);
      lines.push(`- Messages: ${chat.messageCount}`);
      lines.push(`- First: "${chat.firstMessage}"`);
      lines.push(`- Last: "${chat.lastMessage}"`);
      lines.push(`- ID: ${chat.id}`);
      lines.push('');
    });
  }
  
  return lines.join('\n');
}

/**
 * Generate a simple CSV for spreadsheet import
 */
export function generateChatListCSV(summaries: ChatSummary[]): string {
  const headers = ['Date', 'Title', 'Messages', 'Platform', 'ID'];
  const rows = summaries.map(s => [
    s.date.toISOString(),
    `"${s.title.replace(/"/g, '""')}"`,
    s.messageCount.toString(),
    s.platform,
    s.id
  ]);
  
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}