/**
 * Parser Module Index for LLM Export Importer
 *
 * Exports all platform-specific parsers and utility functions for
 * auto-detection and parsing of AI chat platform exports.
 */

export { BaseParser, type ParseResult, type ParserValidationResult } from './base.js';
export { ChatGPTParser } from './chatgpt.js';
export { ClaudeParser } from './claude.js';
export { GeminiParser } from './gemini.js';
export { PerplexityParser } from './perplexity.js';

import { BaseParser, ParserValidationResult } from './base.js';
import { ChatGPTParser } from './chatgpt.js';
import { ClaudeParser } from './claude.js';
import { GeminiParser } from './gemini.js';
import { PerplexityParser } from './perplexity.js';

/**
 * Registry of all available parsers
 */
const PARSERS = [
  new ChatGPTParser(),
  new ClaudeParser(),
  new GeminiParser(),
  new PerplexityParser(),
];

/**
 * Auto-detects the platform type from export data
 */
export function detectPlatform(data: any): ParserValidationResult {
  // Try each parser's validation in order of popularity
  for (const parser of PARSERS) {
    const result = parser.validate(data);
    if (result.isValid && result.confidence > 0.7) {
      return result;
    }
  }

  // If no parser validates with high confidence, use base detection
  return BaseParser.detectPlatform(data);
}

/**
 * Gets the appropriate parser for a detected platform
 */
export function getParser(platform: string): BaseParser | null {
  return PARSERS.find(parser => parser.platform === platform) || null;
}

/**
 * Auto-detects platform and returns the appropriate parser
 */
export function autoSelectParser(
  data: any
): { parser: BaseParser; validation: ParserValidationResult } | null {
  const validation = detectPlatform(data);

  if (!validation.isValid) {
    return null;
  }

  const parser = getParser(validation.platform);

  if (!parser) {
    return null;
  }

  return { parser, validation };
}

/**
 * Parses export data using auto-detected parser
 */
export function parseExport(data: any) {
  const result = autoSelectParser(data);

  if (!result) {
    throw new Error('Unable to detect platform or find appropriate parser');
  }

  console.log(
    `Detected platform: ${result.validation.platform} (confidence: ${(result.validation.confidence * 100).toFixed(1)}%)`
  );

  if (result.validation.issues.length > 0) {
    console.warn('Validation issues:', result.validation.issues);
  }

  return result.parser.parse(data);
}
