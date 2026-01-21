import { config } from "../config";

interface UpdateInfo {
  currentVersion: string;
  remoteVersion: string | null;
  hasUpdate: boolean;
  lastCheck: string | null;
  isChecking: boolean;
  isUpdating: boolean;
  updateError: string | null;
  changelog: string | null;
}

interface DockerManifest {
  schemaVersion: number;
  config?: {
    digest: string;
    Labels?: Record<string, string>;
  };
}

interface DockerTagInfo {
  name: string;
  digest: string;
  last_updated: string;
}

class UpdateService {
  private state: UpdateInfo = {
    currentVersion: config.docker.version,
    remoteVersion: null,
    hasUpdate: false,
    lastCheck: null,
    isChecking: false,
    isUpdating: false,
    updateError: null,
    changelog: null,
  };

  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startAutoCheck();
  }

  private startAutoCheck() {
    const intervalMs = config.docker.updateCheckInterval * 60 * 60 * 1000;

    // Initial check after 1 minute
    setTimeout(() => this.checkForUpdates(), 60 * 1000);

    // Periodic checks
    this.checkInterval = setInterval(() => {
      this.checkForUpdates();
    }, intervalMs);
  }

  getStatus(): UpdateInfo {
    return { ...this.state };
  }

  async checkForUpdates(): Promise<UpdateInfo> {
    if (this.state.isChecking) {
      return this.state;
    }

    this.state.isChecking = true;
    this.state.updateError = null;

    try {
      const remoteInfo = await this.fetchRemoteVersion();

      this.state.remoteVersion = remoteInfo.version;
      this.state.changelog = remoteInfo.changelog;
      this.state.lastCheck = new Date().toISOString();

      // Only check for updates if we got a valid remote version
      if (remoteInfo.version) {
        this.state.hasUpdate = this.compareVersions(
          this.state.currentVersion,
          remoteInfo.version
        );
      } else {
        // No version labels found - image not properly tagged yet
        this.state.hasUpdate = false;
        this.state.remoteVersion = null;
      }
    } catch (error) {
      this.state.updateError = error instanceof Error ? error.message : "Unknown error";
      console.error("[UpdateService] Check failed:", error);
    } finally {
      this.state.isChecking = false;
    }

    return this.state;
  }

  private async fetchRemoteVersion(): Promise<{ version: string | null; changelog: string | null }> {
    const { repository, tag } = config.docker;

    // Docker Hub API v2 - get tag info
    // First, get auth token
    const tokenUrl = `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${repository}:pull`;
    const tokenRes = await fetch(tokenUrl);

    if (!tokenRes.ok) {
      throw new Error("Failed to get Docker Hub auth token");
    }

    const tokenData = await tokenRes.json();
    const token = tokenData.token;

    // Get manifest for tag
    const manifestUrl = `https://registry-1.docker.io/v2/${repository}/manifests/${tag}`;
    const manifestRes = await fetch(manifestUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.docker.distribution.manifest.v2+json",
      },
    });

    if (!manifestRes.ok) {
      throw new Error(`Failed to fetch manifest: ${manifestRes.status}`);
    }

    // Get digest from response headers for change detection
    const remoteDigest = manifestRes.headers.get("Docker-Content-Digest");

    // Try to get version from labels in config blob
    const manifest: DockerManifest = await manifestRes.json();
    let version: string | null = null;
    let changelog: string | null = null;

    if (manifest.config?.digest) {
      try {
        const blobUrl = `https://registry-1.docker.io/v2/${repository}/blobs/${manifest.config.digest}`;
        const blobRes = await fetch(blobUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (blobRes.ok) {
          const blobData = await blobRes.json();
          const labels = blobData.config?.Labels || {};

          // Only accept WebTop-specific version labels
          // Check if this is actually a WebTop image
          const isWebTopImage =
            labels["org.opencontainers.image.title"] === "WebTop" ||
            labels["org.opencontainers.image.source"]?.includes("webtop");

          if (isWebTopImage) {
            // Get version from our labels
            if (labels["org.opencontainers.image.version"]) {
              version = labels["org.opencontainers.image.version"];
            } else if (labels["version"]) {
              version = labels["version"];
            }

            // Check for changelog/description
            if (labels["org.opencontainers.image.description"]) {
              changelog = labels["org.opencontainers.image.description"];
            }
          }
        }
      } catch {
        // Fallback: no version info available
      }
    }

    return { version, changelog };
  }

  private compareVersions(current: string, remote: string): boolean {
    // Parse semantic version (MAJOR.MINOR.PATCH)
    const parseVersion = (v: string): number[] => {
      const match = v.match(/(\d+)\.(\d+)\.(\d+)/);
      if (match) {
        return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
      }
      return [0, 0, 0];
    };

    const currentParts = parseVersion(current);
    const remoteParts = parseVersion(remote);

    for (let i = 0; i < 3; i++) {
      if (remoteParts[i] > currentParts[i]) return true;
      if (remoteParts[i] < currentParts[i]) return false;
    }

    return false;
  }

  async triggerUpdate(): Promise<{ success: boolean; message: string }> {
    if (this.state.isUpdating) {
      return { success: false, message: "Update already in progress" };
    }

    if (!this.state.hasUpdate) {
      return { success: false, message: "No update available" };
    }

    this.state.isUpdating = true;
    this.state.updateError = null;

    try {
      // Create update marker file so the container knows to restart
      const updateMarkerPath = `${config.dataDir}/update-pending`;
      await Bun.write(updateMarkerPath, JSON.stringify({
        fromVersion: this.state.currentVersion,
        toVersion: this.state.remoteVersion,
        triggeredAt: new Date().toISOString(),
        repository: config.docker.repository,
        tag: config.docker.tag,
      }));

      // The actual update process depends on the deployment method:
      // Option 1: Watchtower will pick up the update
      // Option 2: Docker Compose with recreate
      // Option 3: Manual script execution

      // For now, we signal to the host via a special file
      const updateScriptPath = `${config.dataDir}/trigger-update.sh`;
      const updateScript = `#!/bin/bash
# WebTop Auto-Update Script
# Generated at: ${new Date().toISOString()}

REPO="${config.docker.repository}"
TAG="${config.docker.tag}"

echo "Pulling new image..."
docker pull $REPO:$TAG

echo "Recreating container..."
docker compose -f /app/docker/docker-compose.yml up -d --force-recreate

echo "Update complete!"
`;

      await Bun.write(updateScriptPath, updateScript);

      return {
        success: true,
        message: "Update triggered. Container will restart shortly."
      };
    } catch (error) {
      this.state.updateError = error instanceof Error ? error.message : "Update failed";
      this.state.isUpdating = false;
      return { success: false, message: this.state.updateError };
    }
  }

  stopAutoCheck() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const updateService = new UpdateService();
