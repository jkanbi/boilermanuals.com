// navbar.js
document.addEventListener('DOMContentLoaded', function() {
    if (document.querySelector('.navbar')) {
        return;
    }

    var basePath = getNavbarBasePath();

    var navbarHtml = ''
        + '<nav class="navbar">'
        + '  <a href="' + basePath + 'index.html" class="navbar-brand">'
        + '    <img src="' + basePath + 'images/logo.png" alt="" class="navbar-logo" width="44" height="44">'
        + '    <span class="navbar-title">Boiler Manuals</span>'
        + '  </a>'
        + '  <div class="navbar-actions">'
        + '    <button class="navbar-toggle" onclick="toggleMenu()" aria-label="Open menu">'
        + '      <i class="fas fa-bars"></i>'
        + '    </button>'
        + '    <ul class="navbar-menu">'
        + '      <li><a href="' + basePath + 'index.html">Boilers</a></li>'
        + '      <li><a href="' + basePath + 'controls.html">Controls</a></li>'
        + '      <li><a href="' + basePath + 'contact.html">Contact</a></li>'
        + '      <li><a href="' + basePath + 'about.html">About</a></li>'
        + '    </ul>'
        + '  </div>'
        + '</nav>';

    document.body.insertAdjacentHTML('afterbegin', navbarHtml);
});

function getNavbarBasePath() {
    var scripts = document.getElementsByTagName('script');

    for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].getAttribute('src');
        if (src && src.indexOf('navbar.js') !== -1) {
            return src.replace(/js\/navbar\.js(?:\?.*)?$/, '');
        }
    }

    return '';
}
