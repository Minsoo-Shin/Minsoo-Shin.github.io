---
title: "[python] circuit breaker (pybreaker)"
description: "PyBreaker 라이브러리를 사용해 Python에서 Circuit Breaker 패턴을 구현하여 시스템 탄력성과 장애 내성을 확보하는 방법 정리."
pubDate: 2025-11-26
category: Backend
tags: [python, circuit-breaker, pybreaker, resilience, system-design]
published: true
---

## pybreaker

> PyBreaker는 **Circuit Breaker 패턴**의 Python 구현체입니다. 이 패턴은 마이클 T. 나이가드의 저서 _Release It!_ 에 설명되어 있으며, 한 하위 시스템의 실패가 전체 시스템을 파괴하는 것을 방지하여 시스템의 **탄력성**을 높이는 데 사용됩니다.

위험할 수 있는 작업(일반적으로 외부 서비스와의 통합 지점)을 Circuit Breaker로 감싸서, 시스템이 건강하지 않다고 판단될 때 해당 호출을 즉시 우회하여 실패를 막습니다.

## 주요 특징 (Features)

- **설정 가능한 임계값:** 실패 임계값 (`fail_max`) 및 재설정 타임아웃 (`reset_timeout`) 설정.
- **성공 임계값:** 회로를 닫기 전에 필요한 연속 성공 횟수 (`success_threshold`) 설정 가능.
- **예외 제외:** 시스템 오류가 아닌 비즈니스 예외 등, 실패로 간주하지 않을 예외 목록 설정.
- **이벤트 리스너:** 회로 차단기의 상태 변경이나 호출 성공/실패 시 동작을 위한 **이벤트 리스너** 지원.
- **스레드 안전:** 멀티스레드 환경에서 안전하게 사용 가능.
- **선택적 백킹:** **Redis**를 사용하여 여러 프로세스 간에 회로 상태를 공유할 수 있는 옵션 제공.
- **비동기 지원:** **Tornado**를 사용한 비동기 호출 지원.

---

## 설치 및 사용법

### 1. 설치 (Installation)

PyPI에서 최신 안정 버전을 설치합니다. **Python 3.10 이상**이 필요합니다.

```bash
pip install pybreaker
```

### 2. 회로 차단기 생성 (Usage)

보호하려는 통합 지점별로 `CircuitBreaker` 인스턴스를 생성합니다. 이 인스턴스는 애플리케이션 전역에서 사용되어야 합니다.

```python
import pybreaker

# 5회 연속 실패 시 회로를 열고, 60초 후 재설정 시도
db_breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60)

# 연속 3회 성공해야 닫힌 상태로 복귀
db_breaker_with_success = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60, success_threshold=3)
```

### 3. Redis를 이용한 상태 저장 (Optional Redis Backing)

여러 인스턴스/프로세스 간에 상태를 공유해야 할 경우 `CircuitRedisStorage`를 사용하여 Redis에 상태를 저장할 수 있습니다.

```python
import pybreaker
import redis

r = redis.StrictRedis()
db_breaker = pybreaker.CircuitBreaker(
    fail_max=5,
    reset_timeout=60,
    # 주의: decode_responses=True로 Redis 연결을 초기화하지 마세요.
    state_storage=pybreaker.CircuitRedisStorage(pybreaker.STATE_CLOSED, r)
)
```

### 4. 함수 보호 (Guarding Functions)

**데코레이터**, **`call()` 메서드**, 또는 **컨텍스트 매니저**를 사용하여 함수를 보호합니다.

| 방식 | 코드 예시 | 설명 |
|------|---------|------|
| **데코레이터** | `@db_breaker` | 가장 간결한 방법입니다. |
| **`call()` 메서드** | `db_breaker.call(update_customer, my_customer)` | 데코레이터 사용을 원치 않을 때 사용합니다. |
| **컨텍스트 매니저** | `with db_breaker.calling():` | `with` 문 블록 전체를 보호합니다. |

### 5. 회로 상태 및 동작

- **Closed (닫힘):** 정상 상태. 호출이 실패하면 실패 카운터 증가.
- **Open (열림):** 실패 카운터가 `fail_max`에 도달하면 진입. 모든 호출이 즉시 실패하며, 기본적으로 **`CircuitBreakerError`**를 발생시킵니다.
- **Half-Open (절반 열림):** `reset_timeout`이 경과하면 진입. 다음 단 하나의 호출만 허용.
  - 이 호출이 **성공**하면 회로는 **닫힘(Closed)**으로 돌아갑니다.
  - 이 호출이 **실패**하면 회로는 즉시 **열림(Open)**으로 돌아가 타임아웃을 기다립니다.

---

## 모니터링 및 수동 관리 (Monitoring and Management)

Circuit Breaker 인스턴스는 현재 상태를 확인하고 수동으로 상태를 변경하는 속성과 메서드를 제공합니다.

