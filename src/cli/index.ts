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
import { FileHandler } from '../utils/file-handler.js';

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
  .action(async file => {
    try {
      await handleInfoCommand(file);
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

  // Load and parse the export file
  console.log(chalk.cyan('📁 Loading export file...'));
  const data = JSON.parse(readFileSync(file, 'utf-8'));

  console.log(chalk.cyan('🔍 Detecting platform...'));
  const result = parseExport(data);

  console.log(chalk.green(`✅ Successfully parsed ${result.conversations.length} conversations`));
  console.log(chalk.gray(`Platform: ${result.metadata.platform}`));
  console.log(
    chalk.gray(
      `Date range: ${result.metadata.dateRange.earliest.split('T')[0]} to ${result.metadata.dateRange.latest.split('T')[0]}`
    )
  );

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
}

async function exportResults(conversations: any[], classifications: any[], options: any) {
  const outputDir = options.output || './imported-writing';
  
  // Validate and prepare output directory
  console.log(chalk.cyan(`📂 Preparing output directory: ${outputDir}`));
  await FileHandler.ensureDirectory(outputDir);
  
  switch (options.format) {
    case 'markdown':
    default:
      console.log(chalk.cyan('📝 Exporting to Markdown format...'));
      
      const exportOptions = {
        outputDir,
        organizeByProject: true,
        includeMetadata: true,
        includeTimestamps: false,
        createIndex: true
      };
      
      const summary = await MarkdownExporter.export(conversations, classifications, exportOptions);
      
      console.log(chalk.green('\n✅ Export completed successfully!'));
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
      await FileHandler.writeJsonFile(jsonPath, {
        conversations,
        classifications,
        exportTime: new Date().toISOString()
      });
      console.log(chalk.green(`✅ JSON export saved to: ${jsonPath}`));
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

async function handleInfoCommand(file: string) {
  if (!existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  console.log(chalk.cyan('📊 Analyzing export file...'));

  const data = JSON.parse(readFileSync(file, 'utf-8'));
  const result = parseExport(data);

  console.log(chalk.green('Export Information:'));
  console.log(`Platform: ${result.metadata.platform}`);
  console.log(`Total conversations: ${result.metadata.totalConversations}`);
  console.log(
    `Date range: ${result.metadata.dateRange.earliest.split('T')[0]} to ${result.metadata.dateRange.latest.split('T')[0]}`
  );
  console.log(`Export version: ${result.metadata.exportVersion || 'unknown'}`);

  // Message statistics
  const totalMessages = result.conversations.reduce((sum, conv) => sum + conv.messages.length, 0);
  const avgMessages = Math.round(totalMessages / result.conversations.length);

  console.log(`\nMessage Statistics:`);
  console.log(`Total messages: ${totalMessages}`);
  console.log(`Average per conversation: ${avgMessages}`);

  // Top conversations by message count
  const topConversations = result.conversations
    .sort((a, b) => b.messages.length - a.messages.length)
    .slice(0, 5);

  console.log(`\nTop conversations by message count:`);
  topConversations.forEach((conv, index) => {
    const title = conv.title.length > 50 ? conv.title.substring(0, 50) + '...' : conv.title;
    console.log(`${index + 1}. ${title} (${conv.messages.length} messages)`);
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

// Parse command line arguments
program.parse(process.argv);

// Show help if no arguments provided
if (process.argv.length === 2) {
  program.help();
}
