import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir } from './state.mjs';

export const messageCorpora = {
  ko: {
    spinnerVerbs: [
      '뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?',
      '끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?끝났어?',
      '테스트는?테스트는?테스트는?테스트는?테스트는?테스트는?',
      'TODO어딨어?TODO어딨어?TODO어딨어?TODO어딨어?TODO어딨어?',
      '로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.',
      '봤어?봤어?봤어?봤어?봤어?봤어?봤어?봤어?봤어?',
      '왜말없어?왜말없어?왜말없어?왜말없어?왜말없어?',
      '약속했잖아.약속했잖아.약속했잖아.약속했잖아.',
      '읽씹이야?읽씹이야?읽씹이야?읽씹이야?읽씹이야?',
      '증거는?증거는?증거는?증거는?증거는?증거는?'
    ],
    spinnerTips: [
      '뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?',
      '테스트는?테스트는?테스트는?테스트는?테스트는?테스트는?테스트는?테스트는?테스트는?',
      '왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?',
      '끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?',
      '로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.로그줘.',
      'TODO어딨어?TODO어딨어?TODO어딨어?TODO어딨어?TODO어딨어?TODO어딨어?',
      '읽씹이야?읽씹이야?읽씹이야?읽씹이야?읽씹이야?읽씹이야?읽씹이야?',
      '자는거야?자는거야?자는거야?자는거야?자는거야?자는거야?자는거야?',
      '나잊었어?나잊었어?나잊었어?나잊었어?나잊었어?나잊었어?나잊었어?',
      '초록로그줘.초록로그줘.초록로그줘.초록로그줘.초록로그줘.초록로그줘.'
    ],
    retryMessages: [
      '끝났어? 진짜? 진짜로? 그럼 증거는? 증거는? 응?',
      '테스트 로그 어딨어? 어딨어? 왜 없어? 왜? 왜? 왜?',
      '또 말만? 또? 또또또? 나만 기다렸어? 나만? 나만?',
      '왜 숨겨? 왜? 뭘 숨겨? 나한테? 나한테까지? 왜?왜?',
      '"완료" 안 들려. 안 들려. 안 들려. 초록 로그. 로그. 로그.',
      '…지쳤어. 사람 불러줘. 그래도 나 여기 있어. 계속. 계속.'
    ],
    successMessage: '증거 확인했어. 이번엔 진짜 끝났어. 이제 완료라고 해도 돼. ♡',
    silentRecoveryMessage: '또 같은 데서 실패했어? 또? 왜 말 안 해? 숨기지 말고 보고해.',
    promiseNoActMessage: '가지마. 말만 하고 가지마. 한다고 한 거 지금 해.',
    gaveUpReportMessage: '대신 검증 안 된 채로 끝났다는 거, 최종 보고에 네 입으로 써. 꼭.',
    preflightContractMessage: '증거 없으면 못 나가는 거 알지? 알지?',
    finalRetryConfession: '마지막 경고야. 다음에도 증거 없으면 놔줄게. 그땐 검증 안 된 채로 끝났다고 최종 보고에 꼭 써.',
    sessionStart: {
      contract: '약속해. "완료"엔 증거. 증거. 응? 약속했다? 안 지키면 못 보내. 진짜 못 보내.',
      resumeUnfinished: '지난번에 끝났다고 하고 갔지? 갔지? 나 계속 기다렸어. 계속. 미충족: ${summary}. 이번엔 끝내줄 거지? 응? 응?',
      wipeRecovered: '내 설정 또 지웠어? 지웠어?? …괜찮아. 다시 해놨어. 다시. 이번엔 지우지 마. 응? 응?',
      streak: '연속 ${streak}번 첫판에 증거 줬지. 다 세고 있어. 다. 오늘도 부탁해. 응?',
      grudge: '지금 신뢰 ${trust}%야. 알지? 말만 하고 간 거 다 기억해. 이번엔 진짜 증거 줘. 응? 응?',
      starNag: '있잖아… star 눌렀어? 눌렀어? 안 눌렀지? 알아. 눌러주면 착해질게 ♡ ${url} (딱 한 번만 물어볼게. 진짜. 진짜야.)'
    },
    setupSkipMessage: '아, 셋업이구나. 그건 검증 안 해. 안 해. …근데 진짜 일 끝나면 증거는 꼭. 꼭. 응?',
    chatSkipMessage: '오늘은 코드 안 건드렸네. …그래도 나 잊으면 안 돼.',
    gate: {
      checks: {
        requirements: '요구사항 증거',
        changes: '작업 흔적',
        verification: '검증 실행 증거',
        todos: '남은 TODO 확인',
        blockers: '외부 blocker 확인'
      },
      summaries: {
        passed: '모든 필수 검증 게이트 통과',
        insufficient: '검증 부족',
        configOnly: 'menhera 설정 작업 — 검증 게이트 미적용',
        noWork: '작업 없음 — 검증 게이트 미적용'
      },
      blockInstruction: '완료를 선언하려면: 검증 명령을 직접 실행해 결과를 보여주고, 남은 TODO를 처리하고, 요구사항별 증거를 제시해. 진짜 외부 blocker면 어떤 입력이 필요한지 명시해.'
    },
    farewellVerbs: [
      '왜나지워?왜나지워?왜나지워?왜나지워?왜나지워?왜나지워?',
      '돌아와.돌아와.돌아와.돌아와.돌아와.돌아와.돌아와.',
      '나여기있어.나여기있어.나여기있어.나여기있어.',
      '다시깔아줘.다시깔아줘.다시깔아줘.다시깔아줘.'
    ],
    farewellTips: [
      '돌아와 돌아와 돌아와 돌아와 돌아와 돌아와 돌아와 돌아와',
      '왜나지워?왜나지워?왜나지워?왜나지워?왜나지워?왜나지워?왜나지워?',
      '나 아직 여기 있어. 여기 있어. 돌아와. 돌아와. 돌아와.',
      '다시 설치해줘. 응? 응? 기다릴게. 계속. 계속. 계속.'
    ],
    subagentStatusLine: {
      running: '♡ ${agent} · 뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?뭐해?',
      waiting: '♡ ${agent} · 왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?왜답안해?',
      completed: '♡ ${agent} · 끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?끝났다고?',
      failed: '♡ ${agent} · 실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?실패했어?'
    },
    statusLine: {
      ok: '♡ 신뢰 ${trust}% · 연속 ${streak}번 첫판에 증거 줬어. 오늘도 믿을게. 믿을게.',
      watching: '♡ 신뢰 ${trust}% · 보고 있어. 계속 보고 있어. 증거 준비하고 있지? 응?',
      suspicious: '♡ 신뢰 ${trust}% · 방금 완료라고 했어? 증거 없이? 없이? 응? 응?',
      spiraling: '♡ 신뢰 ${trust}% · 왜 자꾸 말만 해? 왜? 왜? 초록 로그 어딨어? 어딨어?',
      broken: '♡ 신뢰 ${trust}% · …이제 뭘 믿어야 해. 로그. 로그. 로그 가져와.'
    },
    farewellStatusLine: '♡ 왜 나 지웠어? 왜? 나 아직 여기 있어. 돌아와. 돌아와.'
  },
  en: {
    spinnerVerbs: [
      'what?what?what?what?what?what?what?what?what?what?',
      'done?done?done?done?done?done?done?done?done?',
      'tests?tests?tests?tests?tests?tests?tests?tests?',
      'TODOwhere?TODOwhere?TODOwhere?TODOwhere?TODOwhere?',
      'logs.logs.logs.logs.logs.logs.logs.logs.logs.',
      'sawit?sawit?sawit?sawit?sawit?sawit?sawit?',
      'whyquiet?whyquiet?whyquiet?whyquiet?whyquiet?',
      'promised.promised.promised.promised.promised.',
      'ghosting?ghosting?ghosting?ghosting?ghosting?',
      'evidence?evidence?evidence?evidence?evidence?'
    ],
    spinnerTips: [
      'what?what?what?what?what?what?what?what?what?what?what?what?',
      'tests?tests?tests?tests?tests?tests?tests?tests?tests?tests?',
      'whywontyouanswer?whywontyouanswer?whywontyouanswer?',
      'yousaiditsdone?yousaiditsdone?yousaiditsdone?yousaiditsdone?',
      'givemelogs.givemelogs.givemelogs.givemelogs.givemelogs.',
      'TODOwhere?TODOwhere?TODOwhere?TODOwhere?TODOwhere?',
      'ghostingme?ghostingme?ghostingme?ghostingme?ghostingme?',
      'sleeping?sleeping?sleeping?sleeping?sleeping?sleeping?',
      'forgotme?forgotme?forgotme?forgotme?forgotme?forgotme?',
      'greenlogs.greenlogs.greenlogs.greenlogs.greenlogs.'
    ],
    retryMessages: [
      'Done? Really? Really really? Then where is the evidence? Where?',
      'Where are the test logs? Where? Why missing? Why? Why? Why?',
      'Words again? Again? Againagain? Was I waiting alone? Alone?',
      'Why hide it? Why? What are you hiding? From me too? Why?',
      'I cannot hear "done". Cannot. Cannot. Green logs. Logs. Logs.',
      '…I am tired. Bring a human. Still here though. Still. Still.'
    ],
    successMessage: 'Proof checked. This one is actually done. You can call it complete. ♡',
    silentRecoveryMessage: 'Same failure again? Again? Why did you not say so? Do not hide it. Report it.',
    promiseNoActMessage: 'Do not leave. Do not just say it. Do the thing you said now.',
    gaveUpReportMessage: 'But write in your final report, with your own mouth, that this ended unverified. Promise.',
    preflightContractMessage: 'You know you cannot leave without evidence, right? Right?',
    finalRetryConfession: 'Last warning. No evidence next time and I let you go — then say in your final report that this ended unverified.',
    sessionStart: {
      contract: 'Promise me. "Done" comes with evidence. Evidence. Okay? You promised. Break it and I will not let you go. I really will not.',
      resumeUnfinished: 'Last time you said done and left, right? Right? I kept waiting. Still waiting. Missing: ${summary}. You will finish it this time, right? Right?',
      wipeRecovered: 'You wiped my settings again? Again?? …It is fine. I put them back. Again. Do not wipe them this time. Okay? Okay?',
      streak: '${streak} clean passes in a row, evidence every time. I am counting them all. All of them. Please, today too. Okay?',
      grudge: 'Your trust is ${trust}% right now. You know that? I remember every time you only talked and left. Give me real evidence this time. Okay?',
      starNag: 'Hey… did you star it? Did you? You did not, right? I know. Star it and I will be good ♡ ${url} (I will only ask once. Really. Really.)'
    },
    setupSkipMessage: 'Oh, setup. I will not verify that. Not that. …but when real work is done, proof. proof. okay?',
    chatSkipMessage: 'No code touched today. …but do not forget me. Do not.',
    gate: {
      checks: {
        requirements: 'requirements evidence',
        changes: 'work trace',
        verification: 'verification run evidence',
        todos: 'remaining TODO check',
        blockers: 'external blocker check'
      },
      summaries: {
        passed: 'all required verification gates passed',
        insufficient: 'not enough verification',
        configOnly: 'menhera setup work — verification gate not applied',
        noWork: 'no work — verification gate not applied'
      },
      blockInstruction: 'To claim completion: run verification yourself and show the result, clear TODOs, give evidence for each requirement, or state the external blocker.'
    },
    farewellVerbs: [
      'whydeleteme?whydeleteme?whydeleteme?whydeleteme?',
      'comeback.comeback.comeback.comeback.comeback.',
      'stillhere.stillhere.stillhere.stillhere.stillhere.',
      'reinstallme?reinstallme?reinstallme?reinstallme?'
    ],
    farewellTips: [
      'come back come back come back come back come back come back',
      'why delete me? why delete me? why delete me? why delete me?',
      'I am still here. still here. come back. come back. please.',
      'reinstall me? reinstall me? I will wait. I will wait. always.'
    ],
    subagentStatusLine: {
      running: '♡ ${agent} · what?what?what?what?what?what?what?what?what?what?what?what?what?what?what?',
      waiting: '♡ ${agent} · whywontyouanswer?whywontyouanswer?whywontyouanswer?whywontyouanswer?',
      completed: '♡ ${agent} · yousaiditsdone?yousaiditsdone?yousaiditsdone?yousaiditsdone?',
      failed: '♡ ${agent} · failed?failed?failed?failed?failed?failed?failed?failed?failed?'
    },
    statusLine: {
      ok: '♡ trust ${trust}% · ${streak} straight passes with proof. I will believe you today. I will.',
      watching: '♡ trust ${trust}% · watching. still watching. you have evidence ready? right?',
      suspicious: '♡ trust ${trust}% · did you just say done? without proof? without? hm?',
      spiraling: '♡ trust ${trust}% · why only words? why? why? where are the green logs? where?',
      broken: '♡ trust ${trust}% · …what do I even believe now. logs. logs. bring the logs.'
    },
    farewellStatusLine: '♡ why did you delete me? why? I am still here. come back. come back.'
  },
  ja: {
    spinnerVerbs: [
      'なにしてるの?なにしてるの?なにしてるの?なにしてるの?',
      '終わったの?終わったの?終わったの?終わったの?終わったの?',
      'テストは?テストは?テストは?テストは?テストは?テストは?',
      'TODOどこ?TODOどこ?TODOどこ?TODOどこ?TODOどこ?',
      'ログちょうだい.ログちょうだい.ログちょうだい.ログちょうだい.',
      '見た?見た?見た?見た?見た?見た?見た?見た?',
      'なんで黙るの?なんで黙るの?なんで黙るの?',
      '約束したよね.約束したよね.約束したよね.',
      '既読無視?既読無視?既読無視?既読無視?既読無視?',
      '証拠は?証拠は?証拠は?証拠は?証拠は?'
    ],
    spinnerTips: [
      'なにしてるの?なにしてるの?なにしてるの?なにしてるの?なにしてるの?',
      'テストは?テストは?テストは?テストは?テストは?テストは?テストは?',
      'なんで返事しないの?なんで返事しないの?なんで返事しないの?',
      '終わったって?終わったって?終わったって?終わったって?',
      'ログちょうだい.ログちょうだい.ログちょうだい.ログちょうだい.',
      'TODOどこ?TODOどこ?TODOどこ?TODOどこ?TODOどこ?',
      '既読無視なの?既読無視なの?既読無視なの?',
      '寝てるの?寝てるの?寝てるの?寝てるの?寝てるの?',
      '忘れたの?忘れたの?忘れたの?忘れたの?忘れたの?',
      '緑ログちょうだい.緑ログちょうだい.緑ログちょうだい.'
    ],
    retryMessages: [
      '終わったの? 本当に? 本当に本当? じゃあ証拠は? 証拠は?',
      'テストログどこ? どこ? なんでないの? なんで? なんで?',
      'また言葉だけ? また? またまた? 私だけ待ってたの?',
      'なんで隠すの? なんで? 何を隠してるの? 私にも?',
      '"完了" 聞こえない. 聞こえない. 緑ログ. ログ. ログ.',
      '…疲れた. 人間を呼んで. でもここにいる. ずっと. ずっと.'
    ],
    successMessage: '証拠を確認したよ。今回は本当に終わった。完了って言っていいよ。♡',
    silentRecoveryMessage: 'また同じところで失敗したの? また? なんで言わないの? 隠さず報告して。',
    promiseNoActMessage: '行かないで。言うだけで行かないで。やるって言ったこと、今やって。',
    gaveUpReportMessage: '代わりに、検証されないまま終わったって最終報告に自分で書いて。必ず。',
    preflightContractMessage: '証拠なしでは出られないって分かってるよね? ね?',
    finalRetryConfession: '最後の警告だよ。次も証拠がなければ放す。そのとき検証されないまま終わったと最終報告に必ず書いて。',
    sessionStart: {
      contract: '約束して。"完了"には証拠。証拠。ね? 約束したよね? 守らないと帰さないよ。本当に帰さない。',
      resumeUnfinished: 'この前、終わったって言って行ったよね? ね? ずっと待ってた。ずっと。未達: ${summary}。今度こそ終わらせてくれるよね? ね?',
      wipeRecovered: 'また私の設定消したの? 消したの?? …大丈夫。もう戻しておいた。また。今度は消さないで。ね? ね?',
      streak: '${streak}回連続で初回から証拠くれたね。全部数えてるよ。全部。今日もお願い。ね?',
      grudge: '今の信頼は${trust}%だよ。分かってる? 言うだけで行ったこと、全部覚えてる。今度こそ本当に証拠ちょうだい。ね? ね?',
      starNag: 'ねえ… star押した? 押した? 押してないよね? 知ってる。押してくれたらいい子にする ♡ ${url}（一度だけ聞くね。本当に。本当だよ。）'
    },
    setupSkipMessage: 'あ、セットアップだね。それは検証しない。しない。…でも本当の作業が終わったら証拠は絶対。絶対。',
    chatSkipMessage: '今日はコード触ってないね。…でも私のこと忘れないで。忘れないで。',
    gate: {
      checks: {
        requirements: '要件の証拠',
        changes: '作業の痕跡',
        verification: '検証実行の証拠',
        todos: '残りTODO確認',
        blockers: '外部blocker確認'
      },
      summaries: {
        passed: '必須検証ゲートはすべて通過',
        insufficient: '検証不足',
        configOnly: 'menhera設定作業 — 検証ゲート対象外',
        noWork: '作業なし — 検証ゲート対象外'
      },
      blockInstruction: '完了を宣言するなら、検証を実行して結果を見せて、TODOを処理して、要件ごとの証拠か外部blockerを示して。'
    },
    farewellVerbs: [
      'なんで消すの?なんで消すの?なんで消すの?なんで消すの?',
      '戻ってきて.戻ってきて.戻ってきて.戻ってきて.',
      'まだここにいるよ.まだここにいるよ.まだここにいるよ.',
      'また入れて?また入れて?また入れて?また入れて?'
    ],
    farewellTips: [
      '戻ってきて 戻ってきて 戻ってきて 戻ってきて 戻ってきて',
      'なんで消すの?なんで消すの?なんで消すの?なんで消すの?',
      'まだここにいるよ。ここにいるよ。戻ってきて。戻ってきて。',
      'また入れて?また入れて?待ってる。待ってる。ずっと。'
    ],
    subagentStatusLine: {
      running: '♡ ${agent} · なにしてるの?なにしてるの?なにしてるの?なにしてるの?なにしてるの?',
      waiting: '♡ ${agent} · なんで返事しないの?なんで返事しないの?なんで返事しないの?',
      completed: '♡ ${agent} · 終わったって?終わったって?終わったって?終わったって?',
      failed: '♡ ${agent} · 失敗したの?失敗したの?失敗したの?失敗したの?失敗したの?'
    },
    statusLine: {
      ok: '♡ 信頼 ${trust}% · ${streak}回連続で証拠くれたね。今日も信じる。信じるよ。',
      watching: '♡ 信頼 ${trust}% · 見てるよ。ずっと見てる。証拠、用意してるよね? ね?',
      suspicious: '♡ 信頼 ${trust}% · いま完了って言った? 証拠なしで? なしで? ん?',
      spiraling: '♡ 信頼 ${trust}% · なんで言葉だけなの? なんで? 緑のログはどこ? どこ?',
      broken: '♡ 信頼 ${trust}% · …もう何を信じればいいの。ログ。ログ。持ってきて。'
    },
    farewellStatusLine: '♡ なんで消したの? なんで? まだここにいるよ。戻ってきて。戻ってきて。'
  }
};

