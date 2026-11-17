#!/usr/bin/env node
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");

var root = path.join(__dirname, "..");

var HOME_COPY =
    "Got a condensing combi boiler? Our free Boiler Optimiser suggests a starting boiler flow temperature for your model in about a minute.";
var HOME_CTA = "Try the Boiler Optimiser";
var HOME_HREF =
    "https://myboiler.com/boiler-optimiser/?utm_source=boilermanuals&utm_medium=organic&utm_content=org_bm_home";
var BRAND_COPY =
    "Own a condensing combi boiler? Find a starting boiler flow temperature with our free Boiler Optimiser. Savings shown are calculator estimates.";
var BRAND_CTA = "Try it free";
var BRAND_HREF =
    "https://myboiler.com/boiler-optimiser/?utm_source=boilermanuals&utm_medium=organic&utm_content=org_bm_brandbanner";

function read(rel) {
    return fs.readFileSync(path.join(root, rel), "utf8");
}

var indexHtml = read("index.html");
assert.ok(indexHtml.indexOf(HOME_COPY) !== -1, "homepage should include exact optimiser copy");
assert.ok(indexHtml.indexOf(HOME_CTA) !== -1, "homepage should include exact CTA");
assert.ok(indexHtml.indexOf(HOME_HREF.replace(/&/g, "&amp;")) !== -1, "homepage should include exact optimiser URL");
assert.ok(/class="bm-opt-home"/.test(indexHtml), "homepage line should use bm-opt-home");
assert.ok(
    /home-search[\s\S]*bm-opt-home[\s\S]*home-content/.test(indexHtml),
    "homepage line should sit below search and above the rest of the page"
);
assert.ok(!/Emergency Hero|BOXT|gtag\(|googletagmanager|facebook\.net|hotjar/i.test(indexHtml));

var promoSrc = read("js/optimiser-promo.js");
assert.ok(promoSrc.indexOf(BRAND_COPY) !== -1, "brand banner JS should include exact copy");
assert.ok(promoSrc.indexOf(BRAND_CTA) !== -1, "brand banner JS should include exact CTA");
assert.ok(promoSrc.indexOf(BRAND_HREF) !== -1, "brand banner JS should include exact URL");
assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(promoSrc), "brand banner must not set cookies or storage");
assert.ok(!/Emergency Hero|BOXT|gtag\(|googletagmanager/i.test(promoSrc));

var bannedBareCombi = /(^|[^a-z])combi boiler(?!s)/i;
function assertNoBareCombi(label, text) {
    var stripped = text.replace(/condensing combi boiler/gi, "");
    assert.ok(!bannedBareCombi.test(stripped), label + " should not say just combi boiler");
}
assertNoBareCombi("homepage copy", HOME_COPY);
assertNoBareCombi("brand copy", BRAND_COPY);
assert.ok(HOME_COPY.indexOf("\u2014") === -1 && BRAND_COPY.indexOf("\u2014") === -1, "copy must not use em dashes");

var worcester = read("brands/worcester-bosch.html");
assert.ok(
    worcester.indexOf(
        'class="opt-lk" href="https://myboiler.com/boiler-optimiser/?utm_source=boilermanuals&amp;utm_medium=manual-page&amp;utm_campaign=optimiser&amp;utm_content=worcester-bosch-47-800-26"'
    ) !== -1,
    "existing Worcester Optimise row links must stay unchanged"
);

function makeEl(tag, attrs) {
    attrs = attrs || {};
    var el = {
        tagName: String(tag).toUpperCase(),
        className: attrs.className || "",
        id: attrs.id || "",
        href: attrs.href || "",
        rel: "",
        textContent: attrs.textContent || "",
        parentNode: null,
        children: [],
        _attrs: {},
        _listeners: {},
        setAttribute: function (name, value) {
            this._attrs[name] = String(value);
            if (name === "href") {
                this.href = String(value);
            }
            if (name === "class") {
                this.className = String(value);
            }
            if (name === "id") {
                this.id = String(value);
            }
        },
        getAttribute: function (name) {
            if (name === "href") {
                return this.href;
            }
            if (name === "class") {
                return this.className;
            }
            return this._attrs[name] || "";
        },
        appendChild: function (child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        },
        insertBefore: function (node, ref) {
            node.parentNode = this;
            var idx = this.children.indexOf(ref);
            if (idx < 0) {
                this.children.push(node);
            } else {
                this.children.splice(idx, 0, node);
            }
            return node;
        },
        querySelector: function (sel) {
            return queryOne(this, sel);
        },
        querySelectorAll: function (sel) {
            return queryAll(this, sel);
        },
        closest: function (sel) {
            var node = this;
            while (node) {
                if (matches(node, sel)) {
                    return node;
                }
                node = node.parentNode;
            }
            return null;
        },
        addEventListener: function (type, fn) {
            this._listeners[type] = this._listeners[type] || [];
            this._listeners[type].push(fn);
        }
    };
    if (attrs.href) {
        el._attrs.href = attrs.href;
    }
    return el;
}

function matches(el, sel) {
    if (!el || !el.tagName) {
        return false;
    }
    if (sel.charAt(0) === ".") {
        return (" " + (el.className || "") + " ").indexOf(" " + sel.slice(1) + " ") !== -1;
    }
    if (sel.charAt(0) === "#") {
        return el.id === sel.slice(1);
    }
    if (sel.indexOf("[href*=\"boiler-optimiser\"]") !== -1 || sel.indexOf("[href*='boiler-optimiser']") !== -1) {
        return (el.tagName === "A" || el.tagName === "a") && String(el.href || "").indexOf("boiler-optimiser") !== -1;
    }
    if (sel === "a") {
        return el.tagName === "A";
    }
    if (sel === "tr") {
        return el.tagName === "TR";
    }
    return el.tagName.toLowerCase() === sel.toLowerCase();
}

function walk(node, out) {
    out.push(node);
    (node.children || []).forEach(function (child) {
        walk(child, out);
    });
}

function queryAll(rootEl, sel) {
    var found = [];
    (rootEl.children || []).forEach(function (child) {
        var nodes = [];
        walk(child, nodes);
        nodes.forEach(function (node) {
            if (matches(node, sel)) {
                found.push(node);
            }
        });
    });
    return found;
}

function queryOne(rootEl, sel) {
    if (sel.charAt(0) === "#") {
        var all = [];
        walk(rootEl, all);
        for (var i = 0; i < all.length; i++) {
            if (all[i].id === sel.slice(1)) {
                return all[i];
            }
        }
        return null;
    }
    var list = queryAll(rootEl, sel);
    return list[0] || null;
}

function loadScript(rel, windowObj) {
    var ctx = {
        window: windowObj,
        document: windowObj.document,
        globalThis: windowObj,
        URL: URL
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), ctx);
    return ctx;
}

