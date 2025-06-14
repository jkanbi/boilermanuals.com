// URL utility functions
const URLUtils = {
    /**
     * Generates a full URL by combining the base URL with the path
     * @param {string} path - The path to append to the base URL
     * @returns {string} The complete URL
     */
    getFullUrl: function(path) {
        // Remove leading slash if present
        path = path.startsWith('/') ? path.substring(1) : path;
        return `${CONFIG.BASE_URL}/${path}`;
    },

    /**
     * Updates all download links in the document to use the base URL
     */
    updateDownloadLinks: function() {
        const links = document.querySelectorAll('a[href*="download"]');
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
                // Extract the path after 'download/'
                const pathMatch = href.match(/download\/(.*)/);
                if (pathMatch) {
                    const path = pathMatch[1];
                    link.href = this.getFullUrl(`download/${path}`);
                }
            }
        });
    }
};

// Export the utility functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = URLUtils;
} else {
    window.URLUtils = URLUtils;
} 