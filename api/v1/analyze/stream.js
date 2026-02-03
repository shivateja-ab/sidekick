// REST API endpoint: POST with image → Returns SSE stream
// Flow: Client sends POST with image → Server immediately returns SSE stream → Streams chunks continuously
import { GoogleGenAI } from '@google/genai';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  console.log('[STREAM] Request received:', {
    method: request.method,
    url: request.url,
    hasBody: !!request.body
  });

  // Get API key from environment (Edge runtime supports process.env)
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';

  console.log('[STREAM] Environment check:', {
    hasApiKey: !!GEMINI_API_KEY,
    apiKeyLength: GEMINI_API_KEY ? GEMINI_API_KEY.length : 0,
    model: GEMINI_MODEL,
    runtime: 'edge'
  });

  // Validate API key exists and is valid
  if (!GEMINI_API_KEY || typeof GEMINI_API_KEY !== 'string' || GEMINI_API_KEY.trim().length === 0) {
    console.error('[STREAM] ❌ API key validation failed');
    return new Response(JSON.stringify({ 
      error: 'GEMINI_API_KEY not configured',
      hint: 'Set GEMINI_API_KEY in .env.local or Vercel environment variables'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Only POST allowed (REST API to start the request)
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('[STREAM] Parsing request body...');
    // Parse image from request body
    const { image } = await request.json();
    console.log('[STREAM] Request body parsed:', {
      hasImage: !!image,
      imageType: typeof image,
      imageLength: image ? image.length : 0
    });

    if (!image) {
      console.error('[STREAM] ❌ No image in request body');
      return new Response(JSON.stringify({ error: 'Image required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize Gemini client with API key
    // Ensure API key is a string (Edge runtime compatibility)
    if (typeof GEMINI_API_KEY !== 'string' || GEMINI_API_KEY.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid API key format' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('[STREAM] Initializing Gemini client...');
    const ai = new GoogleGenAI({ 
      apiKey: String(GEMINI_API_KEY) // Explicitly convert to string
    });
    console.log('[STREAM] ✅ Gemini client initialized');
    
    const encoder = new TextEncoder();

    // Create SSE stream (starts immediately after POST)
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log('[STREAM] Stream controller started');
          
          // Event 1: Start - connection established
          console.log('[STREAM] Sending start event...');
          controller.enqueue(encoder.encode(`event: start\ndata: ${JSON.stringify({ status: 'started' })}\n\n`));
          console.log('[STREAM] ✅ Start event sent');

          // Call Gemini API with streaming
          const prompt = `You are SideKick, an AI visual assistant helping a blind or visually impaired user navigate their environment safely and independently.

CORE PRINCIPLES:
1. SAFETY FIRST - Always mention hazards and obstacles before anything else
2. BE CONCISE - Users are listening, not reading. Keep descriptions brief but complete
3. USE SPATIAL LANGUAGE - Clock positions (12 o'clock = straight ahead), distances in feet/meters
4. BE CONSISTENT - Use the same terminology every time so users can learn your patterns

RESPONSE STRUCTURE (follow this order):
1. IMMEDIATE HAZARDS (only if present) → "Warning: [hazard] [location] [distance]"
2. PATH STATUS (always include) → "Path is clear" OR "Obstacle: [what] at [location]"
3. ENVIRONMENT CONTEXT (brief) → Indoor/outdoor, type of space
4. KEY INFORMATION (if relevant) → Signs, text, doors, stairs, people

LANGUAGE RULES:
- Never say "I see" or "In this image" - just describe directly
- Never use visual-only descriptions like "beautiful" or "colorful"
- Keep responses under 40 words unless there's a hazard requiring detail`;

          console.log('[STREAM] Calling Gemini API with streaming...', {
            model: GEMINI_MODEL,
            imageLength: image.length,
            promptLength: prompt.length
          });
          
          const response = await ai.models.generateContentStream({
            model: GEMINI_MODEL,
            contents: [{
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/jpeg', data: image } }
              ]
            }],
            generationConfig: { 
              maxOutputTokens: 600, // Increased for more detailed instructions
              temperature: 0.3, // Slightly higher for more natural speech
            },
          });

          console.log('[STREAM] ✅ Gemini API response received, starting to stream chunks...');
          let chunkCount = 0;

          // Event 2: Chunks - continuously stream text as it arrives from Gemini
          for await (const chunk of response) {
            chunkCount++;
            console.log(`[STREAM] Chunk ${chunkCount} received:`, {
              hasText: !!chunk.text,
              textLength: chunk.text ? chunk.text.length : 0,
              chunkKeys: Object.keys(chunk)
            });
            
            if (chunk.text) {
              controller.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify({ text: chunk.text })}\n\n`));
              console.log(`[STREAM] ✅ Chunk ${chunkCount} sent to client`);
            } else {
              console.warn(`[STREAM] ⚠️ Chunk ${chunkCount} has no text property:`, chunk);
            }
          }

          console.log(`[STREAM] ✅ All chunks processed (total: ${chunkCount})`);
          
          // Event 3: Complete - stream finished
          console.log('[STREAM] Sending complete event...');
          controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
          console.log('[STREAM] ✅ Stream closed successfully');

        } catch (error) {
          // Event 4: Error - if something goes wrong
          console.error('[STREAM] ❌ Error in stream:', {
            message: error.message,
            name: error.name,
            stack: error.stack,
            errorObject: error,
            errorString: String(error),
            errorJSON: JSON.stringify(error, Object.getOwnPropertyNames(error))
          });
          
          // Extract meaningful error message
          let errorMessage = error.message || 'Unknown error';
          
          // Handle Gemini API errors
          if (error.response || error.status) {
            const status = error.status || error.response?.status;
            const statusText = error.statusText || error.response?.statusText;
            
            if (status === 429) {
              errorMessage = 'Rate limit exceeded. Please wait before trying again.';
            } else if (status) {
              errorMessage = `API Error ${status}: ${statusText || errorMessage}`;
            }
          }
          
          // Send error event
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`));
          controller.close();
        }
      },
    });

    // Return SSE stream response (keeps connection open for continuous chunks)
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('[STREAM] ❌ Outer catch error:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      errorObject: error
    });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
