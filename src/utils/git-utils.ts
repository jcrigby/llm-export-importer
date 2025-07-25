/**
 * Git utilities for automatic repository management
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

/**
 * Check if a directory is a git repository
 */
export async function isGitRepo(directory: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --git-dir', { cwd: directory });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a git repo has uncommitted changes
 */
export async function hasUncommittedChanges(directory: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync('git status --porcelain', { cwd: directory });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Initialize a git repository
 */
export async function initGitRepo(directory: string): Promise<void> {
  await execAsync('git init', { cwd: directory });
}

/**
 * Add all files and commit
 */
export async function commitAllFiles(directory: string, message: string): Promise<void> {
  await execAsync('git add .', { cwd: directory });
  await execAsync(`git commit -m "${message}"`, { cwd: directory });
}

/**
 * Check if directory has uncommitted changes that would prevent export
 */
export async function checkForUncommittedChanges(directory: string): Promise<string | null> {
  try {
    const isRepo = await isGitRepo(directory);
    if (!isRepo) {
      return null; // No repo, no problem
    }
    
    const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd: directory });
    const statusLines = statusOutput.trim();
    
    if (statusLines.length > 0) {
      const lines = statusLines.split('\n');
      
      // Check if there are any modified or deleted files (not just untracked)
      const modifiedFiles = lines
        .filter(line => {
          if (line.length < 2) return false;
          const status = line.substring(0, 2);
          // Allow untracked files (??) but not modified (M), deleted (D), renamed (R), etc.
          return status !== '??' && status.trim().length > 0;
        })
        .map(line => line.substring(3)); // Get filename
      
      if (modifiedFiles.length > 0) {
        return `Directory has uncommitted changes: ${modifiedFiles.join(', ')}. Please commit or stash them first.`;
      }
    }
    
    return null; // No problematic changes
  } catch (error) {
    // If git status fails, allow the operation
    return null;
  }
}

/**
 * Handle git operations for exported content
 */
export async function handleGitOperations(
  directory: string,
  options: {
    exportType: 'export' | 'organize' | 'full';
    conversationCount: number;
    artifactCount?: number;
    platform?: string;
  }
): Promise<{ 
  initialized: boolean; 
  committed: boolean; 
  message?: string;
  error?: string;
}> {
  const gitDir = join(directory, '.git');
  const isRepo = existsSync(gitDir);
  let wasInitialized = false;
  
  if (!isRepo) {
    // Initialize new repo
    await initGitRepo(directory);
    wasInitialized = true;
  }
  
  // Generate appropriate commit message
  let commitMessage = '';
  switch (options.exportType) {
    case 'export':
      commitMessage = `Export ${options.conversationCount} conversations`;
      if (options.artifactCount && options.artifactCount > 0) {
        commitMessage += ` and ${options.artifactCount} artifacts`;
      }
      if (options.platform) {
        commitMessage += ` from ${options.platform}`;
      }
      break;
      
    case 'organize':
      commitMessage = `Organize ${options.conversationCount} conversations into projects`;
      break;
      
    case 'full':
      commitMessage = `Full export: ${options.conversationCount} conversations`;
      if (options.artifactCount && options.artifactCount > 0) {
        commitMessage += ` with ${options.artifactCount} artifacts`;
      }
      if (options.platform) {
        commitMessage += ` from ${options.platform}`;
      }
      break;
  }
  
  // Add timestamp
  const timestamp = new Date().toISOString().split('T')[0];
  commitMessage += ` (${timestamp})`;
  
  // Commit all files
  await commitAllFiles(directory, commitMessage);
  
  return {
    initialized: wasInitialized,
    committed: true,
    message: commitMessage
  };
}