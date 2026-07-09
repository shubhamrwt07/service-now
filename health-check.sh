#!/bin/bash
# ============================================================
# HEALTH CHECK SCRIPT
# ============================================================
# Ye script deploy.sh ke baad aur nginx switch se PEHLE chalta hai
# Kaam:
#   1. Nayi deploy environment ka backend health check karo
#   2. Retry logic — immediately fail mat karo, kuch time do
#   3. Pass hone pe deploy.sh aage badhega
#   4. Fail hone pe deploy.sh rollback karega
#
# Usage:
#   ./health-check.sh blue    ← Blue environment check karo
#   ./health-check.sh green   ← Green environment check karo
# ============================================================

set -euo pipefail

# ---- Colors ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ============================================================
# CONFIGURATION
# ============================================================
TARGET="${1:-}"       # blue ya green

# Environment ke hisaab se port decide karo
if [ "${TARGET}" == "blue" ]; then
    BACKEND_PORT="5001"
    FRONTEND_PORT="3001"
elif [ "${TARGET}" == "green" ]; then
    BACKEND_PORT="5002"
    FRONTEND_PORT="3002"
else
    echo -e "${RED}❌ Usage: $0 [blue|green]${NC}"
    exit 1
fi

BACKEND_URL="http://localhost:${BACKEND_PORT}/health"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"

# -------------------------------------------------------
# Retry settings
# -------------------------------------------------------
MAX_RETRIES=12       # Kitni baar try karo
RETRY_INTERVAL=10    # Har try ke beech kitne second wait karo
# Total wait = 12 * 10 = 120 seconds (2 minutes)
# App ko start hone mein itna time lagta hai

# ============================================================
# FUNCTION: HTTP health check karo with retry
# ============================================================
wait_for_healthy() {
    local url="$1"
    local service_name="$2"
    local attempt=1

    echo -e "${YELLOW}⏳ Waiting for ${service_name} to be healthy...${NC}"
    echo -e "   URL: ${url}"

    while [ ${attempt} -le ${MAX_RETRIES} ]; do
        echo -ne "   Attempt ${attempt}/${MAX_RETRIES}... "

        # curl se HTTP request karo
        # -s = silent (no progress bar)
        # -o /dev/null = response body discard karo
        # -w "%{http_code}" = sirf HTTP status code return karo
        # --connect-timeout 5 = 5 second mein connect nahi hua toh fail
        # --max-time 10 = 10 second mein response nahi aaya toh fail
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
            --connect-timeout 5 \
            --max-time 10 \
            "${url}" 2>/dev/null || echo "000")

        if [ "${HTTP_STATUS}" == "200" ]; then
            echo -e "${GREEN}✅ Healthy! (HTTP ${HTTP_STATUS})${NC}"
            return 0    # Success — function se exit karo
        else
            echo -e "${RED}❌ Not ready (HTTP ${HTTP_STATUS})${NC}"
        fi

        # Last attempt ke baad wait mat karo
        if [ ${attempt} -lt ${MAX_RETRIES} ]; then
            echo -e "   Retrying in ${RETRY_INTERVAL} seconds..."
            sleep ${RETRY_INTERVAL}
        fi

        attempt=$((attempt + 1))
    done

    # Saare retries exhaust ho gaye — fail
    echo -e "${RED}💀 ${service_name} failed to become healthy after ${MAX_RETRIES} attempts!${NC}"
    return 1
}

# ============================================================
# MAIN HEALTH CHECKS
# ============================================================
echo ""
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  Health Check: ${TARGET} Environment${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo ""

# ---- Backend Health Check ----
echo -e "${YELLOW}[1/2] Backend Check${NC}"
if wait_for_healthy "${BACKEND_URL}" "Backend (${TARGET})"; then
    echo ""
else
    echo ""
    echo -e "${RED}❌ HEALTH CHECK FAILED — Backend is not healthy!${NC}"
    echo -e "${RED}   Deployment will be aborted.${NC}"
    exit 1
fi

# ---- Frontend Health Check ----
echo -e "${YELLOW}[2/2] Frontend Check${NC}"
if wait_for_healthy "${FRONTEND_URL}" "Frontend (${TARGET})"; then
    echo ""
else
    echo ""
    echo -e "${RED}❌ HEALTH CHECK FAILED — Frontend is not healthy!${NC}"
    echo -e "${RED}   Deployment will be aborted.${NC}"
    exit 1
fi

# ============================================================
# ALL CHECKS PASSED!
# ============================================================
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ All health checks PASSED!${NC}"
echo -e "${GREEN}  ${TARGET} environment is ready for traffic!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
exit 0
