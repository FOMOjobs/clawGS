# CI/CD Setup for GitHub Actions

The repository has been configured with a fully automated CI/CD pipeline in `.github/workflows/ci-cd.yml`.

## Pipeline Overview
1. **Test Phase**: Runs on every push and pull request to `main`. It installs Python dependencies and runs `pytest` integration tests.
2. **Build & Push Phase**: Runs only on pushes to `main`. Builds the `backend` and `frontend` Docker images and pushes them to GitHub Container Registry (`ghcr.io`).
3. **Deploy Phase**: Connects to your server via SSH, copies the `docker-compose.prod.yml`, pulls the new images from `ghcr.io`, and updates the running containers without downtime (`docker compose up -d`).

## Prerequisites (GitHub Secrets)
To enable the deployment to `clawgs.lisowska26.com`, you must add the following secrets to your GitHub repository (`Settings > Secrets and variables > Actions > New repository secret`):

- `SERVER_HOST`: `clawgs.lisowska26.com`
- `SERVER_USER`: Your SSH username (e.g., `root`, `ubuntu`, `debian`)
- `SERVER_SSH_KEY`: The private SSH key used to connect to the server (starts with `-----BEGIN OPENSSH PRIVATE KEY-----`)

*Note: The pipeline uses the built-in `GITHUB_TOKEN` to push/pull Docker images to/from `ghcr.io`.*

## Deployment
On your first push to `main`, the pipeline will automatically:
- Create a folder `~/clawgs` on the server
- Copy `docker-compose.prod.yml` to `~/clawgs/docker-compose.yml`
- Login to GHCR, pull the images, and run them.

## Notes
- If the repository is set to **Private**, GitHub Packages (GHCR) might require additional permissions or a Personal Access Token (PAT) for pulling images on the server if `GITHUB_TOKEN` scope doesn't extend to package pulls in the `ssh-action`. If the repo is public, it works out of the box.
