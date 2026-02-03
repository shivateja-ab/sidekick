// REST API endpoint: POST with image → Returns SSE stream
// Flow: Client sends POST with image → Server immediately returns SSE stream → Streams chunks continuously
import { GoogleGenAI } from '@google/genai';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // Get API key from environment (Edge runtime supports process.env)
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';

  // Validate API key exists and is valid
  if (!GEMINI_API_KEY || typeof GEMINI_API_KEY !== 'string' || GEMINI_API_KEY.trim().length === 0) {
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
    // Parse image from request body
    const { image } = await request.json();
    if (!image) {
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

    const ai = new GoogleGenAI({ 
      apiKey: String(GEMINI_API_KEY) // Explicitly convert to string
    });
    const encoder = new TextEncoder();

    // Create SSE stream (starts immediately after POST)
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Event 1: Start - connection established
          controller.enqueue(encoder.encode(`event: start\ndata: ${JSON.stringify({ status: 'started' })}\n\n`));

          // Call Gemini API with streaming
          const response = await ai.models.generateContentStream({
            model: GEMINI_MODEL,
            contents: [{
              role: 'user',
              parts: [
                { text: 'Describe this image for a visually impaired user. Be clear and concise.' },
                { inlineData: { mimeType: 'image/jpeg', data: image } }
              ]
            }],
            generationConfig: { maxOutputTokens: 500, temperature: 0.2 },
          });

          // Event 2: Chunks - continuously stream text as it arrives from Gemini
          for await (const chunk of response) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(`event: chunk\ndata: ${JSON.stringify({ text: chunk.text })}\n\n`));
            }
          }

          // Event 3: Complete - stream finished
          controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();

        } catch (error) {
          // Event 4: Error - if something goes wrong
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`));
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
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
