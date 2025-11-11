# Google Cloud Platform Services Used

## Overview

All services for the Product GPT Chat application are hosted on **Google Cloud Platform (GCP)**.

## Services Used

### 1. Cloud Run
- **What it is**: Serverless container platform
- **Used for**: Hosting both frontend (Next.js) and backend (FastAPI)
- **Region**: `us-east4` (Northern Virginia)
- **Project**: `pulsepoint-datahub`
- **Benefits**:
  - Auto-scaling (scales to zero when not in use)
  - Pay only for what you use
  - No server management
  - Automatic HTTPS

### 2. Firestore
- **What it is**: NoSQL document database
- **Used for**: Storing conversation history
- **Project**: `pulsepoint-datahub`
- **Benefits**:
  - Serverless (no infrastructure management)
  - Real-time updates
  - Automatic scaling
  - Free tier available

### 3. Google Identity Platform (Firebase Auth)
- **What it is**: Authentication service (part of Firebase, which is part of GCP)
- **Used for**: Google SSO authentication
- **Project**: `pulsepoint-datahub`
- **Benefits**:
  - Free for first 50,000 users/month
  - Easy Google SSO integration
  - Built-in security

### 4. Cloud Build (CI/CD)
- **What it is**: Build and deployment service
- **Used for**: Automated deployments from GitHub
- **Project**: `pulsepoint-datahub`
- **Benefits**:
  - Automated builds on code push
  - Free tier: 120 build-minutes/day
  - Integrated with Cloud Run

### 5. Secret Manager
- **What it is**: Secure storage for secrets
- **Used for**: Storing OAuth credentials, API keys
- **Project**: `pulsepoint-datahub`
- **Benefits**:
  - Secure secret storage
  - Automatic rotation support
  - Access control

### 6. Cloud Logging
- **What it is**: Logging and monitoring service
- **Used for**: Application logs, error tracking
- **Project**: `pulsepoint-datahub`
- **Benefits**:
  - Centralized logging
  - Search and filter capabilities
  - Integration with Cloud Run

## All Services in One Project

All services are in the same GCP project:
- **Project ID**: `pulsepoint-datahub`
- **Project Number**: `420423430685`
- **Region**: `us-east4` (for Cloud Run)

## Service Relationships

```
┌─────────────────────────────────────────┐
│     GCP Project: pulsepoint-datahub     │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  Cloud Run (Frontend)              │ │
│  │  - Next.js app                     │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  Cloud Run (Backend)              │ │
│  │  - FastAPI app                    │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  Firestore                        │ │
│  │  - Conversation history            │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  Identity Platform                │ │
│  │  - Google SSO                     │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  Cloud Build                      │ │
│  │  - CI/CD pipeline                 │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │  Secret Manager                   │ │
│  │  - OAuth credentials              │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## Benefits of Using GCP Services

1. **Single Platform**: All services in one place
2. **Integrated**: Services work together seamlessly
3. **Consistent Billing**: One bill for all services
4. **Security**: Unified IAM and access control
5. **Monitoring**: Centralized logging and monitoring
6. **Cost Efficiency**: Free tiers and usage-based pricing

## Cost Summary

All costs are within the same GCP project:

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Cloud Run (Frontend) | $10-20 | Scales with usage |
| Cloud Run (Backend) | $20-40 | Scales with usage |
| Firestore | $5-10 | Free tier available |
| Identity Platform | **$0** | Free for < 50K users |
| Cloud Build | $2-5 | Free tier: 120 min/day |
| Secret Manager | $0.06/secret | Minimal cost |
| Cloud Logging | $0.50/GB | Minimal for small apps |
| **Total** | **$37-85/month** | Varies by usage |

## Access and Management

All services can be managed from:
- **GCP Console**: https://console.cloud.google.com/?project=pulsepoint-datahub
- **gcloud CLI**: Command-line interface
- **APIs**: Programmatic access

## Region

All services are deployed in **us-east4** (Northern Virginia) for:
- Low latency
- Consistency
- Cost efficiency

