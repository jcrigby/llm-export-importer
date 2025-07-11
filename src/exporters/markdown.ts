/**
 * Markdown Exporter for LLM Export Importer
 * 
 * Exports classified writing conversations into organized markdown collections.
 * Creates structured directories with conversation files, project summaries,
 * and metadata for easy browsing and further processing.
 */

import { join, resolve } from 'path';
import { ConversationData, ClassificationResult } from '../classification/pipeline.js';
import { FileHandler } from '../utils/file-handler.js';

export interface MarkdownExportOptions {
  outputDir: string;
  organizeByProject?: boolean;
  organizeByCategory?: boolean;
  includeMetadata?: boolean;
  includeTimestamps?: boolean;
  createIndex?: boolean;
  filenameTemplate?: string;
}

export interface ExportedProject {
  name: string;
  path: string;
  category: string;
  conversationCount: number;
  totalMessages: number;
  estimatedWords: number;
  conversations: ConversationData[];
  classifications: ClassificationResult[];
}

export interface ExportSummary {
  totalConversations: number;
  writingConversations: number;
  projects: ExportedProject[];
  outputDirectory: string;
  exportTime: string;
  categoryCounts: Record<string, number>;
}

/**
 * Markdown exporter with flexible organization options
 */
export class MarkdownExporter {
  
  /**
   * Export conversations to organized markdown structure
   */
  static async export(
    conversations: ConversationData[],
    classifications: ClassificationResult[],
    options: MarkdownExportOptions
  ): Promise<ExportSummary> {
    
    // Validate output directory
    FileHandler.validateOutputPath(options.outputDir);
    await FileHandler.ensureDirectory(options.outputDir);

    // Filter to writing content only
    const writingResults = classifications.filter(c => c.isWriting);
    const writingConversations = writingResults.map(result => 
      conversations.find(conv => conv.id === result.id)!
    );

    console.log(`📝 Exporting ${writingConversations.length} writing conversations...`);

    let projects: ExportedProject[];

    if (options.organizeByProject) {
      projects = await this.organizeByProjects(
        writingConversations, 
        writingResults, 
        options
      );
    } else if (options.organizeByCategory) {
      projects = await this.organizeByCategories(
        writingConversations, 
        writingResults, 
        options
      );
    } else {
      // Flat organization - all conversations in one place
      projects = await this.organizeFlatStructure(
        writingConversations, 
        writingResults, 
        options
      );
    }

    // Create index file if requested
    if (options.createIndex) {
      await this.createIndexFile(projects, options.outputDir);
    }

    // Generate export summary
    const summary: ExportSummary = {
      totalConversations: conversations.length,
      writingConversations: writingConversations.length,
      projects,
      outputDirectory: resolve(options.outputDir),
      exportTime: new Date().toISOString(),
      categoryCounts: this.calculateCategoryCounts(writingResults)
    };

    // Write summary file
    if (options.includeMetadata) {
      await this.writeSummaryFile(summary, options.outputDir);
    }

    return summary;
  }

  /**
   * Organize conversations by detected projects/themes
   */
  private static async organizeByProjects(
    conversations: ConversationData[],
    classifications: ClassificationResult[],
    options: MarkdownExportOptions
  ): Promise<ExportedProject[]> {
    
    // Group conversations by theme/topic
    const projectGroups = this.detectProjects(conversations, classifications);
    const projects: ExportedProject[] = [];

    for (const [projectName, items] of projectGroups) {
      const projectPath = await FileHandler.createProjectStructure(
        options.outputDir,
        projectName
      );

      // Write individual conversation files
      for (let i = 0; i < items.conversations.length; i++) {
        const conv = items.conversations[i];
        const classification = items.classifications[i];
        
        const filename = this.generateFilename(conv, i + 1, options.filenameTemplate);
        const filePath = join(projectPath, 'conversations', `${filename}.md`);
        
        const markdown = this.conversationToMarkdown(conv, classification, options);
        await FileHandler.writeFile(filePath, markdown);
      }

      // Create project README
      await this.createProjectReadme(projectPath, projectName, items);

      projects.push({
        name: projectName,
        path: projectPath,
        category: items.classifications[0]?.category || 'unknown',
        conversationCount: items.conversations.length,
        totalMessages: items.conversations.reduce((sum, c) => sum + c.messages.length, 0),
        estimatedWords: this.estimateWordCount(items.conversations),
        conversations: items.conversations,
        classifications: items.classifications
      });
    }

    return projects;
  }

