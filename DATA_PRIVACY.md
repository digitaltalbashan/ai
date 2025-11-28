# 🔒 Data Privacy & OpenAI Training Opt-Out

## ✅ Your Data is Protected

**As of March 1, 2023, OpenAI does NOT use data submitted through the API to train or improve their models unless you explicitly opt in.**

This application is configured to ensure your data remains private and is not used for training.

## 📋 What This Means

### ✅ What OpenAI Does NOT Do:
- ❌ **Does NOT use your API data for training** (by default)
- ❌ **Does NOT use your conversations to improve models**
- ❌ **Does NOT use your embeddings data for training**
- ❌ **Does NOT remember your data after the API call**

### ⚠️ What OpenAI Does Do (for security):
- ✅ **Retains API data for 30 days** for abuse monitoring and safety
- ✅ **Deletes data automatically** after 30 days (unless legally required)
- ✅ **Encrypts all data** in transit and at rest
- ✅ **Restricts access** to authorized personnel only

## 🔧 How This Application Protects Your Data

### 1. No Training Parameters
All OpenAI API calls in this application:
- ✅ Do NOT include any training-related parameters
- ✅ Do NOT use fine-tuning endpoints
- ✅ Do NOT opt into data usage for training

### 2. Code Implementation
The following files are configured for privacy:
- `src/server/openai.ts` - Main OpenAI client (no training config)
- `src/server/llmClientOpenAI.ts` - Chat completions (no training config)
- All embedding calls - No training parameters

### 3. API Usage
Every API call explicitly:
- Uses standard chat completion endpoints (not training endpoints)
- Does not include training flags
- Follows OpenAI's default privacy policy (no training by default)

## 🛡️ Additional Privacy Options

### For Enterprise/Business Accounts

If you have an **OpenAI Enterprise, Business, or API organization account**, you can configure:

1. **Zero Data Retention**
   - Request zero data retention policy
   - Data is not stored at all (not even for 30 days)
   - Contact OpenAI support to enable

2. **Organization Settings**
   - Log into [OpenAI Platform](https://platform.openai.com)
   - Go to Organization Settings
   - Verify "Data usage for training" is set to OFF
   - Configure data retention policies

### How to Verify Your Settings

1. **Check OpenAI Organization Settings:**
   ```
   1. Go to https://platform.openai.com
   2. Click on your organization name (top right)
   3. Go to "Settings" → "Data Controls"
   4. Verify "Data usage for training" is OFF
   ```

2. **For Enterprise Accounts:**
   - Contact OpenAI support to enable zero data retention
   - Request explicit confirmation that your data is not used for training

## 📊 Data Flow in This Application

```
Your Question
    ↓
[Your Server] → OpenAI API (Chat Completion)
    ↓
Response → [Your Server] → [Your Database]
    ↓
OpenAI deletes data after 30 days (or immediately with zero retention)
```

**Important:** 
- Your data never leaves your control except for the API call
- OpenAI does not store your data for training purposes
- All context and conversations are stored in YOUR database, not OpenAI's

## 🔍 Verification Checklist

- [x] No training parameters in API calls
- [x] No fine-tuning endpoints used
- [x] Standard chat completion API only
- [x] Embeddings API (no training)
- [ ] Verify OpenAI organization settings (you need to do this)
- [ ] Consider zero data retention for enterprise accounts

## 📚 References

- [OpenAI Data Usage Policy](https://platform.openai.com/docs/guides/your-data)
- [OpenAI Privacy Policy](https://openai.com/privacy/)
- [OpenAI Business Data Policy](https://openai.com/business-data/)

## ⚠️ Important Notes

1. **Default Behavior:** OpenAI API does NOT use data for training by default (since March 1, 2023)

2. **30-Day Retention:** Data is retained for 30 days for abuse monitoring, then automatically deleted

3. **Zero Retention:** For maximum privacy, configure zero data retention in OpenAI organization settings (enterprise accounts)

4. **Your Database:** All conversation history and context is stored in YOUR PostgreSQL database, not OpenAI's systems

5. **No Memory:** OpenAI models do NOT remember previous conversations - each API call is independent

## ✅ Summary

**Your data is protected:**
- ✅ Not used for training (by default)
- ✅ Deleted after 30 days (or immediately with zero retention)
- ✅ Encrypted in transit and at rest
- ✅ Stored in your own database, not OpenAI's

**This application is configured correctly for privacy.**

