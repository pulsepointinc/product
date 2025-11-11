# Knowledge Layer v5 - Confluence & Jira Integration Summary

## ✅ Integration Complete

The Knowledge Layer API v5 is now fully integrated with:
1. **Confluence API** (`pulsepoint-confluence-api-v3`) - ✅ Working
2. **Jira API** (`jira-api-v4-dual-mode`) - ✅ Working

## What Was Updated

### Confluence API Integration (Fixed)
- **Before**: Used incorrect parameter `limit` 
- **After**: Uses correct parameters:
  - `max_results`: 10 (number of results to return)
  - `min_similarity`: 0.01 (low threshold for reliable results)
  - `query`: Search terms extracted from question

### Jira API Integration (Already Working)
- ✅ Intelligent parameter extraction
- ✅ Supports Epics, Stories, Aggregation queries
- ✅ Team filtering
- ✅ Product/Stream filtering
- ✅ Date-based queries (sprint, release)

## How It Works

### For Questions Requiring Confluence Data
1. User asks question via GPT
2. Knowledge Layer extracts keywords and intent
3. Calls Confluence API with optimized search terms
4. Calls Jira API if question mentions tickets/epics
5. Synthesizes results using OpenAI
6. Returns comprehensive answer with sources

### For Questions Requiring Jira Data
1. User asks question via GPT
2. Knowledge Layer detects Jira intent
3. Calls Jira API with intelligent filters
4. Calls Confluence API for context (unless Jira-only query)
5. Synthesizes results using OpenAI
6. Returns answer with JQL links and ticket details

### For Combined Queries
1. User asks question that needs both sources
2. Knowledge Layer calls both APIs concurrently
3. Combines results intelligently
4. Synthesizes comprehensive answer
5. Returns answer with all sources

## API Endpoints

### Main Endpoint
- **URL**: `https://knowledge-layer-v5-420423430685.us-east4.run.app/ask`
- **Method**: POST
- **Request**:
  ```json
  {
    "question": "What are AO factors and what tickets are in the current sprint?",
    "session_id": "optional",
    "conversation_history": [],
    "max_results": 50
  }
  ```

### Health Check
- **URL**: `https://knowledge-layer-v5-420423430685.us-east4.run.app/`
- **Method**: GET

## Features Preserved

✅ All intelligent query analysis  
✅ All OpenAI synthesis features  
✅ All session management  
✅ All error handling  
✅ All Jira integration features  
✅ All GitHub integration  
✅ All Document360 integration  

## Testing

### Test Confluence Integration
```bash
curl -X POST "https://knowledge-layer-v5-420423430685.us-east4.run.app/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"What are AO factors?"}'
```

### Test Jira Integration
```bash
curl -X POST "https://knowledge-layer-v5-420423430685.us-east4.run.app/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"What tickets are in the current sprint?"}'
```

### Test Combined Query
```bash
curl -X POST "https://knowledge-layer-v5-420423430685.us-east4.run.app/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"What is the AO roadmap and what are the AO factors?"}'
```

## Next Steps for GPT Integration

1. **Update GPT Instructions**: Point to `knowledge-layer-v5` endpoint
2. **Update YAML Actions**: Use the `/ask` endpoint
3. **Test with Real Questions**: Verify Confluence and Jira results are returned

## Service Information

- **Service Name**: `knowledge-layer-v5`
- **URL**: https://knowledge-layer-v5-420423430685.us-east4.run.app
- **Region**: us-east4
- **Status**: ✅ Deployed and Active
- **Revision**: knowledge-layer-v5-00047-zhb