  /**
   * Organize conversations by classification category
   */
  private static async organizeByCategories(
    conversations: ConversationData[],
    classifications: ClassificationResult[],
    options: MarkdownExportOptions
  ): Promise<ExportedProject[]> {
    
    const categoryGroups = new Map<string, { conversations: ConversationData[], classifications: ClassificationResult[] }>();

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      const classification = classifications[i];
      const category = classification.category;

      if (!categoryGroups.has(category)) {
        categoryGroups.set(category, { conversations: [], classifications: [] });
      }

      categoryGroups.get(category)!.conversations.push(conv);
      categoryGroups.get(category)!.classifications.push(classification);
    }

    const projects: ExportedProject[] = [];

    for (const [category, items] of categoryGroups) {
      const categoryPath = join(options.outputDir, this.formatCategoryName(category));
      await FileHandler.ensureDirectory(categoryPath);

      // Write conversation files
      for (let i = 0; i < items.conversations.length; i++) {
        const conv = items.conversations[i];
        const classification = items.classifications[i];
        
        const filename = this.generateFilename(conv, i + 1, options.filenameTemplate);
        const filePath = join(categoryPath, `${filename}.md`);
        
        const markdown = this.conversationToMarkdown(conv, classification, options);
        await FileHandler.writeFile(filePath, markdown);
      }

      projects.push({
        name: this.formatCategoryName(category),
        path: categoryPath,
        category,
        conversationCount: items.conversations.length,
        totalMessages: items.conversations.reduce((sum, c) => sum + c.messages.length, 0),
        estimatedWords: this.estimateWordCount(items.conversations),
        conversations: items.conversations,
        classifications: items.classifications
      });
    }

