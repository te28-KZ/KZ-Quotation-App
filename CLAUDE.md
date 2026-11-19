# Buddy（見積・物件管理アプリ）開発メモ

KATZ VN（ベトナム）の見積と物件を管理する社内アプリ。親会社は KATZ JP（日本）。
新しいチャットで作業を始めるときは、まずこのファイルと CHANGELOG.md を読むこと。

## 作業のルール（オーナーの希望）

- **コードを書く前に、機能追加の案を先に出して了承をもらう。** 選択肢があるときは番号を付けて提示する（返事は「１，OK ２，A」のような形で来る）。
- やり取りは日本語。スタッフ向けの表示は日本語・ベトナム語・英語の3言語（ja / vi / en）。
- 変更したら CHANGELOG.md に1行追加し、マニュアルの直しが必要かも確認する。
- 台帳シートやDriveを直接直すときは、書き込み後に読み直して確認する。

## 構成

| ファイル | 役割 |
| --- | --- |
| `Code.gs` | Google Apps Script（GAS）のWeb API。`doPost` で JSON を受け取る |
| `index.html` | 画面（1ファイル）。`API_URL` に GAS の `/exec` URL を指定 |
| `template/UnitPriceFormat.gs` | 単価の通貨表示を切り替える onEdit。見積マスターにくっついた Apps Script に入れる（Buddy API とは別） |

- Buddy の Apps Script は単独のプロジェクト「Buddy API」（どのシートにもくっついていない。2026-11-19 に見積マスターから移行）。シートはすべて ID で開く。
  - 見積マスターに残るスクリプトは `UnitPriceFormat` だけ（シートの操作に反応する onEdit のため、シートにくっついている必要がある）。
  - 旧デプロイ（見積マスターにくっついていた版）は 2026-11-19 にアーカイブ済みで、見積マスターからも Buddy のコードは削除済み。
  - 移行前に作った見積ファイルには旧コードのコピーが入っているが、デプロイされていないので動かない。
- フォロー通知のトリガー（`sendFollowUpEmails`）は「Buddy API」側にだけ置く（2つあるとメールが2通届く）。
- ログイン：Google Identity Services の IDトークン → `login` でセッション発行（30日）。OAuth クライアントIDはスクリプトプロパティ `GOOGLE_CLIENT_ID`。
- 同時書き込みは `LockService` で守る。
- 主なAPI（`doPost` の action）：`whoami` `logout` `setLanguage` `createQuotation`（旧互換） `getProjects` `createProject` `addBranch` `addQuoteToProject` `updateProjectInfo` `addClient` `getFollowUps` `searchProjects` `updateProject` `createRevision`

### デプロイ手順

1. GAS エディタに `Code.gs` を貼り付けて保存。
2. 「デプロイ」→「デプロイを管理」→ 既存のデプロイを編集 →「新バージョン」で更新（URLを変えないため、新規デプロイはしない）。
3. `index.html` を公開先に反映（このリポジトリの main）。
4. 一回だけ実行する関数を足した場合は、実行後にコードから消す。

## 番号のルール

- **物件番号**：数字10桁 ＝ `YYMM`（作成年月）＋ `その月の連番4桁` ＋ `枝番2桁`。例 `2611000201`。
  - 親会社（KATZ JP）の物件は頭に `JP` を付ける（`JP2611000201`）。JPは桁数に数えない。
  - 枝番：通常は `01`。物件が終わったあと、メンテナンスや追加工事で費用が出たときに `02`, `03` … と増やす（`addBranch`）。枝番物件のフォルダは `01` の物件フォルダの中に作る。担当者は元の物件を引き継ぐ。
- **見積番号**：`物件番号-NN`（NN は見積の連番）。例 `2611000201-01`。改訂版は次の番号。
- 旧形式の見積は、台帳の O列「Project No」に物件番号を入れて物件に紐付ける（`projectNoOfRow`）。
- 新しい物件を作ると、必ず見積も1件一緒に作る。

## Drive のフォルダ

- ルート：物件管理 (Buddy) `12D6L4a2YJH7xcLQriGhqDfbdIExCz6nk`
- 物件フォルダ名：`物件番号 客先の略称 内容`（半角スペース区切り）。
  - 略称は Clients シート E列。内容が略称で始まるときは略称を重ねない。内容が「（未設定）」なら省く。
  - 物件名や客先を変えるとフォルダ名も変わる。
- 物件フォルダの中（日本語_ベトナム語）：`01資料_Tài liệu` / `02見積り_Báo giá` / `03図面_Bản vẽ` / `04製作・発注_Sản xuất・Đặt hàng` / `05納品・請求_Giao hàng・Hóa đơn`
  - 旧名 `02見積り` も見積フォルダとして扱う。
