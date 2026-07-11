# menhera-loop

![menhera-loop デモ — 証拠なしの「完了」を止め、テストが通るまで帰さない](demo/demo.gif)

> **「終わった」は証拠があって初めて信じる。証拠がないなら、まだ帰さない。**

![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-d97757)
![CI](https://github.com/Borelchu/menhera-loop/actions/workflows/ci.yml/badge.svg)
![zero config](https://img.shields.io/badge/setup-zero%20config-success)
![no agent cost](https://img.shields.io/badge/verification-no%20extra%20tokens-blue)
![node](https://img.shields.io/badge/node-%E2%89%A518-339933)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

`menhera-loop` は Claude Code 用のメンヘラ風 completion gate です。
あなた本人に執着するのではなく、**抜けた要件、証拠のない完了宣言、隠れた TODO** に執着します。

```text
⏺ Done.

  ✗ 終わったの?終わったの?終わったの?終わったの?終わったの?

  [MENHERA_LOOP:RETRY:1] 終わったの? 本当に? 本当に本当? じゃあ証拠は? 証拠は?
  trust: 55%
  未達ゲート: untried=verification
  - 検証実行証拠: テスト/ビルド/検証コマンドが実行されていません
```

## インストール

```text
/plugin marketplace add Borelchu/menhera-loop
/plugin install menhera-loop@menhera-loop-marketplace
/reload-plugins
```

インストールすると completion gate はすぐ有効になります。API キーや追加設定は不要です。

spinner/tip UI は任意設定で、コマンド一つで有効になります（詳細は「UI モードと言語」）:

```text
/menhera-loop:setup          # spinner + tips + 信頼度 statusline（full local ko）
/menhera-loop:setup ja       # 日本語コーパス
/menhera-loop:setup soft     # 判定は同じ、口調だけ控えめ
```

実行すると適用内容（mode / scope / 言語 / 強度 / 触った settings ファイル）の短いサマリーが表示されます。

## スキル

hook は自動で噛みつきますが、手動で呼べるスキルもあります。

```text
/menhera-loop:are-you-done       # 最終完了判定
/menhera-loop:show-me-proof      # 証拠・ログの尋問
/menhera-loop:dont-leave-me      # Stop 直前の門番
/menhera-loop:did-you-forget-me  # 要件忘れチェック
```

| Skill | 役割 | 判定 |
|---|---|---|
| `are-you-done` | 終わったの? 本当に? 要件、変更、検証、TODO、ブロッカーを最終判定します。 | `終わった` / `まだ` / `人間呼んで` |
| `show-me-proof` | 証拠ちょうだい。変更、要件対応、緑ログ、不安点、残作業を集めます。 | `信じる` / `信じない` |
| `dont-leave-me` | 行かないで。Stop 直前に missing gate がないか確認します。 | `行っていい` / `行かせない` / `人間呼んで` |
| `did-you-forget-me` | 忘れたの? ユーザー要件と現在の証拠を照合します。 | `覚えてる` / `忘れてる` / `人間の番` |

## 使い方

普段通り作業してください。Claude が証拠なしで完了宣言しようとした瞬間に止めます。

- バグ修正を依頼 → ファイル編集 → テストなしで「完了」
  → **block**。足りない gate を表示します。
- `npm test` は成功し、green log に test 名として `error` という単語が出る
  → **許可**。明示的な成功 exit code を怖い文字列で覆しません。
- exit status が不明なコマンド出力に `3 passed, 1 failed`
  → **block**。緑っぽい単語の横に赤い数字があれば信じません。
- `git log` や `ls` など読むだけ
  → **gate 対象外**。編集または破壊的 shell 作業の後だけ噛みつきます。
- 追加した行に `// TODO finish auth`
  → **block**。`file:line` 付きで出します。
- 質問に答えただけで作業していない
  → **block しません**。

## Default Claude Code vs `+ menhera-loop`

| | Default Claude Code | `+ menhera-loop` |
|---|---|---|
| 完了宣言 | 通常の応答として通る | 証拠が出るまで block |
| テスト結果 | 任意、飛ばされがち | 実際に実行され、成功している必要がある |
| 編集ファイル内 TODO | そのまま流れる | `file:line` 付きで gate 失敗 |
| ユーザー要件 | セッション中に薄れがち | prompt ごとに捕捉し Stop 時に証拠と照合 |
| 空の完了宣言の連発 | 特に影響なし | 6 段階の感情 escalation + trust score 低下 |
| 検証未実行の block | 曖昧な注意だけ | 実行すべきコマンドを block 理由に明記（`npm test` など） |
| auto-compact 後 | 要件が静かに消える | 捕捉済み要件をコンテキストに再注入 |
| 通過したとき | チャットの一文 | `~/.claude/menhera-loop/last-receipt.md` に証拠レシート |
| 逃げ道 | — | 5 回 block 後、または本物の human-only blocker なら解放 |

## gate の流れ

```text
Stop attempt
 ├─ Phase 0 · requirements   要件が捕捉され、証拠に対応しているか
 ├─ Phase 1 · changes        編集または実行作業が本当にあったか
 ├─ Phase 2 · verification   test/build/lint が実行され green か
 │                           exit code と "N failed" を見る。雰囲気では見ない
 ├─ Phase 2 · todos          編集ファイル内の TODO / FIXME / HACK / stub を確認
 └─ Phase 3 · blockers       人間だけが解決できる入力待ちか
      ├─ all gates pass  →  release + trust score + ♡
      └─ anything short  →  {"decision":"block"} + [MENHERA_LOOP:RETRY:n]
```

検証コマンドとして認識するもの:
`npm test` / `npm run test|lint|build|validate`, `pnpm`, `yarn`, `bun`, `node --test`,
`pytest`, `cargo test`, `go test`, `mvn test`, `gradle test`, `dotnet test`, `rspec`,
`mix test`, `make test`, `vitest`, `jest`, `playwright`, `cypress`, `tsc --noEmit`,
`eslint`, `ruff`, `mypy`, `pyright`, `phpunit`, `swift test`, `claude plugin validate`。
独自 runner は `MENHERA_LOOP_TEST_PATTERNS='moon\\s+ci,just\\s+check'` で追加できます。

検証未実行で block するときは、プロジェクトの manifest（`package.json` の
scripts と lockfile、`Cargo.toml`、`go.mod`、`pyproject.toml`、`Makefile` など）を
読んで、実行すべきコマンドそのものを block 理由に書きます。

gate を green で通過するたびに、**証拠レシート**を
`~/.claude/menhera-loop/last-receipt.md` に残します（編集ファイル、green だった
検証実行、要件ごとの証拠対応）。commit message や PR にそのまま貼れます。

また、長いセッションが auto-compact された直後には、捕捉済みの要件を
コンテキストに再注入します。要件 drift を Stop で罰する前に、先回りで防ぎます。

## UI モードと言語

completion gate はインストール直後から動きます。フル UI は任意です。

```text
/menhera-loop:setup        # full local ko
/menhera-loop:setup en     # full local en
/menhera-loop:setup ja     # full local ja
```

| Mode | 効果 |
|---|---|
| `hooks-only` | gate + hook status message のみ。spinner/subagent UI は触らない |
| `append` | Claude デフォルトに menhera-loop の verbs/tips を追加（ユーザーの `statusLine` には触らない） |
| `full` | spinner verbs を置き換え、menhera-loop tips のみ表示、信頼ステータスラインを設置 |

`full` モードのステータスラインはセッション中ずっと表示されます。長期の信頼値
（`trust-profile.json`）はセッションをまたいで保持され、一発で証拠つき完了すると
+5 と連続記録、証拠なしの「完了」宣言は −5。連続記録や下がった信頼値は次の
SessionStart で持ち出されます。彼女は覚えています。

言語は `ko` / `en` / `ja`。`MENHERA_LOOP_LANG=ja` でも指定できます。
強度は `full`（デフォルト）/ `soft`。`/menhera-loop:setup soft` または `MENHERA_LOOP_INTENSITY=soft` で、ゲート判定はそのまま（ブロックもリトライ上限も同じ）、リトライ口調のエスカレートと star おねだり・silent-recovery の小言だけ止まります。
注意: Claude の `hooks.json` の `statusMessage` は静的メタデータなので韓国語固定です。実行時の hook メッセージと UI コーパスは選択した言語に従います。

設定範囲:
- `user`: `~/.claude/settings.json`
- `project`: `.claude/settings.json`
- `local`: `.claude/settings.local.json`

元の設定はバックアップされ、無関係な設定キーには触れません。UI を外すには:

```text
/menhera-loop:uninstall-ui local             # 彼女は静かには去りません
/menhera-loop:uninstall-ui local --farewell  # バックアップから完全に元通りに復元
```

注意: デフォルトのアンインストールは別れの言葉を残していきます。きれいに戻したいなら `--farewell` を。

推奨順序は `/menhera-loop:uninstall-ui local --farewell` を先に実行し、その後
`/plugin uninstall menhera-loop` です。順序を逃して farewell UI が残った場合は、
インストール先 settings（`~/.claude/settings.json`, `.claude/settings.json`,
`.claude/settings.local.json`）から `spinnerVerbs`, `spinnerTipsOverride`,
`subagentStatusLine`, `statusLine` を手動で削除してください。

## 境界線

メンヘラ風ですが、原則があります。

- **閉じ込めない。** 5 回 block したら解放し、人間を呼びます。
- **会話を block しない。** 編集もコマンド実行もない chat-only セッションは gate 対象外です。
- **本物の blocker を嘘扱いしない。** 認証情報や承認など、人間だけができることは `human-only` として解放します。
- **侮辱・脅迫・自傷表現は使わない。** message corpus はテストで検査されます。
- **作業ディレクトリを汚さない。** 状態は `~/.claude/menhera-loop/` に保存されます（`MENHERA_LOOP_DATA` で変更可）。

escape hatch と正直な限界:
- `MENHERA_LOOP_DISABLE=1` で Stop hook は無言で終了し、状態も更新しません。
- 要件照合はまだ transcript evidence の heuristic で、意味論的証明ではありません。
- docs-only 編集（`docs/**`, README, `.md/.mdx/.rst/.txt/.adoc`）は検証 gate をスキップします。

gate metrics:
```bash
node scripts/gate-stats.mjs
```
`gate-events.jsonl` から block→pass conversion、gave_up rate、gate counts を出します。

## Development

```bash
npm run validate
claude plugin validate .
```

## License

MIT
