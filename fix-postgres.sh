#!/bin/bash
set -e

echo "🔧 Fixing PostgreSQL..."

# Ensure brew is in PATH
if ! command -v brew &> /dev/null; then
    eval "$(/opt/homebrew/bin/brew shellenv zsh)" 2>/dev/null || true
fi

# Find PostgreSQL data directory
PG_DATA=""
for path in /opt/homebrew/var/postgres /opt/homebrew/var/postgresql@16 /opt/homebrew/var/postgresql@15 /opt/homebrew/var/postgresql@14; do
    if [ -d "$path" ]; then
        PG_DATA="$path"
        break
    fi
done

# If no data dir found, initialize it
if [ -z "$PG_DATA" ]; then
    echo "📁 Initializing PostgreSQL data directory..."
    PG_DATA="/opt/homebrew/var/postgres"
    initdb -D "$PG_DATA" --locale=C -E UTF-8
fi

echo "📂 Found PGDATA: $PG_DATA"

# Start PostgreSQL
echo "🚀 Starting PostgreSQL..."
pg_ctl -D "$PG_DATA" start -l "$PG_DATA/logfile" -w || true

# Wait
sleep 2

# Check connection
echo "🔌 Testing connection..."
if psql -U "$(whoami)" -d postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "✅ PostgreSQL is running!"
    
    # Create database
    if ! psql -U "$(whoami)" -d postgres -c "SELECT 1 FROM pg_database WHERE datname='crm_db'" | grep -q 1; then
        createdb crm_db
        echo "✅ Database 'crm_db' created"
    else
        echo "✅ Database 'crm_db' already exists"
    fi
else
    echo "❌ PostgreSQL is still not running. Trying brew services..."
    brew services start postgresql
    sleep 3
    
    if psql -U "$(whoami)" -d postgres -c "SELECT 1" > /dev/null 2>&1; then
        echo "✅ PostgreSQL started via brew services!"
        createdb crm_db 2>/dev/null || true
    else
        echo "❌ Failed to start PostgreSQL. Check:"
        echo "   pg_ctl -D $PG_DATA status"
        exit 1
    fi
fi
