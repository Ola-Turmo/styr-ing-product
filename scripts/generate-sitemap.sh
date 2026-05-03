#!/bin/bash
# Generate sitemap.xml for styr.ing static site
# Run after: npm run build (dist/ exists)

SITE="https://styr.ing"
DIST="dist"
SITEMAP="$DIST/sitemap.xml"

cat > "$SITEMAP" << 'SITEMAPEOF'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
SITEMAPEOF

# Collect all HTML files
find "$DIST" -name "*.html" | while read f; do
    # Convert path to URL
    rel="${f#$DIST/}"
    rel="${rel%/index.html}"
    if [ "$rel" = "index.html" ]; then
        url="$SITE/"
    else
        url="$SITE/$rel"
    fi
    # Use file modification time as lastmod
    mod=$(date -r "$f" +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
    echo "  <url><loc>$url</loc><lastmod>$mod</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>" >> "$SITEMAP"
done

cat >> "$SITEMAP" << 'SITEMAPEOF'
</urlset>
SITEMAPEOF

echo "Generated $SITEMAP with $(grep -c '<url>' "$SITEMAP") URLs"
