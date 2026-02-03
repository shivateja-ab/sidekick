/**
 * Main application controller
 */

import { camera } from './camera.js';
import { api } from './api.js';
import { speech } from './speech.js';
import { config } from './config.js';
import { SentenceBuffer } from './sentence-buffer.js';
import { TTSQueue } from './tts-queue.js';

class App {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.captureBtn = document.getElementById('capture-btn');
        this.startBtn = document.getElementById('start-camera-btn');
        this.stopBtn = document.getElementById('stop-camera-btn');
        this.startSidekickBtn = document.getElementById('start-sidekick-btn');
        this.switchCameraBtn = document.getElementById('switch-camera-btn');
        this.statusEl = document.getElementById('status');
        this.outputEl = document.getElementById('output');
        
        this.audioUnlocked = false; // Track if audio has been unlocked
        
        this.isProcessing = false;
        this.currentStreamAbort = null;
        this.lastCaptureTime = 0;
        this.minCaptureInterval = 4000; // 4 seconds minimum between captures (15 requests/min limit = 4 sec/request)
        
        // Initialize sentence buffer and TTS queue
        this.sentenceBuffer = new SentenceBuffer();
        this.ttsQueue = new TTSQueue({
            rate: 1.1, // Slightly faster for navigation
            pitch: 1.0,
            volume: 1.0,
            lang: 'en-US'
        });
        
