#!/bin/bash

# 🚀 Tal Bashan AI - Deployment Script
# This script automates the deployment process to a server

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SERVER_USER="${DEPLOY_USER:-root}"
SERVER_HOST="${DEPLOY_HOST:-}"
PROJECT_DIR="${DEPLOY_DIR:-/var/www/talbashanai}"
BRANCH="${DEPLOY_BRANCH:-main}"

# Functions
log_info() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

check_requirements() {
    log_info "Checking local requirements..."
    
    if ! command -v ssh &> /dev/null; then
        log_error "SSH is not installed"
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed"
        exit 1
    fi
    
    log_info "Local requirements OK"
}

check_server_connection() {
    log_info "Checking server connection..."
    
    if [ -z "$SERVER_HOST" ]; then
        log_error "SERVER_HOST is not set. Set DEPLOY_HOST environment variable."
        exit 1
    fi
    
    if ! ssh -o ConnectTimeout=5 "$SERVER_USER@$SERVER_HOST" "echo 'Connection OK'" &> /dev/null; then
        log_error "Cannot connect to server $SERVER_USER@$SERVER_HOST"
        log_warn "Make sure you have SSH access and key-based authentication set up"
        exit 1
    fi
    
    log_info "Server connection OK"
}

install_server_dependencies() {
    log_info "Installing server dependencies..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << 'ENDSSH'
        set -e
        
        # Update system
        apt update -qq
        
        # Install Node.js if not installed
        if ! command -v node &> /dev/null; then
            echo "Installing Node.js..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            apt-get install -y nodejs
        fi
        
        # Install pnpm if not installed
        if ! command -v pnpm &> /dev/null; then
            echo "Installing pnpm..."
            npm install -g pnpm
        fi
        
        # Install PostgreSQL if not installed
        if ! command -v psql &> /dev/null; then
            echo "Installing PostgreSQL..."
            apt install -y postgresql postgresql-contrib
        fi
        
        # Install Python if not installed
        if ! command -v python3 &> /dev/null; then
            echo "Installing Python..."
            apt install -y python3 python3-pip python3-venv
        fi
        
        # Install PM2 if not installed
        if ! command -v pm2 &> /dev/null; then
            echo "Installing PM2..."
            npm install -g pm2
        fi
        
        echo "Dependencies installed successfully"
ENDSSH
    
    log_info "Server dependencies installed"
}

setup_project_directory() {
    log_info "Setting up project directory..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << ENDSSH
        set -e
        
        # Create directory if it doesn't exist
        mkdir -p $PROJECT_DIR
        
        # If directory exists and has .git, pull updates
        if [ -d "$PROJECT_DIR/.git" ]; then
            echo "Repository exists, pulling updates..."
            cd $PROJECT_DIR
            git fetch origin
            git checkout $BRANCH
            git pull origin $BRANCH
        else
            echo "Cloning repository..."
            cd $(dirname $PROJECT_DIR)
            git clone https://github.com/digitaltalbashan/ai.git $(basename $PROJECT_DIR)
            cd $PROJECT_DIR
            git checkout $BRANCH
        fi
ENDSSH
    
    log_info "Project directory ready"
}

install_project_dependencies() {
    log_info "Installing project dependencies..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << 'ENDSSH'
        set -e
        cd $PROJECT_DIR
        
        echo "Installing Node.js dependencies..."
        pnpm install --frozen-lockfile
        
        echo "Setting up Python virtual environment..."
        if [ ! -d "venv" ]; then
            python3 -m venv venv
        fi
        source venv/bin/activate
        pip install --upgrade pip
        # Install Python dependencies if requirements.txt exists
        if [ -f "requirements.txt" ]; then
            pip install -r requirements.txt
        fi
ENDSSH
    
    log_info "Project dependencies installed"
}

build_project() {
    log_info "Building project..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << 'ENDSSH'
        set -e
        cd $PROJECT_DIR
        
        echo "Generating Prisma client..."
        pnpm db:generate
        
        echo "Building Next.js application..."
        pnpm build
ENDSSH
    
    log_info "Project built successfully"
}

setup_environment() {
    log_warn "Environment setup required!"
    log_warn "Please create .env file on server manually:"
    echo ""
    echo "  ssh $SERVER_USER@$SERVER_HOST"
    echo "  cd $PROJECT_DIR"
    echo "  nano .env"
    echo ""
    echo "See DEPLOYMENT.md for required environment variables"
    echo ""
    read -p "Press Enter after you've set up .env file..."
}

run_migrations() {
    log_info "Running database migrations..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << 'ENDSSH'
        set -e
        cd $PROJECT_DIR
        
        echo "Running Prisma migrations..."
        pnpm prisma migrate deploy || pnpm prisma db push
ENDSSH
    
    log_info "Migrations completed"
}

start_application() {
    log_info "Starting application..."
    
    ssh "$SERVER_USER@$SERVER_HOST" << 'ENDSSH'
        set -e
        cd $PROJECT_DIR
        
        # Stop existing PM2 process if running
        pm2 stop talbashanai 2>/dev/null || true
        pm2 delete talbashanai 2>/dev/null || true
        
        # Start with PM2
        pm2 start npm --name "talbashanai" -- start
        pm2 save
        
        echo "Application started with PM2"
ENDSSH
    
    log_info "Application started"
}

show_status() {
    log_info "Deployment Status:"
    
    ssh "$SERVER_USER@$SERVER_HOST" << 'ENDSSH'
        echo ""
        echo "=== PM2 Status ==="
        pm2 status talbashanai || echo "PM2 process not found"
        
        echo ""
        echo "=== Application Logs (last 20 lines) ==="
        pm2 logs talbashanai --lines 20 --nostream || echo "No logs available"
        
        echo ""
        echo "=== Server Info ==="
        echo "Node.js: $(node --version)"
        echo "pnpm: $(pnpm --version)"
        echo "Python: $(python3 --version)"
        echo "PostgreSQL: $(psql --version 2>/dev/null || echo 'Not found')"
ENDSSH
}

# Main deployment flow
main() {
    echo ""
    echo "🚀 Tal Bashan AI - Deployment Script"
    echo "====================================="
    echo ""
    
    check_requirements
    check_server_connection
    
    echo ""
    read -p "Continue with deployment? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warn "Deployment cancelled"
        exit 0
    fi
    
    install_server_dependencies
    setup_project_directory
    install_project_dependencies
    setup_environment
    run_migrations
    build_project
    start_application
    
    echo ""
    log_info "Deployment completed!"
    echo ""
    show_status
    echo ""
    log_info "Application should be running at: http://$SERVER_HOST:3000"
    echo ""
}

# Run main function
main

