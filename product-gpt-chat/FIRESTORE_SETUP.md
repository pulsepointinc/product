# Firestore Setup for Chat History

## Overview
Chat history is stored in Firestore using the following structure:
- **Collection**: `conversations`
- **Subcollection**: `messages` (under each conversation)

## Firestore Security Rules

You need to set up Firestore security rules in the Firebase Console to allow authenticated users to:
1. Read/write their own conversations only
2. Read/write messages in their own conversations

### Steps to Configure:

1. Go to Firebase Console: https://console.firebase.google.com/u/0/project/pulsepoint-bitstrapped-ai/firestore
2. Click on "Rules" tab
3. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Conversations collection - users can only access their own conversations
    match /conversations/{conversationId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
      
      // Messages subcollection - users can only access messages in their own conversations
      match /messages/{messageId} {
        allow read, write: if request.auth != null && 
          get(/databases/$(database)/documents/conversations/$(conversationId)).data.userId == request.auth.uid;
      }
    }
  }
}
```

4. Click "Publish"

## Firestore Indexes

The application requires a composite index for querying conversations by userId and updatedAt.

### Automatic Index Creation:
When you first run the app, Firestore will show an error with a link to create the index automatically. Click that link.

### Manual Index Creation:
1. Go to Firebase Console → Firestore → Indexes
2. Click "Create Index"
3. Set:
   - Collection ID: `conversations`
   - Fields:
     - `userId` (Ascending)
     - `updatedAt` (Descending)
   - Query scope: Collection
4. Click "Create"

## Testing

After setting up security rules and indexes:
1. Sign in to the app
2. Start a new conversation
3. Send a few messages
4. Check Firebase Console → Firestore to see the data
5. Create a new conversation and verify it appears in the sidebar
6. Click on a previous conversation to load its messages

## Troubleshooting

### "Missing or insufficient permissions"
- Check that Firestore security rules are published
- Verify the user is authenticated (check browser console)

### "The query requires an index"
- Click the link in the error message to create the index automatically
- Or create it manually as described above

### Conversations not appearing
- Check browser console for errors
- Verify Firestore is initialized (check console logs)
- Ensure user is authenticated

