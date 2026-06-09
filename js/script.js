function goBack() {
	window.history.back();
}

function myFunction() {
            var input, filter, ul, li, a, i, txtValue;
            input = document.getElementById('myInput');
            filter = input.value.toUpperCase();
            ul = document.getElementById("myUL");
            li = ul.getElementsByTagName('li');

            for (i = 0; i < li.length; i++) {
                a = li[i].getElementsByTagName("a")[0];
                txtValue = a.textContent || a.innerText;
                if (txtValue.toUpperCase().indexOf(filter) > -1) {
                    li[i].style.display = "";
                } else {
                    li[i].style.display = "none";
                }
            }
        }

function myTableFunction() {
  // Declare variables
  var input, filter, table, tr, td, i, j, txtValue;
  input = document.getElementById("myInput");
  filter = input.value.toUpperCase();
  table = document.getElementById("myTable");
  tr = table.getElementsByTagName("tr");

  // Loop through all table rows, and hide those who don't match the search query
  for (i = 0; i < tr.length; i++) {
    // Get all cells in the current row
    td = tr[i].getElementsByTagName("td");
    let matchFound = false;

    // Check each cell in the row
    for (j = 0; j < td.length; j++) {
      txtValue = td[j].textContent || td[j].innerText;
      if (txtValue.toUpperCase().indexOf(filter) > -1) {
        matchFound = true;
        break; // If match is found, no need to check further cells in this row
      }
    }

    // Show or hide the row based on if a match was found
    if (matchFound) {
      tr[i].style.display = "";
    } else {
      tr[i].style.display = "none";
    }
  }
}

function showBrandPageTitle() {
    var input = document.getElementById('myInput');
    var table = document.getElementById('myTable');
    if (!input || !table || document.getElementById('brandPageTitle')) {
        return;
    }

    var match = document.title.match(/Boiler Manuals\s*-\s*(.+)$/i);
    if (!match) {
        return;
    }

    var heading = document.createElement('h1');
    heading.id = 'brandPageTitle';
    heading.className = 'brand-page__title';
    heading.textContent = match[1].trim();
    input.insertAdjacentElement('afterend', heading);
}

function isGcColumnHeader(label) {
    var normalized = (label || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    if (normalized === 'gc') {
        return true;
    }
    if (/^g\.?\s*c\.?\s*-?\s*no\.?$/.test(normalized)) {
        return true;
    }
    if (/^gc\s+(no|number)\b/.test(normalized)) {
        return true;
    }
    if (/^gc\s+or\s+/.test(normalized)) {
        return true;
    }
    return false;
}

function disableGcNumberTelLinks() {
    var table = document.getElementById('myTable');
    if (!table) {
        return;
    }

    var headerCells = table.querySelectorAll('thead th');
    if (!headerCells.length) {
        headerCells = table.querySelectorAll('thead td');
    }

    var gcColumnIndex = -1;
    Array.prototype.forEach.call(headerCells, function(cell, index) {
        if (gcColumnIndex >= 0) {
            return;
        }
        if (isGcColumnHeader((cell.textContent || '').trim())) {
            gcColumnIndex = index;
        }
    });

    if (gcColumnIndex < 0) {
        return;
    }

    Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function(tr) {
        var cells = tr.querySelectorAll('td');
        var td = cells[gcColumnIndex];
        if (!td || td.querySelector('.gc-no')) {
            return;
        }

        var telLink = td.querySelector('a[href^="tel:"]');
        var text = telLink
            ? (telLink.textContent || '').replace(/\s+/g, ' ').trim()
            : (td.textContent || '').replace(/\s+/g, ' ').trim();

        if (!text) {
            return;
        }

        var span = document.createElement('span');
        span.className = 'gc-no';
        span.setAttribute('x-apple-data-detectors', 'false');
        span.textContent = text;
        td.textContent = '';
        td.appendChild(span);
    });
}

