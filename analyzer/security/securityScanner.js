'use strict';

// Security finding detection (docs/PROJECT_SPEC.md section 3.7).
// Every finding must be backed by actual evidence found in the project
// (docs/API_CONTRACT.md section 13: "Do not claim a security issue without
// evidence"). Secret values are masked in evidence before it leaves the
// analyzer — the full values never reach the database or the frontend.

const MAX_EVIDENCE_LINES = 5;
const MAX_EVIDENCE_LENGTH = 2000;

// Secret keyword alternation shared by the assignment patterns below.
const SECRET_KEYWORDS = 'password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|token';
// Patterns whose captured values are masked in every evidence line. The
// identifier may carry a prefix (dbPassword, DB_PASSWORD, jwtSecret); the
// keyword must end the identifier so names like passwordHash are ignored.
const SECRET_ASSIGNMENT = new RegExp(`\\b([\\w$]*(?:${SECRET_KEYWORDS}))\\s*[:=]\\s*(['"])([^'"\\s]{6,})\\2`, 'gi');
// KEY=VALUE lines (env-file style) whose key contains a secret keyword.
const ENV_ASSIGNMENT = new RegExp(`^([\\w.-]*(?:${SECRET_KEYWORDS})[\\w.-]*)\\s*=\\s*(\\S.*)$`, 'gim');
const KNOWN_KEY_FORMATS = new RegExp('\\b(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,})\\b', 'g');

const PLACEHOLDER_VALUES = new Set([
  'changeme', 'change-me', 'your_api_key', 'your-key', 'your_api_key_here',
  'xxx', 'xxxxx', 'xxxxxx', 'placeholder', 'example', 'example-key',
  'secret', 'password', 'none', 'null', 'undefined', 'todo', 'test', 'dummy',
]);

function maskValue(value) {
  if (value.length > 8) {
    return `${value.slice(0, 2)}...${value.slice(-2)}`;
  }
  return '****';
}

function isPlaceholder(value) {
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, '');
  if (PLACEHOLDER_VALUES.has(normalized)) return true;
  return /[$<{]/.test(value); // template placeholders / env references
}

// Masks secret-like values in a line of evidence. Runs over every evidence
// line regardless of which rule produced it (defense in depth).
function maskLine(line) {
  let masked = line;
  masked = masked.replace(SECRET_ASSIGNMENT, (full, key, quote, value) => {
    if (isPlaceholder(value)) return full;
    return `${key} = ${quote}${maskValue(value)}${quote}`;
  });
  masked = masked.replace(ENV_ASSIGNMENT, (full, key, value) => {
    if (isPlaceholder(value)) return full;
    return `${key}=${maskValue(value.trim())}`;
  });
  masked = masked.replace(KNOWN_KEY_FORMATS, (full, key) => maskValue(key));
  return masked;
}

