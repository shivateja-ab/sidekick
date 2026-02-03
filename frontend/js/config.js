/**
 * Client-side configuration
 * NOTE: NO API KEYS should be stored here!
 */

export const config = {
    // API endpoints
    api: {
        // Use relative path for local dev, or set via window.SIDEKICK_CONFIG
        baseUrl: (typeof window !== 'undefined' && window.SIDEKICK_CONFIG?.apiBaseUrl) || '/api/v1',
        endpoints: {
            analyze: '/analyze',
            analyzeStream: '/analyze/stream',
            health: '/health',
            config: '/config'
        }
    },
    
    // App settings
    app: {
        name: 'SideKick',
        version: '1.0.0',
        cacheEnabled: true,
        cacheMaxAge: 24 * 60 * 60 * 1000, // 24 hours
        maxImageSize: 2 * 1024 * 1024, // 2MB (optimized for free tier)
        supportedFormats: ['image/jpeg', 'image/png', 'image/webp']
    },
    
    // Camera settings
    // Note: Video is ONLY for preview. Images are captured manually via button click.
    // Each capture = 1 API call. No continuous/automatic capture.
    camera: {
        // 'user' = front camera (laptop webcam), 'environment' = rear camera (phone)
        // Auto-detect: try user first (laptop), fallback to environment (phone)
        facingMode: 'user', // Changed to 'user' for laptop compatibility
        width: 640,
        height: 480,
        constraints: {
            video: {
                facingMode: { ideal: 'user' }, // Prefer front camera (laptop webcam)
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        }
    },
    
    // Speech settings
    speech: {
        enabled: true,
        lang: 'en-US',
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0
    }
};
