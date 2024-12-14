// navbar.js
document.addEventListener('DOMContentLoaded', function() {
    const navbarHtml = `
        <nav class="navbar">
            <ul class="nav-list">

                <li><a href="/">Home</a></li>
                <li><a href="index.html">Boilers</a></li>
                <li><a href="controls.html">Controls</a></li>
                <li><a href="#contact">Contact</a></li>
                <li><a href="#about">About</a></li>

            </ul>
        </nav>
    `;

    // Insert the navbar at the beginning of the body
    document.body.insertAdjacentHTML('afterbegin', navbarHtml);
});
