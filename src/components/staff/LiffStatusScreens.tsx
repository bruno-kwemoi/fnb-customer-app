export function LiffLoadingScreen() {
  return <div className="p-6 text-sm text-neutral-500">読み込み中…</div>;
}

export function LiffErrorScreen({ message }: { message: string }) {
  return (
    <div className="p-6 text-sm text-neutral-600">
      <p className="font-bold mb-2">読み込みに失敗しました</p>
      <ul className="list-disc pl-5 mb-3 space-y-1">
        <li>LINEアプリ内でこのリンクを開いていますか？（外部ブラウザでは動作しません）</li>
        <li>LIFFアプリのEndpoint URLはドメインのみ（パスなし）に設定されていますか？</li>
        <li>デプロイ後の環境変数（NEXT_PUBLIC_STAFF_LIFF_ID など）は最新のデプロイに反映されていますか？</li>
      </ul>
      <p className="text-xs text-neutral-400 font-mono break-all">{message}</p>
    </div>
  );
}

export function NoIdTokenScreen() {
  return (
    <div className="p-6 text-sm text-neutral-600">
      <p className="font-bold mb-2">設定エラー</p>
      <p>
        このLINEアプリではID tokenが取得できませんでした。LINE Developers
        consoleでこのLIFFアプリの「ID token」設定がオンになっているか管理者にご確認ください。
      </p>
    </div>
  );
}

export function NotRegisteredScreen({ lineUserId, displayName }: { lineUserId: string; displayName: string }) {
  return (
    <div className="p-6 text-sm text-neutral-600">
      <p className="font-bold mb-2">スタッフとして登録されていません</p>
      <p className="mb-4">下記のIDを管理者にお伝えください。登録後、再度お試しください。</p>
      <div className="rounded-lg bg-neutral-100 p-3 mb-2">
        <p className="text-xs text-neutral-400 mb-1">お名前</p>
        <p className="font-mono text-sm mb-2">{displayName}</p>
        <p className="text-xs text-neutral-400 mb-1">LINEユーザーID</p>
        <p className="font-mono text-xs break-all">{lineUserId}</p>
      </div>
    </div>
  );
}

export function AdminOnlyScreen() {
  return (
    <div className="p-6 text-sm text-neutral-600">
      <p className="font-bold mb-2">管理者のみアクセスできます</p>
      <p>レポートは管理者権限のスタッフのみ閲覧できます。権限が必要な場合は管理者にお問い合わせください。</p>
    </div>
  );
}