| 속성/메서드 | 설명 |
|-----------|------|
| `db_breaker.fail_counter` | 현재 연속 실패 횟수 |
| `db_breaker.success_counter` | 현재 연속 성공 횟수 |
| `db_breaker.current_state` | 현재 상태 ('open', 'half-open', 'closed') |
| `db_breaker.close()` | 회로를 **닫음(Closed)** 상태로 만듭니다. |
| `db_breaker.half_open()` | 회로를 **절반 열림(Half-Open)** 상태로 만듭니다. |
| `db_breaker.open()` | 회로를 **열림(Open)** 상태로 만듭니다. |

이 기능들은 시스템 운영팀이 문제를 감지하고 수동으로 회로를 관리하는 데 유용합니다.

---

리스너(`state_change`)를 사용하는 것은 상태 **전환** 시점의 로깅이나 알림 등에 적합합니다.

반면, `open` 상태일 때 **보호된 함수 대신 실행할 대체 로직(Fallback)**을 구현하는 가장 일반적이고 핵심적인 방법은 **`try...except` 구문**을 사용하여 `pybreaker`가 발생시키는 특정 예외를 잡는 것입니다.

Circuit Breaker가 `open` 상태일 때 보호된 함수를 호출하면, 함수가 실행되는 대신 `pybreaker.CircuitBreakerError`가 즉시 발생합니다. 이 예외를 잡는 부분이 바로 대체 처리(Fallback)를 구현할 위치입니다.

---

## Fallback 처리

### 1. `try...except`를 이용한 대체 처리 (Fallback)

#### A. 데코레이터 사용 시

함수를 데코레이터로 보호했을 때, 해당 함수를 호출하는 곳에서 예외 처리를 합니다.

```python
import pybreaker
# CircuitBreaker 인스턴스는 이미 생성되었다고 가정
# db_breaker = pybreaker.CircuitBreaker(fail_max=5, reset_timeout=60, name="DB_Service")

@db_breaker
def external_service_call(data):
    """외부 서비스와 통신하는 위험한 함수"""
    print("--- 외부 서비스 호출 중 ---")
    # 실제 DB/외부 서비스 호출 로직 (여기서 예외 발생 가능)
    # ...
    return f"결과: {data} (외부 서비스)"

def fallback_logic(data):
    """
    회로가 OPEN 상태일 때 실행할 대체 처리 로직
    (캐시에서 읽어오거나, 기본값 반환, 또는 호출 실패 메시지 반환 등)
    """
    print(">>> 대체 로직 실행: 외부 서비스 사용 불가 <<<")
    # 대체 처리 로직
    return f"결과: {data} (캐시/기본값)"


def process_request(data):
    try:
        # 회로가 Open이면 여기서 CircuitBreakerError가 발생함
        result = external_service_call(data)

    except pybreaker.CircuitBreakerError:
        # Open 상태일 때 발생한 예외를 잡아 대체 로직 실행
        result = fallback_logic(data)

    except Exception as e:
        # 보호된 함수 실행 중 발생한 일반적인 시스템 오류 처리
        print(f"시스템 오류 발생: {e}")
        result = fallback_logic(data)

    print(f"최종 결과: {result}\n")
    return result

# 테스트
process_request("데이터 A")
```

#### B. `call()` 메서드 또는 Context Manager 사용 시

`call()` 메서드나 `with db_breaker.calling():`을 사용할 때도 동일하게 `try...except`로 처리합니다.

```python
# call() 메서드 사용 예
try:
    result = db_breaker.call(external_service_call, "데이터 B")
except pybreaker.CircuitBreakerError:
    result = fallback_logic("데이터 B")


# Context Manager 사용 예
try:
    with db_breaker.calling():
        # 이 블록 내에서 발생한 시스템 오류는 회로 차단기에 의해 감지됨
        print("중요 작업 실행")
except pybreaker.CircuitBreakerError:
    print("회로 열림: 작업 실행 건너뜀")
    # Open 상태일 때의 추가 대체 처리
```

---

### 2. 예외 종류 변경 옵션

기본적으로 `open` 상태에서 발생하는 예외는 `CircuitBreakerError`입니다. 만약 보호된 함수에서 발생했을 원본 예외(`Original Error`)를 그대로 던지고 싶다면, `throw_new_error_on_trip=False` 옵션을 사용하면 됩니다.

```python
# 원본 예외를 그대로 던지도록 설정
db_breaker_original_error = pybreaker.CircuitBreaker(
    fail_max=5,
    reset_timeout=60,
    throw_new_error_on_trip=False # 이 옵션을 False로 설정
)

@db_breaker_original_error
def external_call():
    # 이 함수가 Open 상태에서 우회될 때,
    # pybreaker.CircuitBreakerError 대신 이전에 발생했던 마지막 예외가 던져집니다.
    raise ValueError("DB 연결 실패")
```

**주의:** 이 옵션을 사용하면 `except` 블록에서 `pybreaker.CircuitBreakerError` 대신 원본 예외(`ValueError` 등)를 잡아야 하므로, 대체 로직과 오류 로직을 구분하기 더 어려워질 수 있습니다. 일반적으로는 기본값(`CircuitBreakerError`)을 사용하는 것이 깔끔합니다.
