'use strict';

const { isJavaScriptExtension } = require('../parsers/languageDetector');

// API/route detection (docs/PROJECT_SPEC.md section 3.9).
// Detects Express-style JS routes and Flask/FastAPI-style Python
// decorators. Framework labels come from manifest dependencies when
// available, falling back to syntax families.

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all']);
const AUTH_MIDDLEWARE_RE = /auth|jwt|token|passport|session|permission|role|verify|secure|guard|login|admin/i;
const HANDLER_STOP_WORDS = new Set([
  'req', 'res', 'next', 'err', 'error', 'true', 'false', 'null', 'undefined',
  'request', 'response', 'async', 'await', 'return',
]);

function jsFrameworkLabel(profileFramework) {
  if (profileFramework && isJavaScriptFramework(profileFramework)) {
    return profileFramework;
  }
  return 'express'; // app/router.METHOD(route) syntax family
}

function isJavaScriptFramework(framework) {
  return ['express', 'koa', 'fastify', 'hapi', '@hapi/hapi', '@nestjs/core'].includes(framework);
}

function pythonFrameworkLabel(profileFramework, style) {
  if (profileFramework === 'flask' || profileFramework === 'fastapi' || profileFramework === 'django') {
    return profileFramework;
  }
  return style === 'route' ? 'flask' : 'fastapi';
}

// Counts unbalanced '(' / '{' before an index. Identifiers nested inside
// inline handler bodies or option objects (res.json({ ok: true })) are not
// route handlers.
function nestingDepthBefore(text, index) {
  let depth = 0;
  for (let i = 0; i < index; i += 1) {
    const ch = text[i];
    if (ch === '(' || ch === '{') depth += 1;
    else if (ch === ')' || ch === '}') depth -= 1;
  }
  return depth;
}

// Extracts the likely handler identifier from the arguments that follow the
// route string: the last bare identifier at the argument-list level that is
// not a call, a request object, or a common middleware keyword.
function detectControllerName(argsText) {
  const identifiers = argsText.match(/[A-Za-z_$][\w$]*/g) || [];
  let controller = null;
  let cursor = 0;
  for (const identifier of identifiers) {
    const start = argsText.indexOf(identifier, cursor);
    cursor = start + identifier.length;
    if (HANDLER_STOP_WORDS.has(identifier)) continue;
    // Skip identifiers directly followed by '(' (middleware calls such as
    // validateRequest({...})) — they are not the route handler.
    if (/^\s*\(/.test(argsText.slice(cursor))) continue;
    if (nestingDepthBefore(argsText, start) > 0) continue;
    controller = identifier;
  }
  return controller;
}

function detectAuthentication(argsText) {
  const identifiers = argsText.match(/[A-Za-z_$][\w$]*/g) || [];
  return identifiers.some((identifier) => AUTH_MIDDLEWARE_RE.test(identifier)) ? 1 : 0;
}

function scanJavaScriptRoutes(file, framework, endpoints) {
  const lines = file.text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // app.get('/path' | router.post(`/path` | api.put("/path"
    const match = line.match(/\b([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (!match) continue;
    // app.use / socket.get and similar non-HTTP usage is filtered by the
    // HTTP method set; plain property access like config.get('x') is also
    // excluded because the receiver must be a known router-ish identifier.
    if (!HTTP_METHODS.has(match[2])) continue;
    const argsText = line.slice(match.index + match[0].length);
    endpoints.push({
      filePath: file.path,
      method: match[2].toUpperCase(),
      route: match[3],
      framework,
      controllerName: detectControllerName(argsText),
      authenticationRequired: detectAuthentication(argsText),
    });
  }
}

function scanPythonRoutes(file, framework, endpoints) {
  const lines = file.text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // @app.route('/path') or @app.route('/path', methods=['GET', 'POST'])
    const routeMatch = line.match(/@([A-Za-z_]\w*)\s*\.\s*route\s*\(\s*['"]([^'"]+)['"]([^)]*)\)/);
    if (routeMatch) {
      const methodsMatch = routeMatch[3].match(/methods\s*=\s*\[([^\]]*)\]/);
      const methods = methodsMatch
        ? (methodsMatch[1].match(/[A-Za-z]+/g) || ['GET']).map((m) => m.toUpperCase())
        : ['GET'];
      for (const method of new Set(methods)) {
        endpoints.push({
          filePath: file.path,
          method,
          route: routeMatch[2],
          framework: pythonFrameworkLabel(framework, 'route'),
          controllerName: nextDefName(lines, i),
          authenticationRequired: 0,
        });
      }
      continue;
    }
    // @app.get('/path') / @router.post('/path')
    const methodMatch = line.match(/@([A-Za-z_]\w*)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/);
    if (methodMatch) {
      endpoints.push({
        filePath: file.path,
        method: methodMatch[2].toUpperCase(),
        route: methodMatch[3],
        framework: pythonFrameworkLabel(framework, 'method'),
        controllerName: nextDefName(lines, i),
        authenticationRequired: 0,
      });
    }
  }
}

function nextDefName(lines, decoratorIndex) {
  for (let i = decoratorIndex + 1; i < Math.min(lines.length, decoratorIndex + 6); i += 1) {
    const def = lines[i].match(/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/);
    if (def) return def[1];
  }
  return null;
}

function detectApiEndpoints(sourceFiles, profile) {
  const framework = profile ? profile.framework : null;
  const endpoints = [];
  const seen = new Set();
  for (const file of sourceFiles) {
    if (isJavaScriptExtension(file.extension)) {
      scanJavaScriptRoutes(file, jsFrameworkLabel(framework), endpoints);
    } else if (file.extension === 'py') {
      scanPythonRoutes(file, framework, endpoints);
    }
  }
  // Deduplicate (filePath, method, route).
  const unique = endpoints.filter((endpoint) => {
    const key = `${endpoint.filePath}|${endpoint.method}|${endpoint.route}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique;
}

module.exports = { detectApiEndpoints };
