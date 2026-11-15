# 자세 인식 + 렌더러 1차 통합

- 기준: feature/posture b57b5bf + 로컬 posture/renderer 58ac01c의 렌더러.
- 기존 Detector, 공용 CameraManager, 모델/WASM, CSP, AppRuntime을 유지.
- PNG 콘텐츠 타입 지원과 캐릭터 에셋, Canvas 렌더러, 키보드 모드를 통합.
- npm run dev: 실제 카메라는 메뉴에서 시작. 상체가 보이면 neutral, 아니면 unavailable.
- npm run animation: 카메라 비활성화, 방향키/A/D와 1/2/3으로 캐릭터 테스트.
- 아직 기준 자세 보정, 좌우 기울기 계산, 강도 추정은 구현하지 않음.
- npm test / npm run build / npm run test:animation / npm run test:integration
- integration 테스트는 실제 웹캠 대신 Canvas 스트림으로 실제 MediaPipe 모델 초기화와 추론을 검증.
