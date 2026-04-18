---
published: true
title: Kotlin Coroutine vs Go Goroutine
description: >-
  이름은 '코루틴'에서 왔지만 실제로는 다른 계보 — 협력형 코루틴(Kotlin)과 CSP 기반 경량 스레드(Go) — 의 두 동시성 모델을
  구현 수준·스케줄링·취소·블로킹 대응까지 비교.
pubDate: 2026-04-12T00:00:00.000Z
category: Backend
tags:
  - concurrency
  - kotlin
  - golang
  - coroutine
  - goroutine
type: topic
domain:
  - tech
  - 동시성
updated: 2026-04-12T00:00:00.000Z
synced-from-vault: true
---

# Kotlin Coroutine vs Go Goroutine

이름은 같은 '코루틴'에서 왔지만 실제로는 다른 계보 — 협력형 코루틴과 CSP 기반 경량 스레드 — 의 두 구현체 비교.

## 핵심 차이 요약

| | **Kotlin Coroutine** | **Go Goroutine** |
|---|---|---|
| **구현 수준** | 라이브러리 (kotlinx.coroutines) | 언어 + 런타임 내장 |
| **스택 모델** | 스택리스 — `Continuation` 객체에 상태 저장, 수십 바이트 | 스택풀 — 초기 2~8KB 스택, 자동 확장 |
| **컴파일 변환** | CPS 변환 → 상태 머신 (컴파일 타임) | 없음 — 런타임이 관리 |
| **스케줄링** | 개발자가 `Dispatcher` 명시적 선택 (IO, Default, Main) | GMP 스케줄러가 자동 배분 + Work Stealing |
| **동시성 모델** | `suspend` 기반 협력적 양보 | CSP — `channel`이 1급 시민 |
| **통신** | `Flow`, `Channel`, `SharedFlow` | `chan` (send/receive) |
| **취소** | `CoroutineScope` 구조화된 동시성 — 부모→자식 자동 전파 | `context.Context` — 구조화 수준 느슨 |
| **블로킹 대응** | `Dispatchers.IO`로 격리 필요 (안 하면 스레드 풀 고갈) | M이 블로킹되면 P가 자동 탈착, 새 M 할당 |
| **선점** | 불가 — 중단점에서만 양보 | Go 1.14부터 비동기 선점 (10ms 시그널) |
| **생태계** | Spring WebFlux, Ktor, Android | net/http, gRPC, 표준 라이브러리 전체가 goroutine 기반 |

## 내부 구조 비교

### Kotlin: CPS 변환 + 상태 머신

컴파일러가 `suspend fun`을 상태 머신으로 변환. N개 중단점에 대해 N+M개 상태를 생성하며, 로컬 변수는 `Continuation` 객체의 필드가 된다. `label` 정수로 현재 상태를 추적하고, `COROUTINE_SUSPENDED` 반환으로 중단을 표현. 런타임 코루틴 지원 불필요 — 모든 변환은 컴파일 타임에 완료.

`ContinuationInterceptor`가 중단점 사이에서 continuation을 가로채 Dispatcher로 라우팅. 개발자가 실행 스레드 풀(IO, Default, Main)을 명시적으로 선택해야 한다.

### Go: GMP 스케줄러

별도 코드 변환 없이 런타임이 전체를 관리. G(Goroutine)를 P(Processor)의 Local Run Queue에 삽입하고, P에 연결된 M(OS Thread)에서 실행. LRQ가 비면 다른 P에서 절반을 훔치고(Work Stealing), 없으면 Global Run Queue와 네트워크 폴러를 확인. 블로킹 syscall 발생 시 M을 포기하고 P가 새 M을 확보하여 다른 G를 계속 실행.

개발자가 스케줄링에 개입할 여지가 거의 없으나, `go func()` 한 줄로 동시성 확보 가능.

## 성능

100만 이터레이션 벤치마크 (출처: Medium 비교):

| 런타임 | 소요 시간 |
|---|---|
| Go 1.19 (Goroutine) | ~700μs |
| Kotlin 1.7 (Coroutine) | ~2ms |
| Java 19 (Virtual Thread) | ~4ms |

Go는 네이티브 컴파일 + 경량 런타임으로 raw 성능 우위. 단, 수백만 개 생성 시 메모리 효율은 스택리스 코루틴(수십 바이트)이 스택풀 goroutine(2~8KB)보다 유리.

## 선택 기준

**Kotlin Coroutine이 적합한 경우:**
- 기존 JVM/Spring 생태계에 비동기를 점진적으로 도입 (카카오페이 Java→Kotlin 전환 사례)
- Android UI 스레드와의 상호작용 필요
- 구조화된 동시성으로 복잡한 취소/에러 전파 제어 필요

**Go Goroutine이 적합한 경우:**
- 높은 동시성이 필요한 네트워크 서비스를 신규 구축
- 스케줄링을 런타임에 위임하고 싶을 때
- 블로킹 I/O가 많아 Dispatcher 관리 부담이 큰 경우

## Sources

- [Kotlin Language Specification — Asynchronous programming with coroutines](https://kotlinlang.org/spec/asynchronous-programming-with-coroutines.html)
- [Ardan Labs — Scheduling In Go: Part II](https://www.ardanlabs.com/blog/2018/08/scheduling-in-go-part2.html)
- [Go Goroutine vs Java 19 Virtual Thread vs Kotlin Coroutines](https://medium.com/@14407744/go-goroutine-vs-java-19-virtual-thread-vs-kotlin-coroutines-664defdaad95)

## 관련 개념

- 코루틴 — 두 이름의 공통 어원 (Kotlin은 직계 구현, Go는 CSP 기반 경량 스레드에 붙인 오마주 이름)
- Kotlin — CPS 기반 스택리스 코루틴
- Go — GMP 기반 스택풀 코루틴
- 비동기 처리 — 코루틴과 Virtual Thread의 상위 개념
