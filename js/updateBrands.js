const fs = require('fs');
const path = require('path');

const brandsDir = path.join(__dirname, '..', 'brands');
const files = fs.readdirSync(brandsDir);

files.forEach(file => {
    if (file.endsWith('.html')) {
        const filePath = path.join(brandsDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Add scripts if they don't exist
        if (!content.includes('config.js')) {
            content = content.replace(
                /<link rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\/5\.15\.3\/css\/all\.min\.css">/,
                `<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css">
    <!-- Add configuration and utility scripts -->
    <script src="../js/config.js"></script>
    <script src="../js/urlUtils.js"></script>`
            );
            
            fs.writeFileSync(filePath, content);
            console.log(`Updated ${file}`);
        }
    }
}); 