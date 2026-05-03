#!/bin/bash
# GEO Health Check for styr.ing
# Verifies all GEO files are accessible and valid

SITE="${1:-https://styr.ing}"
FAILS=0

check() {
    local label="$1" url="$2" expected_code="${3:-200}"
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    if [ "$code" = "$expected_code" ]; then
        echo "  ✓ $label ($code)"
    else
        echo "  ✗ $label FAILED (got $code, expected $expected_code)"
        FAILS=$((FAILS + 1))
    fi
}

echo "GEO Health Check: $SITE"
echo "========================"
echo ""
echo "Core Files:"
check "llms.txt"        "$SITE/llms.txt"
check "llms-full.txt"   "$SITE/llms-full.txt"
check "robots.txt"      "$SITE/robots.txt"
check "humans.txt"      "$SITE/humans.txt"
check "sitemap.xml"     "$SITE/sitemap.xml"
echo ""
echo "Pages:"
for page in / /board/ /compliance/ /internkontroll/ /login/ /signup/ /admin/; do
    check "$page" "$SITE$page"
done
echo ""
echo "Structured Data:"
ld_json=$(curl -s "$SITE" | grep -c 'application/ld+json')
if [ "$ld_json" -ge 4 ]; then
    echo "  ✓ JSON-LD blocks: $ld_json (≥4 required)"
else
    echo "  ✗ JSON-LD blocks: $ld_json (<4, missing schemas)"
    FAILS=$((FAILS + 1))
fi
echo ""
echo "Semantic HTML:"
for el in '<header' '<main' '<footer' 'aria-label'; do
    count=$(curl -s "$SITE" | grep -c "$el")
    if [ "$count" -gt 0 ]; then
        echo "  ✓ $el present"
    else
        echo "  ✗ $el missing"
        FAILS=$((FAILS + 1))
    fi
done
echo ""
echo "AI Crawler Access:"
for bot in GPTBot ClaudeBot PerplexityBot Google-Extended; do
    if curl -s "$SITE/robots.txt" | grep -q "$bot.*Allow"; then
        echo "  ✓ $bot allowed"
    else
        echo "  ✗ $bot NOT allowed"
        FAILS=$((FAILS + 1))
    fi
done
echo ""
echo "Open Graph:"
for tag in 'og:title' 'og:description' 'og:type' 'og:site_name'; do
    if curl -s "$SITE" | grep -q "property="$tag""; then
        echo "  ✓ $tag present"
    else
        echo "  ✗ $tag missing"
        FAILS=$((FAILS + 1))
    fi
done
echo ""
echo "========================"
if [ "$FAILS" -eq 0 ]; then
    echo "✓ All GEO checks passed"
    exit 0
else
    echo "✗ $FAILS check(s) failed"
    exit 1
fi
