# PulsePoint Knowledge Layer - GCP Services Reference

## Cloud Run Services

### Production Knowledge Layer API
- **Service Name**: `pulsepoint-knowledge-layer-api-v1`
- **URL**: https://pulsepoint-knowledge-layer-api-v1-420423430685.us-east4.run.app
- **GCP Console**: https://console.cloud.google.com/run/detail/us-east4/pulsepoint-knowledge-layer-api-v1/general?project=pulsepoint-datahub
- **Status**: Active (Primary)
- **Current Revision**: pulsepoint-knowledge-layer-api-v1-00004-klz
- **Features**: Full intent analysis, AO/OA/DPD differentiation, comprehensive answer synthesis

### Stable Backup API
- **Service Name**: `pulsepoint-knowledge-layer-stable-v1`
- **URL**: https://pulsepoint-knowledge-layer-stable-v1-420423430685.us-east4.run.app
- **GCP Console**: https://console.cloud.google.com/run/detail/us-east4/pulsepoint-knowledge-layer-stable-v1/general?project=pulsepoint-datahub
- **Status**: Active (Stable Backup)
- **Current Revision**: pulsepoint-knowledge-layer-stable-v1-00001-vqr
- **Features**: Locked stable version for fallback

### Legacy Confluence API
- **Service Name**: `pulsepoint-confluence-api-v3`  
- **URL**: https://pulsepoint-confluence-api-v3-420423430685.us-east4.run.app
- **GCP Console**: https://console.cloud.google.com/run/detail/us-east4/pulsepoint-confluence-api-v3/general?project=pulsepoint-datahub
- **Status**: Legacy (Multiple endpoints)
- **Current Revision**: pulsepoint-confluence-api-v3-00006-8xk
- **Features**: Individual endpoints (/search, /query, /route, etc.)

## Service Configuration

### Resource Allocation
- **Memory**: 2Gi per instance
- **CPU**: 1 vCPU per instance
- **Timeout**: 300 seconds
- **Max Instances**: 10
- **Min Instances**: 0 (scales to zero)

### Region & Project
- **Region**: us-east4 (Northern Virginia)
- **Project ID**: pulsepoint-datahub
- **Project Number**: 420423430685

## Data Sources

### BigQuery Table
- **Project**: pulsepoint-datahub
- **Dataset**: rag_system
- **Table**: unified_content
- **GCP Console**: https://console.cloud.google.com/bigquery?project=pulsepoint-datahub&ws=!1m5!1m4!4m3!1spulsepoint-datahub!2srag_system!3sunified_content

### Service Account
- **Name**: productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com
- **IAM Console**: https://console.cloud.google.com/iam-admin/serviceaccounts/details/118234567890123456789?project=pulsepoint-datahub

## Monitoring & Logs

### Cloud Run Logs
- **Primary API Logs**: https://console.cloud.google.com/run/detail/us-east4/pulsepoint-knowledge-layer-api-v1/logs?project=pulsepoint-datahub
- **Stable API Logs**: https://console.cloud.google.com/run/detail/us-east4/pulsepoint-knowledge-layer-stable-v1/logs?project=pulsepoint-datahub

### Cloud Run Metrics
- **Primary API Metrics**: https://console.cloud.google.com/run/detail/us-east4/pulsepoint-knowledge-layer-api-v1/metrics?project=pulsepoint-datahub
- **Stable API Metrics**: https://console.cloud.google.com/run/detail/us-east4/pulsepoint-knowledge-layer-stable-v1/metrics?project=pulsepoint-datahub

### All Cloud Run Services
- **Services Overview**: https://console.cloud.google.com/run?project=pulsepoint-datahub

## Deployment Commands

### Deploy Primary API
```bash
cd /Users/bweinstein/product-gpt/confluence_automation
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

### Deploy Stable Backup
```bash
cd /Users/bweinstein/product-gpt/confluence_automation
cp stable_knowledge_layer_api_v1.py main.py
gcloud run deploy pulsepoint-knowledge-layer-stable-v1 \
  --source . \
  --platform managed \
  --region us-east4 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --timeout 300s \
  --max-instances 10
```

## Quick Access URLs

### API Endpoints
- **Primary**: https://pulsepoint-knowledge-layer-api-v1-420423430685.us-east4.run.app/ask
- **Stable**: https://pulsepoint-knowledge-layer-stable-v1-420423430685.us-east4.run.app/ask
- **Health Check**: https://pulsepoint-knowledge-layer-api-v1-420423430685.us-east4.run.app/

### GCP Management
- **Cloud Run Console**: https://console.cloud.google.com/run?project=pulsepoint-datahub
- **BigQuery Console**: https://console.cloud.google.com/bigquery?project=pulsepoint-datahub
- **IAM Console**: https://console.cloud.google.com/iam-admin?project=pulsepoint-datahub
- **Logs Explorer**: https://console.cloud.google.com/logs?project=pulsepoint-datahub

## Version History

| Version | Service | Revision | Status | Features |
|---------|---------|----------|--------|----------|
| v1.0.4 | pulsepoint-knowledge-layer-api-v1 | 00004-klz | Current | AO/OA/DPD differentiation |
| v1.0.3 | pulsepoint-knowledge-layer-api-v1 | 00003-vcb | Previous | AO/OA fixed, no DPD |
| v1.0.2 | pulsepoint-knowledge-layer-api-v1 | 00002-st2 | Previous | Initial AO/OA patterns |
| v1.0.1 | pulsepoint-knowledge-layer-api-v1 | 00001-f48 | Previous | Basic intent analysis |
| v1.0.0-stable | pulsepoint-knowledge-layer-stable-v1 | 00001-vqr | Stable | Locked working version |

## Troubleshooting

### Service Health Checks
```bash
# Check primary service
curl https://pulsepoint-knowledge-layer-api-v1-420423430685.us-east4.run.app/

# Check stable service
curl https://pulsepoint-knowledge-layer-stable-v1-420423430685.us-east4.run.app/

# Test query
curl -X POST "https://pulsepoint-knowledge-layer-api-v1-420423430685.us-east4.run.app/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"What are AO factors?"}'
```

### Roll Back to Stable
If primary service has issues, update GPT to use stable URL:
```
https://pulsepoint-knowledge-layer-stable-v1-420423430685.us-east4.run.app
```

### View Logs
```bash
# Stream logs from primary service
gcloud run services logs tail pulsepoint-knowledge-layer-api-v1 --region us-east4

# View recent logs
gcloud run services logs read pulsepoint-knowledge-layer-api-v1 --region us-east4 --limit 50
```

## File Locations

### Source Code
- **Primary**: `/Users/bweinstein/product-gpt/confluence_automation/simple_confluence_working.py`
- **Stable Backup**: `/Users/bweinstein/product-gpt/confluence_automation/stable_knowledge_layer_api_v1.py`
- **OpenAPI Schema**: `/Users/bweinstein/product-gpt/confluence_automation/gpt_openapi_schema.yaml`
- **Stable Schema**: `/Users/bweinstein/product-gpt/confluence_automation/stable_openapi_schema_v1.yaml`

### Documentation
- **API Docs**: `/Users/bweinstein/product-gpt/confluence_automation/API_DOCUMENTATION.md`
- **GCP Reference**: `/Users/bweinstein/product-gpt/confluence_automation/GCP_SERVICES_REFERENCE.md`
- **GPT Instructions**: `/Users/bweinstein/product-gpt/confluence_automation/updated_gpt_instructions.md`

---

**Project**: pulsepoint-datahub  
**Region**: us-east4  
**Last Updated**: 2025-08-31