    return projects;
  }

  /**
   * Flat organization - all conversations in output directory
   */
  private static async organizeFlatStructure(
    conversations: ConversationData[],
    classifications: ClassificationResult[],
    options: MarkdownExportOptions
  ): Promise<ExportedProject[]> {
    
    // Write all conversations to the output directory
    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      const classification = classifications[i];
      
      const filename = this.generateFilename(conv, i + 1, options.filenameTemplate);
      const filePath = join(options.outputDir, `${filename}.md`);
      
      const markdown = this.conversationToMarkdown(conv, classification, options);
      await FileHandler.writeFile(filePath, markdown);
    }

    if (conversations.length === 0) {
      return [];
    }

    return [{
      name: 'All Writing Conversations',
      path: options.outputDir,
      category: 'mixed',
      conversationCount: conversations.length,
      totalMessages: conversations.reduce((sum, c) => sum + c.messages.length, 0),
      estimatedWords: this.estimateWordCount(conversations),
      conversations,
      classifications
    }];
  }

  /**
   * Convert a conversation to markdown format
   */
  private static conversationToMarkdown(
    conversation: ConversationData,
    classification: ClassificationResult,
    options: MarkdownExportOptions
  ): string {
    const lines: string[] = [];

    // Title and metadata
    lines.push(`# ${conversation.title}`);
    lines.push('');

    if (options.includeMetadata) {
      lines.push('## Metadata');
      lines.push(`- **Platform**: ${conversation.platform}`);
      lines.push(`- **Category**: ${classification.category}`);
      lines.push(`- **Quality**: ${classification.quality}`);
      lines.push(`- **Confidence**: ${(classification.confidence * 100).toFixed(1)}%`);
      if (classification.reasoning) {
        lines.push(`- **Classification**: ${classification.reasoning}`);
      }
      lines.push(`- **Messages**: ${conversation.messages.length}`);
      lines.push('');
    }

    // Conversation content
    lines.push('## Conversation');
    lines.push('');

    for (const message of conversation.messages) {
      const role = this.formatRole(message.role);
      
      if (options.includeTimestamps) {
        const timestamp = new Date(message.timestamp).toLocaleString();
        lines.push(`### ${role} *(${timestamp})*`);
      } else {
        lines.push(`### ${role}`);
      }
      
      lines.push('');
      lines.push(message.content);
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push('*Generated by LLM Export Importer*');

    return lines.join('\n');
  }

  /**
   * Generate appropriate filename for a conversation
   */
  private static generateFilename(
    conversation: ConversationData,
    index: number,
    template?: string
  ): string {
    if (template) {
      return template
        .replace('{index}', index.toString().padStart(3, '0'))
        .replace('{title}', FileHandler.sanitizeFilename(conversation.title))
        .replace('{platform}', conversation.platform);
    }

    // Default template
    const sanitizedTitle = FileHandler.sanitizeFilename(conversation.title);
    return `${index.toString().padStart(3, '0')}-${sanitizedTitle}`;
  }

  /**
   * Detect projects by grouping related conversations
   */
  private static detectProjects(
    conversations: ConversationData[],
    classifications: ClassificationResult[]
  ): Map<string, { conversations: ConversationData[], classifications: ClassificationResult[] }> {
    
    const projects = new Map<string, { conversations: ConversationData[], classifications: ClassificationResult[] }>();

    for (let i = 0; i < conversations.length; i++) {
      const conv = conversations[i];
      const classification = classifications[i];
      
      // Simple project detection based on title keywords and category
      const projectName = this.extractProjectName(conv, classification);

      if (!projects.has(projectName)) {
        projects.set(projectName, { conversations: [], classifications: [] });
      }

      projects.get(projectName)!.conversations.push(conv);
      projects.get(projectName)!.classifications.push(classification);
    }

    return projects;
  }

  /**
   * Extract project name from conversation and classification
   */
  private static extractProjectName(
    conversation: ConversationData,
    classification: ClassificationResult
  ): string {
    const title = conversation.title.toLowerCase();
    
    // Look for common project indicators
    if (title.includes('novel') || title.includes('book')) return 'Novel Project';
    if (title.includes('screenplay') || title.includes('script')) return 'Screenplay Project';
    if (title.includes('article') || title.includes('blog')) return 'Article Writing';
    if (title.includes('poem') || title.includes('poetry')) return 'Poetry Collection';
    if (title.includes('character') && classification.category === 'fiction') return 'Character Development';
    if (title.includes('dialogue') && classification.category === 'fiction') return 'Dialogue Work';
    
    // Fallback to category-based grouping
    return `${classification.category.charAt(0).toUpperCase() + classification.category.slice(1)} Writing`;
  }

  /**
   * Helper methods
   */
  private static formatRole(role: string): string {
    switch (role) {
      case 'user':
      case 'human':
        return 'Human';
      case 'assistant':
        return 'Assistant';
      case 'model':
        return 'AI';
      default:
        return role.charAt(0).toUpperCase() + role.slice(1);
    }
  }

  private static formatCategoryName(category: string): string {
    return category.replace('-', ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private static estimateWordCount(conversations: ConversationData[]): number {
    const totalChars = conversations.reduce((sum, conv) => 
      sum + conv.messages.reduce((msgSum, msg) => msgSum + msg.content.length, 0), 0
    );
    return Math.ceil(totalChars / 5); // ~5 characters per word
  }

  private static calculateCategoryCounts(classifications: ClassificationResult[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const classification of classifications) {
      counts[classification.category] = (counts[classification.category] || 0) + 1;
    }
    return counts;
  }

  private static async createProjectReadme(
    projectPath: string,
    projectName: string,
    items: { conversations: ConversationData[], classifications: ClassificationResult[] }
  ): Promise<void> {
    const readmePath = join(projectPath, 'README.md');
    const totalMessages = items.conversations.reduce((sum, c) => sum + c.messages.length, 0);
    const estimatedWords = this.estimateWordCount(items.conversations);

    const content = `# ${projectName}

## Project Overview
- **Conversations**: ${items.conversations.length}
- **Total Messages**: ${totalMessages}
- **Estimated Words**: ${estimatedWords.toLocaleString()}
- **Primary Category**: ${items.classifications[0]?.category || 'unknown'}

## Conversations
${items.conversations.map((conv, i) => `${i + 1}. [${conv.title}](conversations/${this.generateFilename(conv, i + 1)}.md)`).join('\n')}

## Classification Details
${items.classifications.map(c => `- **${c.category}** (${(c.confidence * 100).toFixed(0)}% confidence): ${c.reasoning || 'AI classified'}`).join('\n')}

---
*Generated by LLM Export Importer*
`;

    await FileHandler.writeFile(readmePath, content);
  }

  private static async createIndexFile(projects: ExportedProject[], outputDir: string): Promise<void> {
    const indexPath = join(outputDir, 'INDEX.md');
    const totalConversations = projects.reduce((sum, p) => sum + p.conversationCount, 0);
    const totalWords = projects.reduce((sum, p) => sum + p.estimatedWords, 0);

    const content = `# Writing Export Index

Generated on: ${new Date().toLocaleString()}

## Summary
- **Total Projects**: ${projects.length}
- **Total Conversations**: ${totalConversations}
- **Estimated Total Words**: ${totalWords.toLocaleString()}

## Projects

${projects.map(project => `### [${project.name}](${project.path.split('/').pop()})
- **Category**: ${project.category}
- **Conversations**: ${project.conversationCount}
- **Messages**: ${project.totalMessages}
- **Estimated Words**: ${project.estimatedWords.toLocaleString()}
`).join('\n')}

---
*Generated by LLM Export Importer*
`;

    await FileHandler.writeFile(indexPath, content);
  }

  private static async writeSummaryFile(summary: ExportSummary, outputDir: string): Promise<void> {
    const summaryPath = join(outputDir, 'export-summary.json');
    await FileHandler.writeJsonFile(summaryPath, summary);
  }
}