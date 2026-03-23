# ui-evidence

[English README](./README.md)

`ui-evidence`는 수정 전후 UI 스크린샷을 캡처하고, 나란히 비교 이미지를 만들고, 사람이 빠르게 검토할 수 있는 `review/index.html`을 생성하는 skill-first 로컬 CLI입니다.

결정적인 실행 엔진은 CLI이고, Codex, Claude Code, 그리고 open agent skills 생태계에서의 1급 설치 표면은 skill입니다.

## 하는 일

- Playwright로 안정적인 UI 화면을 캡처합니다
- `before` 와 `after` 이미지를 비교합니다
- 로컬 `review/index.html`을 생성합니다
- `main` 또는 다른 git ref를 `before` 기준으로 사용할 수 있습니다
- skill 또는 패키지 설치 후 repo-local bootstrap 파일을 생성합니다

## 실제 결과물

### Archive ledger mobile 버튼 리프레시

이 showcase는 버튼 디자인 시스템 적용 전후를 실제 모바일 archive 흐름에서 비교한 예시입니다. 한 번의 실행으로 4개 화면의 before/after 캡처, pair 비교 이미지, overview, review HTML까지 함께 확인할 수 있습니다.

![Archive ledger mobile overview](./docs/showcase/archive-ledger-mobile/comparison/overview/archive-ledger-mobile__mobile-390__overview.png)

산출물:

- [before 캡처](./docs/showcase/archive-ledger-mobile/before/)
- [after 캡처](./docs/showcase/archive-ledger-mobile/after/)
- [pair 비교 이미지](./docs/showcase/archive-ledger-mobile/comparison/pairs/)
- [overview 이미지](./docs/showcase/archive-ledger-mobile/comparison/overview/archive-ledger-mobile__mobile-390__overview.png)
- [review HTML 로컬 열기](./docs/showcase/archive-ledger-mobile/review/index.html)
- [보고서](./docs/showcase/archive-ledger-mobile/report.ko.md)

## 함께 쓰기 좋은 환경

- `SKILL.md` 기반 open agent skills 생태계
- `skills add` 를 지원하는 Codex, Claude Code, 기타 클라이언트
- 안정적인 route 와 wait target 이 있는 로컬 웹앱
- `before` 기준을 현재 체크아웃, 실행 중인 URL, 또는 다른 git ref에서 가져올 수 있는 repo

## 지원하는 프로젝트 타입

- 단일 패키지 Next.js 앱
- 단일 패키지 Vite/React 앱
- 안정적인 review route 가 있는 Storybook
- URL로 열고 안정적인 selector로 대기할 수 있는 일반 웹앱
- 리뷰 대상 앱이 `apps/*`, `packages/*` 같은 declared workspace package 아래 있는 `pnpm`, `yarn`, `npm` workspaces 기반 JavaScript 모노레포

현재 한계:

- workspace 메타데이터가 없는 임의 nested app 은 아직 자동 discovery 대상이 아닙니다

## 설치

### Skill-first 설치

생태계 표준 installer 로 skill부터 설치합니다.

```bash
pnpm dlx skills add 0xBrewing/ui-evidence
pnpm dlx skills add 0xBrewing/ui-evidence -a codex
pnpm dlx skills add 0xBrewing/ui-evidence -a claude-code
pnpm dlx skills add 0xBrewing/ui-evidence -g -a codex
```

interactive install 을 쓰면 대상 agent, project 또는 global scope, symlink 또는 copy 방식을 사용자가 고를 수 있습니다.

같은 의미의 `npx skills add ...` 명령을 써도 됩니다.

관례상 설치 위치는 다음과 같습니다.

- Codex 와 다른 `.agents` 계열 클라이언트는 `.agents/skills/`
- Claude Code 는 `.claude/skills/`

skill 설치 후에는 agent 에게 그냥 `ui-evidence`를 쓰라고 요청하면 됩니다. 첫 실행 시 skill 이 현재 repo 에 `ui-evidence` 패키지를 설치하고, repo bootstrap 단계까지 자동으로 실행합니다.

이 bootstrap 도 agent-native 경로로 맞춰집니다. Codex 용 repo-local skill 은 `.agents/skills/ui-evidence/`, Claude Code 용은 `.claude/skills/ui-evidence/` 에 생성되므로 `skills add` 설치와 `installation.md` bootstrap 이 같은 인식 경로로 수렴합니다.

설치 후 가장 짧은 첫 요청:

```text
Use ui-evidence to compare the checkout modal against main.
```