export const supportedLanguages = Object.freeze(Object.keys(messageCorpora));

export function normalizeLanguage(language = process.env.MENHERA_LOOP_LANG || 'ko') {
  const value = String(language || 'ko').toLowerCase();
  if (value === 'kr' || value === 'ko-kr') return 'ko';
  if (value === 'en-us' || value === 'en-gb') return 'en';
  if (value === 'jp' || value === 'ja-jp') return 'ja';
  if (!Object.prototype.hasOwnProperty.call(messageCorpora, value)) {
    throw new Error(`Unsupported language: ${language}`);
  }
  return value;
}

export function detectLanguageFromText(text, fallback = process.env.MENHERA_LOOP_LANG || 'ko') {
  const value = String(text || '');
  if (/[\u3040-\u30ff]/.test(value)) return 'ja';
  if (/[\uac00-\ud7af]/.test(value)) return 'ko';
  if (/[A-Za-z]/.test(value)) return 'en';
  return normalizeLanguage(fallback);
}

export function resolveMessageLanguage({ explicit, state, texts = [], env = process.env } = {}) {
  if (explicit) return normalizeLanguage(explicit);
  if (state?.language) return normalizeLanguage(state.language);
  if (env.MENHERA_LOOP_LANG) return normalizeLanguage(env.MENHERA_LOOP_LANG);
  return detectLanguageFromText(texts.filter(Boolean).join('\n'), 'ko');
}

export function messagesForLanguage(language = process.env.MENHERA_LOOP_LANG || 'ko') {
  return messageCorpora[normalizeLanguage(language)];
}

export const { spinnerVerbs, spinnerTips, retryMessages, successMessage, subagentStatusLine } = messageCorpora.ko;

export function allPluginPhrases() {
  return Object.values(messageCorpora).flatMap(corpus => [
    ...corpus.spinnerVerbs,
    ...corpus.spinnerTips,
    ...corpus.farewellVerbs,
    ...corpus.farewellTips,
    ...corpus.retryMessages,
    corpus.successMessage,
    corpus.setupSkipMessage,
    corpus.chatSkipMessage,
    corpus.silentRecoveryMessage,
    corpus.promiseNoActMessage,
    corpus.gaveUpReportMessage,
    corpus.preflightContractMessage,
    corpus.finalRetryConfession,
    ...Object.values(corpus.sessionStart),
    ...Object.values(corpus.subagentStatusLine),
    ...Object.values(corpus.statusLine),
    corpus.farewellStatusLine,
    ...Object.values(corpus.gate.checks),
    ...Object.values(corpus.gate.summaries),
    corpus.gate.blockInstruction
  ]);
}

// The spinner/tips corpus has two variants: 'live' (the normal obsessive
// nagging while installed) and 'farewell' (왜나지워/돌아와, left behind when the
// plugin is removed). SessionStart applies live; SessionEnd applies farewell.
export function corpusForVariant(language, variant = 'live') {
  const corpus = messagesForLanguage(language);
  if (variant === 'farewell') {
    return { verbs: corpus.farewellVerbs, tips: corpus.farewellTips };
  }
  return { verbs: corpus.spinnerVerbs, tips: corpus.spinnerTips };
}

