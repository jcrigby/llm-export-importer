/**
 * Utility to extract and expand JSON from markdown files
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, basename } from 'path';
import { existsSync } from 'fs';

export interface ExtractedJson {
  content: any;
  prettyContent: string;
  filename: string;
  type: 'artifact' | 'data';
}

/**
 * Extract JSON from a markdown file and save as expanded artifacts
 */
export async function extractJsonFromMarkdown(
  markdownPath: string,
  outputDir?: string
): Promise<ExtractedJson[]> {
  const content = await readFile(markdownPath, 'utf8');
  const extracted: ExtractedJson[] = [];
  
  // Output directory defaults to same directory as markdown file
  const baseOutputDir = outputDir || dirname(markdownPath);
  const artifactsDir = join(baseOutputDir, 'artifacts');
  
  // Create artifacts directory if it doesn't exist
  if (!existsSync(artifactsDir)) {
    await mkdir(artifactsDir, { recursive: true });
  }
  
  const baseFilename = basename(markdownPath, '.md');
  
  // Find all JSON code blocks
  const codeBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
  let match;
  let jsonIndex = 0;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    jsonIndex++;
    const jsonContent = match[1].trim();
    
    try {
      const parsed = JSON.parse(jsonContent);
      const prettyJson = JSON.stringify(parsed, null, 2);
      
      // Determine if this is a Claude artifact
      const isArtifact = 
        (parsed.type === 'document' && parsed.name && parsed.content) ||
        (parsed.updates && Array.isArray(parsed.updates)) ||
        (parsed.result && parsed.textdoc_id);
      
      const type = isArtifact ? 'artifact' : 'data';
      const filename = `${baseFilename}-json-${jsonIndex}.json`;
      const filepath = join(artifactsDir, filename);
      
      // Save the pretty-printed JSON
      await writeFile(filepath, prettyJson, 'utf8');
      
      extracted.push({
        content: parsed,
        prettyContent: prettyJson,
        filename,
        type
      });
      
      // If it's a Claude document artifact, also extract the content
      if (parsed.type === 'document' && parsed.name && parsed.content) {
        const docFilename = `${baseFilename}-${parsed.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
        const docPath = join(artifactsDir, docFilename);
        const docContent = `# ${parsed.name}\n\n${parsed.content}`;
        await writeFile(docPath, docContent, 'utf8');
      }
      
      // If it's an update artifact, extract the replacement content
      if (parsed.updates && Array.isArray(parsed.updates)) {
        for (let i = 0; i < parsed.updates.length; i++) {
          const update = parsed.updates[i];
          if (update.replacement) {
            const updateFilename = `${baseFilename}-update-${jsonIndex}-${i + 1}.md`;
            const updatePath = join(artifactsDir, updateFilename);
            await writeFile(updatePath, update.replacement, 'utf8');
          }
        }
      }
      
    } catch (e) {
      console.error(`Failed to parse JSON block ${jsonIndex}:`, e);
    }
  }
  
  return extracted;
}

/**
 * Process all markdown files in a directory
 */
export async function extractJsonFromDirectory(
  directory: string,
  outputDir?: string
): Promise<Map<string, ExtractedJson[]>> {
  const { readdir } = await import('fs/promises');
  const files = await readdir(directory);
  const results = new Map<string, ExtractedJson[]>();
  
  for (const file of files) {
    if (file.endsWith('.md')) {
      const filepath = join(directory, file);
      const extracted = await extractJsonFromMarkdown(filepath, outputDir);
      if (extracted.length > 0) {
        results.set(file, extracted);
      }
    }
  }
  
  return results;
}