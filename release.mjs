import { readFileSync, writeFileSync } from 'fs';
import { execSync, execFileSync } from 'child_process';
import path from 'path';

/**
 * Version Update and Deployment Automation Script
 *
 * 1. Update version in package.json
 * 2. Synchronize version in manifest.json, versions.json
 * 3. Run build
 * 4. Create Git commit
 * 5. Create Git tag
 * 6. Push changes to GitHub (REQUIRES Github CLI: https://cli.github.com)
 */

// Version type definitions
const VERSION_TYPES = {
  PATCH: 'patch',
  MINOR: 'minor',
  MAJOR: 'major'
};

// Strict X.Y.Z, no prefix, no prerelease or build suffix.
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

// Default settings
const DEFAULT_VERSION_TYPE = VERSION_TYPES.PATCH;
const MIN_APP_VERSION = JSON.parse(readFileSync(path.resolve(process.cwd(), 'manifest.json'), 'utf8')).minAppVersion;

// Store original versions for rollback if needed
let originalPackageVersion = '';
let originalManifestVersion = '';

// Track exactly what needs undoing, so rollback never guesses.
let addedVersionsKey = '';   // key this run wrote into versions.json
let createdCommit = false;   // git commit succeeded this run
let createdTag = '';         // git tag created this run

/**
 * Validates that a version string is strictly X.Y.Z.
 * Without this, `1.0.0-beta.1` silently becomes `1.0.NaN` and is written
 * to package.json, manifest.json, versions.json, and the git tag.
 * @param {string} version - Version string to validate
 * @param {string} source - Where the version came from, for the error message
 */
const assertValidVersion = (version, source) => {
  if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
    console.error(`❌ Invalid version in ${source}: ${JSON.stringify(version)}`);
    console.log('Expected a strict semver release version: MAJOR.MINOR.PATCH (e.g. 1.0.11).');
    console.log('Prefixes ("v1.0.0") and prerelease or build suffixes ("1.0.0-beta.1") are not supported.');
    process.exit(1);
  }
};

/**
 * Updates version value from the version string.
 * @param {string} version - Current version (e.g., '0.2.2')
 * @param {string} type - Update type ('patch', 'minor', 'major')
 * @returns {string} Updated version
 */
const updateVersion = (version, type = DEFAULT_VERSION_TYPE) => {
  const [major, minor, patch] = version.split('.').map(Number);

  switch (type) {
    case VERSION_TYPES.MAJOR:
      return `${major + 1}.0.0`;
    case VERSION_TYPES.MINOR:
      return `${major}.${minor + 1}.0`;
    case VERSION_TYPES.PATCH:
    default:
      return `${major}.${minor}.${patch + 1}`;
  }
};

/**
 * Gets version information before any changes are made.
 * @returns {string} Previous version
 */
const getPreviousVersion = () => {
  const manifestPath = path.resolve(process.cwd(), 'manifest.json');
  const manifestData = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assertValidVersion(manifestData.version, 'manifest.json');
  return manifestData.version;
}

/**
 * Updates version information in package.json file.
 * @param {string} versionType - Version type to update
 * @returns {string} New version
 */
const updatePackageVersion = (versionType) => {
  const packagePath = path.resolve(process.cwd(), 'package.json');
  const packageData = JSON.parse(readFileSync(packagePath, 'utf8'));

  const currentVersion = packageData.version;
  assertValidVersion(currentVersion, 'package.json');
  originalPackageVersion = currentVersion; // Store original version for possible rollback
  const newVersion = updateVersion(currentVersion, versionType);
  assertValidVersion(newVersion, 'the computed new version');

  packageData.version = newVersion;
  writeFileSync(packagePath, JSON.stringify(packageData, null, '\t') + '\n');

  console.log(`📦 Updated package.json version: ${currentVersion} → ${newVersion}`);
  return newVersion;
};

/**
 * Updates version information in manifest.json file.
 * @param {string} newVersion - Version to update
 */
const updateManifestVersion = (newVersion) => {
  const manifestPath = path.resolve(process.cwd(), 'manifest.json');
  const manifestData = JSON.parse(readFileSync(manifestPath, 'utf8'));

  const currentVersion = manifestData.version;
  originalManifestVersion = currentVersion; // Store original version for possible rollback
  manifestData.version = newVersion;

  writeFileSync(manifestPath, JSON.stringify(manifestData, null, '\t') + '\n');
  console.log(`📋 Updated manifest.json version: ${currentVersion} → ${newVersion}`);
};

