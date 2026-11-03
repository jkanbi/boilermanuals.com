/* Shared Boiler Optimiser URL helper. Rewrites existing links; no cookies. */
(function (root) {
    var ALLOWED_BRANDS = {
        worcester: true,
        vaillant: true,
        baxi: true,
        ideal: true,
        viessmann: true,
        "glow-worm": true,
        potterton: true,
        main: true,
        alpha: true,
        intergas: true,
        ariston: true,
        vokera: true,
        ferroli: true,
        grant: true,
        "british-gas": true
    };
    var BRAND_ALIASES = {
        "worcester-bosch": "worcester",
        glowworm: "glow-worm"
    };
    var TYPE_TO_SYSTEM = {
        CCB: "combi",
        CB: "system"
    };

    function mapBrand(raw) {
        if (!raw) {
            return "";
        }
        var slug = String(raw).toLowerCase().replace(/_/g, "-").replace(/^\s+|\s+$/g, "");
        if (BRAND_ALIASES[slug]) {
            slug = BRAND_ALIASES[slug];
        }
        return ALLOWED_BRANDS[slug] ? slug : "";
    }

    function mapSystem(typeCode) {
        if (!typeCode) {
            return "";
        }
        return TYPE_TO_SYSTEM[String(typeCode).toUpperCase().replace(/^\s+|\s+$/g, "")] || "";
    }

    function build(baseHref, opts) {
        opts = opts || {};
        var url;
        try {
            url = new URL(baseHref, "https://myboiler.com");
        } catch (e) {
            return baseHref;
        }
        if (url.pathname.indexOf("/boiler-optimiser") === -1) {
            return baseHref;
        }
        var system = opts.system || mapSystem(opts.type);
        if (system) {
            url.searchParams.set("system", system);
        }
        var brand = mapBrand(opts.brand);
        if (brand) {
            url.searchParams.set("brand", brand);
        }
        return url.toString();
    }

    function pageBrand() {
        var path = "";
        try {
            path = window.location.pathname || "";
        } catch (e) {
            return "";
        }
        var match = /\/brands\/([^/]+)\.html$/i.exec(path);
        return match ? match[1] : "";
    }

    function rowType(row) {
        if (!row) {
            return "";
        }
        var badge = row.querySelector(".cbg");
        return badge ? String(badge.textContent || "").replace(/^\s+|\s+$/g, "") : "";
    }

    function enhanceLink(anchor, brandSlug) {
        var href = anchor.getAttribute("href") || "";
        if (href.indexOf("boiler-optimiser") === -1) {
            return;
        }
        var type = "";
        var row = anchor.closest ? anchor.closest("tr") : null;
        if (row) {
            type = rowType(row);
        } else if (
            (anchor.className || "").indexOf("opt-btn") !== -1 ||
            (anchor.className || "").indexOf("bm-winter-alert__link") !== -1
        ) {
            type = "CCB";
        }
        anchor.href = build(href, { type: type, brand: brandSlug });
    }

    function addMissingRowLinks(brandSlug) {
        var rows = document.querySelectorAll("#myTable tbody tr");
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var wrap = row.querySelector("td.bm-type .opt-x");
            if (!wrap || wrap.querySelector("a.opt-lk")) {
                continue;
            }
            var type = rowType(row);
            if (type !== "CCB" && type !== "CB") {
                continue;
            }
            var gcCell = row.querySelector("td");
            var gc = gcCell ? String(gcCell.textContent || "").replace(/\s+/g, "") : "";
            var content = brandSlug && gc ? brandSlug + "-" + gc : brandSlug || gc;
            var base =
                "https://myboiler.com/boiler-optimiser/?utm_source=boilermanuals&utm_medium=manual-page&utm_campaign=optimiser";
            if (content) {
                base += "&utm_content=" + encodeURIComponent(content);
            }
            var link = document.createElement("a");
            link.className = "opt-lk";
            link.rel = "noopener";
            link.title =
                type === "CCB"
                    ? "Open the free Boiler Optimiser for this combi"
                    : "Open the free Boiler Optimiser for this boiler";
            link.href = build(base, { type: type, brand: brandSlug });
            link.innerHTML = "Optimise&nbsp;&rarr;";
            wrap.appendChild(link);
        }
    }

    function enhance() {
        if (!document.body) {
            return;
        }
        var brandSlug = pageBrand();
        var links = document.querySelectorAll('a[href*="boiler-optimiser"]');
        for (var i = 0; i < links.length; i++) {
            enhanceLink(links[i], brandSlug);
        }
        addMissingRowLinks(brandSlug);
    }

    root.BMOptimiserUrl = {
        mapBrand: mapBrand,
        mapSystem: mapSystem,
        build: build,
        enhance: enhance
    };

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", enhance);
        } else {
            enhance();
        }
    }
})(typeof window !== "undefined" ? window : globalThis);
