#!/bin/bash
# Setup script for markdown RAG indexing system

set -e

echo "🚀 Setting up Markdown RAG Indexing System"
echo "=========================================="
echo ""

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed"
    exit 1
fi

echo "✅ Python 3 found: $(python3 --version)"
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
else
    echo "✅ Virtual environment already exists"
fi

echo ""
echo "📦 Installing Python dependencies..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements-rag.txt

echo ""
echo "✅ Dependencies installed"
echo ""
echo "📋 Next steps:"
echo "   1. Make sure DATABASE_URL is set in .env"
echo "   2. Make sure OPENAI_API_KEY is set in .env"
echo "   3. Add markdown files to ./data/md/"
echo "   4. Run: python scripts/index_markdown_rag.py"
echo ""

