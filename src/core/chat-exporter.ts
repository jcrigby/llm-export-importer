/**
 * Export individual chats to markdown files
 * Each chat gets its own file for easy git grep searching
 */

import { ConversationData } from '../parsers/base.js';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export interface ExportOptions {
  outputDir: string;
  includeMetadata?: boolean;
  extractArtifacts?: boolean;
  sanitizeFilenames?: boolean;
}

export interface Artifact {
  type: 'code' | 'data' | 'config' | 'other';
  language?: string;
  filename?: string;
  content: string;
  messageIndex: number;
}

/**
 * Export a single chat to markdown
 */
export async function exportChatToMarkdown(
  conversation: ConversationData,
  options: ExportOptions
): Promise<{ 
  filename: string; 
  artifacts: Array<{ filename: string; content: string }> 
}> {
  const chatDate = new Date(conversation.messages[0]?.timestamp || Date.now());
  const dateStr = chatDate.toISOString().split('T')[0];
  
  // Generate filename: YYYY-MM-DD-sanitized-title.md
  const sanitizedTitle = sanitizeTitle(conversation.title || 'untitled', options.sanitizeFilenames);
  const filename = `${dateStr}-${sanitizedTitle}.md`;
  
  // Build markdown content
  const lines: string[] = [];
  
  // Header
  lines.push(`# ${conversation.title || 'Untitled Chat'}`);
  lines.push('');
  
  if (options.includeMetadata) {
    lines.push('## Metadata');
    lines.push(`- **Date**: ${chatDate.toLocaleString()}`);
    lines.push(`- **ID**: ${conversation.id}`);
    lines.push(`- **Messages**: ${conversation.messages.length}`);
    lines.push('');
  }
  
  lines.push('## Conversation');
  lines.push('');
  
  // Extract artifacts if requested
  const artifacts: Array<{ filename: string; content: string }> = [];
  
  // Messages
  conversation.messages.forEach((message, index) => {
    const role = message.role === 'user' || message.role === 'human' ? 'Human' : 'Assistant';
    const timestamp = new Date(message.timestamp);
    const timeStr = timestamp.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    lines.push(`### ${role} (${timeStr})`);
    lines.push('');
    
    // Process content and extract artifacts
    let content = message.content;
    
    if (options.extractArtifacts) {
      const { processedContent, extractedArtifacts } = extractArtifacts(
        content, 
        index,
        sanitizedTitle
      );
      content = processedContent;
      
      extractedArtifacts.forEach((artifact, artifactIndex) => {
        const artifactFilename = `${sanitizedTitle}-msg${index + 1}-${artifactIndex + 1}${artifact.extension}`;
        artifacts.push({
          filename: artifactFilename,
          content: artifact.content
        });
        
        // Add reference in the markdown
        content = content.replace(
          artifact.placeholder,
          `[See ${artifact.type}: ${artifactFilename}]`
        );
      });
    }
    
    lines.push(content);
    lines.push('');
  });
  
  // Write the main markdown file
  const fullPath = join(options.outputDir, filename);
  await mkdir(options.outputDir, { recursive: true });
  await writeFile(fullPath, lines.join('\n'), 'utf8');
  
  return { filename, artifacts };
}

/**
 * Export all chats to separate markdown files
 */
export async function exportAllChats(
  conversations: ConversationData[],
  options: ExportOptions
): Promise<{ 
  exportedFiles: string[]; 
  artifactFiles: string[];
  summary: string;
}> {
  const exportedFiles: string[] = [];
  const artifactFiles: string[] = [];
  
  // Create output directory
  await mkdir(options.outputDir, { recursive: true });
  
  // Create artifacts subdirectory if needed
  if (options.extractArtifacts) {
    await mkdir(join(options.outputDir, 'artifacts'), { recursive: true });
  }
  
  // Export each conversation
  for (const conversation of conversations) {
    const { filename, artifacts } = await exportChatToMarkdown(conversation, options);
    exportedFiles.push(filename);
    
    // Save artifacts
    for (const artifact of artifacts) {
      const artifactPath = join(options.outputDir, 'artifacts', artifact.filename);
      await writeFile(artifactPath, artifact.content, 'utf8');
      artifactFiles.push(artifact.filename);
    }
  }
  
  // Generate summary
  const summary = `Exported ${exportedFiles.length} conversations and ${artifactFiles.length} artifacts to ${options.outputDir}`;
  
  return { exportedFiles, artifactFiles, summary };
}

/**
 * Extract code blocks and other artifacts from message content
 */
function extractArtifacts(
  content: string, 
  messageIndex: number,
  _chatTitle: string
): { 
  processedContent: string; 
  extractedArtifacts: Array<{
    type: string;
    extension: string;
    content: string;
    placeholder: string;
  }> 
} {
  const artifacts: Array<{
    type: string;
    extension: string;
    content: string;
    placeholder: string;
  }> = [];
  
  let processedContent = content;
  let artifactCount = 0;
  
  // Extract markdown code blocks
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  
  processedContent = processedContent.replace(codeBlockRegex, (match, language, code) => {
    artifactCount++;
    const placeholder = `{{ARTIFACT_${messageIndex}_${artifactCount}}}`;
    
    // Determine file extension based on language
    const extension = getFileExtension(language);
    const type = language || 'code';
    
    artifacts.push({
      type,
      extension,
      content: code.trim(),
      placeholder
    });
    
    // Keep the code block in the markdown but add a reference
    return match + `\n${placeholder}`;
  });
  
  return { processedContent, extractedArtifacts: artifacts };
}

/**
 * Get file extension for a given language
 */
function getFileExtension(language: string): string {
  const extensionMap: Record<string, string> = {
    javascript: '.js',
    typescript: '.ts',
    python: '.py',
    java: '.java',
    cpp: '.cpp',
    c: '.c',
    html: '.html',
    css: '.css',
    json: '.json',
    yaml: '.yaml',
    yml: '.yml',
    markdown: '.md',
    bash: '.sh',
    shell: '.sh',
    sql: '.sql',
    jsx: '.jsx',
    tsx: '.tsx',
    vue: '.vue',
    svelte: '.svelte',
    rust: '.rs',
    go: '.go',
    ruby: '.rb',
    php: '.php',
    swift: '.swift',
    kotlin: '.kt',
    r: '.r',
    matlab: '.m',
    dockerfile: '.dockerfile',
    makefile: '.makefile',
    xml: '.xml',
    toml: '.toml',
    ini: '.ini',
    csv: '.csv',
    text: '.txt',
    '': '.txt'
  };
  
  return extensionMap[language.toLowerCase()] || '.txt';
}

/**
 * Sanitize title for use as filename
 */
function sanitizeTitle(title: string, aggressive = true): string {
  let sanitized = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-')       // Remove multiple hyphens
    .trim();
  
  if (aggressive) {
    // Limit length and remove common words
    const words = sanitized.split('-').filter(word => 
      word.length > 2 && !['the', 'and', 'for', 'with', 'from', 'about'].includes(word)
    );
    sanitized = words.slice(0, 8).join('-');
  }
  
  return sanitized || 'untitled';
}