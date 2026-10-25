/* Sitewide winter alert — self-contained; no cookies or third-party requests */
(function () {
    var STORAGE_KEY = "bm_winter_banner_dismissed_2026";
    var HREF =
        "https://myboiler.com/boiler-optimiser/?utm_source=boilermanuals&utm_medium=site_banner&utm_campaign=winter_combi";
    var COPY =
        "❄️ Got a combi boiler? Turning the flow temperature down could cut your gas bill this winter. Try MyBoiler's free Boiler Optimiser →";

    function isDismissed() {
        try {
            if (window.localStorage.getItem(STORAGE_KEY) === "1") {
                return true;
            }
        } catch (e) {}
        try {
            if (window.sessionStorage.getItem(STORAGE_KEY) === "1") {
                return true;
            }
        } catch (e2) {}
        return !!window.__bmWinterBannerDismissed;
    }

    function rememberDismissed() {
        try {
            window.localStorage.setItem(STORAGE_KEY, "1");
            return;
        } catch (e) {}
        try {
            window.sessionStorage.setItem(STORAGE_KEY, "1");
        } catch (e2) {
            window.__bmWinterBannerDismissed = true;
        }
    }

    function buildBanner() {
        var banner = document.createElement("div");
        banner.className = "bm-winter-alert";
        banner.setAttribute("role", "region");
        banner.setAttribute("aria-label", "Winter alert");

        var inner = document.createElement("div");
        inner.className = "bm-winter-alert__inner";

        var link = document.createElement("a");
        link.className = "bm-winter-alert__link";
        link.href = HREF;
        link.textContent = COPY;

        var dismiss = document.createElement("button");
        dismiss.type = "button";
        dismiss.className = "bm-winter-alert__dismiss";
        dismiss.setAttribute("aria-label", "Dismiss winter alert");
        dismiss.textContent = "×";
        dismiss.addEventListener("click", function () {
            rememberDismissed();
            if (banner.parentNode) {
                banner.parentNode.removeChild(banner);
            }
        });

        inner.appendChild(link);
        inner.appendChild(dismiss);
        banner.appendChild(inner);
        return banner;
    }

    function placeBanner(banner) {
        var header = document.querySelector(".site-header");
        if (header && header.parentNode) {
            header.parentNode.insertBefore(banner, header);
            return;
        }
        if (document.body) {
            document.body.insertAdjacentElement("afterbegin", banner);
        }
    }

    function render() {
        if (isDismissed() || document.querySelector(".bm-winter-alert")) {
            return;
        }
        if (!document.body) {
            return;
        }
        placeBanner(buildBanner());
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", render);
    } else {
        render();
    }
})();
