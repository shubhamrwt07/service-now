#!/bin/bash
# ============================================================
# DEPLOY SCRIPT — Blue-Green Deployment ka Brain
# ============================================================
# Ye script poora deployment orchestrate karta hai:
#
# STEP 1: Detect karo kaunsa environment LIVE hai (Blue ya Green)
# STEP 2: IDLE environment pe nayi image deploy karo
# STEP 3: Health check karo
# STEP 4: Traffic switch karo (Nginx symlink + reload)
# STEP 5: Old environment ko stop karo (ya rakho rollback ke liye)
#
# Usage:
#   ./deploy.sh                  ← Auto-detect aur deploy
#   ./deploy.sh --rollback       ← Previous environment pe wapas jao
#   ./deploy.sh --force-blue     ← Force Blue deploy
#   ./deploy.sh --force-green    ← Force Green deploy
# ============================================================

set -euo pipefail

# ---- Colors ----
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ============================================================
# CONFIGURATION
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_CONF_DIR="/etc/nginx/conf.d"
ACTIVE_CONF="${NGINX_CONF_DIR}/active.conf"
HEALTH_CHECK_SCRIPT="${SCRIPT_DIR}/health-check.sh"
SWITCH_SCRIPT="${SCRIPT_DIR}/nginx/switch.sh"

# Log file — deployment history track karo
LOG_FILE="${SCRIPT_DIR}/deploy.log"
DEPLOY_TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# ============================================================
# LOGGING FUNCTION
# ============================================================
log() {
    local message="$1"
    echo -e "${message}"
    # File mein bhi save karo (future reference ke liye)
    echo "[${DEPLOY_TIMESTAMP}] $(echo -e "${message}" | sed 's/\x1b\[[0-9;]*m//g')" >> "${LOG_FILE}"
}

# ============================================================
# ERROR HANDLER — Script fail hone pe kya karo
# ============================================================
cleanup_on_error() {
    local exit_code=$?
    log ""
    log "${RED}═══════════════════════════════════════${NC}"
    log "${RED}  💀 DEPLOYMENT FAILED! (exit: ${exit_code})${NC}"
    log "${RED}═══════════════════════════════════════${NC}"
    log "${RED}  Previous environment is still running safely.${NC}"
    log "${RED}  Check logs: ${LOG_FILE}${NC}"
    exit ${exit_code}
}

# trap = agar script mein koi bhi error aaye toh cleanup_on_error chalao
trap cleanup_on_error ERR

# ============================================================
# FUNCTION: Current active environment detect karo
# ============================================================
get_current_env() {
    if [ -L "${ACTIVE_CONF}" ]; then
        LINK_TARGET=$(readlink "${ACTIVE_CONF}")
        if echo "${LINK_TARGET}" | grep -q "blue"; then
            echo "blue"
        elif echo "${LINK_TARGET}" | grep -q "green"; then
            echo "green"
        else
            echo "none"
        fi
    else
        # Pehli baar deploy ho raha hai — koi active nahi
        echo "none"
    fi
}

# ============================================================
# BANNER
# ============================================================
echo ""
log "${CYAN}╔══════════════════════════════════════════╗${NC}"
log "${CYAN}║   🚀 Service-Now Blue-Green Deploy       ║${NC}"
log "${CYAN}║   Time: ${DEPLOY_TIMESTAMP}    ║${NC}"
log "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ============================================================
# PARSE ARGUMENTS
# ============================================================
FORCE_ENV=""
ROLLBACK=false

for arg in "$@"; do
    case $arg in
        --rollback)     ROLLBACK=true ;;
        --force-blue)   FORCE_ENV="blue" ;;
        --force-green)  FORCE_ENV="green" ;;
    esac
done

# ============================================================
# STEP 1: CURRENT ENVIRONMENT DETECT
# ============================================================
log "${YELLOW}[STEP 1] Detecting current environment...${NC}"
CURRENT_ENV=$(get_current_env)
log "         Current LIVE environment: ${CURRENT_ENV}"

# ---- ROLLBACK MODE ----
if [ "${ROLLBACK}" == "true" ]; then
    if [ "${CURRENT_ENV}" == "blue" ]; then
        TARGET_ENV="green"
    elif [ "${CURRENT_ENV}" == "green" ]; then
        TARGET_ENV="blue"
    else
        log "${RED}❌ Cannot rollback — no current environment detected${NC}"
        exit 1
    fi
    log "${YELLOW}⏪ ROLLBACK MODE: Switching from ${CURRENT_ENV} → ${TARGET_ENV}${NC}"
    
    # Rollback = sirf switch, koi deploy nahi
    bash "${SWITCH_SCRIPT}" "${TARGET_ENV}"
    log "${GREEN}✅ Rollback complete!${NC}"
    exit 0
fi

# ---- DETERMINE TARGET (IDLE) ENVIRONMENT ----
if [ -n "${FORCE_ENV}" ]; then
    TARGET_ENV="${FORCE_ENV}"
    log "         Force deploying to: ${TARGET_ENV}"
elif [ "${CURRENT_ENV}" == "blue" ]; then
    TARGET_ENV="green"    # Blue live hai → Green pe deploy karo
