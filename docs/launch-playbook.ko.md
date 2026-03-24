# ui-evidence 런치 플레이북

이 문서는 `ui-evidence`를 오픈소스 프로젝트로 홍보할 때 바로 쓸 수 있는 실행 순서, 데모 자산 가이드, 채널별 카피 초안을 정리한 내부용 문서입니다.

## 1. 먼저 고정할 메시지

### 한 줄 포지셔닝

가장 먼저 써볼 문장:

> AI가 UI를 수정한 뒤, 무엇이 실제로 바뀌었는지 사람이 빠르게 검토할 수 있게 해주는 로컬 before/after UI evidence 도구

짧게 줄인 버전:

- `Local before/after UI review for agent-driven changes`
- `Capture what AI changed, then review it side by side`
- `Before/after UI evidence for AI-assisted frontend work`

### 스토리의 중심

이 프로젝트의 가장 좋은 메시지는 기능 목록이 아니라 문제의 출발점입니다.

- AI로 UI를 수정하다 보면 모델이 엉뚱한 곳까지 만지거나, 바뀌어야 할 화면 하나를 빼먹는 일이 생김
- 그래서 수정 전후 이미지를 바로 비교해서 사람이 빠르게 확인할 수 있으면 도움이 되겠다고 판단함
- 실제로 현재 작업 중인 프로젝트에서 디자인 시스템 도입 과정에 써봤고, 빠진 화면과 어긋난 버튼 스타일을 빨리 찾는 데 도움이 됨
- 앞으로도 계속 쓸 예정인 도구를 오픈소스로 공개한 것

### 피해야 할 표현

아래 표현은 이 프로젝트와 잘 맞지 않습니다.

- `revolutionary`
- `game-changing`
- `the best`
- `powered by AI` 를 제목 첫 줄에 넣는 방식
- `skill-first local CLI for the wider agent-skills ecosystem` 같은 내부 관점 설명

이 프로젝트는 과장보다 구체성이 먹힙니다.

## 2. 추천 실행 순서

### 1단계. GitHub부터 정리

가장 먼저 해야 할 일:

- GitHub repo `About` 문구 정리
- 대표 이미지 1장 준비
- 20초 영상 1개 준비
- GitHub release 1개 만들기
- repo topic 추가

이유:

- GitHub topics는 프로젝트를 찾고 기여할 저장소를 탐색할 때 바로 쓰이는 분류 체계입니다 [1]
- 외부 채널에서 링크를 타고 들어오는 사람도 결국 GitHub 랜딩 페이지에서 판단합니다

추천 `About` 문구:

> Local before/after UI evidence for agent-driven changes. Capture screenshots, build comparisons, and review what AI actually changed.

추천 topic:

- `claude-code-skills`
- `agent-skills`
- `codex`
- `playwright`
- `visual-regression`
- `ui-review`
- `developer-tools`
- `open-source`

GitHub topic 메모:

- 소문자, 숫자, 하이픈 사용
- 50자 이하
- 20개 이하 권장 [1]

### 2단계. 대표 데모 1장 만들기

이 프로젝트의 대표 이미지는 “제품 소개 배너”보다 “실제 결과물”이어야 합니다.

가장 좋은 방향:

- 이미 있는 `archive-ledger-mobile__mobile-390__overview.png` 같은 overview 이미지를 메인으로 사용
- `before / after / comparison / review`가 한 번에 연상되게 유지
- 작은 기능 설명 텍스트만 얹고 과한 박스, 화살표, 밈 스타일 강조는 피함

권장 구도:

1. 캔버스: `1600x900` PNG
2. 배경: `review` HTML과 같은 톤의 밝은 베이지 계열
3. 중앙: showcase overview 이미지
4. 상단 짧은 헤드라인:
   `AI changed the UI. This lets you review it fast.`
5. 하단 보조 라인:
   `before · after · comparisons · review page`

권장 텍스트 후보:

- `AI changed the UI. Review the evidence.`
- `Before/after evidence for AI-assisted UI work`
- `Catch the screens AI changed and the ones it missed`

