#!/bin/bash
# Migration script to update database to 3072 dimensions

set -e

echo "🚀 Migrating to text-embedding-3-large (3072 dimensions)"
echo "========================================================"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable not set"
    echo "   Set it in .env file or export it"
    exit 1
fi

echo "📊 Current state:"
echo "   Database: $(echo $DATABASE_URL | sed 's/:[^:]*@/:***@/')"
echo ""

# Ask for confirmation
read -p "⚠️  This will clear all existing embeddings. Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Migration cancelled"
    exit 1
fi

echo ""
echo "🔄 Running migration..."

# Remove ?schema= from DATABASE_URL for psql
DB_URL_CLEAN=$(echo $DATABASE_URL | sed 's/?schema=.*//')

# Run the SQL migration
psql "$DB_URL_CLEAN" -f scripts/update_to_3072_dimensions.sql

echo ""
echo "✅ Migration complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Run: pnpm prisma generate"
echo "   2. Add markdown files to ./data/md/"
echo "   3. Run: python scripts/index_markdown_rag.py"
echo ""

