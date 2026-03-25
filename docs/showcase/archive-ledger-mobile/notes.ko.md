# Archive Ledger Mobile

## 작업 목적
- 실데이터 기반 archive 및 dashboard compatibility history before-after 비교

## 캡처 대상 화면
- 오늘의 운세 기록: `daily-fortune-archive__ko__*__*.png`
- 날짜별 운세 기록: `dated-fortune-archive__ko__*__*.png`
- 궁합 기록: `compatibility-archive__ko__*__*.png`
- 아라와 대화 기록: `ara-chat-archive__ko__*__*.png`

## 수정 전 관찰
- 4개 기록 화면 모두가 동일한 soft card 문법으로 평탄화되어 서비스별 성격이 약했습니다.
- `삭제` 텍스트가 row 바깥에 상시 노출돼 소비자 서비스보다 관리자 리스트처럼 보였습니다.
- 궁합과 날짜별/오늘의 운세는 메타와 시간만 남아 실제 상세 페이지와 연결되는 정보가 부족했습니다.
- 아라 기록은 구조는 있었지만 카드와 CTA가 강해서 상담 스레드보다 카드 묶음에 가까웠습니다.

## 설정/훅
- 인증:
  - `/api/test-auth/login`으로 complete profile 세션 생성
- setup hook:
  - `ui-evidence/hooks/archive-ledger-setup.mjs`
- prepare hook:
  - 사용 안 함

## 시각 확인 포인트
- layout
- spacing
- hierarchy
- copy regression
- mobile consistency

## 수정 후 요약
- 공통 `ArchiveLedger`로 교체하면서 떠 있는 카드 스택 대신 한 장의 ledger surface 안에 row를 쌓는 구조로 바뀌었습니다.
- 오늘의 운세와 날짜별 운세는 질문/선택 날짜가 row summary로 보이기 시작해 다시 열어볼 이유가 생겼습니다.
- 궁합은 점수 pill과 역할 summary가 추가돼 가장 큰 개선이 있었고, 더 이상 generic entity list처럼 보이지 않습니다.
- 아라는 `이어지는 상담` featured row와 지난 상담 row가 분리되면서 상세 페이지와의 연결감이 가장 크게 좋아졌습니다.
- 남은 리스크는 glyph asset이 아직 CSS fallback marker라서, 최종 polish 전에는 다소 기능적 인상이 남는다는 점입니다.

## 검증
- 실행 명령:
  - `pnpm --filter @saju/web build`
  - `pnpm verify:i18n:roles`
  - `pnpm --filter @saju/api test -- daily-fortune-history.e2e-spec.ts`
  - `pnpm test:e2e:web:layout`
  - `pnpm test:e2e:web:mobile`
  - `pnpm exec ui-evidence doctor --config ./ui-evidence/config.yaml`
  - `pnpm exec ui-evidence capture --config ./ui-evidence/config.yaml --stage archive-ledger-mobile --phase after`
  - `pnpm exec ui-evidence compare --config ./ui-evidence/config.yaml --stage archive-ledger-mobile`
  - `pnpm exec ui-evidence report --config ./ui-evidence/config.yaml --stage archive-ledger-mobile --language ko`
  - `pnpm exec ui-evidence review --config ./ui-evidence/config.yaml --stage archive-ledger-mobile --language ko`
- 결과:
  - before 4장, after 4장, pair 4장, overview 1장 생성 완료
  - 모바일 공식 회귀와 layout subset 통과
  - `PLAYWRIGHT_FAST_SKIP_BUILD=true pnpm test:e2e:web:mobile`는 `.next` 부재로 실패했으나, 이는 build 재사용 환경 문제이며 공식 build 포함 실행과는 별개입니다.

## 커밋/PR
- 브랜치:
  - `feat/archive-ledger-mobile`
- 커밋:
- PR:
