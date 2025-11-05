#!/usr/bin/env node

/**
 * Generate version information from git
 * Creates a version.json file with git commit info
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function getGitInfo() {
  try {
    // Get commit SHA (short version)
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();

    // Get commit date
    const date = execSync('git log -1 --format=%cd --date=format:"%Y-%m-%d %H:%M"', { encoding: 'utf8' }).trim();

    // Get commit timestamp for sorting
    const timestamp = execSync('git log -1 --format=%ct', { encoding: 'utf8' }).trim();

    // Get branch name
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();

    // Get commit message (first line only)
    const message = execSync('git log -1 --format=%s', { encoding: 'utf8' }).trim();

    return {
      sha,
      date,
      timestamp: parseInt(timestamp),
      branch,
      message,
      version: `${date.split(' ')[0]}-${sha}`,
      buildDate: new Date().toISOString()
    };
  } catch (error) {
    console.warn('Could not get git information, using fallback version');
    return {
      sha: 'dev',
      date: new Date().toISOString().split('T')[0],
      timestamp: Date.now(),
      branch: 'unknown',
      message: 'Development build',
      version: `dev-${Date.now()}`,
      buildDate: new Date().toISOString()
    };
  }
}

// Generate version info
const versionInfo = getGitInfo();

// Write to public directory
const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const versionPath = path.join(publicDir, 'version.json');
fs.writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2));

console.log('Generated version info:', versionInfo.version);
console.log('Written to:', versionPath);