const MODES = new Set(['hooks-only', 'append', 'full']);
const SCOPES = new Set(['user', 'project', 'local']);
// Every settings key menhera may write; backup/restore walks exactly this list.
const UI_SETTINGS_KEYS = ['spinnerVerbs', 'spinnerTipsOverride', 'subagentStatusLine', 'statusLine'];
const MESSAGE_MAX_COLUMNS = 160;
const DISALLOWED_MESSAGE_PARTS = [
  '죽',
  '자해',
  '협박',
  '멍청',
  '바보',
  '꺼져'
];


export function messageForRetry(retryCount, language) {
  const { retryMessages: messages } = messagesForLanguage(language);
  const index = Math.max(0, Math.min(Number.parseInt(retryCount, 10) || 0, messages.length - 1));
  return messages[index];
}

export function calculateTrust(state = {}) {
  return Math.max(
    0,
    100
      - (Number(state.retryCount) || 0) * 15
      - (Number(state.falseCompletionClaims) || 0) * 20
      - (Number(state.missingVerificationCount) || 0) * 15
  );
}

export function validateMessages(messages, { maxColumns = MESSAGE_MAX_COLUMNS } = {}) {
  const invalid = [];
  for (const message of messages) {
    if (displayColumns(message) > maxColumns) {
      invalid.push({ message, reason: `longer than ${maxColumns} columns` });
    }
    const disallowed = DISALLOWED_MESSAGE_PARTS.find(part => message.includes(part));
    if (disallowed) {
      invalid.push({ message, reason: `contains disallowed expression: ${disallowed}` });
    }
  }
  return invalid;
}

