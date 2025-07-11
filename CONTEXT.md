# LLM Export Importer - Project Context

## Project Status
This is a new project being bootstrapped from the Writer CLI project. The core files have been copied from the `future/` directory of the Writer CLI project.

## Project Purpose
Extract and organize writing content from AI chat platform exports (ChatGPT, Claude.ai, Gemini, Perplexity). This solves the problem of valuable writing work being trapped in massive, unstructured JSON export files.

## Current State
- **Core files copied**: PRD, CLAUDE.md, and example TypeScript implementations
- **Basic structure created**: README, package.json, tsconfig.json, LICENSE, .gitignore
- **Git not initialized**: Needs `git init` and initial commit
- **GitHub repo not created**: Needs to be created as `jcrigby/llm-export-importer`

## Next Steps for New Claude Code Instance

### 1. Initialize Git Repository
```bash
git init
git add .
git commit -m "Initial commit: LLM Export Importer project

Extract and organize writing content from AI chat platform exports.
Supports ChatGPT, Claude, Gemini, and Perplexity formats with intelligent
classification and cost-optimized processing."
```

### 2. Create GitHub Repository
```bash
# If you have gh CLI:
gh repo create jcrigby/llm-export-importer --public --source=. --remote=origin --push

# Or create on GitHub.com and then:
git remote add origin git@github.com:jcrigby/llm-export-importer.git
git branch -M main
git push -u origin main
```

### 3. Complete Project Structure
The following directories and files need to be created:

```
src/
├── cli/
│   ├── index.ts         # CLI entry point
│   └── commands/        # Command implementations
├── parsers/             # Platform-specific parsers
│   ├── base.ts         # Abstract parser interface
│   ├── chatgpt.ts      # ChatGPT export parser
│   ├── claude.ts       # Claude export parser
│   ├── gemini.ts       # Gemini export parser
│   └── perplexity.ts   # Perplexity export parser
├── classification/      # Already has pipeline.ts
│   ├── rule-filter.ts  # Extract from pipeline.ts
│   └── ai-classifier.ts # Extract from pipeline.ts
├── optimization/        # Already has model-selector.ts
│   ├── pricing.ts      # OpenRouter pricing integration
│   └── validator.ts    # Model validation system
├── organizers/
│   ├── project-detector.ts
│   └── entity-extractor.ts
└── exporters/
    ├── markdown.ts
    ├── writer-cli.ts
    └── scrivener.ts
```

### 4. Implement Core Features
Priority order for implementation:

1. **Platform Parsers** (start with ChatGPT as it's most common)
2. **CLI Framework** using Commander.js
3. **Rule-based Filter** (extract from pipeline.ts)
4. **Basic Markdown Export**
5. **Interactive Mode** with Inquirer.js
6. **AI Classification** (once basic flow works)
7. **Advanced Exporters** (Writer CLI, Scrivener)

### 5. Testing Strategy
```
tests/
├── fixtures/           # Sample export files
│   ├── chatgpt-sample.json
│   ├── claude-sample.json
│   └── ...
├── unit/
│   ├── parsers/
│   ├── classification/
│   └── ...
└── integration/
    └── full-workflow.test.ts
```

### 6. Documentation Updates
- Add usage examples to README
- Create docs/platform-formats.md with detailed format specs
- Add CONTRIBUTING.md with development guidelines
- Create docs/classification.md explaining the system

## Key Design Decisions

### Privacy-First Architecture
- All processing happens locally
- No content sent to external services except for classification
- Classification uses separate API keys from user's writing work

### Cost Optimization
- Default to ultra-cheap models (DeepSeek, Qwen) for classification
- Validate accuracy before processing
- Show transparent cost estimates to users

### Hybrid Classification
- Stage 1: Fast rule-based filtering (no API calls)
- Stage 2: AI classification only for potential writing content
- Batch processing to minimize API calls

## Configuration Approach
- Use YAML for configuration files
- Support environment variables for API keys
- Allow per-import configuration overrides

## Technical Notes
- Target Node.js 18+ for better performance
- Use TypeScript for type safety
- Follow Writer CLI patterns where applicable
- Keep dependencies minimal

## Questions to Resolve
1. Should we support streaming for very large files?
2. How to handle incremental imports (new conversations only)?
3. Should we add a web UI later or stay CLI-only?
4. Integration with Writer CLI - direct or via export files?

## Original Context
This project was conceived while working on the Writer CLI to solve a specific problem: users have valuable writing work scattered across AI chat sessions that's difficult to extract and organize. The export files from these platforms are massive JSON files that mix writing with code, casual chat, and other content.

The key insight was to use cheap AI models (like DeepSeek at ~$0.00014/token) to classify content, making it economically viable to process huge export files while maintaining privacy by keeping the actual content local.

## Resources
- PRD: `docs/PRD.md` - Full product requirements
- Technical Spec: `CLAUDE.md` - Detailed architecture
- Example Code: `src/` - Working TypeScript examples
- Writer CLI: `github.com/jcrigby/writer-cli` - Parent project