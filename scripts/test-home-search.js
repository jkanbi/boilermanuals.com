#!/usr/bin/env node
"use strict";

var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");

var root = path.join(__dirname, "..");
var src = fs.readFileSync(path.join(root, "js", "home-search.js"), "utf8");
var index = JSON.parse(fs.readFileSync(path.join(root, "js", "boiler-search-index.json"), "utf8"));

var ctx = {
    window: {},
    document: {
        addEventListener: function () {},
        getElementsByTagName: function () {
            return [];
        },
        getElementById: function () {
            return null;
        },
        querySelector: function () {
            return null;
        }
    },
    console: console
};
vm.createContext(ctx);
vm.runInContext(src, ctx);

var searchApi = ctx.window.BMHomeSearch;
assert.ok(searchApi, "BMHomeSearch should load");
assert.strictEqual(searchApi.maxResults, 40);

function search(query, options) {
    return searchApi.searchEntries(index, query, options || {});
}

function rankedGc(result, gc) {
    for (var i = 0; i < result.results.length; i++) {
        if (result.results[i].gc === gc) {
            return i;
        }
    }
    return -1;
}

function models(result, limit) {
    return result.results.slice(0, limit || result.results.length).map(function (entry) {
        return (entry.gc || "-") + " | " + entry.brand + " | " + entry.model;
    });
}

function assertIncludesGc(query, gc, extra) {
    var result = search(query, extra || {});
    assert.ok(
        rankedGc(result, gc) !== -1,
        "expected " + JSON.stringify(query) + " to include GC " + gc + " in top results, got:\n" + models(result, 12).join("\n")
    );
    return result;
}

function assertNone(query) {
    var result = search(query);
    assert.strictEqual(
        result.totalMatches,
        0,
        "expected no matches for " + JSON.stringify(query) + ", got " + result.totalMatches + ":\n" + models(result, 8).join("\n")
    );
    return result;
}

function assertTopGc(query, gc) {
    var result = search(query);
    assert.strictEqual(
        result.results[0] && result.results[0].gc,
        gc,
        "expected " + JSON.stringify(query) + " to rank GC " + gc + " first, got:\n" + models(result, 8).join("\n")
    );
    return result;
}

function assertAllBrands(query, brands, extra) {
    var result = search(query, extra || {});
    result.results.forEach(function (entry) {
        assert.ok(
            brands.indexOf(entry.brand) !== -1,
            "unexpected brand " + entry.brand + " for " + JSON.stringify(query)
        );
    });
    return result;
}

// --- Ideal Logic H24: omitted "Heat" ---
var logicH24 = assertIncludesGc("ideal logic h24", "41-750-80");
assertIncludesGc("logic h24", "41-750-80");
assertIncludesGc("IDEAL LOGIC H24", "41-750-80");
assertIncludesGc("h24 logic ideal", "41-750-80");

var heatH24 = assertIncludesGc("logic heat h24", "41-750-80");
assert.ok(
    rankedGc(heatH24, "41-750-80") <= 1,
    "logic heat h24 should rank the exact LOGIC HEAT H24 model at the top:\n" + models(heatH24, 8).join("\n")
);
assert.ok(
    rankedGc(heatH24, "41-750-80") < rankedGc(heatH24, "41-750-95") || rankedGc(heatH24, "41-750-95") === -1,
    "exact LOGIC HEAT H24 should rank ahead of H24IE"
);

assertIncludesGc("logic heat 24", "41-409-95");
assert.ok(
    rankedGc(search("logic heat 24"), "41-409-95") <= 1,
    "older Logic Heat 24 should remain findable near the top"
);

assertTopGc("41-750-80", "41-750-80");
assertTopGc("4175080", "41-750-80");
assertIncludesGc("41 750 80", "41-750-80");

assertNone("ideal zzz h24");
assertNone("logic qqq h24");

var plusQuery = search("logic+");
assert.ok(plusQuery.totalMatches > 0, "logic+ should return results");
assert.ok(
    plusQuery.results.some(function (entry) {
        return /\+/.test(entry.model);
    }),
    "logic+ should include LOGIC+ / Logic+ models:\n" + models(plusQuery, 8).join("\n")
);
assertIncludesGc("logic+ h24", "41-860-23");
assertIncludesGc("logic + heat2 h24", "41-860-23");

var h24Results = search("ideal logic h24");
assert.ok(
    rankedGc(h24Results, "41-750-80") !== -1,
    "combined H24 / H24P catalogue row should remain selectable"
);
var firstH24POnly = -1;
h24Results.results.forEach(function (entry, i) {
    var stripped = entry.model.replace(/h24p/ig, "");
    if (/h24p/i.test(entry.model) && !/h24/i.test(stripped) && firstH24POnly === -1) {
        firstH24POnly = i;
    }
});
assert.ok(
    firstH24POnly === -1 || firstH24POnly > rankedGc(h24Results, "41-750-80"),
    "distinct H24P-only rows should rank below the H24 option when both exist"
);

var brandFiltered = search("logic h24", { brandFilter: ["vaillant"] });
assert.strictEqual(brandFiltered.totalMatches, 0, "brand filter should exclude Ideal from a Vaillant-only search");
assert.ok(
    search("logic h24", { brandFilter: ["ideal"] }).results.every(function (entry) {
        return entry.brand.toLowerCase() === "ideal";
    }),
    "Ideal brand filter should only return Ideal rows"
);

