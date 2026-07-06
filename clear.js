#!/usr/bin/env node

/**
 * Clear Game Progress Script
 * Resets all game progress and saved states
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PROGRESS_FILE = path.join(__dirname, 'progress.json');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function banner() {
  console.log('\n' + colors.cyan + colors.bright);
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   Clear Game Progress Script         ║');
  console.log('╔═══════════════════════════════════════╗');
  console.log(colors.reset + '\n');
}

function getCurrentProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    return null;
  }
  return null;
}

function displayProgress(progress) {
  if (!progress || !progress.levels || Object.keys(progress.levels).length === 0) {
    log('  No progress found.', 'yellow');
    return;
  }

  log('\n📊 Current Progress:', 'bright');
  log('─────────────────────────────────────', 'cyan');

  const levels = Object.keys(progress.levels).sort((a, b) => parseInt(a) - parseInt(b));
  
  for (const levelNum of levels) {
    const level = progress.levels[levelNum];
    const status = level.completed ? '✓ Completed' : level.inProgress ? '⏸ In Progress' : '○ Started';
    const statusColor = level.completed ? 'green' : level.inProgress ? 'yellow' : 'reset';
    
    log(`\n  Level ${levelNum}: ${status}`, statusColor);
    
    if (level.completed) {
      log(`    Best Time: ${formatTime(level.bestTime)}`, 'reset');
      log(`    Best Moves: ${level.bestMoves}`, 'reset');
      log(`    Attempts: ${level.attempts}`, 'reset');
    }
    
    if (level.inProgress) {
      log(`    Current Moves: ${level.inProgress.moves}`, 'reset');
      log(`    Time Played: ${formatTime(level.inProgress.elapsedTime)}`, 'reset');
    }
    
    if (level.totalTimePlayed) {
      log(`    Total Time: ${formatTime(level.totalTimePlayed)}`, 'reset');
    }
  }
  
  log('\n─────────────────────────────────────', 'cyan');
}

function formatTime(seconds) {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function clearProgress() {
  try {
    const freshProgress = {
      levels: {}
    };
    
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(freshProgress, null, 2));
    log('✓ Progress file cleared', 'green');
    return true;
  } catch (err) {
    log('✗ Error clearing progress file: ' + err.message, 'red');
    return false;
  }
}

function backupProgress(progress) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFile = path.join(__dirname, `progress.backup.${timestamp}.json`);
    
    fs.writeFileSync(backupFile, JSON.stringify(progress, null, 2));
    log(`✓ Backup created: ${path.basename(backupFile)}`, 'green');
    return true;
  } catch (err) {
    log('✗ Error creating backup: ' + err.message, 'red');
    return false;
  }
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(colors.yellow + question + colors.reset, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

async function main() {
  banner();

  // Check if progress file exists
  if (!fs.existsSync(PROGRESS_FILE)) {
    log('No progress file found. Nothing to clear.', 'yellow');
    log('The game will start fresh on next launch.\n', 'reset');
    return;
  }

  // Load and display current progress
  const progress = getCurrentProgress();
  
  if (!progress) {
    log('Unable to read progress file.', 'red');
    return;
  }

  displayProgress(progress);

  // Confirm action
  log('\n⚠️  Warning:', 'red');
  log('  This will delete all game progress including:', 'yellow');
  log('  • Completed levels', 'reset');
  log('  • Best scores and times', 'reset');
  log('  • In-progress games', 'reset');
  log('  • Total play time', 'reset');
  log('\n  Note: Browser localStorage must be cleared separately.', 'cyan');

  const answer = await prompt('\nDo you want to continue? [y/N] ');

  if (answer !== 'y' && answer !== 'yes') {
    log('\n✓ Cancelled. No changes made.\n', 'green');
    return;
  }

  // Ask about backup
  const backupAnswer = await prompt('Create backup before clearing? [Y/n] ');
  
  if (backupAnswer !== 'n' && backupAnswer !== 'no') {
    log('\nCreating backup...', 'cyan');
    backupProgress(progress);
  }

  // Clear progress
  log('\nClearing progress...', 'cyan');
  const success = clearProgress();

  if (success) {
    log('\n' + colors.bright + colors.green + '✓ Game progress cleared successfully!' + colors.reset);
    log('\nNext steps:', 'cyan');
    log('  1. Restart the server if it\'s running', 'reset');
    log('  2. Open browser and clear localStorage:', 'reset');
    log('     • Open DevTools (F12)', 'reset');
    log('     • Go to Application/Storage tab', 'reset');
    log('     • Clear localStorage for localhost:3000', 'reset');
    log('  3. Refresh the page\n', 'reset');
  } else {
    log('\n✗ Failed to clear progress.\n', 'red');
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(err => {
    log('\n✗ Error: ' + err.message, 'red');
    process.exit(1);
  });
}

module.exports = { clearProgress, backupProgress };
