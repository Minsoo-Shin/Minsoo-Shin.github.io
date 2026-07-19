---
type: topic
domain:
  - tech
  - storage
  - performance
updated: 2026-05-24T00:00:00.000Z
aliases:
  - Go Chunk Read
  - Go File ReadAt
  - Go Parallel Read
published: true
title: Go 청크 읽기 패턴 — fio 워크로드를 코드로 재현하기
description: >-
  업로드 클라이언트가 파일을 청크로 읽는 Go 구현 4종(순차/병렬 ReadAt/스트리밍 해시/mmap)을 fio 워크로드와 1:1 매핑하고,
  측정값과 코드 성능을 비교하는 방법.
pubDate: 2026-05-24T00:00:00.000Z
category: Backend
tags:
  - golang
  - io
  - performance
  - fio
  - chunked-upload
synced-from-vault: true
---

# Go 청크 읽기 패턴

업로드 클라이언트가 파일을 청크 단위로 읽는 Go 구현 패턴. fio로 측정한 디스크 워크로드를 실제 코드로 어떻게 재현하는지, 그리고 측정값과 코드 성능을 어떻게 비교하는지 정리. 측정 매뉴얼은 디스크-성능-측정-실습-매뉴얼, 출력 해석은 fio-결과-해석-가이드 참고.

## fio 측정과 코드 매핑

업로드 클라이언트 코드와 fio 워크로드의 1:1 매핑:

| fio 옵션 | Go 코드 대응 | 의미 |
|---|---|---|
| `--bs=16M` | `ChunkSize = 16 * 1024 * 1024` | 한 번 읽기 크기 |
| `--iodepth=4` 또는 `--numjobs=4` | goroutine 워커 4개 + `ReadAt` | 동시 in-flight 요청 수 (큐 깊이) |
| `--rw=read` | `os.File.ReadAt(buf, offset)` | 시퀀셜 읽기 |
| `--direct=1` | `os.OpenFile(path, O_RDONLY\|O_DIRECT)` | 페이지 캐시 우회 |
| `--time_based` | runtime 측정 + 반복 | 지속 측정 |

→ 같은 워크로드 명세를 코드로 재현하면 fio 결과와 ±10% 이내 일치해야 정상.

## 패턴 1: 순차 읽기 (QD=1)

가장 단순. 한 청크 끝나야 다음.

```go
package main

import (
    "io"
    "os"
)

const ChunkSize = 16 * 1024 * 1024 // 16MB

func uploadSequential(path string) error {
    f, err := os.Open(path)
    if err != nil { return err }
    defer f.Close()

    buf := make([]byte, ChunkSize)
    for {
        n, err := io.ReadFull(f, buf)
        if err == io.EOF { break }
        if err == io.ErrUnexpectedEOF {
            uploadChunk(buf[:n]) // 마지막 청크 (16MB 미만 가능)
            break
        }
        if err != nil { return err }
        uploadChunk(buf[:n])
    }
    return nil
}
```

`io.ReadFull`: 정확히 `len(buf)`만큼 읽음. 부분 read 없음. 짧으면 `ErrUnexpectedEOF`.

→ fio `--iodepth=1`과 동일 워크로드.

## 패턴 2: 병렬 청크 — 업로드 클라이언트 표준 ⭐

`ReadAt` + goroutine 워커 풀. 실제 업로드 클라이언트의 정석.

```go
package main

import (
    "io"
    "os"
    "sync"
)

const (
    ChunkSize   = 16 * 1024 * 1024
    Parallelism = 4
)

func uploadParallel(path string) error {
    f, err := os.Open(path)
    if err != nil { return err }
    defer f.Close()

    stat, _ := f.Stat()
    totalSize := stat.Size()
    numChunks := int((totalSize + ChunkSize - 1) / ChunkSize)

    jobs := make(chan int, numChunks)
    var wg sync.WaitGroup

    for w := 0; w < Parallelism; w++ {
        wg.Add(1)
        go func(workerID int) {
            defer wg.Done()
            buf := make([]byte, ChunkSize) // 워커별 버퍼

            for idx := range jobs {
                offset := int64(idx) * ChunkSize
                n, err := f.ReadAt(buf, offset) // concurrent-safe
                if err != nil && err != io.EOF { return }
                uploadChunk(buf[:n])
            }
        }(w)
    }

    for i := 0; i < numChunks; i++ { jobs <- i }
    close(jobs)
    wg.Wait()
    return nil
}
```

