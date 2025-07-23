/**
 * Simple project organization for grouping related chats
 */

import { ConversationData } from '../parsers/base.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface Project {
  name: string;
  conversations: string[]; // conversation IDs
  keywords: string[];
  created: Date;
  description?: string;
}

export interface ProjectOrganizeOptions {
  autoDetect?: boolean;
  keywordThreshold?: number;
  minConversations?: number;
}

/**
 * Auto-detect projects based on common keywords and titles
 */
export function autoDetectProjects(
  conversations: ConversationData[],
  options: ProjectOrganizeOptions = {}
): Project[] {
  const {
    keywordThreshold = 3,
    minConversations = 2
  } = options;
  
  // Extract keywords from each conversation
  const conversationKeywords = new Map<string, Set<string>>();
  
  conversations.forEach(conv => {
    const keywords = extractKeywords(conv);
    conversationKeywords.set(conv.id, keywords);
  });
  
  // Find conversations with overlapping keywords
  const projects: Project[] = [];
  const assigned = new Set<string>();
  
  conversations.forEach(conv => {
    if (assigned.has(conv.id)) return;
    
    const myKeywords = conversationKeywords.get(conv.id)!;
    const related: string[] = [conv.id];
    const projectKeywords = new Set(myKeywords);
    
    // Find other conversations with similar keywords
    conversations.forEach(otherConv => {
      if (otherConv.id === conv.id || assigned.has(otherConv.id)) return;
      
      const otherKeywords = conversationKeywords.get(otherConv.id)!;
      const commonKeywords = [...myKeywords].filter(k => otherKeywords.has(k));
      
      if (commonKeywords.length >= keywordThreshold) {
        related.push(otherConv.id);
        otherKeywords.forEach(k => projectKeywords.add(k));
      }
    });
    
    // Create project if we found related conversations
    if (related.length >= minConversations) {
      const projectName = generateProjectName(projectKeywords);
      
      projects.push({
        name: projectName,
        conversations: related,
        keywords: [...projectKeywords].slice(0, 10),
        created: new Date()
      });
      
      related.forEach(id => assigned.add(id));
    }
  });
  
  return projects;
}

/**
 * Create project organization in the file system
 */
export async function organizeIntoProjects(
  conversations: ConversationData[],
  projects: Project[],
  outputDir: string
): Promise<{ projectDirs: string[]; summary: string }> {
  const projectDirs: string[] = [];
  const conversationMap = new Map(conversations.map(c => [c.id, c]));
  
  // Create projects directory
  const projectsDir = join(outputDir, 'projects');
  await mkdir(projectsDir, { recursive: true });
  
  // Create directory for each project
  for (const project of projects) {
    const projectDir = join(projectsDir, sanitizeProjectName(project.name));
    await mkdir(projectDir, { recursive: true });
    projectDirs.push(projectDir);
    
    // Create project README
    const readmeContent = generateProjectReadme(project, conversationMap);
    await writeFile(join(projectDir, 'README.md'), readmeContent, 'utf8');
    
    // Create project metadata
    await writeFile(
      join(projectDir, 'project.json'), 
      JSON.stringify(project, null, 2), 
      'utf8'
    );
    
    // Create symlinks or references to conversations
    const refsContent = project.conversations.map(id => {
      const conv = conversationMap.get(id);
      if (!conv) return '';
      
      const date = new Date(conv.messages[0]?.timestamp || Date.now());
      const dateStr = date.toISOString().split('T')[0];
      const title = conv.title || 'Untitled';
      
      return `- [${dateStr} - ${title}](../../${dateStr}-${sanitizeTitle(title)}.md)`;
    }).filter(Boolean).join('\n');
    
    await writeFile(join(projectDir, 'conversations.md'), `# Project Conversations\n\n${refsContent}`, 'utf8');
  }
  
  // Create unassigned conversations list
  const assignedIds = new Set(projects.flatMap(p => p.conversations));
  const unassigned = conversations.filter(c => !assignedIds.has(c.id));
  
  if (unassigned.length > 0) {
    const unassignedContent = `# Unassigned Conversations\n\nThese conversations were not assigned to any project:\n\n` +
      unassigned.map(c => `- ${c.title || 'Untitled'} (${c.id})`).join('\n');
    
    await writeFile(join(projectsDir, 'unassigned.md'), unassignedContent, 'utf8');
  }
  
  const summary = `Organized ${conversations.length} conversations into ${projects.length} projects`;
  return { projectDirs, summary };
}

/**
 * Extract meaningful keywords from a conversation
 */
function extractKeywords(conversation: ConversationData): Set<string> {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when', 'where', 'why', 'how',
    'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did'
  ]);
  
  const text = conversation.title + ' ' + conversation.messages.slice(0, 3).map(m => m.content).join(' ');
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  
  const keywords = new Set<string>();
  const wordCounts = new Map<string, number>();
  
  // Count word frequency
  words.forEach(word => {
    if (word.length > 3 && !stopWords.has(word)) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  });
  
  // Take most frequent words
  const sorted = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]);
  sorted.slice(0, 20).forEach(([word]) => keywords.add(word));
  
  // Also extract capitalized words (potential project names, technologies, etc.)
  const capitalizedWords = text.match(/\b[A-Z][a-z]+\b/g) || [];
  capitalizedWords.forEach(word => {
    if (word.length > 3) {
      keywords.add(word.toLowerCase());
    }
  });
  
  return keywords;
}

/**
 * Generate project name from keywords
 */
function generateProjectName(keywords: Set<string>): string {
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  const mainWords = sorted.slice(0, 3).map(w => 
    w.charAt(0).toUpperCase() + w.slice(1)
  );
  
  return mainWords.join(' ') + ' Project';
}

/**
 * Generate project README content
 */
function generateProjectReadme(project: Project, conversationMap: Map<string, ConversationData>): string {
  const lines: string[] = [];
  
  lines.push(`# ${project.name}`);
  lines.push('');
  
  if (project.description) {
    lines.push(project.description);
    lines.push('');
  }
  
  lines.push('## Overview');
  lines.push(`- **Conversations**: ${project.conversations.length}`);
  lines.push(`- **Created**: ${project.created.toLocaleDateString()}`);
  lines.push(`- **Keywords**: ${project.keywords.slice(0, 10).join(', ')}`);
  lines.push('');
  
  lines.push('## Conversations');
  lines.push('');
  
  project.conversations.forEach(id => {
    const conv = conversationMap.get(id);
    if (!conv) return;
    
    const date = new Date(conv.messages[0]?.timestamp || Date.now());
    const dateStr = date.toLocaleDateString();
    
    lines.push(`### ${conv.title || 'Untitled'}`);
    lines.push(`- **Date**: ${dateStr}`);
    lines.push(`- **Messages**: ${conv.messages.length}`);
    lines.push(`- **ID**: ${id}`);
    lines.push('');
  });
  
  return lines.join('\n');
}

/**
 * Sanitize project name for filesystem
 */
function sanitizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
    .trim() || 'unnamed-project';
}

/**
 * Sanitize title for filename
 */
function sanitizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
    .trim() || 'untitled';
}