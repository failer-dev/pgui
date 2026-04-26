# pgui

[English README](README.md)

pgui는 로컬 개발을 위한 가벼운 PostgreSQL 데이터 브라우저이자 편집 도구입니다. 로컬 웹 UI에서 테이블을 탐색하고, 행을 수정하고, SQL을 실행하고, 스키마 관계를 확인할 수 있습니다.

![pgui overview](assets/readme/overview.png)

## pgui를 만든 이유

로컬에서 PostgreSQL 데이터베이스를 붙여 개발하다 보면 데이터를 확인하거나, 몇 개의 행을 수정하거나, 쿼리를 실행하거나, 외래 키 관계를 살펴봐야 할 때가 많습니다. pgAdmin이나 DataGrip 같은 전체 기능형 도구가 필요한 상황도 있지만, 개발 중 반복적으로 확인하는 작업에는 더 작은 도구가 편할 수 있습니다.

pgui는 단일 실행 파일 또는 Docker 컨테이너로 실행할 수 있고, `DATABASE_URL`로 데이터베이스에 연결합니다. 자주 쓰는 로컬 데이터베이스 작업을 한 브라우저 탭에서 처리할 수 있으며, 읽기 전용 모드와 환경 라벨을 제공합니다.

---

## 기능

### 테이블 탐색과 인라인 편집

스키마를 탐색하고, 테이블을 검색하고, 밀도를 조절해 데이터를 볼 수 있습니다. 데이터 그리드는 컬럼 전체 필터, 정렬, 페이지네이션을 지원합니다.

행 수정은 기본 키 기반 업데이트로 처리됩니다. 수정 사항은 바로 저장되지 않고 초안으로 남으며, 검토 후 저장하거나 버릴 수 있습니다.

![Data Grid Editing](assets/readme/data-grid-editing.webp)

### SQL 콘솔

PostgreSQL 문법 하이라이트, 스키마 기반 자동완성, 스니펫, 자동 포맷을 제공하는 CodeMirror 기반 SQL 편집기를 포함합니다. `Cmd/Ctrl+Enter`로 쿼리를 실행하고, 결과 행 또는 영향받은 행 수와 실행 시간을 확인할 수 있습니다.

쓰기 쿼리와 DDL은 실행 전 확인 단계를 거칩니다.

![SQL Console](assets/readme/sql-console.webp)

### ERD 다이어그램

외래 키 관계를 스키마 단위로 확인할 수 있습니다. Focus, Schema, All 모드를 전환하면서 특정 관계나 전체 스키마 그래프를 살펴볼 수 있고, 확대/축소, 이동, 화면 맞춤 조작을 지원합니다.

![Database Diagram](assets/readme/diagram.webp)

### 테이블 구조와 스키마 타입

`\d` 쿼리를 직접 작성하지 않고 테이블 구조를 확인할 수 있습니다. Structure 탭에서 컬럼, 데이터 타입, null 허용 여부, 기본값, 기본 키, 편집 가능 여부를 볼 수 있습니다.

![Table Structure](assets/readme/structure.png)

### 안전과 작업 흐름 옵션

- **다크, 라이트, 시스템 테마**: 로컬 세션에 맞는 테마를 선택할 수 있습니다.
- **분할 보기와 커맨드 팔레트**: 여러 화면을 나란히 보고 테이블로 이동할 수 있습니다.
- **읽기 전용 모드**: 데이터 조회만 필요할 때 쓰기 작업을 비활성화할 수 있습니다.
- **JSON 미리보기**: 중첩 JSON 값을 포맷해서 보고 복사할 수 있습니다.

---

## 빠른 시작

샘플 데이터로 pgui를 실행하려면 포함된 예제 환경을 사용할 수 있습니다. Docker와 Task가 필요합니다.

```bash
task example:up
```

실행 후 [http://localhost:8080](http://localhost:8080)을 엽니다.

## Docker

로컬 데이터베이스에 연결하는 독립 컨테이너로 실행할 수 있습니다.

```bash
docker run -p 127.0.0.1:8080:8080 \
  -e HOST=0.0.0.0 \
  -e DATABASE_URL="postgres://user:password@host:5432/dbname?sslmode=disable" \
  ghcr.io/failer-dev/pgui:latest
```

## 설정

환경 변수로 pgui 동작을 조정할 수 있습니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL 연결 문자열입니다. 설정하면 시작 시 자동 연결합니다. |
| `HOST` | `127.0.0.1` | HTTP 서버가 바인딩할 호스트입니다. Docker 이미지는 컨테이너 내부 접근을 위해 `0.0.0.0`을 사용하지만, 로컬 실행 시 포트 publish는 `127.0.0.1`로 제한하는 것을 권장합니다. |
| `PORT` | `8080` | HTTP 서버 포트입니다. |
| `CSRF_ALLOWED_ORIGINS` | — | localhost 외에 POST API 호출을 허용할 브라우저 origin 목록입니다. 쉼표로 구분합니다. 예: `https://pgui.example.internal` |
| `READ_ONLY` | `false` | `true`로 설정하면 모든 쓰기 작업을 비활성화합니다. |
| `BRAND_SECTION_NAME` | `pgui` | 헤더의 브랜드 텍스트를 바꿀 수 있습니다. |
| `BRAND_SECTION_ENV` | — | 헤더에 표시할 환경 라벨입니다. `prod`, `production`은 위험 환경으로 강조됩니다. |
| `THEME` | `system` | 초기 테마 설정입니다. `light`, `dark`, `system`을 지원합니다. |

`DATABASE_URL`이 없으면 pgui는 연결 화면으로 시작하며, 화면에서 연결 문자열을 입력할 수 있습니다.

## 로컬 개발

저장소 루트에서 프론트엔드를 빌드한 뒤 Go 서버를 실행합니다.

```bash
cd frontend && npm install && npm run build
cd ..
PORT=8080 go run ./backend
```

서버는 로컬 개발 중 `backend/` 디렉터리에서 실행해도 `frontend/dist`를 찾을 수 있도록 처리합니다.

## 보안 안내

> [!CAUTION]
> pgui는 인증이 없는 로컬 개발 도구입니다. 퍼블릭 인터넷이나 공유 네트워크에 직접 노출하지 마세요.

pgui는 로컬 브라우저에서 발생할 수 있는 일반적인 위험을 줄이지만, 데이터베이스 보안 경계가 아닙니다.

pgui가 해주는 것:

- 로컬 바이너리 실행 시 기본적으로 `127.0.0.1`에만 바인딩합니다.
- Docker 예시는 로컬 전용 접근을 위해 `127.0.0.1:8080:8080` 포트 publish를 사용합니다.
- 신뢰하지 않는 origin에서 온 브라우저 POST 요청을 거부합니다.
- 브라우저에서 발생한 쓰기 요청에 대해 JSON POST와 CSRF 토큰을 요구합니다.
- `READ_ONLY=true`로 UI와 API의 쓰기 작업을 비활성화할 수 있습니다.
- SQL 콘솔의 결과 크기와 실행 시간을 제한해 실수로 인한 리소스 사용을 줄입니다.

pgui가 해주지 않는 것:

- 로그인, 세션, 사용자 권한, 감사 로그를 제공하지 않습니다.
- VPN, SSO/OIDC 프록시, 리버스 프록시 인증, 방화벽, Kubernetes 네트워크 정책을 대체하지 않습니다.
- 높은 권한의 데이터베이스 계정을 안전하게 공유 가능한 계정으로 만들어주지 않습니다.
- pgui에 접근 가능한 사용자가 설정된 데이터베이스에 허용된 SQL을 실행하는 것을 막지 않습니다.
- `0.0.0.0:8080:8080`처럼 공개된 Docker 포트를 보호하지 않습니다.

사이드카 또는 사내 환경에서 실행할 때:

- pgui 컨테이너는 private로 두고, 신뢰할 수 있는 프록시나 내부 접근 경로를 통해서만 노출하세요.
- 회사 VPN, SSO 프록시, Basic Auth 프록시, ingress 정책 등으로 pgui 앞단에 인증과 IP 정책을 두세요.
- 사용자가 접속할 정확한 브라우저 origin을 `CSRF_ALLOWED_ORIGINS`에 설정하세요. 예: `https://pgui.example.internal`
- 최소 권한 데이터베이스 계정을 사용하세요. 운영 또는 공유 데이터베이스에서는 `READ_ONLY=true`를 권장합니다.
- 로컬 Docker 실행에서는 포트를 loopback에만 바인딩하세요. 예: `-p 127.0.0.1:8080:8080`
- 넓은 권한의 운영 `DATABASE_URL`을 shell history, compose 파일, 스크린샷, 이슈 리포트 등에 노출하지 않도록 주의하세요.
