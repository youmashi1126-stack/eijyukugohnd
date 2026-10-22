import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// データは Upstash Redis に保存しているので、Cloudflare 側のキャッシュ設定は既定のまま
export default defineCloudflareConfig();
