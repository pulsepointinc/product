# GitHub Repository Configuration

## Repository Details

**Organization**: `pulsepointinc`
**Repository**: `product`
**Full URL**: `https://github.com/pulsepointinc/product`

This is the same repository used for:
- GPT instruction files
- Product definitions
- Stream leads
- Acronyms
- Other product documentation

## Repository Structure

The chat application code should be stored in:
- **Path**: `product-gpt-chat/` (at repository root)
- **Branch**: `main`

## GitHub Actions

The deployment workflow uses:
- **Repository**: `pulsepointinc/product`
- **Service Account**: `productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com`
- **GitHub Token**: Stored in Secret Manager as `github-token`

## Setup

### 1. Repository Access

The service account needs access to the repository. Verify the GitHub token has access:

```bash
# Test GitHub token access
gcloud secrets versions access latest --secret="github-token" --project=pulsepoint-datahub | \
  xargs -I {} curl -H "Authorization: token {}" \
  https://api.github.com/repos/pulsepointinc/product
```

### 2. GitHub Actions Secrets

Add the service account key to GitHub repository secrets:

1. Go to: https://github.com/pulsepointinc/product/settings/secrets/actions
2. Add secret: `GCP_SA_KEY`
3. Value: Contents of `/Users/bweinstein/product-gpt/Keys/productgpt-sa-key.json`

### 3. Repository Structure

```
pulsepointinc/product/
├── GPT/                    # Existing GPT files
├── product-gpt-chat/        # New chat application
│   ├── frontend/
│   ├── backend/
│   └── .github/
└── ...
```

## Deployment

When you push to the `main` branch of `pulsepointinc/product`, GitHub Actions will:
1. Authenticate using `GCP_SA_KEY` secret
2. Build and deploy backend to Cloud Run
3. Build and deploy frontend to Cloud Run

## Verification

After setup, verify the workflow can access the repository:

```bash
# Check repository access
curl -H "Authorization: token $(gcloud secrets versions access latest --secret='github-token' --project=pulsepoint-datahub)" \
  https://api.github.com/repos/pulsepointinc/product
```

