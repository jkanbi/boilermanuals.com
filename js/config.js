// Base URL configuration
const CONFIG = {
    BASE_URL: 'https://hub.arated.com'
};

// Export the configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
} 