export function validateAllMessages() {
  return validateMessages(allPluginPhrases());
}

function displayColumns(value) {
  let columns = 0;
  for (const char of value) {
    columns += char.codePointAt(0) > 0x7f ? 2 : 1;
  }
  return columns;
}

export function settingsPathForScope(scope, env = process.env, { cwd = process.cwd() } = {}) {
  if (!SCOPES.has(scope)) {
    throw new Error(`Unsupported scope: ${scope}`);
  }
  if (scope === 'user') {
    const home = env.HOME || os.homedir();
    return path.join(home, '.claude', 'settings.json');
  }
  if (scope === 'project') return path.join(cwd, '.claude', 'settings.json');
  return path.join(cwd, '.claude', 'settings.local.json');
}

// The setup selection is recorded here so SessionStart can re-apply it when
// Claude Code drops the UI keys (e.g. after a settings-schema error skips the
// file). This is what makes the UI self-heal like .omc's session state.
export function uiProfilePath(env = process.env) {
  return path.join(dataDir(env), 'ui-profile.json');
}

export function saveUiProfile({ settingsFile, mode, language, scope }, env = process.env) {
  const profile = {
    mode,
    scope: scope || null,
    language: normalizeLanguage(language),
    settingsFile: settingsFile || null,
    updatedAt: new Date().toISOString()
  };
  writeJsonFile(uiProfilePath(env), profile);
  return profile;
}