지금 컨셉에 가장 잘 맞는 한 장:

- 기존 `archive-ledger-mobile` overview를 그대로 주인공으로 두기
- 별도 목업 합성보다 실제 산출물 느낌을 유지하기
- “버튼 디자인 시스템 적용 전후”라는 맥락은 게시글 본문에서 설명하기

### 3단계. 20초 영상 만들기

이 프로젝트는 데모 영상이 길면 오히려 약해집니다. `review/index.html`이 실제 사람이 보는 산출물이라는 점을 바로 보여주는 20초짜리 짧은 영상이 맞습니다.

#### 추천 시나리오

0s-3s

- 정지 화면: overview PNG
- 자막:
  `AI changed a design system rollout across multiple screens`

3s-7s

- pair comparison 한 장으로 줌
- 자막:
  `before and after, side by side`

7s-13s

- `review/index.html`을 열고 카드 영역을 천천히 스크롤
- 자막:
  `one local review page a human can scan quickly`

13s-17s

- viewport 또는 status 필터를 한 번 바꿈
- 자막:
  `useful when AI quietly misses a screen`

17s-20s

- repo URL 또는 프로젝트명
- 자막:
  `ui-evidence`

#### 촬영 원칙

- 음성 없이 자막만
- 마우스 이동은 느리게
- 창 크기는 `1440px` 이상
- 너무 많은 컷 전환 금지
- 브랜딩보다 실제 사용 장면 우선

#### 도구 추천

- 가장 편한 선택: `Screen Studio`
- 무료/기본: `QuickTime` 또는 `OBS`
- 후처리: `ffmpeg`

`ffmpeg` 예시:

```bash
ffmpeg -i input.mov \
  -vf "fps=30,scale=1920:-2:flags=lanczos,format=yuv420p" \
  -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart \
  ui-evidence-demo.mp4
```

LinkedIn이나 Product Hunt용으로 조금 더 짧게 자를 때:

```bash
ffmpeg -ss 0 -t 20 -i ui-evidence-demo.mp4 -c copy ui-evidence-demo-20s.mp4
```

## 3. 채널별 실행 순서

### 1. GitHub

가장 먼저 할 것:

- repo `About` 문구 수정
- topics 추가
- `v0.1.0` release 생성
- release 본문에 대표 이미지 1장과 짧은 문제 설명 추가

추천 release title:

> `v0.1.0: before/after UI evidence for AI-assisted changes`

추천 release 본문:

```md
I built `ui-evidence` because AI coding tools were sometimes changing the wrong UI or skipping screens during frontend work.

This project captures before/after screenshots, builds pair comparisons, and generates a local review page a human can scan quickly.

I started using it in a real design-system rollout and it helped me spot screens the model had missed.

Key outputs:

- raw `before/` and `after/` captures
- pair comparison images
- overview sheets
- `review/index.html`
```

### 2. Show HN

왜 두 번째인가:

- 개발자 도구와 실제 워크플로 개선 도구는 HN과 잘 맞습니다 [2]
- 다만 HN은 제목 과장, 홍보톤, 업보트 유도에 매우 민감합니다 [2]

주의:

- 제목은 담백하게
- 댓글에서 업보트 요청 금지 [2]
- HN 댓글은 AI 생성이나 AI 편집 댓글을 금지합니다 [2]
- 아래 코멘트 초안은 반드시 당신 말투로 다시 써서 올리는 것이 좋습니다

추천 제목:

- `Show HN: ui-evidence – before/after UI review for agent-driven changes`
- `Show HN: ui-evidence – local UI evidence for AI-assisted frontend work`

추천 첫 코멘트에 들어갈 포인트:

- 왜 만들었는지:
  AI가 UI를 건드리면서 엉뚱한 데까지 바꾸거나, 바뀌어야 할 화면 하나를 빼먹는 일이 반복됐다
- 뭘 하는지:
  before/after 캡처, pair comparison, review HTML 생성
- 실제 사용 사례:
  디자인 시스템 버튼 적용 작업에서 여러 화면을 한 번에 확인하는 데 써봤다
