# ChiiPT

**Interactive Windows Desktop Pet for Posture Awareness & Stress Relief**

> 사용자의 자세와 손동작에 반응하는 Windows 기반 인터랙티브 데스크톱 펫 애플리케이션

ChiiPT는 장시간 PC 사용으로 습관화된 잘못된 자세를 인식하고, 캐릭터와의 상호작용을 통해 자발적인 자세 교정과 스트레스 완화를 유도하는 데스크톱 애플리케이션입니다.

기존의 단순한 알림 방식에서 벗어나 사용자의 자세를 캐릭터의 행동으로 표현하고, 손동작을 통한 교감으로 일상 속 소소한 즐거움과 정서적 휴식을 제공하는 것을 목표로 합니다.

## 🚧 현재 개발 단계

현재는 **초기 공통 개발 기반을 구현한 단계**입니다. 아래 Key Features는 프로젝트의 목표 기능이며, 실제 자세·손동작 인식과 최종 캐릭터 애니메이션은 아직 구현하지 않았습니다.

- 구현: Electron Main·Preload·Renderer 분리, 투명 Always-on-top 오버레이, 임시 원형 캐릭터 입력과 클릭 통과 처리
- 구현: 공통 웹캠 시작·중단·장치 선택·오류 처리, 수면·기상에 따른 스트림 관리
- 준비: 자세·힐링 팀의 독립 모듈, 공유 스트림 인터페이스, 인식 결과 타입과 CharacterController
- 후속 작업: MediaPipe 추론, 기준 자세 등록·판정, 쓰다듬기 인식, 최종 이미지·애니메이션

타입 검사·빌드와 가짜 장치를 사용한 자동 테스트 7개가 통과했습니다. 실제 Windows 앱 시작·보안 설정·Always-on-top 속성은 확인했으며, 시각적 투명도·클릭 전달·물리 카메라 동작은 수동 확인이 필요합니다.

## ▶ 실행 및 개발

Windows x64와 Node.js 24 LTS(24.14 이상, 25 미만)를 기준으로 합니다. 프로젝트 루트에서 실행합니다.

```powershell
npm ci
npm run dev
```

최초 실행 시 Electron 실행 파일 다운로드를 위한 네트워크 연결이 필요할 수 있습니다. `npm run dev`는 타입 검사와 빌드 후 앱을 실행하며, 수정 사항은 앱을 종료하고 다시 실행해야 반영됩니다.

- 캐릭터 또는 시스템 트레이 우클릭: 카메라 시작·중단·장치 선택, 수면·기상, 종료
- 캐릭터 약 2초 누르기: 수면 / 더블클릭: 기상
- 최초 상태: Awake, 카메라 OFF. 메뉴에서 카메라를 직접 시작합니다.
- 현재 캐릭터는 정적 임시 도형이며, 자세·손동작에 반응하지 않는 것이 정상입니다.

```powershell
npm run typecheck  # TypeScript 검사
npm run build      # 타입 검사 및 빌드
npm test           # 공통 카메라·수명주기 테스트
npm start          # 개발자 도구 메뉴 없이 빌드 후 실행
```

모듈별 계약과 Windows 수동 테스트 방법은 [개발 안내서](docs/development.md)를 참고하세요.

## ✨ Key Features (목표 기능)

### 1. Posture Awareness | 자세 불균형 감지

- 웹캠과 MediaPipe를 활용한 사용자 자세 인식
- 좌우 기울어짐에 따라 캐릭터가 같은 방향으로 넘어지거나 구르는 반응
- 화면에 가까워질수록 캐릭터가 확대되는 시각적 피드백
- 올바른 자세로 돌아오면 캐릭터가 기본 상태로 복귀

### 2. Healing Interaction | 힐링 상호작용

- 웹캠 기반 손동작 인식
- 쓰다듬기 동작에 반응하는 캐릭터의 표정 및 애니메이션
- 캐릭터와의 교감을 통한 일상 속 스트레스 환기

### 3. Sleep & Wake | 수면·기상 제어

- 캐릭터 길게 누르기로 수면 상태 전환
- 캐릭터 더블클릭으로 기상
- 수면 상태에 따른 웹캠 및 인식 기능 중단
- 시스템 트레이를 통한 보조 제어

## 🛠 Tech Stack

| 구분 | 기술 | 용도 |
|---|---|---|
| Desktop | Electron | Windows 데스크톱 애플리케이션 |
| Language | TypeScript | 기능 구현 및 상태 관리 |
| Vision | MediaPipe Tasks Vision | 자세 및 손동작 인식 |
| Animation | PixiJS 등 검토 중 | 캐릭터 애니메이션 및 렌더링 |
| Collaboration | Git & GitHub | 버전 관리 및 협업 |

※ 기술 스택은 개발 및 검증 과정에서 변경될 수 있습니다.

## 🏗 Project Architecture