function makeDocument(pathname, withBrand) {
    var body = makeEl("body");
    var head = makeEl("head");
    var docEl = makeEl("html");
    var title = makeEl("h1", { id: "brandPageTitle" });
    var input = makeEl("input", { id: "myInput" });
    var table = makeEl("table", { id: "myTable" });
    var row = makeEl("tr");
    var opt = makeEl("a", {
        className: "opt-lk",
        href: "https://myboiler.com/boiler-optimiser/?utm_source=boilermanuals&utm_medium=manual-page&utm_campaign=optimiser&utm_content=worcester-bosch-47-800-26"
    });
    opt.textContent = "Optimise →";
    row.appendChild(opt);
    table.appendChild(row);
    if (withBrand) {
        body.appendChild(title);
        body.appendChild(input);
        body.appendChild(table);
    }
    docEl.appendChild(head);
    docEl.appendChild(body);

    var listeners = {};
    var document = {
        body: body,
        head: head,
        documentElement: docEl,
        readyState: "complete",
        getElementById: function (id) {
            return queryOne(docEl, "#" + id);
        },
        querySelector: function (sel) {
            return queryOne(docEl, sel);
        },
        querySelectorAll: function (sel) {
            return queryAll(docEl, sel);
        },
        createElement: function (tag) {
            return makeEl(tag);
        },
        createTextNode: function (text) {
            return { nodeType: 3, textContent: text, parentNode: null };
        },
        addEventListener: function (type, fn) {
            listeners[type] = listeners[type] || [];
            listeners[type].push(fn);
        }
    };
    body.ownerDocument = document;
    return {
        window: {
            location: { pathname: pathname },
            document: document
        },
        document: document,
        body: body,
        input: input,
        table: table,
        opt: opt
    };
}

var brandPage = makeDocument("/brands/worcester-bosch.html", true);
loadScript("js/optimiser-promo.js", brandPage.window);
var banner = brandPage.document.querySelector(".bm-opt-brand");
assert.ok(banner, "brand page should get a slim optimiser banner");
assert.strictEqual(brandPage.body.children[0].id, "brandPageTitle");
assert.strictEqual(brandPage.body.children[1].className, "bm-opt-brand");
assert.strictEqual(brandPage.body.children[2].id, "myInput");
assert.strictEqual(brandPage.body.children[3].id, "myTable");
var bannerText = banner.children[0];
assert.ok(bannerText, "banner should contain a paragraph");
assert.ok(
    (bannerText.children || []).some(function (child) {
        return child.className === "bm-opt-promo__link" && child.textContent === BRAND_CTA && child.href === BRAND_HREF;
    }),
    "banner CTA and URL should be exact"
);
assert.ok(
    (bannerText.children || []).some(function (child) {
        return child.nodeType === 3 && String(child.textContent).indexOf(BRAND_COPY) === 0;
    }) || String(bannerText.textContent || "").indexOf(BRAND_COPY) !== -1,
    "banner sentence should be exact"
);

var homePage = makeDocument("/", false);
loadScript("js/optimiser-promo.js", homePage.window);
assert.strictEqual(homePage.document.querySelector(".bm-opt-brand"), null, "homepage must not get the brand banner");

var enhancePage = makeDocument("/brands/worcester-bosch.html", true);
loadScript("js/optimiser-promo.js", enhancePage.window);
loadScript("js/optimiser-url.js", enhancePage.window);
enhancePage.window.BMOptimiserUrl.enhance();
var promoLink = enhancePage.document.querySelector(".bm-opt-promo__link");
assert.ok(promoLink);
assert.strictEqual(promoLink.href, BRAND_HREF, "promo URL must not be rewritten");
assert.ok(
    enhancePage.opt.href.indexOf("utm_medium=manual-page") !== -1,
    "row Optimise links must still be enhanced as before"
);
assert.ok(enhancePage.opt.href.indexOf("brand=worcester") !== -1 || enhancePage.opt.href.indexOf("system=") !== -1);

console.log("test-optimiser-promo: ok");
