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

## 설치

```bash
pnpm add -D ui-evidence
```

필요하면 `npm`, `yarn`, `bun`에 맞는 명령으로 바꿔서 사용하면 됩니다.

## 빠른 시작

config와 에이전트 bootstrap 파일 생성:

```bash
pnpm exec ui-evidence install --agent both --config ./ui-evidence.config.yaml
```

설정 점검:

```bash
pnpm exec ui-evidence doctor --config ./ui-evidence.config.yaml
```

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

LLM에게 [docs/installation.md](./docs/installation.md)를 읽고 현재 저장소에 `ui-evidence`를 세팅하라고 요청하면 됩니다.

이 문서는 소개 문서가 아니라 설치 플레이북입니다. 의도한 흐름은 아래와 같습니다.

1. `ui-evidence` 설치
2. `ui-evidence install` 실행
3. unresolved 값만 보완
4. `ui-evidence doctor` 실행
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

## 라이선스

[MIT](./LICENSE)