var controlsFilter = [
    "danfoss",
    "drayton",
    "esi",
    "google nest",
    "heatmiser",
    "hive",
    "honeywell",
    "salus",
    "tado"
];
var controlsIdeal = search("ideal logic h24", { brandFilter: controlsFilter });
assert.strictEqual(controlsIdeal.totalMatches, 0, "controls brand filter should exclude boilers");
var hiveHits = search("hive thermostat", { brandFilter: controlsFilter });
assert.ok(hiveHits.totalMatches > 0, "controls search should still find Hive");
assertAllBrands("hive thermostat", ["Hive", "Honeywell", "Drayton", "Danfoss", "ESi", "Google Nest", "Heatmiser", "Salus", "Tado"], {
    brandFilter: controlsFilter
});

var cap = search("ideal");
assert.ok(cap.totalMatches > searchApi.maxResults, "broad brand search should exceed the result cap");
assert.strictEqual(cap.results.length, searchApi.maxResults, "result cap should remain 40");

// --- Vaillant ecoTEC, omitted plus / hyphen / camelCase ---
assertIncludesGc("vaillant 624", "41-044-47");
assertIncludesGc("vaillant eco tec 624", "41-044-47");
assertIncludesGc("ecoTEC plus 624", "41-044-47");
assertIncludesGc("vaillant ecotec 624", "41-044-47");
assertIncludesGc("624 eco tec vaillant", "41-044-47");
assertIncludesGc("vaillant eco-tec plus 624", "41-044-47");
assertIncludesGc("47-044-88", "47-044-88");
assertIncludesGc("4704488", "47-044-88");

// --- Worcester Bosch Greenstar ---
assertIncludesGc("worcester greenstar 30i", "47-406-62");
assertIncludesGc("greenstar 30 i", "47-406-62");
assertIncludesGc("WORCESTER GREENSTAR 30I", "47-406-62");
assertIncludesGc("greenstar 24i", "47-311-87");
assertIncludesGc("47-406-62", "47-406-62");
assertIncludesGc("4740662", "47-406-62");
var greenstar30 = search("worcester greenstar 30");
assert.ok(greenstar30.totalMatches > 0, "worcester greenstar 30 should find 30-series models");
assert.ok(
    !/8000/.test(greenstar30.results[0].model),
    "greenstar 30 should rank a 30-size model ahead of Greenstar 8000 rows with a 30 token"
);
assert.ok(
    greenstar30.results.some(function (entry) {
        return /greenstar/i.test(entry.model) && /(^|[^0-9])30([^0-9]|$)|30i|30cdi|30 cdi/i.test(entry.model);
    }),
    "greenstar 30 should keep 30-size models in the capped results:\n" + models(greenstar30, 8).join("\n")
);

// --- Baxi Duo-tec punctuation / omitted Combi ---
assertIncludesGc("baxi duo tec 24", "47-075-23");
assertIncludesGc("baxi duo-tec 24", "47-075-23");
assertIncludesGc("baxi duotec 24", "47-075-23");
assertIncludesGc("duo tec combi 24", "47-075-23");
assertIncludesGc("47-075-23", "47-075-23");
assertIncludesGc("4707523", "47-075-23");

// --- Glow-worm Energy / Ultimate ---
assertIncludesGc("glow-worm energy 30c", "44-019-25");
assertIncludesGc("glow worm energy 30c-a", "44-019-25");
assertIncludesGc("glowworm energy 30c", "44-019-25");
assertIncludesGc("44-019-25", "44-019-25");
assertIncludesGc("glow-worm ultimate 30c", "47-019-20");

// --- Viessmann Vitodens hyphen / omitted Type ---
assertIncludesGc("viessmann vitodens 100w", "41-819-40");
assertIncludesGc("vitodens 100-w b1hc", "41-819-40");
assertIncludesGc("viessmann 100-w 19kw", "41-819-40");
assertIncludesGc("41-819-40", "41-819-40");
assertIncludesGc("4181940", "41-819-40");

// --- Potterton / Intergas omitted intervening words ---
assertIncludesGc("potterton promax 24", "47-393-47");
assertIncludesGc("promax combi 24", "47-393-47");
assertIncludesGc("intergas xtreme 24", "47-291-10");
assertIncludesGc("xtreme 24 intergas", "47-291-10");

// --- Numeric token boundaries ---
var twentyFour = search("alpha 24");
assert.ok(twentyFour.totalMatches > 0, "alpha 24 should match 24-size Alpha models");
twentyFour.results.forEach(function (entry) {
    assert.ok(
        !/(^|[^0-9])240([^0-9]|$)/.test(entry.model),
        "alpha 24 should not match 240-size models: " + entry.model
    );
});

var alpha240 = search("alpha 240");
assert.ok(
    alpha240.results.some(function (entry) {
        return /240/.test(entry.model);
    }),
    "alpha 240 should still find 240 models"
);
assert.ok(
    rankedGc(alpha240, "47-532-05") !== -1 || alpha240.results.some(function (entry) {
        return /240/.test(entry.model);
    }),
    "alpha 240 should include Alpha 240 eco or similar"
);

var exactH24 = search("logic heat h24");
var firstH24 = exactH24.results[0];
assert.ok(firstH24, "logic heat h24 should return a result");
assert.ok(
    /h24/i.test(firstH24.model),
    "top logic heat h24 hit should be an H24 model: " + firstH24.model
);
assert.ok(
    !/h24p/i.test(firstH24.model.replace(/h24 \/.*h24p/i, "h24")) || /h24 \//i.test(firstH24.model),
    "exact H24 should rank ahead of a distinct H24P-only row"
);

// --- Shared uses still work for a representative brand-only query ---
assert.ok(search("vaillant").totalMatches > 0);
assert.ok(search("worcester").totalMatches > 0);
assert.ok(search("baxi").totalMatches > 0);

console.log("home-search tests passed");
console.log("ideal logic h24 top hits:");
console.log(models(logicH24, 8).join("\n"));
console.log("logic heat h24 top hits:");
console.log(models(heatH24, 6).join("\n"));
