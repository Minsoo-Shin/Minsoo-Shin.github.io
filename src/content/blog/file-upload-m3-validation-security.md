---
title: '파일 업로드 서비스 3편 — 검증과 보안: 실패해도 깨끗하게, 위험하면 거부한다'
description: '스트리밍 업로드의 빈틈 세 가지를 메운다 — 원자적 저장(부분파일 정리), 스트리밍 도중 크기 상한(413), 파일명 sanitize(path traversal·제어문자).'
pubDate: 2026-07-26
category: Backend
tags: [spring-boot, file-upload, security, java]
published: true
---

[2편](/blog/file-upload-m2-streaming)의 스트리밍 intake는 받는 즉시 디스크에 쓴다. 효율의 원천인 이 구조가 그대로 빈틈이 된다: **전송이 중간에 실패하면 그 순간까지 쓴 바이트가 디스크에 남는다.** 잘린 파일이 정상 파일과 같은 자리에 있으면, 나중에 그걸 읽는 쪽은 구분할 방법이 없다.

이번 편은 스트리밍을 실서비스에 놓을 수 있게 만드는 세 가지다: **원자적 저장**(실패는 흔적을 남기지 않는다), **스트리밍 도중 크기 상한**(다 받고 나서 거부하면 늦다), **파일명 검증**(신뢰하지 않는다).

## 1. 원자적 저장 — 최종 경로에는 완성본만

핵심은 "쓰는 곳"과 "보이는 곳"의 분리다. 같은 저장소 아래 스테이징 디렉터리(`.tmp/`)에 스트리밍으로 쓰고, **끝까지 성공했을 때만** 최종 경로로 옮긴다:

```java
Path temp = tmpDir.resolve(key);            // storage/.tmp/{id}
try {
    long written;
    try (content) {
        written = Files.copy(content, temp, StandardCopyOption.REPLACE_EXISTING);
    }
    Files.move(temp, target, StandardCopyOption.ATOMIC_MOVE);   // rename — 원자적
    return written;
} catch (IOException | RuntimeException e) {
    Files.deleteIfExists(temp);             // 실패 → 흔적 제거
    throw e;
}
```

`ATOMIC_MOVE`가 같은 파일시스템 안에서는 **rename**이라 데이터 복사가 없다 — 10GB든 O(1)이고, 옮기는 도중의 어중간한 상태가 외부에 보이지 않는다. `.tmp`를 저장소 밖(예: `/tmp`)이 아니라 **같은 base 디렉터리 아래** 두는 이유가 이것이다: 파일시스템이 갈리면 rename이 불가능해 풀 카피로 강등된다.

이제 실패 시나리오의 결과가 단순해진다: 최종 경로에는 **완성된 파일이 있거나, 아무것도 없거나** 둘 중 하나다.

## 2. 크기 상한 — 다 받고 거부하면 늦다

멀티파트는 파싱 레이어가 `max-file-size`를 강제해 주지만([1편](/blog/file-upload-m1-multipart)), 파싱을 우회한 raw 스트리밍은 **상한도 직접 챙겨야 한다.** 조건이 하나 있다: 상한 검사가 스트리밍의 상수 메모리를 깨면 안 된다.

답은 바이트를 모으지 않고 세기만 하는 필터 스트림이다:

```java
class LimitedInputStream extends FilterInputStream {
    private final long limit;
    private long count;

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
        int n = super.read(b, off, len);
        if (n > 0) {
            count += n;
            if (count > limit) throw new UploadTooLargeException(limit);
        }
        return n;
    }
}
```

소켓→디스크 파이프라인 사이에 끼워 넣으면, 초과하는 **바로 그 read에서** 예외가 터진다 — 상한이 20GB든 넘는 순간 전송이 끊기고, 1번의 원자적 저장이 임시파일을 지우고, 클라이언트는 **413 Payload Too Large**를 받는다. 카운터 하나뿐이라 힙 제한 테스트(512MB 힙에 1GB 업로드)도 여전히 통과한다.

## 3. 파일명 — 메타데이터라도 신뢰하지 않는다

저장 키는 서버가 발급한 UUID라([1편](/blog/file-upload-m1-multipart)) 클라이언트 파일명이 경로가 될 일은 없다. 그런데도 파일명을 검증하는 이유는, 이 문자열이 메타데이터로 저장됐다가 **언젠가 응답 헤더·목록 화면·다운로드 파일명으로 되살아나기** 때문이다. 들어올 때 거르지 않으면 나갈 때 문제가 된다.

거부 조건: 경로 조작 문자(`..`, `/`, `\`), **제어문자**(널바이트 포함), **255자 초과** — 모두 400 Bad Request. 그리고 저장 계층에도 독립적인 방어선이 하나 더 있다: `LocalFileStorage`가 최종 경로를 정규화한 뒤 base 디렉터리를 벗어나면 거부한다. 서비스 계층 검증에 구멍이 나도 저장 계층이 잡는 심층 방어(defense in depth)다.

전체 코드: [LocalFileStorage](https://github.com/Minsoo-Shin/file-upload-service/blob/main/java/server/src/main/java/com/example/upload/storage/LocalFileStorage.java) · [LimitedInputStream](https://github.com/Minsoo-Shin/file-upload-service/blob/main/java/server/src/main/java/com/example/upload/service/LimitedInputStream.java) · [FileStorageService](https://github.com/Minsoo-Shin/file-upload-service/blob/main/java/server/src/main/java/com/example/upload/service/FileStorageService.java)

## 범위에서 뺀 것

- **MIME/매직넘버 검증** — 확장자·Content-Type만 믿을 수 없어 파일 앞부분(매직넘버)을 봐야 하는데, 스트리밍 구조에서 "앞부분만 미리 보기"는 peek 버퍼링이 필요해 별도 작업으로 분리했다.
- **크기 사전 대조** — chunked 전송에는 Content-Length가 없어서 "받았어야 할 크기"를 헤더로는 알 수 없다. 기대 크기를 프로토콜 자체에 넣는 청크 업로드에서 함께 다루는 게 자연스럽다.

## 다음 — 남은 문제는 전부 청크가 풀어야 한다

2편에서 남긴 all-or-nothing·타임아웃·온전성 검증에, 방금의 크기 사전 대조까지 — 남은 문제들의 답이 모두 **청크 업로드**(업로드 세션 생성 → 청크 분할 전송 → 병합·검증)로 수렴한다. 구현하면 4편에서 다룬다.
