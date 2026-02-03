/**
 * TTS Queue - Manages sequential text-to-speech playback
 * Prevents overlapping speech by queuing sentences and processing one at a time
 */

class TTSQueue {
    constructor(options = {}) {
        this.queue = [];
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.synth = window.speechSynthesis;
        this.voicesLoaded = false;
        this.audioUnlocked = false; // Mobile requires user interaction to unlock audio
        this.iOSResumeInterval = null;
        
        // Configuration
        this.rate = options.rate || 1.1; // Slightly faster for navigation
        this.pitch = options.pitch || 1.0;
        this.volume = options.volume || 1.0;
        this.lang = options.lang || 'en-US';
        
        // Bind methods
        this.handleUtteranceEnd = this.handleUtteranceEnd.bind(this);
        this.handleUtteranceError = this.handleUtteranceError.bind(this);
        
        // Wait for voices to load (critical for mobile)
        this.loadVoices();
        
        // Detect iOS and set up resume interval
        this.setupIOSResume();
    }

    /**
     * Load voices - required for mobile browsers
     */
    loadVoices() {
        // Check if voices are already available
        if (this.synth.getVoices().length > 0) {
            this.voicesLoaded = true;
            console.log('[TTSQueue] ✅ Voices loaded:', this.synth.getVoices().length);
            return;
        }

        // Wait for voiceschanged event (mobile browsers load voices asynchronously)
        const onVoicesChanged = () => {
            const voices = this.synth.getVoices();
            if (voices.length > 0) {
                this.voicesLoaded = true;
                console.log('[TTSQueue] ✅ Voices loaded:', voices.length);
                this.synth.removeEventListener('voiceschanged', onVoicesChanged);
            }
        };

        this.synth.addEventListener('voiceschanged', onVoicesChanged);
        
        // Fallback: mark as loaded after timeout (some browsers don't fire event)
        setTimeout(() => {
            if (!this.voicesLoaded && this.synth.getVoices().length > 0) {
                this.voicesLoaded = true;
                console.log('[TTSQueue] ✅ Voices loaded (timeout fallback)');
            }
        }, 1000);
    }

    /**
     * Unlock audio on mobile - must be called from user interaction
     * Speaks a short phrase to activate audio session
     */
    unlockAudio() {
        if (this.audioUnlocked) {
            return Promise.resolve();
        }

        console.log('[TTSQueue] 🔓 Unlocking audio (mobile requirement)');
        
        return new Promise((resolve) => {
            // Speak a very short phrase to unlock audio
            const unlockUtterance = new SpeechSynthesisUtterance(' ');
            unlockUtterance.volume = 0.01; // Almost silent
            unlockUtterance.onend = () => {
                this.audioUnlocked = true;
                console.log('[TTSQueue] ✅ Audio unlocked');
                resolve();
            };
            unlockUtterance.onerror = () => {
                // Even if it fails, mark as unlocked (some browsers don't need it)
                this.audioUnlocked = true;
                console.log('[TTSQueue] ⚠️ Unlock attempt failed, continuing anyway');
                resolve();
            };
            this.synth.speak(unlockUtterance);
        });
    }

    /**
     * Setup iOS resume interval - iOS pauses speechSynthesis when idle
     */
    setupIOSResume() {
        // Detect iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        
        if (isIOS) {
            console.log('[TTSQueue] 📱 iOS detected, setting up resume interval');
            // Resume speechSynthesis every 2 seconds if paused (iOS quirk)
            this.iOSResumeInterval = setInterval(() => {
                if (this.isSpeaking && this.synth.paused) {
                    console.log('[TTSQueue] 🔄 Resuming paused speech (iOS)');
                    this.synth.resume();
                }
            }, 2000);
        }
    }

    /**
     * Cleanup iOS interval
     */
    cleanup() {
        if (this.iOSResumeInterval) {
            clearInterval(this.iOSResumeInterval);
            this.iOSResumeInterval = null;
        }
    }

