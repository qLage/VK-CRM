#!/bin/bash

# ============================================================================
# Quick Start Script for Database Performance Optimization
# ============================================================================
# This script applies all performance optimizations in the correct order
#
# Usage:
#   ./apply_optimizations.sh [--skip-backup] [--skip-indexes] [--skip-views]
#
# Options:
#   --skip-backup    Skip database backup (not recommended)
#   --skip-indexes   Skip index creation
#   --skip-views     Skip materialized view creation
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
SKIP_BACKUP=false
SKIP_INDEXES=false
SKIP_VIEWS=false

for arg in "$@"; do
    case $arg in
        --skip-backup)
            SKIP_BACKUP=true
            ;;
        --skip-indexes)
            SKIP_INDEXES=true
            ;;
        --skip-views)
            SKIP_VIEWS=true
            ;;
    esac
done

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}❌ ERROR: DATABASE_URL environment variable is not set${NC}"
    echo "Please set DATABASE_URL and try again"
    exit 1
fi

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}CRM Database Performance Optimization${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# Step 1: Backup
if [ "$SKIP_BACKUP" = false ]; then
    echo -e "${YELLOW}📦 Step 1: Creating database backup...${NC}"
    BACKUP_FILE="crm_backup_$(date +%Y%m%d_%H%M%S).sql"

    if pg_dump "$DATABASE_URL" > "$BACKUP_FILE"; then
        echo -e "${GREEN}✅ Backup created: $BACKUP_FILE${NC}"
        echo -e "${GREEN}   Size: $(du -h "$BACKUP_FILE" | cut -f1)${NC}"
    else
        echo -e "${RED}❌ Backup failed!${NC}"
        echo "Continue anyway? (y/N)"
        read -r response
        if [[ ! "$response" =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    echo -e "${YELLOW}⚠️  Skipping backup (--skip-backup flag)${NC}"
fi

echo ""

# Step 2: Apply Indexes
if [ "$SKIP_INDEXES" = false ]; then
    echo -e "${YELLOW}🔧 Step 2: Creating performance indexes...${NC}"
    echo "This may take 2-5 minutes depending on data volume..."

    if psql "$DATABASE_URL" -f backend/src/db/performance_optimization.sql; then
        echo -e "${GREEN}✅ Indexes created successfully${NC}"
    else
        echo -e "${RED}❌ Index creation failed!${NC}"
        echo "Check the error above and fix before continuing"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Skipping index creation (--skip-indexes flag)${NC}"
fi

echo ""

# Step 3: Create Materialized Views
if [ "$SKIP_VIEWS" = false ]; then
    echo -e "${YELLOW}📊 Step 3: Creating materialized views...${NC}"

    if psql "$DATABASE_URL" -f backend/src/db/materialized_views.sql; then
        echo -e "${GREEN}✅ Materialized views created${NC}"
    else
        echo -e "${RED}❌ Materialized view creation failed!${NC}"
        echo "Check the error above and fix before continuing"
        exit 1
    fi

    echo ""
    echo -e "${YELLOW}🔄 Populating materialized views...${NC}"
    echo "This may take 1-3 minutes..."

    if psql "$DATABASE_URL" -c "SELECT refresh_all_mv();"; then
        echo -e "${GREEN}✅ Materialized views populated${NC}"
    else
        echo -e "${RED}❌ Initial population failed!${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  Skipping materialized view creation (--skip-views flag)${NC}"
fi

echo ""

# Step 4: Verify Installation
echo -e "${YELLOW}🔍 Step 4: Verifying installation...${NC}"

# Check indexes
INDEX_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_deal_table%';")
echo -e "   Indexes created: ${GREEN}$INDEX_COUNT${NC}"

# Check materialized views
if [ "$SKIP_VIEWS" = false ]; then
    MV_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_matviews WHERE schemaname = 'public' AND matviewname LIKE 'mv_%';")
    echo -e "   Materialized views: ${GREEN}$MV_COUNT${NC}"
fi

echo ""

# Step 5: Performance Test
echo -e "${YELLOW}⚡ Step 5: Running performance test...${NC}"

# Test query before optimization would have taken 200-500ms
# After optimization should be 10-30ms
TEST_QUERY="SELECT COUNT(*), SUM(commission_total_fact) FROM deal_table_rows WHERE year = EXTRACT(YEAR FROM CURRENT_DATE) AND month = EXTRACT(MONTH FROM CURRENT_DATE);"

echo "Running test query..."
START_TIME=$(date +%s%N)
psql "$DATABASE_URL" -c "$TEST_QUERY" > /dev/null
END_TIME=$(date +%s%N)
DURATION=$(( (END_TIME - START_TIME) / 1000000 ))

echo -e "   Query time: ${GREEN}${DURATION}ms${NC}"

if [ $DURATION -lt 50 ]; then
    echo -e "${GREEN}   ✅ Excellent performance!${NC}"
elif [ $DURATION -lt 100 ]; then
    echo -e "${GREEN}   ✅ Good performance${NC}"
else
    echo -e "${YELLOW}   ⚠️  Performance could be better. Check index usage.${NC}"
fi

echo ""
echo -e "${BLUE}============================================================================${NC}"
echo -e "${GREEN}✅ Optimization Complete!${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo "Next steps:"
echo "1. Monitor query performance for 24-48 hours"
echo "2. Set up automated materialized view refresh (see IMPLEMENTATION_GUIDE.md)"
echo "3. Update application code to use optimized queries"
echo "4. Review monitoring dashboard at /api/admin/performance"
echo ""
echo "Backup file: $BACKUP_FILE"
echo "Keep this backup for at least 7 days"
echo ""
echo -e "${GREEN}Happy optimizing! 🚀${NC}"
