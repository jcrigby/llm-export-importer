#!/usr/bin/env node

/**
 * Simple CLI for LLM Export Importer
 * Focused on core functionality: list, export, organize
 */

import { Command } from 'commander';
import { writeFile, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
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
import { exportAllChats, showChatsWithJson } from '../core/chat-exporter.js';
import { autoDetectProjects, organizeIntoProjects } from '../core/project-organizer.js';
import { loadExportContent } from '../utils/zip-handler.js';
import { extractJsonFromMarkdown, extractJsonFromDirectory } from '../utils/json-extractor.js';
import { handleGitOperations, checkForUncommittedChanges } from '../utils/git-utils.js';

const program = new Command();

program
  .name('llm-export')
  .description(`Simple tool to organize LLM chat exports

Examples:
  llm-export list export.json                         # List all chats
  llm-export show-json export.json                    # Show chats with embedded JSON
  llm-export export export.json -o ./my-chats         # Export to markdown files
  llm-export export export.json -j pretty --git       # Export with pretty JSON and git init
  llm-export organize export.json -o ./organized      # Organize into projects
  llm-export full export.json -o ./archive -j pretty --git  # Do everything with JSON and git
  llm-export extract-json chat.md                     # Extract JSON from existing markdown`)
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
    
    let cleanup: (() => Promise<void>) | undefined;
    
    try {
      // Load and parse export
      const result = await loadExportFile(file);
      const { conversations, platform } = result;
      cleanup = result.cleanup;
      void cleanup; // suppress TS warning
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

// Show JSON command - show chats that contain embedded JSON
program
  .command('show-json')
  .description('Show chats that contain embedded JSON')
  .argument('<file>', 'Export file from ChatGPT, Claude, Gemini, or Perplexity')
  .option('-o, --output <file>', 'Save output to file instead of printing')
  .action(async (file: string, options) => {
    const spinner = ora('Loading export file...').start();
    
    let cleanup: (() => Promise<void>) | undefined;
    
    try {
      // Load and parse export
      const result = await loadExportFile(file);
      const { conversations, platform } = result;
      cleanup = result.cleanup;
      spinner.text = 'Scanning for embedded JSON...';
      
      // Find chats with JSON
      const chatsWithJson = showChatsWithJson(conversations);
      spinner.succeed(`Found ${chatsWithJson.length} chats with embedded JSON from ${platform}`);
      
      if (chatsWithJson.length === 0) {
        console.log(chalk.yellow('No chats found with embedded JSON.'));
        return;
      }
      
      // Format output
      const lines: string[] = [];
      lines.push(`# Chats with Embedded JSON (${chatsWithJson.length} found)\n`);
      
      chatsWithJson.forEach(chat => {
        lines.push(`## ${chat.title}`);
        lines.push(`- **Date**: ${chat.date}`);
        lines.push(`- **ID**: ${chat.id}`);
        lines.push(`- **JSON Items**: ${chat.jsonItems.length}\n`);
        
        chat.jsonItems.forEach((item, index) => {
          lines.push(`### JSON ${index + 1}:`);
          lines.push('```json');
          lines.push(JSON.stringify(item.json, null, 2));
          lines.push('```\n');
        });
        
        lines.push('---\n');
      });
      
      const output = lines.join('\n');
      
      // Save or print
      if (options.output) {
        await writeFile(options.output, output, 'utf8');
        console.log(chalk.green(`✓ Saved JSON report to ${options.output}`));
      } else {
        console.log(output);
      }
      
    } catch (error) {
      spinner.fail('Failed to process export file');
      console.error(chalk.red(error));
      process.exit(1);
    } finally {
      // Cleanup temp files
      if (cleanup) {
        await cleanup();
      }
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
  .option('-j, --json <mode>', 'Format JSON: pretty, collapse, show, none', 'none')
  .option('--process-artifacts', 'Process Claude artifacts (documents) into readable format', false)
  .option('--git', 'Initialize git repo and commit exported files', false)
  .action(async (file: string, options) => {
    const spinner = ora('Loading export file...').start();
    
    let cleanup: (() => Promise<void>) | undefined;
    
    try {
      // Check for git issues if --git flag is used
      if (options.git) {
        const gitError = await checkForUncommittedChanges(resolve(options.output));
        if (gitError) {
          spinner.fail('Git check failed');
          console.error(chalk.red(gitError));
          process.exit(1);
        }
      }
      
      // Load and parse export
      const result = await loadExportFile(file);
      const { conversations } = result;
      cleanup = result.cleanup;
      spinner.text = `Exporting ${conversations.length} conversations...`;
      
      // Export all chats
      const { exportedFiles, artifactFiles, summary } = await exportAllChats(conversations, {
        outputDir: resolve(options.output),
        extractArtifacts: options.artifacts,
        includeMetadata: options.metadata,
        sanitizeFilenames: true,
        formatJson: options.json as 'pretty' | 'collapse' | 'show' | 'none',
        processArtifacts: options.processArtifacts
      });
      
      spinner.succeed(summary);
      
      console.log(chalk.green(`\n✓ Exported ${exportedFiles.length} chat files`));
      if (artifactFiles.length > 0) {
        console.log(chalk.green(`✓ Extracted ${artifactFiles.length} artifacts`));
      }
      
      // Handle git operations if requested
      if (options.git) {
        spinner.start('Initializing git and committing files...');
        try {
          const gitResult = await handleGitOperations(resolve(options.output), {
            exportType: 'export',
            conversationCount: conversations.length,
            artifactCount: artifactFiles.length,
            platform: result.platform
          });
          
          if (gitResult.error) {
            spinner.fail(gitResult.error);
          } else {
            if (gitResult.initialized) {
              spinner.succeed(`Git repo initialized and files committed: "${gitResult.message}"`);
            } else {
              spinner.succeed(`Files committed to existing repo: "${gitResult.message}"`);
            }
          }
        } catch (error) {
          spinner.fail(`Git operation failed: ${error}`);
        }
      }
      
      console.log(chalk.gray(`\nOutput directory: ${resolve(options.output)}`));
      if (options.git) {
        console.log(chalk.gray('You can now use "git grep <search-term>" to search through your chats!'));
      } else {
        console.log(chalk.gray('Use "git init && git add . && git commit -m \'Initial export\'" to version control your chats'));
        console.log(chalk.gray('Then use "git grep <search-term>" to search through your chats!'));
      }
      
    } catch (error) {
      spinner.fail('Failed to export chats');
      console.error(chalk.red(error));
      process.exit(1);
    } finally {
      // Cleanup temp files
      if (cleanup) {
        await cleanup();
      }
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
  .option('-j, --json <mode>', 'Format JSON: pretty, collapse, show, none', 'none')
  .option('--process-artifacts', 'Process Claude artifacts (documents) into readable format', false)
  .option('--git', 'Initialize git repo and commit organized files', false)
  .action(async (file: string, options) => {
    const spinner = ora('Loading export file...').start();
    
    try {
      const outputDir = resolve(options.output);
      
      // Check for git issues if --git flag is used
      if (options.git) {
        const gitError = await checkForUncommittedChanges(outputDir);
        if (gitError) {
          spinner.fail('Git check failed');
          console.error(chalk.red(gitError));
          process.exit(1);
        }
      }
      
      // Load and parse export
      const { conversations } = await loadExportFile(file);
      spinner.text = 'Analyzing conversations for projects...';
      
      // First export all chats
      await exportAllChats(conversations, {
        outputDir,
        extractArtifacts: true,
        includeMetadata: true,
        sanitizeFilenames: true,
        formatJson: options.json as 'pretty' | 'collapse' | 'show' | 'none',
        processArtifacts: options.processArtifacts
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
      
      // Handle git operations if requested
      if (options.git) {
        spinner.start('Initializing git and committing files...');
        try {
          const gitResult = await handleGitOperations(outputDir, {
            exportType: 'organize',
            conversationCount: conversations.length
          });
          
          if (gitResult.error) {
            spinner.fail(gitResult.error);
          } else {
            if (gitResult.initialized) {
              spinner.succeed(`Git repo initialized and files committed: "${gitResult.message}"`);
            } else {
              spinner.succeed(`Files committed to existing repo: "${gitResult.message}"`);
            }
          }
        } catch (error) {
          spinner.fail(`Git operation failed: ${error}`);
        }
      }
      
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
  .option('-j, --json <mode>', 'Format JSON: pretty, collapse, show, none', 'none')
  .option('--process-artifacts', 'Process Claude artifacts (documents) into readable format', false)
  .option('--git', 'Initialize git repo and commit all files', false)
  .action(async (file: string, options) => {
    console.log(chalk.blue('🚀 Running full export and organization...\n'));
    
    try {
      const outputDir = resolve(options.output);
      
      // Check for git issues if --git flag is used
      if (options.git) {
        const gitError = await checkForUncommittedChanges(outputDir);
        if (gitError) {
          console.error(chalk.red('❌ Git check failed:'), gitError);
          process.exit(1);
        }
      }
      
      // Load export
      const spinner = ora('Loading export file...').start();
      const { conversations, platform } = await loadExportFile(file);
      spinner.succeed(`Loaded ${conversations.length} conversations from ${platform}`);
      
      // Generate and save chat list
      const summaries = generateChatList(conversations, platform);
      await mkdir(outputDir, { recursive: true });
      const listPath = resolve(outputDir, 'chat-list.md');
      
      // Check if file exists and append to it, otherwise create new
      let chatListContent = formatChatList(summaries);
      try {
        const { stat, readFile: fsReadFile } = await import('fs/promises');
        await stat(listPath);
        // File exists, append to it
        const existingContent = await fsReadFile(listPath, 'utf8');
        const timestamp = new Date().toISOString().split('T')[0];
        chatListContent = existingContent + `\n\n---\n\n# Export from ${timestamp}\n\n` + chatListContent;
      } catch {
        // File doesn't exist, create new one with header
        const timestamp = new Date().toISOString().split('T')[0];
        chatListContent = `# Chat Export History\n\n## Export from ${timestamp}\n\n` + chatListContent;
      }
      
      await writeFile(listPath, chatListContent, 'utf8');
      console.log(chalk.green(`✓ Updated chat list at ${listPath}`));
      
      // Export all chats
      spinner.start('Exporting conversations...');
      const { exportedFiles, artifactFiles } = await exportAllChats(conversations, {
        outputDir,
        extractArtifacts: true,
        includeMetadata: true,
        sanitizeFilenames: true,
        formatJson: options.json as 'pretty' | 'collapse' | 'show' | 'none',
        processArtifacts: options.processArtifacts
      });
      spinner.succeed(`Exported ${exportedFiles.length} chats and ${artifactFiles.length} artifacts`);
      
      // Auto-detect and organize projects
      spinner.start('Detecting projects...');
      const projects = autoDetectProjects(conversations);
      await organizeIntoProjects(conversations, projects, outputDir);
      spinner.succeed(`Organized into ${projects.length} projects`);
      
      // Handle git operations if requested
      if (options.git) {
        spinner.start('Initializing git and committing all files...');
        try {
          const gitResult = await handleGitOperations(outputDir, {
            exportType: 'full',
            conversationCount: conversations.length,
            artifactCount: artifactFiles.length,
            platform
          });
          
          if (gitResult.error) {
            spinner.fail(gitResult.error);
          } else {
            if (gitResult.initialized) {
              spinner.succeed(`Git repo initialized and files committed: "${gitResult.message}"`);
            } else {
              spinner.succeed(`Files committed to existing repo: "${gitResult.message}"`);
            }
          }
        } catch (error) {
          spinner.fail(`Git operation failed: ${error}`);
        }
      }
      
      // Final summary
      console.log(chalk.green('\n✅ Export complete!'));
      console.log(chalk.gray(`\nOutput directory: ${outputDir}`));
      
      if (options.git) {
        console.log(chalk.gray('\nYou can now:'));
        console.log(chalk.gray('  - Use "git grep <search-term>" to search through all chats'));
        console.log(chalk.gray('  - Browse the projects/ directory to see organized conversations'));
        console.log(chalk.gray('  - View commit history with "git log --oneline"'));
      } else {
        console.log(chalk.gray('\nYou can now:'));
        console.log(chalk.gray('  - Use "git init && git add . && git commit -m \'Initial export\'" to version control your chats'));
        console.log(chalk.gray('  - Use "git grep <search-term>" to search through all chats'));
        console.log(chalk.gray('  - Browse the projects/ directory to see organized conversations'));
      }
      
    } catch (error) {
      console.error(chalk.red('\n❌ Export failed:'), error);
      process.exit(1);
    }
  });

// Extract JSON command - extract and expand JSON from existing markdown files
program
  .command('extract-json')
  .description('Extract and expand JSON from existing markdown files')
  .argument('<path>', 'Markdown file or directory containing markdown files')
  .option('-o, --output <dir>', 'Output directory for artifacts (defaults to same as input)')
  .action(async (path: string, options) => {
    const spinner = ora('Processing markdown files...').start();
    
    try {
      const { stat } = await import('fs/promises');
      const stats = await stat(path);
      
      if (stats.isDirectory()) {
        // Process all markdown files in directory
        const results = await extractJsonFromDirectory(path, options.output);
        
        let totalExtracted = 0;
        const processedFiles: string[] = [];
        
        results.forEach((extracted, filename) => {
          totalExtracted += extracted.length;
          processedFiles.push(filename);
        });
        
        spinner.succeed(`Extracted ${totalExtracted} JSON blocks from ${processedFiles.length} files`);
        
        if (processedFiles.length > 0) {
          console.log(chalk.green('\n✓ Processed files:'));
          processedFiles.forEach(file => {
            const count = results.get(file)?.length || 0;
            console.log(chalk.gray(`  - ${file} (${count} JSON blocks)`));
          });
        }
        
      } else {
        // Process single file
        const extracted = await extractJsonFromMarkdown(path, options.output);
        spinner.succeed(`Extracted ${extracted.length} JSON blocks from ${path}`);
        
        if (extracted.length > 0) {
          console.log(chalk.green('\n✓ Extracted artifacts:'));
          extracted.forEach(item => {
            console.log(chalk.gray(`  - ${item.filename} (${item.type})`));
          });
        }
      }
      
      const outputDir = options.output || (stats.isDirectory() ? path : dirname(path));
      console.log(chalk.gray(`\nArtifacts saved to: ${resolve(outputDir, 'artifacts')}`));
      
    } catch (error) {
      spinner.fail('Failed to extract JSON');
      console.error(chalk.red(error));
      process.exit(1);
    }
  });

/**
 * Load and parse export file, auto-detecting format
 * Handles both JSON files and ZIP files containing conversations.json
 */
async function loadExportFile(filePath: string): Promise<{
  conversations: ConversationData[];
  platform: string;
  cleanup?: () => Promise<void>;
}> {
  const { content, cleanup } = await loadExportContent(filePath);
  const data = JSON.parse(content);
  
  // Auto-detect format and parse
  if (Array.isArray(data) && data.length > 0 && 'mapping' in data[0]) {
    // ChatGPT array format
    return {
      conversations: parseChatGPTExport(data),
      platform: 'ChatGPT',
      cleanup
    };
  } else if (Array.isArray(data) && data.length > 0 && 'chat_messages' in data[0]) {
    // New Claude array format
    return {
      conversations: parseClaudeExport(data),
      platform: 'Claude',
      cleanup
    };
  } else if ('conversations' in data && Array.isArray(data.conversations)) {
    // Claude format
    return {
      conversations: parseClaudeExport(data),
      platform: 'Claude',
      cleanup
    };
  } else if ('mapping' in data) {
    // ChatGPT object format
    return {
      conversations: parseChatGPTExport(data),
      platform: 'ChatGPT',
      cleanup
    };
  } else if ('chats' in data) {
    // Gemini format
    return {
      conversations: parseGeminiExport(data),
      platform: 'Gemini',
      cleanup
    };
  } else if ('threads' in data) {
    // Perplexity format
    return {
      conversations: parsePerplexityExport(data),
      platform: 'Perplexity',
      cleanup
    };
  } else {
    throw new Error('Unknown export format. Supported: ChatGPT, Claude, Gemini, Perplexity');
  }
}

// Parse command line arguments
program.parse();