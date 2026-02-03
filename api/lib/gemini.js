// Simple Gemini API wrapper
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-pro-preview';

const PROMPTS = {
  brief: 'Describe this image briefly in one or two sentences.',
  normal: 'Analyze this image and provide a clear, helpful description of the surroundings, objects, and any potential obstacles.',
  detailed: 'Provide a comprehensive analysis of this image including all visible objects, spatial relationships, text, colors, and safety considerations.',
};

/**
 * Analyze image with Gemini (non-streaming)
 */
export async function analyzeImage(base64Image, detailLevel = 'normal') {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const prompt = PROMPTS[detailLevel] || PROMPTS.normal;

  const contents = [{
    role: 'user',
    parts: [
      { text: prompt },
      { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
    ]
  }];

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents,
    generationConfig: {
      maxOutputTokens: detailLevel === 'brief' ? 200 : detailLevel === 'detailed' ? 1000 : 500,
      temperature: 0.2,
    },
  });

  // Extract text from response
  const text = response.response?.candidates?.[0]?.content?.parts?.[0]?.text || 
               response.text || 
               'Unable to analyze image.';

  return { text: text.trim() };
}

/**
 * Analyze image with streaming (returns async generator)
 */
export async function* analyzeImageStream(base64Image, detailLevel = 'normal') {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const prompt = PROMPTS[detailLevel] || PROMPTS.normal;

  const contents = [{
    role: 'user',
    parts: [
      { text: prompt },
      { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
    ]
  }];

  const response = await ai.models.generateContentStream({
    model: GEMINI_MODEL,
    contents,
    generationConfig: {
      maxOutputTokens: detailLevel === 'brief' ? 200 : detailLevel === 'detailed' ? 1000 : 500,
      temperature: 0.2,
    },
  });

  for await (const chunk of response) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}