- 어떤 사람에게 맞는지:
  Claude Code, Codex, Playwright 기반 UI 작업을 자주 하는 사람
- 원하는 피드백:
  캡처/비교 워크플로, config UX, review output에서 무엇이 더 필요해 보이는지

HN용 초안 골격:

```text
I built this because AI-assisted UI work kept producing the same problem for me:

- a few correct changes
- a few unrelated changes
- one or two screens quietly missed

So I wanted a simple local workflow that captures before/after screenshots, builds side-by-side comparisons, and gives me one review page to scan before I trust the change.

I’ve started using it on a real design-system rollout in my current project, and it helped me catch screens the model skipped.

Would especially love feedback on:

- whether the current review output is enough
- where config/setup still feels too heavy
- which baseline workflow people actually want in practice
```

### 3. X

X는 짧고 선명해야 합니다. 문제를 한 줄로 말하고, 실제 결과물을 보여주고, 링크를 붙이면 됩니다.

단일 포스트 버전:

```text
AI coding tools were sometimes changing the wrong UI or quietly missing screens during frontend work.

So I built ui-evidence:

- capture before/after screenshots
- build side-by-side comparisons
- generate one local review page to scan fast

I’ve started using it in a real design-system rollout and it already helped me catch missed screens.

Open source: https://github.com/0xBrewing/ui-evidence
```

스레드 버전:

```text
1/ AI coding tools are great at making UI changes quickly.

They’re also great at quietly changing the wrong thing.
```

```text
2/ I kept running into the same review problem:

- some screens changed correctly
- some got touched accidentally
- some were missed entirely
```

```text
3/ So I built ui-evidence.

It captures before/after screenshots, builds pair comparisons, and generates a local review page a human can scan quickly.
```

```text
4/ I’ve started using it on a real design-system rollout in my current project.

It was especially useful for finding screens the model had skipped.
```

```text
5/ Open source:
https://github.com/0xBrewing/ui-evidence
```

### 4. Bluesky

Bluesky는 X보다 덜 광고 같고, 더 대화형인 문장이 잘 맞습니다. 과하게 polished된 문장보다 “이런 문제가 있었고, 그래서 만들었다”가 낫습니다. Bluesky의 커뮤니티 가이드라인도 스팸성 행위를 금지합니다 [3].

추천 포스트:

```text
AI로 프론트 작업하다 보면 이상하게 이런 일이 생기더라고요.

원한 수정은 일부만 들어가고
엉뚱한 화면도 조금 바뀌고
정작 바뀌어야 할 화면 하나는 빠지는 식으로요.

그래서 before/after 캡처를 바로 비교해서 볼 수 있는 로컬 도구를 만들었습니다.

`ui-evidence`는
- before/after 스크린샷을 캡처하고
- pair comparison 이미지를 만들고
- 사람이 빠르게 볼 수 있는 review 페이지를 생성합니다.

지금 실제 프로젝트의 디자인 시스템 적용 작업에도 써보고 있는데 꽤 도움이 됐습니다.

https://github.com/0xBrewing/ui-evidence
```

### 5. LinkedIn

LinkedIn은 문제 정의, 실제 경험, 짧은 인사이트, 이미지 또는 짧은 영상이 중요합니다. LinkedIn 공식 공유 가이드도 이미지/영상, 질문, 대화 유도, 짧은 포스트를 권장합니다 [4].

추천 포스트:

```text
AI로 UI를 수정할 때 제일 불편했던 건 “속도”가 아니라 “검토”였습니다.

수정 자체는 빨라졌는데,
정말 바뀌어야 할 화면이 다 바뀌었는지,
엉뚱한 화면이 같이 건드려지진 않았는지,
사람이 다시 확인하는 시간이 꽤 들었습니다.

그래서 `ui-evidence`를 만들었습니다.

이 도구는
- 수정 전후 UI를 캡처하고
- 나란히 비교 이미지를 만들고
- 사람이 빠르게 훑어볼 수 있는 로컬 review 페이지를 생성합니다.

최근 실제 프로젝트에서 디자인 시스템을 도입하면서 써봤는데,
AI가 조용히 빼먹은 화면을 빨리 찾는 데 꽤 유용했습니다.

지금도 계속 사용할 생각이고, 오픈소스로 공개했습니다.

혹시 AI-assisted frontend workflow에서
가장 귀찮은 검토 단계가 무엇인지 궁금합니다.

https://github.com/0xBrewing/ui-evidence
```

