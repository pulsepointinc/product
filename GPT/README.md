# PulsePoint Product GPT Training Documentation

This repository contains the definitive source of truth for PulsePoint Product GPT training data.

## 📁 Structure

- `acronyms.json` - Official acronym definitions (AO, OA, PRTS, etc.)
- `products.json` - Product definitions (Studio, Workspace, HCP365, etc.)
- `stream_leads.json` - Current stream leads and responsibilities
- `meeting_formats.json` - Meeting types and naming conventions
- `official_sources.json` - Canonical URLs for documentation
- `workflow_instructions.json` - GPT behavior and search strategies

## 🔧 How GPT Accesses This Data

### Option 1: GitHub Raw URLs (Recommended)
GPT can directly access files via raw GitHub URLs:
```
https://raw.githubusercontent.com/pulsepointinc/product/main/GPT/acronyms.json
```

### Option 2: GitHub API Integration
Add GitHub API endpoints to ChatGPT Actions:
```yaml
- url: https://api.github.com/repos/pulsepointinc/product/contents/GPT/acronyms.json
```

### Option 3: Regular Sync to Confluence RAG
Set up automation to sync Git → Confluence RAG system

## 🚀 Update Workflow

1. **Make changes** to any JSON file in this repo
2. **Commit and push** to main branch
3. **GPT automatically** uses updated definitions within minutes
4. **No manual steps** required for GPT updates

## ✅ Benefits

- **Single source of truth** - No more conflicting definitions
- **Version controlled** - Track all changes
- **Programmatic access** - GPT reads structured data
- **Team collaboration** - Anyone can submit PRs
- **Instant updates** - Changes propagate immediately