---
company: "(주) 페이히어 (PayHere)"
role: "Backend Engineer — Server (Kotlin, Go), POS Agent (Go)"
location: "Seoul, KR"
startDate: 2024-11-01
endDate: 2025-12-31
current: false
stack: [Kotlin, Spring Boot, Go, Kafka, MQTT, AWS SQS, AWS IoT, MySQL]
published: true
perspectives:
  software:
    summary: "타사 POS 주문/결제 데이터 파이프라인을 이벤트 드리븐으로 재설계해 장애 복원력과 데이터 정합성을 확보."
    highlights:
      - "HTTP 폴링 방식을 Kafka · MQTT 기반 이벤트 드리븐 파이프라인으로 전환 — SQS 재처리 로직과 결합해 네트워크 장애 시 주문 누락 0건 달성."
      - "연동 책임을 자사 POS에서 서버/Connector로 분리 — 긴 연동 단계 제거, 디버깅 복잡도·유지보수 비용 절감."
      - "타사 POS DB Lock 상황에서 wtsapi32.dll 시스템 콜로 활성 사용자 세션에 경고 팝업 표출 — 주문 누락 CS 100% 제거."
      - "Wireshark로 타사 POS 출력 로직을 리버스 엔지니어링, TCP 요청 방식으로 테이블오더 주문 출력 연동 — 임의 테이블 제거, CS 40%↓."
      - "해시 기반 캐시 도입으로 초당 1000회 이상의 중복 요청 제거, API 콜 90%+ 절감."
---
