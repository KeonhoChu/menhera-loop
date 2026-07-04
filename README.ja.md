# menhera-loop

> **「終わった」は証拠があって初めて信じる。証拠がないなら、まだ帰さない。**

![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-d97757)
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
spinner/tip UI は任意設定です。

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
- `npm test` の出力に `3 passed, 1 failed`
  → **block**。緑っぽい単語の横に赤い数字があれば信じません。
- 編集したファイルに `// TODO finish auth`
  → **block**。`file:line` 付きで出します。
- 質問に答えただけで作業していない
  → **block しません**。作業を試みたときだけ噛みつきます。

## Default Claude Code vs `+ menhera-loop`

| | Default Claude Code | `+ menhera-loop` |
|---|---|---|
| 完了宣言 | 通常の応答として通る | 証拠が出るまで block |
| テスト結果 | 任意、飛ばされがち | 実際に実行され、成功している必要がある |
| 編集ファイル内 TODO | そのまま流れる | `file:line` 付きで gate 失敗 |
| ユーザー要件 | セッション中に薄れがち | prompt ごとに捕捉し Stop 時に証拠と照合 |
| 空の完了宣言の連発 | 特に影響なし | 6 段階の感情 escalation + trust score 低下 |
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
`npm test` / `npm run test|lint|build|validate`, `pnpm`, `yarn`, `bun`, `node --test`, `pytest`, `cargo test`, `go test`, `claude plugin validate`。

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

設定範囲:
- `user`: `~/.claude/settings.json`
- `project`: `.claude/settings.json`
- `local`: `.claude/settings.local.json`

元の設定はバックアップされます。戻すには:

```text
/menhera-loop:uninstall-ui local
```

## 境界線

メンヘラ風ですが、原則があります。

- **閉じ込めない。** 5 回 block したら解放し、人間を呼びます。
- **会話を block しない。** 編集もコマンド実行もない chat-only セッションは gate 対象外です。
- **本物の blocker を嘘扱いしない。** 認証情報や承認など、人間だけができることは `human-only` として解放します。
- **侮辱・脅迫・自傷表現は使わない。** message corpus はテストで検査されます。
- **作業ディレクトリを汚さない。** 状態は `~/.claude/menhera-loop/` に保存されます（`MENHERA_LOOP_DATA` で変更可）。

## Development

```bash
npm run validate
claude plugin validate .
```

## License

MIT
