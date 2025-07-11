# LLM Export Importer

Extract and organize writing content from AI chat platform exports (ChatGPT, Claude, Gemini, Perplexity).

## 🎯 Problem

Your valuable writing work is trapped in massive JSON export files from AI chat platforms. This tool rescues that content by:

- **Parsing** multi-format exports from all major AI platforms
- **Classifying** content to identify actual writing vs code/chat/etc
- **Organizing** related conversations into coherent writing projects  
- **Exporting** to useful formats for continued work

## ✨ Features

- **Multi-Platform Support**: ChatGPT, Claude.ai, Gemini, Perplexity
- **Intelligent Classification**: Hybrid rule-based + AI-powered content detection
- **Cost Optimization**: Automatic selection of cheapest effective AI models
- **Privacy-First**: All processing happens locally on your machine
- **Multiple Output Formats**: Writer CLI, Markdown, Scrivener, JSON

## 🚀 Quick Start

```bash
# Install
npm install -g llm-export-importer

# Configure API access (for AI classification)
llm-import config --openrouter-key your-key-here

# Process an export
llm-import --file chatgpt-export.json --interactive

# Or process multiple files
llm-import --dir ~/Downloads/ai-exports/ --auto-detect
```

## 📊 How It Works

1. **Parse Export**: Auto-detect platform format and extract conversations
2. **Pre-Filter**: Fast rule-based elimination of obvious non-writing content
3. **AI Classification**: Smart detection of writing content using cost-optimized models
4. **Organize**: Group related conversations into projects by theme/topic
5. **Export**: Generate organized output in your preferred format

## 💰 Cost Optimization

The tool automatically finds the cheapest AI model that meets accuracy requirements:

```
🔍 Testing models for optimal cost/accuracy...
   deepseek/deepseek-chat: 87% accuracy, $0.28 total cost ✅
   qwen/qwen-2.5-72b: 91% accuracy, $0.40 total cost
   gpt-3.5-turbo: 94% accuracy, $3.00 total cost
```

Typical costs: **<$0.50** for processing 50,000 conversations

## 🔒 Privacy & Security

- **Local Processing**: Your content never leaves your machine
- **API Separation**: Classification uses dedicated API keys
- **No Logging**: Content is never logged or cached
- **Secure Cleanup**: Automatic removal of temporary files

## 📁 Output Formats

### Writer CLI Format
```
my-novel/
├── .claude/
│   ├── config.json
│   ├── characters.json
│   └── timeline.json
├── chapters/
│   ├── 01-opening.md
│   └── 02-conflict.md
└── research/
    └── world-building.md
```

### Markdown Collection
```
imported-writing/
├── fiction-project/
│   ├── README.md
│   ├── conversations/
│   └── timeline.md
└── blog-posts/
    └── drafts/
```

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/jcrigby/llm-export-importer.git
cd llm-export-importer

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

## 📖 Documentation

- [Product Requirements Document](docs/PRD.md)
- [Technical Specification](CLAUDE.md)
- [Platform Export Formats](docs/platform-formats.md)
- [Classification System](docs/classification.md)

## 🤝 Contributing

Contributions welcome! Please read our [Contributing Guide](CONTRIBUTING.md) first.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🙏 Acknowledgments

Built to solve the real problem of fragmented writing work across AI chat platforms. Special thanks to the writing community for feedback and use case examples.

---

**Made for writers, by writers** 📝