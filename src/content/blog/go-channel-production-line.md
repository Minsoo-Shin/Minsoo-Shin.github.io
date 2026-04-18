---
title: "Go 채널의 장점 — 공정 엔지니어의 직관으로"
description: "Go 언어의 채널이 뮤텍스 없이 동시성 프로그래밍을 가능하게 하는 원리를 자동차 생산 공정(생산자-소비자 패턴)에 비유해 설명한 글."
pubDate: 2022-06-18
category: Backend
tags: [go, concurrency, channel, goroutine, hardware-intuition]
published: true
---

> [2026 update: TODO — 이 때 "업무에 적용해봐야겠다"고 썼는데, 지금은 실제로 Kafka/MQTT 기반 생산자-소비자 파이프라인을 프로덕션에 돌리고 있음. 짧게 덧붙이면 서사가 완성됨]

Tuker의 Go언어 프로그래밍이라는 책을 읽으면서 배운 내용에 대해서 정리해보려고 한다.

그 중에서도 채널 관련 부분이다.

**채널이라는 것은 고루틴간 메세지를 전달해주는 메세지큐**이다.

고루틴은 하나의 쓰레드와 1:1 매칭되어있기때문에 쓰레드라고 생각하면 쉽다.

**채널은 어떤 장점이 있을까? 채널을 통해서 뮤텍스 없이 동시성 프로그래밍이 가능하다.**

어떻게 동시성 처리를 할 수 있을까? 아래와 같다.

마치 공장과도 같다. 차량 생산 공정을 예를 들어보면 세 가지 설비(고루틴)가 각 역할을 하고 있다.

> 바디 생산 - 타이어 연결 - 페인트

세 공정이 읽고 쓰는 메모리가 다르다는 가정 하에 서로의 공정 시간에 영향을 주지 않는다.

그렇기 때문에 Takt Time에 영향을 주지 않고 Mutex가 필요 없는 것이다.

반면에 세 고루틴이 모든 공정을 맡아서 진행하면 경쟁 상태에 놓이게 되어 동시성 문제가 발생할 수 있고, 이로 인해 Takt Time에 영향을 줄 수 있다.

![2. 생산자 - 소비자 패턴](https://blog.kakaocdn.net/dna/C6ZBW/btrE7DEy7FO/AAAAAAAAAAAAAAAAAAAAALeTZXQkG4YJPJPNruVt6kx1MiZJPQw6hX9xjbvmmKRD/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1777561199&allow_ip=&allow_referer=&signature=U%2F92YjpXsk3%2FLhZBYEHDs2EsYG0%3D)

하고 있는 업무 역시 생산자 - 소비자 패턴으로 변경해서 얼마나 줄어들 수 있는지 확인 한번 해봐야겠다...
