---
company: (주) 룩코 (Looko)
role: Backend Engineer — Server (Go)
location: Seoul, KR
startDate: 2022-06-01
endDate: 2024-09-30
current: false
stack:
  - Go
  - PostgreSQL
  - Kafka
  - Debezium
  - Elasticsearch
  - Redis
  - AWS Lambda@Edge
  - S3
published: true
perspectives:
  software:
    summary: 사용자 70만 → 300만 성장기에 백엔드 전반 설계·개발 및 성능 최적화를 담당.
    highlights:
      - 동기식 이중 쓰기(Double Write)를 PostgreSQL-Kafka-Elasticsearch CDC 비동기 파이프라인으로 재설계.
      - 저트래픽 환경의 WAL 로그 누적 현상을 Debezium Heartbeat 설정으로 예방 (DB down 장애 분석).
      - Go 기반 커스텀 Sink Connector (Async Worker + Bulk Insert) 개발 — 대량 데이터 동기화 성능 10배+ 개선.
      - Elasticsearch 쿼리 튜닝(_source 제외, doc_values 활용) + 동의어 사전/가중치 로직 개선 — 검색 mAP 0.23 → 0.37 (약 60%↑).
      - ML 임베딩 기반 유사 상품 추천 시스템 — Kafka 비동기 파이프라인으로 1만 개 단위 상품 처리, ML 서버 부하 분산.
      - Lambda@Edge + S3 리전을 사용자 위치 기반으로 분산 재구성 — 응답 지연 37%↓, 글로벌 이미지 처리 비용 41%↓.
      - 부분 환불, 쿠폰 비례 차감 등 복잡한 정산 로직을 객체지향적으로 설계 — 유지보수성 증대.
---