### 핵심: `ReadAt`이 왜 중요한가

| 메서드                   | 파일 포지션          | concurrent-safe |
| --------------------- | --------------- | --------------- |
| `Read(buf)`           | 공유 (Seek 영향 받음) | ❌               |
| `ReadAt(buf, offset)` | 명시적 offset      | ✅               |

`ReadAt`은 시스템 콜 레벨에서 `pread()` 호출 → 한 번에 (offset, len) 명시적 발행 → 커널이 NVMe 큐에 요청 추가. 여러 goroutine이 동시에 호출해도 안전하고 효율적.

### 메모리 사용량

```
총 RAM 사용 = Parallelism × ChunkSize
            = 4 × 16MB = 64MB
```

`Parallelism`을 무작정 올리면 메모리 폭증. 보통 4~16 사이.

## 패턴 3: 스트리밍 해시 동시 계산

읽으면서 SHA-256 계산. 메모리 1패스, CPU·디스크 파이프라이닝.

```go
import (
    "crypto/sha256"
    "encoding/hex"
    "io"
    "os"
)

func readChunkWithHash(f *os.File, offset int64, buf []byte) (data []byte, sum string, err error) {
    n, err := f.ReadAt(buf, offset)
    if err != nil && err != io.EOF {
        return nil, "", err
    }
    h := sha256.New()
    h.Write(buf[:n])
    return buf[:n], hex.EncodeToString(h.Sum(nil)), nil
}
```

업로드-시스템-디스크-성능-지표의 "청크별 무결성 해시" 요구사항을 메모리 효율적으로 구현.

## 패턴 4: mmap (큰 파일·랜덤 접근)

```go
import "golang.org/x/exp/mmap"

func uploadMmap(path string) error {
    r, err := mmap.Open(path)
    if err != nil { return err }
    defer r.Close()

    size := r.Len()
    for offset := 0; offset < size; offset += ChunkSize {
        end := offset + ChunkSize
        if end > size { end = size }
        buf := make([]byte, end-offset)
        if _, err := r.ReadAt(buf, int64(offset)); err != nil { return err }
        uploadChunk(buf)
    }
    return nil
}
```

⚠️ 주의:
- 큰 파일 전체 가상 메모리 매핑 → 페이지 폴트로 적재
- 페이지 캐시와 자연스럽게 통합
- macOS/Linux/Windows 동작 미세 차이
- **시퀀셜 업로드엔 `ReadAt`이 더 단순·예측 가능**. mmap은 랜덤 접근이나 100GB+ 거대 파일 처리에 유리.

## 패턴 선택 가이드

| 상황 | 권장 패턴 |
|---|---|
| 데모/PoC | 1 (순차) |
| 실제 업로드 클라이언트 | **2 (병렬 ReadAt)** ⭐ |
| 무결성 검증 필요 | 2 + 3 |
| 100GB+ 거대 파일 | 4 (mmap) |
| 백업 도구 (시퀀셜 + 압축) | 2 + 압축 파이프라인 |

## O_DIRECT (페이지 캐시 우회)

fio `--direct=1`과 동일한 효과를 Go에서 내려면:

```go
import "syscall"

const O_DIRECT = 0x4000 // Linux

f, err := os.OpenFile(path, os.O_RDONLY|O_DIRECT, 0)
```

⚠️ O_DIRECT 제약:
- 버퍼와 offset이 디바이스 블록(보통 4KB)에 정렬되어야 함
  - `make([]byte, n)`은 정렬 보장 없음 → `syscall.Mmap` 또는 정렬 할당 필요
- macOS 미지원
- 일반 업로드 클라이언트는 O_DIRECT 안 씀 — 페이지 캐시 활용이 보통 이득

