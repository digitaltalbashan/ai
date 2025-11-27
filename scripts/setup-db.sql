-- Setup script for PostgreSQL database with pgvector
-- Run this before running Prisma migrations

-- Create database (if it doesn't exist)
-- Note: You may need to run this manually:
-- CREATE DATABASE talbashanai;

-- Connect to the database and enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Note: After running this, you can run:
-- pnpm db:generate
-- pnpm db:migrate

