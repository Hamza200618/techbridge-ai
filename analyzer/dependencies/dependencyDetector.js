'use strict';

// Dependency detection from package manifests
// (docs/PROJECT_SPEC.md section 3.8, docs/TEAM_RULES.md rule 16).
// Only well-parsed manifests produce facts.

const KNOWN_BACKEND_FRAMEWORKS = [
  'express', '@nestjs/core', 'koa', 'fastify', 'hapi', '@hapi/hapi',
  'django', 'flask', 'fastapi', 'laravel', 'rails', 'spring-boot',
];
const KNOWN_FRONTEND_FRAMEWORKS = [
  'next', 'nuxt', 'react', 'vue', 'angular', '@angular/core', 'svelte',
  '@sveltejs/kit',
];

// package.json dependency sections → dependency_type enum values.
const NPM_SECTIONS = [
  ['dependencies', 'runtime'],
  ['devDependencies', 'development'],
  ['peerDependencies', 'peer'],
  ['optionalDependencies', 'optional'],
];

function detectNpmPackageManager(files) {
  const paths = new Set(files.map((file) => file.path));
  if (paths.has('pnpm-lock.yaml')) return 'pnpm';
  if (paths.has('yarn.lock')) return 'yarn';
  if (paths.has('package-lock.json')) return 'npm';
  return 'npm';
}

function parseNpmManifest(file, dependencies, packageManager) {
  let manifest;
  try {
    manifest = JSON.parse(file.text);
  } catch {
    return; // unparsable manifest — no facts
  }
  for (const [section, dependencyType] of NPM_SECTIONS) {
    const entries = manifest[section];
    if (!entries || typeof entries !== 'object') continue;
    for (const [name, version] of Object.entries(entries)) {
      if (typeof version !== 'string') continue;
      dependencies.push({
        name,
        version,
        dependencyType,
        packageManager,
        sourcePath: file.path,
      });
    }
  }
}

function parseRequirementsManifest(file, dependencies) {
  for (const rawLine of file.text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    const match = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[([^\]]*)\])?\s*(?:==|>=|<=|~=|!=|>|<)?\s*([^\s;#]*)/);
    if (!match) continue;
    dependencies.push({
      name: match[1],
      version: match[3] || null,
      dependencyType: 'runtime',
      packageManager: 'pip',
      sourcePath: file.path,
    });
  }
}

// Returns { dependencies, declaredPackages, profile }.
//   dependencies      — rows for project_dependencies
//   declaredPackages  — Set of declared external package names (lowercase)
//   profile           — { hasNpmManifest, hasPipManifest, framework, projectType }
function detectDependencies(sourceFiles, files) {
  const dependencies = [];
  let hasNpmManifest = false;
  let hasPipManifest = false;
  for (const file of sourceFiles) {
    if (file.path === 'package.json' || file.path.endsWith('/package.json')) {
      hasNpmManifest = true;
      parseNpmManifest(file, dependencies, detectNpmPackageManager(files));
    } else if (file.path === 'requirements.txt' || file.path.endsWith('/requirements.txt')) {
      hasPipManifest = true;
      parseRequirementsManifest(file, dependencies);
    }
  }

  const declaredPackages = new Set(
    dependencies.map((dependency) => dependency.name.toLowerCase()),
  );
  return {
    dependencies,
    declaredPackages,
    profile: {
      hasNpmManifest,
      hasPipManifest,
      ...detectProjectProfile(dependencies),
    },
  };
}

// Framework and project type derived strictly from manifest dependencies.
function detectProjectProfile(dependencies) {
  const names = new Set(dependencies.map((dependency) => dependency.name.toLowerCase()));
  const backendFramework = KNOWN_BACKEND_FRAMEWORKS.find((framework) => names.has(framework));
  const frontendFramework = KNOWN_FRONTEND_FRAMEWORKS.find((framework) => names.has(framework));
  let projectType;
  if (backendFramework && frontendFramework) {
    projectType = 'fullstack';
  } else if (backendFramework) {
    projectType = 'backend';
  } else if (frontendFramework) {
    projectType = 'frontend';
  } else {
    projectType = 'unknown';
  }
  return {
    framework: backendFramework || frontendFramework || null,
    projectType,
  };
}

module.exports = { detectDependencies };
