# Frontend Testing Guide

## ✅ Server Status
- **Server**: Running on http://localhost:3000
- **Environment**: All variables configured correctly
- **Database**: Connected with 95 chunks
- **OpenAI**: Configured and ready

## 🧪 Testing Checklist

### 1. Home Page Test
- [ ] Open http://localhost:3000
- [ ] Should redirect to `/auth/signin` if not authenticated
- [ ] Or redirect to `/chat` if authenticated

### 2. Authentication Test
- [ ] Go to http://localhost:3000/auth/signin
- [ ] Click "Sign in with Google"
- [ ] Complete Google OAuth flow
- [ ] Should redirect to `/chat` after successful login
- [ ] Check browser console for any errors

### 3. Chat Interface Test
- [ ] Open http://localhost:3000/chat
- [ ] Verify you're authenticated (check for user profile/name)
- [ ] Check if conversation history loads (if any exists)
- [ ] Verify UI elements:
  - [ ] Message input field
  - [ ] Send button
  - [ ] Conversation history sidebar (if visible)
  - [ ] New conversation button

### 4. Send Message Test
- [ ] Type a test message: "מה זה ריאקטיביות?"
- [ ] Click send or press Enter
- [ ] Verify:
  - [ ] Message appears in chat
  - [ ] Loading indicator shows
  - [ ] Response streams in (character by character)
  - [ ] Response is in Hebrew
  - [ ] Response is relevant to the question
  - [ ] No errors in browser console
  - [ ] No errors in server logs

### 5. Conversation History Test
- [ ] Send multiple messages
- [ ] Refresh the page
- [ ] Verify:
  - [ ] Previous messages are loaded
  - [ ] Conversation history is preserved
  - [ ] Can start new conversation

### 6. Error Handling Test
- [ ] Test with empty message (should be disabled)
- [ ] Test with very long message
- [ ] Test network interruption (if possible)
- [ ] Verify error messages are user-friendly

## 🔍 Browser Console Checks

Open browser DevTools (F12) and check:

1. **Console Tab**:
   - No red errors
   - Check for any warnings
   - Verify session status logs

2. **Network Tab**:
   - `/api/chat/stream` requests return 200
   - Response streams correctly
   - Check request/response timing

3. **Application Tab**:
   - Check cookies for NextAuth session
   - Verify localStorage (if used)

## 📊 Expected Behavior

### Successful Flow:
1. User types message
2. Message appears immediately
3. Loading indicator shows
4. Response streams in (10-30 seconds depending on query)
5. Response is complete and relevant
6. Message saved to database

### Response Quality:
- Answers in Hebrew
- Answers are relevant to question
- Answers reference course material
- Answers follow Tal Bashan's style (5-step structure)
- No hallucinations (only from context)

## 🐛 Common Issues

### Issue: Redirect Loop
- **Solution**: Clear cookies and try again
- **Check**: Middleware logs in server console

### Issue: No Response
- **Check**: Server logs for errors
- **Check**: OpenAI API key is valid
- **Check**: Database connection

### Issue: Slow Response
- **Normal**: First query takes longer (model loading)
- **Expected**: 10-30 seconds for full response
- **Check**: Server logs for timing information

### Issue: Authentication Fails
- **Check**: Google OAuth credentials in .env
- **Check**: AUTH_SECRET is set
- **Check**: Redirect URLs in Google Console

## 📝 Test Results Template

```
Date: ___________
Tester: ___________

✅ Home Page: [ ] Pass [ ] Fail
✅ Authentication: [ ] Pass [ ] Fail
✅ Chat Interface: [ ] Pass [ ] Fail
✅ Send Message: [ ] Pass [ ] Fail
✅ Response Quality: [ ] Pass [ ] Fail
✅ Conversation History: [ ] Pass [ ] Fail
✅ Error Handling: [ ] Pass [ ] Fail

Issues Found:
_______________________________________
_______________________________________
_______________________________________

Notes:
_______________________________________
_______________________________________
```

## 🚀 Quick Test Commands

```bash
# Check server status
curl http://localhost:3000

# Check API endpoint (should return 401 if not authenticated)
curl -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'

# View server logs
tail -f /tmp/nextjs-dev.log
```

