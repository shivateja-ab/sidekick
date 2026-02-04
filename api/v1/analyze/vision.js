// Vercel Edge API endpoint for structured navigation vision queries
// Returns JSON (not streaming) based on query type
// Supports two-image comparison for position validation
import { GoogleGenAI } from '@google/genai';

export const config = {
  runtime: 'edge',
};

// Helper function to extract JSON from Gemini response
function extractJSON(text) {
  // Try to find JSON object in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.log('[VISION] Failed to parse extracted JSON:', e.message);
      return null;
    }
  }
  return null;
}

// Generate context-aware prompt based on query type
function generatePrompt(context) {
  const { query, expectedRoom, expectedLandmarks, currentInstruction, stepsIntoSegment } = context;

  switch (query) {
    case 'validate_position': {
      return `You are validating a visually impaired user's position during indoor navigation.

You are given TWO images:
1. REFERENCE IMAGE (Image 1): What this location SHOULD look like. This was captured during setup.
2. CURRENT IMAGE (Image 2): What the user sees RIGHT NOW.

NAVIGATION CONTEXT:
- Expected room type: ${expectedRoom || 'unknown'}
- Expected landmarks: ${expectedLandmarks?.join(', ') || 'none specified'}
- Current instruction: ${currentInstruction || 'none'}
- Steps into segment: ${stepsIntoSegment || 0}

YOUR TASK:
Compare the two images and determine if the user is at the expected location.

Consider:
- Is this the same room/space type?
- Are the same key features visible (doors, furniture, fixtures, signs)?
- Is the perspective similar? (User may be at slightly different angle - that's okay)
- Are expected landmarks visible?

RESPOND ONLY WITH THIS JSON (no other text):
{
  "isSameLocation": true or false,
  "confidence": 0.0 to 1.0,
  "detectedRoom": "what room type you see in current image",
  "matchingFeatures": ["features", "visible", "in", "both"],
  "missingFeatures": ["features", "in", "reference", "but", "not", "current"],
  "unexpectedFeatures": ["features", "in", "current", "but", "not", "reference"],
  "correctionNeeded": true or false,
  "suggestedAdjustment": "turn slightly left" or null if no correction needed,
  "speech": "Brief natural message for the user"
}

RULES FOR CONFIDENCE:
- Above 0.8: Very confident this is the same location
- 0.6-0.8: Likely the same location but some differences
- 0.4-0.6: Uncertain - could be same location from different angle
- Below 0.4: Probably different location

RULES FOR SPEECH:
- Be concise (under 20 words)
- Never say "I see" or "In the image"
- If on track: confirm and give encouragement
- If off track: calmly suggest correction
- Use clock positions relative to straight ahead (12 o'clock = forward)`;
    }

    case 'identify_room': {
      return `You are helping a visually impaired user identify what room they are in.

Analyze this image and identify the room type and key features.

RESPOND ONLY WITH THIS JSON (no other text):
{
  "roomType": "bedroom" or "bathroom" or "kitchen" or "corridor" or "living_room" or "entrance" or "lift_lobby" or "stairwell" or "other",
  "confidence": 0.0 to 1.0,
  "keyFeatures": ["list", "of", "identifying", "features"],
  "doors": [
    {
      "position": "clock position like 3 o'clock",
      "type": "door" or "archway" or "opening",
      "status": "open" or "closed" or "unknown"
    }
  ],
  "landmarks": ["notable", "items", "for", "navigation"],
  "speech": "Brief description for the user"
}

RULES:
- Clock positions: 12 o'clock is straight ahead, 3 is right, 9 is left, 6 is behind
- For doors, estimate position from center of image
- Landmarks should be distinctive items useful for navigation (not generic items)
- Speech should be under 30 words, natural, helpful
- Never say "I see" or "In this image" - speak directly`;
    }

    case 'check_obstacles': {
      return `You are checking for obstacles for a visually impaired user who is walking.

URGENT TASK: Identify any obstacles or hazards in the walking path ahead.

RESPOND ONLY WITH THIS JSON (no other text):
{
  "pathClear": true or false,
  "obstacles": [
    {
      "type": "stairs_up" or "stairs_down" or "person" or "furniture" or "door" or "object" or "curb" or "elevation_change" or "wet_floor" or "other",
      "position": "directly ahead" or "slightly left" or "slightly right" or "to the left" or "to the right",
      "distance": "immediate" or "close" or "far",
      "urgent": true or false
    }
  ],
  "speech": "Warning message or Path is clear"
}

DISTANCE DEFINITIONS:
- "immediate": Within 2 feet - URGENT, user will hit it in 1-2 steps
- "close": 2-6 feet - Warning needed, user approaching
- "far": Beyond 6 feet - Informational, no immediate danger

PRIORITY ORDER (check in this order):
1. Stairs or elevation changes - ALWAYS urgent if immediate
2. Moving people or objects
3. Head-level obstacles (signs, branches)
4. Ground obstacles (objects, cords, rugs)
5. Doors (especially if closed)

RULES FOR SPEECH:
- If urgent obstacle: Start with "Warning:" and state obstacle and direction
- If close obstacle: State what's ahead calmly
- If path clear: Simply say "Path is clear"
- Keep under 15 words
- Be direct and actionable`;
    }

    case 'describe_scene':
    default: {
      return `You are helping a visually impaired user understand their surroundings.

Describe this scene concisely for navigation purposes.

RESPOND ONLY WITH THIS JSON (no other text):
{
  "roomType": "type of space",
  "description": "2-3 sentence description of the space",
  "obstacles": ["any", "hazards", "or", "obstacles"],
  "landmarks": ["notable", "features", "for", "orientation"],
  "speech": "Natural spoken description under 40 words"
}

RULES:
- Focus on navigation-relevant details
- Use clock positions for locations (12 o'clock = straight ahead)
- Mention doors, exits, and paths first
- Note any obstacles or hazards
- Speech should flow naturally when spoken aloud
- Never say "I see" or "In this image"`;
    }
  }
}

