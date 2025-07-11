/**
 * File Operations Utility for LLM Export Importer
 * 
 * Provides safe file operations for creating organized output directories
 * and writing exported content with proper error handling and validation.
 */

import { promises as fs } from 'fs';
import { dirname, join, resolve, extname } from 'path';
import { existsSync } from 'fs';

export interface FileWriteOptions {
  overwrite?: boolean;
  createDirectories?: boolean;
  backupExisting?: boolean;
}

export interface DirectoryInfo {
  path: string;
  exists: boolean;
  writable: boolean;
  files?: string[];
}

/**
 * Safe file operations with validation and error handling
 */
export class FileHandler {
  
  /**
   * Ensures a directory exists, creating it if necessary
   */
  static async ensureDirectory(dirPath: string): Promise<void> {
    const resolvedPath = resolve(dirPath);
    
    try {
      await fs.access(resolvedPath);
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(resolvedPath, { recursive: true });
    }
  }

  /**
   * Safely writes content to a file with proper error handling
   */
  static async writeFile(
    filePath: string, 
    content: string, 
    options: FileWriteOptions = {}
  ): Promise<void> {
    const resolvedPath = resolve(filePath);
    const dir = dirname(resolvedPath);
    
    // Ensure parent directory exists
    if (options.createDirectories !== false) {
      await this.ensureDirectory(dir);
    }

    // Check if file exists and handle accordingly
    if (existsSync(resolvedPath)) {
      if (!options.overwrite) {
        throw new Error(`File already exists: ${resolvedPath}`);
      }
      
      if (options.backupExisting) {
        await this.createBackup(resolvedPath);
      }
    }

    await fs.writeFile(resolvedPath, content, 'utf-8');
  }

  /**
   * Creates a backup of an existing file
   */
  static async createBackup(filePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ext = extname(filePath);
    const baseName = filePath.slice(0, -ext.length);
    const backupPath = `${baseName}.backup-${timestamp}${ext}`;
    
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  }

  /**
   * Generates a safe filename by sanitizing the input
   */
  static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .toLowerCase()
      .trim()
      .slice(0, 100); // Limit length
  }

  /**
   * Creates a unique filename if the target already exists
   */
  static async getUniqueFilename(basePath: string, extension: string): Promise<string> {
    let counter = 1;
    let filename = `${basePath}${extension}`;
    
    while (existsSync(filename)) {
      filename = `${basePath}-${counter}${extension}`;
      counter++;
    }
    
    return filename;
  }

  /**
   * Analyzes a directory and returns information about it
   */
  static async analyzeDirectory(dirPath: string): Promise<DirectoryInfo> {
    const resolvedPath = resolve(dirPath);
    const result: DirectoryInfo = {
      path: resolvedPath,
      exists: false,
      writable: false
    };

    try {
      await fs.access(resolvedPath);
      result.exists = true;

      // Test writability by trying to create a temporary file
      try {
        const testFile = join(resolvedPath, '.write-test');
        await fs.writeFile(testFile, '');
        await fs.unlink(testFile);
        result.writable = true;
      } catch {
        result.writable = false;
      }

      // List files if readable
      try {
        const files = await fs.readdir(resolvedPath);
        result.files = files;
      } catch {
        // Directory not readable
      }

    } catch {
      // Directory doesn't exist
    }

    return result;
  }

  /**
   * Creates a structured project directory
   */
  static async createProjectStructure(
    basePath: string, 
    projectName: string
  ): Promise<string> {
    const sanitizedName = this.sanitizeFilename(projectName);
    const projectPath = join(basePath, sanitizedName);
    
    // Create main project directory
    await this.ensureDirectory(projectPath);
    
    // Create subdirectories
    const subdirs = ['conversations', 'extracted', 'metadata'];
    for (const subdir of subdirs) {
      await this.ensureDirectory(join(projectPath, subdir));
    }
    
    return projectPath;
  }

  /**
   * Writes a JSON file with proper formatting
   */
  static async writeJsonFile(
    filePath: string, 
    data: any, 
    options: FileWriteOptions = {}
  ): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await this.writeFile(filePath, content, options);
  }

  /**
   * Safely reads a file with error handling
   */
  static async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(resolve(filePath), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
  }

  /**
   * Lists all files in a directory with optional filtering
   */
  static async listFiles(
    dirPath: string, 
    filter?: (filename: string) => boolean
  ): Promise<string[]> {
    try {
      const files = await fs.readdir(resolve(dirPath));
      return filter ? files.filter(filter) : files;
    } catch (error) {
      throw new Error(`Failed to list files in ${dirPath}: ${error}`);
    }
  }

  /**
   * Validates that a path is safe for writing (not system directories)
   */
  static validateOutputPath(outputPath: string): void {
    const resolved = resolve(outputPath);
    const dangerous = ['/bin', '/etc', '/usr', '/sys', '/proc', '/var'];
    
    if (dangerous.some(danger => resolved.startsWith(danger))) {
      throw new Error(`Unsafe output path: ${resolved}`);
    }
  }
}