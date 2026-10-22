# Mnemo

開いた瞬間にメモでき、画像を貼り付けられる暗記アプリ。メモはフリックでステータス管理し、フルスクリーンの暗記カードで復習する。

**Live:** https://mnemo.mumumu-cpu.workers.dev

## 機能

- **即メモ** — 起動と同時に入力欄へフォーカス。ログイン前でも端末内（IndexedDB）に保存され、ログイン後に自動同期
- **画像貼り付け** — ページのどこで貼り付けても入力欄に入る。ドラッグ＆ドロップ、カメラ/ファイル選択にも対応。送信前にブラウザ側でWebPへ圧縮
- **フリックでステータス管理** — 右フリックで「未着手 → 学習中 → 覚えた」、左フリックで1段戻す
- **復習モード** — 全画面の暗記カード。タップで3D反転、右フリック＝覚えた／左フリック＝もう一度
- **AI（Workers AI）** — メモ（画像を含む）から一問一答を生成、要点を箇条書き化
- **Google ログインのみ**
- Liquid Glass UI（白ベース）、スプラッシュ、スケルトン、各種ローディング、モーション多用、PWA全画面

## 技術選定と理由

| 領域 | 採用 | 理由 |
| --- | --- | --- |
| ホスティング | **Cloudflare Workers + Static Assets** | フロントとAPIを1つのWorkerで同一オリジン配信。CORS・Cookie設定が不要になり、デプロイも1コマンド。Pagesより新しい推奨構成 |
| API | **Hono** | Workers向けに作られた軽量ルーター。型が効き、Cookie/ミドルウェアが標準で揃う |
| DB | **Cloudflare D1** | SQLiteベースでスキーマとマイグレーションを素直に書ける。ユーザー×メモの単純なリレーションに最適 |
| 画像 | **Workers KV** | 画像はクライアントでWebP圧縮（長辺1600px）してから保存するので数百KB程度に収まり、KVの値サイズ上限内。R2がこのアカウントで未有効（有効化にはダッシュボードでの同意が必要）のため、追加手続きなしで使えるKVを選択。R2へ移行する場合はバインディングを差し替えるだけで済む構造 |
| AI | **Workers AI `@cf/meta/llama-4-scout-17b-16e-instruct`** | テキストと画像の両方を入力できるマルチモーダルモデル。画像だけのメモからも問題を作れる。JSON Schema モードで `{question, answer}` を強制し、パース失敗を防止 |
| 認証 | **Google Identity Services + jose** | Googleが発行したIDトークンをサーバー側でGoogleの公開鍵（JWKS）で検証するだけなので、クライアントシークレット不要でWorkersと相性が良い。検証後は自前のHS256署名・HttpOnly Cookieでセッション管理 |
| フロント | **React 19 + Vite** | 開発体験が最速で、`@cloudflare/vite-plugin` によりローカルでもWorker/D1/KVをそのまま動かせる |
| アニメーション | **Motion（旧 Framer Motion）** | フリック（drag + velocity判定）、レイアウトアニメーション、ばね物理、退場アニメーションが宣言的に書ける。ジェスチャーとアニメーションを1ライブラリで賄える |
| ローカル保存 | **idb-keyval** | IndexedDBの極小ラッパー。画像Blobをそのまま保存でき、オフライン/未ログインの即メモを実現 |
| スタイル | **素のCSS** | Liquid Glassは `backdrop-filter`・多層の内側ハイライト・マスクで縁の屈折を作る細かい表現が中心で、ユーティリティCSSより直接書く方が制御しやすい |

## 構成

```
worker/index.ts        Hono API（認証・メモCRUD・画像・AI）
migrations/            D1 スキーマ
src/store.ts           状態管理・IndexedDBキャッシュ・未同期キュー
src/components/        Composer / ItemCard / DetailSheet / ReviewDeck / Account ...
src/styles.css         Liquid Glass デザイン
```

## 開発

```bash
npm install
npx wrangler d1 migrations apply mnemo-db --local
npm run dev
```

`.dev.vars`（コミットしない）:

```
DEV_AUTH=1
SESSION_SECRET=任意の長い文字列
```

`DEV_AUTH=1` のときだけローカルに「開発用ログイン」が出る（本番では無効）。

## デプロイ

```bash
npm run db:migrate          # 本番 D1 にマイグレーション
npx wrangler secret put SESSION_SECRET
npm run deploy
```

### Google ログインの設定

1. Google Cloud Console → 「APIとサービス」→「認証情報」→「OAuth クライアント ID を作成」（種類: ウェブアプリケーション）
2. 「承認済みの JavaScript 生成元」に `https://mnemo.mumumu-cpu.workers.dev` と `http://localhost:5173` を追加
3. 発行されたクライアントIDを `wrangler.jsonc` の `vars.GOOGLE_CLIENT_ID` に設定して `npm run deploy`

クライアントIDは公開情報なので、シークレットにする必要はない。
