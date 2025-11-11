# Deployment Status

## Current Status

### ✅ Backend API - DEPLOYED
**URL**: https://product-gpt-chat-api-420423430685.us-east4.run.app
**Status**: ✅ Running
**Health Check**: https://product-gpt-chat-api-420423430685.us-east4.run.app/api/health

### ⚠️ Frontend - DEPLOYMENT IN PROGRESS
**Expected URL**: https://product-gpt-chat-420423430685.us-east4.run.app
**Status**: Building/Deploying

## Issue: Container Registry Deprecated

Google Container Registry (GCR) is deprecated. Cloud Run should automatically use Artifact Registry, but there may be a migration needed.

## Quick Fix: Use Artifact Registry

Run this to migrate:
```bash
gcloud artifacts docker upgrade migrate --project=pulsepoint-datahub
```

Or deploy using Cloud Build which handles this automatically.

## Manual Frontend Deployment

If GitHub Actions is stuck, deploy manually:

```bash
cd /Users/bweinstein/product-gpt/product-gpt-chat/frontend

export GOOGLE_APPLICATION_CREDENTIALS=/Users/bweinstein/product-gpt/Keys/productgpt-sa-key.json

# Use Cloud Build instead of direct deploy
gcloud builds submit --tag us-east4-docker.pkg.dev/pulsepoint-datahub/cloud-run-source-deploy/product-gpt-chat:latest .

gcloud run deploy product-gpt-chat \
  --image us-east4-docker.pkg.dev/pulsepoint-datahub/cloud-run-source-deploy/product-gpt-chat:latest \
  --platform managed \
  --region us-east4 \
  --project pulsepoint-datahub \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60s \
  --max-instances 10 \
  --set-env-vars "NEXT_PUBLIC_API_URL=https://product-gpt-chat-api-420423430685.us-east4.run.app,NEXT_PUBLIC_ENABLE_SSO=false"
```

## Application URLs (Once Deployed)

- **Frontend**: https://product-gpt-chat-420423430685.us-east4.run.app
- **Backend**: https://product-gpt-chat-api-420423430685.us-east4.run.app

