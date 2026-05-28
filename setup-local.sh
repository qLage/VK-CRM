#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "============================================"
echo "   CRM Local Setup for Mac"
echo "============================================"
echo ""

# 1. Ensure brew is in PATH
if ! command -v brew &> /dev/null; then
    echo "🔧 Adding Homebrew to PATH..."
    eval "$(/opt/homebrew/bin/brew shellenv zsh)" 2>/dev/null || true
fi

if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew not found. Install it first:"
    echo '   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
fi

# 2. Start PostgreSQL
echo "🐘 Starting PostgreSQL..."
brew services start postgresql > /dev/null 2>&1 || true

# Wait a moment
sleep 2

# 3. Create database
echo "🗄️  Creating database 'crm_db'..."
if ! psql -U "$(whoami)" -d postgres -c "SELECT 1 FROM pg_database WHERE datname='crm_db'" | grep -q 1; then
    createdb crm_db || true
    echo "✅ Database created"
else
    echo "✅ Database already exists"
fi

# 4. Update .env.development for local Mac usage
ENV_FILE="$DIR/.env.development"
if [ -f "$ENV_FILE" ]; then
    echo "🔧 Updating .env.development for local PostgreSQL..."
    
    # Backup original
    cp "$ENV_FILE" "$ENV_FILE.backup"
    
    # Update DATABASE_URL
    sed -i '' 's|^DATABASE_URL=.*|DATABASE_URL=postgresql://'"$(whoami)"'@localhost:5432/crm_db|' "$ENV_FILE"
    
    # Update individual DB vars
    sed -i '' 's|^DB_HOST=.*|DB_HOST=localhost|' "$ENV_FILE"
    sed -i '' 's|^DB_PORT=.*|DB_PORT=5432|' "$ENV_FILE"
    sed -i '' 's|^DB_NAME=.*|DB_NAME=crm_db|' "$ENV_FILE"
    sed -i '' 's|^DB_USER=.*|DB_USER='"$(whoami)"'|' "$ENV_FILE"
    sed -i '' 's|^DB_PASSWORD=.*|DB_PASSWORD=|' "$ENV_FILE"
    
    echo "✅ .env.development updated"
    echo "   (backup saved as .env.development.backup)"
else
    echo "❌ .env.development not found!"
    exit 1
fi

# 4.5 Copy updated .env.development to backend/.env
cp -f "$DIR/.env.development" "$DIR/backend/.env"

# 5. Install backend deps
echo ""
echo "📦 Installing backend dependencies..."
cd "$DIR/backend" && npm install

# 6. Run migrations
echo ""
echo "🔄 Running migrations..."
npx tsx src/db/migrate.js

echo ""
echo "============================================"
echo -e "\033[0;32m✅ Готово! Теперь запускай:\033[0m"
echo ""
echo "   cd $DIR"
echo "   ./start-local.sh"
echo ""
echo "============================================"