추천 해시태그:

- `#opensource`
- `#frontend`
- `#playwright`
- `#developertools`
- `#aiagents`

### 6. Product Hunt

Product Hunt는 지금도 draft와 scheduling이 가능하고, 태그라인은 60자 제한, 설명은 500자 제한, maker first comment가 중요합니다 [5][6]. 또한 Product Hunt는 과한 문구보다 짧고 명확한 태그라인을 권장합니다 [5].

추천 Product Hunt 이름:

> `ui-evidence`

추천 tagline 후보:

- `Local before/after UI review for AI coding changes`
- `Capture and review what AI actually changed in the UI`

추천 description:

```text
ui-evidence is a local CLI for AI-assisted frontend work. It captures before/after UI screenshots, builds side-by-side comparison images, and generates a review page a human can scan quickly. I built it after running into the same problem over and over: AI tools making some correct UI changes, some unintended ones, and quietly missing a few screens. I’m now using it in a real design-system rollout.
```

추천 first comment:

```text
Hey Product Hunt,

I built ui-evidence because AI-assisted UI work kept creating the same review problem for me:

• some screens changed correctly
• some unrelated UI changed too
• one or two screens were quietly missed

So I wanted a simple local workflow that captures before/after screenshots, builds side-by-side comparisons, and gives me one review page to scan before I trust the change.

I’ve already started using it on a real design-system rollout in my current project, and it helped me catch screens the model had skipped.

If you work with AI coding tools, I’d love to hear:

• what your current review workflow looks like
• where this setup still feels too heavy
• what outputs you’d want beyond screenshots + review HTML
```

추천 launch 태그:

- `AI Coding Agents`
- `Code Review Tools`
- `Vibe Coding Tools`

메모:

- 위 태그는 현재 Product Hunt 카테고리와 트렌딩 분류를 바탕으로 한 추천입니다 [5]
- 실제 제출 화면에서 사용 가능한 태그를 확인하고 가장 가까운 3개를 고르세요

### 7. DevHunt

DevHunt는 개발자 도구 전용 런치패드에 가깝고, 스스로를 “A launchpad for dev tools, built by developers. Open-source and fair.”라고 설명합니다 [7]. 이 프로젝트와 결이 잘 맞습니다.

추천 title:

> `ui-evidence — Local before/after UI review for AI-assisted changes`

추천 short description:

```text
Open-source local CLI for AI-assisted frontend work. Capture before/after screenshots, build side-by-side comparisons, and review what changed before you trust the UI.
```

추천 maker intro:

```text
I built ui-evidence after running into the same problem with AI-assisted UI work: a few correct changes, a few unintended ones, and a few screens quietly missed. I wanted a simple local review workflow instead of manually stitching screenshots together. I’m already using it in a real design-system rollout, and it’s been useful for catching screens the model skipped.
```

### 8. Reddit

Reddit는 채널별 규칙 차이가 커서 가장 마지막에 가는 편이 안전합니다. Reddit 자체 가이드도 홍보 시 subreddit 규칙과 사이트 정책을 따르라고 명시합니다 [8]. 특정 서브레딧은 제품 홍보를 명시적으로 금지하기도 합니다.

따라서 Reddit에서는:

- 규칙 확인 전까지 링크 포스트 금지
- “홍보”보다 “피드백 요청” 톤
- 한 커뮤니티에 한 번만
- 댓글에서 구현 배경과 실제 사용 경험 설명

추천 글 방향 1. 피드백 요청형

