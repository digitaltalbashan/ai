# 🚀 מדריך העלאה לשרת (Deployment Guide)

## דרישות מערכת

### תוכנות נדרשות:
- **Node.js** 18+ (LTS מומלץ)
- **pnpm** (package manager)
- **PostgreSQL** 14+ עם pgvector extension
- **Python** 3.9+ (עבור RAG retrieval)
- **Git** (להעתקת הקוד)
- **PM2** (process manager - אופציונלי)

### משאבי מערכת מומלצים:
- **RAM**: מינימום 2GB, מומלץ 4GB+
- **CPU**: 2 cores+
- **דיסק**: 10GB+ (תלוי בגודל ה-knowledge base)
- **OS**: Ubuntu 20.04+ / Debian 11+ / CentOS 8+

## שלב 1: הכנת השרת

### התחברות לשרת:
```bash
ssh root@YOUR_SERVER_IP
# או
ssh user@YOUR_SERVER_IP
```

### עדכון המערכת:
```bash
# Ubuntu/Debian
apt update && apt upgrade -y

# CentOS/RHEL
yum update -y
```

## שלב 2: התקנת תוכנות נדרשות

### התקנת Node.js ו-pnpm:
```bash
# התקנת Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# התקנת pnpm
npm install -g pnpm
```

### התקנת PostgreSQL עם pgvector:
```bash
# התקנת PostgreSQL
apt install -y postgresql postgresql-contrib

# התקנת pgvector
apt install -y postgresql-14-pgvector
# או עבור PostgreSQL 15:
# apt install -y postgresql-15-pgvector

# הפעלת PostgreSQL
systemctl start postgresql
systemctl enable postgresql
```

### התקנת Python ו-dependencies:
```bash
# התקנת Python 3.9+
apt install -y python3 python3-pip python3-venv

# התקנת dependencies ל-Python RAG
pip3 install sentence-transformers torch crossencoder
```

### התקנת PM2 (אופציונלי):
```bash
npm install -g pm2
```

## שלב 3: הגדרת מסד הנתונים

```bash
# התחברות ל-PostgreSQL
sudo -u postgres psql

# בתוך psql:
CREATE DATABASE talbashanai;
CREATE USER talbashanai_user WITH PASSWORD 'YOUR_SECURE_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE talbashanai TO talbashanai_user;
\c talbashanai
CREATE EXTENSION IF NOT EXISTS vector;
\q
```

## שלב 4: העתקת הקוד לשרת

### אפשרות 1: Clone מ-GitHub (מומלץ):
```bash
cd /var/www  # או כל directory אחר
git clone https://github.com/digitaltalbashan/ai.git talbashanai
cd talbashanai
```

### אפשרות 2: העתקה דרך SCP:
```bash
# מהמחשב המקומי:
scp -r /Users/tzahimoyal/TalBashanAI/* user@SERVER_IP:/var/www/talbashanai/
```

## שלב 5: הגדרת משתני סביבה

```bash
cd /var/www/talbashanai  # או הנתיב שלך
cp .env.example .env  # אם יש
nano .env  # או vi/vim
```

הוסף את המשתנים הבאים ל-`.env`:
```env
# Database
DATABASE_URL="postgresql://talbashanai_user:YOUR_SECURE_PASSWORD@localhost:5432/talbashanai?schema=public"

# OpenAI
OPENAI_API_KEY="your-openai-api-key"
OPENAI_MODEL="gpt-4o-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
USE_OPENAI="true"

# NextAuth
AUTH_SECRET="GENERATE_WITH: openssl rand -base64 32"
AUTH_URL="https://yourdomain.com"  # או http://YOUR_SERVER_IP:3000

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Production
NODE_ENV="production"
```

**חשוב:** החלף את כל הערכים ב-placeholders!

## שלב 6: התקנת Dependencies

```bash
# Node.js dependencies
pnpm install

# Python virtual environment (אם נדרש)
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt  # אם יש
```

## שלב 7: הגדרת מסד הנתונים

```bash
# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm prisma migrate deploy
# או
pnpm prisma db push
```

## שלב 8: בניית הפרויקט

```bash
# Build for production
pnpm build
```

## שלב 9: הפעלת השרת

### אפשרות 1: עם PM2 (מומלץ לפרודקשן):
```bash
# Start with PM2
pm2 start npm --name "talbashanai" -- start

# או עם config file
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save
pm2 startup  # Follow instructions
```

### אפשרות 2: עם systemd:
```bash
# Create service file
sudo nano /etc/systemd/system/talbashanai.service
```

הוסף:
```ini
[Unit]
Description=Tal Bashan AI Application
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/talbashanai
Environment=NODE_ENV=production
ExecStart=/usr/bin/pnpm start
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
systemctl enable talbashanai
systemctl start talbashanai
systemctl status talbashanai
```

### אפשרות 3: ישירות (לבדיקות):
```bash
pnpm start
```

## שלב 10: הגדרת Nginx (אופציונלי)

אם אתה רוצה reverse proxy עם SSL:

```bash
apt install -y nginx certbot python3-certbot-nginx
```

```bash
sudo nano /etc/nginx/sites-available/talbashanai
```

הוסף:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
ln -s /etc/nginx/sites-available/talbashanai /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# SSL עם Let's Encrypt
certbot --nginx -d yourdomain.com
```

## בדיקות

### בדיקת שהשרת רץ:
```bash
curl http://localhost:3000
```

### בדיקת logs:
```bash
# PM2
pm2 logs talbashanai

# systemd
journalctl -u talbashanai -f

# ישירות
tail -f /var/www/talbashanai/.next/trace
```

## עדכונים עתידיים

```bash
cd /var/www/talbashanai
git pull
pnpm install
pnpm build
pm2 restart talbashanai  # או systemctl restart talbashanai
```

## פתרון בעיות

### השרת לא מתחיל:
```bash
# בדוק logs
pm2 logs talbashanai
# או
journalctl -u talbashanai -n 50

# בדוק משתני סביבה
cat .env

# בדוק database connection
psql $DATABASE_URL -c "SELECT 1"
```

### שגיאת pgvector:
```bash
sudo -u postgres psql talbashanai -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### בעיות זכויות:
```bash
chown -R www-data:www-data /var/www/talbashanai
chmod -R 755 /var/www/talbashanai
```

## אבטחה

1. **Firewall**: פתח רק את הפורטים הנדרשים
   ```bash
   ufw allow 22/tcp   # SSH
   ufw allow 80/tcp   # HTTP
   ufw allow 443/tcp  # HTTPS
   ufw enable
   ```

2. **Fail2ban**: הגנה מפני brute force
   ```bash
   apt install -y fail2ban
   ```

3. **עדכונים**: שמור על המערכת מעודכנת
   ```bash
   apt update && apt upgrade -y
   ```

