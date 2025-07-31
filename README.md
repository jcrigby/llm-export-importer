# LLM Export Importer

A powerful tool to extract, organize, and version-control your AI chat exports from ChatGPT and Claude. Transform chaotic JSON exports into organized, searchable markdown files with full git integration and complete artifact extraction.

## ✨ Key Features

- **🔍 Full-text search** with `git grep` across all conversations
- **📁 Smart organization** into projects with auto-detection
- **🎯 Artifact extraction** for code blocks, documents, and JSON data
- **🔧 Git integration** with automatic repository setup and commits
- **📝 Rich content support** including complete Claude artifact extraction with full content
- **🔄 Incremental exports** that append to existing archives
- **🚀 Zero configuration** - just point and export

## Installation

### Option 1: Install from GitHub (Recommended)
```bash
# Install directly from GitHub
npm install -g github:jcrigby/llm-export-importer

# Or add to your project
npm install github:jcrigby/llm-export-importer
```

### Option 2: Clone and Install Locally
```bash
# Clone the repository
git clone https://github.com/jcrigby/llm-export-importer.git
cd llm-export-importer

# Install dependencies and build
npm install
npm run build

# Install globally from local build
npm install -g .
```

### Option 3: NPM (Coming Soon)
```bash
# Will be available after npm publish
npm install -g llm-export-importer
```

## Quick Start

```bash
# List all your chats in date order
llm-export list your-export.json

# Export with full features and git setup
llm-export full your-export.json --git --process-artifacts -j pretty

# Simple export to markdown files
llm-export export your-export.json -o ./my-chats

# Auto-organize into projects
llm-export organize your-export.json -o ./organized
```

## Core Commands

### 1. 📋 List Chats
See all your conversations sorted by date:

```bash
llm-export list chatgpt-export.json

# Save to file or export as CSV
llm-export list chatgpt-export.json -o chat-list.md
llm-export list chatgpt-export.json -f csv -o chats.csv
```

### 2. 📤 Export Chats
Convert chats to individual markdown files:

```bash
# Basic export
llm-export export claude-export.json -o ./my-chats

# Full-featured export with git setup
llm-export export claude-export.json -o ./my-chats \
  --artifacts --metadata --process-artifacts \
  -j pretty --git

# Process ZIP files
llm-export export claude-export.zip -o ./my-chats
```

**New Features:**
- **`--process-artifacts`**: Extracts Claude documents and artifacts as separate files
- **`-j pretty`**: Pretty-prints JSON with proper formatting
- **`--git`**: Automatically initializes git repo and commits files
- **ZIP support**: Handles both JSON and ZIP export files

### 3. 🗂️ Organize Projects
Automatically group related conversations:

```bash
llm-export organize claude-export.json -o ./organized-chats --git

# Adjust sensitivity
llm-export organize claude-export.json --threshold 5 --min 3
```

### 4. 🚀 Full Export
Do everything in one command:

```bash
llm-export full claude-export.json -o ./my-archive \
  --git --process-artifacts -j pretty
```

**What it does:**
1. ✅ Creates cumulative chat list (appends to existing)
2. ✅ Exports all chats as individual markdown files  
3. ✅ Extracts and processes all artifacts
4. ✅ Auto-organizes into projects
5. ✅ Initializes git and commits everything
6. ✅ Sets up for instant searching with `git grep`

### 5. 🔧 Extract JSON (Bonus)
Process existing markdown files to extract JSON:

```bash
llm-export extract-json chat.md
llm-export extract-json ./exported-chats/
```

## 📁 Output Structure

```
exported-chats/
├── .git/                           # Git repository (with --git)
├── chat-list.md                    # Cumulative chat history
├── 2025-01-15-novel-chapter-1.md   # Individual chat files
├── 2025-01-16-character-dev.md     # Named by date + title
├── artifacts/                      # Extracted content
│   ├── novel-chapter-1-artifact-outline.md      # Claude documents
│   ├── novel-chapter-1-msg2-1.json             # Pretty JSON data
│   ├── character-dev-msg5-1.py                 # Code blocks
│   └── character-dev-update-2-1-1.md           # Update content
└── projects/                       # Auto-detected projects
    ├── Novel Writing Project/
    │   ├── README.md               # Project summary
    │   └── conversations.md        # Linked conversations
    └── Code Tutorial Project/
        ├── README.md
        └── conversations.md
```

## 🏷️ File Naming

