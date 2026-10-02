# ---- Stage 1: build the React app ----
# "AS build" names this stage so we can reference it later in Stage 2
FROM node:20-alpine AS build

WORKDIR /app

# Same caching trick as the backend: copy just the dependency manifest
# first, install, THEN copy the rest of the source. Docker only re-runs
# npm install when package.json actually changes, not on every code edit.
COPY package.json package-lock.json ./
RUN npm install

# Now copy the actual source code and build it
COPY . .
RUN npm run build
# This produces a /app/dist folder full of plain HTML/CSS/JS —
# no React, no Node needed to serve these, they're just static files

# ---- Stage 2: serve the built files with nginx ----
FROM nginx:alpine

# Copy ONLY the built static files from Stage 1 into nginx's default
# folder for serving web content. Everything else from Stage 1
# (node_modules, source .jsx files, Node itself) gets left behind —
# it never makes it into this final image.
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
# nginx starts automatically as the container's main process —
# no CMD needed here, the base nginx image already defines that