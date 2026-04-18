---
title: "Byte Order — 엔디안과 네트워크 바이트 오더"
description: "빅 엔디안과 리틀 엔디안의 개념, CPU별 바이트 저장 순서, 네트워크 바이트 오더까지 바이트 순서(Byte Order)의 기본기를 정리."
pubDate: 2023-07-07
category: Backend
tags: [endianness, big-endian, little-endian, network-byte-order, cpu]
published: true
---

> 이진 데이터를 쓸 때는 바이트 순서를 지정하도록 되어있다. 주로 빅 엔디안 (Big Endian), 리틀 엔디안 (Little Endian)이라는 두 가지 주요한 바이트 순서가 있다.

```go
func Write(w io.Writer, order ByteOrder, data any) error
```

## Byte Order (바이트 오더)

이를 이해하기 위해서 메모리에 데이터를 어떻게 저장되고 있는지 알아야한다.

### 비트(Bit)와 바이트(Byte)

컴퓨터는 모든 데이터를 2진수로 표현하고 처리한다.

**비트(Bit)**: 컴퓨터가 데이터를 처리하기 위해 사용하는 데이터의 최소 단위.

**바이트(Byte)**: 비트 8개가 모여서 구성되며, 한 문자를 표현할 수 있는 최소 단위.

### 바이트 저장 순서(Byte Order)

컴퓨터는 데이터를 메모리에 저장할 때 바이트 단위로 나눠서 저장한다. 하지만 보통 저장하는 데이터는 32비트(4바이트), 64비트(8바이트)로 되어있다. 따라서 이렇게 연속되는 바이트를 순서대로 저장해야 하는데, 이것을 바이트 저장 순서라고 한다.

두 가지 방식이 있다: 빅 엔디안, 리틀 엔디안

![Byte Order Visualization](https://velog.velcdn.com/images/alstn5038/post/3085fdc6-618d-4093-9d6a-c3bffddf9df3/image.png)

> **빅 엔디안 (Big Endian):**
> - IBM PowerPC 아키텍처 계열
> - IBM System z (메인프레임) 아키텍처
> - SPARC 아키텍처 계열
> - Motorola 68000 시리즈
> - HP PA-RISC 아키텍처

> **리틀 엔디안 (Little Endian):**
> - x86 아키텍처 계열 (Intel 및 AMD 프로세서)
> - ARM 아키텍처 계열 (널리 사용되는 ARM 프로세서)
> - MIPS 아키텍처 계열
> - RISC-V 아키텍처 계열
> - DEC Alpha 아키텍처 (현재는 사용되지 않음)

#### 빅 엔디안(big endian) vs 리틀 엔디안 (little endian)

**빅 엔디안 특징:**

- 낮은 주소에 데이터의 높은 바이트부터 저장하는 방식
- 메모리에 저장된 순서 그대로 읽을 수 있어 이해하기가 쉬움
- RISC CPU 계열에서 이 방식으로 데이터를 저장

32비트 크기의 정수 (0x12345678) 데이터를 저장한다고 하자:

> 0x12, 0x34, 0x56, 0x78. 각 1 바이트씩 총 4바이트로 저장할 것이다.

![Big Endian Storage](https://velog.velcdn.com/images/alstn5038/post/376a1397-e19a-41a8-876e-d741bf0b85c9/image.png)

**리틀 엔디안 특징:**

- 낮은 주소에 데이터의 낮은 바이트부터 저장하는 방식
- 평소에 읽던 방식과 반대로 읽어야 함
- 인텔 CPU 계열에서 많이 사용

32비트 크기의 정수 (0x12345678) 데이터를 저장한다고 하자:

> 0x78, 0x56, 0x34, 0x12. 각 1 바이트씩 총 4바이트로 저장할 것이다.

![Little Endian Storage](https://velog.velcdn.com/images/alstn5038/post/f74e4f66-3f10-4e25-94f7-423b823f6ee8/image.png)

빅 엔디안과 리틀 엔디안은 단지 저장해야 할 큰 데이터를 어떻게 나누어 저장하는가에 따른 차이일 뿐, 어느 방식이 더 우수하다고는 단정할 수 없습니다.

### 비교 분석

**1. 계산기 덧셈**

리틀 엔디안이 더 빠르다. 실제로 사람들도 일의 자리 수부터 더하기 시작하고, 더해서 10이 넘어가면 carry 발생하는데, 리틀 엔디안이 처리가 수월하다.

![Addition Comparison](https://velog.velcdn.com/images/alstn5038/post/f897aec7-af28-43c0-9db1-daad73b1ea46/image.png)

이미지 출처: https://jhnyang.tistory.com/226

**2. 숫자 비교**

빅엔디안이 큰자리수가 메모리 처음에 위치한다. 숫자 비교는 가장 큰자리수부터 비교하는 게 가장 빠르다.

**3. 네트워크 바이트 오더**

빅 엔디안이 가장 흔한 포맷이다. TCP, UDP, IPv4, IPv6와 같은 많은 프로토콜들이 데이터를 전송하는데 빅 엔디안 방식을 사용한다.

---

**출처**

- http://www.tcpschool.com/c/c_refer_endian
- https://jhnyang.tistory.com/172
