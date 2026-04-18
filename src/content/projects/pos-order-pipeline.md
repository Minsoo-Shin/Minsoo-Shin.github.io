---
title: "POS 주문 연동 파이프라인 재설계"
description: "레거시 HTTP 폴링 방식을 Kafka·MQTT 이벤트 드리븐 + SQS 재처리 파이프라인으로 전환해 네트워크 장애 시에도 주문 누락 0건을 달성."
pubDate: 2025-12-01
tracks: [software]
kind: company
company: "페이히어 (PayHere)"
role: "Backend / POS Agent 개발"
stack: [Kotlin, Spring Boot, Go, Kafka, MQTT, AWS SQS, AWS IoT, MySQL, Wireshark]
tags: [pos, event-driven, kafka, mqtt, sqs]
featured: true
published: true
---

## 개요

페이히어 재직 중 수행한 프로젝트로, **타사 POS의 주문/결제 데이터를 자사 POS 및 테이블오더와 실시간으로 연동**하기 위해 POS Connector(Go)와 백엔드 서버(Kotlin)를 개발·운영했습니다. 대형 프랜차이즈의 테이블오더 매출을 증대하려면 주문 연동에서 고질적으로 발생하던 문제들을 근본적으로 해결해야 했습니다.

## 해결한 문제

기존 구조는 자사 POS가 Connector 생명주기 관리와 모든 주문 연동을 담당하여 **자사 POS에 과도한 책임**이 집중돼 있었습니다. 긴 연동 단계로 디버깅 복잡성이 높았고, 실패 가능 지점이 많아 유지보수 비용도 컸습니다. 자사 POS 폴링 프로세스가 멈추면 주문이 유실되는 사고가 반복됐고, 타사 POS DB Lock으로 인해 INSERT가 실패하는 상황도 주 1~2회 발생했습니다.

## 기술적 선택

- **책임 분리**: POS → 서버/Connector로 연동 책임 이관. 프론트엔드를 연동 단계에서 완전히 제거.
- **이벤트 드리븐**: 자사 POS에서 발행하던 Kafka 이벤트를 브릿지 서버가 소비하고, **MQTT로 POS Connector에 전달**하는 방식으로 전환.
- **해시 기반 캐시**: 5초 폴링(가맹점 1000개 기준 200~1000 RPS)의 중복 요청을 해시 키 비교로 제거.
- **SQS 재처리**: 네트워크 장애 시에도 데이터 정합성이 깨지지 않도록 재처리 로직 결합.
- **OS 레벨 UX**: DB Lock 상황에서 `WTSSendMessageW` Win32 API로 활성 사용자 세션에 직접 경고창 표시. → [자세한 기술 글](/blog/go-windows-service-session-0-ui-control)
- **타사 POS 출력 리버스 엔지니어링**: Wireshark로 출력 프로토콜을 분석, TCP 요청 방식으로 전환해 타사 DB 내 임의 테이블을 제거.

## 성과

- **주문 누락 0건** (네트워크 장애 하에서도 zero data loss)
- **주문 누락 관련 CS 100% 제거**
- **API 콜 90%+ 절감** (해시 캐시)
- **타사 POS 연동 CS 40%↓, 버그 50%↓**
- **자사 POS 리소스 절감** (주문 연동 폴링/재처리 폴링 제거)

## 관련 글

- [Windows Service(Session 0)에서 사용자 UI 제어하기](/blog/go-windows-service-session-0-ui-control)
- [Circuit Breaker (pybreaker)](/blog/python-circuit-breaker-pybreaker)