/**
 * Updates version information in versions.json file.
 * @param {string} previousVersion - Previous version
 * @param {string} newVersion - Version to update
 * @param {string} minAppVersion - Minimum Obsidian version for this release
 */
const updateVersionsVersion = (previousVersion, newVersion, minAppVersion) => {
  const versionsPath = path.resolve(process.cwd(), 'versions.json');
  const versionsData = JSON.parse(readFileSync(versionsPath, 'utf8'));

  // Only record the key for rollback if we are actually adding it. Overwriting
  // an existing entry must not be undone by deleting that entry.
  const alreadyPresent = Object.prototype.hasOwnProperty.call(versionsData, newVersion);
  versionsData[newVersion] = minAppVersion;

  writeFileSync(versionsPath, JSON.stringify(versionsData, null, '\t') + '\n');
  if (!alreadyPresent) {
    addedVersionsKey = newVersion;
  }
  console.log(`📋 Updated versions.json version: ${previousVersion} → ${newVersion}`);
};

/**
 * Run project build
 */
const buildProject = () => {
  try {
    console.log('🔨 Starting project build...');
    execSync('npm run build', { stdio: 'inherit' });
    console.log('✅ Build completed');
    return true;
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    return false;
  }
};

/**
 * Undo the git commit and tag created by this run, if any.
 * Runs before the file rollback so the working tree ends up matching the
 * restored JSON files instead of stranding a release commit locally.
 */
const rollbackGit = () => {
  if (createdTag) {
    try {
      execFileSync('git', ['tag', '-d', createdTag], { stdio: 'inherit' });
      console.log(`♻️ Deleted tag: ${createdTag}`);
      createdTag = '';
    } catch (error) {
      console.error(`❌ Failed to delete tag ${createdTag}. Remove it manually: git tag -d ${createdTag}`);
      console.error('   ', error.message);
    }
  }

  if (createdCommit) {
    try {
      // --mixed (the default) also clears the index. --soft would leave the
      // bumped versions staged, so the tree would still look dirty after the
      // file rollback and the next run would fail the clean-tree check.
      execFileSync('git', ['reset', '--mixed', 'HEAD~1'], { stdio: 'inherit' });
      console.log('♻️ Undid release commit (git reset --mixed HEAD~1)');
      createdCommit = false;
    } catch (error) {
      console.error('❌ Failed to undo the release commit. Undo it manually: git reset --mixed HEAD~1');
      console.error('   ', error.message);
    }
  }
};

/**
 * Rollback version changes if the release process fails
 */
const rollbackVersions = () => {
  if (originalPackageVersion) {
    try {
      const packagePath = path.resolve(process.cwd(), 'package.json');
      const packageData = JSON.parse(readFileSync(packagePath, 'utf8'));
      const currentVersion = packageData.version;

      packageData.version = originalPackageVersion;
      writeFileSync(packagePath, JSON.stringify(packageData, null, '\t') + '\n');
      console.log(`♻️ Rolled back package.json version: ${currentVersion} → ${originalPackageVersion}`);
    } catch (error) {
      console.error('❌ Failed to rollback package.json version:', error.message);
    }
  }

  // Only remove the exact key this run added. The previous version of this
  // script deleted whatever key happened to be last, which could drop an
  // unrelated historical entry.
  if (addedVersionsKey) {
    try {
      const versionsPath = path.resolve(process.cwd(), 'versions.json');
      const versionsData = JSON.parse(readFileSync(versionsPath, 'utf8'));

      delete versionsData[addedVersionsKey];

      writeFileSync(versionsPath, JSON.stringify(versionsData, null, '\t') + '\n');
      console.log(`♻️ Removed versions.json entry: ${addedVersionsKey}`);
      addedVersionsKey = '';
    } catch (error) {
      console.error('❌ Failed to rollback versions.json version:', error.message);
    }
  }

  if (originalManifestVersion) {
    try {
      const manifestPath = path.resolve(process.cwd(), 'manifest.json');
      const manifestData = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const currentVersion = manifestData.version;

      manifestData.version = originalManifestVersion;
      writeFileSync(manifestPath, JSON.stringify(manifestData, null, '\t') + '\n');
      console.log(`♻️ Rolled back manifest.json version: ${currentVersion} → ${originalManifestVersion}`);
    } catch (error) {
      console.error('❌ Failed to rollback manifest.json version:', error.message);
    }
  }
};

