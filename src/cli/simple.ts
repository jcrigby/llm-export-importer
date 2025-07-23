#!/usr/bin/env node

/**
 * Simple CLI for LLM Export Importer
 * Focused on core functionality: list, export, organize
 */

import { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';

// Import parsers
import { parseChatGPTExport } from '../parsers/chatgpt.js';
import { parseClaudeExport } from '../parsers/claude.js';
import { parseGeminiExport } from '../parsers/gemini.js';
import { parsePerplexityExport } from '../parsers/perplexity.js';
import { ConversationData } from '../parsers/base.js';

// Import core functionality
import { generateChatList, formatChatList, generateChatListCSV } from '../core/chat-list.js';
import { exportAllChats } from '../core/chat-exporter.js';
import { autoDetectProjects, organizeIntoProjects } from '../core/project-organizer.js';

const program = new Command();

program
  .name('llm-export')
  .description('Simple tool to organize LLM chat exports')
  .version('1.0.0');

// List command - show all chats in date order
program
  .command('list')
  .description('List all chats in date order')
  .argument('<file>', 'Export file from ChatGPT, Claude, Gemini, or Perplexity')
  .option('-f, --format <format>', 'Output format: text, csv', 'text')
  .option('-o, --output <file>', 'Save output to file instead of printing')
  .action(async (file: string, options) => {
    const spinner = ora('Loading export file...').start();
    
    try {
      // Load and parse export
      const { conversations, platform } = await loadExportFile(file);
      spinner.succeed(`Loaded ${conversations.length} conversations from ${platform}`);
      
      // Generate chat list
      const summaries = generateChatList(conversations, platform);
      
      // Format output
      let output: string;
      if (options.format === 'csv') {
        output = generateChatListCSV(summaries);
      } else {
        output = formatChatList(summaries);
      }
      
      // Save or print
      if (options.output) {
        await writeFile(options.output, output, 'utf8');
        console.log(chalk.green(`✓ Saved chat list to ${options.output}`));
      } else {
        console.log(output);
      }
      
    } catch (error) {
      spinner.fail('Failed to process export file');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Export command - export chats to markdown files
program
  .command('export')
  .description('Export chats to individual markdown files')
  .argument('<file>', 'Export file from ChatGPT, Claude, Gemini, or Perplexity')
  .option('-o, --output <dir>', 'Output directory', './exported-chats')
  .option('-a, --artifacts', 'Extract code blocks and artifacts', false)
  .option('-m, --metadata', 'Include metadata in exports', false)
  .action(async (file: string, options) => {
    const spinner = ora('Loading export file...').start();
    
    try {
      // Load and parse export
      const { conversations } = await loadExportFile(file);
      spinner.text = `Exporting ${conversations.length} conversations...`;
      
      // Export all chats
      const { exportedFiles, artifactFiles, summary } = await exportAllChats(conversations, {
        outputDir: resolve(options.output),
        extractArtifacts: options.artifacts,
        includeMetadata: options.metadata,
        sanitizeFilenames: true
      });
      
      spinner.succeed(summary);
      
      console.log(chalk.green(`\n✓ Exported ${exportedFiles.length} chat files`));
      if (artifactFiles.length > 0) {
        console.log(chalk.green(`✓ Extracted ${artifactFiles.length} artifacts`));
      }
      console.log(chalk.gray(`\nOutput directory: ${resolve(options.output)}`));
      console.log(chalk.gray('You can now use git grep to search through your chats!'));
      
    } catch (error) {
      spinner.fail('Failed to export chats');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Organize command - organize chats into projects
program
  .command('organize')
  .description('Organize chats into projects based on content')
  .argument('<file>', 'Export file from ChatGPT, Claude, Gemini, or Perplexity')
  .option('-o, --output <dir>', 'Output directory', './exported-chats')
  .option('-a, --auto', 'Auto-detect projects', true)
  .option('-t, --threshold <n>', 'Keyword threshold for project detection', '3')
  .option('-m, --min <n>', 'Minimum conversations per project', '2')
  .action(async (file: string, options) => {
    const spinner = ora('Loading export file...').start();
    
    try {
      // Load and parse export
      const { conversations } = await loadExportFile(file);
      spinner.text = 'Analyzing conversations for projects...';
      
      // First export all chats
      const outputDir = resolve(options.output);
      await exportAllChats(conversations, {
        outputDir,
        extractArtifacts: true,
        includeMetadata: true,
        sanitizeFilenames: true
      });
      
      // Auto-detect projects
      const projects = autoDetectProjects(conversations, {
        autoDetect: options.auto,
        keywordThreshold: parseInt(options.threshold),
        minConversations: parseInt(options.min)
      });
      
      spinner.text = `Creating ${projects.length} projects...`;
      
      // Organize into projects
      const { summary } = await organizeIntoProjects(
        conversations,
        projects,
        outputDir
      );
      
      spinner.succeed(summary);
      
      console.log(chalk.green(`\n✓ Created ${projects.length} projects:`));
      projects.forEach(project => {
        console.log(chalk.gray(`  - ${project.name} (${project.conversations.length} chats)`));
      });
      
      console.log(chalk.gray(`\nOutput directory: ${outputDir}`));
      
    } catch (error) {
      spinner.fail('Failed to organize chats');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

// Full command - do everything at once
program
  .command('full')
  .description('List, export, and organize chats in one command')
  .argument('<file>', 'Export file from ChatGPT, Claude, Gemini, or Perplexity')
  .option('-o, --output <dir>', 'Output directory', './exported-chats')
  .action(async (file: string, options) => {
    console.log(chalk.blue('🚀 Running full export and organization...\n'));
    
    try {
      // Load export
      const spinner = ora('Loading export file...').start();
      const { conversations, platform } = await loadExportFile(file);
      spinner.succeed(`Loaded ${conversations.length} conversations from ${platform}`);
      
      // Generate and save chat list
      const summaries = generateChatList(conversations, platform);
      const outputDir = resolve(options.output);
      await mkdir(outputDir, { recursive: true });
      const listPath = resolve(outputDir, 'chat-list.md');
      await writeFile(listPath, formatChatList(summaries), 'utf8');
      console.log(chalk.green(`✓ Saved chat list to ${listPath}`));
      
      // Export all chats
      spinner.start('Exporting conversations...');
      const { exportedFiles, artifactFiles } = await exportAllChats(conversations, {
        outputDir,
        extractArtifacts: true,
        includeMetadata: true,
        sanitizeFilenames: true
      });
      spinner.succeed(`Exported ${exportedFiles.length} chats and ${artifactFiles.length} artifacts`);
      
      // Auto-detect and organize projects
      spinner.start('Detecting projects...');
      const projects = autoDetectProjects(conversations);
      await organizeIntoProjects(conversations, projects, outputDir);
      spinner.succeed(`Organized into ${projects.length} projects`);
      
      // Final summary
      console.log(chalk.green('\n✅ Export complete!'));
      console.log(chalk.gray(`\nOutput directory: ${outputDir}`));
      console.log(chalk.gray('\nYou can now:'));
      console.log(chalk.gray('  - Use "git init" and "git add ." to version control your chats'));
      console.log(chalk.gray('  - Use "git grep <search-term>" to search through all chats'));
      console.log(chalk.gray('  - Browse the projects/ directory to see organized conversations'));
      
    } catch (error) {
      console.error(chalk.red('\n❌ Export failed:'), error);
      process.exit(1);
    }
  });

/**
 * Load and parse export file, auto-detecting format
 */
async function loadExportFile(filePath: string): Promise<{
  conversations: ConversationData[];
  platform: string;
}> {
  const content = await readFile(resolve(filePath), 'utf8');
  const data = JSON.parse(content);
  
  // Auto-detect format and parse
  if (Array.isArray(data) && data.length > 0 && 'mapping' in data[0]) {
    // ChatGPT array format
    return {
      conversations: parseChatGPTExport(data),
      platform: 'ChatGPT'
    };
  } else if (Array.isArray(data) && data.length > 0 && 'chat_messages' in data[0]) {
    // New Claude array format
    return {
      conversations: parseClaudeExport(data),
      platform: 'Claude'
    };
  } else if ('conversations' in data && Array.isArray(data.conversations)) {
    // Claude format
    return {
      conversations: parseClaudeExport(data),
      platform: 'Claude'
    };
  } else if ('mapping' in data) {
    // ChatGPT object format
    return {
      conversations: parseChatGPTExport(data),
      platform: 'ChatGPT'
    };
  } else if ('chats' in data) {
    // Gemini format
    return {
      conversations: parseGeminiExport(data),
      platform: 'Gemini'
    };
  } else if ('threads' in data) {
    // Perplexity format
    return {
      conversations: parsePerplexityExport(data),
      platform: 'Perplexity'
    };
  } else {
    throw new Error('Unknown export format. Supported: ChatGPT, Claude, Gemini, Perplexity');
  }
}

// Parse command line arguments
program.parse();