/**
 * Text-to-speech functionality
 */

import { config } from './config.js';

class SpeechManager {
    constructor() {
        this.synthesis = window.speechSynthesis;
        this.isEnabled = config.speech.enabled && 'speechSynthesis' in window;
        this.currentUtterance = null;
        this.queue = [];
        this.isSpeaking = false;
    }

    /**
     * Speak text (queues for continuous streaming)
     * @param {string} text - Text to speak
     * @param {Object} options - Speech options
     */
    speak(text, options = {}) {
        if (!this.isEnabled || !text) {
            return;
        }

        // Trim and filter empty text
        const trimmedText = text.trim();
        if (!trimmedText) {
            return;
        }

        // Add to queue
        this.queue.push({ text: trimmedText, options });

        // Start speaking if not already
        if (!this.isSpeaking) {
            this.processQueue();
        }
    }

    /**
     * Process speech queue
     */
    processQueue() {
        if (this.queue.length === 0) {
            this.isSpeaking = false;
            return;
        }

        this.isSpeaking = true;
        const { text, options } = this.queue.shift();

        const utterance = new SpeechSynthesisUtterance(text);
        
        utterance.lang = options.lang || config.speech.lang;
        utterance.rate = options.rate || config.speech.rate;
        utterance.pitch = options.pitch || config.speech.pitch;
        utterance.volume = options.volume || config.speech.volume;

        utterance.onend = () => {
            // Process next item in queue
            this.processQueue();
        };

        utterance.onerror = (error) => {
            console.error('Speech synthesis error:', error);
            // Continue with next item even on error
            this.processQueue();
        };

        this.currentUtterance = utterance;
        this.synthesis.speak(utterance);
    }

    /**
     * Stop current speech and clear queue
     */
    stop() {
        if (this.synthesis.speaking) {
            this.synthesis.cancel();
        }
        this.queue = [];
        this.currentUtterance = null;
        this.isSpeaking = false;
    }

    /**
     * Check if speech is currently speaking
     * @returns {boolean}
     */
    isSpeaking() {
        return this.synthesis.speaking;
    }

    /**
     * Enable or disable speech
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this.isEnabled = enabled && 'speechSynthesis' in window;
        if (!enabled) {
            this.stop();
        }
    }

    /**
     * Get available voices
     * @returns {Promise<SpeechSynthesisVoice[]>}
     */
    async getVoices() {
        return new Promise((resolve) => {
            let voices = this.synthesis.getVoices();
            if (voices.length > 0) {
                resolve(voices);
            } else {
                this.synthesis.onvoiceschanged = () => {
                    voices = this.synthesis.getVoices();
                    resolve(voices);
                };
            }
        });
    }
}

export const speech = new SpeechManager();
