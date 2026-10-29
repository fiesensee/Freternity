import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function calculateNextVersion(
  currentVersion,
  bumpType,
  commitMessages = []
) {
  const [major, minor, patch] = currentVersion.split('.').map(Number);

  let resolvedBump = bumpType;
  if (resolvedBump === 'auto') {
    let hasMajor = false;
    let hasMinor = false;

    for (const msg of commitMessages) {
      if (
        msg.includes('BREAKING CHANGE') ||
        /^[a-z]+(\([a-z0-9_-]+\))?!:/.test(msg)
      ) {
        hasMajor = true;
        break;
      }
      if (/^feat(\([a-z0-9_-]+\))?:/.test(msg)) {
        hasMinor = true;
      }
    }

    if (hasMajor) {
      resolvedBump = 'major';
    } else if (hasMinor) {
      resolvedBump = 'minor';
    } else {
      resolvedBump = 'patch';
    }
  }

  if (resolvedBump === 'major') {
    return { nextVersion: `${major + 1}.0.0`, bumpType: resolvedBump };
  }
  if (resolvedBump === 'minor') {
    return { nextVersion: `${major}.${minor + 1}.0`, bumpType: resolvedBump };
  }
  return { nextVersion: `${major}.${minor}.${patch + 1}`, bumpType: resolvedBump };
}

// Run CLI when executed directly
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(__dirname, '..');
  const pkgPath = path.join(rootDir, 'package.json');

  const args = process.argv.slice(2);
  const bumpArg = args.find((a) => a.startsWith('--bump='))?.split('=')[1] || 'auto';
  const isDryRun = args.includes('--dry-run');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;

  let commitMessages = [];
  try {
    let lastTag = '';
    try {
      lastTag = execSync('git describe --tags --abbrev=0', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
    } catch {
      lastTag = '';
    }

    const revRange = lastTag ? `${lastTag}..HEAD` : 'HEAD';
    const rawCommits = execSync(`git log ${revRange} --pretty=format:"%s"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    commitMessages = rawCommits.split('\n').filter(Boolean);
  } catch {
    commitMessages = [];
  }

  const { nextVersion, bumpType } = calculateNextVersion(
    currentVersion,
    bumpArg,
    commitMessages
  );

  console.log(`Current Version: ${currentVersion}`);
  console.log(`Resolved Bump:   ${bumpType}`);
  console.log(`Next Version:    ${nextVersion}`);

  if (!isDryRun) {
    pkg.version = nextVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Successfully updated package.json to ${nextVersion}`);
  }

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `current_version=${currentVersion}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `next_version=${nextVersion}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `bump_type=${bumpType}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=v${nextVersion}\n`);
  }
}
