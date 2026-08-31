# ONE·WAY — a 100% client-side Instagram export analyzer served as static files.
# There is no build step: the app is vanilla ES modules under public/.
# The image is just nginx + the static tree + our hardened config.
FROM nginx:1.27-alpine

# Drop the base image's stock welcome page and error page so that, before the
# app's own index.html is in place, "/" is a clean 404 rather than
# "Welcome to nginx!". The COPY below lays the real app over the top.
RUN rm -f /usr/share/nginx/html/index.html /usr/share/nginx/html/50x.html

# Static site. Contains index.html, favicon.svg, theme-init.js, robots.txt,
# styles/*.css, assets/fonts/*.woff2, src/**/*.js, src/fixtures/*, src/tests/*.
COPY public/ /usr/share/nginx/html/

# Our server config: correct JS MIME for ES modules, hash-router fallback,
# short cache TTLs (no content hashing), gzip, and the security headers whose
# `connect-src 'none'` is the load-bearing privacy guarantee.
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# nginx:alpine's default CMD already runs nginx in the foreground.