        // Connect sentence buffer to TTS queue
        this.sentenceBuffer.onSentence = (sentence) => {
            console.log('📢 [App] Complete sentence ready:', sentence);
            this.ttsQueue.enqueue(sentence);
        };
    }

    async init() {
        console.log('🚀 Initializing SideKick app...');
        
        // Check if elements exist
        if (!this.video || !this.canvas || !this.captureBtn || !this.startBtn || !this.stopBtn) {
            console.error('❌ Missing required DOM elements!', {
                video: !!this.video,
                canvas: !!this.canvas,
                captureBtn: !!this.captureBtn,
                startBtn: !!this.startBtn,
                stopBtn: !!this.stopBtn
            });
            this.showStatus('Error: Missing UI elements. Check console.', 'error');
            return;
        }
        
        // Initialize camera
        camera.init(this.video, this.canvas);
        console.log('✅ Camera initialized');
        
        // Setup event listeners
        this.setupEventListeners();
        console.log('✅ Event listeners attached');
        
        // Check camera availability
        const available = await camera.isAvailable();
        if (!available) {
            this.showStatus('Camera not available', 'error');
            console.warn('⚠️ Camera not available');
        } else {
            console.log('✅ Camera is available');
        }
        
        console.log('✅ App initialization complete');
    }

    setupEventListeners() {
        // Start SideKick button - unlocks audio and initializes app
        if (this.startSidekickBtn) {
            this.startSidekickBtn.addEventListener('click', () => this.startSideKick());
        }
        
        this.startBtn.addEventListener('click', () => this.startCamera());
        this.stopBtn.addEventListener('click', () => this.stopCamera());
        this.captureBtn.addEventListener('click', () => this.captureAndAnalyze());
        
        // Camera switch button
        if (this.switchCameraBtn) {
            this.switchCameraBtn.addEventListener('click', () => this.switchCamera());
        }
    }

    /**
     * Start SideKick - unlocks audio and initializes app (required for mobile)
     */
    async startSideKick() {
        console.log('🚀 [App] Starting SideKick...');
        
        try {
            // Unlock audio (required for mobile TTS)
            this.showStatus('Unlocking audio...', 'info');
            await this.ttsQueue.unlockAudio();
            this.audioUnlocked = true;
            
            // Speak confirmation
            this.ttsQueue.enqueue('SideKick ready. Starting camera.');
            
            // Hide start button, show camera controls
            if (this.startSidekickBtn) {
                this.startSidekickBtn.style.display = 'none';
            }
            if (this.startBtn) {
                this.startBtn.style.display = 'inline-block';
            }
            if (this.switchCameraBtn) {
                this.switchCameraBtn.style.display = 'inline-block';
            }
            
            // Auto-start camera
            await this.startCamera();
            
            this.showStatus('SideKick ready!', 'success');
            
        } catch (error) {
            console.error('❌ [App] Error starting SideKick:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Switch between front and back camera
     */
    async switchCamera() {
        if (!camera.isActive) {
            this.showStatus('Camera not active', 'error');
            return;
        }

        try {
            this.showStatus('Switching camera...', 'info');
            await camera.switchCamera();
            this.showStatus('Camera switched', 'success');
        } catch (error) {
            console.error('❌ [App] Error switching camera:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    async startCamera() {
        console.log('📷 [App] Starting camera...');
        try {
            this.showStatus('Starting camera...', 'info');
            
            // Start with back camera (environment) for navigation
            await camera.start('environment');
            
            this.showStatus('Camera active - Ready to capture!', 'success');
            this.updateButtonStates(true);
            
            // Show switch camera button if multiple cameras available
            if (this.switchCameraBtn) {
                this.switchCameraBtn.style.display = 'inline-block';
            }
            
            console.log('✅ [App] Camera started successfully');
        } catch (error) {
            console.error('❌ [App] Camera start failed:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    stopCamera() {
        // Abort any ongoing stream
        if (this.currentStreamAbort) {
            this.currentStreamAbort.abort();
            this.currentStreamAbort = null;
        }
        
        // Stop TTS and clear buffers
        this.ttsQueue.stop();
        this.sentenceBuffer.reset();
        
        camera.stop();
        this.showStatus('Camera stopped', 'info');
        this.updateButtonStates(false);
    }

    async captureAndAnalyze() {
        console.log('📸 Capture & Analyze clicked');
        
        if (this.isProcessing) {
            console.log('⏸️ Already processing, ignoring click');
            return;
        }

        if (!camera.isActive) {
            console.warn('⚠️ Camera not active');
            this.showStatus('Please start camera first', 'error');
            return;
        }
        
        console.log('✅ Starting capture and analysis...');

        // Client-side throttling: prevent rapid-fire captures
        const now = Date.now();
        const timeSinceLastCapture = now - this.lastCaptureTime;
        if (timeSinceLastCapture < this.minCaptureInterval) {
            const waitTime = Math.ceil((this.minCaptureInterval - timeSinceLastCapture) / 1000);
            this.showStatus(`Please wait ${waitTime} second${waitTime > 1 ? 's' : ''} before capturing again`, 'error');
            return;
        }

        // Stop any ongoing speech and clear buffers
        this.ttsQueue.stop();
        this.sentenceBuffer.reset();

        try {
            this.isProcessing = true;
            this.captureBtn.disabled = true;
            this.showStatus('Capturing image...', 'info');

            // Capture image (single frame from video preview)
            let imageBlob = await camera.capture('image/jpeg', 0.75);
            
            // Record capture time for throttling
            this.lastCaptureTime = Date.now();

            // Clear previous results
            this.outputEl.innerHTML = '';
            
            // Start streaming analysis with SSE
            this.showStatus('Streaming analysis...', 'info');
            
            let accumulatedText = '';
            let streamAbort = null;
            let firstChunkReceived = false;
            let hazardDetected = false;

            console.log('📡 Starting API stream request...');
            streamAbort = await api.analyzeImageStream(imageBlob, {}, {
                onStart: (data) => {
                    console.log('✅ Stream started:', data);
                    this.showStatus(`Analyzing... (${data.model})`, 'info');
                    // Update button to show it's processing
                    this.captureBtn.textContent = 'Analyzing...';
                },
                
                onChunk: (data) => {
                    // Track first chunk for latency measurement
                    if (!firstChunkReceived) {
                        firstChunkReceived = true;
                        const latency = data.latency || 0;
                        console.log(`📡 [App] First chunk received in ${latency}ms`);
                        this.showStatus(`Streaming... (first words in ${latency}ms)`, 'info');
                    }
                    
                    // Add chunk to sentence buffer (will extract complete sentences)
                    const chunkText = data.text || '';
                    if (chunkText) {
                        accumulatedText += chunkText;
                        
                        // Send to sentence buffer (will queue complete sentences for TTS)
                        this.sentenceBuffer.addChunk(chunkText);
                        
                        // Update UI progressively
                        this.outputEl.innerHTML = `<div class="result-text streaming">${this.escapeHtml(accumulatedText)}</div>`;
                    }
                },
                
                onHazard: (data) => {
                    hazardDetected = true;
                    console.log('⚠️ [App] Hazard detected:', data);
                    
                    // Stop current speech and speak hazard warning immediately
                    this.ttsQueue.stop();
                    this.sentenceBuffer.reset();
                    const warning = `Warning: ${data.text || 'Hazard detected'}`;
                    this.ttsQueue.enqueue(warning);
                    
                    // Update UI with hazard warning
                    this.outputEl.innerHTML = `
                        <div class="hazard-warning ${data.severity}">
                            ⚠️ ${this.escapeHtml(warning)}
                        </div>
                        <div class="result-text streaming">${this.escapeHtml(accumulatedText)}</div>
                    `;
                    
                    this.showStatus(`⚠️ Hazard detected: ${data.type}`, 'error');
                },
                
                onComplete: (data) => {
                    console.log('✅ [App] Stream complete:', data);
                    
                    // Flush any remaining buffer (incomplete sentence at end)
                    this.sentenceBuffer.flush();
                    
                    // Display final parsed result
                    if (data.data) {
                        this.displayResult(data.data);
                    }
                    
                    const latency = data.latency || {};
                    this.showStatus(
                        `Complete (${latency.total}ms total, ${latency.firstChunk}ms to first chunk)`,
                        'success'
                    );
                },
                
                onDone: (data) => {
                    console.log('🏁 [App] Stream done:', data);
                    
                    // Ensure any remaining buffer is flushed
                    this.sentenceBuffer.flush();
                    
                    this.isProcessing = false;
                    this.captureBtn.disabled = false;
                    this.captureBtn.textContent = 'Capture & Analyze';
                },
                
                onError: (error) => {
                    console.error('[APP] ❌ Stream error callback triggered:', {
                        message: error.message,
                        name: error.name,
                        stack: error.stack,
                        errorObject: error
                    });
                    
                    // Stop TTS and clear buffers on error
                    this.ttsQueue.stop();
                    this.sentenceBuffer.reset();
                    
                    this.showStatus(`Error: ${error.message}`, 'error');
                    this.isProcessing = false;
                    this.captureBtn.disabled = false;
                    this.captureBtn.textContent = 'Capture & Analyze';
                }
            });

            // Store abort function for potential cancellation
            this.currentStreamAbort = streamAbort;

        } catch (error) {
            console.error('❌ [App] Error:', error);
            
            // Stop TTS and clear buffers on error
            this.ttsQueue.stop();
            this.sentenceBuffer.reset();
            
            this.showStatus(`Error: ${error.message}`, 'error');
            this.isProcessing = false;
            this.captureBtn.disabled = false;
        }
    }

    displayResult(result) {
        if (!result) {
            this.outputEl.textContent = 'No result';
            return;
        }

        let html = '';
        
        if (result.text) {
            html += `<div class="result-text">${this.escapeHtml(result.text)}</div>`;
        }
        
        if (result.confidence) {
            html += `<div class="result-confidence">Confidence: ${(result.confidence * 100).toFixed(1)}%</div>`;
        }
        
        if (result.tags && result.tags.length > 0) {
            html += `<div class="result-tags">Tags: ${result.tags.join(', ')}</div>`;
        }

        this.outputEl.innerHTML = html || 'No data available';
    }

    showStatus(message, type = 'info') {
        this.statusEl.textContent = message;
        this.statusEl.className = type;
        
        if (type === 'info') {
            this.statusEl.innerHTML = `<span class="loading"></span> ${message}`;
        }
    }

    updateButtonStates(cameraActive) {
        if (this.startBtn) {
            this.startBtn.disabled = cameraActive;
        }
        if (this.stopBtn) {
            this.stopBtn.disabled = !cameraActive;
        }
        this.captureBtn.disabled = !cameraActive || this.isProcessing;
        
        // Enable switch camera button when camera is active
        if (this.switchCameraBtn) {
            this.switchCameraBtn.disabled = !cameraActive;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