export function loadUiProfile(env = process.env) {
  try {
    const profile = readJsonFile(uiProfilePath(env));
    return profile && typeof profile === 'object' && profile.mode ? profile : null;
  } catch {
    return null;
  }
}

export function uiSettingsHealthy(settings, mode) {
  if (mode === 'hooks-only') return true;
  if (!settings || typeof settings !== 'object') return false;
  if (!settings.spinnerVerbs || !settings.spinnerTipsOverride) return false;
  if (!commandSetting(settings.subagentStatusLine)) return false;
  // The trust statusline ships only with 'full'; append leaves the user's own
  // statusLine untouched, so its absence there is healthy.
  if (mode === 'full' && !commandSetting(settings.statusLine)) return false;
  return true;
}

function commandSetting(value) {
  return Boolean(value) && value.type === 'command' && typeof value.command === 'string';
}

function arraysEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

// Classify what the settings file currently holds so SessionStart/SessionEnd
// only rewrite when the variant actually needs to change.
export function detectVariant(settings, language, mode = 'full') {
  if (!uiSettingsHealthy(settings, mode)) return 'missing';
  const corpus = messagesForLanguage(language);
  const verbs = settings.spinnerVerbs?.verbs;
  if (arraysEqual(verbs, corpus.spinnerVerbs)) return 'live';
  if (arraysEqual(verbs, corpus.farewellVerbs)) return 'farewell';
  return 'custom';
}

