# Knowledge Layer API - Fallback & Recovery Instructions

## Quick Fallback Options

### 1. Stable Backup Service (Immediate)
If the primary API has issues, immediately switch to the stable backup:

**Switch GPT URL from:**
```
https://pulsepoint-knowledge-layer-api-v1-420423430685.us-east4.run.app
```

**To stable backup:**
```
https://pulsepoint-knowledge-layer-stable-v1-420423430685.us-east4.run.app
```

**Features**: Identical functionality, locked stable version

### 2. Legacy Multi-Endpoint Service
For advanced users who need individual endpoints:

**Base URL:**
```
https://pulsepoint-confluence-api-v3-420423430685.us-east4.run.app
```

**Available Endpoints:**
- `/search` - Basic search
- `/query` - RAG-style queries
- `/route` - Multi-query orchestration  
- `/search/confluence` - Space-specific search

## Service Recovery Procedures

### Restore Working Version
If both services fail, restore from stable backup:

```bash
cd /Users/bweinstein/product-gpt/confluence_automation

# Restore stable version to primary
cp stable_knowledge_layer_api_v1.py simple_confluence_working.py
cp stable_knowledge_layer_api_v1.py main.py

# Deploy restored version
gcloud run deploy pulsepoint-knowledge-layer-api-v1 \
  --source . \
  --platform managed \
  --region us-east4 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --timeout 300s \
  --max-instances 10
```

### Check Service Health
```bash
# Test primary service
curl https://pulsepoint-knowledge-layer-api-v1-420423430685.us-east4.run.app/

# Test stable service  
curl https://pulsepoint-knowledge-layer-stable-v1-420423430685.us-east4.run.app/

# Test query functionality
curl -X POST "https://pulsepoint-knowledge-layer-api-v1-420423430685.us-east4.run.app/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"What are AO factors?"}'
```

### View Service Logs
```bash
# Stream live logs
gcloud run services logs tail pulsepoint-knowledge-layer-api-v1 --region us-east4

# View recent errors
gcloud run services logs read pulsepoint-knowledge-layer-api-v1 \
  --region us-east4 \
  --filter="severity>=ERROR" \
  --limit 20
```

## GPT Configuration Recovery

### OpenAPI Schema Recovery
If GPT configuration is lost, use these files:

**Current Schema:**
```
/Users/bweinstein/product-gpt/confluence_automation/gpt_openapi_schema.yaml
```

**Stable Schema:**
```
/Users/bweinstein/product-gpt/confluence_automation/stable_openapi_schema_v1.yaml
```

### Instructions Recovery
**Updated Instructions:**
```
/Users/bweinstein/product-gpt/confluence_automation/updated_gpt_instructions.md
```

### Test Query Examples
Verify GPT is working with these test queries:

1. **AO Test**: "What are the latest AO factors?"
   - Expected Strategy: "AO Factors and Optimization Capabilities"

2. **OA Test**: "What's the latest on Omnichannel Audiences?"
   - Expected Strategy: "Omnichannel Audiences (OA) - Audience Targeting Platform"

3. **DPD Test**: "Tell me about the Deals Platform"
   - Expected Strategy: "Deals Platform (DPD) - Private Marketplace and Deal Management"

## Troubleshooting Common Issues

### Issue: GPT Returns Wrong Product Info
**Problem**: Asked about OA, got AO information
**Solution**: 
1. Check if using correct URL (should be knowledge-layer-api-v1, not confluence-api-v3)
2. Test with explicit product names: "Omnichannel Audiences" not "OA"
3. Switch to stable backup if intent analysis is broken

### Issue: Empty or Low-Confidence Results
**Problem**: Query returns no sources or confidence < 0.3
**Solution**:
1. Try broader search terms
2. Check BigQuery table has recent data
3. Test individual endpoints on legacy service

### Issue: Service Timeout or 500 Errors
**Problem**: API not responding or internal errors
**Solution**:
1. Immediately switch to stable backup URL
2. Check service logs for errors
3. Restart service if needed:
   ```bash
   gcloud run services update pulsepoint-knowledge-layer-api-v1 --region us-east4
   ```

### Issue: Product Confusion (AO vs OA vs DPD)
**Problem**: API confusing different products
**Solution**:
1. Use explicit product names in queries
2. Check intent analysis patterns in code
3. Test with individual legacy endpoints for comparison

## Emergency Contacts & Resources

### GCP Console Quick Links
- **Services**: https://console.cloud.google.com/run?project=pulsepoint-datahub
- **Logs**: https://console.cloud.google.com/logs?project=pulsepoint-datahub
- **BigQuery**: https://console.cloud.google.com/bigquery?project=pulsepoint-datahub

### File Backup Locations
All critical files are stored in:
```
/Users/bweinstein/product-gpt/confluence_automation/
```

**Key Files:**
- `stable_knowledge_layer_api_v1.py` - Stable working version
- `stable_openapi_schema_v1.yaml` - Stable GPT schema
- `API_DOCUMENTATION.md` - Complete API docs
- `GCP_SERVICES_REFERENCE.md` - GCP service details

## Version Rollback Matrix

| Problem | Solution | Time to Fix |
|---------|----------|-------------|
| GPT returns wrong product info | Switch to stable backup URL | 2 minutes |
| API timeout/500 errors | Switch to stable backup URL | 2 minutes |
| Low confidence results | Use legacy multi-endpoint API | 5 minutes |
| Complete service failure | Restore from stable files + redeploy | 10 minutes |
| BigQuery data issues | Manual investigation needed | 30+ minutes |

---

## Success Verification

After any fallback action, verify with these tests:

1. **Health Check**: `GET /` returns status 200
2. **AO Query**: Ask about "AO factors" → Should return AO-specific content
3. **OA Query**: Ask about "Omnichannel Audiences" → Should return OA-specific content  
4. **DPD Query**: Ask about "Deals Platform" → Should return DPD-specific content
5. **Confidence**: All queries should return confidence > 0.5

**If all tests pass**: Service is fully functional  
**If tests fail**: Escalate to manual investigation