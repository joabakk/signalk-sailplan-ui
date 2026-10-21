/*
 * Turns a failed HTTP call into a message that says what actually went wrong.
 *
 * The status codes mean different things depending on who answered:
 *  - 401 comes from Signal K. It uses 401 both for "no valid login" and for
 *    "logged in, but this route needs a higher access level".
 *  - 403 does not come from Signal K for these routes. It comes from a proxy
 *    in front of it, e.g. signalk-navico-embedder, which answers 403 for a path
 *    that is not on its allowlist (or a client IP that is not whitelisted).
 *  - 404 on a read means there is nothing published at that path: no data,
 *    not a failure.
 *
 * Plain script (no modules, no modern syntax) so it loads in an MFD browser;
 * it also exports itself for the unit tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HttpProblems = factory();
  }
})(this, function () {
  function parseLoginStatus(body) {
    if (!body || typeof body !== 'object') return null;
    return {
      loggedIn: body.status === 'loggedIn',
      level: body.userLevel || null,
      username: body.username || null
    };
  }

  function whoText(login) {
    if (!login) return '';
    if (!login.loggedIn) return 'You are not logged in.';
    var who = login.username ? login.username + ' ' : '';
    return 'Logged in as ' + who + '(' + (login.level || 'unknown level') + ').';
  }

  function unauthorizedText(method, path, login) {
    var text = '401 Signal K refused ' + method + ' ' + path + '. ';
    if (!login) {
      return text + 'Not logged in, or the login has too low an access level for this route (Signal K answers 401 for both).';
    }
    text += whoText(login) + ' ';
    if (!login.loggedIn) return text;
    if (login.level === 'admin') return text + 'Even admin was refused, so the token may be invalid or expired.';
    if (path.indexOf('/plugins/') === 0) {
      return text + 'Signal K only lets a non-admin call a plugin route that the plugin has opened with router.access(); this one is admin-only.';
    }
    return text + 'This route needs more than ' + login.level + ' access.';
  }

  /*
   * info: { method, path, status, login, read, networkError, emptyHint }
   * Returns { kind: 'error' | 'nodata', text }.
   */
  function describe(info) {
    var method = info.method || 'GET';
    var path = info.path;
    var status = info.status;

    if (info.networkError) {
      return {
        kind: 'error',
        text: 'Could not reach ' + path + ' (' + method + '): network error. Signal K, or a proxy in front of it, is not answering.'
      };
    }
    if (status === 401) {
      return { kind: 'error', text: unauthorizedText(method, path, info.login) };
    }
    if (status === 403) {
      return {
        kind: 'error',
        text: '403 Blocked before reaching Signal K: ' + method + ' ' + path +
          ' is not allowed through the proxy in front of it (for signalk-navico-embedder: the path is not on its allowlist, or this client is not on its IP whitelist).'
      };
    }
    if (status === 404) {
      if (info.read) {
        return { kind: 'nodata', text: 'No data at ' + path + '.' + (info.emptyHint ? ' ' + info.emptyHint : '') };
      }
      return {
        kind: 'error',
        text: '404 ' + method + ' ' + path + ' does not exist. Is the plugin that owns this route installed and enabled?'
      };
    }
    if (status >= 500) {
      return { kind: 'error', text: status + ' Server error on ' + method + ' ' + path + '.' };
    }
    return { kind: 'error', text: status + ' ' + method + ' ' + path + ' failed.' };
  }

  return { describe: describe, parseLoginStatus: parseLoginStatus };
});
