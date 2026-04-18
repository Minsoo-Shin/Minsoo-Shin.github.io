---
title: "[Go] Windows Service(Session 0)에서 사용자 UI 제어하기 (Feat. Go & WTSSendMessage)"
description: "Windows Service의 Session 0 격리 문제를 WTSSendMessageW API로 해결하여 POS 연동 시스템의 주문 누락 CS를 0건으로 만든 경험기."
pubDate: 2025-12-05
category: Backend
tags: [go, windows, win32api, windows-service, pos]
published: true
---

## TL;DR

타사 POS의 DB Lock으로 인한 주문 누락과 CS 비용 증가 문제를 해결하기 위해, 프론트엔드 리소스를 기다리는 대신 백엔드단에서 직접 Windows API를 제어하는 방식을 제안했습니다. 기존 라이브러리(`zenity`)의 세션 처리 한계를 분석하고, `WTSSendMessageW`를 직접 구현하여 주문 누락 CS를 0건으로 만들었습니다.

## 1. 배경: 타사 POS 연동의 구조적 한계와 백엔드 주도적 접근

레거시 시스템이나 타사 솔루션과 연동하는 미들웨어를 개발하다 보면, 우리 코드의 품질과는 무관하게 외부 요인으로 인해 치명적인 문제가 발생하곤 합니다.

제가 개발 중인 `POS Connector`는 테이블오더의 주문을 타사 POS DB로 밀어 넣는 역할을 합니다. 문제는 점주님이 POS의 '주문 상세 화면'을 켜놓고 있을 때 발생했습니다. 타사 POS의 구조적 한계로 인해 해당 화면에서는 DB Lock이 걸려버렸고, 결과적으로 주문 `INSERT`가 실패하는 상황이 벌어졌습니다.

이로 인해 결제 누락이 주 1~2회 지속적으로 발생했고, 이는 곧바로 금전적 손실과 CS(고객 항의) 폭주로 이어졌습니다. 타사 POS의 코드를 고칠 수도 없는 상황에서 유일한 해법은 **"사장님, 지금 화면 좀 닫아주세요!"**라고 알리는 것뿐이었습니다.

하지만 프론트엔드 팀은 다른 우선순위 업무로 리소스가 부족해 UI 작업이 계속 미루어지고 있었습니다. 저는 이 상황을 방관하는 대신, 새로운 접근 방식을 제안했습니다.

> "굳이 프론트엔드를 거칠 필요가 있을까요? 이미 설치된 Go 기반의 POS Connector가 OS 레벨에서 직접 경고창을 띄우는 건 어떨까요? 제가 윈도우 API를 이용해 바로 처리하겠습니다."

이 제안을 통해 프론트엔드 의존성을 제거하고, 백엔드 개발자가 단독으로 UX와 비즈니스 문제를 해결하는 프로젝트를 시작하게 되었습니다.

## 2. Session 0 Isolation

### 2-1. 오픈소스 라이브러리(Zenity)의 한계 분석