```text
AI-assisted frontend work 하다 보면,
원한 수정은 일부만 들어가고
엉뚱한 화면이 같이 바뀌거나
정작 바뀌어야 할 화면 하나가 빠지는 경우가 있었습니다.

그래서 before/after UI를 바로 비교해서 볼 수 있는 로컬 도구를 만들었습니다.

지금 실제 디자인 시스템 적용 작업에 써보고 있는데,
AI가 빼먹은 화면을 빨리 찾는 데 도움이 되더라고요.

이런 workflow를 이미 쓰는 분들이 있는지,
있다면 어떤 출력물이 가장 유용한지 궁금합니다.
```

추천 글 방향 2. 사용 사례형

```text
최근 디자인 시스템 버튼 적용 작업을 하면서
AI가 일부 화면은 잘 고쳤는데,
몇 화면은 그대로 두거나 다른 부분까지 건드리는 경우가 있었습니다.

그래서 수정 전후 이미지를 한 번에 비교하는 로컬 도구를 만들었고,
실제로 누락된 화면을 찾는 속도가 꽤 빨라졌습니다.

혹시 비슷한 문제를 겪는 분들이 있다면,
어떤 review artifact가 가장 필요할지 듣고 싶습니다.
```

### 9. 디렉터리 제출

#### FOSS Alternative

FOSS Alternative는 “어떤 잘 알려진 도구의 대안인가?”를 적는 형태의 제출 흐름을 제공합니다 [9].

이 프로젝트는 아래 포지셔닝이 가장 무난합니다:

- `Percy` 대안
- `Chromatic`의 일부 로컬 대안
- `Applitools`보다 가벼운 로컬 before/after review 대안

추천 짧은 설명:

```text
Local open-source UI review tool for before/after screenshots, pair comparisons, and human-readable review pages, built for AI-assisted frontend workflows.
```

## 4. 채널별 스타일 차이 요약

### GitHub

- 가장 사실적으로
- 기능보다 “왜 만들었는지” 먼저
- 이미지 1장 필수

### HN

- 담백함
- 기술적 맥락
- 직접 쓴 댓글
- 업보트 요청 금지 [2]

### X

- 짧고 선명하게
- 문제 -> 해결 -> 링크

### Bluesky

- 더 대화형
- 덜 polished
- 스팸처럼 보이는 문장 금지 [3]

### LinkedIn

- 개인 경험 중심
- 짧은 문단
- 질문으로 마무리 [4]

### Product Hunt

- 명확한 tagline
- maker story
- first comment 중요 [5]

### DevHunt

- dev tool다운 설명
- open-source와 실제 워크플로 강조 [7]

### Reddit

- 규칙 확인 전 금지
- 링크보다 맥락
- 홍보보다 피드백

## 5. 가장 먼저 바로 실행할 체크리스트

이번 주에 바로 할 일:

1. GitHub `About` 문구와 topics 업데이트
2. overview 기반 대표 이미지 1장 제작
3. `review/index.html` 스크롤 중심 20초 영상 제작
4. GitHub release 게시
5. `Show HN` 제목 확정
6. X, Bluesky, LinkedIn용 게시물 준비
7. Product Hunt draft 작성
8. DevHunt 제출
9. Reddit는 각 서브레딧 규칙 확인 후 피드백형으로만 진행

## 참고 자료

[1] GitHub Docs, “Classifying your repository with topics”  
https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics

[2] Hacker News Guidelines  
https://news.ycombinator.com/newsguidelines.html

[3] Bluesky Community Guidelines  
https://bsky.social/about/support/community-guidelines

[4] LinkedIn, “Best Practices for Posting on LinkedIn”  
https://content.linkedin.com/content/dam/help/linkedin/en-us/LinkedIn-Sharing-Guide.pdf

[5] Product Hunt, “Preparing for launch”  
https://www.producthunt.com/launch/preparing-for-launch

[6] Product Hunt Changelog, draft/scheduling updates  
https://www.producthunt.com/changes

[7] DevHunt homepage  
https://devhunt.org/

[8] Reddit for Developers, “Publishing an app”  
https://developers.reddit.com/docs/publishing

[9] FOSS Alternative submit flow  
https://fossalternative.com/submit
