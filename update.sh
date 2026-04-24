#!/bin/bash
# One-command update + run for Annotate
cd /opt/data/Annotate

echo "🔄 Pulling latest code..."
git pull origin main 2>&1

echo "📦 Installing dependencies (if needed)..."
npm install 2>&1 | tail -3

echo "🚀 Starting dev server..."
npm run dev -- --host 0.0.0.0
