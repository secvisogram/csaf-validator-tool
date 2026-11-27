# The static build server of the Compose deployment (service `app`).
# Built from this repository's source. Context: the repository root.
FROM node:24.22.3-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5 AS build
WORKDIR /src
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build
# The Compose-specific runtime config. It is not part of public/, so the
# GitHub Pages build never contains it.
COPY deploy/app/runtime-config.json dist/.well-known/appspecific/de.bsi.secvisogram.csaf-validator-tool.json

FROM nginx:1.30.8-alpine@sha256:6437a63b5c529f0e06162b3f593c0154cff6fa2ea0f94fd7c27928cb399e022d
COPY deploy/app/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