    /**
     * Add sentence to queue
     * @param {string} text - Sentence to speak
     */
    enqueue(text) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return;
        }

        const trimmed = text.trim();
        console.log('🎤 [TTSQueue] Enqueuing:', trimmed.substring(0, 50));
        
        this.queue.push(trimmed);
        this.processQueue();
    }

    /**
     * Process queue - speak next sentence if not already speaking
     */
    processQueue() {
        // If already speaking, wait for current to finish
        if (this.isSpeaking) {
            console.log('⏸️ [TTSQueue] Already speaking, queued:', this.queue.length);
            return;
        }

        // If queue is empty, nothing to do
        if (this.queue.length === 0) {
            return;
        }

        // Get next sentence from queue
        const text = this.queue.shift();
        this.speak(text);
    }

    /**
     * Speak a sentence
     * @param {string} text - Text to speak
     */
    speak(text) {
        try {
            // Check if audio is unlocked (mobile requirement)
            if (!this.audioUnlocked) {
                console.warn('[TTSQueue] ⚠️ Audio not unlocked, attempting to unlock...');
                this.unlockAudio().then(() => {
                    // Retry after unlock
                    this.speak(text);
                });
                return;
            }

            // Wait for voices to load (mobile browsers)
            if (!this.voicesLoaded) {
                console.log('[TTSQueue] ⏳ Waiting for voices to load...');
                setTimeout(() => {
                    if (this.voicesLoaded) {
                        this.speak(text);
                    } else {
                        console.warn('[TTSQueue] ⚠️ Voices not loaded, speaking anyway');
                        this.voicesLoaded = true; // Force continue
                        this.speak(text);
                    }
                }, 500);
                return;
            }

            // Cancel any ongoing speech
            this.synth.cancel();

            // Resume if paused (iOS quirk)
            if (this.synth.paused) {
                this.synth.resume();
            }

            // Create new utterance
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = this.rate;
            utterance.pitch = this.pitch;
            utterance.volume = this.volume;
            utterance.lang = this.lang;

            // Set up event handlers
            utterance.onstart = () => {
                this.isSpeaking = true;
                this.currentUtterance = utterance;
                console.log('🔊 [TTSQueue] Speaking:', text.substring(0, 50));
            };

            utterance.onend = this.handleUtteranceEnd;
            utterance.onerror = this.handleUtteranceError;

            // Speak
            this.synth.speak(utterance);

        } catch (error) {
            console.error('❌ [TTSQueue] Error speaking:', error);
            this.isSpeaking = false;
            this.currentUtterance = null;
            // Continue processing queue even on error
            this.processQueue();
        }
    }

    /**
     * Handle utterance end - process next in queue
     */
    handleUtteranceEnd() {
        console.log('✅ [TTSQueue] Finished speaking');
        this.isSpeaking = false;
        this.currentUtterance = null;
        
        // Process next item in queue
        this.processQueue();
    }

    /**
     * Handle utterance error
     */
    handleUtteranceError(event) {
        console.error('❌ [TTSQueue] Speech error:', event.error);
        this.isSpeaking = false;
        this.currentUtterance = null;
        
        // Continue processing queue even on error
        this.processQueue();
    }

    /**
     * Stop current speech and clear queue
     */
    stop() {
        console.log('🛑 [TTSQueue] Stopping and clearing queue');
        this.synth.cancel();
        this.isSpeaking = false;
        this.currentUtterance = null;
        this.queue = [];
        
        // Resume if paused (iOS)
        if (this.synth.paused) {
            this.synth.resume();
        }
    }

    /**
     * Clear queue but let current speech finish
     */
    clearQueue() {
        console.log('🗑️ [TTSQueue] Clearing queue (keeping current speech)');
        this.queue = [];
    }

    /**
     * Get queue state (for debugging)
     */
    getState() {
        return {
            queueLength: this.queue.length,
            isSpeaking: this.isSpeaking,
            queue: this.queue.slice(0, 3) // First 3 items
        };
    }
}

export { TTSQueue };
