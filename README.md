# 朝学習 英単語・英熟語テストアプリ

システム英単語（全2,032問）とターゲット英熟語1000（`00_英熟語テスト出題計画_2学期.xlsx` の「熟語別出題」シート）から
ランダムに100問を出題し、意味を3択（ア・イ・ウ）から選ぶテストアプリです。

## 機能

- **英単語モード / 英熟語モード**：ホーム上部でワンタップ切り替え。英単語はエメラルド×アンバー、英熟語は紫×ピンクのテーマ。
  テスト・練習・復習・ランキングは両モードで同じ仕様で、記録はモードごとに別々に保存
- **習得（覚えた）判定**：問題ごとに習熟ポイント（0〜6）を持ち、6点で「覚えた」。正解でテスト +3／練習 +2／復習 +1.5、
  不正解（練習の時間切れ含む）で0点に戻して要復習。本番テストで時間内に出題されなかった問題は対象外。
  ホームに「全◯問のうち何％覚えたか」を表示
- **番号登録**：最初に1〜35番から自分の番号を選び、ニックネームを登録（33〜35番はテスト用）
- **自動識別**：番号は端末（ブラウザ）に記憶され、2回目以降は自動でログイン状態になる
  - 別の端末では、登録済みの番号を選んで「〇〇として続ける」を押せば同じ番号で受験できる
- **テスト**：1000問からランダム100問。複数の意味がある熟語（①②…）は朝学習と同じく1つの語義を正解として出題
  - 制限時間は2分30秒のカウントダウン。0になると自動で採点（未回答は不正解）
  - 選択肢を押すとすぐ次の問題へ。答え合わせは最後にまとめて表示
  - 結果画面で「不正解だけ」「全問」を切り替えて確認できる
- **練習モード**：1000問を番号順に50問ずつ20セクションに分割
  - セクションの単語一覧（意味を隠すモードあり）。単語をタップすると発音と例文（和訳つき）を表示
  - セクションごとのテストは50問からランダム15問、1問5秒のカウントダウン。1問ごとに正誤を表示し「次へ」で進む。12点（8割）以上で ○、満点で ◎
  - セクションマップで未完成のセクションがひと目でわかる
  - 練習モード専用ランキング（クリア数 → ◎の数 → 合計点）。全員の20セクションの進み具合をマスで表示
- **練習モードのセクション数**：英熟語は20セクション、英単語は41セクション（最後は32問）
- **復習コーナー**：要復習の問題からランダム15問。開始前に残り数とルールを表示。1問ごとに◯✕で答え合わせ。
  4回連続正解（1.5点×4）で「覚えた」になり卒業（ランキングには含めない）
- **サウンド**：英熟語の発音（ブラウザの読み上げ機能）、やさしいBGM、正解・不正解の効果音。ヘッダーのボタンでそれぞれオン／オフ
- **ランキング**（モード別）：平均点ランキング／日別最高点ランキング（日付を選んで過去の日も見られる）／練習ランキング
  - 平均点ランキングの行をタップするとその人の全受験結果を表示

## 構成

| パス | 内容 |
| --- | --- |
| `app/page.tsx` | ホーム（番号登録・自分の成績） |
| `app/test/page.tsx` | テスト画面・結果画面 |
| `app/ranking/page.tsx` | ランキング（全参加者データ） |
| `app/api/*` | 出題・採点・登録・集計 API |
| `data/idioms.json` | 英熟語1000問（Excel から変換） |
| `data/words1.ts`〜`words3.ts` | 英単語2,032問（`出典番号\|単語\|選択肢1\|選択肢2\|選択肢3\|正解番号`） |
| `lib/datasets.ts` | 英単語・英熟語の出題データを同じ形で扱う |
| `lib/store.ts` | データ保存（Vercel 上は Upstash Redis、ローカルでは `.data/db.json`） |

## ローカルで動かす

Node.js 18.18 以上が必要です。

```bash
npm install
npm run dev
```

http://localhost:3000 を開きます。Redis の設定が無い場合は `.data/db.json` に保存されます。

## Cloudflare へのデプロイ

[OpenNext](https://opennext.js.org/cloudflare) を使って Cloudflare Workers で動かします。
記録は **Cloudflare D1**（`wrangler.jsonc` の binding `DB`）に保存します。テーブルは初回アクセス時に自動で作られます。
D1 が空のときに Upstash の接続情報が設定されていれば、Upstash のデータを一度だけ D1 に写します（移行後は Upstash の変数を消して構いません）。
保存先の優先順は D1 → Upstash Redis → ローカルファイル です。

1. Cloudflare のダッシュボードで **Workers & Pages → 作成 → Import a repository** から GitHub のリポジトリを選ぶ
2. ビルド設定
   - Build command：`npx opennextjs-cloudflare build`
   - Deploy command：`npx opennextjs-cloudflare deploy`
3. **Settings → Variables and Secrets** に、Upstash の接続情報を追加する（Build と Runtime の両方）
   - `KV_REST_API_URL`（例：`https://xxxx.upstash.io`）
   - `KV_REST_API_TOKEN`（種類は Secret）
4. 再デプロイすると `https://eijyukugohnd.<アカウント名>.workers.dev` で公開される

手元で Cloudflare の環境を試すときは `npm run preview`（Redis を使う場合は `.dev.vars` に上の2つを書く）。

## Vercel へのデプロイ

Vercel はファイルを保存できないため、成績データの保存に **Upstash Redis**（無料枠あり）を使います。

1. このフォルダ（`eijukugo-test-app`）を GitHub のリポジトリにアップロードする
2. [Vercel](https://vercel.com/new) で「Add New → Project」からそのリポジトリを Import し、そのまま Deploy
   （Framework は Next.js が自動選択されます）
3. Vercel のプロジェクト画面で **Storage → Create Database → Upstash（Redis）** を選んで作成し、プロジェクトに接続する
   - 接続すると環境変数 `KV_REST_API_URL` と `KV_REST_API_TOKEN` が自動で設定されます
4. **Deployments → 最新のデプロイ → Redeploy** で再デプロイすると、データが保存されるようになります

Upstash を直接使う場合は、環境変数 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` を設定しても動きます。

## データのリセット

Upstash のコンソール（Vercel の Storage 画面から開けます）の Data Browser で、次のキーを削除します。

いずれもハッシュで、フィールド名が番号です。1人分だけ消すときは各キーの該当フィールドを削除します。

- `eijukugo:users` … 登録者（番号とニックネーム）
- 英熟語モード：`eijukugo:v2:results`（受験結果）、`eijukugo:v2:practice`（練習の最高点）、
  `eijukugo:v2:mastery`（問題ごとの習熟ポイント）、`eijukugo:v2:summary`（覚えた数・復習数）、`eijukugo:v2:wrong`（以前の復習リスト）
- 英単語モード：`eijukugo:v2:word:results`、`eijukugo:v2:word:practice`、`eijukugo:v2:word:mastery`、`eijukugo:v2:word:summary`

Redis の接続情報は `KV_REST_API_URL` / `KV_REST_API_TOKEN`（接頭辞付きでも可）、`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`、
または Upstash の接続文字列（`REDIS_URL` / `KV_URL`）から自動で読み取ります。

例文は `data/examples/01.json`〜`10.json`（熟語番号 → [英文, 和訳]）にあります。

## 問題データの更新

`data/idioms.json` は `[{ "id": 1, "phrase": "a piece of ～", "meaning": "１つの～" }, ...]` の形式です。
意味に `①…②…` が含まれる場合、出題時に1つの語義がランダムに選ばれます。
