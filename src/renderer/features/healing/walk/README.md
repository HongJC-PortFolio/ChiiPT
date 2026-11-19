# 산책 (마우스를 따라 걷기)

힐링 파트의 기능입니다. 우클릭 메뉴의 **산책 (마우스 따라가기)** 를 켜면 캐릭터가 마우스 커서를 따라 화면 어디든(좌우·상하·대각선) 걸어 다니고, 끄면 원래 자리로 걸어서 돌아옵니다.

## 파일
| 파일 | 역할 |
|---|---|
| `WalkController.ts` | 이동 계산(순수 계산). 커서를 따라가고 멈추는 거리·속도를 맨 위 `walkSettings`에서 조절 |
| `WalkFeature.ts` | 화면 연결. `#character` 요소를 읽기 전용으로 찾아 CSS `translate`로 옮기고, 걷는 동안 걷기 프레임을 얹음 |

## 다른 파트와의 약속
- **다른 파트의 파일은 수정하지 않습니다.** 공용 파일은 두 군데만 고쳤습니다.
  - `shared/types/index.ts`: `AppCommand`에 `{ type: 'set-walk'; on: boolean }` 한 줄
  - `main/index.ts`: 우클릭 메뉴에 '산책' 체크 항목
- `#character` 의 `data-state`(Awake/Sleep)를 읽어 자는 중에는 산책을 쉽니다.
- 걷는 중에는 `#character` 에 `data-walking="true"` 를 붙입니다. 쓰다듬기 연출(`PetReactions`)은 이 값을 보고 쉽니다.
- 위치만 `translate`로 움직이므로 자세 반응이나 쓰다듬기가 쓰는 `transform` 과 따로 합쳐집니다.
- 걷기 프레임: `assets/characters/walk`, `walk-mirrored` (원본은 왼쪽을 향함. 반대로 보이면 `WALK_FRAMES_FACE` 를 바꾸면 됩니다)
- 프레임을 불러오지 못하면(앱이 이미지를 아직 못 읽는 상태) 원래 캐릭터가 그대로 이동합니다.

## 아직 정해야 할 것 (팀 논의)
- 자세 반응(달리기)과 산책이 동시에 일어날 때의 우선순위
- 팀장님 렌더러가 캐릭터 위치를 직접 받아 그리는 방식으로 바꿀지 (지금은 요소를 옮기는 방식)

## 숫자 조절 (`walkSettings`)
`stopDistance`(멈추는 거리), `maxSpeed` / `minSpeed` / `slowdown`(속도). 초당 픽셀이라 화면 크기와 컴퓨터 성능에 상관없이 같은 속도입니다. 현재 값은 다리가 짧은 캐릭터가 천천히 따라오는 느낌(300 / 55 / 2.4)입니다.

## 테스트
`tests/walk.test.ts`(이동 계산), `tests/walk-feature.test.ts`(가짜 화면으로 위치 이동·프레임 표시·끄면 복귀·잠들면 쉼·프레임 실패 시 대체 동작)
