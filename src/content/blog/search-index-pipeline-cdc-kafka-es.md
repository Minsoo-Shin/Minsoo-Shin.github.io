---
title: "검색엔진 색인 파이프라인 — CDC · Kafka · Elasticsearch"
description: "MongoDB Atlas Search에서 Elasticsearch로의 전환과 CDC/Kafka 기반 색인 파이프라인을 구축하며 마주친 운영 이슈와 해결 과정을 정리."
pubDate: 2024-04-15
category: Backend
tags: [cdc, elasticsearch, kafka, debezium]
published: true
---

> ⚠️ 이 포스트는 이관 과정에서 일부 문장이 요약·재작성되었습니다. 원문은 [velog](https://velog.io/@alstn5038/%EA%B2%80%EC%83%89%EC%97%94%EC%A7%84-%EC%83%89%EC%9D%B8-%ED%8C%8C%EC%9D%B4%ED%94%84%EB%9D%BC%EC%9D%B8-%EA%B5%AC%EC%B6%95-CDC-Kafka-Elasticsearch)에서 확인할 수 있습니다.

## 검색 엔진 파이프라인 구축 과정

### 배경

기존에는 full-text search를 위해 MongoDB Atlas Search를 사용하고 있었습니다. 그러나 `nori` analyzer로 한국어 형태소 분석을 적용하고, 사용하지 않는 한국어 단어가 포함된 컬렉션을 동의어로 매핑하려 하자 색인 오류가 발생했고, 해당 인덱스를 대상으로 한 애플리케이션 검색 쿼리 또한 실패했습니다. MongoDB 지원팀과의 상담으로도 해결되지 않아 Elasticsearch로의 전환을 결정했고, 이미 로깅 용도로 운영 중인 Elasticsearch를 활용하면 비용 절감 효과도 얻을 수 있었습니다.

### 검색엔진 교체 과정에서의 요구 사항

**Data Sync를 위한 Double Write 로직 제거**: 시스템은 PostgreSQL을 primary DB로, MongoDB를 read 용도로 사용하고 있었으며, 애플리케이션 레이어에서 insert/update/delete에 대한 이중 쓰기 로직을 구현해 두 저장소를 동기화하고 있었습니다. 이 구조는 복잡도와 버그, 유지보수 부담을 가져왔습니다. RDB로부터 파이프라인을 구성하는 CDC 패턴을 알게 되면서, 이중 쓰기를 제거할 수 있음을 확인했습니다. 비즈니스 요구사항상 eventual consistency가 허용 가능했기에 최종적으로 CDC를 선택했습니다.

### 아키텍처

![Architecture Diagram](https://velog.velcdn.com/images/alstn5038/post/2b0beee7-d762-4fc1-94bc-d1cccd56bbf1/image.png)

전체 구성은 다음과 같습니다.

- Source connector로 Debezium 기반 Kafka Connect 사용
- Sink connector는 Go로 직접 구현
- 운영 편의성과 CloudWatch 네이티브 모니터링을 위해 Kafka는 AWS MSK 위에 배포

### 여러 가지 문제 - 원인 - 해결

**1. 트래픽 낮은 DB에서의 WAL 누적**

CUD 연산이 거의 없는 DB(예: DevDB)의 경우 Connector가 slot을 읽지 않아 lag가 쌓이고, storage가 급격히 증가하여(50~60GB) DB가 down되는 현상이 발생했습니다. 읽히지 않은 LSN 위치 이후의 WAL과 read replica 데이터가 유지되기 때문입니다. 해결책으로 MSK Connector 설정을 통해 주기적인 heartbeat insert를 구성했습니다.

![Heartbeat Configuration](https://velog.velcdn.com/images/alstn5038/post/6f6efd33-6010-4c86-9570-77133ba13412/image.png)

참고: [CDC 구축 WAL 로그로 인한 DB 서버 down](/blog/cdc-wal-log-db-down)

**2. 동기 컨슈머 병목**

초기 Sink Connector는 배치를 처리한 뒤 커밋하는 동기 consumer 구조로 구현했습니다. 그러나 webhook 응답 지연이 발생하자 전체 이벤트 처리 lag가 9시간까지 밀려 서비스 장애로 이어졌습니다. consumer를 비동기로 전환하고, consumer group ID, job spec, worker 수 등을 설정으로 지원하도록 개선했습니다.

**3. Elasticsearch 메모리 고갈**

비동기 worker 수를 100개로 늘리자 Elasticsearch의 메모리 한계에 도달해 circuit breaker가 트립되었고, 모든 쿼리와 동기화 작업이 중단되었습니다. 단일 원인 제거보다 구조적인 개선을 택해 bulk API를 도입해 메모리 효율을 확보했습니다. 이벤트 배치를 개별 연산 대신 bulk command로 구성하도록 재구성했습니다.

**진행 중인 작업:** scoring 쿼리 최적화와 retry 처리 메커니즘을 지속적으로 개선 중입니다.
