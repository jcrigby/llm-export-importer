#!/usr/bin/env node

/**
 * LLM Export Importer CLI Entry Point
 *
 * Command-line interface for extracting and organizing writing content
 * from AI chat platform exports (ChatGPT, Claude, Gemini, Perplexity).
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { parseExport } from '../parsers/index.js';
import { packageInfo } from '../utils/package-info.js';
import { ClassificationPipeline } from '../classification/pipeline.js';
import { MarkdownExporter } from '../exporters/markdown.js';
import { FileHandler, FileWriteResult } from '../utils/file-handler.js';
import { DeduplicationManager } from '../organizers/deduplication-manager.js';
import { ZipHandler } from '../utils/zip-handler.js';

const program = new Command();

// Configure the main command
program
  .name('llm-import')
  .description('Extract and organize writing content from AI chat platform exports')
  .version(packageInfo.version)
  .configureOutput({
    outputError: (str, write) => write(chalk.red(str)),
  });

// Main import command
program
  .command('import')
  .alias('i')
  .description('Import and process AI chat export files')
  .argument('<file>', 'Export file path (JSON format)')
  .option('-p, --platform <platform>', 'Force platform type (chatgpt|claude|gemini|perplexity)')
  .option('-o, --output <dir>', 'Output directory', './imported-writing')
  .option('-f, --format <format>', 'Output format (markdown|writer-cli|scrivener|json)', 'markdown')
  .option('--writing-only', 'Filter to only writing-related content')
  .option('--min-confidence <number>', 'Minimum classification confidence (0-1)', '0.7')
  .option('--interactive', 'Interactive mode with manual review')
  .option('--dry-run', 'Show what would be processed without creating output')
  .option('--dedupe-strategy <strategy>', 'Deduplication strategy (keep-all|keep-latest|keep-best|merge-versions)', 'keep-all')
  .option('--similarity-threshold <number>', 'Similarity threshold for iterations (0-1)', '0.6')
  .option('--duplicate-threshold <number>', 'Threshold for marking as duplicate (0-1)', '0.8')
  .option('--group-iterations', 'Group related conversations into version chains')
  .option('--preserve-timeline', 'Preserve chronological order in version chains')
  .option('-v, --verbose', 'Show detailed processing information')
  .option('--force', 'Overwrite existing output files')
  .option('--after <date>', 'Only import conversations after this date (YYYY-MM-DD)')
  .option('--before <date>', 'Only import conversations before this date (YYYY-MM-DD)')
  .option('--last <number>', 'Only import the last N conversations')
  .option('--first <number>', 'Only import the first N conversations')
  .option('--sample <number>', 'Import a random sample of N conversations')
  .option('--contains <text>', 'Only import conversations containing this text')
  .option('--duplicates <strategy>', 'How to handle duplicate files (error|skip|rename)', 'rename')
  .option('--extract-creative', 'Extract creative writing content into separate files')
  .action(async (file, options) => {
    try {
      await handleImportCommand(file, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Auto-detect command
program
  .command('detect')
  .description('Detect the platform type of an export file')
  .argument('<file>', 'Export file path')
  .action(async file => {
    try {
      await handleDetectCommand(file);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Info command
program
  .command('info')
  .description('Show information about an export file')
  .argument('<file>', 'Export file path')
  .option('--summary', 'Show quick summary for large exports')
  .action(async (file, options) => {
    try {
      await handleInfoCommand(file, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Search command
program
  .command('search')
  .alias('s')
  .description('Search across conversations, projects, and artifacts')
  .argument('<query>', 'Search term or phrase')
  .option('-c, --conversations <file>', 'Conversations JSON file')
  .option('-p, --projects <file>', 'Projects JSON file') 
  .option('--case-sensitive', 'Case sensitive search')
  .option('--tree', 'Show results in ASCII tree format')
  .action(async (query, options) => {
    try {
      await handleSearchCommand(query, options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Config command
program
  .command('config')
  .description('Manage configuration settings')
  .option('--openrouter-key <key>', 'Set OpenRouter API key')
  .option('--show', 'Show current configuration')
  .action(async options => {
    try {
      await handleConfigCommand(options);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Set default command to import if file is provided directly
if (
  process.argv.length > 2 &&
  !process.argv[2].startsWith('-') &&
  process.argv[2] !== 'detect' &&
  process.argv[2] !== 'info' &&
  process.argv[2] !== 'config'
) {
  // Check if the argument looks like a file path
  const potentialFile = process.argv[2];
  if (potentialFile.endsWith('.json') || existsSync(potentialFile)) {
    // Insert 'import' command
    process.argv.splice(2, 0, 'import');
  }
}

async function handleImportCommand(file: string, options: any) {
  console.log(chalk.blue('LLM Export Importer'));
  console.log(chalk.gray('Extracting writing content from AI chat exports\n'));

  // Validate file exists
  if (!existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  let data: any;
  let cleanup: (() => Promise<void>) | null = null;

  try {
    // Check if it's a zip file and auto-extract
    if (ZipHandler.isZipFile(file)) {
      console.log(chalk.cyan('📦 Detected zip file, extracting...'));
      const extraction = await ZipHandler.autoExtractExportData(file);
      console.log(chalk.gray(`📄 Found export data: ${extraction.fileName}`));
      
      data = JSON.parse(extraction.content);
      cleanup = extraction.cleanup;
    } else {
      // Load and parse the export file normally
      console.log(chalk.cyan('📁 Loading export file...'));
      data = JSON.parse(readFileSync(file, 'utf-8'));
    }
  } catch (error) {
    if (cleanup) {
      await cleanup();
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in file: ${file}. ${error.message}`);
    }
    throw error;
  }

  console.log(chalk.cyan('🔍 Detecting platform...'));
  const result = parseExport(data);

  console.log(chalk.green(`✅ Successfully parsed ${result.conversations.length} conversations`));
  console.log(chalk.gray(`Platform: ${result.metadata.platform}`));
  console.log(
    chalk.gray(
      `Date range: ${result.metadata.dateRange.earliest.split('T')[0]} to ${result.metadata.dateRange.latest.split('T')[0]}`
    )
  );

  // Apply filtering before processing
  let filteredConversations = result.conversations;
  const originalCount = filteredConversations.length;

  filteredConversations = applyFilters(filteredConversations, options);

  if (filteredConversations.length !== originalCount) {
    console.log(chalk.yellow(`🔍 Filtered to ${filteredConversations.length} conversations (from ${originalCount})`));
  }

  if (filteredConversations.length === 0) {
    console.log(chalk.yellow('⚠️  No conversations match the specified filters.'));
    return;
  }

  // Update result with filtered conversations
  result.conversations = filteredConversations;
  result.metadata.totalConversations = filteredConversations.length;

  if (options.dryRun) {
    console.log(chalk.yellow('\n🔍 Dry run - showing what would be processed:'));
    result.conversations.forEach((conv, index) => {
      console.log(chalk.gray(`${index + 1}. ${conv.title} (${conv.messages.length} messages)`));
    });
    return;
  }

  // Classification pipeline
  if (options.writingOnly) {
    console.log(chalk.cyan('\n🤖 Starting content classification...'));
    
    // Use a default model for now (TODO: integrate model optimization)
    const model = 'gpt-3.5-turbo'; // This would normally come from model optimization
    const pipeline = new ClassificationPipeline(model);
    
    try {
      const classifications = await pipeline.processConversations(result.conversations);
      
      // Filter to writing content only if requested
      const writingResults = classifications.filter(c => 
        c.isWriting && c.confidence >= parseFloat(options.minConfidence || '0.7')
      );
      
      console.log(chalk.green(`📝 Found ${writingResults.length} writing conversations`));
      
      if (writingResults.length === 0) {
        console.log(chalk.yellow('No writing content found meeting criteria. Try lowering --min-confidence or removing --writing-only'));
        return;
      }

      // Export to selected format
      await exportResults(result.conversations, classifications, options);
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('OPENROUTER_API_KEY')) {
        console.log(chalk.yellow('\n⚠️  No API key found for classification.'));
        console.log(chalk.gray('Set OPENROUTER_API_KEY environment variable to enable AI classification.'));
        console.log(chalk.gray('For now, exporting all conversations without classification...\n'));
        
        // Export without classification
        const mockClassifications = result.conversations.map(conv => ({
          id: conv.id,
          isWriting: true,
          confidence: 1.0,
          category: 'casual' as const,
          quality: 'draft' as const,
          reasoning: 'No classification - exported all content'
        }));
        
        await exportResults(result.conversations, mockClassifications, options);
      } else {
        if (cleanup) {
          await cleanup();
        }
        throw error;
      }
    }
  } else {
    // Skip classification, export all conversations
    console.log(chalk.cyan('\n📁 Exporting all conversations without classification...'));
    
    const allClassifications = result.conversations.map(conv => ({
      id: conv.id,
      isWriting: true,
      confidence: 1.0,
      category: 'casual' as const,
      quality: 'draft' as const,
      reasoning: 'No classification applied'
    }));
    
    await exportResults(result.conversations, allClassifications, options);
  }
  
  // Clean up temporary files if we extracted from zip
  if (cleanup) {
    await cleanup();
  }
}

async function exportResults(conversations: any[], classifications: any[], options: any) {
  const outputDir = options.output || './imported-writing';
  
  // Validate and prepare output directory
  console.log(chalk.cyan(`📂 Preparing output directory: ${outputDir}`));
  await FileHandler.ensureDirectory(outputDir);

  // Apply deduplication processing
  console.log(chalk.cyan('🔄 Analyzing conversations for deduplication...'));
  
  let finalConversations = conversations;
  let finalClassifications = classifications;
  let versionChains: any[] = [];

  const deduplicationStrategy = options.dedupeStrategy || 'keep-all';
  const isDeduplicationActive = options.groupIterations || deduplicationStrategy !== 'keep-all';

  if (isDeduplicationActive) {
    console.log(chalk.gray(`📋 Strategy: ${deduplicationStrategy}, Group iterations: ${options.groupIterations ? 'enabled' : 'disabled'}`));
    
    const deduplicationManager = new DeduplicationManager();
    const deduplicationOptions = {
      strategy: deduplicationStrategy,
      similarityThreshold: parseFloat(options.similarityThreshold || '0.6'),
      duplicateThreshold: parseFloat(options.duplicateThreshold || '0.8'),
      preserveTimeline: options.preserveTimeline || true,
      groupIterations: options.groupIterations || false,
      verbose: options.verbose || false
    };

    const deduplicationResult = await deduplicationManager.processConversations(
      conversations,
      classifications,
      deduplicationOptions
    );

    finalConversations = deduplicationResult.keptConversations;
    finalClassifications = deduplicationResult.keptClassifications;
    versionChains = deduplicationResult.versionChains;

    // Log deduplication results
    if (deduplicationResult.duplicatesRemoved > 0) {
      console.log(chalk.yellow(`📊 Removed ${deduplicationResult.duplicatesRemoved} duplicate/redundant conversations`));
    } else {
      console.log(chalk.green(`✅ No duplicate conversations found`));
    }
    
    if (deduplicationResult.versionChainsCreated > 0) {
      console.log(chalk.green(`🔗 Created ${deduplicationResult.versionChainsCreated} version chains`));
    }
  } else {
    console.log(chalk.gray(`📋 Strategy: ${deduplicationStrategy} - keeping all ${conversations.length} conversations as separate files`));
  }
  
  switch (options.format) {
    case 'markdown':
    default:
      console.log(chalk.cyan('📝 Exporting to Markdown format...'));
      
      // Progress tracking
      let written = 0;
      let skipped = 0;
      let renamed = 0;
      
      const exportOptions = {
        outputDir,
        organizeByProject: true,
        includeMetadata: true,
        includeTimestamps: false,
        createIndex: true,
        includeVersionChains: versionChains.length > 0,
        versionChains: versionChains,
        force: options.force || false,
        handleDuplicates: options.duplicates || 'rename',
        extractCreative: options.extractCreative || false,
        onProgress: (result: FileWriteResult) => {
          if (result.status === 'written') {
            process.stdout.write(chalk.green('.'));
            written++;
          } else if (result.status === 'skipped') {
            process.stdout.write(chalk.yellow('-'));
            skipped++;
          } else if (result.status === 'renamed') {
            process.stdout.write(chalk.cyan('d'));
            renamed++;
          }
        }
      };
      
      const summary = await MarkdownExporter.export(finalConversations, finalClassifications, exportOptions);
      
      console.log(chalk.green('\n✅ Export completed successfully!'));
      if (written > 0 || skipped > 0 || renamed > 0) {
        console.log(chalk.gray(`📊 File operations: ${written} written (.), ${skipped} skipped (-), ${renamed} duplicates (d)`));
      }
      console.log(chalk.gray(`📁 Output directory: ${summary.outputDirectory}`));
      console.log(chalk.gray(`📝 Writing conversations: ${summary.writingConversations}/${summary.totalConversations}`));
      console.log(chalk.gray(`📂 Projects created: ${summary.projects.length}`));
      
      // Show project breakdown
      if (summary.projects.length > 0) {
        console.log(chalk.cyan('\n📊 Project Summary:'));
        summary.projects.forEach(project => {
          console.log(chalk.gray(`  • ${project.name}: ${project.conversationCount} conversations (${project.estimatedWords.toLocaleString()} words)`));
        });
      }
      
      // Show category breakdown
      const categoryEntries = Object.entries(summary.categoryCounts);
      if (categoryEntries.length > 0) {
        console.log(chalk.cyan('\n🏷️  Category Breakdown:'));
        categoryEntries.forEach(([category, count]) => {
          console.log(chalk.gray(`  • ${category}: ${count} conversations`));
        });
      }
      
      console.log(chalk.blue(`\n🎉 Check your organized writing in: ${outputDir}`));
      break;
      
    // TODO: Add other export formats
    case 'writer-cli':
      console.log(chalk.yellow('Writer CLI format not yet implemented. Using Markdown instead.'));
      // Fall through to markdown for now
      break;
      
    case 'scrivener':
      console.log(chalk.yellow('Scrivener format not yet implemented. Using Markdown instead.'));
      // Fall through to markdown for now
      break;
      
    case 'json':
      console.log(chalk.cyan('📄 Exporting to JSON format...'));
      const jsonPath = `${outputDir}/export-data.json`;
      const jsonResult = await FileHandler.writeJsonFile(jsonPath, {
        conversations: finalConversations,
        classifications: finalClassifications,
        versionChains: versionChains,
        exportTime: new Date().toISOString()
      }, {
        overwrite: options.force || false,
        handleDuplicates: options.duplicates || 'rename'
      });
      console.log(chalk.green(`✅ JSON export saved to: ${jsonResult.path}`));
      break;
  }
}

async function handleDetectCommand(file: string) {
  if (!existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  console.log(chalk.cyan('🔍 Detecting platform type...'));

  const data = JSON.parse(readFileSync(file, 'utf-8'));
  const result = parseExport(data);

  console.log(chalk.green(`Platform: ${result.metadata.platform}`));
  console.log(chalk.gray(`Conversations: ${result.metadata.totalConversations}`));
  console.log(chalk.gray(`Export version: ${result.metadata.exportVersion}`));
}

async function handleInfoCommand(file: string, options: any = {}) {
  if (!existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  console.log(chalk.cyan('📊 Analyzing export file...'));

  let data: any;
  let cleanup: (() => Promise<void>) | null = null;

  try {
    if (ZipHandler.isZipFile(file)) {
      console.log(chalk.gray('📦 Extracting from zip...'));
      const extraction = await ZipHandler.autoExtractExportData(file);
      data = JSON.parse(extraction.content);
      cleanup = extraction.cleanup;
    } else {
      data = JSON.parse(readFileSync(file, 'utf-8'));
    }

    const result = parseExport(data);

    if (options.summary) {
      await showQuickSummary(result);
    } else {
      await showDetailedInfo(result);
    }

    if (cleanup) {
      await cleanup();
    }
  } catch (error) {
    if (cleanup) {
      await cleanup();
    }
    throw error;
  }
}

async function showQuickSummary(result: any) {
  console.log(chalk.green('📋 Quick Summary:'));
  console.log(`Platform: ${result.metadata.platform}`);
  console.log(`Total conversations: ${result.metadata.totalConversations.toLocaleString()}`);
  
  const totalMessages = result.conversations.reduce((sum: number, conv: any) => sum + conv.messages.length, 0);
  console.log(`Total messages: ${totalMessages.toLocaleString()}`);
  
  const dateRange = `${result.metadata.dateRange.earliest.split('T')[0]} to ${result.metadata.dateRange.latest.split('T')[0]}`;
  console.log(`Date range: ${dateRange}`);

  // Quick size recommendations
  if (result.metadata.totalConversations > 1000) {
    console.log(chalk.yellow('\n💡 Large export detected! Consider using filters:'));
    console.log(chalk.gray('  --last 100           # Import last 100 conversations'));
    console.log(chalk.gray('  --after 2025-06-01   # Import only recent conversations'));
    console.log(chalk.gray('  --contains "novel"   # Import only conversations about novels'));
    console.log(chalk.gray('  --sample 50          # Import random sample of 50'));
  }

  // Show monthly distribution for large exports
  if (result.metadata.totalConversations > 100) {
    console.log(chalk.cyan('\n📅 Monthly Distribution:'));
    const monthlyStats = getMonthlyDistribution(result.conversations);
    Object.entries(monthlyStats)
      .sort()
      .slice(-6) // Last 6 months
      .forEach(([month, count]: [string, any]) => {
        console.log(`  ${month}: ${count} conversations`);
      });
  }
}

async function showDetailedInfo(result: any) {
  console.log(chalk.green('Export Information:'));
  console.log(`Platform: ${result.metadata.platform}`);
  console.log(`Total conversations: ${result.metadata.totalConversations}`);
  console.log(
    `Date range: ${result.metadata.dateRange.earliest.split('T')[0]} to ${result.metadata.dateRange.latest.split('T')[0]}`
  );
  console.log(`Export version: ${result.metadata.exportVersion || 'unknown'}`);

  // Message statistics
  const totalMessages = result.conversations.reduce((sum: number, conv: any) => sum + conv.messages.length, 0);
  const avgMessages = Math.round(totalMessages / result.conversations.length);

  console.log(`\nMessage Statistics:`);
  console.log(`Total messages: ${totalMessages}`);
  console.log(`Average per conversation: ${avgMessages}`);

  // Top conversations by message count
  const topConversations = result.conversations
    .sort((a: any, b: any) => b.messages.length - a.messages.length)
    .slice(0, 5);

  console.log(`\nTop conversations by message count:`);
  topConversations.forEach((conv: any, index: number) => {
    const title = conv.title.length > 50 ? conv.title.substring(0, 50) + '...' : conv.title;
    console.log(`${index + 1}. ${title} (${conv.messages.length} messages)`);
  });
}

function getMonthlyDistribution(conversations: any[]): Record<string, number> {
  const monthly: Record<string, number> = {};
  
  conversations.forEach(conv => {
    if (conv.messages.length > 0) {
      const date = new Date(conv.messages[0].timestamp);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      monthly[monthKey] = (monthly[monthKey] || 0) + 1;
    }
  });
  
  return monthly;
}

async function handleSearchCommand(query: string, options: any) {
  console.log(chalk.blue('🔍 Claude Workspace Search'));
  console.log(chalk.gray(`Searching for: "${query}"\n`));

  const results: SearchResult[] = [];
  
  // Search conversations if provided
  if (options.conversations) {
    if (!existsSync(options.conversations)) {
      throw new Error(`Conversations file not found: ${options.conversations}`);
    }
    
    let conversationsData: any;
    let cleanup: (() => Promise<void>) | null = null;

    try {
      if (ZipHandler.isZipFile(options.conversations)) {
        console.log(chalk.gray('📦 Extracting conversations from zip...'));
        const extraction = await ZipHandler.autoExtractExportData(options.conversations);
        conversationsData = JSON.parse(extraction.content);
        cleanup = extraction.cleanup;
      } else {
        conversationsData = JSON.parse(readFileSync(options.conversations, 'utf-8'));
      }
      
      const conversationResults = await searchConversations(query, conversationsData, options);
      results.push(...conversationResults);
      
      if (cleanup) {
        await cleanup();
      }
    } catch (error) {
      if (cleanup) {
        await cleanup();
      }
      throw error;
    }
  }

  // Search projects if provided
  if (options.projects) {
    if (!existsSync(options.projects)) {
      throw new Error(`Projects file not found: ${options.projects}`);
    }
    
    const projectsData = JSON.parse(readFileSync(options.projects, 'utf-8'));
    const projectResults = await searchProjects(query, projectsData, options);
    results.push(...projectResults);
  }

  if (results.length === 0) {
    console.log(chalk.yellow('No results found.'));
    return;
  }

  // Display results
  console.log(chalk.green(`Found ${results.length} results:\n`));
  
  if (options.tree) {
    displayResultsAsTree(results);
  } else {
    displayResultsList(results);
  }
}

interface SearchResult {
  type: 'conversation' | 'project' | 'project-doc';
  id: string;
  title: string;
  matches: Array<{
    context: string;
    line?: number;
    snippet: string;
  }>;
  parent?: {
    type: string;
    id: string;
    title: string;
  };
  created_at?: string;
}

async function searchConversations(query: string, data: any[], options: any): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const searchTerm = options.caseSensitive ? query : query.toLowerCase();

  for (const conv of data) {
    const matches: SearchResult['matches'] = [];
    
    // Search conversation title
    const title = options.caseSensitive ? conv.name : conv.name.toLowerCase();
    if (title.includes(searchTerm)) {
      matches.push({
        context: 'title',
        snippet: conv.name
      });
    }

    // Search message content
    if (conv.chat_messages) {
      conv.chat_messages.forEach((msg: any, index: number) => {
        const text = options.caseSensitive ? msg.text : msg.text.toLowerCase();
        if (text.includes(searchTerm)) {
          const snippet = msg.text.length > 100 
            ? msg.text.substring(0, 100) + '...'
            : msg.text;
          matches.push({
            context: `message from ${msg.sender}`,
            line: index + 1,
            snippet
          });
        }
      });
    }

    if (matches.length > 0) {
      results.push({
        type: 'conversation',
        id: conv.uuid,
        title: conv.name,
        matches,
        created_at: conv.created_at
      });
    }
  }

  return results;
}

async function searchProjects(query: string, data: any[], options: any): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const searchTerm = options.caseSensitive ? query : query.toLowerCase();

  for (const project of data) {
    const projectMatches: SearchResult['matches'] = [];
    
    // Search project name and description
    const name = options.caseSensitive ? project.name : project.name.toLowerCase();
    const desc = options.caseSensitive ? (project.description || '') : (project.description || '').toLowerCase();
    
    if (name.includes(searchTerm)) {
      projectMatches.push({
        context: 'project name',
        snippet: project.name
      });
    }
    
    if (desc.includes(searchTerm)) {
      projectMatches.push({
        context: 'project description',
        snippet: project.description
      });
    }

    if (projectMatches.length > 0) {
      results.push({
        type: 'project',
        id: project.uuid,
        title: project.name,
        matches: projectMatches,
        created_at: project.created_at
      });
    }

    // Search project documents
    if (project.docs && project.docs.length > 0) {
      for (const doc of project.docs) {
        const docMatches: SearchResult['matches'] = [];
        
        const filename = options.caseSensitive ? doc.filename : doc.filename.toLowerCase();
        const content = options.caseSensitive ? (doc.content || '') : (doc.content || '').toLowerCase();
        
        if (filename.includes(searchTerm)) {
          docMatches.push({
            context: 'filename',
            snippet: doc.filename
          });
        }
        
        if (content.includes(searchTerm)) {
          const lines = doc.content.split('\n');
          lines.forEach((line: string, index: number) => {
            const searchLine = options.caseSensitive ? line : line.toLowerCase();
            if (searchLine.includes(searchTerm)) {
              const snippet = line.length > 100 ? line.substring(0, 100) + '...' : line;
              docMatches.push({
                context: 'document content',
                line: index + 1,
                snippet: snippet.trim()
              });
            }
          });
        }

        if (docMatches.length > 0) {
          results.push({
            type: 'project-doc',
            id: doc.uuid,
            title: doc.filename,
            matches: docMatches,
            parent: {
              type: 'project',
              id: project.uuid,
              title: project.name
            },
            created_at: doc.created_at
          });
        }
      }
    }
  }

  return results;
}

function displayResultsAsTree(results: SearchResult[]) {
  const projectGroups = new Map<string, SearchResult[]>();
  const standaloneResults: SearchResult[] = [];

  // Group results by project
  for (const result of results) {
    if (result.parent) {
      const projectId = result.parent.id;
      if (!projectGroups.has(projectId)) {
        projectGroups.set(projectId, []);
      }
      projectGroups.get(projectId)!.push(result);
    } else {
      standaloneResults.push(result);
    }
  }

  // Display project trees
  for (const [_projectId, projectResults] of projectGroups) {
    const project = projectResults[0].parent!;
    console.log(chalk.blue(`📁 Project: ${project.title}`));
    
    projectResults.forEach((result, index) => {
      const isLast = index === projectResults.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      console.log(chalk.gray(`${prefix}📄 ${result.title}`));
      
      result.matches.forEach((match, matchIndex) => {
        const matchPrefix = isLast ? '    ' : '│   ';
        const bullet = matchIndex === result.matches.length - 1 ? '└─ ' : '├─ ';
        console.log(chalk.gray(`${matchPrefix}${bullet}${match.context}: ${chalk.white(match.snippet)}`));
      });
    });
    console.log();
  }

  // Display standalone results
  if (standaloneResults.length > 0) {
    console.log(chalk.blue('💬 Standalone Conversations:'));
    standaloneResults.forEach((result, index) => {
      const isLast = index === standaloneResults.length - 1;
      const prefix = isLast ? '└── ' : '├── ';
      console.log(chalk.gray(`${prefix}💬 ${result.title}`));
      
      result.matches.forEach((match, matchIndex) => {
        const matchPrefix = isLast ? '    ' : '│   ';
        const bullet = matchIndex === result.matches.length - 1 ? '└─ ' : '├─ ';
        console.log(chalk.gray(`${matchPrefix}${bullet}${match.context}: ${chalk.white(match.snippet)}`));
      });
    });
  }
}

function displayResultsList(results: SearchResult[]) {
  results.forEach((result, index) => {
    console.log(chalk.cyan(`${index + 1}. ${result.title}`));
    if (result.parent) {
      console.log(chalk.gray(`   📁 in project: ${result.parent.title}`));
    }
    console.log(chalk.gray(`   🗓️  ${result.created_at?.split('T')[0] || 'unknown date'}`));
    
    result.matches.forEach(match => {
      console.log(chalk.gray(`   • ${match.context}: ${chalk.white(match.snippet)}`));
    });
    console.log();
  });
}

async function handleConfigCommand(options: any) {
  if (options.openrouterKey) {
    console.log(chalk.yellow('⚠️  Configuration management coming soon!'));
    console.log(chalk.gray('For now, set environment variables:'));
    console.log(chalk.gray('export OPENROUTER_API_KEY=your-key-here'));
    return;
  }

  if (options.show) {
    console.log(chalk.cyan('Current Configuration:'));
    console.log(`OpenRouter API Key: ${process.env.OPENROUTER_API_KEY ? '***set***' : 'not set'}`);
    console.log(`Anthropic API Key: ${process.env.ANTHROPIC_API_KEY ? '***set***' : 'not set'}`);
    console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? '***set***' : 'not set'}`);
    return;
  }

  console.log(chalk.yellow('Use --help to see available config options'));
}

/**
 * Apply filtering options to reduce conversation set
 */
