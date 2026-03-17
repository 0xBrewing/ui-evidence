# ui-evidence

[English README](./README.md)

`ui-evidence`는 `before`/`after` UI 스크린샷을 캡처하고, 나란히 비교 이미지를 만들고, 사람이 빠르게 확인할 수 있는 리뷰 페이지를 생성하는 로컬 CLI입니다.

에이전트 친화적으로 설계했지만, 실제 엔진은 항상 CLI입니다.

## 하는 일

- Playwright로 안정적인 UI 화면 캡처
- `before` / `after` 이미지 비교
- 로컬 `review/index.html` 생성
- `main` 같은 git ref를 `before` 기준으로 사용
- consumer repo용 Claude Code / Codex bootstrap 파일 생성

## 함께 쓰기 좋은 환경

- Codex CLI
- Claude Code
- 안정적인 route와 wait target이 있는 로컬 웹앱
- 현재 checkout, 실행 중인 URL, 다른 git ref 중 하나에서 `before`를 만들 수 있는 저장소

## 지원하는 프로젝트 타입

- 단일 패키지 Next.js 앱
- 단일 패키지 Vite/React 앱
- 안정적인 리뷰 route가 있는 Storybook 환경
- URL로 열 수 있고 안정적인 selector로 기다릴 수 있는 일반 웹앱
- `apps/*`, `packages/*` 같은 declared workspace package 아래에 앱이 있는 `pnpm`, `yarn`, `npm` workspace 기반 JavaScript monorepo

현재 자동 탐지 한계:

- workspace 메타데이터가 없는 임의의 nested app은 discovery 기본 대상이 아닙니다

## 설치

### 사람용 설치

리뷰하려는 앱 저장소에 GitHub 기준으로 설치:

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

`ui-evidence` 자체를 개발하려면:

```bash
git clone https://github.com/0xBrewing/ui-evidence.git
cd ui-evidence
pnpm install
pnpm test
```

### LLM 설치용

Codex CLI나 Claude Code 안에서는 아래 프롬프트를 그대로 주면 됩니다.

```text
Read https://raw.githubusercontent.com/0xBrewing/ui-evidence/main/docs/installation.md
and set up ui-evidence for this repository.
Keep the first setup minimal and ask only about unresolved route, wait target, auth, or baseline details.
```

이미 repo 안에 `ui-evidence`가 설치되어 있다면 아래처럼 요청해도 됩니다.

```text
Read node_modules/ui-evidence/docs/installation.md and set up ui-evidence for this repository.
```

## 빠른 시작

한 stage 실행:

```bash
pnpm exec ui-evidence run --config ./ui-evidence.config.yaml --stage primary-flow
```

현재 브랜치를 `main`과 비교:

```bash
pnpm exec ui-evidence run --config ./ui-evidence.config.yaml --stage primary-flow --before-ref main
```

결과 확인:

```text
screenshots/ui-evidence/<stage-id>/review/index.html
```

## Codex 또는 Claude Code와 함께 쓰기

`ui-evidence`는 에이전트가 브라우저를 즉흥적으로 조작하는 대신 CLI를 호출할 때 가장 안정적으로 동작합니다.

기본 흐름은 아래와 같습니다.

1. `ui-evidence` 설치
2. `ui-evidence install` 실행
3. unresolved 값만 보완
4. `ui-evidence doctor` 실행 후, 실제 route/wait target 검증이 필요하면 `ui-evidence doctor --deep` 실행
5. 이후 UI 비교 요청에는 `ui-evidence run` 사용

설치 후에는 사용자가 명시적으로 말해도 되고 자연어로 요청해도 됩니다.

- `ui-evidence로 checkout modal을 main 기준으로 비교해줘`
- `로그인 화면 수정 전후 캡처해줘`

## 최소 config 형태

```yaml
version: 1
project:
  name: my-app
  rootDir: .
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
    defaultViewports:
      - mobile-390
    screens:
      - id: home
        label: Home
        path: /
        waitFor:
          testId: screen-home
```

## 결과물

각 stage는 아래 구조로 산출물을 남깁니다.

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

## 먼저 볼 파일

- [docs/installation.md](./docs/installation.md)
- [examples/generic-web/ui-evidence.config.yaml](./examples/generic-web/ui-evidence.config.yaml)
- [skills/ui-evidence/SKILL.md](./skills/ui-evidence/SKILL.md)

## 기여하기

Issue와 PR 모두 환영합니다.

특히 아래 영역은 오픈소스 기여 가치가 큽니다.

- 설치 UX
- agent bootstrap
- HTML review 출력
- framework preset 확장

## 라이선스

[MIT](./LICENSE)