→ 측정 일치도 검증용으로만 가끔. 운영 코드엔 부적합.

## 측정용 미니 벤치마크

fio 결과와 직접 비교 가능한 Go 벤치 코드. 컨테이너/우분투에 그대로 복붙해서 빌드.

```go
// chunkread.go
package main

import (
    "flag"
    "fmt"
    "io"
    "os"
    "sync"
    "sync/atomic"
    "time"
)

func main() {
    var (
        path        = flag.String("file", "testfile", "input file path")
        chunkSize   = flag.Int64("bs", 16*1024*1024, "chunk size in bytes")
        parallelism = flag.Int("p", 4, "parallel workers (QD equivalent)")
        runtime     = flag.Int("runtime", 30, "runtime seconds (loop if file exhausted)")
    )
    flag.Parse()

    f, err := os.Open(*path)
    if err != nil { panic(err) }
    defer f.Close()

    stat, _ := f.Stat()
    fileSize := stat.Size()
    if fileSize < *chunkSize {
        panic("file smaller than chunk size")
    }
    numChunks := fileSize / *chunkSize

    var totalRead int64
    var ops int64
    deadline := time.Now().Add(time.Duration(*runtime) * time.Second)

    jobs := make(chan int64, 1024)
    var wg sync.WaitGroup

    // 워커
    for w := 0; w < *parallelism; w++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            buf := make([]byte, *chunkSize)
            for offset := range jobs {
                n, err := f.ReadAt(buf, offset)
                if err != nil && err != io.EOF { return }
                atomic.AddInt64(&totalRead, int64(n))
                atomic.AddInt64(&ops, 1)
            }
        }()
    }

    // 작업 발행기 — runtime 동안 파일 반복 순회
    start := time.Now()
    go func() {
        defer close(jobs)
        idx := int64(0)
        for time.Now().Before(deadline) {
            jobs <- (idx % numChunks) * *chunkSize
            idx++
        }
    }()

    wg.Wait()
    elapsed := time.Since(start)

    bwMiBs := float64(totalRead) / elapsed.Seconds() / (1024 * 1024)
    bwMBs := float64(totalRead) / elapsed.Seconds() / 1_000_000
    iops := float64(ops) / elapsed.Seconds()

    fmt.Printf("===== Go ReadAt Benchmark =====\n")
    fmt.Printf("File:        %s (%d bytes)\n", *path, fileSize)
    fmt.Printf("Chunk size:  %d bytes (%.1f MB)\n", *chunkSize, float64(*chunkSize)/(1024*1024))
    fmt.Printf("Parallelism: %d workers\n", *parallelism)
    fmt.Printf("Runtime:     %v\n", elapsed)
    fmt.Printf("Total read:  %.2f GiB\n", float64(totalRead)/(1024*1024*1024))
    fmt.Printf("Ops:         %d (%.1f IOPS)\n", ops, iops)
    fmt.Printf("BW:          %.1f MiB/s (%.1f MB/s)\n", bwMiBs, bwMBs)
}
```

### 실행

```bash
# Go 설치 (우분투)
sudo apt install -y golang-go

# 빌드
go build -o chunkread chunkread.go

# 캐시 비우기 (콜드 측정 — fio --direct=1 비교용)
sudo sh -c "sync && echo 3 > /proc/sys/vm/drop_caches"

# 실행
./chunkread -file=/path/to/testfile -bs=16777216 -p=4 -runtime=30
```

### fio 결과와 비교

같은 testfile에 대해 동일 옵션으로 측정:

```
fio:
  fio --rw=read --bs=16M --iodepth=4 --numjobs=1 \
      --direct=1 --ioengine=libaio --runtime=30 --time_based ...
  → BW=1873 MiB/s

Go:
  ./chunkread -bs=16777216 -p=4 -runtime=30
  → BW=??? MiB/s
```

**기대치**: Go가 fio 대비 70~95% 수준이면 정상.

- fio는 `libaio` + 정밀한 큐 관리 + O_DIRECT
- Go는 page cache 통과 + goroutine 오버헤드
- 큰 차이(50% 이하)면 코드 또는 환경 문제

