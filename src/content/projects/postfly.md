---
title: "포스트플라이 (Postfly)"
description: "글로벌 역직구 물류 플랫폼 MVP. RAG 기반 통관 안내 AI 챗봇, 주문/결제(PG)/배송 프로세스를 혼자 설계·구축해 앱스토어에 런칭."
pubDate: 2025-06-01
tracks: [software]
kind: side
role: "Solo developer (기획 · 백엔드 · 프론트 · 인프라)"
stack: [Go, Python, RAG, OpenAI API, PG, Docker, AWS]
tags: [side-project, rag, logistics, commerce, ai]
demo: https://shipguide.wed-di.com/
featured: false
published: true
---

## 개요

사이드 프로젝트로 시작한 **글로벌 역직구 물류 플랫폼**의 MVP. 해외 소비자가 한국 상품을 직구할 때 마주치는 복잡한 **국가별 통관 규정**을 자동 안내하고, 주문부터 배송까지 한 번에 처리할 수 있게 만드는 것이 목표입니다.

App Store에 런칭했고, 관련 Shipguide 웹사이트도 함께 운영합니다.

- App Store: [포스트플라이](https://apps.apple.com/kr/app/id6744011647)
- Shipguide: https://shipguide.wed-di.com/

## 해결한 문제

- 해외 역직구 과정에서 **국가별 통관 규정이 파편적**이고 최신화가 어렵다.
- 개별 물류사·PG사·배송사 연동이 초기 스타트업에겐 큰 진입 장벽.
- MVP 단계에서 **수익 구조**와 **사용자 신뢰**를 동시에 증명해야 함.

## 기술적 선택

- **RAG 기반 통관 안내 챗봇**: 각국 관세청·물류사 문서를 임베딩하여 검색, 사용자 질의에 맞춰 답변 생성.
- **결제/주문 플로우**: 국내 PG사 연동, 주문 상태 머신 설계, 배송 이벤트 수신.
- **인프라**: 가벼운 컨테이너 기반 배포, 최소 비용으로 운영 가능한 구조 선택.
- 설계·백엔드·프론트·인프라 모두 **혼자 구축** — 커머스 도메인 지식(룩코에서의 주문/결제/정산 경험)을 역직구 맥락에 적용.

## 성과

- **App Store 런칭 완료** — 실제 사용자 유입 단계
- MVP로 **수익화 구조(PG 연동)** 까지 검증
- 커머스 백엔드 전반(주문·결제·배송)을 **1인 개발로 재구성**한 경험

## 비고

진행 중인 프로젝트로, 내용은 수시로 업데이트됩니다.
