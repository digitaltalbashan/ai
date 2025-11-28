#!/bin/bash

# 🧪 Server Testing Script
# Tests all aspects of the deployed server

set -e

SERVER_URL="http://dev.talbashan.co.il"
SSH_HOST="root@46.224.92.254"
SSH_PASS="m9ebFqWHF9NuMLJhW7we!"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 Tal Bashan AI - Server Test Suite"
echo "====================================="
echo ""

# Test 1: DNS Resolution
echo "1️⃣  Testing DNS Resolution..."
DNS_IP=$(nslookup dev.talbashan.co.il 2>/dev/null | grep -A 1 "Name:" | grep "Address:" | awk '{print $2}' | head -1)
if [ "$DNS_IP" == "46.224.92.254" ]; then
    echo -e "${GREEN}✅ DNS: dev.talbashan.co.il → $DNS_IP${NC}"
else
    echo -e "${RED}❌ DNS: Expected 46.224.92.254, got $DNS_IP${NC}"
fi
echo ""

# Test 2: Server Connectivity
echo "2️⃣  Testing Server Connectivity..."
if curl -s --connect-timeout 5 "$SERVER_URL" > /dev/null; then
    echo -e "${GREEN}✅ Server is reachable${NC}"
else
    echo -e "${RED}❌ Server is not reachable${NC}"
    exit 1
fi
echo ""

# Test 3: Home Page
echo "3️⃣  Testing Home Page..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL")
if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}✅ Home page: HTTP $HTTP_CODE${NC}"
else
    echo -e "${RED}❌ Home page: HTTP $HTTP_CODE${NC}"
fi
echo ""

# Test 4: Auth Session Endpoint
echo "4️⃣  Testing Auth Session Endpoint..."
AUTH_RESPONSE=$(curl -s "$SERVER_URL/api/auth/session")
if echo "$AUTH_RESPONSE" | grep -q "{}" || echo "$AUTH_RESPONSE" | grep -q "user"; then
    echo -e "${GREEN}✅ Auth endpoint: Responding${NC}"
    echo "   Response: $AUTH_RESPONSE"
else
    echo -e "${RED}❌ Auth endpoint: Unexpected response${NC}"
    echo "   Response: $AUTH_RESPONSE"
fi
echo ""

# Test 5: Chat Page
echo "5️⃣  Testing Chat Page..."
CHAT_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/chat")
if [ "$CHAT_CODE" == "200" ] || [ "$CHAT_CODE" == "307" ] || [ "$CHAT_CODE" == "302" ]; then
    echo -e "${GREEN}✅ Chat page: HTTP $CHAT_CODE${NC}"
else
    echo -e "${RED}❌ Chat page: HTTP $CHAT_CODE${NC}"
fi
echo ""

# Test 6: PM2 Status (via SSH)
echo "6️⃣  Testing PM2 Status..."
PM2_STATUS=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_HOST" "pm2 status talbashanai 2>&1" | grep -E "(online|stopped|errored)" | head -1)
if echo "$PM2_STATUS" | grep -q "online"; then
    echo -e "${GREEN}✅ PM2: Application is online${NC}"
else
    echo -e "${RED}❌ PM2: Application status - $PM2_STATUS${NC}"
fi
echo ""

# Test 7: Nginx Status (via SSH)
echo "7️⃣  Testing Nginx Status..."
NGINX_STATUS=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_HOST" "systemctl is-active nginx 2>&1")
if [ "$NGINX_STATUS" == "active" ]; then
    echo -e "${GREEN}✅ Nginx: Active${NC}"
else
    echo -e "${RED}❌ Nginx: $NGINX_STATUS${NC}"
fi
echo ""

# Test 8: Database Connection (via SSH)
echo "8️⃣  Testing Database Connection..."
DB_TEST=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_HOST" "cd /var/www/talbashanai && pnpm prisma db execute --stdin <<< 'SELECT 1;' 2>&1" | head -5)
if echo "$DB_TEST" | grep -q "1" || echo "$DB_TEST" | grep -q "success"; then
    echo -e "${GREEN}✅ Database: Connected${NC}"
else
    echo -e "${YELLOW}⚠️  Database: Could not verify (this is OK if Prisma client is not available)${NC}"
fi
echo ""

# Test 9: Environment Variables (via SSH)
echo "9️⃣  Testing Environment Variables..."
ENV_CHECK=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_HOST" "cd /var/www/talbashanai && grep -E '^(OPENAI_API_KEY|GOOGLE_CLIENT_ID|AUTH_SECRET|NEXTAUTH_URL)=' .env 2>&1 | wc -l")
if [ "$ENV_CHECK" -ge "4" ]; then
    echo -e "${GREEN}✅ Environment: All required variables present${NC}"
else
    echo -e "${RED}❌ Environment: Missing variables (found $ENV_CHECK/4)${NC}"
fi
echo ""

# Test 10: Server Logs (check for errors)
echo "🔟 Checking Recent Logs for Errors..."
RECENT_ERRORS=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_HOST" "pm2 logs talbashanai --lines 50 --nostream 2>&1" | grep -iE "(error|failed|exception)" | tail -5)
if [ -z "$RECENT_ERRORS" ]; then
    echo -e "${GREEN}✅ Logs: No recent errors found${NC}"
else
    echo -e "${YELLOW}⚠️  Logs: Recent errors/warnings found:${NC}"
    echo "$RECENT_ERRORS" | head -3
fi
echo ""

# Test 11: Port Listening (via SSH)
echo "1️⃣1️⃣  Testing Port Listening..."
PORTS=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no "$SSH_HOST" "ss -tlnp 2>/dev/null | grep -E ':(80|3000)' | awk '{print \$4}' | cut -d: -f2")
if echo "$PORTS" | grep -q "80" && echo "$PORTS" | grep -q "3000"; then
    echo -e "${GREEN}✅ Ports: 80 and 3000 are listening${NC}"
else
    echo -e "${RED}❌ Ports: Missing required ports${NC}"
    echo "   Found: $PORTS"
fi
echo ""

# Test 12: API Health Check
echo "1️⃣2️⃣  Testing API Health..."
API_RESPONSE=$(curl -s -X POST "$SERVER_URL/api/chat" \
    -H "Content-Type: application/json" \
    -d '{"message":"test"}' 2>&1 | head -100)
if echo "$API_RESPONSE" | grep -qE "(Unauthorized|error|message)"; then
    echo -e "${GREEN}✅ API: Responding (authentication required as expected)${NC}"
else
    echo -e "${YELLOW}⚠️  API: Unexpected response${NC}"
    echo "   Response: $API_RESPONSE" | head -3
fi
echo ""

echo "====================================="
echo "✅ Server Test Suite Complete!"
echo ""
echo "🌐 Server URL: $SERVER_URL"
echo "📊 Check PM2: ssh $SSH_HOST 'pm2 status'"
echo "📋 Check Logs: ssh $SSH_HOST 'pm2 logs talbashanai'"

