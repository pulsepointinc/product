# Product GPT Chat - Custom Chat Application

## Overview

Custom chat application leveraging Knowledge Layer v5 API with Google SSO authentication for corporate users.

## Repository

**GitHub**: `https://github.com/pulsepointinc/product`
**Path**: `product-gpt-chat/` (this directory)

## Architecture

- **Frontend**: Next.js (React)
- **Backend**: FastAPI (Python)
- **Authentication**: Google Identity Platform (SSO)
- **Hosting**: Google Cloud Run
- **Database**: Firestore (conversation history)

## Features

- ✅ Google SSO authentication (corporate logins - @pulsepoint.com only)
- ✅ Direct integration with Knowledge Layer v5
- ✅ Conversation history
- ✅ Source citations
- ✅ Export functionality
- ✅ Automated deployments via CI/CD

## Quick Start

### Prerequisites

- Google Cloud Project: `pulsepoint-datahub`
- Service Account: `productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com`
- GitHub Repository: `pulsepointinc/product`
- Node.js 18+
- Python 3.11+
- gcloud CLI configured

### Local Development

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

### Deployment

#### Automatic (via GitHub Actions)

1. Push to `main` branch of `pulsepointinc/product`
2. GitHub Actions automatically deploys to Cloud Run

#### Manual

```bash
# Use the deployment script
./deploy.sh
```

## Configuration

### Service Account

**Service Account**: `productgpt-api-caller@pulsepoint-datahub.iam.gserviceaccount.com`
**Key File**: `/Users/bweinstein/product-gpt/Keys/productgpt-sa-key.json`

### GitHub Token

**Secret Name**: `github-token`
**Location**: Google Secret Manager

### Environment Variables

See `DEPLOYMENT_SETUP.md` for detailed configuration.

## Documentation

- [Architecture](ARCHITECTURE.md) - System architecture and authentication flow
- [Deployment Setup](DEPLOYMENT_SETUP.md) - How to deploy the application
- [Google SSO Setup](GOOGLE_SSO_SETUP.md) - Google SSO configuration
- [Cost Analysis](COST_ANALYSIS.md) - Monthly cost breakdown
- [GCP Services](GCP_SERVICES.md) - All GCP services used
- [GitHub Repository](GITHUB_REPO.md) - Repository configuration

## Project Structure

```
product-gpt-chat/
├── frontend/          # Next.js application
├── backend/           # FastAPI application
├── .github/           # CI/CD workflows
├── deploy.sh          # Manual deployment script
└── README.md          # This file
```

## Cost

**Monthly**: ~$65-120/month
- Cloud Run: $30-60/month
- Identity Platform: **FREE** (first 50K users)
- Firestore: $5-10/month
- OpenAI API: $30-50/month

See [COST_ANALYSIS.md](COST_ANALYSIS.md) for details.

## Support

For issues or questions, see the documentation files or check the deployment logs in Cloud Run.
