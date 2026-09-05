'use strict';

// File and project health calculation (docs/PROJECT_SPEC.md sections 3.4,
// 3.5). The scoring algorithm stays modular so it can be improved later.
//
// File health status colors (spec section 3.4):
//   unknown  — gray   (not analyzed: directories, binary, generated, ignored)
//   healthy  — green  (analyzed, no notable findings)
//   warning  — yellow (medium/low issues or findings)
//   critical — red    (critical/high issues or findings)

const SEVERITY_WEIGHTS = { critical: 30, high: 20, medium: 10, low: 5, info: 2 };
const SECURITY_PROJECT_PENALTY = { critical: 15, high: 8, medium: 3, low: 1, info: 0.5 };

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

// Returns one entry per discovered file row:
//   { path, healthScore, healthStatus, analysisStatus }
function calculateFileHealth(files, issues, securityFindings, parsedPaths) {
  const penalties = new Map();
  const worstSeverity = new Map();

  function account(path, severity) {
    penalties.set(path, (penalties.get(path) || 0) + (SEVERITY_WEIGHTS[severity] || 0));
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const current = worstSeverity.get(path);
    if (current === undefined || order[severity] < order[current]) {
      worstSeverity.set(path, severity);
    }
  }

  for (const issue of issues) {
    account(issue.filePath, issue.severity);
  }
  for (const finding of securityFindings) {
    account(finding.filePath, finding.severity);
  }

  return files.map((file) => {
    const analyzed = parsedPaths.has(file.path);
    if (!analyzed) {
      return {
        path: file.path,
        healthScore: 0,
        healthStatus: 'unknown',
        analysisStatus: 'skipped',
      };
    }
    const penalty = penalties.get(file.path) || 0;
    const score = clampScore(100 - penalty);
    const worst = worstSeverity.get(file.path);
    let healthStatus = 'healthy';
    if (worst === 'critical' || worst === 'high') {
      healthStatus = 'critical';
    } else if (worst === 'medium' || worst === 'low') {
      healthStatus = 'warning';
    }
    return {
      path: file.path,
      healthScore: score,
      healthStatus,
      analysisStatus: 'completed',
    };
  });
}

// Returns { score, healthyFiles, warningFiles, criticalFiles,
//           issueCounts, securityCounts }.
function calculateProjectHealth(fileHealth, issues, securityFindings) {
  const analyzed = fileHealth.filter((entry) => entry.analysisStatus === 'completed');
  const averageScore = analyzed.length > 0
    ? analyzed.reduce((sum, entry) => sum + entry.healthScore, 0) / analyzed.length
    : 0;

  const securityPenalty = securityFindings.reduce(
    (sum, finding) => sum + (SECURITY_PROJECT_PENALTY[finding.severity] || 0),
    0,
  );

  const issueCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const issue of issues) {
    issueCounts[issue.severity] += 1;
  }
  const securityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of securityFindings) {
    securityCounts[finding.severity] += 1;
  }

  return {
    score: clampScore(averageScore - securityPenalty),
    healthyFiles: analyzed.filter((entry) => entry.healthStatus === 'healthy').length,
    warningFiles: analyzed.filter((entry) => entry.healthStatus === 'warning').length,
    criticalFiles: analyzed.filter((entry) => entry.healthStatus === 'critical').length,
    issueCounts,
    securityCounts,
  };
}

module.exports = { calculateFileHealth, calculateProjectHealth };
