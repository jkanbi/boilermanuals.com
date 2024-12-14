// navbar.js
document.addEventListener('DOMContentLoaded', function() {
    const navbarHtml = `
        <nav class="navbar">
            <ul class="nav-list">
                <li><a href="index.html">Home</a></li>
                <li><a href="about.html">About</a></li>
                <li><a href="services.html">Services</a></li>
                <li><a href="contact.html">Contact</a></li>
            </ul>
        </nav>
    `;

    // Insert the navbar at the beginning of the body
    document.body.insertAdjacentHTML('afterbegin', navbarHtml);
});
