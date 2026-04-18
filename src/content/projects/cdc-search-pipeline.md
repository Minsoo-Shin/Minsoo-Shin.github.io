---
title: "CDC 검색 파이프라인 — 이중 쓰기 제거와 검색 품질 개선"
description: "PostgreSQL-Debezium-Kafka-Elasticsearch CDC로 이중 쓰기를 제거하고, 쿼리 튜닝·동의어 사전·Function Score로 검색 mAP@30을 0.23 → 0.39까지 끌어올림."
pubDate: 2024-04-01
tracks: [software]
kind: company
company: "룩코 (Lookpin)"
role: "Backend / 검색 시스템 설계·구현"
stack: [Go, PostgreSQL, Debezium, Kafka (AWS MSK), Elasticsearch, Lambda, Redis]
tags: [cdc, elasticsearch, kafka, search-quality, ml-embedding]
featured: true
published: true
---

## 개요

룩코(세컨솔드) 재직 중 수행한 프로젝트로, 이커머스 검색 화면(홈 다음 최대 유입 경로)의 **품질과 인프라를 동시에 개선**했습니다. 검색엔진을 MongoDB Atlas Search → Elasticsearch로 교체하고, 애플리케이션 레이어의 이중 쓰기를 CDC 파이프라인으로 대체했습니다.

## 해결한 문제

**인프라 측면**
- MongoDB Atlas Search 월 50만 원대 비용 + Nori 동의어 인덱싱 실패 이슈.
- PostgreSQL ↔ Elasticsearch **이중 쓰기(Double Write)** 로 코드 복잡도·정합성 문제 상존.
- 이미지 임베딩(64차원 벡터) 추출이 API 응답 경로에서 동기적으로 돌아 타임아웃 유발.

**검색 품질 측면**
- 중고 사장님들이 직접 등록해 표현이 제각각 ("NIKE / nike / 나이키", "화이트 / White / 흰색").
- 품질을 측정할 지표 자체가 없음.

## 기술적 선택

### CDC 파이프라인
- **PostgreSQL WAL → Debezium Source Connector → Kafka (AWS MSK) → 직접 구현한 Go Sink Connector → Elasticsearch**.
- Sink는 **Kafka Batch Listener + 멀티 워커 + Elasticsearch Bulk API** 구조로 처리량 확보.
- 이미지 임베딩은 별도 프로세서로 분리해 상품 저장과 독립적으로 처리.
- 저트래픽 환경의 WAL 누적 이슈는 Debezium heartbeat 설정으로 해결. → [상세](/blog/cdc-wal-log-db-down)

### 검색 품질
- **mAP@30 도입** (무신사의 평가 기준 차용). 클릭 로그 기반 품질 측정.
- **필터링 로직**: 검색어 대부분이 `브랜드 + 카테고리` 형태임을 확인 → 딕셔너리 기반 필터 + `OR → AND`.
- **Function Score**: 좋아요/찜/장바구니 기반 유저 선호도 점수. 최근 2주 데이터만 집계해 트렌드 반영, **AWS Lambda 일 1회 배치**로 인덱스 갱신.
- **형태소 분석 + 동의어 사전**: 명사 중심 분석으로 노이즈 제거, "나이키→nike", "반바지→숏팬츠" 등 사전 구축.

## 성과

- **mAP@30**: 0.23 → **0.39** (목표 0.37 초과 달성), QA 정성 평가도 통과
- **이중 쓰기 제거**로 데이터 동기화 코드 단순화
- **인프라 비용 절감** (기존 Elastic Cloud 재활용)
- **최종 일관성 보장**, 장애 시에도 복구 용이
- 대량 데이터 동기화 **성능 10배+ 개선** (Sink Async Worker + Bulk)

## 관련 글

- [검색엔진 색인 파이프라인 구축: CDC, Kafka, Elasticsearch](/blog/search-index-pipeline-cdc-kafka-es)
- [CDC 구축: WAL 로그로 인한 DB 서버 down](/blog/cdc-wal-log-db-down)
