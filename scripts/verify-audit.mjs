import fs from 'node:fs';
import path from 'node:path';

const auditPath = process.argv[2];

if (!auditPath) {
  console.error('Usage: node scripts/verify-audit.mjs <audit-json-path>');
  process.exit(1);
}

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const repoRoot = process.cwd();
const hasAppDirectory = [path.join(repoRoot, 'app'), path.join(repoRoot, 'src', 'app')].some((candidate) => fs.existsSync(candidate));
const hasMiddleware = [
  'middleware.js',
  'middleware.mjs',
  'middleware.cjs',
  'middleware.ts',
  'middleware.tsx',
  path.join('src', 'middleware.js'),
  path.join('src', 'middleware.mjs'),
  path.join('src', 'middleware.cjs'),
  path.join('src', 'middleware.ts'),
  path.join('src', 'middleware.tsx'),
].some((candidate) => fs.existsSync(path.join(repoRoot, candidate)));

function walkForUseServer(startDir) {
  if (!fs.existsSync(startDir)) {
    return false;
  }

  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === '.next' || entry.name === 'node_modules') {
      continue;
    }

    const fullPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      if (walkForUseServer(fullPath)) {
        return true;
      }
      continue;
    }

    if (!/\.(js|jsx|mjs|cjs|ts|tsx)$/.test(entry.name)) {
      continue;
    }

    const source = fs.readFileSync(fullPath, 'utf8');
    if (source.includes("'use server'") || source.includes('"use server"')) {
      return true;
    }
  }

  return false;
}

const sourceRoots = [
  path.join(repoRoot, 'app'),
  path.join(repoRoot, 'src'),
  path.join(repoRoot, 'pages'),
  path.join(repoRoot, 'lib'),
];
const hasUseServer = sourceRoots.some((root) => walkForUseServer(root));
const pagesRouterOnly = !hasAppDirectory && !hasMiddleware && !hasUseServer;

// Next.js' December 11, 2025 security guidance targets App Router / React Server Components paths.
// This repository uses the Pages Router only, so those specific advisories are non-applicable here.
const allowedNextAuditMarkers = [
  'CVE-2025-55183',
  'CVE-2025-55184',
  'CVE-2025-66478',
  'CVE-2025-67779',
  'React Server Components',
  'App Router',
  'Server Function',
];

function findingText(finding) {
  return [finding.title, finding.url, finding.name, finding.range].filter(Boolean).join(' ');
}

function isAllowlistedFinding(packageName, via) {
  if (!pagesRouterOnly || packageName !== 'next' || typeof via !== 'object' || Array.isArray(via)) {
    return false;
  }

  const text = findingText(via);
  return allowedNextAuditMarkers.some((marker) => text.includes(marker));
}

const activeFindings = [];
for (const [packageName, vulnerability] of Object.entries(audit.vulnerabilities || {})) {
  for (const via of vulnerability.via || []) {
    if (typeof via === 'string') {
      continue;
    }

    activeFindings.push({
      packageName,
      severity: vulnerability.severity,
      title: via.title || '(no title)',
      url: via.url || '',
      range: via.range || vulnerability.range || '',
      allowlisted: isAllowlistedFinding(packageName, via),
    });
  }
}

const blockingFindings = activeFindings.filter((finding) => !finding.allowlisted);

if (blockingFindings.length === 0) {
  if (activeFindings.length > 0) {
    console.log('npm audit reported findings, but all are allowlisted for this Pages Router-only repository:');
    for (const finding of activeFindings) {
      console.log(`- ${finding.packageName} [${finding.severity}] ${finding.title}`);
      if (finding.url) {
        console.log(`  ${finding.url}`);
      }
    }
  } else {
    console.log('npm audit reported no production vulnerabilities.');
  }

  console.log(`Audit policy context: appDir=${hasAppDirectory}, middleware=${hasMiddleware}, useServer=${hasUseServer}`);
  process.exit(0);
}

console.error('Blocking production vulnerabilities remain after applying the repository audit policy:');
for (const finding of blockingFindings) {
  console.error(`- ${finding.packageName} [${finding.severity}] ${finding.title}`);
  if (finding.url) {
    console.error(`  ${finding.url}`);
  }
  if (finding.range) {
    console.error(`  affected range: ${finding.range}`);
  }
}
console.error(`Audit policy context: appDir=${hasAppDirectory}, middleware=${hasMiddleware}, useServer=${hasUseServer}`);
process.exit(1);
