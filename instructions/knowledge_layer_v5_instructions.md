# PulsePoint Knowledge Layer API v5 - Instructions

## CRITICAL UPDATE - FIXED DATA SOURCE INTEGRATION

**Version**: 5.0-FIXED-DATA-SOURCES  
**Status**: ✅ DEPLOYED AND WORKING  
**URL**: https://us-east4-pulsepoint-datahub.cloudfunctions.net/knowledge-layer-v5

## What Was Fixed

The previous v4-intelligent API had critical failures:
- ❌ Hardcoded responses instead of actual search
- ❌ Confluence API returning "error" status
- ❌ Document360 API returning "error" status  
- ❌ Generic GitHub repositories unrelated to queries
- ❌ Timeout issues and system instability

**v5 FIXES ALL OF THESE ISSUES:**
- ✅ All data sources now use actual search instead of hardcoded responses
- ✅ Confluence API - POST with JSON body to /search endpoint
- ✅ Document360 API - GET with query parameters
- ✅ GitHub API - POST with question parameter
- ✅ JIRA API - Intelligent parameter extraction
- ✅ OpenAI-powered synthesis combining all data sources
- ✅ Proper source attribution and clickable links

## How to Use

### Basic Query
```json
{
  "question": "What are AO factors?"
}
```

### With Session Management
```json
{
  "question": "What are AO factors?",
  "session_id": "session_1758894739_327cd516",
  "conversation_history": [],
  "max_results": 50
}
```

## Response Format

The API returns a comprehensive response with:
- **Synthesized content** combining all data sources
- **Source attribution** with clickable links
- **API status** showing which data sources succeeded
- **Session management** for conversation continuity

## Data Sources

1. **JIRA API**: https://us-east4-pulsepoint-datahub.cloudfunctions.net/jira-api-v4-dual-mode/tickets
2. **Confluence API**: https://pulsepoint-confluence-api-v3-420423430685.us-east4.run.app/search
3. **GitHub API**: https://us-east4-pulsepoint-datahub.cloudfunctions.net/pulsepoint-git-api-v2
4. **Document360 API**: https://pulsepoint-document360-api-v1-420423430685.us-east4.run.app/search

## Key Features

- **Intelligent keyword extraction** for complex questions
- **Comparison question handling** (e.g., "What is the difference between X and Y")
- **Current sprint detection** and filtering
- **Team-based filtering** (Product, Engineering, Data, etc.)
- **OpenAI-powered synthesis** using GPT-4o-mini
- **Proper error handling** and fallback responses
- **Session management** for conversation continuity

## Testing

The API has been tested with the critical regression test case:
- **Query**: "What are AO factors?"
- **Result**: ✅ Working - returns comprehensive response with actual data sources
- **Status**: All data source integrations functioning properly

## Migration from v4

**Bryan - Action Required:**
1. Update GPT Actions to use the new v5 URL
2. Update GPT Instructions to reference v5 capabilities
3. Test all previous CustomGPT scenarios with v5
4. Remove references to broken v4-intelligent API

## Support

For issues or questions about the v5 API, check:
- API health: GET https://us-east4-pulsepoint-datahub.cloudfunctions.net/knowledge-layer-v5
- GCP Console: https://console.cloud.google.com/functions/details/us-east4/knowledge-layer-v5?project=pulsepoint-datahub
- Logs: gcloud functions logs read knowledge-layer-v5 --region us-east4 --limit 50

