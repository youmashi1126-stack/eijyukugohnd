// 保存先（Redis）が未設定のまま公開されているときの警告
export default function StorageWarning({ persistent }: { persistent: boolean }) {
  if (persistent) return null;
  return (
    <div className="card storage-warning">
      ⚠️ データの保存先（Upstash Redis）が設定されていません。このままでは記録がしばらくすると消えてしまいます。
      公開先（Cloudflare または Vercel）の環境変数に Upstash Redis の接続情報（KV_REST_API_URL と KV_REST_API_TOKEN）を設定し、再デプロイしてください。
    </div>
  );
}