```text
ChiiPT/
├── src/
│   ├── main/               # Electron 앱 및 윈도우 관리
│   ├── preload/            # Main ↔ Renderer 통신
│   ├── renderer/
│   │   ├── features/
│   │   │   ├── posture/    # 자세 인식 및 분석
│   │   │   └── healing/    # 손동작 인식 및 분석
│   │   ├── character/
│   │   │   ├── CharacterController.ts
│   │   │   └── animation/  # 캐릭터 애니메이션
│   │   └── shared/
│   │       ├── camera/     # 공통 웹캠 관리
│   │       ├── state/      # 앱 및 캐릭터 상태
│   │       └── types/      # 공통 데이터 타입
│   └── assets/             # 이미지·사운드 리소스
├── docs/                   # 설계 및 개발 문서
├── scripts/                # 빌드 및 Electron 실행 스크립트
├── tests/                  # 공통 카메라·수명주기 테스트
├── package.json
├── package-lock.json       # 의존성 버전 고정
├── tsconfig.json
├── .gitignore
└── README.md
```

### 설계 구조 핵심

**기능별 독립 개발과 공통 캐릭터 제어를 중심으로 설계합니다.**

- `features/`: 자세 교정과 힐링 기능을 분리하여 각 팀이 독립적으로 개발합니다.
- `character/`: 각 기능의 인식 결과를 받아 하나의 캐릭터가 수행할 행동을 결정하고 애니메이션으로 표현합니다.
- `shared/`: 웹캠, 상태 및 데이터 형식을 공통으로 관리하여 기능 간 중복과 충돌을 최소화합니다.
- `main/` · `preload/`: Electron 애플리케이션 실행과 Renderer 간 안전한 통신을 담당합니다.
- `assets/` · `docs/`: 캐릭터 리소스와 프로젝트 설계·개발 기록을 관리합니다.

현재 `features/posture`와 `features/healing`은 실제 추론이 없는 연결 지점입니다. 공통 관리자가 소유한 동일 스트림을 `start(stream)`으로 전달받고, `stop()`에서는 각 기능이 소유한 작업만 정리합니다. 공유 카메라 트랙을 직접 중단하지 않습니다. `CharacterController`는 현재 상태와 인식 결과만 보관하며, 행동 우선순위와 애니메이션 연결은 후속 작업입니다.

애니메이션 기술은 추후 확정하며, 인식 로직과 캐릭터 표현 로직을 분리하여 기술 변경에 유연하게 대응할 수 있도록 구성합니다.

## 🌿 Branch Strategy

| 브랜치 | 용도 |
|---|---|
| `main` | 공통 프로젝트 기반 및 통합 버전 |
| `feature/posture` | 자세 교정 기능 개발 |
| `feature/healing` | 힐링 기능 개발 |

- 각 기능 팀의 세부 브랜치 운영은 팀 내부에서 자율적으로 결정합니다.
- `main` 브랜치에는 직접 Push하지 않고 Pull Request를 통해 병합합니다.
- 기능 구현 후 PR을 생성하고 변경 사항 및 동작 여부를 검토한 뒤 통합합니다.

## 👥 Team & Contributions

본 프로젝트는 4인 팀으로 진행하는 해커톤 프로젝트입니다.

| 구분 | 담당 영역 | 주요 역할 |
|---|---|---|
| Team Leader | 공통 아키텍처 및 개발 총괄 | 프로젝트 구조 설계, GitHub 관리, 기능 통합 |
| Posture Team | 자세 교정 | 자세 인식 및 캐릭터 반응 구현 |
| Healing Team | 힐링 상호작용 | 손동작 인식 및 캐릭터 반응 구현 |

※ 팀원별 세부 구현 내용과 기여 사항은 개발 과정에서 업데이트합니다.

## 📁 Documentation

프로젝트의 주요 설계 및 개발 기록은 `docs/` 디렉터리에서 관리합니다.

- [프로젝트 기획서](docs/project_proposal.md)
- [기능 명세 및 구현 설계서](docs/functional_design.md)
- [개발 환경·공통 인터페이스·검증 안내](docs/development.md)

- 프로젝트 기획 및 기능 명세
- 아키텍처 설계 및 기술 선정 근거
- 기능별 구현 및 테스트 기록
- 통합 과정에서 발생한 문제와 해결 과정

## 💼 Portfolio & Attribution

본 프로젝트는 팀 단위로 공동 개발되며, 각 팀원은 자신의 GitHub 포트폴리오에서 프로젝트 참여 경험과 개인 기여 사항을 소개할 수 있습니다.

개인 포트폴리오 작성 시에는 다음 원칙을 권장합니다.

- 원본 프로젝트와 팀 공동 개발 사실을 명시합니다.
- 본인이 담당한 기능, 설계 및 문제 해결 과정을 구체적으로 작성합니다.
- 공동 개발 결과물과 개인 기여 내용을 구분합니다.
- 개인 GitHub에서 별도 개선을 진행한 경우 원본 프로젝트와 추가 개발 내용을 구분하여 기록합니다.
- 코드 및 캐릭터 리소스의 사용·재배포 권한을 확인합니다.

개인별 포트폴리오 문서는 각자의 기여 내용에 맞게 자유롭게 작성할 수 있습니다.

---

**ChiiPT — Making everyday PC use healthier and more delightful.**
