#!/bin/bash
# Database setup script

echo "🔧 Setting up PostgreSQL database..."

# Try to connect and create database
psql -h localhost -U $(whoami) -d postgres << 'SQL'
-- Create database if it doesn't exist
SELECT 'CREATE DATABASE talbashanai'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'talbashanai')\gexec

-- Connect to the new database
\c talbashanai

-- Create pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
SQL

if [ $? -eq 0 ]; then
    echo "✅ Database setup complete!"
else
    echo "⚠️  Could not set up database automatically"
    echo "   Please run manually:"
    echo "   psql -d postgres"
    echo "   CREATE DATABASE talbashanai;"
    echo "   \\c talbashanai"
    echo "   CREATE EXTENSION vector;"
fi
