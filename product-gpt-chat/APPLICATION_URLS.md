# Product GPT Chat - Application URLs

## Primary Application URL

**Frontend (Main Application):**
```
https://product-gpt-chat-420423430685.us-east4.run.app
```

This is the URL users should access to use the chat application.

## Backend API URL

**Backend API (For reference):**
```
https://product-gpt-chat-api-420423430685.us-east4.run.app
```

This is the backend API endpoint. Users don't need to access this directly.

## Health Check URLs

### Frontend Health Check
```
https://product-gpt-chat-420423430685.us-east4.run.app/
```

### Backend Health Check
```
https://product-gpt-chat-api-420423430685.us-east4.run.app/
```

### Backend API Health Check
```
https://product-gpt-chat-api-420423430685.us-east4.run.app/api/health
```

## Deployment Status

Check deployment status:
- **GitHub Actions**: https://github.com/pulsepointinc/product/actions
- **Cloud Run Console**: https://console.cloud.google.com/run?project=pulsepoint-datahub

## Access the Application

Once deployment is complete, visit:
**https://product-gpt-chat-420423430685.us-east4.run.app**

The application will be accessible without authentication (SSO disabled).

## Testing

After deployment, test the application:
1. Visit the frontend URL
2. Type a question (e.g., "What are AO factors?")
3. Verify response from Knowledge Layer v5

## Troubleshooting

If the URL doesn't work:
1. Check GitHub Actions for deployment status
2. Check Cloud Run logs for errors
3. Verify services are running in Cloud Run console