처음에는 빠르고 안정적인 구현을 위해 Go 생태계에서 널리 쓰이는 크로스 플랫폼 다이얼로그 라이브러리인 [`ncruces/zenity`](https://pkg.go.dev/github.com/ncruces/zenity) 도입을 검토했습니다. 하지만 테스트 결과, 서비스 환경에서는 알림 창이 전혀 뜨지 않았습니다.

원인을 파악하기 위해 라이브러리 내부 코드(`notify_windows.go`)를 뜯어본 결과, 결정적인 이유를 발견했습니다.

```go
// zenity/notify_windows.go 내부 로직 예시
// 라이브러리는 WTS_CURRENT_SESSION을 사용하여 메시지를 보냄
ret, _, _ := procWTSSendMessageW.Call(
    WTS_CURRENT_SERVER_HANDLE,
    WTS_CURRENT_SESSION, // <-- 여기가 문제
    ...
)
```

이 라이브러리는 메시지를 보낼 세션 ID로 WTS_CURRENT_SESSION을 사용하고 있었습니다.

일반적인 데스크톱 앱이라면 문제없지만, Windows Service는 'Session 0'에서 실행됩니다. 즉, CURRENT_SESSION으로 호출하면 격리된 Session 0 내부에 메시지 박스를 띄우게 되고, 실제 모니터를 보고 있는 사용자(Session 1 이상)에게는 아무것도 보이지 않는 것이었습니다.

이 분석을 통해 **"활성 사용자 세션 ID(Active Console Session ID)를 동적으로 찾아 주입하는 로직"**이 반드시 필요하다는 결론을 내렸습니다.

### 2-2. 해결책: Architecture 및 WTSSendMessageW 직접 구현

아래 다이어그램은 Session 0에 갇힌 서비스가 어떻게 격리된 환경을 뚫고 사용자에게 도달하는지를 보여줍니다.

![Session 0 격리 극복 및 메시지 전송 프로세스](https://velog.velcdn.com/images/alstn5038/post/48724f27-b9fc-4af2-ac22-14a15536ec26/image.png)

_[그림 1] Session 0 격리 극복 및 메시지 전송 프로세스_

결국 외부 라이브러리 의존성을 제거하고, Windows Terminal Services API인 `WTSSendMessageW`를 직접 호출하기로 결정했습니다. 핵심은 `kernel32.dll`의 `WTSGetActiveConsoleSessionId`를 통해 현재 사용자가 보고 있는 화면의 세션 ID를 가져와서 타겟팅하는 것입니다.

**[실제 Go 구현 코드: 유틸리티]**

실무 환경에서는 타임아웃 처리와 로깅(`zap`), 에러 래핑(`pkg/errors`)을 포함하여 안정성을 강화했습니다.

```go
//go:build windows
// +build windows

package wtsmsg

import (
    "github.com/pkg/errors"
    "go.uber.org/zap"
    "golang.org/x/sys/windows"
    "syscall"
    "unsafe"
)

var (
    modWtsapi32                      = windows.NewLazySystemDLL("wtsapi32.dll")
    modKernel32                      = windows.NewLazySystemDLL("kernel32.dll")

    procWTSSendMessage               = modWtsapi32.NewProc("WTSSendMessageW")
    procWTSGetActiveConsoleSessionId = modKernel32.NewProc("WTSGetActiveConsoleSessionId")
)

// DTO는 메시지 전송에 필요한 정보를 담는 구조체라고 가정합니다.
func SendMessage(wtsMsg DTO) error {
    // 1. 현재 활성 콘솔 세션 ID 조회
    // 단순 Current Session이 아니라, 실제 활성화된 사용자 세션을 찾아야 함
    sessionId, _, _ := procWTSGetActiveConsoleSessionId.Call()

    titleUTF16 := syscall.StringToUTF16(wtsMsg.Title)
    messageUTF16 := syscall.StringToUTF16(wtsMsg.Message)
    timeout := wtsMsg.TimeoutSeconds

    // 응답 대기 여부 설정
    bwait := 0
    if wtsMsg.ResponseWait {
       bwait = 1
    }
    var response uint32

    // 2. WTSSendMessageW 호출 (SessionId 인자에 조회한 ID 주입)
    ret, _, err := procWTSSendMessage.Call(
       0, // WTS_CURRENT_SERVER_HANDLE
       uintptr(sessionId),
       uintptr(unsafe.Pointer(&titleUTF16[0])),
       uintptr(len(titleUTF16)*2),
       uintptr(unsafe.Pointer(&messageUTF16[0])),
       uintptr(len(messageUTF16)*2),
       uintptr(0),       // MB_OK
       uintptr(timeout), // Timeout in seconds
       uintptr(unsafe.Pointer(&response)),
       uintptr(bwait),   // Wait for response
    )

    // Call은 성공 시에도 err가 nil이 아닐 수 있으므로(Errno 0),
    // 실제 반환값(ret)과 함께 꼼꼼한 확인이 필요합니다.
    if err != nil && err.Error() != "The operation completed successfully." {
       return errors.Wrap(err, "failed to call procWTSSendMessage")
    }

    if ret == 0 {
       return errors.New("WTSSendMessage failed")
    } else {
       zap.L().Info("User responded", zap.Uint32("response", response))
    }
    return nil
}
```

### 2-3. 실제 적용: 비즈니스 로직과 UX 설계

위에서 만든 `SendMessage` 유틸리티를 실제 비즈니스 로직에 적용할 때는 **'사용자 경험(UX)'**을 깊이 고려했습니다. 단순히 에러 창만 띄우는 것이 아니라, 사용자가 문제를 인식하고 행동을 취한 뒤, 시스템이 정상화될 때까지 기다리게 만드는 **2단계 메시지 전략**을 사용했습니다.

```go
func asyncTableLockNotify(err error) {
    // ... 생략 ...
    if ginErr.Code().StatusCode() == http.StatusLocked {
       // 메인 로직을 블로킹하지 않기 위해 고루틴으로 실행
       go func() {
          defer func() {
             if r := recover(); r != nil {
                zap.L().Error("asyncTableLockNotify panic", zap.Any("recover", r))
                return
             }
          }()

          // 2. [Step 1] 행동 유도 메시지 (무한 대기)
          // 사용자가 '확인'을 누른다는 것은 포스 창을 닫았다는 의미로 간주합니다.
          if err := wtsmsg.SendMessage(wtsmsg.DTO{
             Title:          "테이블오더 주문 누락 알림",
             Message:        "테이블오더 주문이 지연되고 있습니다\n포스의 주문창을 닫은 후, 확인 버튼을 눌러주세요",
             TimeoutSeconds: 0,     // 유저가 반응할 때까지 무한 대기
             ResponseWait:   true,  // 버튼 클릭을 기다림
          }); err != nil {
             zap.L().Error("wtsmsg.SendMessage1 error", zap.Error(err))
          }

          // 3. [Step 2] 처리 대기 메시지 (30초 타임아웃)
          // 사용자가 다시 포스를 조작하여 Lock을 걸지 않도록,
          // 데이터 연동 시간(약 30초) 동안 화면을 점유하여 대기시킵니다.
          if err := wtsmsg.SendMessage(wtsmsg.DTO{
             Title:          "테이블오더 주문 누락 알림",
             Message:        "지연된 주문을 연동하고 있습니다\n포스에서 주문을 잠시 멈춰주세요\n30초 후 주문이 연동되고, 자동으로 창이 종료됩니다.",
             TimeoutSeconds: 30,    // 30초 후 자동 종료
             ResponseWait:   true,
          }); err != nil {
             zap.L().Error("wtsmsg.SendMessage2 error", zap.Error(err))
          }
       }()
    }
}
```

이 로직은 백엔드 개발자로서 단순히 '기능 구현'을 넘어 '**현장의 운영 상황**'까지 고려한 결과입니다.

1. **StatusLocked 감지:** DB Lock 상황을 정확히 캐치하여 불필요한 알림을 방지합니다.
2. **Goroutine 처리:** 알림창 대기 시간 동안 메인 프로세스가 멈추지 않도록 비동기로 처리했습니다.
3. **단계별 UX:**
   - **첫 번째 알림:** "주문창을 닫으세요" (사용자 행동 유도)
   - **두 번째 알림:** "연동 중이니 잠시만 기다려주세요" (재발 방지 및 시간 벌기)

## 3. 결론: 주도적인 엔지니어링이 만드는 변화

업데이트 배포 후, 결과는 극적이었습니다.

주문 실패 시 즉시 뜨는 경고창을 보고 점주님들은 스스로 화면을 닫았고, DB Lock은 해제되었습니다. 그 결과 주문 누락 관련 CS는 완전히 사라졌고(Zero), 불필요한 운영 리소스 낭비를 막을 수 있었습니다.

이번 경험은 단순히 윈도우 API 하나를 알게 된 것 이상이었습니다.

1. **Deep Dive & Decision:** 편리한 라이브러리(`zenity`)가 왜 내 환경에서 동작하지 않는지 소스 레벨에서 분석하고, 커스텀 구현을 결정하는 판단력을 길렀습니다.
2. **주도적인 문제 해결:** 리소스 부족을 핑계로 기다리는 대신, 백엔드 기술을 활용한 대안을 먼저 제안하여 문제를 돌파했습니다.
