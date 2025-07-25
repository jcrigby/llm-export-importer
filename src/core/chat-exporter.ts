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
  formatJson?: 'pretty' | 'collapse' | 'show' | 'none';
  processArtifacts?: boolean;
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
    
    // Handle JSON formatting and artifacts
    if ((options.formatJson && options.formatJson !== 'none') || options.processArtifacts) {
      // Check for artifacts first
      const jsonItems = extractJsonFromContent(content);
      
      if (jsonItems.length > 0) {
        // Check if any are artifacts
        const hasArtifacts = jsonItems.some(item => 
          (item.json.type === 'document' && item.json.name && item.json.content) ||
          (item.json.textdoc_id && item.json.updates) ||
          (item.json.result && item.json.textdoc_id && item.json.name)
        );
        
        if (hasArtifacts && options.processArtifacts) {
          // Process artifacts specially
          const { processedContent, artifactFiles: messageArtifacts } = processArtifacts(jsonItems, conversation.title || 'untitled', index);
          
          // Remove original JSON blocks and replace with processed content
          // First remove JSON code blocks
          content = content.replace(/```(?:json)?\s*\n[\s\S]*?\n```/g, '');
          // Then remove inline JSON
          const jsonRegex = /(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\])/g;
          content = content.replace(jsonRegex, '');
          content += processedContent;
          
          // Add artifact files to the main artifacts array
          messageArtifacts.forEach((artifact) => {
            artifacts.push({
              filename: artifact.filename,
              content: artifact.content
            });
          });
        } else if (options.formatJson && options.formatJson !== 'none') {
          // Regular JSON formatting
          content = detectAndFormatJson(content, options.formatJson);
        }
      } else if (options.formatJson && options.formatJson !== 'none') {
        // Regular JSON formatting
        content = detectAndFormatJson(content, options.formatJson);
      }
    }
    
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
  if (options.extractArtifacts || options.processArtifacts) {
    await mkdir(join(options.outputDir, 'artifacts'), { recursive: true });
  }
  
  // Export each conversation
  for (const conversation of conversations) {
    const { filename, artifacts } = await exportChatToMarkdown(conversation, options);
    exportedFiles.push(filename);
    
    // Save artifacts
    for (const artifact of artifacts) {
      const artifactPath = join(options.outputDir, 'artifacts', artifact.filename);
      
      // Pretty format JSON artifacts
      let content = artifact.content;
      if (artifact.filename.endsWith('.json')) {
        try {
          const parsed = JSON.parse(content);
          content = JSON.stringify(parsed, null, 2);
        } catch (e) {
          // Not valid JSON, keep as-is
        }
      }
      
      await writeFile(artifactPath, content, 'utf8');
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
 * Detect and format JSON strings in content
 */
function detectAndFormatJson(content: string, formatMode: 'pretty' | 'collapse' | 'show' | 'none' = 'none'): string {
  if (formatMode === 'none') return content;
  
  // Look for potential JSON strings (smushed on one line)
  const jsonRegex = /(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\])/g;
  
  let processedContent = content;
  
  processedContent = processedContent.replace(jsonRegex, (match) => {
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(match);
      
      if (formatMode === 'pretty') {
        // Format as pretty JSON in a code block
        return `\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\`\n`;
      } else if (formatMode === 'collapse') {
        // Keep it collapsed but mark it
        return `\`${match}\` *(collapsed JSON)*`;
      } else if (formatMode === 'show') {
        // For show mode, we'll handle this differently at export level
        return match;
      }
      return match;
    } catch (e) {
      // Not valid JSON, leave as is
      return match;
    }
  });
  
  return processedContent;
}


/**
 * Process artifacts (Claude documents) from JSON data
 */
