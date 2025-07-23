# LLM Export Importer

A straightforward tool to organize your AI chat exports from ChatGPT, Claude, Gemini, and Perplexity into searchable markdown files.

## Quick Start

```bash
# Install
npm install -g llm-export-importer

# List all your chats in date order
llm-export list your-export.json

# Export all chats to markdown files (perfect for git grep)
llm-export export your-export.json

# Auto-organize chats into projects
llm-export organize your-export.json

# Do everything at once
llm-export full your-export.json
```

## Core Features

### 1. List Chats in Date Order
See all your conversations sorted by date, just like in the web interface:

```bash
llm-export list chatgpt-export.json

# Save to file
llm-export list chatgpt-export.json -o chat-list.md

# Export as CSV for spreadsheets
llm-export list chatgpt-export.json -f csv -o chats.csv
```

### 2. Export to Individual Markdown Files
Each chat becomes its own markdown file, perfect for version control and searching:

```bash
llm-export export claude-export.json -o ./my-chats

# Extract code blocks as separate files
llm-export export claude-export.json -o ./my-chats --artifacts

# Include metadata in exports
llm-export export claude-export.json -o ./my-chats --metadata
```

After export, you can:
- `git init && git add .` to version control your chats
- `git grep "search term"` to search through all conversations
- Open any chat in your favorite markdown editor

### 3. Organize into Projects
Automatically group related conversations:

```bash
llm-export organize gemini-export.json -o ./organized-chats

# Adjust project detection sensitivity
llm-export organize gemini-export.json --threshold 5 --min 3
```

### 4. Full Export
Do everything in one command:

```bash
llm-export full perplexity-export.json -o ./my-archive
```

This will:
1. Create a chat list summary
2. Export all chats as individual markdown files
3. Extract code artifacts
4. Auto-organize into projects
5. Set up everything for git

## Output Structure

```
exported-chats/
├── chat-list.md                    # Summary of all chats
├── 2024-01-15-novel-chapter-1.md   # Individual chat files
├── 2024-01-16-character-dev.md     # Named by date + title
├── artifacts/                      # Extracted code blocks
│   ├── novel-chapter-1-msg2-1.py
│   └── character-dev-msg5-1.js
└── projects/                       # Auto-detected projects
    ├── Novel Writing Project/
    │   ├── README.md
    │   ├── project.json
    │   └── conversations.md
    └── Code Tutorial Project/
        ├── README.md
        ├── project.json
        └── conversations.md
```

## File Naming

- Chat files: `YYYY-MM-DD-sanitized-title.md`
- Artifacts: `{chat-title}-msg{number}-{index}.{extension}`
- Projects: Auto-named based on common keywords

## Supported Platforms

- ✅ ChatGPT (OpenAI)
- ✅ Claude (Anthropic)
- ✅ Gemini (Google)
- ✅ Perplexity

The tool auto-detects the export format.

## Tips

1. **For Searching**: After export, use `git grep` for powerful searching:
   ```bash
   git grep -i "character name"
   git grep "function.*async"
   ```

2. **For Organization**: The auto-project detection looks for common keywords. Chats about similar topics will be grouped together.

3. **For Artifacts**: Code blocks are extracted with proper file extensions based on the language specified in markdown.

4. **For Privacy**: Everything runs locally. Your chats never leave your computer.

## Examples

```bash
# Quick exploration of an export
llm-export list my-export.json | less

# Full archival with everything
llm-export full my-export.json -o ~/Documents/ai-chats-archive

# Just the chats, no extras
llm-export export my-export.json -o ./simple-export

# Focus on organization
llm-export organize my-export.json --threshold 2 --min 2
```

## Next Steps

After organizing your chats:
1. Initialize git: `cd exported-chats && git init`
2. Commit everything: `git add . && git commit -m "Initial chat archive"`
3. Search freely: `git grep "any topic"`
4. Track changes: Make edits and use git to track them
5. Share projects: Each project folder is self-contained

Enjoy your organized chat history!