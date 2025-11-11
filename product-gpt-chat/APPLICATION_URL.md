# Product GPT Chat - Application URL

## ✅ Application is Deployed!

### Main Application URL

**https://product-gpt-chat-420423430685.us-east4.run.app**

This is the URL to access the chat application.

## Service Status

- **Backend API**: ✅ Deployed and Running
  - URL: https://product-gpt-chat-api-420423430685.us-east4.run.app
  - Health: https://product-gpt-chat-api-420423430685.us-east4.run.app/api/health

- **Frontend**: ✅ Deployed and Running
  - URL: https://product-gpt-chat-420423430685.us-east4.run.app

## Access the Application

Visit: **https://product-gpt-chat-420423430685.us-east4.run.app**

The application is accessible without authentication (SSO disabled for now).

## Test the Application

1. Visit the URL above
2. Type a question (e.g., "What are AO factors?")
3. The app will call the Knowledge Layer v5 API and return results

## Troubleshooting

If you see "Page not found":
- Wait a few minutes for the service to fully start
- Check Cloud Run logs: `gcloud run services logs read product-gpt-chat --region=us-east4`
- Verify the service is running: `gcloud run services describe product-gpt-chat --region=us-east4`

