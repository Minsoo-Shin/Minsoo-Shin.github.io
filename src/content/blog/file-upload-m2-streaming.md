---
title: '파일 업로드 서비스 2편 — 스트리밍 업로드: 파싱 레이어를 우회한다'
description: 'raw 바디를 InputStream으로 직결해 10GB도 상수 메모리로 저장하는 스트리밍 intake 구현과, 송신측(클라이언트)까지 스트리밍이어야 하는 이유.'
pubDate: 2026-07-26
category: Backend
tags: [spring-boot, file-upload, streaming, java]
published: true
---

[1편](/blog/file-upload-m1-multipart)에서 멀티파트 업로드가 대용량에서 부딪히는 한계를 봤다: 임시파일↔저장소 이중 쓰기, 크기 상한, 그리고 메모리 보관 시 파일 크기의 4배까지 튀는 힙. 이번 편은 그 해법인 **스트리밍 intake** — 요청 바디를 파싱 없이 소켓에서 디스크로 직결하는 경로다.

결론부터: 스트리밍을 가능하게 하는 건 HTTP 메서드나 Content-Type이 아니라 **멀티파트 파싱 레이어를 거치지 않는 것**이다. 파싱할 구조가 없는 raw 바디는 핸들러가 소켓 스트림을 직접 읽을 수 있고, 그러면 파일이 10GB든 서버 메모리엔 버퍼 몇 KB만 산다.

## 핵심 코드 — 사실상 InputStream 인자 하나

```java
@PutMapping(consumes = MediaType.APPLICATION_OCTET_STREAM_VALUE)
public ResponseEntity<UploadResponse> uploadStream(
        @RequestHeader("X-Filename") String filename,
        InputStream body) {
    StoredFile stored = fileStorageService.store(filename, body);
    return ResponseEntity.status(HttpStatus.CREATED).body(UploadResponse.from(stored));
}
```

핸들러 인자를 `InputStream`으로 선언하면 Spring MVC가 [`request.getInputStream()`(서블릿 API의 raw 요청 바디)을 그대로 넘긴다](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/arguments.html). 멀티파트처럼 핸들러 실행 전에 어딘가에 쌓아두는 단계가 없다. 서비스는 이 스트림을 저장소로 흘리고, 저장 구현의 `Files.copy`가 8KB 버퍼로 소켓→디스크를 반복한다:

```
PUT 소켓 ─(8KB씩)→ request.getInputStream() → Files.copy → 디스크
```

바디에 파일명이 실릴 자리가 없으므로 메타데이터는 헤더(`X-Filename`)로 받는다. 그리고 스트리밍은 **크기를 사전에 알 수 없으므로**, 저장 인터페이스가 기록한 바이트 수를 돌려주도록 바뀐다:

```java
public interface FileStorage {
    long store(String key, InputStream content) throws IOException;  // void → long
}
```

