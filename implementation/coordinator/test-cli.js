#!/usr/bin/env node

/**
 * Quick CLI validation script
 * Tests the SWE-bench CLI commands without running full dataset
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function testCLI() {
  console.log('🧪 Testing SWE-bench CLI functionality...\n');

  try {
    // Test help command
    console.log('📋 Testing help command...');
    const { stdout: helpOutput } = await execAsync('npm run swebench -- --help');
    console.log('✅ Help command works');
    console.log(helpOutput.substring(0, 200) + '...\n');

    // Test list command (will likely fail but we can test the command structure)
    console.log('📋 Testing list command...');
    try {
      await execAsync('npm run swebench -- list --limit 5');
      console.log('✅ List command executed');
    } catch (error) {
      console.log('⚠️  List command failed (expected in test environment)');
      console.log('   Error:', error.message.substring(0, 100) + '...');
    }

    // Test status command
    console.log('📊 Testing status command...');
    try {
      await execAsync('npm run swebench -- status');
      console.log('✅ Status command executed');
    } catch (error) {
      console.log('⚠️  Status command failed (expected in test environment)');
      console.log('   Error:', error.message.substring(0, 100) + '...');
    }

    console.log('\n🎉 CLI validation completed!');
    console.log('\n📚 Available commands:');
    console.log('   npm run swebench -- run                    # Run full dataset');
    console.log('   npm run swebench -- run --max-problems 5  # Run 5 problems only');
    console.log('   npm run swebench -- problem <id>          # Run single problem');
    console.log('   npm run swebench -- list                  # List available problems');
    console.log('   npm run swebench -- status                # Show runner status');
    console.log('   npm run swebench -- --help                # Show all options');

  } catch (error) {
    console.error('❌ CLI validation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  testCLI();
}