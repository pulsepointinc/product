# PulsePoint Confluence API - Setup Instructions

## 🎉 **CONFLUENCE API IS NOW WORKING!**

**API Endpoint**: `https://pulsepoint-rag-api-420423430685.us-east4.run.app`

## ⚠️ **CRITICAL CONFIGURATION**

**The API requires a low similarity threshold to return results:**
- **Use `min_similarity: 0.01` or `0.05`** for reliable results
- **DO NOT use the default `0.3`** - it's too high and returns no results
- Even highly relevant content scores around 0.05-0.08

## Quick Test

```bash
# Test the working API
curl -X POST 'https://pulsepoint-rag-api-420423430685.us-east4.run.app/search' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "Studio API", 
    "max_results": 3, 
    "min_similarity": 0.05
  }' | jq .
```

## ChatGPT Configuration

### 1. **OpenAPI Spec File**
Use: `pulsepoint-confluence-api-working.yaml`

### 2. **Key Configuration Parameters**

```yaml
# In your ChatGPT custom GPT configuration:
servers:
  - url: https://pulsepoint-rag-api-420423430685.us-east4.run.app

# Always set in requests:
min_similarity: 0.01  # or 0.05 for slightly higher quality
max_results: 5        # reasonable default
```

### 3. **Example ChatGPT Prompts to Test**

**Studio Documentation:**
```
"Find information about Studio API documentation"
```

**Adaptive Optimization:**
```
"Search for AO factors or Adaptive Optimization information"
```

**Security Configuration:**
```
"Find security configuration documentation in the gs space"
```

## API Response Format

```json
{
  "query": "Studio API",
  "results": [
    {
      "title": "Studio_BE_API_v4",
      "content": "Studio BE API v4 provides a powerful interface...",
      "confluence_url": "https://ppinc.atlassian.net/wiki/spaces/gs/pages/2799403012",
      "page_id": "2799403012",
      "confluence_space": "gs",
      "similarity_score": 0.085,
      "created_at": "2025-08-01T21:29:06.268889+00:00"
    }
  ],
  "count": 1,
  "min_similarity": 0.05
}
```

## Available Content

The API successfully searches across:
- **Studio Documentation** (API specs, security, permissions)
- **Product Development** (features, roadmaps, processes)
- **Technical Documentation** (configurations, integrations)
- **Security & Identity** information
- **Clinical Insights** and DTC content

### Confluence Spaces Available:
- **gs** - Genome Studio
- **pt** - Product & Technology  
- **pd** - Product Development

## Search Tips

1. **Be specific**: "Studio API" vs just "API"
2. **Use technical terms**: "AO factors", "security configuration"
3. **Filter by space** when needed: `"space_filter": "gs"`
4. **Always set low similarity**: `"min_similarity": 0.01` or `0.05`

## Testing Different Queries

```bash
# AO/Adaptive Optimization search
curl -X POST 'https://pulsepoint-rag-api-420423430685.us-east4.run.app/search' \
  -H 'Content-Type: application/json' \
  -d '{"query": "AO factors", "max_results": 3, "min_similarity": 0.01}'

# Security documentation
curl -X POST 'https://pulsepoint-rag-api-420423430685.us-east4.run.app/search' \
  -H 'Content-Type: application/json' \
  -d '{"query": "security", "max_results": 5, "min_similarity": 0.05, "space_filter": "gs"}'

# Studio permissions
curl -X POST 'https://pulsepoint-rag-api-420423430685.us-east4.run.app/search' \
  -H 'Content-Type: application/json' \
  -d '{"query": "Studio permissions", "max_results": 3, "min_similarity": 0.01}'
```

## Troubleshooting

### If you get empty results:
1. ✅ **Check similarity threshold** - use 0.01 or 0.05
2. ✅ **Try broader search terms** - "Studio" instead of "Studio API v4"
3. ✅ **Remove space filter** - let it search all spaces

### If you get errors:
1. Check the `query` parameter is provided
2. Ensure `Content-Type: application/json` header is set
3. Verify the API endpoint URL is correct

## Integration Status

- ✅ **Confluence API**: Working at `https://pulsepoint-rag-api-420423430685.us-east4.run.app`
- ✅ **YAML Configuration**: `pulsepoint-confluence-api-working.yaml`
- ✅ **Search Functionality**: Returns proper Confluence URLs and content
- ✅ **Content Coverage**: Studio, Security, Product Development, Technical docs

## Next Steps

1. **Update ChatGPT** with the new YAML file
2. **Set default similarity** to 0.05 in your requests
3. **Test key scenarios** like "AO factors", "Studio API", "security"
4. **Verify direct links** to Confluence pages work correctly

The Confluence API is now fully functional and ready for ChatGPT integration! 🚀