/**
 * Create Git commit and tag
 * @param {string} version - New version
 */
const createGitCommitAndTag = (version) => {
  try {
    // Stage changed files
    try {
      execFileSync('git', ['add', 'package.json', 'manifest.json', 'versions.json'], { stdio: 'inherit' });
    } catch (error) {
      console.error('❌ Failed to stage package.json, versions.json and manifest.json:', error.message);
      return false;
    }

    // The release artifacts (main.js, styles.css) are deliberately not staged
    // here. GitHub Actions checks out the tag, runs the build, and attaches
    // them to the release, so main.js is gitignored and styles.css is ordinary
    // committed source that a release never modifies.

    // Create commit
    const commitMessage = `chore: release ${version}`;
    execFileSync('git', ['commit', '-m', commitMessage], { stdio: 'inherit' });
    createdCommit = true;
    console.log(`✅ Commit created: ${commitMessage}`);

    // Create tag
    const tagName = `${version}`;
    execFileSync('git', ['tag', '-a', tagName, '-m', `Release ${tagName}`], { stdio: 'inherit' });
    createdTag = tagName;
    console.log(`🏷️ Tag created: ${tagName}`);

    // Push changes
    execSync('git push', { stdio: 'inherit' });
    execSync('git push --tags', { stdio: 'inherit' });

    // Past this point the release is public and rollback is no longer safe.
    createdCommit = false;
    createdTag = '';
    console.log('🚀 Changes pushed to GitHub');
    console.log('📦 GitHub Actions will create the release with artifact attestations.');
    return true; // Successfully created commit, tag, and pushed
  } catch (error) {
    console.error('❌ Error during Git operations:', error.message);
    return false; // Failed to complete Git operations
  }
};

/**
 * Check if Git working tree is clean
 * @returns {boolean} Whether the working tree is clean
 */
const isGitWorkingTreeClean = () => {
  try {
    // Check for uncommitted changes
    const output = execSync('git status --porcelain', { encoding: 'utf-8' });
    return output.trim() === '';
  } catch (error) {
    console.error('❌ Error checking Git status:', error.message);
    return false;
  }
};

/**
 * Undo everything this run changed, git first, then the JSON files.
 */
const rollbackAll = () => {
  rollbackGit();
  rollbackVersions();
};

/**
 * Main function
 */
const main = () => {
  let success = true;
  let newVersion = '';

  try {
    // Check for uncommitted changes
    if (!isGitWorkingTreeClean()) {
      console.error('❌ Cannot proceed with release: You have uncommitted changes.');
      console.log('Please commit or stash your changes before running the release script.');
      process.exit(1);
    }

    // Check command line arguments
    const args = process.argv.slice(2);
    const versionType = args[0] || DEFAULT_VERSION_TYPE;

    if (!Object.values(VERSION_TYPES).includes(versionType)) {
      console.error(`❌ Invalid version type: ${versionType}`);
      console.log(`Valid options: ${Object.values(VERSION_TYPES).join(', ')}`);
      process.exit(1);
    }

    let previousVersion = getPreviousVersion()

    // Step 1: Update package.json version
    try {
      newVersion = updatePackageVersion(versionType);
    } catch (error) {
      console.error('❌ Failed to update package.json version:', error.message);
      success = false;
    }

    // Step 2: Update manifest.json version
    if (success) {
      try {
        updateManifestVersion(newVersion);
      } catch (error) {
        console.error('❌ Failed to update manifest.json version:', error.message);
        success = false;
      }
    }

    // Step 2.5: Update versions.json version
    if (success) {
      try {
        updateVersionsVersion(previousVersion, newVersion, MIN_APP_VERSION);
      } catch (error) {
        console.error('❌ Failed to update versions.json version:', error.message);
        success = false;
      }
    }

    // Step 3: Build the project
    if (success) {
      if (!buildProject()) {
        console.error('❌ Build process failed.');
        success = false;
      }
    }

    // Step 4: Git operations
    if (success) {
      if (!createGitCommitAndTag(newVersion)) {
        console.error('❌ Git operations failed.');
        success = false;
      }
    }

    // Check overall success
    if (success) {
      console.log(`\n🎉 Release ${newVersion} completed successfully!`);
    } else {
      console.error('❌ Release process failed. Rolling back changes...');
      rollbackAll();
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Unexpected error during release process:', error.message);
    rollbackAll();
    process.exit(1);
  }
};

// Run script
main();