- 見積は回ごとに分ける：`02見積り_Báo giá/01 1回目_Lần 1/`、`02 2回目_Lần 2/` …
- 見積テンプレート `1QiFOlOhv_1fvM-pX_EB4-GgbWjYUrmZ0XTvdXMTRX1U`（国内用 `TH` / 親会社用 `TH_JP` シート）
  - Quotation：J6 通貨（USD / VND）、J7 担当、J8 役職（数式）、明細は14〜31行（G 数量 / I 単価 / J 金額）、J34 合計。
  - 単価 I14:I31 は手入力。表示形式は他のセルの値で切り替えられないため、見積マスターに入れた `template/UnitPriceFormat.gs`（onEdit のシンプルトリガー）が、J6 の変更時と単価の入力時に I列の表示形式を `"$"#,##0.0` / `#,##0" VND"` に切り替える。明細の最後は I列の「TOTAL」の行の手前で判定。
  - 金額 J列と合計 J34 は、単価が文字（$16.4 など）でも数値に直して計算する。
  - 親会社とはUSDで取引する（TH_JPの円は参考表示）。

## 権限

- オーナー ＝ GAS を実行しているアカウント（`Session.getEffectiveUser()`）。`isAdmin` で画面にも渡す。
- 見積テンプレート（マスター）を編集できるのはオーナーだけ。
- 物件・見積を編集できるのは、その物件の担当者とオーナーだけ（`assertCanEdit`、エラーコード `FORBIDDEN`）。
- 物件フォルダを作るとき、担当者を編集者に追加する（`grantFolderEditor`）。ルートフォルダは非公開で、スタッフは閲覧者。
- Staff シートは保護されていてオーナーだけが編集できる。パスワードは保存しない。

## 台帳スプレッドシート `1lbzNr8CKPqY9AmL7m-zisgpvJ1vu8o8Vac3gvcREDGQ`

### Projects（sheetId 1100000001）
A 物件No / B 物件名 / C 客先 / D 区分 / E 担当 / F 段階 / G 受注金額 / H 納期 / I フォルダURL / J 作成日 / K 更新日 / L メモ（新しい記録を先頭に追記） / M 旧フォルダ / N 客先担当者（見積には載せない） / O 不成立の理由

- 段階：`1. Inquiry` `2. Quoting` `3. Ordered` `4. In Production` `5. Delivered` `6. Completed` `9. Lost`
  - `9. Lost` の画面表示は「9. 不成立」（vi: Không thành công / en: Not won）。
- 不成立の理由（O列はコードで保存）：`price` 価格が合わない / `competitor` 他社に決定 / `spec` 仕様・納期が合わない / `cancelled` 案件の中止・延期 / `no_response` 連絡が途絶えた / `other` その他
  - 「9. Lost」にするときは理由が必須。他の段階に戻すと理由は消える。
- 受注率 ＝ 受注 ÷（受注 ＋ 不成立 − 理由が cancelled のもの）。受注 ＝ 段階 3〜6。
- 受注金額は見積を「4. Accepted」にすると自動で入る。画面から手入力もできる（`-` で空にする）。

### Clients（sheetId 1100000002）
A 正式名 / B （アプリでは使わない） / C 別名（カンマ区切り） / D 担当者（カンマ区切り） / E 略称（フォルダ名用。空なら正式名）
- 親会社の客先名は `KATZ JP`。区分「親会社(Japan HQ)」を選ぶと客先も KATZ JP に固定され、逆も連動する。

### Quotation Summary Master（見積の台帳）
A 日付 / B 見積番号 / C 金額 / D 客先 / E 区分 / F 取引 / G 担当 / H ステータス / I リンク / J 納期 / K 手配期限 / L 見積内容 / M メモ / N 次回フォロー日 / O 物件No

- 見積ステータス：`1. Draft` `2. Submitted` `3. Negotiating` `4. Accepted` `9. Lost / Cancelled`（表示は「9. 不成立・中止」）
- 1件の見積を Accepted にすると、同じ物件の他の見積は `9. Lost / Cancelled` になる。
- 「2. Submitted」のまま14日たった見積はフォロー通知（毎朝8時台、ベトナム時間）。

### その他のシート
Staff（Name / Role / Email / Language / Notify Email。見出しで列を判定） / Holidays / Quotation

## マニュアル（Claude のドキュメント）

- 日本語版（スタッフ用・管理者の章なし）：https://claude.ai/artifact/RUwixf74rhwNEn51r96kx1
- ベトナム語版：https://claude.ai/artifact/2NYSAFTB4Zhxda2HnsE9UQ
- 管理者メモ：https://claude.ai/artifact/8utFwVUjJk28JkXsVeK3Dr

画面や用語を変えたら、日本語版とベトナム語版の両方を直す。
