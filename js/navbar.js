(function () {
    var NAV_ITEMS = [
        { id: "boilers", label: "Boilers", href: "index.html" },
        { id: "fault-codes", label: "Fault Codes", href: "fault-codes.html" },
        { id: "controls", label: "Controls", href: "controls.html" },
        { id: "contact", label: "Contact", href: "contact.html" },
        { id: "about", label: "About", href: "about.html" },
    ];

    function getNavbarBasePath() {
        var scripts = document.getElementsByTagName("script");
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].getAttribute("src") || "";
            if (src.indexOf("navbar.js") !== -1) {
                return src.replace(/js\/navbar\.js(?:\?.*)?$/, "");
            }
        }
        return "";
    }

    function getActiveNavItem() {
        var page = window.location.pathname.split("/").pop() || "index.html";
        if (!page || page === "/") {
            page = "index.html";
        }
        for (var i = 0; i < NAV_ITEMS.length; i++) {
            if (NAV_ITEMS[i].href === page) {
                return NAV_ITEMS[i];
            }
        }
        return null;
    }

    function pageTitleSuffix(item) {
        return item ? " - " + item.label : "";
    }

    function setDocumentTitle() {
        var item = getActiveNavItem();
        if (item) {
            document.title = "Boiler Manuals" + pageTitleSuffix(item);
        }
    }

    function escapeAttr(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function renderNavbar() {
        if (document.querySelector(".navbar")) {
            return;
        }

        var basePath = getNavbarBasePath();
        var activeItem = getActiveNavItem();
        var activeId = activeItem ? activeItem.id : "";
        var menuHtml = "";

        for (var i = 0; i < NAV_ITEMS.length; i++) {
            var item = NAV_ITEMS[i];
            var current = item.id === activeId ? ' aria-current="page"' : "";
            menuHtml +=
                '<li><a href="' +
                escapeAttr(basePath + item.href) +
                '"' +
                current +
                ">" +
                item.label +
                "</a></li>";
        }

        var navbarHtml =
            '<nav class="navbar">' +
            '<a href="' +
            escapeAttr(basePath + "index.html") +
            '" class="navbar-brand">' +
            '<img src="' +
            escapeAttr(basePath + "images/logo.png") +
            '" alt="" class="navbar-logo" width="44" height="44">' +
            '<span class="navbar-title">Boiler Manuals</span>' +
            "</a>" +
            '<div class="navbar-actions">' +
            '<button class="navbar-toggle" onclick="toggleMenu()" aria-label="Open menu">' +
            '<i class="fas fa-bars"></i>' +
            "</button>" +
            '<ul class="navbar-menu">' +
            menuHtml +
            "</ul>" +
            "</div>" +
            "</nav>";

        document.body.insertAdjacentHTML("afterbegin", navbarHtml);
    }

    window.toggleMenu = function toggleMenu() {
        var menu = document.querySelector(".navbar-menu");
        var icon = document.querySelector(".navbar-toggle i");
        if (!menu || !icon) {
            return;
        }

        menu.classList.toggle("active");

        if (menu.classList.contains("active")) {
            icon.classList.remove("fa-bars");
            icon.classList.add("fa-times");
        } else {
            icon.classList.remove("fa-times");
            icon.classList.add("fa-bars");
        }
    };

    function init() {
        setDocumentTitle();
        renderNavbar();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
