# Project: LLM Export Importer

## Project Overview

A powerful command-line tool that transforms AI chat platform exports into organized, searchable, and version-controlled markdown archives. Focused on practical usability with git integration, artifact extraction, and smart organization - no AI classification needed.

## Core Vision

**"Transform AI chat chaos into organized knowledge"**

Convert massive JSON export files from ChatGPT, Claude, Gemini, and Perplexity into structured markdown files that can be searched with `git grep`, organized into projects, and version-controlled like code. Extract valuable artifacts (documents, code blocks, JSON data) for standalone use.

## Current Architecture (Simplified)

### Project Structure
```
llm-export-importer/
├── src/
│   ├── cli/
│   │   └── simple.ts            # Main CLI with all commands
│   ├── core/
│   │   ├── chat-exporter.ts     # Export chats to markdown with artifacts
│   │   ├── chat-list.ts         # Generate chat summaries and lists
│   │   └── project-organizer.ts # Auto-organize into projects
│   ├── parsers/                 # Platform-specific parsers
│   │   ├── base.ts             # Abstract parser interface
│   │   ├── chatgpt.ts          # OpenAI export format
│   │   ├── claude.ts           # Anthropic export format (with artifacts)
│   │   ├── gemini.ts           # Google export format
│   │   └── perplexity.ts       # Perplexity export format
│   └── utils/                   # Utilities
│       ├── file-handler.ts     # File operations
│       ├── git-utils.ts        # Git integration
│       ├── json-extractor.ts   # JSON processing utility
│       ├── package-info.ts     # Package metadata
│       └── zip-handler.ts      # ZIP file support
├── tests/                       # Test infrastructure
└── docs/                       # Documentation
```

## Key Design Principles

### 1. Simplicity and Practicality
- **No AI Dependencies**: All processing is rule-based and deterministic
- **Local Processing Only**: Everything happens on the user's machine
- **Git-First Design**: Output optimized for version control and searching
- **Direct Usability**: Immediate value without complex setup

### 2. Multi-Platform Support
- **Universal Import**: Auto-detect and parse ChatGPT, Claude, Gemini, Perplexity
- **Format Flexibility**: Handle both JSON files and ZIP archives
- **Graceful Handling**: Partial processing when exports are incomplete
- **Extensible Parsers**: Easy addition of new platforms

### 3. Rich Content Extraction
- **Claude Artifacts**: Special handling for documents, updates, and confirmations
- **Code Block Extraction**: Automatic file extension detection and extraction
- **JSON Processing**: Pretty-printing and artifact separation
- **Full Content Display**: No truncation - show everything in readable format

### 4. Smart Organization
- **Keyword-Based Projects**: Group conversations by common themes
- **Incremental Exports**: Append to existing archives without conflicts
- **Git Integration**: Automatic repository setup and commit management
- **Conflict Prevention**: Check for uncommitted changes before processing

## Target Use Cases

### Primary Workflows
1. **Knowledge Management**: Transform scattered AI conversations into searchable archives
2. **Writing Organization**: Consolidate creative writing, outlines, and character development
3. **Code Project Recovery**: Extract and organize code blocks with proper file extensions
4. **Research Compilation**: Group research conversations by topic and timeline
5. **Learning Archive**: Create permanent records of learning conversations

### Secondary Workflows
6. **Content Creation**: Organize blog posts, articles, and creative content
7. **Project Documentation**: Extract technical discussions and decisions
8. **Collaboration Prep**: Share organized conversations with team members
9. **Version Control**: Track evolution of ideas and projects over time
10. **Cross-Platform Consolidation**: Merge exports from multiple AI platforms

## Technical Implementation

### Core Commands
```bash
# List conversations in chronological order
llm-export list export.json
llm-export list export.json -f csv -o chats.csv

# Export to markdown files
llm-export export export.json -o ./my-chats
llm-export export export.json --artifacts --metadata --git

# Process artifacts and JSON
llm-export export export.json --process-artifacts -j pretty
llm-export show-json export.json

# Organize into projects
llm-export organize export.json --threshold 3 --min 2 --git

# Full workflow with git integration
llm-export full export.json -o ./archive --git --process-artifacts -j pretty

# Extract JSON from existing files
llm-export extract-json chat.md
llm-export extract-json ./exported-chats/
```

### Artifact Processing System

#### Claude Document Artifacts
```typescript
// Detect and process Claude artifacts
interface ClaudeArtifact {
  type: 'document' | 'update' | 'confirmation';
  name?: string;
  content?: string;
  textdoc_id?: string;
  updates?: Array<{
    pattern: string;
    replacement: string;
    multiple: boolean;
  }>;
}

// Processing pipeline
const processArtifacts = (jsonItems: Array<{json: any, raw: string}>) => {
  // 1. Separate document artifacts from other JSON
  // 2. Extract full content with proper unescaping
  // 3. Create separate files for each artifact type
  // 4. Generate references in main conversation
};
```

#### JSON Content Processing
```typescript
// Unescape JSON string content for display
const unescapeJsonContent = (content: string) => {
  return content
    .replace(/\\n/g, '\n')       // Newlines
    .replace(/\\t/g, '\t')       // Tabs  
    .replace(/\\"/g, '"')        // Quotes
    .replace(/\\\\/g, '\\');     // Backslashes
};

// Pretty-print JSON with formatting
const formatOptions = {
  pretty: JSON.stringify(data, null, 2),  // 2-space indentation
  collapse: JSON.stringify(data),         // Minified
  show: data                              // Raw object
};
```