elif [ "${CURRENT_ENV}" == "green" ]; then
    TARGET_ENV="blue"     # Green live hai → Blue pe deploy karo
else
    TARGET_ENV="blue"     # First deploy — Blue se shuru karo
    log "         First deployment detected — starting with Blue"
fi

log "         Target (IDLE) environment: ${TARGET_ENV}"

# ============================================================
# STEP 2: IDLE ENVIRONMENT DEPLOY KARO
# ============================================================
log ""
log "${YELLOW}[STEP 2] Deploying to ${TARGET_ENV} environment...${NC}"

# Docker compose file select karo
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.${TARGET_ENV}.yml"

if [ ! -f "${COMPOSE_FILE}" ]; then
    log "${RED}❌ Compose file not found: ${COMPOSE_FILE}${NC}"
    exit 1
fi

log "         Using: docker-compose.${TARGET_ENV}.yml"
log ""

# Purani idle containers stop karo (agar chal rahi hain)
log "${BLUE}         Stopping existing ${TARGET_ENV} containers...${NC}"
docker compose -f "${COMPOSE_FILE}" down --remove-orphans 2>/dev/null || true
# "|| true" = agar containers nahi chal rahi toh bhi error mat do

# .env file copy karo (server pe actual secrets hain)
if [ -f "${SCRIPT_DIR}/backend/.env" ]; then
    log "${BLUE}         Backend .env found ✅${NC}"
else
    log "${RED}❌ backend/.env not found! Create it from .env.example${NC}"
    exit 1
fi

# Nayi images build karo aur containers start karo
log "${BLUE}         Building and starting ${TARGET_ENV} containers...${NC}"
log "         (This may take a few minutes for first build)"
log ""

# --build = har baar nayi image build karo (latest code)
# -d = detached mode (background mein run karo)
docker compose -f "${COMPOSE_FILE}" up -d --build

log ""
log "${GREEN}         Containers started! ✅${NC}"

# ============================================================
# STEP 3: HEALTH CHECK
# ============================================================
log ""
log "${YELLOW}[STEP 3] Running health checks on ${TARGET_ENV}...${NC}"

# Health check script ko executable permissions chahiye
chmod +x "${HEALTH_CHECK_SCRIPT}"

# Health check run karo — agar fail ho toh script exit karega (trap se)
if bash "${HEALTH_CHECK_SCRIPT}" "${TARGET_ENV}"; then
    log "${GREEN}         Health checks PASSED! ✅${NC}"
else
    log "${RED}         Health checks FAILED!${NC}"
    log "${RED}         Stopping ${TARGET_ENV} containers...${NC}"
    docker compose -f "${COMPOSE_FILE}" down
    log "${YELLOW}         ${CURRENT_ENV} is still serving traffic safely.${NC}"
    exit 1
fi

# ============================================================
# STEP 4: TRAFFIC SWITCH (ZERO DOWNTIME!)
# ============================================================
log ""
log "${YELLOW}[STEP 4] Switching traffic ${CURRENT_ENV} → ${TARGET_ENV}...${NC}"

chmod +x "${SWITCH_SCRIPT}"
bash "${SWITCH_SCRIPT}" "${TARGET_ENV}"

log "${GREEN}         Traffic switched! Users now on ${TARGET_ENV} ✅${NC}"

# ============================================================
# STEP 5: OLD ENVIRONMENT — KEEP FOR ROLLBACK
# ============================================================
log ""
log "${YELLOW}[STEP 5] Managing old ${CURRENT_ENV} environment...${NC}"

if [ "${CURRENT_ENV}" != "none" ]; then
    # Old environment ko BAND MAT KARO abhi
    # 5 minute baad rollback ka option dete hain
    log "${YELLOW}         Old ${CURRENT_ENV} containers are still running.${NC}"
    log "${YELLOW}         They will be available for rollback for 5 minutes.${NC}"
    log "${YELLOW}         To rollback: ./deploy.sh --rollback${NC}"
    
    # Background mein 5 minute baad old containers band karo
    # (nohup = terminal close hone pe bhi chale)
    OLD_COMPOSE="${SCRIPT_DIR}/docker-compose.${CURRENT_ENV}.yml"
    nohup bash -c "sleep 300 && docker compose -f '${OLD_COMPOSE}' stop backend-${CURRENT_ENV} frontend-${CURRENT_ENV} 2>/dev/null || true" \
        >> "${LOG_FILE}" 2>&1 &
    log "${YELLOW}         (Old containers will stop automatically in 5 mins)${NC}"
fi

# ============================================================
# DEPLOYMENT COMPLETE!
# ============================================================
echo ""
log "${GREEN}╔══════════════════════════════════════════╗${NC}"
log "${GREEN}║   ✅ DEPLOYMENT SUCCESSFUL!              ║${NC}"
log "${GREEN}║   Live Environment: ${TARGET_ENV}             ║${NC}"
log "${GREEN}║   Time: ${DEPLOY_TIMESTAMP}    ║${NC}"
log "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
log "${CYAN}ℹ️  Verify deployment:${NC}"
log "   curl -I http://localhost | grep X-Deploy-Color"
log "   curl http://localhost/health"
log ""
log "${CYAN}ℹ️  Rollback if needed:${NC}"
log "   ./deploy.sh --rollback"
echo ""