function processArtifacts(jsonItems: Array<{json: any, raw: string}>, chatTitle: string, _messageIndex: number): {
  processedContent: string;
  artifactFiles: Array<{filename: string, content: string}>;
} {
  const artifactFiles: Array<{filename: string, content: string}> = [];
  let processedContent = '';
  
  // First, separate document artifacts from other JSON
  const documentArtifacts = jsonItems.filter(item => 
    item.json.type === 'document' && item.json.name && item.json.content
  );
  const otherJsonItems = jsonItems.filter(item => 
    !(item.json.type === 'document' && item.json.name && item.json.content)
  );
  
  // Process document artifacts first
  documentArtifacts.forEach((item, index) => {
    const json = item.json;
    
    // Check if it's an artifact creation
    if (json.type === 'document' && json.name && json.content) {
      const filename = `${sanitizeTitle(chatTitle, true)}-artifact-${json.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
      
      
      // Also save the full JSON
      const jsonFilename = `${sanitizeTitle(chatTitle, true)}-msg${_messageIndex + 1}-${index + 1}.json`;
      const prettyJson = JSON.stringify(json, null, 2);
      
      processedContent += `\n**📄 Document Created: "${json.name}"**\n\n`;
      processedContent += `> [Full content saved to: ${filename}]\n\n`;
      processedContent += `> [JSON saved to: ${jsonFilename}]\n\n`;
      processedContent += '```markdown\n';
      processedContent += unescapeJsonContent(json.content);
      processedContent += '\n```\n\n';
      
      artifactFiles.push({
        filename,
        content: `# ${json.name}\n\n${unescapeJsonContent(json.content)}`
      });
      
      artifactFiles.push({
        filename: jsonFilename,
        content: prettyJson
      });
    }
  });
  
  // Process other JSON items (updates, confirmations, and generic JSON)
  otherJsonItems.forEach((item, index) => {
    const json = item.json;
    
    // Check if it's an artifact update
    if (json.textdoc_id && json.updates && Array.isArray(json.updates)) {
      // Save the full JSON artifact
      const jsonFilename = `${sanitizeTitle(chatTitle, true)}-msg${_messageIndex + 1}-${index + 1}.json`;
      const prettyJson = JSON.stringify(json, null, 2);
      
      artifactFiles.push({
        filename: jsonFilename,
        content: prettyJson
      });
      
      processedContent += `\n**📝 Document Updated (ID: ${json.textdoc_id})**\n\n`;
      processedContent += `> [Full JSON saved to: ${jsonFilename}]\n\n`;
      
      json.updates.forEach((update: any, updateIndex: number) => {
        if (update.replacement) {
          processedContent += `### Update ${updateIndex + 1}:\n`;
          processedContent += `- **Pattern**: \`${update.pattern || 'full replacement'}\`\n`;
          processedContent += `- **Multiple**: ${update.multiple || false}\n\n`;
          processedContent += '```markdown\n';
          processedContent += update.replacement.substring(0, 300) + (update.replacement.length > 300 ? '...\n\n[Content truncated]' : '');
          processedContent += '\n```\n\n';
          
          // Also save the replacement content as a separate file
          const updateFilename = `${sanitizeTitle(chatTitle, true)}-update-${_messageIndex + 1}-${index + 1}-${updateIndex + 1}.md`;
          artifactFiles.push({
            filename: updateFilename,
            content: unescapeJsonContent(update.replacement)
          });
        }
      });
    }
    
    // Check if it's artifact confirmation
    else if (json.result && json.textdoc_id && json.name) {
      processedContent += `\n**✅ "${json.name}" created successfully** (ID: \`${json.textdoc_id}\`)\n\n`;
    }
    
    // For other JSON, fall back to pretty formatting (only if it has meaningful content)
    else if (Object.keys(json).length > 0 && json.constructor === Object) {
      // Generate a filename for the JSON artifact
      const jsonFilename = `${sanitizeTitle(chatTitle, true)}-msg${_messageIndex + 1}-${index + 1}.json`;
      
      processedContent += `\n**📊 Data ${index + 1}:**\n`;
      processedContent += `> [Full JSON saved to: ${jsonFilename}]\n\n`;
      processedContent += '```json\n';
      const prettyJson = JSON.stringify(json, null, 2);
      processedContent += prettyJson.length > 500 ? prettyJson.substring(0, 500) + '\n...\n\n[Content truncated - see full file]' : prettyJson;
      processedContent += '\n```\n\n';
      
      // Save the full JSON as an artifact file
      artifactFiles.push({
        filename: jsonFilename,
        content: prettyJson
      });
    }
  });
  
  return { processedContent, artifactFiles };
}

/**
 * Extract JSON from content and return structured data
 */
function extractJsonFromContent(content: string): Array<{json: any, raw: string}> {
  const jsonItems: Array<{json: any, raw: string}> = [];
  
  // First, check for JSON in code blocks (handle optional spaces after json)
  const codeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const codeContent = match[1].trim();
    try {
      const parsed = JSON.parse(codeContent);
      jsonItems.push({ json: parsed, raw: codeContent });
    } catch (e) {
      // Not valid JSON, skip
    }
  }
  
  // Then check for inline JSON (not in code blocks)
  const jsonRegex = /(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\])/g;
  const contentWithoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');
  const matches = contentWithoutCodeBlocks.match(jsonRegex);
  
  if (matches) {
    matches.forEach(match => {
      try {
        const parsed = JSON.parse(match);
        jsonItems.push({ json: parsed, raw: match });
      } catch (e) {
        // Not valid JSON, skip
      }
    });
  }
  
  return jsonItems;
}

/**
 * Show chats that contain JSON with their JSON content
 */
export function showChatsWithJson(conversations: ConversationData[]): Array<{
  title: string;
  id: string;
  date: string;
  jsonItems: Array<{json: any, raw: string}>
}> {
  const chatsWithJson: Array<{
    title: string;
    id: string; 
    date: string;
    jsonItems: Array<{json: any, raw: string}>
  }> = [];
  
  conversations.forEach(conversation => {
    const allJsonItems: Array<{json: any, raw: string}> = [];
    
    // Check all messages for JSON
    conversation.messages.forEach(message => {
      const jsonItems = extractJsonFromContent(message.content);
      allJsonItems.push(...jsonItems);
    });
    
    if (allJsonItems.length > 0) {
      const firstMessage = conversation.messages[0];
      const date = firstMessage ? new Date(firstMessage.timestamp).toLocaleDateString() : 'Unknown';
      
      chatsWithJson.push({
        title: conversation.title || 'Untitled Chat',
        id: conversation.id,
        date,
        jsonItems: allJsonItems
      });
    }
  });
  
  return chatsWithJson;
}

/**
 * Unescape JSON string content for readable display
 */
function unescapeJsonContent(content: string): string {
  return content
    .replace(/\\n/g, '\n')           // Convert \n to actual newlines
    .replace(/\\t/g, '\t')           // Convert \t to actual tabs
    .replace(/\\r/g, '\r')           // Convert \r to actual carriage returns
    .replace(/\\"/g, '"')            // Convert \" to actual quotes
    .replace(/\\\\/g, '\\');         // Convert \\ to actual backslashes
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