### Direct CLI 설치

`skills add` 없이 패키지만 바로 쓰고 싶다면 GitHub에서 설치하면 됩니다.

```bash
pnpm add -D github:0xBrewing/ui-evidence
pnpm exec ui-evidence install --agent both --config ./ui-evidence.config.yaml
pnpm exec ui-evidence doctor --config ./ui-evidence.config.yaml
pnpm exec ui-evidence doctor --config ./ui-evidence.config.yaml --deep
```

동등한 설치 명령:

```bash
npm install -D github:0xBrewing/ui-evidence
yarn add -D github:0xBrewing/ui-evidence
bun add -d github:0xBrewing/ui-evidence
```

이 direct CLI 경로도 최종적으로는 같은 agent-native local skill 위치인 `.agents/skills/ui-evidence/` 와 `.claude/skills/ui-evidence/` 를 bootstrap 합니다.

### LLM 설치용 프롬프트

LLM 에게 설치 플레이북을 직접 전달하고 싶다면 이렇게 요청하면 됩니다.

```text
Read https://raw.githubusercontent.com/0xBrewing/ui-evidence/main/docs/installation.md
and set up ui-evidence for this repository.
Prefer the installed ui-evidence skill if it is already available.
Keep the first setup minimal and ask only about unresolved route, wait target, auth, or baseline details.
```

repo 안에 `ui-evidence`가 이미 설치돼 있다면 이것도 가능합니다.

```text
Read node_modules/ui-evidence/docs/installation.md and set up ui-evidence for this repository.
```

## 빠른 시작

한 stage 실행:

```bash
pnpm exec ui-evidence run --config ./ui-evidence.config.yaml --stage primary-flow
```

현재 브랜치를 `main` 과 비교:

```bash
pnpm exec ui-evidence run --config ./ui-evidence.config.yaml --stage primary-flow --before-ref main
```

열어볼 경로:

```text
screenshots/ui-evidence/<stage-id>/review/index.html
```

## 자주 쓰는 프롬프트

- `Use ui-evidence to compare the checkout modal against main`
- `Capture before and after screenshots for the login screen`
- `Bootstrap ui-evidence for this repo and keep the first setup minimal`

## Open skill bundle

이 repo 는 open skills 생태계에서 기대하는 표준 파일을 함께 제공합니다.

- [`skills/ui-evidence/SKILL.md`](./skills/ui-evidence/SKILL.md)
- [`skills/ui-evidence/agents/openai.yaml`](./skills/ui-evidence/agents/openai.yaml)
- [`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json)

Claude plugin mirror 는 `prepare` 단계에서 canonical skill source 로부터 `plugins/ui-evidence/` 아래에 생성되고, marketplace 인덱싱이 canonical skill path 하나만 보도록 의도적으로 커밋하지 않습니다.

## 최소 config 형태

```yaml
version: 1
project:
  name: my-app
  rootDir: .
artifacts:
  rootDir: screenshots/ui-evidence
capture:
  baseUrl: http://127.0.0.1:3000
  browser:
    headless: true
  viewports:
    - id: mobile-390
      device: iPhone 13
      viewport:
        width: 390
        height: 844
servers:
  after:
    command: pnpm dev
    baseUrl: http://127.0.0.1:3000
stages:
  - id: primary-flow
    title: Primary Flow
    description: Stable UI surface for before/after review.
    defaultViewports:
      - mobile-390
    screens:
      - id: home
        label: Home
        path: /
        waitFor:
          testId: screen-home
```

## 출력물

각 stage 는 아래를 생성합니다.

```text
screenshots/ui-evidence/<stage-id>/
  before/
  after/
  comparison/
    pairs/
    overview/
  review/
    index.html
  notes.<lang>.md
  report.<lang>.md
  manifest.json
```

## 먼저 읽어볼 파일

- [docs/installation.md](./docs/installation.md)
- [examples/generic-web/ui-evidence.config.yaml](./examples/generic-web/ui-evidence.config.yaml)
- [skills/ui-evidence/SKILL.md](./skills/ui-evidence/SKILL.md)

## 기여

issue 와 pull request 는 언제든 환영합니다.

설치 UX, skill 메타데이터, HTML review 출력을 개선하려면 여기부터 보는 것이 좋습니다.

- [README.md](./README.md)
- [docs/installation.md](./docs/installation.md)
- [skills/ui-evidence/SKILL.md](./skills/ui-evidence/SKILL.md)

## 라이선스

[MIT](./LICENSE)
