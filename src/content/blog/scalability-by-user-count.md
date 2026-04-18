---
title: "사용자 수에 따른 규모 확장성"
description: "단일 서버에서 시작해 데이터베이스 분리, 수평적 확장, 로드밸런서, 데이터베이스 다중화까지 사용자 증가에 따른 시스템 확장 전략을 정리."
pubDate: 2022-03-31
category: Backend
tags: [system-design, scalability, load-balancer, database-replication]
published: true
---

> 『가상 면접 사례로 배우는 대규모 시스템 설계』를 읽으며 정리한 글입니다.

## 단일 서버

모든 컴포넌트가 단 한대의 서버에서 실행되는 간단한 시스템부터 설계 해보자.

웹, 앱, 데이터베이스, 캐시 등이 전부 서버 한대에서 실행된다.

![](https://blog.kakaocdn.net/dna/wTOWq/btrx5zJ2d3o/AAAAAAAAAAAAAAAAAAAAAMF8YrjG_S0R6QF8m9bYalBmCD-l-oZOUbh5FKmm9eCH/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1777561199&allow_ip=&allow_referer=&signature=JiejpweGhptelqpK8P7D88LLLvM%3D)

사용자의 요청이 처리되는 과정과 요청을 만드는 만드는 기기에 대해서 살펴보자

- 사용자는 도메인 이름을 이용하여 웹사이트에 접속한다. 이 접속을 위해서는 도메인 이름을 도메인 이름 서비스(DNS)에 질의하여 IP 주소로 변환하는 과정이 필요하다. DNS는 보통 제 3 사업자가 제공하는 유료 서비스를 이용하게 되므로 우리의 시스템 일부는 아니다.
- DNS 조회 결과로 IP 주소가 반환된다. (15.125.23.214)
- 해당 IP 주소로 HTTP 요청이 전달 된다.
- 요청을 받은 웹 서버는 HTML 페이지나 JSON 형태의 응답을 반환한다.

> 어디에서 요청이 오는가? 웹 앱과 모바일 앱

## 데이터베이스

사용자가 늘면 서버 하나로는 충분하지 않다. 그래서 여러 서버를 두어야한다. 보통 트랙픽을 처리하는 서버와 데이터베이스용 서버로 분리하여 독립적으로 확장해 나갈 수 있도록 한다.

![](https://blog.kakaocdn.net/dna/cdIEFy/btrx75gwna6/AAAAAAAAAAAAAAAAAAAAALwns1KpHPajEBjLJHtbZ5xX-SoNs-cevDezU4tKgxHQ/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1777561199&allow_ip=&allow_referer=&signature=GaOU4tyDoa5WMvA%2BQG%2Be3Wy7EEY%3D)

## 어떤 데이터베이스를 사용할 것인가?

전통적으로 관계형 데이터베이스와 비관계형 데이터베이스 사이에서 고를 수 있는데, 관계형 데이터베이스(RDBMS) 가운데 가장 유명한 것으로는 MySQL, 오라클 데이터베이스, PostgreSQL 등이 있다. 관계형 데이터베이스는 자료를 테이블과 열, 컬럼으로 표현한다. SQL을 사용하면 여러 테이블에 있는 데이터를 join하여 합칠 수 있다.

 반면 비 관계형 데이터베이스 NoSQL이라고 부르는 것들은 4부류로 나눌 수 있는데, 키-값 저장소(key-value store), 그래프 저장소(graph store), 칼럼 저장소 (column store), 그리고 문서 저장소(document store)이다.

비 관계형 데이터베이스는 join연산을 지원하지는 않지만 아래와 같은 이유로 선택될 수 있다.

- 아주 낮은 응답 지연시간(latency) 요구될 때
- 다루는 데이터가 비정형이라 관계형 데이터가 아닐 경우
- 데이터(JSON, YAML, XML등)를 직렬화하거나 역질력화할 수 있기만 하면 됨
- 아주 많은 양의 데이터를 저장할 필요가 있을 경우

## 수직적 규모 확장 vs 수평적 규모 확장

케일 업이라고도 하는 수직적 규모 확장 프로세스는 서버에 고사양 자원(더 좋은 CPU, 더 많은 RAM 등)을 추가하는 행위 말한다.

반면 스케일 아웃이라고도 하는 수평적 규모 확장 프로세스는 더 많은 서버를 추가하여 성능을 개선하는 행위를 말한다.

## 수직적 규모 확장의 단점

- 한 대의 서버에 CPU나 메모리를 **무한대로 증설할 방법은 없다**.
- 장애에 대한 **자동복구(failover) 방안이나 다중화(redundancy) 방안을 제시하지 않는다.** 서버에 장애가 발생하면 웹사이트/앱은 완전히 중단된다.

이런 단점 때문에 대규모 애플리케이션을 지원하는 데는 수평적 규모 확장법이 더 낫다.

이제는 부하 분산기 또는 로드 밸런서를 도입하여 서버를 다중화하는 방식과

데이터베이스의 다중화를 알아볼 것이다.

## 로드밸런서

로드밸런서는 부하 분산 집합에 속한 웹 서버들에게 트래픽 부하를 고르게 분산하는 역할을 한다.

![](https://blog.kakaocdn.net/dna/bx03z7/btrx1x6XhP1/AAAAAAAAAAAAAAAAAAAAAL9jDMEfnu5vg1nszTVJUvKymdC903xQU0sxplNkzJza/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1777561199&allow_ip=&allow_referer=&signature=r%2BCAvDqk%2Fwb3xNvbfLxR5UAczFE%3D)

사용자는 로드밸런서의 공인 IP로 접속하고 웹서버는 직접적으로 클라이언트와 커넥션을 맺지 않는다. 보안을 위해 서버간 통신에는 사설 IP주소가 이용된다. 그림에 나온대로 부하 분산 집합에 또 하나의 서버가 추가하고 나면 장애를 자동복구하지 못하는 문제는 해소되고, 웹 계층 가용성이 향상된다.

- 서버 1이 다운되면 모든 트래픽은 서버 2로 전송되어 전체가 다운되는 일을 방지한다.
- 유입되는 트래픽이 증가하여 두 대의 서버가 감당하지 못할 경우, 더 많은 서버를 추가하여 로드밸런싱을 하면 된다.

## 데이터베이스 다중화

보통은 서버 사이에 주-부 관계를 설정하고, 데이터 원본은 주 서버에, 사본은 부 서버에 저장하는 방식이다. 부 데이터베이스는 주 데이터베이스로 부터 사본을 전달받으며, 읽기 연산만을 지원한다. 보통의 쓰기 연산보다는 읽기 연산이 많기 때문에 부 데이터베이스를 더 많이 둔다.

![](https://blog.kakaocdn.net/dna/2fjvQ/btrx5APIQTA/AAAAAAAAAAAAAAAAAAAAAI1R-0VJFVEVwnKer47zCuxcjo_1JA4Xs8fnSfspYGX9/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1777561199&allow_ip=&allow_referer=&signature=3r8C3mQEKgT5RJTauiv3znmr6ms%3D)

## 다중화의 이점

- 더 나은 성능 : 주-부 다중화 모델에서 모든 데이터 변경 연산은 주 데이터베이스 서버로만 전달되는 반면 읽기 연산은 부 데이터베이스 서버들로 분산된다.
- 안정성 : 데이터베이스 서버 가운데 일부가 파괴되어도 데이터는 보존될 것이다.
- 가용성 : 데이터를 여러 지역에 복제해 둠으로써, 하나의 데이터베이스 서버에 장애가 발생하더라도 다른 서버에 있는 데이터를 가져와 계속 서비스를 할 수 있다.

## 데이터베이스가 다운된다면?

- 부 서버가 한 대 뿐인데 다운이된 경우라면, **읽기 연산은 한시적으로 모두 주데이터베이스로 전달**될 것이다. 또한 즉시 새로운 부 데이터베이스 서버가 장애 서버를 대체할 것이다. 부 서버가 여러 대인 경우에 읽기 연산은 나머지 부 데이터베이스 서버들로 분산될 것이며, 새로운 부 데이터베이스 서버가 장애 서버를 대체할 것이다. (주 <-> 부)
- 주 데이터베이스 서버가 다운되면, 한 대의 부 데이터베이스만 있는 경우 해당 부 데이터베이스 서버가 새로운 주 서버가 될 것이며, 모든 데이터베이스 연산은 일시적으로 새로운 주 서버상에서 수행될 것이다. 그리고 새로운 부서버가 추가될 것이다. **프로덕션 환경에서 벌어지는 일은 이것보다는 사실 더 복잡한데, 부 서버에 보관된 데이터가 최신 상태가 아닐수 있기 때문이다.** 없는 데이터는 복구 스크립트(recovery script)를 돌려서 추가해야 한다. 다중 마스터(multi-masters)나 원형 다중화(circular replication) 방식을 도입하면 이런 상황에 대처하는 데 도움이 된다.

![](https://blog.kakaocdn.net/dna/beQrCd/btrx8a99e8q/AAAAAAAAAAAAAAAAAAAAAM9DpLwL_b3x6fumOvzgon0T0Q--UYAhkVGD02GwA-ic/img.png?credential=yqXZFxpELC7KVnFOS48ylbz2pIh7yKj8&expires=1777561199&allow_ip=&allow_referer=&signature=uUfa7QemdOXbds4NswsI2hZhlVk%3D)

이렇게 설계하게 되면 다음과 같이 동작한다.

- 사용자는 DNS로 부터 로드밸러서의 공개 IP주소를 받는다.
- 사용자는 해당 IP주소를 사용해 로드밸런서에 접속한다.
- HTTP요청은 서버1이나 서버2로 전달된다.
- 웹 서버는 **사용자의 데이터를 부 데이터베이스 서버에서 읽는다.**
- 웹 서버는 **데이터 변경 연산은 주 데이터베이스로 전달**한다. (데이터 추가, 삭제, 갱신 연산 등)

다음은 응답시간을 줄이는 캐시와 정적 컨텐츠를 공부하며 정리할 예정이다.