// Rule definitions. Each rule scans line-by-line; a finding is emitted per
// (file, rule) with evidence from the first matching lines.
const RULES = [
  {
    id: 'private_key',
    category: 'hardcoded_secret',
    severity: 'critical',
    title: 'Private key material committed to project',
    description: 'A private key block was found in project files.',
    recommendation: 'Remove the key from the project, rotate it, and load keys from environment variables or a secret manager.',
    pattern: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE KEY-----/,
  },
  {
    id: 'known_api_key',
    category: 'hardcoded_secret',
    severity: 'critical',
    title: 'Known API key format detected',
    description: 'A string matching a known provider API key format (OpenAI, AWS, GitHub, Slack or Google) was found.',
    recommendation: 'Remove the key, rotate it immediately, and read it from an environment variable.',
    pattern: new RegExp(KNOWN_KEY_FORMATS.source, 'i'), // non-global: .test() stays stateless
  },
  {
    id: 'hardcoded_secret_assignment',
    category: 'hardcoded_secret',
    severity: 'high',
    title: 'Hardcoded secret assignment',
    description: 'A secret-like variable (password, API key, token) is assigned a literal value.',
    recommendation: 'Load secrets from environment variables or a secret manager instead of source code.',
    pattern: null, // handled specially — uses SECRET_ASSIGNMENT + ENV_ASSIGNMENT
  },
  {
    id: 'command_injection',
    category: 'command_injection',
    severity: 'high',
    title: 'Operating system command built from dynamic data',
    description: 'A process execution call builds its command through string concatenation or interpolation.',
    recommendation: 'Use argument-array APIs (spawn with args array, subprocess with list) and never interpolate untrusted input into commands.',
    pattern: /\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|system|popen)\s*\(\s*[`'"][^`'"]*(?:\+|\$\{|%s)/,
  },
  {
    id: 'sql_injection',
    category: 'sql_injection',
    severity: 'high',
    title: 'SQL query built through string concatenation',
    description: 'A database query call concatenates or interpolates values into the SQL statement.',
    recommendation: 'Use parameterized queries or prepared statements instead of building SQL strings.',
    pattern: /\b(?:query|execute|exec|raw)\s*\(\s*(?:['"][^'"]*['"]\s*\+|`[^`]*\$\{)/,
  },
  {
    id: 'unsafe_deserialization',
    category: 'unsafe_deserialization',
    severity: 'high',
    title: 'Unsafe deserialization of untrusted data',
    description: 'pickle.loads or yaml.load without an explicit safe loader was found.',
    recommendation: 'Avoid pickle for untrusted data; use yaml.safe_load and JSON-based formats.',
    pattern: /\bpickle\s*\.\s*loads?\s*\(|\byaml\s*\.\s*load\s*\(\s*(?!Loader)/,
  },
  {
    id: 'insecure_tls',
    category: 'insecure_tls',
    severity: 'high',
    title: 'TLS/SSL certificate verification disabled',
    description: 'Certificate verification is explicitly disabled (rejectUnauthorized: false or verify=False).',
    recommendation: 'Enable certificate verification and configure trusted CA certificates.',
    pattern: /rejectUnauthorized\s*:\s*false|verify\s*=\s*False|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/,
  },
  {
    id: 'dynamic_code_execution',
    category: 'code_execution',
    severity: 'high',
    title: 'Dynamic code execution (eval)',
    description: 'eval() or new Function() is used, which executes dynamically constructed code.',
    recommendation: 'Replace eval with explicit logic; if parsing data is required, use a safe parser.',
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(/,
  },
  {
    id: 'weak_crypto',
    category: 'weak_cryptography',
    severity: 'medium',
    title: 'Weak cryptographic hash function',
    description: 'MD5 or SHA-1 is used for hashing; both are considered cryptographically broken.',
    recommendation: 'Use SHA-256 or stronger; use bcrypt/argon2 for passwords.',
    pattern: /\b(?:createHash|createHmac)\s*\(\s*['"](md5|sha1)['"]|\bhashlib\s*\.\s*(?:md5|sha1)\s*\(/,
  },
  {
    id: 'cors_wildcard',
    category: 'cors_misconfiguration',
    severity: 'medium',
    title: 'CORS allows any origin',
    description: 'CORS is configured to allow every origin (*).',
    recommendation: 'Restrict allowed origins to a known allowlist.',
    pattern: /(?:origin|access-control-allow-origin)\s*[:=]\s*['"]\*['"]/i,
  },
  {
    id: 'xss_sink',
    category: 'xss_risk',
    severity: 'medium',
    title: 'Unsanitized HTML injection sink',
    description: 'dangerouslySetInnerHTML or document.write is used, which can inject unescaped markup.',
    recommendation: 'Render untrusted content as text or sanitize it before inserting it as HTML.',
    pattern: /dangerouslySetInnerHTML|\bdocument\s*\.\s*write\s*\(/,
  },
];

function truncateEvidence(lines) {
  const evidence = lines.slice(0, MAX_EVIDENCE_LINES).join('\n');
  return evidence.length > MAX_EVIDENCE_LENGTH
    ? evidence.slice(0, MAX_EVIDENCE_LENGTH)
    : evidence;
}

function scanSecretAssignments(file, lines) {
  const matches = [];
  lines.forEach((line, index) => {
    let matched = false;
    SECRET_ASSIGNMENT.lastIndex = 0;
    let assignMatch = SECRET_ASSIGNMENT.exec(line);
    while (assignMatch) {
      if (!isPlaceholder(assignMatch[3])) matched = true;
      assignMatch = SECRET_ASSIGNMENT.exec(line);
    }
    ENV_ASSIGNMENT.lastIndex = 0;
    let envMatch = ENV_ASSIGNMENT.exec(line);
    while (envMatch) {
      const value = envMatch[2].trim();
      if (value.length >= 6 && !isPlaceholder(value)) matched = true;
      envMatch = ENV_ASSIGNMENT.exec(line);
    }
    if (matched) {
      matches.push(`Line ${index + 1}: ${maskLine(line).trim()}`);
    }
  });
  return matches;
}

function scanEnvFileExposure(file) {
  const keys = [];
  for (const line of file.text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][\w.]*)\s*=/);
    if (match) keys.push(match[1]);
    if (keys.length >= 10) break;
  }
  return keys;
}

// Returns [{ filePath, category, severity, title, description, evidence,
//            recommendation }].
function scanSecurity(sourceFiles) {
  const findings = [];
  for (const file of sourceFiles) {
    const lines = file.text.split(/\r?\n/);

    // Committed environment files expose secrets by definition.
    if (/^\.env(\..+)?$/.test(file.name)) {
      const keys = scanEnvFileExposure(file);
      findings.push({
        filePath: file.path,
        category: 'exposed_configuration',
        severity: 'high',
        title: 'Environment file committed to project',
        description: 'An environment file with configuration values was found inside the project. Environment files commonly contain credentials.',
        evidence: keys.length > 0 ? `Variables: ${keys.join(', ')}` : 'File is empty or contains no variable assignments.',
        recommendation: 'Remove the environment file from the project, add it to ignore rules, and provide a .env.example template instead.',
      });
    }

    for (const rule of RULES) {
      let evidenceLines;
      if (rule.id === 'hardcoded_secret_assignment') {
        evidenceLines = scanSecretAssignments(file, lines);
      } else {
        evidenceLines = [];
        lines.forEach((line, index) => {
          if (rule.pattern.test(line)) {
            evidenceLines.push(`Line ${index + 1}: ${maskLine(line).trim()}`);
          }
        });
      }
      if (evidenceLines.length > 0) {
        findings.push({
          filePath: file.path,
          category: rule.category,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          evidence: truncateEvidence(evidenceLines),
          recommendation: rule.recommendation,
        });
      }
    }
  }

  findings.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return order[a.severity] - order[b.severity]
      || a.category.localeCompare(b.category)
      || a.filePath.localeCompare(b.filePath);
  });
  return findings;
}

module.exports = { scanSecurity, maskLine };
