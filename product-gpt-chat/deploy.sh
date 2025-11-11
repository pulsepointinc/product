#!/bin/bash

# Product GPT Chat - Deployment Script
# Uses existing service account and GitHub token

set -e

echo "🚀 Deploying Product GPT Chat..."
echo "=================================="

# Configuration
PROJECT_ID="pulsepoint-datahub"
REGION="us-east4"
SERVICE_ACCOUNT_KEY="/Users/bweinstein/product-gpt/Keys/productgpt-sa-key.json"

# Verify service account key exists
if [ ! -f "$SERVICE_ACCOUNT_KEY" ]; then
    echo "❌ Service account key not found: $SERVICE_ACCOUNT_KEY"
    exit 1
fi

# Set service account
export GOOGLE_APPLICATION_CREDENTIALS="$SERVICE_ACCOUNT_KEY"

echo "✅ Using service account: productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com"

# Deploy Backend
echo ""
echo "📦 Deploying Backend API..."
cd backend

gcloud run deploy product-gpt-chat-api \
  --source . \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 1 \
  --timeout 300s \
  --max-instances 10 \
  --set-env-vars "KNOWLEDGE_LAYER_URL=https://knowledge-layer-v5-420423430685.us-east4.run.app" \
  --set-secrets "GOOGLE_CLIENT_ID=google-client-id:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest" \
  --service-account="productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com"

if [ $? -eq 0 ]; then
    BACKEND_URL=$(gcloud run services describe product-gpt-chat-api \
      --region "$REGION" \
      --project "$PROJECT_ID" \
      --format="value(status.url)")
    echo "✅ Backend deployed: $BACKEND_URL"
else
    echo "❌ Backend deployment failed"
    exit 1
fi

# Deploy Frontend
echo ""
echo "📦 Deploying Frontend..."
cd ../frontend

# Build frontend
echo "🔨 Building frontend..."
npm install
npm run build

gcloud run deploy product-gpt-chat \
  --source . \
  --platform managed \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 60s \
  --max-instances 10 \
  --set-env-vars "NEXT_PUBLIC_API_URL=$BACKEND_URL" \
  --service-account="productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com"

if [ $? -eq 0 ]; then
    FRONTEND_URL=$(gcloud run services describe product-gpt-chat \
      --region "$REGION" \
      --project "$PROJECT_ID" \
      --format="value(status.url)")
    echo "✅ Frontend deployed: $FRONTEND_URL"
    echo ""
    echo "🎉 Deployment complete!"
    echo "Frontend URL: $FRONTEND_URL"
    echo "Backend URL: $BACKEND_URL"
else
    echo "❌ Frontend deployment failed"
    exit 1
fi

