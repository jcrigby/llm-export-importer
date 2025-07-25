/**
 * Zip file handling utilities
 * Extract conversations.json from ChatGPT/Claude/etc zip exports
 */

import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { resolve, dirname, extname } from 'path';
import * as yauzl from 'yauzl';
import { tmpdir } from 'os';

export interface ZipExtractionResult {
  content: string;
  tempFilePath?: string;
  cleanup: () => Promise<void>;
}

/**
 * Check if a file is a zip file based on extension
 */
export function isZipFile(filePath: string): boolean {
  return extname(filePath).toLowerCase() === '.zip';
}

/**
 * Extract conversations.json from a zip file
 */
export async function extractConversationsFromZip(zipPath: string): Promise<ZipExtractionResult> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        reject(new Error(`Failed to open zip file: ${err.message}`));
        return;
      }
      
      if (!zipfile) {
        reject(new Error('Failed to open zip file'));
        return;
      }

      let conversationsFound = false;
      let tempFilePath: string | undefined;

      zipfile.readEntry();
      
      zipfile.on('entry', (entry) => {
        const fileName = entry.fileName.toLowerCase();
        
        // Look for conversations.json at any level
        if (fileName.endsWith('conversations.json')) {
          conversationsFound = true;
          
          // Create temp file path
          const tempDir = tmpdir();
          tempFilePath = `${tempDir}/llm-export-${Date.now()}-conversations.json`;
          
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              reject(new Error(`Failed to read conversations.json from zip: ${err.message}`));
              return;
            }
            
            if (!readStream) {
              reject(new Error('Failed to create read stream'));
              return;
            }

            // Extract to temp file
            const chunks: Buffer[] = [];
            readStream.on('data', (chunk) => chunks.push(chunk));
            readStream.on('end', async () => {
              try {
                const content = Buffer.concat(chunks).toString('utf8');
                
                if (tempFilePath) {
                  await mkdir(dirname(tempFilePath), { recursive: true });
                  await writeFile(tempFilePath, content, 'utf8');
                }
                
                resolve({
                  content,
                  tempFilePath,
                  cleanup: async () => {
                    if (tempFilePath) {
                      try {
                        await unlink(tempFilePath);
                      } catch (e) {
                        // Ignore cleanup errors
                      }
                    }
                  }
                });
              } catch (error) {
                reject(new Error(`Failed to extract conversations.json: ${error}`));
              }
            });
            
            readStream.on('error', (error) => {
              reject(new Error(`Failed to read conversations.json: ${error.message}`));
            });
          });
          return;
        }
        
        // Continue reading entries
        zipfile.readEntry();
      });
      
      zipfile.on('end', () => {
        if (!conversationsFound) {
          reject(new Error('conversations.json not found in zip file. Make sure this is a valid ChatGPT, Claude, or similar AI platform export.'));
        }
      });
      
      zipfile.on('error', (error) => {
        reject(new Error(`Zip file error: ${error.message}`));
      });
    });
  });
}

/**
 * Load content from a file - handles both JSON and ZIP files
 */
export async function loadExportContent(filePath: string): Promise<ZipExtractionResult> {
  const absolutePath = resolve(filePath);
  
  if (isZipFile(absolutePath)) {
    // Extract from zip
    return await extractConversationsFromZip(absolutePath);
  } else {
    // Read JSON directly
    const content = await readFile(absolutePath, 'utf8');
    return {
      content,
      cleanup: async () => {
        // No cleanup needed for direct JSON files
      }
    };
  }
}