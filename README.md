# 서울중현초등학교 학습도구

교실 크롬북·태블릿의 시작 페이지로 쓰는 학습 링크 모음입니다.

## 수업 링크 기능

QR코드 대신 쓰는 기능입니다. 교사가 비밀번호로 링크를 등록하면, 학생 화면 상단에
`1학년 1반 수학 여러가지모양` 형식으로 나타나고 **4시간 뒤 자동으로 사라집니다.**

- 등록: 헤더 오른쪽 **🔗 수업 링크 등록** 버튼
- 삭제: 링크 옆 **✕** 버튼 (교사 비밀번호 필요)
- 학생 화면은 30초마다, 그리고 탭을 다시 열 때마다 목록을 새로 받아옵니다.

## 배포 설정 (Vercel, 최초 1회)

프로젝트를 Vercel에 연결한 뒤 아래 두 가지만 설정하면 됩니다.

### 1. Blob 스토어 연결 — 링크가 저장되는 곳

1. Vercel 프로젝트 → **Storage** 탭 → **Create Database** → **Blob** 선택
2. 이름은 아무거나(예: `school-portal-links`) 입력하고 생성
3. 만들어진 스토어에서 **Connect Project** 로 이 프로젝트를 연결

연결하면 `BLOB_READ_WRITE_TOKEN` 환경변수가 자동으로 들어갑니다. 직접 입력할 필요 없습니다.

### 2. 교사 비밀번호 설정

Vercel 프로젝트 → **Settings** → **Environment Variables** 에서 추가합니다.

| Key | Value | 적용 환경 |
| --- | --- | --- |
| `TEACHER_PASSWORD` | 학교에서 정한 공용 비밀번호 | Production, Preview, Development |

### 3. 재배포

환경변수는 새로 배포할 때 반영됩니다. **Deployments** 탭에서 최신 배포를
**Redeploy** 하거나, 아무 커밋이나 푸시하면 됩니다.

> 설정 전에도 페이지 자체는 정상 동작하며, 수업 링크 바만 나타나지 않습니다.

## 구조

```
index.html      화면 전체 (1366x768 고정 디자인을 JS로 배율 조정)
api/links.js    수업 링크 저장/조회 API (Vercel Serverless Function)
package.json    @vercel/blob 의존성
```

### API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/links` | 만료되지 않은 링크 목록 |
| `POST` | `/api/links` | `{ action: 'create', grade, classNo, subject, title, url, password }` |
| `POST` | `/api/links` | `{ action: 'delete', id, password }` |

비밀번호는 브라우저가 아니라 서버에서 확인하므로, 학생이 페이지 소스를 열어봐도
비밀번호는 보이지 않습니다. 등록 가능한 주소는 `http` / `https` 로 제한됩니다.

## 알아두면 좋은 점

- **반영 시간**: 등록한 교사 화면에는 즉시 반영되고, 학생 기기에는 최대 1~2분 안에
  나타납니다(30초 주기 새로고침 + 저장소 캐시).
- **동시 등록**: 두 교사가 같은 순간에 등록하면 드물게 한쪽이 덮어써질 수 있습니다.
  이 경우 다시 등록하면 됩니다.
- **보관 개수**: 동시에 최대 50개까지 등록할 수 있습니다.
