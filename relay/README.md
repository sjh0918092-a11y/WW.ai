# Gemini 중계 서버 (Cloudflare Worker)

친구가 내 Gemini API 키로 WorldWiki.ai를 쓰게 하되, 키 자체는 보여 주지 않기 위한 중계 서버입니다.
키는 Cloudflare에만 저장되고, 친구는 **접속 암호**만 받습니다.

```
친구 브라우저 ──(접속 암호)──▶ Cloudflare Worker ──(내 API 키)──▶ Gemini API
```

- 비용: Cloudflare Workers 무료 플랜(하루 10만 요청)으로 충분합니다.
- 접속 암호가 없거나 틀린 요청, 허용하지 않은 사이트에서 온 요청은 막습니다.
- Gemini 생성과 모델 목록 조회 외의 요청은 모두 막습니다.

## 1. Worker 만들기

1. https://dash.cloudflare.com 에 가입하고 로그인합니다.
2. 왼쪽 메뉴 **Compute (Workers)** 또는 **Workers & Pages** → **Create** → **Start with Hello World!** 를 고릅니다.
3. 이름을 `worldwiki-relay` 처럼 정하고 **Deploy** 를 누릅니다.
4. **Edit code** 를 눌러 편집기에 있는 코드를 모두 지우고, 이 폴더의 [`worker.js`](worker.js) 내용을 그대로 붙여 넣은 뒤 **Deploy** 를 누릅니다.

## 2. 키와 암호 넣기

Worker 화면 → **Settings** → **Variables and Secrets** → **Add** 에서 아래 값을 넣고 저장(Deploy)합니다.

| 이름 | 종류 | 값 |
|---|---|---|
| `GEMINI_KEY` | **Secret** | Gemini API 키 |
| `PASSWORDS` | **Secret** | 접속 암호. 친구마다 다르게 주려면 쉼표로 구분 (예: `chulsoo-7f3k,younghee-q9m2`) |
| `ALLOWED_ORIGINS` | Text (선택) | 비워 두면 `https://sjh0918092-a11y.github.io` 만 허용 |

- 키와 암호는 꼭 **Secret** 으로 넣으세요. Secret은 저장 후 대시보드에서도 다시 볼 수 없습니다.
- 암호는 추측하기 어렵게 길게 만드세요.
- 특정 친구를 끊으려면 `PASSWORDS` 에서 그 암호만 지우면 바로 막힙니다.

## 3. 확인

Worker 주소(`https://worldwiki-relay.<내 계정>.workers.dev`)를 브라우저로 열면 아래처럼 보여야 합니다.

```json
{"ok":true,"service":"WorldWiki relay","keyConfigured":true,"passwordsConfigured":true}
```

`keyConfigured` 나 `passwordsConfigured` 가 `false` 면 2단계 값을 다시 확인하세요.

## 4. 앱에서 연결하고 친구 초대하기

기본 중계 서버 주소는 `index.html` 의 `DEFAULT_RELAY` 에 들어 있습니다. Worker 주소가 바뀌면 이 값을 고칩니다.
주소는 공개돼도 괜찮습니다. 접속 암호가 없으면 쓸 수 없습니다.

1. 친구에게 사이트 주소(https://sjh0918092-a11y.github.io/WW.ai/)를 보내고, 접속 암호는 **따로** 알려 줍니다.
2. 처음 들어온 사람은 자동으로 **중계 서버로 연결** 설정 화면이 열립니다. 접속 암호만 넣고 저장하면 됩니다.
3. 이미 API 키를 쓰던 사람은 기존 설정이 그대로 유지됩니다.

## 사용량 관리

- 모든 요청이 내 API 키로 나가므로, 사용량과 비용은 Google AI Studio의 사용량 화면과 Cloud 콘솔 결제 화면에서 함께 보입니다.
- Cloud 콘솔 **결제 → 예산 및 알림** 에서 예산 알림을 걸어 두세요. 알림은 한도를 넘어도 사용을 막지는 않습니다.
- 요청 수 자체를 막고 싶으면 Cloud 콘솔 **API 및 서비스 → Generative Language API → 할당량** 에서 낮출 수 있는 항목을 낮추세요.
- 친구와 같은 키를 쓰므로 분당·일일 요청 한도도 함께 나눠 씁니다.

## 문제 해결

| 증상 | 원인 |
|---|---|
| "접속 암호가 올바르지 않거나…" | `PASSWORDS` 에 그 암호가 없거나 오타 |
| "허용되지 않은 사이트입니다" | 앱을 다른 주소에서 열었음. 그 주소를 `ALLOWED_ORIGINS` 에 추가 |
| "GEMINI_KEY 또는 PASSWORDS가 설정되지 않았습니다" | 2단계 값이 비어 있거나 저장(Deploy)하지 않음 |
| `User location is not supported` | Worker가 Gemini 미지원 지역(예: 홍콩 HKG)의 데이터센터에서 실행됨. 아래 '실행 지역 고정' 참고 |

## 실행 지역 고정 (User location is not supported 해결)

Cloudflare는 Worker를 **요청한 사람과 가까운 데이터센터**에서 실행합니다. 한국 통신사에 따라 홍콩(HKG)으로 연결되기도 하는데, Gemini API는 홍콩을 지원하지 않아 이 오류가 납니다.
Worker 주소를 열었을 때 `runsIn` 의 `colo` 가 그 사람의 요청이 나가는 데이터센터입니다(친구가 직접 열어야 친구 기준 값이 보입니다).

`wrangler.toml` 의 `[placement] region = "gcp:us-east4"` 가 Worker를 미국 동부 근처에서 실행하도록 고정합니다.
이 설정은 대시보드의 코드 편집기로는 들어가지 않고, 아래 방법 중 하나로 배포해야 적용됩니다.

### 방법 A. GitHub 저장소와 연결 (권장, 명령어 없음)

1. Worker 화면 → **Settings** → **Build** → **Connect** → GitHub 에서 `WW.ai` 저장소를 고릅니다.
2. 브랜치는 `main`, **Root directory**(경로)는 `relay` 로 둡니다. 배포 명령은 기본값(`npx wrangler deploy`) 그대로 둡니다.
3. 저장하면 바로 한 번 배포되고, 이후 `relay/` 가 바뀔 때마다 자동으로 다시 배포됩니다.

### 방법 B. 내 컴퓨터에서 직접 배포

Node.js 를 설치한 뒤 저장소의 `relay` 폴더에서:

```
npx wrangler login
npx wrangler deploy
```

두 방법 모두 대시보드에 넣은 `GEMINI_KEY`, `PASSWORDS` 는 그대로 유지됩니다.
배포 후 Worker 주소를 다시 열어 `runsIn` 이 미국 쪽 코드(예: IAD, EWR)로 바뀌었는지 확인하세요.
배치는 Cloudflare가 지키려고 노력하는 "힌트"라서 드물게 다른 곳에서 실행될 수도 있습니다.