## 결과 차이가 클 때 점검

| 증상 | 원인 가능성 | 해결 |
|---|---|---|
| Go가 fio보다 훨씬 빠름 (2배+) | 페이지 캐시 hit | `sudo purge` 또는 캐시 drop |
| Go가 fio보다 훨씬 느림 (50%-) | 워커 수 부족 | `-p` 늘려보기 |
| BW가 fio와 비슷 | ✅ 정상 매핑 | — |
| IOPS 차이 큼 | 청크 크기 mismatch | `-bs` 단위 (bytes) 확인 |

## 학습 노트 양식

벤치 후 기록할 때:

```markdown
### Go ReadAt vs fio 비교

| 조건 | fio BW | Go BW | 비율 |
|---|---|---|---|
| bs=16M, QD=4, 1job | 1873 MiB/s | ___ | ___% |
| bs=16M, QD=4, 4job | ___ | ___ | ___% |
| bs=4M, QD=8 | ___ | ___ | ___% |

해석:
- Go 대비 fio가 ___% 빠름 → libaio + O_DIRECT 효과
- 또는 비슷하다면 → 코드 워크로드가 정확히 매핑됨
```

## 측정 기록 — 2026-05-24

Docker on Mac (Apple Silicon, arm64), Ubuntu 24.04 컨테이너, 6GB testfile(VM RAM 4GB 초과로 콜드 근사). 디스크-성능-측정-실습-매뉴얼 1단계 동일 워크로드로 fio 베이스라인을 잡고 같은 파일에 chunkread.go 실행.

| 조건                 | fio BW                 | Go BW                  | 비율    |
| ------------------ | ---------------------- | ---------------------- | ----- |
| bs=16M, QD=4, 1job | 2029 MiB/s (2127 MB/s) | 1854 MiB/s (1945 MB/s) | 91.4% |
| IOPS               | 126                    | 116                    | 92%   |

명령:
- fio: `fio --name=cold-seq-read --filename=/data/testfile --size=6G --rw=read --bs=16M --iodepth=4 --numjobs=1 --direct=1 --ioengine=libaio --runtime=60 --time_based`
- Go: `./chunkread -file=/data/testfile -bs=16777216 -p=4 -runtime=30`

fio 분포: clat avg 31.4ms, p50=30.8ms, p95=40.6ms, p99=44.8ms, p99.9=67.6ms. 디스크 util 98.4%로 디바이스 포화 근접.

해석:
- Go가 fio의 91% 도달 — 기대치 70~95% 상단에 안착. ReadAt + goroutine 워커 풀이 libaio+O_DIRECT를 거의 따라잡음을 실측.
- 차이 ~9%는 페이지 캐시 통과(Go는 O_DIRECT 미사용) + goroutine 스케줄링 오버헤드로 설명됨. IOPS 비율도 BW 비율과 일치 → 청크 크기 매핑이 정확.
- 컨테이너 환경 제약: 비특권 컨테이너에서 `/proc/sys/vm/drop_caches`가 read-only로 차단됨. 파일 크기를 VM RAM(4GB)보다 크게 잡아 콜드 캐시를 근사.
- chunkread.go 정밀도 함정: dispatcher 채널 버퍼가 1024라 deadline(30s) 이후 워커가 버퍼를 비우느라 실제 종료 40s. 평균 BW에는 영향 없으나 정밀 비교에는 버퍼를 작게(예: parallelism*2) 줄이는 게 안전.

## 관련 개념
- 디스크-성능-측정-실습-매뉴얼 — fio 측정 절차 (이 코드의 비교 대상)
- fio-결과-해석-가이드 — Go 결과를 fio와 비교할 때 같은 지표로 읽기
- 큐 깊이 — Parallelism 변수가 곧 QD, 멀티 워커가 NVMe 큐 채움
- 업로드-시스템-디스크-성능-지표 — 이 코드 패턴이 업로드 시스템에서 갖는 의미
- Go — Goroutine 동시성 모델이 자연스럽게 디스크 큐와 매핑
