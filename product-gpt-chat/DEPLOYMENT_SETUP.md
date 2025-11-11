# Deployment Setup Guide

## Prerequisites

This deployment uses your existing service account and GitHub token.

## Service Account

**Service Account**: `productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com`
**Key File**: `/Users/bweinstein/product-gpt/Keys/productgpt-sa-key.json`

This service account is already configured with the necessary permissions for:
- Cloud Run deployments
- Secret Manager access
- Firestore access
- Cloud Build

## GitHub Token

**Secret Name**: `github-token`
**Location**: Google Secret Manager (`projects/pulsepoint-datahub/secrets/github-token`)

This token is used for:
- GitHub Actions authentication
- Repository access

## GitHub Actions Setup

### 1. Add Service Account Key to GitHub Secrets

You need to add the service account JSON as a GitHub secret:

```bash
# Read the service account key
cat /Users/bweinstein/product-gpt/Keys/productgpt-sa-key.json

# Copy the entire JSON content
```

Then:
1. Go to your GitHub repository
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Name: `GCP_SA_KEY`
5. Value: Paste the entire JSON content from `productgpt-sa-key.json`
6. Click "Add secret"

### 2. Verify GitHub Token Secret

The GitHub token is already in Secret Manager. Verify it exists:

```bash
gcloud secrets versions access latest --secret="github-token" --project=pulsepoint-datahub
```

## Deployment Process

### Automatic Deployment (via GitHub Actions)

1. **Push to `main` branch** → Triggers deployment
2. **GitHub Actions workflow**:
   - Authenticates using `GCP_SA_KEY` secret
   - Builds backend container
   - Deploys to Cloud Run
   - Builds frontend
   - Deploys to Cloud Run

### Manual Deployment (for testing)

#### Backend
```bash
cd /Users/bweinstein/product-gpt/product-gpt-chat/backend

# Set service account
export GOOGLE_APPLICATION_CREDENTIALS=/Users/bweinstein/product-gpt/Keys/productgpt-sa-key.json

# Deploy
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
  --set-env-vars "KNOWLEDGE_LAYER_URL=https://knowledge-layer-v5-420423430685.us-east4.run.app" \
  --set-secrets "GOOGLE_CLIENT_ID=google-client-id:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest"
```

#### Frontend
```bash
cd /Users/bweinstein/product-gpt/product-gpt-chat/frontend

# Set service account
export GOOGLE_APPLICATION_CREDENTIALS=/Users/bweinstein/product-gpt/Keys/productgpt-sa-key.json

# Build and deploy
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
  --set-env-vars "NEXT_PUBLIC_API_URL=https://product-gpt-chat-api-420423430685.us-east4.run.app"
```

## Service Account Permissions

The service account needs these roles:

```bash
# Grant necessary permissions (if not already granted)
gcloud projects add-iam-policy-binding pulsepoint-datahub \
  --member="serviceAccount:productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding pulsepoint-datahub \
  --member="serviceAccount:productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

gcloud projects add-iam-policy-binding pulsepoint-datahub \
  --member="serviceAccount:productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Verification

After deployment, verify services are running:

```bash
# Check backend
gcloud run services describe product-gpt-chat-api \
  --region us-east4 \
  --project pulsepoint-datahub \
  --format="value(status.url)"

# Check frontend
gcloud run services describe product-gpt-chat \
  --region us-east4 \
  --project pulsepoint-datahub \
  --format="value(status.url)"
```

## Troubleshooting

### Authentication Errors

If you see authentication errors:
1. Verify service account key is correct
2. Check service account has necessary permissions
3. Verify project ID is `pulsepoint-datahub`

### Secret Access Errors

If secrets can't be accessed:
1. Verify secret exists: `gcloud secrets list --project=pulsepoint-datahub`
2. Grant Secret Manager accessor role to service account

### GitHub Actions Failures

If GitHub Actions fails:
1. Check `GCP_SA_KEY` secret is set correctly in GitHub
2. Verify the JSON is valid
3. Check workflow logs for specific errors

