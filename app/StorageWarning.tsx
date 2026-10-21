// 保存先（Redis）が未設定のまま公開されているときの警告
export default function StorageWarning({ persistent }: { persistent: boolean }) {
  if (persistent) return null;
  return (
    <div className="card storage-warning">
      ⚠️ データの保存先（Upstash Redis）が設定されていません。このままでは記録がしばらくすると消えてしまいます。
      Vercel の Storage から Upstash Redis をこのプロジェクトに接続し、再デプロイしてください。
    </div>
  );
}