export default async function handler(request) {
  console.log('[VISION] Request received:', {
    method: request.method,
    url: request.url,
    hasBody: !!request.body
  });

  // Get API key and model from environment
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  console.log('[VISION] Environment check:', {
    hasApiKey: !!GEMINI_API_KEY,
    model: GEMINI_MODEL,
    runtime: 'edge'
  });

  // Validate API key
  if (!GEMINI_API_KEY || typeof GEMINI_API_KEY !== 'string' || GEMINI_API_KEY.trim().length === 0) {
    console.error('[VISION] ❌ API key validation failed');
    return new Response(JSON.stringify({
      success: false,
      error: 'GEMINI_API_KEY not configured',
      speech: 'I had trouble analyzing that image. Please try again.'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
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

  // Only POST allowed
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({
      success: false,
      error: 'Method not allowed',
      speech: 'I had trouble analyzing that image. Please try again.'
    }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    console.log('[VISION] Parsing request body...');
    const { currentImage, referenceImage, context } = await request.json();
    
    console.log('[VISION] Request body parsed:', {
      hasCurrentImage: !!currentImage,
      currentImageLength: currentImage ? currentImage.length : 0,
      hasReferenceImage: !!referenceImage,
      referenceImageLength: referenceImage ? referenceImage.length : 0,
      hasContext: !!context,
      query: context?.query
    });

    // Validate currentImage (always required)
    if (!currentImage) {
      console.error('[VISION] ❌ No currentImage in request body');
      return new Response(JSON.stringify({
        success: false,
        error: 'currentImage required',
        speech: 'I had trouble analyzing that image. Please try again.'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Validate context
    if (!context || !context.query) {
      console.error('[VISION] ❌ Invalid context in request body');
      return new Response(JSON.stringify({
        success: false,
        error: 'Context with query type required',
        speech: 'I had trouble analyzing that image. Please try again.'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // For validate_position, referenceImage is required
    if (context.query === 'validate_position' && !referenceImage) {
      console.error('[VISION] ❌ validate_position requires referenceImage');
      return new Response(JSON.stringify({
        success: false,
        error: 'referenceImage is required for validate_position query',
        speech: 'Reference image is needed to validate your position. Please try again.'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Generate prompt based on query type
    const prompt = generatePrompt(context);
    console.log('[VISION] Generated prompt for query type:', context.query);
    console.log('[VISION] Has reference image:', !!referenceImage);

    // Initialize Gemini client
    console.log('[VISION] Initializing Gemini client...');
    const ai = new GoogleGenAI({
      apiKey: String(GEMINI_API_KEY)
    });
    console.log('[VISION] ✅ Gemini client initialized');

    // Prepare content parts for Gemini API
    const parts = [{ text: prompt }];
    
    // For validate_position with referenceImage, send both images
    if (context.query === 'validate_position' && referenceImage) {
      parts.push(
        { inlineData: { mimeType: 'image/jpeg', data: referenceImage } },  // First image = reference
        { inlineData: { mimeType: 'image/jpeg', data: currentImage } }      // Second image = current
      );
      console.log('[VISION] Using two-image comparison mode');
    } else {
      // For other queries, send only current image
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: currentImage } });
      console.log('[VISION] Using single-image mode');
    }

    // Call Gemini API
    console.log('[VISION] Calling Gemini API...', {
      model: GEMINI_MODEL,
      currentImageLength: currentImage.length,
      referenceImageLength: referenceImage ? referenceImage.length : 0,
      promptLength: prompt.length,
      imageCount: context.query === 'validate_position' && referenceImage ? 2 : 1
    });

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: 'user',
        parts: parts
      }],
      generationConfig: {
        maxOutputTokens: 500,
        temperature: 0.1,
      },
    });

    console.log('[VISION] ✅ Gemini API response received');

    // Extract text from response
    let responseText = '';
    if (response.text) {
      responseText = response.text;
    } else if (response.response?.text) {
      responseText = response.response.text;
    } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
      responseText = response.candidates[0].content.parts[0].text;
    } else {
      console.error('[VISION] ❌ Could not extract text from Gemini response:', response);
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid response format from AI',
        speech: 'I had trouble analyzing that image. Please try again.'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    console.log('[VISION] Response text length:', responseText.length);
    console.log('[VISION] Response text preview:', responseText.substring(0, 200));

    // Extract JSON from response
    const jsonData = extractJSON(responseText);
    
    if (!jsonData) {
      console.error('[VISION] ❌ Failed to extract JSON from response');
      return new Response(JSON.stringify({
        success: false,
        error: responseText.substring(0, 500), // Return raw text if JSON parsing fails
        speech: 'I had trouble analyzing that image. Please try again.'
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Add success flag and ensure speech field exists
    const result = {
      success: true,
      ...jsonData,
      speech: jsonData.speech || 'Analysis complete.'
    };

    console.log('[VISION] ✅ Successfully parsed response for query:', context.query);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('[VISION] ❌ Error processing request:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });

    // Handle Gemini API errors
    let errorMessage = error.message || 'Unknown error';
    if (error.response || error.status) {
      const status = error.status || error.response?.status;
      if (status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait before trying again.';
      } else if (status) {
        errorMessage = `API Error ${status}: ${errorMessage}`;
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage,
      speech: 'I had trouble analyzing that image. Please try again.'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
