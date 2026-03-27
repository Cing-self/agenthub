#!/bin/bash
# OpenClaw Manager - Setup Script
# Run this in the openclaw-manager directory

set -e

echo "🦞 Setting up OpenClaw Manager..."
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo "❌ Rust/Cargo not found. Install from https://rustup.rs/"
    exit 1
fi

echo "✅ Node.js $(node --version)"
echo "✅ Cargo $(cargo --version)"
echo ""

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install
echo ""

# Install Tauri CLI if not present
if ! command -v cargo-tauri &> /dev/null; then
    echo "📦 Installing Tauri CLI..."
    cargo install tauri-cli --version "^2"
fi
echo ""

# Generate Tauri icons (placeholder)
echo "🎨 Creating placeholder icons..."
mkdir -p src-tauri/icons
# Create minimal placeholder PNGs using Node.js
node -e "
const fs = require('fs');
// 1x1 transparent PNG
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const sizes = ['32x32.png', '128x128.png', '128x128@2x.png'];
sizes.forEach(s => fs.writeFileSync('src-tauri/icons/' + s, png));
console.log('  Created placeholder PNG icons');
"
echo ""

echo "✅ Setup complete!"
echo ""
echo "To start development:"
echo "  npm run tauri dev"
echo ""
echo "To build for production:"
echo "  npm run tauri build"
