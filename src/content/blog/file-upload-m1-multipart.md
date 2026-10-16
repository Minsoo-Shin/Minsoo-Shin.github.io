---
title: '파일 업로드 서비스 1편 — 가장 단순한 멀티파트 업로드, 그리고 그 한계'
description: 'Spring Boot 멀티파트 업로드(M1)의 핵심 코드 3계층을 정리하고, 이중 디스크 쓰기·크기 상한·메모리 문제를 측정으로 확인한다.'
pubDate: 2026-07-26
category: Backend
tags: [spring-boot, file-upload, multipart, java]
published: true
---

파일 업로드 서비스를 밑바닥부터 단계적으로 만들고 있다. 목표는 10GB 파일도 재개·중복제거까지 되는 업로드 서버지만, 시작은 가장 단순한 형태다: **멀티파트 폼 업로드 하나를 end-to-end로 받는 것(M1)**. 이 글은 그 최소 구현의 핵심 코드 영역이 어떻게 생겼는지, 그리고 이 방식이 어디서 한계에 부딪히는지를 정리한다.

결론부터: 멀티파트 업로드는 소형 파일에는 충분하지만, 대용량에서는 **같은 데이터를 디스크에 두 번 쓰고**, `max-file-size` 상한에 묶이며, 설정에 따라 메모리가 파일 크기에 비례해 터질 수 있다.

## 핵심 코드는 3계층이면 된다

환경은 Spring Boot 4.1 + Java 21. 최소 구현의 코드 영역은 셋으로 나뉜다.

### 1. 컨트롤러 — HTTP 변환만

```java
@RestController
@RequestMapping("/api/files")
public class FileUploadController {

    private final FileStorageService fileStorageService;

    @PostMapping
    public ResponseEntity<UploadResponse> upload(@RequestParam("file") MultipartFile file) {
        StoredFile stored = fileStorageService.store(file);
        return ResponseEntity.status(HttpStatus.CREATED).body(UploadResponse.from(stored));
    }
}
```

`MultipartFile`을 받아 서비스에 넘기고 201 + 메타(JSON)를 돌려준다. 로직은 없다.

### 2. 서비스 — 검증과 이름 정리

```java
public StoredFile store(MultipartFile file) {
    if (file == null || file.isEmpty()) {
        throw new IllegalArgumentException("Uploaded file is empty");
    }
    String originalFilename = sanitize(file.getOriginalFilename());
    String id = UUID.randomUUID().toString();
    long size = storage.store(id, file.getInputStream());
    return new StoredFile(id, originalFilename, size);
}
```

여기서 두 가지가 중요하다.

- **파일명은 신뢰하지 않는다.** `../`, 경로 분리자, 제어문자가 섞인 이름은 거부한다(path traversal). 보안 단계는 나중이지만 traversal 차단만은 첫 커밋부터 넣었다.
- **저장 키는 클라이언트 파일명이 아니라 서버가 발급한 UUID다.** 원본 파일명은 메타데이터로만 보관한다. 파일명 충돌·덮어쓰기 문제가 원천적으로 사라진다.

### 3. 스토리지 포트 — 저장 위치 추상화

```java
public interface FileStorage {
    long store(String key, InputStream content) throws IOException;
}
```

로컬 FS 구현(`Files.copy`)으로 시작하되, 인터페이스로 분리해 뒀다. 나중에 S3로 갈아탈 때 이 구현만 교체하면 된다. 첫 단계에서 유일하게 "미리 한" 설계다.

## 소형 파일에는 이대로 충분하다 — 단, 설정은 챙기자

프로필 이미지, 문서 첨부 같은 소형 파일이라면 이 멀티파트 구현으로 충분하다. 대신 Tomcat이 멀티파트 요청을 어떻게 다루는지 알고, `spring.servlet.multipart.*` 설정을 **기본값에 맡기지 말고 의도적으로** 잡아야 한다.

| 설정 | 기본값 | 역할과 유의점 |
|---|---|---|
| `max-file-size` | 1MB | 파일 하나의 허용 상한. 초과 시 요청 거부(`MaxUploadSizeExceededException`). 서비스 정책에 맞게 명시하고, 예외를 413 응답으로 매핑해 줄 것 |
| `max-request-size` | 10MB | 요청 전체(파일 여러 개 + 폼 필드 합산) 상한. 다중 파일 폼이면 `max-file-size × 파일 수`보다 크게 |
| `file-size-threshold` | 0 | 메모리↔디스크 스위치. 이하면 메모리(byte[]), 초과하면 임시파일로 spool. 이름이 비슷해 보여도 `max-file-size`와는 **무관한** 별개 축이다 |
| `location` | 컨테이너 temp | spool 임시파일이 쓰이는 디렉터리. 디스크 용량·권한을 확인하고, 컨테이너 배포라면 쓰기 가능한 볼륨인지 챙길 것 |

