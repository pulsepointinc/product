# Knowledge Layer v5 - Complete Feature Documentation

## Overview
This document preserves all features and functionality of the Knowledge Layer API v5 to ensure nothing is lost during updates.

## Current Status
- **Service**: `knowledge-layer-v5`
- **URL**: https://knowledge-layer-v5-kpwy2mbv7a-uk.a.run.app
- **Status**: ✅ Active and Working
- **Last Updated**: 2025-11-10

## Core Features (ALL PRESERVED)

### 1. Multi-Source Data Integration ✅
- **Confluence API**: `https://pulsepoint-confluence-api-v3-420423430685.us-east4.run.app`
  - Uses `/search` endpoint with POST
  - Parameters: `query`, `max_results`, `min_similarity`
  - Returns: Full page content with URLs
- **Jira API**: `https://us-east4-pulsepoint-datahub.cloudfunctions.net/jira-api-v4-dual-mode/tickets`
  - Intelligent parameter extraction
  - Supports Epics, Stories, aggregation queries
  - Returns: Tickets with full metadata
- **GitHub API**: `https://us-east4-pulsepoint-datahub.cloudfunctions.net/pulsepoint-git-api-v2`
  - Repository search
  - Returns: Repository details with descriptions
- **Document360 API**: `https://pulsepoint-document360-api-v1-420423430685.us-east4.run.app`
  - Article search
  - Returns: Article content with URLs

### 2. Intelligent Query Analysis ✅
- **Keyword Extraction**: Removes stop words, extracts meaningful keywords
- **Intent Detection**: 
  - `jira_only` - Jira-specific queries
  - `aggregation` - Count/sum queries
  - `listing` - List/show queries
  - `comparison` - Compare/difference queries
  - `current_sprint` - Sprint-specific queries
  - `general` - General queries
- **Date Detection**: 
  - Current sprint, last sprint, next sprint
  - Current release, last release, next release
  - Year-to-date, rest of year
- **Team Detection**: Front End, Backend, Data Analysis
- **Product/Stream Detection**: Uses GitHub product mappings

### 3. Intelligent Jira Filtering ✅
- **Product Mappings**: Loads from GitHub `products.json`
- **Stream Leads**: Loads from GitHub `stream_leads.json`
- **Acronyms**: Loads from GitHub `acronyms.json`
- **Jira Field Definitions**: Loads from GitHub `jira_field_definitions.json`
- **Smart Filtering**: 
  - Product-based filtering
  - Stream-based filtering
  - Team-based filtering
  - Summary-based search (e.g., "Omnichannel")

### 4. OpenAI-Powered Synthesis ✅
- **Model**: GPT-4o-mini
- **Features**:
  - Combines all data sources intelligently
  - Only uses actual data (no hallucination)
  - Provides clickable source links
  - Handles aggregation queries with pre-calculated totals
  - Organizes roadmap queries by sprint/release dates
  - Creates JQL links with actual issue IDs
- **Context Building**: 
  - JIRA context (tickets organized by sprint)
  - Confluence context (full page content)
  - GitHub context (repository details)
  - Document360 context (article content)

### 5. Session Management ✅
- **Session ID Generation**: Based on question hash + timestamp
- **Conversation History**: Tracks last 3 messages for context
- **Context Awareness**: Uses history for better search terms

### 6. Response Formatting ✅
- **Sources Section**: Lists all data sources used
- **JQL Links**: Creates clickable JQL links for Jira queries
- **Inline Links**: Confluence, GitHub, Document360 links inline
- **Structured Responses**: Organized by sprint/release dates for roadmaps

### 7. Error Handling ✅
- **API Failures**: Graceful degradation (continues with available sources)
- **OpenAI Failures**: Falls back to basic response
- **Timeout Handling**: 20-second timeouts per API call
- **Error Messages**: Clear error reporting

### 8. Query Optimization ✅
- **Intent-Based Routing**: 
  - Jira-only queries skip other sources
  - Aggregation queries use Jira only
  - General queries use all sources
- **Result Limiting**: 
  - Confluence: 10 results max
  - Jira: 50-200 results (based on query type)
  - GitHub: 5 repositories max
  - Document360: 5 articles max
- **Smart Search Terms**: 
  - Uses keywords for better matching
  - Context-aware search (e.g., "AO factors" when AO context exists)

## API Endpoints

### Main Endpoint: `/ask` (POST)
**Request:**
```json
{
  "question": "What are AO factors?",
  "session_id": "optional_session_id",
  "conversation_history": [],
  "max_results": 50
}
```

**Response:**
```json
{
  "synthesis_response": {
    "response": "Comprehensive answer...",
    "sources": ["JIRA API", "Confluence API", "GitHub API", "Document360 API"],
    "synthesis_method": "openai_gpt4o_mini",
    "session_id": "session_xxx",
    "version": "5.0-FIXED-DATA-SOURCES",
    "api_status": {
      "data_sources_queried": 4,
      "data_sources_successful": 4,
      "jira_query_success": true,
      "confluence_api_success": true,
      "github_api_success": true,
      "document360_api_success": true,
      "confluence_sources": 5,
      "github_repos": 3,
      "document360_articles": 2
    }
  }
}
```

### Health Check: `/` (GET)
Returns service status and features.

## Recent Updates (2025-11-10)

### ✅ Fixed Confluence API Integration
- Changed parameter from `limit` to `max_results` (correct API parameter)
- Added `min_similarity: 0.01` for reliable results
- Verified API endpoint: `pulsepoint-confluence-api-v3`

### ✅ Verified Jira API Integration
- Already correctly configured
- Uses intelligent parameter extraction
- Supports all query types (Epics, Stories, Aggregation)

### ✅ Preserved All Features
- All intelligent query analysis preserved
- All OpenAI synthesis features preserved
- All session management preserved
- All error handling preserved

## Deployment Information

### Source Code Location
- **Path**: `/Users/bweinstein/product-gpt/knowledge_layer_v5_deploy/main.py`
- **Requirements**: `/Users/bweinstein/product-gpt/knowledge_layer_v5_deploy/requirements.txt`

### Deployment Command
```bash
cd /Users/bweinstein/product-gpt/knowledge_layer_v5_deploy
gcloud run deploy knowledge-layer-v5 \
  --source . \
  --platform managed \
  --region us-east4 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --timeout 300s \
  --max-instances 10
```

## Testing

### Test Confluence Integration
```bash
curl -X POST "https://knowledge-layer-v5-kpwy2mbv7a-uk.a.run.app/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"What are AO factors?"}'
```

### Test Jira Integration
```bash
curl -X POST "https://knowledge-layer-v5-kpwy2mbv7a-uk.a.run.app/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"What tickets are in the current sprint?"}'
```

### Test Combined Query
```bash
curl -X POST "https://knowledge-layer-v5-kpwy2mbv7a-uk.a.run.app/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is the AO roadmap and what are the AO factors?"}'
```

## Critical Notes

1. **Confluence API**: Always use `max_results` (not `limit`) and `min_similarity: 0.01`
2. **Jira API**: Uses intelligent parameter extraction - don't hardcode parameters
3. **OpenAI Synthesis**: Only uses actual data - never hallucinates
4. **Session Management**: Preserves conversation context for better results
5. **Error Handling**: Gracefully degrades if one source fails

## Future Enhancements (Not Yet Implemented)

- Vector similarity search for Confluence (currently using text search)
- Embedding-based retrieval
- Caching layer for frequently asked questions
- Real-time data source health monitoring