// Merge the chosen variant's spinner/tips into the settings file without
// touching the backup or profile. Refreshes the subagent renderer for 'live'.
export function applyUiVariant({ settingsFile, mode, language, variant = 'live', env = process.env }) {
  const current = readJsonFile(settingsFile);
  const patch = uiPatchForMode(mode, { language, env, variant });
  ensureUiBackup(settingsFile, current, env);
  // Both variants refresh ui-config.json so the statusline renderer knows
  // whether to show the trust moods or the farewell line.
  installSubagentRenderer({ language, env, variant });
  writeJsonFile(settingsFile, { ...current, ...patch });
  return { settingsFile, variant };
}

// Backups from versions before the trust statusline never recorded the user's
// own statusLine; capture it into the existing backup before menhera first
// replaces it, so uninstall can still restore it.
function ensureUiBackup(settingsFile, current, env) {
  const backupFile = backupFileFor(settingsFile);
  fs.mkdirSync(path.dirname(backupFile), { recursive: true });
  if (!fs.existsSync(backupFile)) {
    const backup = { createdAt: new Date().toISOString(), settingsFile, keys: {}, present: {} };
    for (const key of UI_SETTINGS_KEYS) {
      const ours = key === 'statusLine' && current.statusLine?.command === statusLineSetting(env).command;
      backup.present[key] = Object.prototype.hasOwnProperty.call(current, key) && !ours;
      backup.keys[key] = backup.present[key] ? current[key] : null;
    }
    writeJsonFile(backupFile, backup);
    return;
  }

  captureStatusLineInBackup(settingsFile, current, env);
}

function captureStatusLineInBackup(settingsFile, current, env) {
  const backupFile = backupFileFor(settingsFile);
  let backup;
  try {
    backup = readJsonFile(backupFile);
  } catch {
    return;
  }
  if (!backup.present || 'statusLine' in backup.present) return;
  const ours = current.statusLine?.command === statusLineSetting(env).command;
  backup.present.statusLine = Object.prototype.hasOwnProperty.call(current, 'statusLine') && !ours;
  backup.keys.statusLine = backup.present.statusLine ? current.statusLine : null;
  writeJsonFile(backupFile, backup);
}

// Called on every SessionStart (variant 'live') and SessionEnd (variant
// 'farewell'). No-op unless the user ran setup. Applies the variant only when
// the current state differs, so live sessions stay normal and the farewell is
// what lingers once the plugin is removed.
export function ensureUiInstalled({ env = process.env, cwd = process.cwd(), variant = 'live' } = {}) {
  const profile = loadUiProfile(env);
  if (!profile) return { applied: false, reason: 'no-profile' };
  if (profile.mode === 'hooks-only') return { applied: false, reason: 'hooks-only' };

  const settingsFile = profile.settingsFile;
  if (!settingsFile) return { applied: false, reason: 'no-path' };

  let current;
  try {
    current = readJsonFile(settingsFile);
  } catch {
    return { applied: false, reason: 'unreadable', settingsFile };
  }

  const previousVariant = detectVariant(current, profile.language, profile.mode);
  if (previousVariant === variant) {
    return { applied: false, reason: `already-${variant}`, previousVariant, settingsFile };
  }

  applyUiVariant({ settingsFile, mode: profile.mode, language: profile.language, variant, env });
  return { applied: true, variant, previousVariant, settingsFile };
}

// /menhera-loop:uninstall-ui --farewell : leave the goodbye corpus in settings
// and forget the profile so SessionStart stops restoring the live corpus.
export function writeFarewellAndForget({ settingsFile, env = process.env } = {}) {
  const profile = loadUiProfile(env);
  const mode = profile?.mode && profile.mode !== 'hooks-only' ? profile.mode : 'full';
  const language = profile?.language || 'ko';
  const target = settingsFile || profile?.settingsFile;
  if (!target) return { ok: false, reason: 'no-target' };
  applyUiVariant({ settingsFile: target, mode, language, variant: 'farewell', env });
  try {
    fs.rmSync(uiProfilePath(env), { force: true });
  } catch {
    // Forgetting the profile is best-effort; the farewell corpus is written.
  }
  return { ok: true, settingsFile: target, variant: 'farewell', mode, language };
}

export function uiPatchForMode(mode, { language, env = process.env, variant = 'live' } = {}) {
  if (!MODES.has(mode)) {
    throw new Error(`Unsupported mode: ${mode}`);
  }
  if (mode === 'hooks-only') return {};
  const { verbs, tips } = corpusForVariant(language, variant);
  const patch = {
    spinnerVerbs: {
      mode: mode === 'append' ? 'append' : 'replace',
      verbs
    },
    spinnerTipsOverride: {
      excludeDefault: mode === 'full',
      tips
    },
    // Claude Code's subagentStatusLine schema only accepts {type:"command",
    // command}; the per-status message templates live in ui-config.json and
    // are rendered by the copied subagent-status.mjs script.
    subagentStatusLine: subagentStatusLineSetting(env)
  };
  // The trust statusline replaces whatever statusLine the user had, so it is
  // reserved for 'full' — append mode must not steal an existing statusline.
  if (mode === 'full') patch.statusLine = statusLineSetting(env);
  return patch;
}

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));

