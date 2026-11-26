FROM node:26-trixie-slim@sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5 AS build
RUN npm i -g pnpm@10.34.9
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm -r build \
 && pnpm --filter @todo/api deploy --legacy --prod /out \
 && rm -rf /out/src /out/test /out/tsconfig*.json /out/pnpm-lock.yaml

FROM gcr.io/distroless/nodejs26-debian13:nonroot@sha256:a84242e747fbb5aaaa0180c273b6f7130ca34b3300082192ef58eea96089eb3c
ARG SOURCE_REPO=""
ARG REVISION=""
LABEL org.opencontainers.image.source=$SOURCE_REPO \
      org.opencontainers.image.revision=$REVISION
WORKDIR /app
COPY --from=build --chown=65532:65532 /out /app
ENV NODE_ENV=production
CMD ["dist/main.js"]
