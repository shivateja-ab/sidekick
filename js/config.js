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
            analyzeStream: '/analyze/stream',
            health: '/health'
        }
    },
    
    // App settings
    app: {
        name: 'SideKick',
        version: '1.0.0',
        maxImageSize: 2 * 1024 * 1024, // 2MB
        supportedFormats: ['image/jpeg', 'image/png', 'image/webp']
    },
    
    // Camera settings
    // Note: Video is ONLY for preview. Images are captured manually via button click.
    // Each capture = 1 API call. No continuous/automatic capture.
    camera: {
        // 'environment' = back camera (required for navigation on mobile)
        // 'user' = front camera (fallback for desktop/laptop)
        facingMode: 'environment', // Default to back camera for navigation
        width: 640,
        height: 480,
        constraints: {
            video: {
                facingMode: { ideal: 'environment' }, // Prefer back camera (mobile navigation)
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
