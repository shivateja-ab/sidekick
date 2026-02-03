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
        console.log('🌐 analyzeImageStream called', { 
            imageType: imageData instanceof Blob ? 'Blob' : typeof imageData,
            imageSize: imageData instanceof Blob ? imageData.size : 'unknown',
            baseUrl: this.baseUrl,
            endpoint: config.api.endpoints.analyzeStream
        });
        
        let base64Image;
        if (imageData instanceof Blob) {
            console.log('📦 Converting Blob to base64...');
            base64Image = await this.blobToBase64(imageData);
            console.log('✅ Base64 conversion complete, length:', base64Image.length);
        } else {
            base64Image = imageData;
        }

        const url = `${this.baseUrl}${config.api.endpoints.analyzeStream}`;
        console.log('📡 Making request to:', url);
        const abortController = new AbortController();
        
        // Use fetch with ReadableStream for SSE
        console.log('🔄 Sending fetch request...');
        const response = await fetch(url, {
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

        console.log('📥 Response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: Object.fromEntries(response.headers.entries())
        });

        if (!response.ok) {
            console.error('❌ Response not OK:', response.status);
            const error = await response.json().catch(() => ({ message: 'Unknown error' }));
            console.error('Error details:', error);
            if (callbacks.onError) {
                callbacks.onError(new Error(error.message || `HTTP ${response.status}`));
            }
            return { abort: () => {} };
        }
        
        console.log('✅ Response OK, starting to read stream...');

        if (!response.body) {
            if (callbacks.onError) {
                callbacks.onError(new Error('Streaming not supported'));
            }
            return { abort: () => {} };
        }

        // Process SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processStream = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    
                    // Process complete SSE messages
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line

                    let currentEvent = null;
                    let currentData = '';

                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            currentEvent = line.slice(7).trim();
                        } else if (line.startsWith('data: ')) {
                            currentData = line.slice(6).trim();
                        } else if (line === '' && currentEvent && currentData) {
                            // Complete SSE message
                            try {
                                const data = JSON.parse(currentData);
                                
                                // Call appropriate callback
                                switch (currentEvent) {
                                    case 'start':
                                        if (callbacks.onStart) callbacks.onStart(data);
                                        break;
                                    case 'chunk':
                                        if (callbacks.onChunk) callbacks.onChunk(data);
                                        break;
                                    case 'hazard':
                                        if (callbacks.onHazard) callbacks.onHazard(data);
                                        break;
                                    case 'complete':
                                        if (callbacks.onComplete) callbacks.onComplete(data);
                                        break;
                                    case 'done':
                                        if (callbacks.onDone) callbacks.onDone(data);
                                        break;
                                    case 'error':
                                        if (callbacks.onError) {
                                            callbacks.onError(new Error(data.message || 'Stream error'));
                                        }
                                        break;
                                }
                            } catch (e) {
                                console.error('Failed to parse SSE data:', e);
                            }
                            
                            // Reset for next message
                            currentEvent = null;
                            currentData = '';
                        }
                    }
                }
            } catch (error) {
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