function enhanceTablesForMobile() {
    var table = document.getElementById('myTable');
    if (!table || table.dataset.mobileReady === 'true') {
        return;
    }

    if (!table.parentElement.classList.contains('table-responsive')) {
        var wrapper = document.createElement('div');
        wrapper.className = 'table-responsive';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    }

    var headerCells = table.querySelectorAll('thead th');
    if (!headerCells.length) {
        headerCells = table.querySelectorAll('thead td');
    }

    var headers = Array.prototype.map.call(headerCells, function(cell) {
        return (cell.textContent || '').trim();
    });

    Array.prototype.forEach.call(table.querySelectorAll('tbody tr'), function(tr) {
        Array.prototype.forEach.call(tr.querySelectorAll('td'), function(td, index) {
            var label = headers[index] || '';
            var text = (td.textContent || '').replace(/\s+/g, ' ').trim();
            var hasImage = td.querySelector('img');
            var hasLink = td.querySelector('a[href]');

            if (label) {
                td.setAttribute('data-label', label);
            }

            if (!text && !hasImage && !hasLink) {
                td.classList.add('table-cell--empty');
            }
        });
    });

    table.dataset.mobileReady = 'true';
}

document.addEventListener('DOMContentLoaded', function() {
    disableGcNumberTelLinks();
    showBrandPageTitle();
    enhanceTablesForMobile();

    // Legacy hub rewrite — only on pages that still load urlUtils.js (e.g. index)
    if (typeof URLUtils !== 'undefined' && URLUtils.updateDownloadLinks) {
        URLUtils.updateDownloadLinks();
    }
});

document.addEventListener('DOMContentLoaded', setupDownloadModal);

function isPdfDownloadLink(anchor) {
    if (!anchor || anchor.tagName !== 'A') {
        return false;
    }
    return /\.pdf(?:[?#]|$)/i.test(anchor.getAttribute('href') || '');
}

function setupDownloadModal() {
    let modal = document.getElementById('download-modal');
    let redirectTimer = null;
    let autoDismissTimer = null;
    let modalHistoryPushed = false;
    let pendingUrl = null;

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'download-modal';
        modal.className = 'download-modal';
        modal.innerHTML = '<div class="download-modal__dialog"><p>You\'re now being taken to your file</p></div>';
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
    }

    function clearModalTimers() {
        if (redirectTimer) {
            clearTimeout(redirectTimer);
            redirectTimer = null;
        }
        if (autoDismissTimer) {
            clearTimeout(autoDismissTimer);
            autoDismissTimer = null;
        }
    }

    function hideModal(options) {
        options = options || {};
        clearModalTimers();
        pendingUrl = null;
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');

        if (!modalHistoryPushed) {
            return;
        }

        modalHistoryPushed = false;
        if (options.skipHistory) {
            history.replaceState(null, '', window.location.href);
        } else {
            history.back();
        }
    }

    function showModal(url) {
        pendingUrl = url;
        modal.classList.add('is-visible');
        modal.setAttribute('aria-hidden', 'false');

        history.pushState({ downloadModal: true }, '', window.location.href);
        modalHistoryPushed = true;

        redirectTimer = setTimeout(function() {
            redirectTimer = null;
            const target = pendingUrl;
            clearModalTimers();
            pendingUrl = null;
            modal.classList.remove('is-visible');
            modal.setAttribute('aria-hidden', 'true');
            if (modalHistoryPushed) {
                modalHistoryPushed = false;
                history.replaceState(null, '', window.location.href);
            }
            if (target) {
                window.location.href = target;
            }
        }, 1200);

        autoDismissTimer = setTimeout(function() {
            hideModal({ skipHistory: true });
        }, 5000);
    }

    document.addEventListener('click', function(event) {
        const link = event.target.closest('a');
        if (!isPdfDownloadLink(link)) {
            return;
        }

        event.preventDefault();
        showModal(link.href);
    });

    window.addEventListener('popstate', function() {
        if (!modal.classList.contains('is-visible')) {
            return;
        }
        modalHistoryPushed = false;
        clearModalTimers();
        pendingUrl = null;
        modal.classList.remove('is-visible');
        modal.setAttribute('aria-hidden', 'true');
    });
}
