/**
 * Package Information Utility
 * 
 * Provides access to package.json metadata for CLI version display.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Use require.resolve to find the package.json path
const packageJsonPath = (() => {
  try {
    // Try to find package.json from the project root
    return require.resolve('../../package.json');
  } catch {
    // Fallback to a relative path
    return join(process.cwd(), 'package.json');
  }
})();

interface PackageInfo {
  name: string;
  version: string;
  description: string;
  author: string;
}

let cachedPackageInfo: PackageInfo | null = null;

export const packageInfo: PackageInfo = (() => {
  if (cachedPackageInfo) {
    return cachedPackageInfo;
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    cachedPackageInfo = {
      name: packageJson.name || 'llm-export-importer',
      version: packageJson.version || '0.1.0',
      description: packageJson.description || 'Extract and organize writing content from AI chat platform exports',
      author: packageJson.author || 'jcrigby'
    };
    return cachedPackageInfo;
  } catch (error) {
    // Fallback if package.json can't be read
    cachedPackageInfo = {
      name: 'llm-export-importer',
      version: '0.1.0',
      description: 'Extract and organize writing content from AI chat platform exports',
      author: 'jcrigby'
    };
    return cachedPackageInfo;
  }
})();