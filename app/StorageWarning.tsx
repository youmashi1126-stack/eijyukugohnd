// 保存先が未設定のまま公開されているときの警告
export default function StorageWarning({ persistent }: { persistent: boolean }) {
  if (persistent) return null;
  return (
    <div className="card storage-warning">
      ⚠️ データの保存先が設定されていません。このままでは記録がしばらくすると消えてしまいます。
      Cloudflare なら D1 データベース（wrangler.jsonc の DB）、Vercel なら Upstash Redis を設定して再デプロイしてください。
    </div>
  );
}
