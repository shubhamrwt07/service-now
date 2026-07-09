#!/bin/bash
# ============================================================
# NGINX SWITCH SCRIPT — Blue ↔ Green Traffic Switch
# ============================================================
# Ye script ek kaam karta hai: nginx ko batao ki traffic
# ab dusre environment pe jaaye — bina service restart ke!
#
# Kaise kaam karta hai:
# /etc/nginx/conf.d/active.conf ek SYMLINK hai (shortcut)
# Ye symlink ya blue.conf pe point karta hai ya green.conf pe
# Symlink change karo + nginx reload karo = zero downtime switch
#
# Usage:
#   ./nginx/switch.sh blue    ← Traffic Blue pe switch karo
#   ./nginx/switch.sh green   ← Traffic Green pe switch karo
#   ./nginx/switch.sh status  ← Kaunsa active hai dekho
# ============================================================

set -euo pipefail
# set -e  = koi bhi command fail ho toh script band ho
# set -u  = undefined variable use ho toh error do
# set -o pipefail = pipe mein koi bhi fail ho toh catch karo

# ---- Colors for output ----
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'  # No Color — reset

# ---- Paths ----
NGINX_CONF_DIR="/etc/nginx/conf.d"
ACTIVE_CONF="${NGINX_CONF_DIR}/active.conf"

# Script ke saath hi conf files ka path rakho (relative → absolute)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLUE_CONF="${SCRIPT_DIR}/blue.conf"
GREEN_CONF="${SCRIPT_DIR}/green.conf"

# ============================================================
# FUNCTION: Current active environment detect karo
# ============================================================
get_active_env() {
    if [ -L "${ACTIVE_CONF}" ]; then
        # Symlink exist karti hai — uska target dekho
        LINK_TARGET=$(readlink "${ACTIVE_CONF}")
        if echo "${LINK_TARGET}" | grep -q "blue"; then
            echo "blue"
        elif echo "${LINK_TARGET}" | grep -q "green"; then
            echo "green"
        else
            echo "unknown"
        fi
    else
        echo "none"  # Koi symlink nahi hai — first deploy
    fi
}

# ============================================================
# STATUS COMMAND
# ============================================================
if [ "${1:-}" == "status" ]; then
    CURRENT=$(get_active_env)
    echo -e "${YELLOW}Current Active Environment: ${NC}${CURRENT}"
    echo -e "${YELLOW}Symlink points to: ${NC}$(readlink ${ACTIVE_CONF} 2>/dev/null || echo 'not set')"
    exit 0
fi

# ============================================================
# VALIDATE ARGUMENT
# ============================================================
TARGET="${1:-}"  # First argument (blue ya green)

if [ "${TARGET}" != "blue" ] && [ "${TARGET}" != "green" ]; then
    echo -e "${RED}❌ Usage: $0 [blue|green|status]${NC}"
    exit 1
fi

CURRENT=$(get_active_env)

# Agar already wahi environment active hai toh skip karo
if [ "${CURRENT}" == "${TARGET}" ]; then
    echo -e "${YELLOW}⚠️  Already running on ${TARGET}. No switch needed.${NC}"
    exit 0
fi

# ============================================================
# SWITCH LOGIC
# ============================================================
echo -e "${BLUE}🔄 Switching traffic from ${CURRENT} → ${TARGET}...${NC}"

# Target conf file select karo
if [ "${TARGET}" == "blue" ]; then
    TARGET_CONF="${BLUE_CONF}"
else
    TARGET_CONF="${GREEN_CONF}"
fi

# Conf file exist kare check karo
if [ ! -f "${TARGET_CONF}" ]; then
    echo -e "${RED}❌ Config file not found: ${TARGET_CONF}${NC}"
    exit 1
fi

# -------------------------------------------------------
# SYMLINK UPDATE
# -------------------------------------------------------
# ln -sf = symbolic link force create karo
# -s = symbolic (shortcut)
# -f = force (purani symlink hogi toh replace karo)
# Ye ek atomic operation hai — nanosecond mein switch hota hai
ln -sf "${TARGET_CONF}" "${ACTIVE_CONF}"
echo -e "${GREEN}✅ Symlink updated: active.conf → ${TARGET}.conf${NC}"

# -------------------------------------------------------
# NGINX CONFIG TEST
# -------------------------------------------------------
# Switch se pehle nginx config test karo
# Agar config mein syntax error hai toh reload mat karo
echo -e "${BLUE}🔍 Testing nginx configuration...${NC}"
if nginx -t 2>/dev/null; then
    echo -e "${GREEN}✅ Nginx config is valid${NC}"
else
    # Config invalid hai — symlink wapas karo
    echo -e "${RED}❌ Nginx config test failed! Rolling back symlink...${NC}"
    if [ "${CURRENT}" == "blue" ]; then
        ln -sf "${BLUE_CONF}" "${ACTIVE_CONF}"
    else
        ln -sf "${GREEN_CONF}" "${ACTIVE_CONF}"
    fi
    exit 1
fi

# -------------------------------------------------------
# NGINX RELOAD — ZERO DOWNTIME!
# -------------------------------------------------------
# "nginx -s reload" ≠ nginx restart
# Reload = nginx master process nayi config load karta hai
#          aur naye worker processes spawn karta hai
#          purane workers apni ongoing requests finish karte hain phir band hote hain
# Result: Zero downtime — koi request drop nahi hoti!
echo -e "${BLUE}🔄 Reloading nginx (zero downtime)...${NC}"
nginx -s reload

echo ""
echo -e "${GREEN}🚀 Traffic successfully switched to ${TARGET} environment!${NC}"
echo -e "${YELLOW}   Previous: ${CURRENT}${NC}"
echo -e "${GREEN}   Current:  ${TARGET}${NC}"
echo ""
echo -e "${BLUE}ℹ️  Verify with: curl -I http://localhost | grep X-Deploy-Color${NC}"
