# Gemini Free Tier Optimization

## Current Implementation

### Image Capture Method
- **Manual capture only** - User clicks "Capture & Analyze" button
- Video preview is **ONLY for user to see what they're pointing at**
- **NO automatic/continuous capture** - Each button click = 1 API call
- Client-side throttling: 2 second minimum between captures

### Rate Limiting
- **Server-side**: 12 requests/minute (safe for Gemini free tier limit of 15/min)
- **Client-side**: 2 second cooldown between captures
- Prevents accidental spam clicking

### Image Optimization
- **Resolution**: 640x480 (reduced from higher resolutions)
- **Quality**: 75% JPEG quality (reduced from 92%)
- **Max size**: 2MB (reduced from 5MB)
- **Auto-compression**: Images > 2MB are compressed to 1280x720

### API Usage
- **1 image per button click**
- **1 API call per capture**
- Streaming response (SSE) - more efficient than REST
- No video frames sent to API

## Gemini Free Tier Limits

According to Google's Gemini API documentation:
- **15 requests per minute** (RPM)
- **1,500 requests per day** (RPD)
- **32,000 tokens per minute** (TPM)

Our implementation:
- ✅ 12 requests/minute (under 15 RPM limit)
- ✅ Manual capture prevents hitting daily limits
- ✅ Optimized image size reduces token usage

## Cost Optimization Tips

1. **Use manual capture** - Don't implement auto-capture
2. **Add user feedback** - Show remaining requests/minute
3. **Cache results** - Same image = cached response (no API call)
4. **Compress images** - Smaller images = fewer tokens
5. **Use brief detail level** - For non-critical scans

## Monitoring

Check your API usage at:
- Google AI Studio: https://aistudio.google.com/
- Monitor rate limit headers in responses
- Client shows rate limit status in UI
