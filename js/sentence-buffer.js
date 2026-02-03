/**
 * Sentence Buffer - Accumulates text chunks and extracts complete sentences
 * Splits on sentence boundaries (. ! ?) to prevent mid-sentence TTS breaks
 */

class SentenceBuffer {
    constructor() {
        this.buffer = '';
        this.onSentence = null; // Callback: (sentence: string) => void
    }

    /**
     * Add text chunk to buffer and extract complete sentences
     * @param {string} chunk - Text chunk from stream
     */
    addChunk(chunk) {
        if (!chunk || typeof chunk !== 'string') {
            return;
        }

        console.log('📝 [SentenceBuffer] Adding chunk:', chunk.substring(0, 50));
        
        // Add chunk to buffer
        this.buffer += chunk;
        
        // Extract complete sentences (ending with . ! ?)
        const sentenceEndRegex = /([.!?]+)\s+/g;
        let match;
        let lastIndex = 0;
        const sentences = [];

        while ((match = sentenceEndRegex.exec(this.buffer)) !== null) {
            const sentence = this.buffer.substring(lastIndex, match.index + match[1].length).trim();
            if (sentence) {
                sentences.push(sentence);
            }
            lastIndex = match.index + match[0].length;
        }

        // Remove extracted sentences from buffer
        if (lastIndex > 0) {
            this.buffer = this.buffer.substring(lastIndex);
        }

        // Emit complete sentences
        if (sentences.length > 0) {
            console.log(`✅ [SentenceBuffer] Extracted ${sentences.length} complete sentence(s)`);
            sentences.forEach(sentence => {
                if (this.onSentence) {
                    this.onSentence(sentence);
                }
            });
        } else {
            console.log('⏳ [SentenceBuffer] No complete sentences yet, buffering...');
        }
    }

    /**
     * Flush remaining buffer as final sentence (even if no punctuation)
     * Call this when stream completes
     */
    flush() {
        const remaining = this.buffer.trim();
        if (remaining) {
            console.log('📤 [SentenceBuffer] Flushing remaining buffer:', remaining);
            if (this.onSentence) {
                this.onSentence(remaining);
            }
            this.buffer = '';
        }
    }

    /**
     * Clear buffer without emitting
     */
    reset() {
        console.log('🔄 [SentenceBuffer] Resetting buffer');
        this.buffer = '';
    }

    /**
     * Get current buffer state (for debugging)
     */
    getState() {
        return {
            bufferLength: this.buffer.length,
            buffer: this.buffer.substring(0, 100) // First 100 chars
        };
    }
}

export { SentenceBuffer };