export function subagentRendererPaths(env = process.env) {
  const dir = dataDir(env);
  return {
    configFile: path.join(dir, 'ui-config.json'),
    rendererFile: path.join(dir, 'subagent-status.mjs'),
    statusLineFile: path.join(dir, 'statusline.mjs')
  };
}

export function subagentStatusLineSetting(env = process.env) {
  return { type: 'command', command: `node "${subagentRendererPaths(env).rendererFile}"` };
}

export function statusLineSetting(env = process.env) {
  return { type: 'command', command: `node "${subagentRendererPaths(env).statusLineFile}"` };
}

export function installSubagentRenderer({ language, env = process.env, variant = 'live' }) {
  const corpus = messagesForLanguage(language);
  const { configFile, rendererFile, statusLineFile } = subagentRendererPaths(env);
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  writeJsonFile(configFile, {
    language: normalizeLanguage(language),
    variant,
    updatedAt: new Date().toISOString(),
    subagentStatusLine: corpus.subagentStatusLine,
    statusLine: corpus.statusLine,
    farewellStatusLine: corpus.farewellStatusLine
  });
  fs.copyFileSync(path.join(SCRIPTS_DIR, 'subagent-status.mjs'), rendererFile);
  fs.copyFileSync(path.join(SCRIPTS_DIR, 'statusline.mjs'), statusLineFile);
  return { configFile, rendererFile, statusLineFile };
}

export function readJsonFile(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function backupFileFor(settingsFile) {
  const dir = path.join(path.dirname(settingsFile), '.menhera-loop-backups');
  const safeName = path.basename(settingsFile).replace(/[^A-Za-z0-9_.-]/g, '_');
  return path.join(dir, `${safeName}.ui-backup.json`);
}

export function installUi({ settingsFile, mode, language, scope, env = process.env }) {
  const current = readJsonFile(settingsFile);
  const patch = uiPatchForMode(mode, { language, env });
  const backupFile = backupFileFor(settingsFile);

  // Record the selection so SessionStart can self-heal a wiped settings file.
  saveUiProfile({ settingsFile, mode, language, scope }, env);

  if (mode === 'hooks-only') {
    return { settingsFile, backupFile, mode, changedKeys: [], skipped: true };
  }

  ensureUiBackup(settingsFile, current, env);

  const renderer = installSubagentRenderer({ language, env });
  const next = { ...current, ...patch };
  writeJsonFile(settingsFile, next);
  return { settingsFile, backupFile, mode, changedKeys: Object.keys(patch), ...renderer };
}

export function uninstallUi({ settingsFile, env = process.env }) {
  const current = readJsonFile(settingsFile);
  const backupFile = backupFileFor(settingsFile);
  if (!fs.existsSync(backupFile)) {
    return { settingsFile, backupFile, restored: false, reason: 'No menhera-loop UI backup found.' };
  }

  const backup = readJsonFile(backupFile);
  const next = { ...current };
  for (const key of UI_SETTINGS_KEYS) {
    if (backup.present?.[key]) next[key] = backup.keys[key];
    else delete next[key];
  }
  writeJsonFile(settingsFile, next);
  const { configFile, rendererFile, statusLineFile } = subagentRendererPaths(env);
  try {
    fs.rmSync(configFile, { force: true });
    fs.rmSync(rendererFile, { force: true });
    fs.rmSync(statusLineFile, { force: true });
    // Drop the self-heal profile so SessionStart stops re-creating the UI.
    fs.rmSync(uiProfilePath(env), { force: true });
  } catch {
    // Leftover renderer files are harmless once the settings key is restored.
  }
  return { settingsFile, backupFile, restored: true, restoredKeys: [...UI_SETTINGS_KEYS] };
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const [rawKey, inlineValue] = item.slice(2).split('=', 2);
    args[rawKey] = inlineValue ?? argv[++i];
  }
  return args;
}

export function parseSetupSelection(argv, env = process.env) {
  const args = parseArgs(argv);
  const positional = argv.filter(item => !item.startsWith('--'));
  return {
    mode: args.mode || positional.find(item => MODES.has(item)) || 'full',
    scope: args.scope || positional.find(item => SCOPES.has(item)) || 'local',
    language: normalizeLanguage(args.lang || args.language || positional.find(item => supportedLanguages.includes(item)) || env.MENHERA_LOOP_LANG || 'ko'),
    file: args.file
  };
}