- **Chat files**: `YYYY-MM-DD-sanitized-title.md`
- **Claude artifacts**: `{chat-title}-artifact-{document-name}.md`
- **JSON data**: `{chat-title}-msg{number}-{index}.json`
- **Code blocks**: `{chat-title}-msg{number}-{index}.{extension}`
- **Updates**: `{chat-title}-update-{msg}-{item}-{index}.md`

## 🔌 Supported Platforms

- ✅ **ChatGPT** (OpenAI) - JSON and ZIP exports with full conversation history
- ✅ **Claude** (Anthropic) - JSON and ZIP exports with **complete artifact extraction**
  - Full tool_use artifact content (no more placeholder text!)
  - Document creation, updates, and modifications
  - Code blocks, data files, and structured content
- 🚧 **Gemini** (Google) - Basic JSON support (future: enhanced artifact extraction)
- 🚧 **Perplexity** - Basic JSON support (future: search context and citations)

The tool auto-detects the export format and handles both single JSON files and ZIP archives.

### Current Status
- **Production ready**: ChatGPT and Claude with full feature support
- **Future work**: Enhanced Gemini and Perplexity support with platform-specific features

## 💡 Advanced Features

### Git Integration
With `--git` flag, the tool will:
- ✅ Check for uncommitted changes before starting
- ✅ Initialize git repository if needed
- ✅ Commit all exported files with descriptive messages
- ✅ Allow incremental exports with proper conflict detection

### Claude Artifact Processing
With `--process-artifacts`, Claude exports get special treatment:
- 📄 **Documents**: Full content extracted from tool_use artifacts (no placeholders!)
- 🔄 **Updates**: Document updates saved as separate files with complete content
- 📊 **JSON**: All embedded JSON pretty-printed and saved
- 🔗 **Links**: References maintained between files
- ✨ **Complete extraction**: Over 51K+ characters of content vs previous placeholder text

### Smart JSON Handling
- **Pretty printing**: `-j pretty` formats all JSON with proper indentation
- **Artifact detection**: Distinguishes between Claude artifacts and generic JSON
- **Full expansion**: Complete tool_use artifact extraction (recently fixed!)
- **No more placeholders**: Extracts actual content instead of "This block is not supported" messages

## 🔍 Power User Tips

1. **Searching across everything**:
   ```bash
   cd exported-chats
   git grep -i "character development"    # Case-insensitive
   git grep -B5 -A5 "function.*async"    # With context
   git grep --name-only "novel outline"  # Just filenames
   ```

2. **Incremental workflows**:
   ```bash
   # First export
   llm-export full export1.json -o ./archive --git

   # Later exports (appends and commits)
   llm-export full export2.json -o ./archive --git
   ```

3. **Focus on specific content**:
   ```bash
   # Only process artifacts
   llm-export export export.json --process-artifacts -j pretty

   # Show embedded JSON without extraction
   llm-export show-json export.json
   ```

## 🚀 Examples

```bash
# Quick exploration
llm-export list my-export.json | head -20

# Full archival with git
llm-export full my-export.json -o ~/ai-chats --git --process-artifacts -j pretty

# Focus on Claude artifacts
llm-export export claude-export.json --process-artifacts -j pretty

# Organize existing collection
llm-export organize my-export.json --git --threshold 2

# Extract JSON from existing files
llm-export extract-json ./exported-chats/
```

## 🎯 Workflow Examples

### For Writers
```bash
# Export your writing conversations with full artifact support
llm-export full claude-writing-export.json -o ./writing-archive \
  --git --process-artifacts -j pretty

# Search for character mentions across all conversations
cd writing-archive && git grep -i "protagonist.*chris"
```

### For Developers  
```bash
# Export code-focused conversations
llm-export export chatgpt-code-export.json --artifacts --git

# Find all Python code blocks
cd exported-chats && find artifacts/ -name "*.py" | xargs grep "def "
```

### For Researchers
```bash
# Organize research conversations by topic
llm-export organize research-export.json --threshold 3 --min 2 --git

# Track research evolution over time
cd exported-chats && git log --oneline --name-status
```

## 🔒 Privacy & Security

- ✅ **100% local processing** - Your data never leaves your computer
- ✅ **No cloud dependencies** - All processing happens offline  
- ✅ **Git-ready output** - Version control your conversations safely
- ✅ **Structured extraction** - Easy to audit what's exported

Transform your AI conversation chaos into organized, searchable knowledge! 🎉