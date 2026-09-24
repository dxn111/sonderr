---
id: docker-deploy
name: Docker and deployment
category: Engineering
icon: ⬢
triggers: docker, dockerfile, container, compose, kubernetes, deploy, deployment, image build, ci pipeline, production, hosting, dockerignore
summary: Containerize and deploy reproducibly — small images, pinned versions, health checks, verified builds.
---
## When to use
- Writing Dockerfiles/compose files, debugging builds, shipping a service to production, making deploys reproducible.

## Approach
A container is a contract: same image everywhere, environment outside the image, and the build must be verified by actually running it — never ship an untested Dockerfile.

## Steps
1. Pin versions (base image by digest or exact tag, dependency lockfiles); unpinned builds are unreproducible builds.
2. Layer for cache: copy manifests and install dependencies first, copy source last; multi-stage builds to keep runtime images small.
3. Run as a non-root user, declare EXPOSE, add a real HEALTHCHECK hitting an actual endpoint.
4. Externalize config via env vars; secrets never enter the image or the compose file — mount or inject them.
5. Verify: build the image, run it, hit the health endpoint, check logs for startup errors, then and only then declare it works.
6. Write .dockerignore (node_modules, .git, .env) and present the finished Dockerfile/compose file with present_file.

## Pitfalls
- Root user + latest base tag + secrets baked into layers; WORKDIR confusion from relative COPY paths.
- Testing with `docker build` only — a successful build proves nothing about runtime.

## Verify
- Build from a clean context, start the container, and exercise the documented health path.
- Confirm the runtime user is non-root and no secret or development-only file entered the image.
- Report the exact build/run command and any platform limitations.
