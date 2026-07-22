import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// OpenNext（Cloudflare Workers アダプタ）の設定。既定構成で十分。
// キャッシュ等を強化する場合は incrementalCache/queue を差し込む。
export default defineCloudflareConfig();
