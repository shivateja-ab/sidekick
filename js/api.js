/**
 * REST API client for SideKick
 */

import { config } from './config.js';

class ApiClient {
    constructor() {
        this.baseUrl = config.api.baseUrl;
    }

    /**
     * Make an API request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>}
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers,
            },
        };

        try {
            const response = await fetch(url, mergedOptions);
            
            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(error.message || `HTTP ${response.status}`);
            }

            return response;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    /**
     * Analyze an image with SSE streaming response
     * Uses EventSource-like API for Server-Sent Events
     * @param {string|Blob} imageData - Base64 string or Blob
     * @param {Object} options - Analysis options
     * @param {Object} callbacks - Event callbacks
     * @param {Function} callbacks.onStart - Called when stream starts
     * @param {Function} callbacks.onChunk - Called for each text chunk
     * @param {Function} callbacks.onHazard - Called when hazard detected
     * @param {Function} callbacks.onComplete - Called when analysis completes
     * @param {Function} callbacks.onDone - Called when stream ends
     * @param {Function} callbacks.onError - Called on error
     * @returns {Promise<{abort: Function}>} Abort function
     */
    async analyzeImageStream(imageData, options = {}, callbacks = {}) {
        console.log('[CLIENT] 🌐 analyzeImageStream called', { 
            imageType: imageData instanceof Blob ? 'Blob' : typeof imageData,
            imageSize: imageData instanceof Blob ? imageData.size : 'unknown',
            baseUrl: this.baseUrl,
            endpoint: config.api.endpoints.analyzeStream,
            hasCallbacks: Object.keys(callbacks).length > 0
        });
        
        let base64Image;
        if (imageData instanceof Blob) {
            console.log('[CLIENT] 📦 Converting Blob to base64...');
            base64Image = await this.blobToBase64(imageData);
            console.log('[CLIENT] ✅ Base64 conversion complete, length:', base64Image.length);
        } else {
            base64Image = imageData;
            console.log('[CLIENT] Using provided base64 string, length:', base64Image.length);
        }

        const url = `${this.baseUrl}${config.api.endpoints.analyzeStream}`;
        console.log('[CLIENT] 📡 Making request to:', url);
        const abortController = new AbortController();
        
        // Use fetch with ReadableStream for SSE
        console.log('[CLIENT] 🔄 Sending fetch request...', {
            method: 'POST',
            url: url,
            bodySize: JSON.stringify({ image: base64Image, ...options }).length
        });
        
        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image: base64Image,
                    ...options
                }),
                signal: abortController.signal,
            });
        } catch (fetchError) {
            console.error('[CLIENT] ❌ Fetch error:', {
                message: fetchError.message,
                name: fetchError.name,
                stack: fetchError.stack
            });
            if (callbacks.onError) {
                callbacks.onError(fetchError);
            }
            return { abort: () => {} };
        }

        console.log('[CLIENT] 📥 Response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            contentType: response.headers.get('content-type'),
            headers: Object.fromEntries(response.headers.entries())
        });

        if (!response.ok) {
            console.error('[CLIENT] ❌ Response not OK:', response.status);
            let errorData;
            try {
                errorData = await response.json();
                console.error('[CLIENT] Error response body:', errorData);
            } catch (e) {
                const text = await response.text().catch(() => 'Unable to read error response');
                console.error('[CLIENT] Error response (text):', text);
                errorData = { message: 'Unknown error' };
            }
            if (callbacks.onError) {
                callbacks.onError(new Error(errorData.message || errorData.error || `HTTP ${response.status}`));
            }
            return { abort: () => {} };
        }
        
        console.log('[CLIENT] ✅ Response OK, starting to read stream...');

        if (!response.body) {
            console.error('[CLIENT] ❌ Response has no body');
            if (callbacks.onError) {
                callbacks.onError(new Error('Streaming not supported'));
            }
            return { abort: () => {} };
        }
        
        console.log('[CLIENT] ✅ Response body available, creating reader...');

        // Process SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let eventCount = 0;

        console.log('[CLIENT] ✅ Reader created, starting to process stream...');

        const processStream = async () => {
            try {
                console.log('[CLIENT] 🔄 Starting stream processing loop...');
                while (true) {
                    const { done, value } = await reader.read();
                    
                    if (done) {
                        console.log('[CLIENT] ✅ Stream reading complete (done=true)');
                        break;
                    }

                    const chunk = decoder.decode(value, { stream: true });
                    console.log(`[CLIENT] 📦 Raw chunk received (${chunk.length} chars):`, chunk.substring(0, 100));
                    
                    buffer += chunk;
                    
                    // Process complete SSE messages
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line

                    let currentEvent = null;
                    let currentData = '';

                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            currentEvent = line.slice(7).trim();
                            console.log(`[CLIENT] 📨 Event type: ${currentEvent}`);
                        } else if (line.startsWith('data: ')) {
                            currentData = line.slice(6).trim();
                            console.log(`[CLIENT] 📄 Data received (${currentData.length} chars):`, currentData.substring(0, 100));
                        } else if (line === '' && currentEvent && currentData) {
                            // Complete SSE message
                            eventCount++;
                            console.log(`[CLIENT] ✅ Complete SSE message #${eventCount}:`, { event: currentEvent, dataLength: currentData.length });
                            
                            try {
                                const data = JSON.parse(currentData);
                                console.log(`[CLIENT] ✅ Parsed data for event '${currentEvent}':`, data);
                                
                                // Call appropriate callback
                                switch (currentEvent) {
                                    case 'start':
                                        console.log('[CLIENT] 🎬 Calling onStart callback');
                                        if (callbacks.onStart) callbacks.onStart(data);
                                        break;
                                    case 'chunk':
                                        console.log('[CLIENT] 📝 Calling onChunk callback');
                                        if (callbacks.onChunk) callbacks.onChunk(data);
                                        break;
                                    case 'hazard':
                                        console.log('[CLIENT] ⚠️ Calling onHazard callback');
                                        if (callbacks.onHazard) callbacks.onHazard(data);
                                        break;
                                    case 'complete':
                                        console.log('[CLIENT] ✅ Calling onComplete callback');
                                        if (callbacks.onComplete) callbacks.onComplete(data);
                                        break;
                                    case 'done':
                                        console.log('[CLIENT] 🏁 Calling onDone callback');
                                        if (callbacks.onDone) callbacks.onDone(data);
                                        break;
                                    case 'error':
                                        console.error('[CLIENT] ❌ Error event received:', data);
                                        if (callbacks.onError) {
                                            callbacks.onError(new Error(data.error || data.message || 'Stream error'));
                                        }
                                        break;
                                    default:
                                        console.warn(`[CLIENT] ⚠️ Unknown event type: ${currentEvent}`);
                                }
                            } catch (e) {
                                console.error('[CLIENT] ❌ Failed to parse SSE data:', {
                                    error: e.message,
                                    data: currentData,
                                    event: currentEvent
                                });
                            }
                            
                            // Reset for next message
                            currentEvent = null;
                            currentData = '';
                        }
                    }
                }
                console.log(`[CLIENT] ✅ Stream processing complete. Total events: ${eventCount}`);
            } catch (error) {
                console.error('[CLIENT] ❌ Error in stream processing:', {
                    message: error.message,
                    name: error.name,
                    stack: error.stack,
                    isAbortError: error.name === 'AbortError'
                });
                if (error.name !== 'AbortError' && callbacks.onError) {
                    callbacks.onError(error);
                }
            }
        };

        // Start processing
        processStream();

        return {
            abort: () => {
                abortController.abort();
                reader.cancel();
            }
        };
    }

    /**
     * Check API health
     * @returns {Promise<Object>}
     */
    async healthCheck() {
        const response = await this.request(config.api.endpoints.health);
        return response.json();
    }

    /**
     * Convert Blob to base64 string
     * @param {Blob} blob
     * @returns {Promise<string>}
     */
    async blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
}

export const api = new ApiClient();
