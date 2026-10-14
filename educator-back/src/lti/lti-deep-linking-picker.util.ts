function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LOADER_STYLES = `
    .loader-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 12rem; gap: 1rem; color: #555; }
    .loader-spinner {
      width: 2.5rem; height: 2.5rem;
      border: 3px solid #e0e0e0;
      border-top-color: #1976d2;
      border-radius: 50%;
      animation: rw-spin 0.75s linear infinite;
    }
    @keyframes rw-spin { to { transform: rotate(360deg); } }
    .loader-text { margin: 0; font-size: 0.95rem; }
`;

function loaderHtml(message: string): string {
  return (
    '<div class="loader-wrap">' +
    '<div class="loader-spinner" role="status" aria-label="Loading"></div>' +
    `<p class="loader-text">${escapeHtml(message)}</p>` +
    '</div>'
  );
}

/**
 * ngrok free tier shows a browser interstitial that breaks LMS iframes.
 * Re-fetch the target with ngrok-skip-browser-warning (works from same-origin JS).
 */
export function generateNgrokSafeHtmlFetchPage(targetUrl: string): string {
  const safeUrl = escapeHtml(targetUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Loading...</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; text-align: center; color: #444; }
    .error { color: #b00020; }
    ${LOADER_STYLES}
  </style>
</head>
<body>
  <div id="status">${loaderHtml('Loading content picker...')}</div>
  <script>
    (function () {
      var url = '${safeUrl}';
      fetch(url, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
        credentials: 'same-origin'
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(function (html) {
          document.open();
          document.write(html);
          document.close();
        })
        .catch(function () {
          document.getElementById('status').innerHTML =
            '<span class="error">Failed to load picker. Check that the backend is running and API_BASE_URL is set.</span>';
        });
    })();
  </script>
</body>
</html>`;
}

/** Self-contained Deep Linking picker for LMS iframes (same origin as LTI API). */
export function generateDeepLinkingPickerHtml(apiBase: string, code: string): string {
  const safeApiBase = escapeHtml(apiBase.replace(/\/$/, ''));
  const safeCode = escapeHtml(code);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RealityWorks Simulations</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1.5rem; background: #fafafa; color: #222; }
    h2 { margin: 0 0 0.5rem; font-size: 1.25rem; }
    .muted { color: #666; margin-bottom: 1rem; }
    .error { color: #b00020; }
    .empty-state { padding: 1rem 1.25rem; border-radius: 8px; background: #fff8e1; border: 1px solid #ffe082; color: #5d4037; line-height: 1.5; margin-bottom: 1rem; }
    .empty-state strong { display: block; margin-bottom: 0.35rem; color: #3e2723; }
    .search { width: 100%; box-sizing: border-box; padding: 0.625rem 0.75rem; margin-bottom: 1rem; border: 1px solid #ccc; border-radius: 4px; font: inherit; }
    .sim { display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.875rem 1rem; border: 2px solid #e0e0e0; border-radius: 8px; background: #fff; cursor: pointer; margin-bottom: 0.75rem; }
    .sim.selected { border-color: #1976d2; background: #f0f8ff; }
    .sim input { margin-top: 0.2rem; }
    .sim-title { font-weight: 600; }
    .meta { display: flex; flex-wrap: wrap; gap: 0.25rem 1.25rem; margin: 0.375rem 0 0; font-size: 0.875rem; color: #555; }
    .meta div { display: flex; gap: 0.25rem; }
    .meta dt { font-weight: 600; }
    .meta dt::after { content: ':'; }
    .meta dd { margin: 0; }
    button { padding: 0.75rem 1.5rem; border: none; border-radius: 4px; background: #1976d2; color: #fff; font-weight: 600; cursor: pointer; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    ${LOADER_STYLES}
  </style>
</head>
<body>
  <div id="app">${loaderHtml('Loading content picker...')}</div>
  <script>
    (function () {
      var API_BASE = '${safeApiBase}';
      var CODE = '${safeCode}';
      var HEADERS = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };

      function api(path, options) {
        return fetch(API_BASE + path, Object.assign({ headers: HEADERS, credentials: 'same-origin' }, options || {}));
      }

      function renderError(message) {
        document.getElementById('app').innerHTML = '<p class="error">' + message + '</p>';
      }

      function emptyStateMessage(status) {
        if (status === 'course_not_linked') {
          return '<div class="empty-state">' +
            '<strong>Course not linked yet</strong>' +
            'Open the <strong>RealityWorks educator setup</strong> activity in this LMS course first to sync the class and roster. ' +
            'Then assign simulations in RealityWorks and return here to add simulation activities.' +
            '</div>';
        }
        if (status === 'no_simulations_assigned') {
          return '<div class="empty-state">' +
            '<strong>No simulations assigned yet</strong>' +
            'This course is linked, but no simulations are assigned to the class in RealityWorks yet. ' +
            'Assign simulations in the educator app, then reopen this picker.' +
            '</div>';
        }
        return '<p>No simulations available.</p>';
      }

      function esc(value) {
        return String(value).replace(/[&<>"']/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }

      var META_FIELDS = [
        ['estimatedDuration', 'Duration'],
        ['difficulty', 'Difficulty'],
        ['learnerLevel', 'Intended audience'],
        ['purpose', 'Simulation context']
      ];

      function metaHtml(sim) {
        var html = '';
        META_FIELDS.forEach(function (field) {
          var value = sim[field[0]];
          if (value) html += '<div><dt>' + field[1] + '</dt><dd>' + esc(value) + '</dd></div>';
        });
        return html ? '<dl class="meta">' + html + '</dl>' : '';
      }

      function renderPicker(context, simulations, status) {
        var acceptMultiple = !!(context.deepLinkingSettings && context.deepLinkingSettings.accept_multiple);
        var selected = new Set();
        var query = '';
        var app = document.getElementById('app');
        var title = context.courseTitle || 'your course';

        var html = '<h2>Select Simulations for ' + esc(title) + '</h2>';
        html += '<p class="muted">' + (acceptMultiple ? 'Select one or more simulations.' : 'Select one simulation.') + '</p>';
        if (simulations.length) {
          html += '<input id="search" class="search" type="search" placeholder="Search simulations by title" aria-label="Search simulations by title" />';
          html += '<div id="list"></div>';
        } else {
          html += emptyStateMessage(status);
        }
        html += '<div style="margin-top:1rem"><button id="submitBtn" disabled>Add to Course (0)</button></div>';
        app.innerHTML = html;

        var list = document.getElementById('list');
        var search = document.getElementById('search');
        var submitBtn = document.getElementById('submitBtn');
        submitBtn.onclick = submitSelections;

        if (search) {
          search.addEventListener('input', function () {
            query = search.value.trim().toLowerCase();
            draw();
          });
        }

        function toggle(id, checked) {
          if (!acceptMultiple) selected.clear();
          if (checked) selected.add(id); else selected.delete(id);
          draw();
        }

        function draw() {
          if (list) {
            var visible = simulations.filter(function (sim) {
              return !query || String(sim.title).toLowerCase().indexOf(query) !== -1;
            });
            var rows = '';
            visible.forEach(function (sim) {
              var isSelected = selected.has(sim.id);
              rows += '<label class="sim' + (isSelected ? ' selected' : '') + '" data-id="' + esc(sim.id) + '">';
              rows += '<input type="' + (acceptMultiple ? 'checkbox' : 'radio') + '" name="sim"' + (isSelected ? ' checked' : '') + ' />';
              rows += '<span class="sim-body"><span class="sim-title">' + esc(sim.title) + '</span>' + metaHtml(sim) + '</span></label>';
            });
            list.innerHTML = rows || '<p class="muted">No simulations match your search.</p>';

            list.querySelectorAll('input[name="sim"]').forEach(function (input) {
              input.addEventListener('change', function () {
                var id = input.parentElement && input.parentElement.getAttribute('data-id');
                if (id) toggle(id, input.checked);
              });
            });
          }

          submitBtn.disabled = selected.size === 0;
          submitBtn.textContent = 'Add to Course (' + selected.size + ')';
        }

        function submitSelections() {
          var selections = simulations
            .filter(function (sim) { return selected.has(sim.id); })
            .map(function (sim) {
              return { simulationId: sim.id, title: sim.title, scoreMaximum: sim.maxScore || 100 };
            });

          var submitBtn = document.getElementById('submitBtn');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="loader-spinner" style="width:1rem;height:1rem;border-width:2px;display:inline-block;vertical-align:middle;margin-right:0.5rem"></span>Submitting...';
          }

          api('/lti/deep-linking/submit', {
            method: 'POST',
            body: JSON.stringify({ code: CODE, selections: selections })
          })
            .then(function (res) {
              if (!res.ok) throw new Error('submit failed');
              return res.text();
            })
            .then(function (html) {
              document.open();
              document.write(html);
              document.close();
            })
            .catch(function () {
              renderError('Failed to submit selections.');
            });
        }

        draw();
      }

      Promise.all([
        api('/lti/deep-linking/exchange', { method: 'POST', body: JSON.stringify({ code: CODE }) }).then(function (res) {
          if (!res.ok) throw new Error('exchange failed');
          return res.json();
        }),
        api('/lti/deep-linking/simulations?code=' + encodeURIComponent(CODE)).then(function (res) {
          if (!res.ok) throw new Error('simulations failed');
          return res.json();
        })
      ])
        .then(function (results) {
          renderPicker(results[0], results[1].simulations || [], results[1].status || 'ready');
        })
        .catch(function () {
          renderError('Failed to load picker. Check API_BASE_URL and that the class is provisioned.');
        });
    })();
  </script>
</body>
</html>`;
}
