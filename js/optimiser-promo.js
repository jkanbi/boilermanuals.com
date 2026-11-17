/* Slim Boiler Optimiser banner on brand pages. No cookies or third-party requests. */
(function (root) {
    var HREF =
        "https://myboiler.com/boiler-optimiser/?utm_source=boilermanuals&utm_medium=organic&utm_content=org_bm_brandbanner";
    var COPY =
        "Own a condensing combi boiler? Find a starting boiler flow temperature with our free Boiler Optimiser. Savings shown are calculator estimates. ";
    var CTA = "Try it free";

    function isBrandPage() {
        try {
            return /\/brands\/[^/]+\.html$/i.test(window.location.pathname || "");
        } catch (e) {
            return false;
        }
    }

    function buildBanner() {
        var banner = document.createElement("aside");
        banner.className = "bm-opt-brand";
        banner.setAttribute("role", "note");
        banner.setAttribute("aria-label", "Boiler Optimiser");

        var text = document.createElement("p");
        text.className = "bm-opt-brand__text";
        text.appendChild(document.createTextNode(COPY));

        var link = document.createElement("a");
        link.className = "bm-opt-promo__link";
        link.href = HREF;
        link.rel = "noopener";
        link.textContent = CTA;
        text.appendChild(link);

        banner.appendChild(text);
        return banner;
    }

    function placeBanner(banner) {
        var input = document.getElementById("myInput");
        if (input && input.parentNode) {
            input.parentNode.insertBefore(banner, input);
            return true;
        }
        var table = document.getElementById("myTable");
        if (table && table.parentNode) {
            table.parentNode.insertBefore(banner, table);
            return true;
        }
        return false;
    }

    function render() {
        if (!document.body || !isBrandPage() || document.querySelector(".bm-opt-brand")) {
            return;
        }
        placeBanner(buildBanner());
    }

    root.BMOptimiserPromo = {
        href: HREF,
        render: render
    };

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", render);
        } else {
            render();
        }
    }
})(typeof window !== "undefined" ? window : globalThis);