function applyFilters(conversations: any[], options: any): any[] {
  let filtered = [...conversations];

  // Date range filtering
  if (options.after) {
    const afterDate = new Date(options.after);
    filtered = filtered.filter(conv => {
      const convDate = new Date(conv.messages[0]?.timestamp || 0);
      return convDate >= afterDate;
    });
  }

  if (options.before) {
    const beforeDate = new Date(options.before);
    filtered = filtered.filter(conv => {
      const convDate = new Date(conv.messages[0]?.timestamp || 0);
      return convDate <= beforeDate;
    });
  }

  // Content filtering
  if (options.contains) {
    const searchText = options.contains.toLowerCase();
    filtered = filtered.filter(conv => {
      const titleMatch = conv.title.toLowerCase().includes(searchText);
      const contentMatch = conv.messages.some((msg: any) => 
        msg.content.toLowerCase().includes(searchText)
      );
      return titleMatch || contentMatch;
    });
  }

  // Sort by date (newest first) for sampling/limiting
  filtered.sort((a, b) => {
    const dateA = new Date(a.messages[0]?.timestamp || 0).getTime();
    const dateB = new Date(b.messages[0]?.timestamp || 0).getTime();
    return dateB - dateA;
  });

  // Numeric filtering
  if (options.last) {
    const count = parseInt(options.last);
    filtered = filtered.slice(0, count);
  } else if (options.first) {
    const count = parseInt(options.first);
    filtered = filtered.slice(-count).reverse();
  } else if (options.sample) {
    const count = parseInt(options.sample);
    if (count < filtered.length) {
      // Fisher-Yates shuffle for random sampling
      const shuffled = [...filtered];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      filtered = shuffled.slice(0, count);
      // Re-sort sampled conversations by date
      filtered.sort((a, b) => {
        const dateA = new Date(a.messages[0]?.timestamp || 0).getTime();
        const dateB = new Date(b.messages[0]?.timestamp || 0).getTime();
        return dateB - dateA;
      });
    }
  }

  return filtered;
}

// Parse command line arguments
program.parse(process.argv);

// Show help if no arguments provided
if (process.argv.length === 2) {
  program.help();
}
