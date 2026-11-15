# 캐릭터 애니메이션

실제 ChiiPT 공통 구조의 렌더링 연결 지점입니다. 기능 팀은 기존처럼 CharacterController에 결과를 전달합니다.

- `CharacterRenderer.ts`: 기존 CSS 임시 도형 대신 제공된 투명 PNG를 Canvas 2D로 렌더링합니다. 별도 의존성은 추가하지 않았습니다. 기존 스택에는 PixiJS가 아직 설치되지 않아 Canvas를 사용했습니다.
- `PoseAnimation.ts`: 회전 후 1→2/3 크로스페이드, easing, 원위치 복귀. 이미지 높이 150px, 원본 비율 유지, 회전 후 알파 외곽선의 바닥 접촉 위치 보정.
- 에셋의 정식 위치는 `src/assets/characters/chii-poses.png`입니다.

저장소 루트 `C:\Github_Manage\ChiiPT`에서 실행:

```powershell
npm run animation
```

키보드 테스트 창에서 ←/→ 또는 A/D를 누르고 있으면 해당 방향으로 넘어집니다. 키를 놓거나 Space/Esc, 창 포커스 해제로 정상 복귀합니다. 테스트 입력은 CharacterController의 기존 posture 계약을 사용합니다. MediaPipe 연결이나 카메라 자동 시작은 없습니다.

`npm start`/`npm run dev`의 기존 오버레이도 정상 이미지로 표시됩니다. 카메라·수면·기상 기능과 모듈 계약은 유지합니다. 클릭 통과 영역은 기존 원 대신 현재 렌더링된 불투명 픽셀로 검사합니다. 수면 전용 원본은 제공되지 않아 수면 시 중립 이미지와 기존 상태 표시를 사용합니다.

검증 명령: `npm test`, `npm run build`, `npm run test:animation`.


## 왼쪽 넘어짐 8프레임 추가

왼쪽 입력은 `src/assets/characters/left-fall/frame-01.png`–`frame-08.png`의 실제 순서 애니메이션을 사용합니다. `LeftFallSequence.ts`에 재생 시간과 원본 영역이 정의되어 있습니다. 약 0.98초 재생 후 마지막 자세를 유지하며, 키를 놓으면 0.5초 동안 정상 이미지로 복귀합니다. 원본은 변경하지 않았으며 모든 프레임을 동일 배율로 표시합니다. 오른쪽 모션은 기존 atlas를 유지합니다. 실행 명령은 기존 `npm run animation`입니다.
