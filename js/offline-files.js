/*
 * List of manuals kept in this browser by Keep for offline.
 */
(function () {
    var listEl = document.getElementById("offlineList");
    var emptyEl = document.getElementById("offlineEmpty");
    var statusEl = document.getElementById("offlineStatus");
    var off = window.BMOfflinePdf;

    function formatSavedAt(ts) {
        if (!ts) {
            return "Saved in this browser";
        }
        var d = new Date(ts);
        if (isNaN(d.getTime())) {
            return "Saved in this browser";
        }
        return "Saved " + d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    }

    function viewerHref(url) {
        return "/viewer.html?file=" + encodeURIComponent(url);
    }

    function setEmpty(visible) {
        if (emptyEl) {
            emptyEl.hidden = !visible;
        }
        if (listEl) {
            listEl.hidden = visible;
        }
    }

    function clearLoading() {
        if (statusEl) {
            statusEl.hidden = true;
            statusEl.textContent = "";
        }
    }

    function render(items) {
        if (!listEl) {
            return;
        }
        clearLoading();
        listEl.innerHTML = "";
        if (!items || !items.length) {
            setEmpty(true);
            return;
        }
        setEmpty(false);
        items.forEach(function (item) {
            var li = document.createElement("li");
            var link = document.createElement("a");
            link.href = viewerHref(item.url);
            link.textContent = item.name || "Manual";
            var when = document.createElement("span");
            when.className = "offline-list__when";
            when.textContent = formatSavedAt(item.savedAt);
            li.appendChild(link);
            li.appendChild(when);
            listEl.appendChild(li);
        });
    }

    function showUnsupported() {
        clearLoading();
        if (statusEl) {
            statusEl.hidden = false;
            statusEl.textContent = "This browser can\u2019t keep manuals for offline viewing.";
        }
        setEmpty(true);
    }

    if (!off || !off.isSupported()) {
        showUnsupported();
        return;
    }

    off.registerWorker();
    if (off.precacheShell) {
        off.precacheShell();
    }

    off.listKeptPdfs().then(function (items) {
        render(items);
    }).catch(function () {
        render([]);
    });
})();
