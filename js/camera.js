/**
 * Camera handling and image capture
 */

import { config } from './config.js';

class CameraManager {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.stream = null;
        this.isActive = false;
    }

    /**
     * Initialize camera with video and canvas elements
     * @param {HTMLVideoElement} videoElement
     * @param {HTMLCanvasElement} canvasElement
     */
    init(videoElement, canvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;
        
        if (this.canvas) {
            this.canvas.width = config.camera.width;
            this.canvas.height = config.camera.height;
        }
    }

    /**
     * Start camera stream
     * @param {string} facingMode - 'environment' (back) or 'user' (front)
     * @returns {Promise<void>}
     */
    async start(facingMode = null) {
        // Stop existing stream if active
        if (this.isActive) {
            this.stop();
        }

        try {
            // Use provided facingMode or default from config
            const requestedFacingMode = facingMode || config.camera.facingMode;
            
            // Build constraints with exact facingMode for mobile
            const constraints = {
                video: {
                    facingMode: requestedFacingMode === 'environment' 
                        ? { ideal: 'environment' } // Prefer back camera
                        : { ideal: 'user' }, // Fallback to front
                    width: { ideal: config.camera.width },
                    height: { ideal: config.camera.height }
                }
            };

            console.log('[Camera] Requesting camera with facingMode:', requestedFacingMode);
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            if (this.video) {
                this.video.srcObject = this.stream;
                await this.video.play();
                this.isActive = true;
                console.log('[Camera] ✅ Camera started successfully');
            }
        } catch (error) {
            console.error('[Camera] ❌ Error starting camera:', error);
            
            // If back camera fails, try front camera as fallback
            if (facingMode === 'environment' || config.camera.facingMode === 'environment') {
                console.log('[Camera] ⚠️ Back camera failed, trying front camera...');
                try {
                    const fallbackConstraints = {
                        video: {
                            facingMode: { ideal: 'user' },
                            width: { ideal: config.camera.width },
                            height: { ideal: config.camera.height }
                        }
                    };
                    this.stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                    if (this.video) {
                        this.video.srcObject = this.stream;
                        await this.video.play();
                        this.isActive = true;
                        console.log('[Camera] ✅ Front camera started as fallback');
                    }
                } catch (fallbackError) {
                    throw new Error(`Failed to start camera: ${error.message}`);
                }
            } else {
                throw new Error(`Failed to start camera: ${error.message}`);
            }
        }
    }

    /**
     * Switch between front and back camera
     * @returns {Promise<void>}
     */
    async switchCamera() {
        if (!this.isActive) {
            throw new Error('Camera not active');
        }

        // Get current facing mode from active track
        const videoTrack = this.stream.getVideoTracks()[0];
        const currentSettings = videoTrack.getSettings();
        const currentFacingMode = currentSettings.facingMode;
        
        // Determine target facing mode
        const targetFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        
        console.log(`[Camera] Switching from ${currentFacingMode} to ${targetFacingMode}`);
        
        // Stop current stream and start with new facing mode
        this.stop();
        await this.start(targetFacingMode);
    }

    /**
     * Stop camera stream
     */
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.video) {
            this.video.srcObject = null;
        }

        this.isActive = false;
    }

    /**
     * Capture current frame as image
     * @param {string} format - Image format (image/jpeg, image/png)
     * @param {number} quality - Image quality (0-1) for JPEG
     * @returns {Promise<Blob>}
     */
    async capture(format = 'image/jpeg', quality = 0.92) {
        if (!this.video || !this.canvas) {
            throw new Error('Camera not initialized');
        }

        if (!this.isActive) {
            throw new Error('Camera not active');
        }

        const ctx = this.canvas.getContext('2d');
        
        // Draw current video frame to canvas
        ctx.drawImage(
            this.video,
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );

        // Convert canvas to blob
        return new Promise((resolve, reject) => {
            this.canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to capture image'));
                    }
                },
                format,
                quality
            );
        });
    }

    /**
     * Check if camera is available
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return false;
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.some(device => device.kind === 'videoinput');
        } catch (error) {
            return false;
        }
    }

    /**
     * Get current video dimensions
     * @returns {Object}
     */
    getDimensions() {
        if (!this.video) {
            return { width: 0, height: 0 };
        }

        return {
            width: this.video.videoWidth || config.camera.width,
            height: this.video.videoHeight || config.camera.height
        };
    }
}

export const camera = new CameraManager();
