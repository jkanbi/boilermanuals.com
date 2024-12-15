// navbar.js
document.addEventListener('DOMContentLoaded', function() {
    const navbarHtml = `
        <nav class="navbar">
          
            <i class="fa-duotone fa-light fa-file-pdf"></i>

            <button class="navbar-toggle" onclick="toggleMenu()">
                <i class="fas fa-bars"></i>
            </button>
        
            <ul class="navbar-menu">
                <li><a href="index.html">Boilers</a></li>
                <li><a href="controls.html">Controls</a></li>
                <li><a href="#contact">Contact</a></li>
                <li><a href="about.html">About</a></li>
            </ul>
        </nav>
    `;

    // Insert the navbar at the beginning of the body
    document.body.insertAdjacentHTML('afterbegin', navbarHtml);
});