### Project Organization
```typescript
// Keyword-based project detection
const detectProjects = (conversations: ConversationData[]) => {
  // 1. Extract keywords from titles and content
  // 2. Group conversations by shared keywords
  // 3. Filter by minimum conversation count
  // 4. Generate project names from common themes
};

// Example output
interface Project {
  name: string;           // "Novel Writing Project"
  conversations: string[]; // ["conv1", "conv2", "conv3"]
  keywords: string[];     // ["character", "plot", "story"]
  description: string;    // Auto-generated summary
}
```

## Platform-Specific Handling

### ChatGPT (OpenAI) Export Format
Supports both single conversation and full export formats:
```typescript
// Individual conversation
interface ChatGPTConversation {
  title: string;
  create_time: number;
  mapping: Record<string, ConversationNode>;
}

// Full export (array of conversations)
type ChatGPTExport = ChatGPTConversation[];
```

### Claude (Anthropic) Export Format
Handles both new and legacy formats with artifact support:
```typescript
// New format (2025+)
interface ClaudeExport {
  chat_messages: Array<{
    uuid: string;
    text: string;
    sender: "human" | "assistant";
    created_at: string;
  }>;
}

// Legacy format
interface ClaudeLegacyExport {
  conversations: Array<{
    id: string;
    name: string;
    messages: Array<{
      role: "human" | "assistant";
      content: string; // May contain JSON artifacts
    }>;
  }>;
}
```

### Gemini (Google) Export Format  
```typescript
interface GeminiExport {
  chats: Array<{
    title: string;
    create_time: string;
    messages: Array<{
      author: "user" | "model";
      text: string;
    }>;
  }>;
}
```

### Perplexity Export Format
```typescript
interface PerplexityExport {
  threads: Array<{
    title: string;
    created_at: string;
    messages: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
  }>;
}
```

## Output Structure

### Standard Export Format
```
exported-chats/
├── .git/                           # Git repository (with --git)
├── chat-list.md                    # Cumulative chat history
├── 2025-01-15-novel-chapter.md     # Individual conversations
├── 2025-01-16-character-dev.md     # Date + sanitized title
├── artifacts/                      # Extracted content
│   ├── novel-chapter-artifact-outline.md      # Claude documents
│   ├── novel-chapter-msg2-1.json             # Pretty JSON
│   ├── character-dev-msg5-1.py               # Code blocks
│   └── character-dev-update-2-1-1.md         # Update content
└── projects/                       # Auto-organized projects
    ├── Novel Writing Project/
    │   ├── README.md               # Project summary
    │   └── conversations.md        # Linked conversations
    └── Code Development/
        ├── README.md
        └── conversations.md
```

### Git Workflow Integration
With `--git` flag, each export creates:
```bash
# First export
git init
git add .
git commit -m "Export 150 conversations from Claude (2025-01-25)"

# Subsequent exports (appends)
git add .
git commit -m "Export 75 new conversations from ChatGPT (2025-01-26)"
```

### Artifact File Types
- **`.md` files**: Claude documents and updates with full content
- **`.json` files**: Pretty-printed JSON data with 2-space indentation  
- **Code files**: `.py`, `.js`, `.ts`, etc. based on language detection
- **Text files**: `.txt` for unknown or plain text content

## Key Features Summary

### ✅ Current Implementation
- **Multi-platform parsing**: ChatGPT, Claude, Gemini, Perplexity
- **Rich artifact extraction**: Code blocks, JSON data, Claude documents  
- **Git integration**: Automatic repository setup and commits
- **Smart organization**: Keyword-based project detection
- **Full content display**: No truncation of artifacts or JSON
- **Incremental exports**: Append to existing archives
- **ZIP file support**: Handle compressed exports
- **Privacy-first**: 100% local processing

### 🎯 Optimized For
1. **Writers**: Extract story outlines, character development, plot notes
2. **Developers**: Organize code discussions and technical conversations
3. **Researchers**: Consolidate research conversations by topic
4. **Students**: Archive learning conversations for future reference
5. **Content Creators**: Organize blog posts and article drafts

### 🔍 Search & Discovery
After export, use git to search across all conversations:
```bash
cd exported-chats
git grep -i "character development"      # Find all character discussions  
git grep -B5 -A5 "function.*async"      # Code with context
git log --oneline --name-status         # Track changes over time
```

## Development Approach

### Simplicity Over Complexity
The tool was deliberately simplified from an ambitious AI-powered classification system to a practical, deterministic solution that:
- ✅ **Works immediately** without API keys or setup
- ✅ **Processes locally** with no privacy concerns  
- ✅ **Outputs git-ready** files for version control
- ✅ **Extracts artifacts** with proper formatting
- ✅ **Organizes intelligently** using keyword patterns

### Future Enhancements
Potential areas for expansion while maintaining simplicity:
- **More platforms**: Support for additional AI chat platforms
- **Better artifact detection**: Enhanced recognition of embedded content
- **Improved organization**: Smarter project grouping algorithms
- **Export formats**: Direct integration with writing tools (Obsidian, Notion)
- **Incremental sync**: Watch folders for new exports

## Success Stories

The tool successfully transforms:
- 📝 **Scattered writing conversations** → Organized novel outlines and character development
- 💻 **Code discussions** → Properly formatted code files with context
- 🔬 **Research chats** → Searchable knowledge bases by topic
- 📚 **Learning conversations** → Permanent reference archives
- 🎯 **Project planning** → Version-controlled documentation

## Conclusion

LLM Export Importer solves the fundamental problem of valuable knowledge being trapped in chaotic AI chat exports. By focusing on practical usability over complex features, it provides immediate value:

**Before**: Thousands of conversations buried in JSON files
**After**: Organized, searchable, version-controlled knowledge base

The tool respects user privacy, requires no configuration, and produces output that integrates seamlessly with existing developer and writer workflows. It's the bridge between AI-assisted work and traditional knowledge management systems.

Transform your AI conversation chaos into organized, searchable knowledge! 🚀