기존 멀티파트 경로(`POST`, 폼/소형용)는 그대로 두되 내부적으로 같은 스트리밍 코어에 위임한다 — intake가 둘이어도 저장 로직은 하나다. 전체 코드: [FileUploadController](https://github.com/Minsoo-Shin/file-upload-service/blob/main/java/server/src/main/java/com/example/upload/web/FileUploadController.java) · [FileStorageService](https://github.com/Minsoo-Shin/file-upload-service/blob/main/java/server/src/main/java/com/example/upload/service/FileStorageService.java) · [LocalFileStorage](https://github.com/Minsoo-Shin/file-upload-service/blob/main/java/server/src/main/java/com/example/upload/storage/LocalFileStorage.java)

## 메모리 안전 — 512MB 힙으로 1GB 업로드

힙을 `-Xmx512m`로 제한한 JVM에 1GB를 PUT하는 테스트([StreamingMemorySafetyTest](https://github.com/Minsoo-Shin/file-upload-service/blob/main/java/server/src/test/java/com/example/upload/StreamingMemorySafetyTest.java))로 확인했다: **OOM 없이 1.9초에 저장 완료.** 힙이 파일보다 작아도 되는 이유는 위 파이프라인에 파일 전체가 머무는 지점이 없기 때문이다.

[1편에서 측정한 멀티파트 두 모드](/blog/file-upload-m1-multipart) 옆에 스트리밍을 나란히 놓으면 차이가 분명하다:

<figure style="margin:1.5em 0;overflow-x:auto">
<svg viewBox="0 0 670 250" role="img" aria-label="업로드 경로별 latency와 peak 힙 비교 막대 그래프" style="width:100%;min-width:560px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <text x="0" y="20" font-size="12" font-weight="600" fill="currentColor" opacity="0.65">Latency (ms)</text>
  <line x1="170" y1="28" x2="170" y2="112" stroke="currentColor" opacity="0.25"/>
  <text x="160" y="46" font-size="12" text-anchor="end" fill="currentColor" opacity="0.8">스트리밍 PUT</text>
  <path d="M170 34 h148 q4 0 4 4 v8 q0 4 -4 4 h-148 z" fill="#2a78d6"><title>raw 스트리밍 (octet-stream PUT): 263 ms</title></path>
  <text x="328" y="46" font-size="12" font-weight="600" fill="currentColor">263 ms</text>
  <text x="160" y="74" font-size="12" text-anchor="end" fill="currentColor" opacity="0.8">멀티파트 spool</text>
  <path d="M170 62 h416 q4 0 4 4 v8 q0 4 -4 4 h-416 z" fill="#2a78d6"><title>멀티파트 — 디스크 spool (기본): 728 ms</title></path>
  <text x="596" y="74" font-size="12" font-weight="600" fill="currentColor">728 ms</text>
  <text x="160" y="102" font-size="12" text-anchor="end" fill="currentColor" opacity="0.8">멀티파트 메모리</text>
  <path d="M170 90 h321 q4 0 4 4 v8 q0 4 -4 4 h-321 z" fill="#2a78d6"><title>멀티파트 — 메모리 보관: 563 ms</title></path>
  <text x="501" y="102" font-size="12" font-weight="600" fill="currentColor">563 ms</text>
  <text x="0" y="152" font-size="12" font-weight="600" fill="currentColor" opacity="0.65">Peak 힙 증가분 (MB)</text>
  <line x1="170" y1="160" x2="170" y2="244" stroke="currentColor" opacity="0.25"/>
  <text x="160" y="178" font-size="12" text-anchor="end" fill="currentColor" opacity="0.8">스트리밍 PUT</text>
  <path d="M170 166 h15 q4 0 4 4 v8 q0 4 -4 4 h-15 z" fill="#2a78d6"><title>raw 스트리밍 (octet-stream PUT): 48 MB</title></path>
  <text x="195" y="178" font-size="12" font-weight="600" fill="currentColor">48 MB</text>
  <text x="160" y="206" font-size="12" text-anchor="end" fill="currentColor" opacity="0.8">멀티파트 spool</text>
  <path d="M170 194 h18 q4 0 4 4 v8 q0 4 -4 4 h-18 z" fill="#2a78d6"><title>멀티파트 — 디스크 spool (기본): 54 MB</title></path>
  <text x="198" y="206" font-size="12" font-weight="600" fill="currentColor">54 MB</text>
  <text x="160" y="234" font-size="12" text-anchor="end" fill="currentColor" opacity="0.8">멀티파트 메모리</text>
  <path d="M170 222 h416 q4 0 4 4 v8 q0 4 -4 4 h-416 z" fill="#2a78d6"><title>멀티파트 — 메모리 보관: 1037 MB</title></path>
  <text x="596" y="234" font-size="12" font-weight="600" fill="currentColor">1037 MB</text>
</svg>
<figcaption style="font-size:0.85em;opacity:0.65;margin-top:0.25em">동일 256MB 페이로드 · 로컬 실서버 측정 · 낮을수록 좋다</figcaption>
</figure>

| 경로 | latency | 서버 peak 힙 |
|---|---|---|
| raw 스트리밍 (octet-stream PUT) | **263 ms** | **48 MB** |
| 멀티파트 — 디스크 spool (기본) | 728 ms | 54 MB |
| 멀티파트 — 메모리 보관 | 563 ms | **1037 MB** |

스트리밍은 메모리(48MB 상수)와 latency 모두 우위다. 디스크 spool의 728ms는 임시파일↔저장소 이중 쓰기 비용이고, 단일 패스인 스트리밍(263ms)이 **2.7배 빠르다**. 측정 조건과 코드는 [1편의 벤치마크](/blog/file-upload-m1-multipart)와 동일 — [UploadBenchmarkTest](https://github.com/Minsoo-Shin/file-upload-service/blob/main/java/server/src/test/java/com/example/upload/UploadBenchmarkTest.java) · [devlog 04](https://github.com/Minsoo-Shin/file-upload-service/blob/main/docs/devlog/04-upload-benchmark.md).

## 서버만 스트리밍하면 절반이다 — 송신측 이야기

받는 쪽이 스트리밍이어도 **보내는 쪽이 파일을 통째로 메모리에 올리면** 클라이언트가 먼저 죽는다. 여기서 갈림길이 `Content-Length`다.

- `Content-Length`를 붙이려면 바디 크기를 미리 알아야 한다. 파일이라면 크기를 알지만, 크기를 모르는 스트림이면 **본문을 다 모아서 재야** 하고 — 그게 송신측 버퍼링이다.
- **chunked transfer encoding**은 Content-Length 없이 조각 단위로 흘려보낸다. JDK `HttpClient`의 `BodyPublishers.ofInputStream`이 이 방식이라, 위 테스트의 클라이언트도 1GB를 상수 메모리로 전송했다.
- `RestTemplate`이 기본으로 본문을 버퍼링하는 데는 이유가 있다: Content-Length 확보(구형 프록시 호환)와 **replay** — 리다이렉트(3xx)·인증 재도전(401)·재시도에서 본문을 다시 보내야 할 때, `InputStream`은 한 번 읽으면 끝이지만 `byte[]`는 다시 보낼 수 있다. 즉 버퍼링은 "본문 크기만큼 메모리"를 대가로 재전송 능력을 사는 안전 기본값이다.

대용량에서는 이 거래를 뒤집어야 한다. 스트리밍으로 보내는 대신, 전송이 실패했을 때 다시 보내는 일은 HTTP 클라이언트 라이브러리가 아니라 **애플리케이션이 직접 처리한다** — 서버가 어디까지 받았는지 추적하고, 클라이언트가 그 지점부터 이어 보내는 식이다. 그 답이 다음 단계의 resumable 업로드다.

## 남는 문제 — 스트리밍은 전송이지 프로토콜이 아니다

스트리밍 intake는 "어떻게 나르나"를 해결했을 뿐, 단일 거대 스트림의 구조적 약점은 그대로다.

- **all-or-nothing** — 9GB에서 끊기면 처음부터. 재개라는 개념이 없다.
- **타임아웃 함정** — 임베디드 Tomcat의 connection timeout은 요청라인·헤더에만 적용되고 본문 업로드는 기본적으로 사실상 무제한이다. 그렇다고 "20분짜리 업로드 타임아웃"을 거는 건 답이 아니다: 그 시간만큼 죽은 연결이 스레드를 점유하고, 상위 프록시/LB의 더 짧은 타임아웃이 먼저 끊는다.
- **온전성 검증** — 서버 파일시스템은 "받은 것"만 안다. 프레이밍이 정상인데 내용이 짧은 경우는 클라이언트가 알려준 크기·해시와 대조해야만 잡힌다.

세 문제의 공통 해법이 **청크 분할 + 재개**(resumable)다 — 청크당 짧은 타임아웃, 끊기면 해당 청크만 재전송, 청크·전체 단위 검증. 다만 그 전에 먼저 메워야 할 빈틈이 있다. 스트리밍은 받는 즉시 디스크에 쓰는 구조라, **전송이 중간에 실패하면 잘린 파일이 그대로 남는다.** [3편 — 검증과 보안: 실패해도 깨끗하게, 위험하면 거부한다](/blog/file-upload-m3-validation-security)에서 다룬다.