> 이 설정들의 원형은 서블릿 스펙의 `<multipart-config>` 태그(= [`@MultipartConfig`](https://jakarta.ee/specifications/servlet/6.1/apidocs/jakarta.servlet/jakarta/servlet/annotation/multipartconfig) 애너테이션)다. Spring Boot는 이를 [`spring.servlet.multipart.*` 속성](https://docs.spring.io/spring-boot/appendix/application-properties/index.html)으로 노출하며([`MultipartProperties`](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/servlet/autoconfigure/MultipartProperties.html)), 공식 가이드는 [Handling Multipart File Uploads](https://docs.spring.io/spring-boot/how-to/spring-mvc.html#howto.spring-mvc.multipart-file-uploads) 참고.

운영상 알아둘 동작 하나: 기본값이 threshold=0이라([`MultipartProperties` 문서](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/servlet/autoconfigure/MultipartProperties.html): "The default is 0") **별도 설정이 없으면 모든 업로드가 일단 임시파일로 디스크에 쓰인다.** 실제 spool을 수행하는 Tomcat 쪽 문서가 threshold의 의미를 이렇게 정의한다:

> The threshold, in bytes, **below** which items will be retained in memory and **above** which they will be stored as a file.
>
> — Tomcat [`DiskFileItem`](https://tomcat.apache.org/tomcat-11.0-doc/api/org/apache/tomcat/util/http/fileupload/disk/DiskFileItem.html)

0이면 그 아래에 남을 수 있는 크기가 없다 — 전부 디스크행이다. 핸들러의 `MultipartFile`은 이미 디스크에 spool된 파일을 가리키는 핸들일 뿐이다.

## 대용량에서는 무엇이 문제인가

### 1. 이중 디스크 쓰기

컨테이너가 임시파일로 한 번 쓰고, 서비스가 그걸 최종 저장소로 다시 쓴다. **같은 바이트를 디스크에 두 번** 쓰는 셈이다. 256MB 페이로드로 멀티파트 두 모드를 측정해 보면:

<figure style="margin:1.5em 0;overflow-x:auto">
<svg viewBox="0 0 670 196" role="img" aria-label="멀티파트 두 모드의 latency와 peak 힙 비교 막대 그래프" style="width:100%;min-width:560px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif">
  <text x="0" y="20" font-size="12" font-weight="600" fill="currentColor" opacity="0.65">Latency (ms)</text>
  <line x1="170" y1="28" x2="170" y2="84" stroke="currentColor" opacity="0.25"/>
  <text x="160" y="46" font-size="12" text-anchor="end" fill="currentColor" opacity="0.8">멀티파트 spool</text>
  <path d="M170 34 h416 q4 0 4 4 v8 q0 4 -4 4 h-416 z" fill="#2a78d6"><title>멀티파트 — 디스크 spool (기본): 728 ms</title></path>
  <text x="596" y="46" font-size="12" font-weight="600" fill="currentColor">728 ms</text>
  <text x="160" y="74" font-size="12" text-anchor="end" fill="currentColor" opacity="0.8">멀티파트 메모리</text>
  <path d="M170 62 h321 q4 0 4 4 v8 q0 4 -4 4 h-321 z" fill="#2a78d6"><title>멀티파트 — 메모리 보관: 563 ms</title></path>
  <text x="501" y="74" font-size="12" font-weight="600" fill="currentColor">563 ms</text>
  <text x="0" y="124" font-size="12" font-weight="600" fill="currentColor" opacity="0.65">Peak 힙 증가분 (MB)</text>
  <line x1="170" y1="132" x2="170" y2="188" stroke="currentColor" opacity="0.25"/>
  <text x="160" y="150" font-size="12" text-anchor="end" fill="currentColor" opacity="0.8">멀티파트 spool</text>
  <path d="M170 138 h18 q4 0 4 4 v8 q0 4 -4 4 h-18 z" fill="#2a78d6"><title>멀티파트 — 디스크 spool (기본): 54 MB</title></path>
  <text x="198" y="150" font-size="12" font-weight="600" fill="currentColor">54 MB</text>
  <text x="160" y="178" font-size="12" text-anchor="end" fill="currentColor" opacity="0.8">멀티파트 메모리</text>
  <path d="M170 166 h416 q4 0 4 4 v8 q0 4 -4 4 h-416 z" fill="#2a78d6"><title>멀티파트 — 메모리 보관: 1037 MB</title></path>
  <text x="596" y="178" font-size="12" font-weight="600" fill="currentColor">1037 MB</text>
</svg>
<figcaption style="font-size:0.85em;opacity:0.65;margin-top:0.25em">동일 256MB 페이로드 · 로컬 실서버 측정 · 낮을수록 좋다</figcaption>
</figure>

| 경로 | latency | 서버 peak 힙 |
|---|---|---|
| 멀티파트 — 디스크 spool (기본) | 728 ms | 54 MB |
| 멀티파트 — 메모리 보관 | 563 ms | **1037 MB** |

측정 조건: 동일 256MB 페이로드를 로컬 실서버에 업로드해 latency는 클라이언트 wall-clock, 힙은 백그라운드 샘플러의 peak 증가분으로 기록했다(`-Xmx2g`). 루프백 측정이라 절대치보다 **상대 비교**가 의미 있다. 측정 코드는 [UploadBenchmarkTest](https://github.com/Minsoo-Shin/file-upload-service/blob/main/java/server/src/test/java/com/example/upload/UploadBenchmarkTest.java)·[MultipartInMemoryBenchmarkTest](https://github.com/Minsoo-Shin/file-upload-service/blob/main/java/server/src/test/java/com/example/upload/MultipartInMemoryBenchmarkTest.java)·[BenchmarkSupport](https://github.com/Minsoo-Shin/file-upload-service/blob/main/java/server/src/test/java/com/example/upload/BenchmarkSupport.java), 상세 기록은 [devlog 04](https://github.com/Minsoo-Shin/file-upload-service/blob/main/docs/devlog/04-upload-benchmark.md) 참고.

디스크 spool의 728ms에는 임시파일↔최종 저장소 **이중 쓰기 비용이 그대로 실려 있다**. 이 비용이 얼마나 큰지는 2편에서 파싱 레이어 없는 경로와 나란히 비교한다.

### 2. 메모리 보관은 대용량에 금물

threshold를 올려 메모리에 보관하면 디스크 이중 쓰기는 사라지지만, 256MB 업로드에 힙이 **약 1GB(4배)** 튄다. 10GB 파일이면 그대로 OOM이다.

4배의 정체는 JFR 할당 프로파일(`-XX:StartFlightRecording=settings=profile`)에 그대로 찍힌다:

```
$ jfr view allocation-by-site mem.jfr

Method                                                                      Allocation Pressure
--------------------------------------------------------------------------- -------------------
org.apache.tomcat.util.http.fileupload.ByteArrayOutputStream.toByteArray()               54.59%
java.nio.HeapByteBuffer.duplicate()                                                      18.56%
java.nio.HeapByteBuffer.<init>(int, int, MemorySegment)                                  13.06%
```

최대 단일 할당 이벤트의 스택을 열어 보면:

```
jdk.ObjectAllocationSample {
  objectClass = byte[] (classLoader = bootstrap)
  weight = 769.9 MB
  eventThread = "http-nio-auto-1-exec-1" (javaThreadId = 46)
  stackTrace = [
    org.apache.tomcat.util.http.fileupload.ByteArrayOutputStream.toByteArray() line: 214
    org.apache.tomcat.util.http.fileupload.DeferredFileOutputStream.getData() line: 191
    org.apache.tomcat.util.http.fileupload.disk.DiskFileItem.getInputStream() line: 296
    org.apache.catalina.core.ApplicationPart.getInputStream() line: 97
    org.springframework.web.multipart.support.StandardMultipartHttpServletRequest
        $StandardMultipartFile.getInputStream() line: 261
    ...
  ]
}
```

서비스 코드가 `file.getInputStream()`을 호출하는 순간, 스트림이 "열리는" 게 아니라 `toByteArray()`가 **파일 전체를 복사한 배열을 하나 더** 만든다. 파서 버퍼에 상주하는 원본(1×)과 이 복사본(1×)이 동시에 살아 있고, 여기에 HTTP I/O 버퍼와 GC가 아직 회수하지 못한 잔해가 더해져 관측된 ~4×가 된다. 파일 전체 크기의 연속 배열을 동시에 여러 벌 요구하는 구조라, 파일이 커지면 힙을 아무리 늘려도 따라잡을 수 없다.

### 3. `max-file-size` 상한에 묶인다

멀티파트 경로는 요청이 파싱 레이어를 거치므로 크기 상한을 피할 수 없다. 상한을 10GB로 올리는 건 가능하지만, 그만큼의 임시파일 spool을 감수하겠다는 뜻이 된다.

### 4. 전부 아니면 무(all-or-nothing)

9GB까지 올리고 끊기면 처음부터 다시다. 재개(resume)라는 개념이 프로토콜에 없다.

## 정리와 다음 단계

핵심은 이거다: 문제의 원인은 HTTP 메서드나 Content-Type이 아니라 **멀티파트 파싱 레이어를 거친다는 것** 자체다. 파싱이 있는 한 spool(디스크 2회) 또는 메모리 적재 중 하나를 피할 수 없다.

그래서 다음 단계는 파싱 레이어 자체를 우회하는 것이다 — [2편 — 스트리밍 업로드: 파싱 레이어를 우회한다](/blog/file-upload-m2-streaming)에서 다룬다.
