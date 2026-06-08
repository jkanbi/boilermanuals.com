// navbar.js
document.addEventListener('DOMContentLoaded', function() {
    const navbarHtml = `
        <nav class="navbar">
            <div class="navbar-brand">
                <a href="index.html">
                    <img src="images/logo.png" alt="Boiler Manuals" class="navbar-logo" width="44" height="44">
                </a>
            </div>

            <a href="index.html" class="navbar-title">Boiler Manuals</a>

            <div class="navbar-actions">
                <button class="navbar-toggle" onclick="toggleMenu()" aria-label="Open menu">
                    <i class="fas fa-bars"></i>
                </button>
                <ul class="navbar-menu">
                    <li><a href="index.html">Boilers</a></li>
                    <li><a href="controls.html">Controls</a></li>
                    <li><a href="#contact">Contact</a></li>
                    <li><a href="about.html">About</a></li>
                </ul>
            </div>
        </nav>
    `;

    // Insert the navbar at the beginning of the body
    document.body.insertAdjacentHTML('afterbegin', navbarHtml);
});
