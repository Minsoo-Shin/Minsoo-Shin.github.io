---
track: software
title: "신민수 · Backend / Platform"
tagline: "이벤트 드리븐 파이프라인 · CDC · 검색엔진 — 기술 병목을 비즈니스 성과로."
summary: |
  Go · Kotlin 기반 백엔드 엔지니어. 대규모 커머스에서 CDC/Elasticsearch 파이프라인으로
  데이터 정합성과 검색 품질을 동시에 끌어올렸고, POS 도메인에서 Kafka · MQTT · SQS
  이벤트 드리븐 아키텍처로 네트워크 장애 하에서도 주문 유실 0건을 달성했습니다.
published: true
highlights:
  - value: "0건"
    label: "주문 데이터 유실"
    note: "네트워크 장애 하 Zero Data Loss"
  - value: "0.23→0.39"
    label: "검색 정확도 (mAP@30)"
    note: "Elasticsearch 쿼리·동의어·Function Score"
  - value: "10x"
    label: "대량 동기화 성능"
    note: "CDC Sink Async Worker + Bulk API"
  - value: "41%↓"
    label: "글로벌 이미지 처리 비용"
    note: "Lambda@Edge + S3 리전 재구성"
experience:
  - partridge-systems
  - payhere
  - looko
  - samsung-display
skills:
  - group: "Languages"
    items: [Go, Kotlin, Java, Python]
  - group: "Frameworks"
    items: [Spring Boot, Echo, Gin]
  - group: "Storage & Search"
    items: [PostgreSQL, MySQL, Redis, Elasticsearch]
  - group: "Streaming & Messaging"
    items: [Kafka, Debezium (CDC), MQTT, AWS SQS]
  - group: "Infra"
    items: [AWS (IoT, ECS, EC2, S3, Lambda@Edge), Docker, Terraform]
contact:
  email: alstn5038@gmail.com
  github: https://github.com/Minsoo-Shin
---

## Highlights

- **Zero Data Loss POS 파이프라인** (페이히어): HTTP 폴링 → Kafka·MQTT 이벤트 드리븐 + SQS 재처리.
- **CDC 파이프라인 설계** (룩코): PostgreSQL → Debezium → Kafka → Elasticsearch. 이중 쓰기 제거, 저트래픽 WAL 누적 문제 분석·해결.
- **검색 품질 개선** (룩코): 쿼리 튜닝 + 동의어/가중치 — mAP 0.23 → 0.37.
- **글로벌 인프라 최적화** (룩코): Lambda@Edge + S3 리전 재구성 — 응답 지연 37%↓, 비용 41%↓.
