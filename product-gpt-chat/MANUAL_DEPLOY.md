# Manual Deployment Instructions

## Quick Deploy (If GitHub Actions Not Working)

If the GitHub Actions workflow hasn't deployed the services yet, you can deploy manually:

### 1. Deploy Backend

```bash
cd /Users/bweinstein/product-gpt/product-gpt-chat/backend

export GOOGLE_APPLICATION_CREDENTIALS=/Users/bweinstein/product-gpt/Keys/productgpt-sa-key.json

gcloud run deploy product-gpt-chat-api \
  --source . \
  --platform managed \
  --region us-east4 \
  --project pulsepoint-datahub \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --timeout 300s \
  --max-instances 10 \
  --set-env-vars "KNOWLEDGE_LAYER_URL=https://knowledge-layer-v5-420423430685.us-east4.run.app,ENABLE_SSO=false" \
  --service-account="productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com"
```

### 2. Get Backend URL

```bash
BACKEND_URL=$(gcloud run services describe product-gpt-chat-api \
  --region us-east4 \
  --project pulsepoint-datahub \
  --format="value(status.url)")

echo "Backend URL: $BACKEND_URL"
```

### 3. Deploy Frontend

```bash
cd /Users/bweinstein/product-gpt/product-gpt-chat/frontend

export GOOGLE_APPLICATION_CREDENTIALS=/Users/bweinstein/product-gpt/Keys/productgpt-sa-key.json

# Build first (optional, but recommended)
npm install
npm run build

gcloud run deploy product-gpt-chat \
  --source . \
  --platform managed \
  --region us-east4 \
  --project pulsepoint-datahub \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60s \
  --max-instances 10 \
  --set-env-vars "NEXT_PUBLIC_API_URL=$BACKEND_URL,NEXT_PUBLIC_ENABLE_SSO=false" \
  --service-account="productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com"
```

### 4. Get Frontend URL

```bash
FRONTEND_URL=$(gcloud run services describe product-gpt-chat \
  --region us-east4 \
  --project pulsepoint-datahub \
  --format="value(status.url)")

echo "Frontend URL: $FRONTEND_URL"
```

## Or Use the Deploy Script

```bash
cd /Users/bweinstein/product-gpt/product-gpt-chat
./deploy.sh
```

## Expected URLs

After deployment:
- **Frontend**: `https://product-gpt-chat-420423430685.us-east4.run.app`
- **Backend**: `https://product-gpt-chat-api-420423430685.us-east4.run.app`

## Troubleshooting

If you see "Page not found":
1. Check if service is deployed: `gcloud run services list --region=us-east4`
2. Check service logs: `gcloud run services logs read product-gpt-chat --region=us-east4`
3. Verify the service is running: `gcloud run services describe product-gpt-chat --region=us-east4`

