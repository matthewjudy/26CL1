#!/bin/bash
# merge-upstream.sh — Pull Nate's latest updates into your fork safely
# Usage: ./merge-upstream.sh         (preview what's new)
#        ./merge-upstream.sh merge   (actually merge)

set -e
cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}Fetching latest from upstream (Natebreynolds/Clementine-AI-Assistant)...${RESET}"
git fetch upstream

BEHIND=$(git rev-list --count HEAD..upstream/main 2>/dev/null || echo 0)
AHEAD=$(git rev-list --count upstream/main..HEAD 2>/dev/null || echo 0)

if [ "$BEHIND" = "0" ]; then
    echo -e "${GREEN}You're already up to date with upstream.${RESET}"
    exit 0
fi

echo ""
echo -e "${CYAN}Status:${RESET}"
echo -e "  Your fork is ${YELLOW}${BEHIND} commits behind${RESET} upstream"
echo -e "  Your fork is ${GREEN}${AHEAD} commits ahead${RESET} (your customizations)"
echo ""
echo -e "${CYAN}What's new from upstream:${RESET}"
git log --oneline HEAD..upstream/main
echo ""

# Check for potential conflicts
CONFLICTING=$(git diff --name-only HEAD..upstream/main 2>/dev/null || true)
YOUR_CHANGES=$(git log --oneline --diff-filter=M upstream/main..HEAD --name-only --pretty=format: | sort -u | grep -v '^$' || true)

if [ -n "$YOUR_CHANGES" ] && [ -n "$CONFLICTING" ]; then
    OVERLAP=$(comm -12 <(echo "$CONFLICTING" | sort) <(echo "$YOUR_CHANGES" | sort) 2>/dev/null || true)
    if [ -n "$OVERLAP" ]; then
        echo -e "${YELLOW}These files were changed by both you and upstream (may need manual review):${RESET}"
        echo "$OVERLAP" | sed 's/^/  /'
        echo ""
    fi
fi

if [ "$1" != "merge" ]; then
    echo -e "Run ${CYAN}./merge-upstream.sh merge${RESET} to merge these changes into your fork."
    echo -e "If there are conflicts, you'll be able to resolve them before anything is finalized."
    exit 0
fi

# Actually merge
echo -e "${CYAN}Merging upstream changes...${RESET}"
echo ""

if git merge upstream/main --no-edit; then
    echo ""
    echo -e "${GREEN}Merge successful.${RESET}"
    echo ""
    echo -e "${CYAN}Rebuilding...${RESET}"
    npm install --loglevel=error --no-audit
    npm run build
    echo ""
    echo -e "${GREEN}Done. Your fork now has Nate's latest changes plus your customizations.${RESET}"
    echo -e "Run ${CYAN}git push${RESET} to update your GitHub fork."
else
    echo ""
    echo -e "${YELLOW}Merge has conflicts that need resolving.${RESET}"
    echo -e "Files with conflicts:"
    git diff --name-only --diff-filter=U | sed 's/^/  /'
    echo ""
    echo -e "Options:"
    echo -e "  1. Ask Claude to help resolve them"
    echo -e "  2. Run ${CYAN}git merge --abort${RESET} to undo and go back to how things were"
fi
